/**
 * PromptLab — Prompt Generator Service (v4 — PRD v2.0 Pipeline)
 *
 * Architecture (per PRD v2.0):
 *   Layer 0: REQUEST CACHE CHECK   — return instantly if identical request seen before
 *   Layer 1: AMBIGUITY DETECTION   — lightweight rule-based scoring
 *   Layer 2: INTENT ANALYZER (LLM) — resolve ambiguity, produce structured intent contract
 *   Layer 3: INTENT CACHE CHECK    — skip analyzer if same intent contract seen before
 *   Layer 4: PROMPT GENERATOR (LLM)— convert intent contract into model-optimized prompt
 *   Layer 5: PROMPT REFINER (LLM)  — optional syntax tightening pass
 *   Layer 6: CACHE STORAGE         — persist results for reuse
 *
 * Cost optimization:
 *   - Request cache eliminates redundant work on repeated inputs
 *   - Intent cache skips analyzer calls for similar requests
 *   - Ambiguity detection bypasses analyzer when input is clear
 *   - Compact LLM prompts (~200 tokens system + ~300 tokens user)
 */

const { MODEL_PROFILES } = require('../config/scoring');

// ════════════════════════════════════════════════════════════════
//  CONFIGURATION
// ════════════════════════════════════════════════════════════════

const IMPROVEMENT_THRESHOLD = 3.5;
const LLM_BASELINE_TOKENS = 750;
const AMBIGUITY_THRESHOLD = 0.4;

// ════════════════════════════════════════════════════════════════
//  OPENROUTER CLIENT (lazy-initialized)
// ════════════════════════════════════════════════════════════════

let _openrouterClient = null;

function _getClient() {
    if (_openrouterClient) return _openrouterClient;

    // Guard: browser bundle — no API key available client-side
    if (
        typeof process === 'undefined' ||
        !process.env ||
        (!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY)
    ) {
        return null;
    }

    const OpenAI = require('openai');
    _openrouterClient = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
        defaultHeaders: {
            'HTTP-Referer': 'https://promptlab.ai',
            'X-OpenRouter-Title': 'PromptLab Generator v4',
        },
    });

    return _openrouterClient;
}

function _getModel() {
    if (typeof process !== 'undefined' && process.env && process.env.OPENROUTER_MODEL) {
        return process.env.OPENROUTER_MODEL;
    }
    return 'openai/gpt-4o-mini';
}

// ════════════════════════════════════════════════════════════════
//  REQUEST CACHE (Layer 0)
// ════════════════════════════════════════════════════════════════

const _requestCache = new Map();   // cacheKey → { result, timestamp }
const _cacheStats = { hits: 0, misses: 0 };
const CACHE_MAX = 500;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * djb2-style hash — fast, no crypto dependency.
 */
function _hashKey(...parts) {
    const str = parts.map(p => String(p || '').toLowerCase().trim()).join('|');
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return (h >>> 0).toString(36);
}

function _requestCacheGet(key) {
    if (!_requestCache.has(key)) return null;
    const entry = _requestCache.get(key);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        _requestCache.delete(key);
        return null;
    }
    return entry.result;
}

function _requestCacheSet(key, result) {
    if (_requestCache.size >= CACHE_MAX) {
        _requestCache.delete(_requestCache.keys().next().value);
    }
    _requestCache.set(key, { result, timestamp: Date.now() });
}

// ════════════════════════════════════════════════════════════════
//  INTENT CACHE (Layer 3)
// ════════════════════════════════════════════════════════════════

const _intentCache = new Map();   // intentHash → { generatedPrompt, timestamp }
const INTENT_CACHE_MAX = 300;
const INTENT_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function _intentCacheGet(key) {
    if (!_intentCache.has(key)) return null;
    const entry = _intentCache.get(key);
    if (Date.now() - entry.timestamp > INTENT_CACHE_TTL_MS) {
        _intentCache.delete(key);
        return null;
    }
    return entry.result;
}

function _intentCacheSet(key, result) {
    if (_intentCache.size >= INTENT_CACHE_MAX) {
        _intentCache.delete(_intentCache.keys().next().value);
    }
    _intentCache.set(key, { result, timestamp: Date.now() });
}

// ════════════════════════════════════════════════════════════════
//  TOKEN ESTIMATION
// ════════════════════════════════════════════════════════════════

function _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.35);
}

// ════════════════════════════════════════════════════════════════
//  LAYER 1: AMBIGUITY DETECTION ENGINE
// ════════════════════════════════════════════════════════════════

/**
 * Lightweight rule-based ambiguity scorer.
 * Returns a score between 0.0 (clear) and 1.0+ (very ambiguous).
 *
 * Per PRD Section 8:
 *   multiple task verbs → +0.3
 *   vague language      → +0.2
 *   missing target model → +0.4
 *   conflicting constraints → +0.5
 */
function _detectAmbiguity(text, targetModel) {
    let score = 0;
    const lower = text.toLowerCase();
    const details = [];

    // Multiple task verbs
    const taskVerbs = [
        /\b(explain|describe|summarize|list|compare|analyze|write|create|generate)\b/gi,
        /\b(evaluate|critique|review|build|design|teach|define|outline|plan)\b/gi,
        /\b(implement|debug|optimize|recommend|suggest|brainstorm|draft|compose)\b/gi,
    ];
    let verbCount = 0;
    for (const pattern of taskVerbs) {
        const matches = lower.match(pattern);
        if (matches) verbCount += matches.length;
    }
    if (verbCount > 2) {
        score += 0.3;
        details.push('multiple_task_verbs');
    }

    // Vague language
    const vaguePatterns = /\b(stuff|things|something|anything|whatever|maybe|kind of|sort of|some things|various|etc|and more|and so on)\b/i;
    if (vaguePatterns.test(lower)) {
        score += 0.2;
        details.push('vague_language');
    }

    // Missing target model (if not explicitly provided)
    if (!targetModel || targetModel === 'auto') {
        score += 0.4;
        details.push('missing_target_model');
    }

    // Conflicting constraints
    const conflictPairs = [
        [/\b(brief|short|concise)\b/i, /\b(detailed|comprehensive|in-depth|exhaustive)\b/i],
        [/\b(simple|basic)\b/i, /\b(advanced|complex|expert)\b/i],
        [/\b(formal)\b/i, /\b(casual|informal)\b/i],
    ];
    for (const [a, b] of conflictPairs) {
        if (a.test(lower) && b.test(lower)) {
            score += 0.5;
            details.push('conflicting_constraints');
            break;
        }
    }

    return { score, details, needsAnalysis: score > AMBIGUITY_THRESHOLD };
}

// ════════════════════════════════════════════════════════════════
//  LAYER 2: INTENT ANALYZER (LLM)
// ════════════════════════════════════════════════════════════════

/**
 * Model-specific system prompts for intent analysis.
 */
const ANALYZER_SYSTEM_PROMPT = `You are a prompt engineering intent analyzer. Given a user's raw request, resolve all ambiguity and produce a structured intent contract as JSON.

You MUST respond with ONLY valid JSON, no extra text. Use this exact schema:
{
  "task_type": "string — one of: explain, compare, generate, summarize, analyze, list, instruct, code, brainstorm, optimize, plan, story, content, evaluate, image_generation",
  "target_model": "string — the AI model this prompt will be used with",
  "goal": "string — clear statement of what the user wants to achieve",
  "must_include": ["array of elements that must appear in the final prompt"],
  "must_exclude": ["array of elements to avoid"],
  "assumptions": ["array of reasonable assumptions made to fill gaps"],
  "domain": "string — the subject domain (e.g. Software Development, Content Writing, Research)",
  "audience": "string — target audience level (beginner, general, expert, developer)",
  "output_format": "string — desired output structure (narrative, structured bullets, code block, table, step-by-step)",
  "tone": "string — desired tone (professional, casual, academic, creative)"
}`;

/**
 * Resolve ambiguous user input into a structured intent contract via LLM.
 */
async function _analyzeIntent(userInput, targetModel) {
    const client = _getClient();

    // Fallback: if no API client available (browser), use rule-based extraction
    if (!client) {
        return _extractIntentLocally(userInput, targetModel);
    }

    const userMsg = `User request: "${userInput}"
Target model: ${targetModel}

Analyze this request and produce the intent contract JSON.`;

    try {
        const completion = await client.chat.completions.create({
            model: _getModel(),
            messages: [
                { role: 'system', content: ANALYZER_SYSTEM_PROMPT },
                { role: 'user', content: userMsg },
            ],
            max_tokens: 500,
            temperature: 0.2,
            response_format: { type: 'json_object' },
        });

        const raw = completion.choices[0]?.message?.content?.trim();
        if (!raw) return _extractIntentLocally(userInput, targetModel);

        try {
            const parsed = JSON.parse(raw);
            // Ensure target_model is set
            parsed.target_model = parsed.target_model || targetModel;
            return { contract: parsed, method: 'llm', tokensUsed: _estimateTokens(ANALYZER_SYSTEM_PROMPT) + _estimateTokens(userMsg) + _estimateTokens(raw) };
        } catch {
            return _extractIntentLocally(userInput, targetModel);
        }
    } catch (error) {
        console.error('[PromptLab Generator] Intent analysis error:', error.message);
        return _extractIntentLocally(userInput, targetModel);
    }
}

/**
 * Fallback: rule-based intent extraction (browser compatible, zero LLM cost).
 */
function _extractIntentLocally(text, targetModel) {
    const lower = text.toLowerCase();

    // Task type detection
    const TASK_PATTERNS = [
        { task: 'plan', patterns: [/\b(plan|schedule|roadmap|timeline|milestone|daily routine|weekly plan|organize my|time management)\b/i] },
        { task: 'story', patterns: [/\b(story|narrative|fiction|tale|novel|short story|creative writing|plot|character)\b/i] },
        { task: 'content', patterns: [/\b(blog|article|seo|social media|copywriting|headline)\b/i] },
        { task: 'image_generation', patterns: [/\b(image|photo|picture|midjourney|dall-?e|stable diffusion|visual|cinematic|photorealistic)\b/i] },
        { task: 'code', patterns: [/\b(code|function|class|component|script|implement|algorithm|debug|api|python|javascript|typescript|react|html|css|sql|backend|frontend|build a|build the|write a script|refactor|cli)\b/i] },
        { task: 'evaluate', patterns: [/\b(evaluate|assess|grade|score|rate|critique|review and improve|feedback on)\b/i] },
        { task: 'explain', patterns: [/\b(explain|describe|what is|define|clarify|elaborate|break down|tell me about|teach me)\b/i] },
        { task: 'compare', patterns: [/\b(compare|contrast|difference|versus|vs\.?|similarities|pros and cons|better)\b/i] },
        { task: 'summarize', patterns: [/\b(summarize|summary|overview|recap|condense|tldr|brief)\b/i] },
        { task: 'analyze', patterns: [/\b(analyze|analyse|review|examine)\b/i] },
        { task: 'list', patterns: [/\b(list|enumerate|name|give me|what are|identify all|top \d+)\b/i] },
        { task: 'instruct', patterns: [/\b(how to|steps to|guide|tutorial|instructions|walk me through|teach me how)\b/i] },
        { task: 'brainstorm', patterns: [/\b(brainstorm|suggest|recommend|ideas?|options?|alternatives?|creative)\b/i] },
        { task: 'optimize', patterns: [/\b(optimize|improve|enhance|refine|upgrade|boost|maximize|streamline)\b/i] },
        { task: 'generate', patterns: [/\b(write|create|generate|compose|draft|produce|come up with|make me|marketing|email|content)\b/i] },
    ];

    let taskType = 'generate';
    for (const { task, patterns } of TASK_PATTERNS) {
        if (patterns.some(p => p.test(lower))) {
            taskType = task;
            break;
        }
    }

    // Domain detection
    const DOMAIN_PATTERNS = [
        { domain: 'Planning & Productivity', patterns: [/\b(plan|schedule|routine|productivity|time management|goal|habit|workflow|organize)\b/i] },
        { domain: 'Storytelling & Fiction', patterns: [/\b(story|fiction|narrative|novel|plot|character|creative writing|screenplay)\b/i] },
        { domain: 'Content Writing', patterns: [/\b(blog|article|seo|content|copywriting|headline|social media|marketing)\b/i] },
        { domain: 'Image Generation', patterns: [/\b(image|photo|midjourney|dall-?e|stable diffusion|visual|cinematic)\b/i] },
        { domain: 'Learning & Education', patterns: [/\b(learn|study|education|course|lesson|explain|teach|student|university|school)\b/i] },
        { domain: 'Research & Analysis', patterns: [/\b(research|analysis|data|study|paper|literature|findings|methodology)\b/i] },
        { domain: 'Software Development', patterns: [/\b(code|programming|software|api|database|frontend|backend|deploy|architecture)\b/i] },
        { domain: 'Business & Strategy', patterns: [/\b(business|strategy|market|competitor|revenue|startup|pitch|investor)\b/i] },
        { domain: 'Health & Fitness', patterns: [/\b(health|fitness|diet|exercise|workout|nutrition|gym|wellness|mental health)\b/i] },
        { domain: 'Design & Creative', patterns: [/\b(design|ui|ux|graphic|visual|brand|logo|color|aesthetic|layout)\b/i] },
        { domain: 'Communication', patterns: [/\b(email|message|letter|speech|presentation|pitch|negotiate)\b/i] },
    ];

    let domain = 'General';
    for (const { domain: d, patterns } of DOMAIN_PATTERNS) {
        if (patterns.some(p => p.test(lower))) {
            domain = d;
            break;
        }
    }

    // Subject extraction — use full text, only strip leading verb + article
    const verbStrip = text.match(/^(?:explain|describe|summarize|compare|analyze|write|create|list|review|evaluate|implement|build|define|discuss|teach|outline|critique|plan|schedule|generate|optimize|improve|make|draft|produce|compose|develop)\s+(?:a\s+|an\s+|the\s+|me\s+a\s+|me\s+an\s+)?/i);
    const subject = verbStrip ? text.slice(verbStrip[0].length).replace(/\.$/, '').trim() : text.replace(/\.$/, '').trim();

    // Audience
    let audience = 'general';
    if (/\b(beginner|simple|basic|eli5)\b/.test(lower)) audience = 'beginner';
    else if (/\b(expert|advanced|PhD|professional|senior)\b/.test(lower)) audience = 'expert';
    else if (/\b(developer|programmer|engineer)\b/.test(lower)) audience = 'developer';

    // Output format — only set when explicitly requested by the user
    let outputFormat = null;
    if (/\b(step.by.step|steps|how to|guide|tutorial)\b/i.test(lower)) outputFormat = 'step-by-step';
    else if (/\b(table|comparison table|grid|matrix)\b/i.test(lower)) outputFormat = 'table';
    else if (/\b(story|essay|narrative|paragraph)\b/i.test(lower)) outputFormat = 'narrative';
    else if (taskType === 'code' || /\b(code|function|class|component|script|implement|refactor|algorithm|cli)\b/i.test(lower)) outputFormat = 'code block';
    else if (/\b(bullet|points|key points|list)\b/i.test(lower)) outputFormat = 'structured bullets';

    // Tone
    let tone = 'professional';
    if (/\b(casual|informal|friendly|fun)\b/.test(lower)) tone = 'casual';
    else if (/\b(academic|scholarly|formal|scientific)\b/.test(lower)) tone = 'academic';
    else if (/\b(creative|imaginative|playful)\b/.test(lower)) tone = 'creative';

    const contract = {
        task_type: taskType,
        target_model: targetModel,
        original_request: text,
        goal: subject,
        must_include: [],
        must_exclude: [],
        assumptions: [outputFormat ? `The user wants a ${outputFormat} response about ${subject}` : `The user wants a response about ${subject}`],
        domain,
        audience,
        output_format: outputFormat,
        tone,
        subject,
    };

    return { contract, method: 'local', tokensUsed: 0 };
}

// ════════════════════════════════════════════════════════════════
//  LAYER 4: PROMPT GENERATOR (LLM)
// ════════════════════════════════════════════════════════════════

/**
 * Model-specific generation system prompts.
 */
const MODEL_GENERATOR_PROMPTS = {
    openai: `You are an expert prompt engineer specializing in OpenAI GPT models.

Generate a paste-ready, optimized prompt for OpenAI GPT based on the intent contract provided.

Rules:
- Start with a clear system-role definition ("You are a...")
- Include explicit step-by-step reasoning instructions
- Add structured output format specifications
- Use markdown formatting cues where appropriate
- Include specific constraints (length, tone, scope)
- Add chain-of-thought triggers for complex tasks
- Return ONLY the prompt text — no explanation, no preamble, no surrounding quotes.`,

    anthropic: `You are an expert prompt engineer specializing in Anthropic Claude.

Generate a paste-ready, optimized prompt for Claude based on the intent contract provided.

Rules:
- Use XML tags to delimit sections (<instructions>, <context>, <constraints>, <output>)
- State expertise needs directly instead of role-play framing
- Add explicit scope limits and exclusion boundaries
- Include thinking/reasoning triggers for complex tasks
- Request balanced, factual output to leverage Claude's safety alignment
- Return ONLY the prompt text — no explanation, no preamble, no surrounding quotes.`,

    gemini: `You are an expert prompt engineer specializing in Google Gemini.

Generate a paste-ready, optimized prompt for Gemini based on the intent contract provided.

Rules:
- Lead with context/background before the task instruction
- Use concise, direct imperative sentences
- Request structured output (tables, lists, JSON) explicitly
- Add grounding cues ("based on current research", "using evidence")
- Avoid system-role overhead — state expertise needs directly
- Return ONLY the prompt text — no explanation, no preamble, no surrounding quotes.`,
};

/**
 * Convert an intent contract into a model-optimized prompt via LLM.
 */
async function _generatePromptFromIntent(intentContract, targetModel) {
    const client = _getClient();

    if (!client) {
        throw new Error('OpenRouter API client is not configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY.');
    }

    const systemPrompt = MODEL_GENERATOR_PROMPTS[targetModel] || MODEL_GENERATOR_PROMPTS.openai;

    const userMsg = `Intent Contract:
${JSON.stringify(intentContract, null, 2)}

Generate the optimized prompt now.`;

    const completion = await client.chat.completions.create({
        model: _getModel(),
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMsg },
        ],
        max_tokens: 800,
        temperature: 0.4,
    });

    const generated = completion.choices[0]?.message?.content?.trim();
    if (!generated) {
        throw new Error('OpenRouter returned an empty response for prompt generation.');
    }

    const tokensUsed = _estimateTokens(systemPrompt) + _estimateTokens(userMsg) + _estimateTokens(generated);
    return { prompt: generated, method: 'llm', tokensUsed };
}

/**
 * Fallback: template-based prompt generation (browser compatible, zero LLM cost).
 */
function _generatePromptLocally(contract, targetModel) {
    const parts = [];

    // Role
    const roleMap = {
        openai: {
            code: 'You are a senior software engineer known for writing clean, well-documented, production-ready code.',
            explain: `You are an expert educator and ${contract.domain || 'subject'} specialist who excels at making complex topics accessible.`,
            content: 'You are a senior SEO content strategist and copywriter with 10+ years of audience-targeted content creation.',
            plan: 'You are a productivity and planning expert specializing in structured goal-setting and workflow optimization.',
            story: 'You are a bestselling novelist with deep expertise in narrative structure, character development, and emotional pacing.',
            analyze: `You are a senior analyst with deep expertise in ${contract.domain || 'this domain'}, skilled at multi-dimensional analysis.`,
            image_generation: 'You are an expert visual prompt engineer specializing in AI image generation systems.',
            _default: `You are a highly capable expert assistant specialized in ${contract.domain || 'this domain'}.`,
        },
        anthropic: {
            code: 'You are an experienced developer who writes robust, well-tested code with clear documentation.',
            explain: `You are a knowledgeable instructor who explains topics with clarity, precision, and well-chosen examples.`,
            content: 'You are a content strategy expert who creates compelling, well-researched content.',
            plan: 'You are a methodical planning strategist with expertise in breaking complex goals into actionable milestones.',
            story: 'You are an experienced creative writing mentor who crafts compelling narratives with rich character arcs.',
            analyze: `You are a thorough analyst who examines topics from multiple perspectives with balanced findings.`,
            image_generation: 'You are an expert visual prompt engineer with deep understanding of AI art generation.',
            _default: `You are a knowledgeable assistant with expertise in ${contract.domain || 'this domain'}.`,
        },
        gemini: {
            code: 'You are a software engineering expert who produces clean, efficient, and well-commented code.',
            explain: `You are a subject matter expert who provides clear, structured explanations grounded in current knowledge.`,
            content: 'You are a content marketing specialist who produces data-driven, audience-aware content.',
            plan: 'You are a planning specialist who creates evidence-based, structured action plans.',
            story: 'You are a narrative design expert who creates engaging stories with clear structure.',
            analyze: `You are an analytical expert who provides structured, evidence-based analysis with actionable insights.`,
            image_generation: 'You are an expert in crafting AI image generation prompts with specific visual parameters.',
            _default: `You are an expert assistant who provides well-structured, evidence-based responses.`,
        },
    };

    const roles = roleMap[targetModel] || roleMap.openai;
    const role = roles[contract.task_type] || roles._default;

    parts.push('ROLE:');
    parts.push(role);
    parts.push('');

    // Objective — always use the full original request so context is never lost
    parts.push('OBJECTIVE:');
    const objectiveText = contract.original_request || contract.goal || 'Produce a high-quality response';
    parts.push(objectiveText + (objectiveText.endsWith('.') ? '' : '.'));
    parts.push('');

    // Context
    parts.push('CONTEXT:');
    const contextParts = [];
    if (contract.domain && contract.domain !== 'General') contextParts.push(`Domain: ${contract.domain}.`);
    if (contract.audience) contextParts.push(`Target audience: ${contract.audience}.`);
    if (contract.assumptions && contract.assumptions.length > 0) {
        contextParts.push(`Assumptions: ${contract.assumptions.join('; ')}.`);
    }
    parts.push(contextParts.length > 0 ? contextParts.join(' ') : `The task involves ${contract.goal || 'the requested topic'}.`);
    parts.push('');

    // Constraints
    parts.push('CONSTRAINTS:');
    if (contract.must_include && contract.must_include.length > 0) {
        parts.push(`- Must include: ${contract.must_include.join(', ')}`);
    }
    if (contract.must_exclude && contract.must_exclude.length > 0) {
        parts.push(`- Must exclude: ${contract.must_exclude.join(', ')}`);
    }
    if (contract.tone) parts.push(`- Tone: ${contract.tone}`);

    // Model-specific constraints
    if (targetModel === 'openai') {
        parts.push('- Strictly follow all explicitly stated constraints and formatting rules.');
    } else if (targetModel === 'anthropic') {
        parts.push('- Ensure accuracy, balance, and factual correctness.');
        parts.push('- Maintain high-level structural integrity.');
    } else if (targetModel === 'gemini') {
        parts.push('- Ground your response in current best practices and evidence.');
    }
    parts.push('');

    // Process
    parts.push('PROCESS:');
    if (targetModel === 'anthropic') {
        parts.push('1. Think carefully about the objective and available context.');
        parts.push('2. Outline the reasoning steps required to fulfill the goal.');
        parts.push('3. Provide the final response with a clean, high-level structure.');
    } else if (targetModel === 'openai') {
        parts.push('1. Review constraints and ensure full compliance.');
        parts.push('2. Process the request methodically and step-by-step.');
        parts.push('3. Generate output that strictly adheres to the requested schema.');
    } else if (targetModel === 'gemini') {
        parts.push('1. Analyze the practical execution steps needed.');
        parts.push('2. Ground the response in best practices.');
        parts.push('3. Output the final execution-focused result directly.');
    } else {
        parts.push('Think step by step before providing your answer.');
    }
    parts.push('');

    // Output format
    if (contract.output_format) {
        parts.push('OUTPUT FORMAT:');
        parts.push(`Respond as ${contract.output_format}.`);
        parts.push('');
    }

    return { prompt: parts.join('\n').trim(), method: 'template', tokensUsed: 0 };
}

// ════════════════════════════════════════════════════════════════
//  LAYER 5: PROMPT REFINER (optional)
// ════════════════════════════════════════════════════════════════

/**
 * Determine if refinement is warranted.
 */
function _shouldRefine(difficulty, v1Score) {
    if (difficulty === 'advanced') return true;
    if (v1Score !== null && v1Score < IMPROVEMENT_THRESHOLD - 0.5) return true;
    return false;
}

/**
 * Refine a generated prompt — only tighten constraints, don't change intent.
 * Per PRD Section 11: allowed actions = enforce syntax, remove ambiguity, tighten wording.
 * Forbidden: change intent, add features, reinterpret goals.
 */
async function _refinePrompt(promptText, targetModel, difficulty) {
    const client = _getClient();
    if (!client) {
        return { refined: promptText, used: false, tokensUsed: 0 };
    }

    const systemMsg = `You are a prompt engineer performing a refinement pass. You may ONLY:
- Enforce syntax rules for the target model
- Remove ambiguous wording
- Tighten constraints and wording

You MUST NOT:
- Change the core intent
- Add new features or requirements
- Reinterpret the user's goals

Return only the refined prompt text — no explanation, no preamble.`;

    const userMsg = `Target model: ${targetModel}
Difficulty: ${difficulty}

---
${promptText}`;

    try {
        const completion = await client.chat.completions.create({
            model: _getModel(),
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: userMsg },
            ],
            max_tokens: 800,
            temperature: 0.2,
        });

        const refined = completion.choices[0]?.message?.content?.trim() || promptText;
        const tokensUsed = _estimateTokens(systemMsg) + _estimateTokens(userMsg) + _estimateTokens(refined);
        return { refined, used: true, tokensUsed };

    } catch (error) {
        console.error('[PromptLab Generator] Refinement error:', error.message);
        return { refined: promptText, used: false, tokensUsed: 0 };
    }
}

// ════════════════════════════════════════════════════════════════
//  ANALYZER LOOP (sync, no LLM — for scoring)
// ════════════════════════════════════════════════════════════════

function _improvePrompt(v1Prompt, intentContract, analysis, modelTarget) {
    const changes = [];
    let improved = v1Prompt;
    const dims = analysis.dimension_scores || {};

    // Clarity improvements
    if (dims.clarity < 4) {
        const vagueReplacements = {
            'stuff': 'specific details', 'things': 'key elements',
            'something': 'a concrete example', 'anything': 'any relevant information',
            'whatever': 'the most effective approach',
        };
        for (const [vague, replacement] of Object.entries(vagueReplacements)) {
            const regex = new RegExp(`\\b${vague}\\b`, 'gi');
            if (regex.test(improved)) {
                improved = improved.replace(regex, replacement);
                changes.push(`Replaced vague term "${vague}" with "${replacement}" for clarity`);
            }
        }
    }

    const appendToSection = (sectionName, textToAdd) => {
        const regex = new RegExp(`(${sectionName}:\\n)`);
        if (regex.test(improved)) {
            improved = improved.replace(regex, `$1- ${textToAdd}\n`);
        } else {
            improved += `\n\n${sectionName}:\n- ${textToAdd}`;
        }
    };

    // Constraint additions
    if (dims.constraint_completeness < 4) {
        if (!/\b(\d+\s*words?|\d+\s*sentences?|\d+\s*paragraphs?|brief|concise|keep it short|max\s+\d+|limit\s+to)\b/i.test(improved)) {
            appendToSection('CONSTRAINTS', 'Keep the response focused and within reasonable scope.');
            changes.push('Added explicit scope constraint');
        }
        if (!/\b(tone|style|formal|informal|casual|professional)\b/i.test(improved)) {
            appendToSection('CONSTRAINTS', 'Maintain a professional and informative tone.');
            changes.push('Added explicit tone constraint');
        }
    }

    // Output format enforcement
    if (dims.output_controllability < 4) {
        if (!/\b(format|structure|organize|present|respond as)\b/i.test(improved)) {
            appendToSection('CONSTRAINTS', `Format strictly as requested: ${intentContract.output_format || 'structured output'}.`);
            changes.push('Reinforced output format specification');
        }
    }

    // Ambiguity reduction
    if (dims.ambiguity_risk > 3) {
        const quantReplacements = {
            'some': '3-5', 'many': '5-7', 'few': '2-3',
            'several': '4-6', 'a lot': 'a comprehensive set',
        };
        for (const [vague, exact] of Object.entries(quantReplacements)) {
            const regex = new RegExp(`\\b${vague}\\b`, 'gi');
            if (regex.test(improved)) {
                improved = improved.replace(regex, exact);
                changes.push(`Replaced ambiguous "${vague}" with precise "${exact}"`);
            }
        }
    }

    // Model alignment
    if (dims.model_alignment < 4) {
        if (modelTarget === 'openai' && !/\b(step by step|reasoning)\b/i.test(improved)) {
            appendToSection('PROCESS', 'Ensure you work through this step by step.');
            changes.push('Added step-by-step reasoning for OpenAI');
        }
        if (modelTarget === 'anthropic' && !/<\w+>/.test(improved)) {
            appendToSection('CONSTRAINTS', 'Use clear high-level grouping and structure.');
            changes.push('Strengthened structural alignment for Anthropic');
        }
        if (modelTarget === 'gemini' && !/\b(ground|evidence|best practices)\b/i.test(improved)) {
            appendToSection('PROCESS', 'Base your response on current evidence and best practices.');
            changes.push('Added grounding instruction for Gemini');
        }
    }

    if (changes.length === 0) {
        appendToSection('CONSTRAINTS', 'Provide a clear, well-organized response that directly addresses the objective.');
        changes.push('Added general quality reinforcement');
    }

    return { prompt: improved, changes };
}

// ════════════════════════════════════════════════════════════════
//  EXPLANATION BUILDER
// ════════════════════════════════════════════════════════════════

function _buildExplanation(intentContract, ambiguity, analyzerMethod, generatorMethod, v1Score, v2, modelTarget, llmUsed) {
    const profile = MODEL_PROFILES ? (MODEL_PROFILES[modelTarget] || {}) : {};
    const parts = [];

    // Intent resolution
    parts.push(`**Intent resolved** via ${analyzerMethod === 'llm' ? 'LLM analyzer' : 'rule-based extraction'}: ` +
        `Task type: ${intentContract.task_type}. Domain: ${intentContract.domain || 'General'}. ` +
        `Goal: "${intentContract.goal}".`);

    // Ambiguity detection
    if (ambiguity.score > 0) {
        parts.push(`**Ambiguity score:** ${ambiguity.score.toFixed(2)} (threshold: ${AMBIGUITY_THRESHOLD}). ` +
            `Flags: ${ambiguity.details.join(', ') || 'none'}. ` +
            `${ambiguity.needsAnalysis ? 'Routed through LLM intent analyzer.' : 'Bypassed analyzer — input is clear.'}`);
    }

    // Generation method
    parts.push(`**Prompt generated** via ${generatorMethod === 'llm' ? 'LLM prompt generator' : 'template engine'}, ` +
        `optimized for ${profile.name || _modelLabel(modelTarget)}.`);

    // Model optimization notes
    const modelNotes = {
        openai: 'OpenAI GPT benefits from explicit system roles, structured constraints, and step-by-step reasoning instructions.',
        anthropic: 'Claude excels with XML-tagged sections for clear boundaries, and responds well to thoughtful, well-organized instructions.',
        gemini: 'Gemini performs best when context/background comes before the task instruction, with evidence-based grounding.',
    };
    parts.push(`**Model optimization:** ${modelNotes[modelTarget] || modelNotes.openai}`);

    // Refinement
    if (llmUsed) {
        parts.push(`**LLM-refined:** The generated prompt was further refined for enhanced clarity and specificity.`);
    }

    // Auto-improvement
    if (v1Score && v2) {
        const delta = (v2.score.overall - v1Score.overall).toFixed(1);
        parts.push(`**Auto-improved:** v1 scored ${v1Score.overall.toFixed(1)}/5.0 (below ${IMPROVEMENT_THRESHOLD} threshold). ` +
            `Revised to v2: ${v2.score.overall.toFixed(1)}/5.0 (+${delta} improvement).`);
    }

    return parts.join('\n\n');
}

function _modelLabel(model) {
    return {
        openai: 'OpenAI GPT',
        anthropic: 'Anthropic Claude',
        gemini: 'Google Gemini',
    }[model] || model;
}

// ════════════════════════════════════════════════════════════════
//  PUBLIC API
// ════════════════════════════════════════════════════════════════

/**
 * Generate a high-quality, model-optimized prompt using the PRD v2.0 pipeline.
 *
 * @param {Object}   params
 * @param {string}   params.promptText     Raw user input (or use userIdea)
 * @param {string}   [params.userIdea]     Alias for promptText (API spec compat)
 * @param {string}   params.modelTarget    'openai' | 'anthropic' | 'gemini'
 * @param {string}   [params.difficulty]   'basic' (default) | 'advanced'
 * @param {string}   [params.outputFormat] Hint for output format
 * @param {Function} [params.analyzerFn]   Optional: PromptLabEngine.analyze for scoring loop
 * @returns {Promise<Object>} Full generation result
 */
async function generate({
    promptText,
    userIdea,
    modelTarget,
    difficulty = 'basic',
    outputFormat = null,
    analyzerFn = null,
}) {
    const text = (userIdea || promptText || '').trim();

    if (!text || text.length === 0) {
        return { error: 'Please enter a prompt idea to generate.' };
    }

    // ═══════════════════════════════════════════════════════════
    //  LAYER 0: REQUEST CACHE CHECK
    // ═══════════════════════════════════════════════════════════
    const requestKey = _hashKey(text, modelTarget, difficulty);
    const cached = _requestCacheGet(requestKey);

    if (cached) {
        _cacheStats.hits++;
        return { ...cached, cacheHit: true };
    }
    _cacheStats.misses++;

    // ═══════════════════════════════════════════════════════════
    //  LAYER 1: AMBIGUITY DETECTION
    // ═══════════════════════════════════════════════════════════
    const ambiguity = _detectAmbiguity(text, modelTarget);

    // ═══════════════════════════════════════════════════════════
    //  LAYER 2: INTENT ANALYSIS
    // ═══════════════════════════════════════════════════════════
    let intentResult;
    if (ambiguity.needsAnalysis) {
        // High ambiguity → use LLM analyzer for full resolution
        intentResult = await _analyzeIntent(text, modelTarget);
    } else {
        // Low ambiguity → use lightweight local extraction
        intentResult = _extractIntentLocally(text, modelTarget);
    }

    const intentContract = intentResult.contract;
    const analyzerTokensUsed = intentResult.tokensUsed;
    const analyzerMethod = intentResult.method;

    // ═══════════════════════════════════════════════════════════
    //  LAYER 3: INTENT CACHE CHECK
    // ═══════════════════════════════════════════════════════════
    const intentKey = _hashKey(JSON.stringify(intentContract), modelTarget);
    const cachedFromIntent = _intentCacheGet(intentKey);

    let generatedPromptText;
    let generatorTokensUsed = 0;
    let generatorMethod;

    if (cachedFromIntent) {
        generatedPromptText = cachedFromIntent.prompt;
        generatorTokensUsed = 0;
        generatorMethod = 'intent_cached';
    } else {
        // ═══════════════════════════════════════════════════════
        //  LAYER 4: PROMPT GENERATION
        // ═══════════════════════════════════════════════════════
        let genResult;
        try {
            genResult = await _generatePromptFromIntent(intentContract, modelTarget);
        } catch (error) {
            console.error('[PromptLab Generator] Prompt generation error:', error.message);
            return { error: error.message };
        }
        generatedPromptText = genResult.prompt;
        generatorTokensUsed = genResult.tokensUsed;
        generatorMethod = genResult.method;

        // Cache the intent → generated prompt mapping
        _intentCacheSet(intentKey, { prompt: generatedPromptText });
    }

    // ═══════════════════════════════════════════════════════════
    //  ANALYZER LOOP: Score v1, improve if needed
    // ═══════════════════════════════════════════════════════════
    let v1Score = null;
    let v2 = null;
    let improvements = [];

    if (analyzerFn) {
        const v1Analysis = analyzerFn({ promptText: generatedPromptText, modelTarget });
        v1Score = {
            overall: v1Analysis.overall_score || 0,
            dimensions: v1Analysis.dimension_scores || {},
        };

        if (v1Score.overall < IMPROVEMENT_THRESHOLD) {
            const { prompt: v2Prompt, changes } = _improvePrompt(generatedPromptText, intentContract, v1Analysis, modelTarget);
            improvements = changes;

            const v2Analysis = analyzerFn({ promptText: v2Prompt, modelTarget });
            v2 = {
                prompt: v2Prompt,
                score: {
                    overall: v2Analysis.overall_score || 0,
                    dimensions: v2Analysis.dimension_scores || {},
                },
            };
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  LAYER 5: PROMPT REFINEMENT (optional)
    // ═══════════════════════════════════════════════════════════
    let llmUsed = false;
    let refinerTokensUsed = 0;
    let finalPromptText = v2 ? v2.prompt : generatedPromptText;

    if (_shouldRefine(difficulty, v1Score ? v1Score.overall : null)) {
        const refineResult = await _refinePrompt(finalPromptText, modelTarget, difficulty);
        if (refineResult.used) {
            finalPromptText = refineResult.refined;
            llmUsed = true;
            refinerTokensUsed = refineResult.tokensUsed;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  COMPUTE COST METRICS
    // ═══════════════════════════════════════════════════════════
    const totalTokensUsed = analyzerTokensUsed + generatorTokensUsed + refinerTokensUsed;
    const tokensSaved = Math.max(0, LLM_BASELINE_TOKENS - _estimateTokens(finalPromptText));

    // ═══════════════════════════════════════════════════════════
    //  BUILD EXPLANATION
    // ═══════════════════════════════════════════════════════════
    const whyItWorks = _buildExplanation(
        intentContract, ambiguity, analyzerMethod, generatorMethod,
        v1Score, v2, modelTarget, llmUsed
    );

    // Build a blueprint-like object for backward compatibility with the frontend
    const blueprint = {
        role: `Optimized for ${_modelLabel(modelTarget)}`,
        task: intentContract.goal,
        context: `Domain: ${intentContract.domain || 'General'}. Audience: ${intentContract.audience || 'general'}.`,
        constraints: [
            ...(intentContract.must_include || []).map(i => `Include: ${i}`),
            ...(intentContract.must_exclude || []).map(e => `Exclude: ${e}`),
            intentContract.tone ? `Tone: ${intentContract.tone}` : null,
        ].filter(Boolean),
        output_format: intentContract.output_format || 'structured output',
        control_level: ambiguity.score > 0.4 ? 'high' : 'medium',
        model: modelTarget,
        _intent: intentContract,
    };

    // Compose final result (backward-compatible with frontend)
    const finalScore = v2 ? v2.score : v1Score;

    const output = {
        // ── Core fields (backward compat with frontend) ──────────
        intent: {
            taskType: intentContract.task_type,
            domain: intentContract.domain || 'General',
            outputFormat: intentContract.output_format || null,
            controlLevel: ambiguity.score > 0.4 ? 'high' : 'medium',
            subject: intentContract.subject || intentContract.goal,
            audience: intentContract.audience || 'general',
            depth: difficulty === 'advanced' ? 'deep' : 'moderate',
        },
        blueprint,
        v1: { prompt: generatedPromptText, score: v1Score },
        v2,
        improvements,
        whyItWorks,
        finalPrompt: finalPromptText,
        finalScore,

        // ── PRD v2.0 fields ──────────────────────────────────────
        generatedPrompt: finalPromptText,
        intentContract,
        ambiguityDetection: ambiguity,
        tokensSaved,
        totalTokensUsed,
        generationMethod: generatorMethod === 'intent_cached' ? 'cached' : (generatorMethod === 'llm' ? 'llm_pipeline' : 'template'),
        cacheHit: false,
        templateUsed: generatorMethod === 'llm' ? 'llm' : 'template',

        // ── Backward compat alias ────────────────────────────────
        improvedPrompt: finalPromptText,
    };

    // ═══════════════════════════════════════════════════════════
    //  LAYER 6: CACHE STORAGE
    // ═══════════════════════════════════════════════════════════
    _requestCacheSet(requestKey, output);

    return output;
}

/**
 * Return current cache performance metrics.
 */
function getCacheStats() {
    const total = _cacheStats.hits + _cacheStats.misses;
    return {
        size: _requestCache.size,
        intentCacheSize: _intentCache.size,
        totalRequests: total,
        cacheHits: _cacheStats.hits,
        cacheMisses: _cacheStats.misses,
        hitRate: total > 0 ? (_cacheStats.hits / total * 100).toFixed(1) + '%' : '0%',
    };
}

module.exports = { generate, getCacheStats };
