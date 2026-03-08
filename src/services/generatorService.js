/**
 * PromptLab — Prompt Generator Service (v3 — Hybrid Architecture)
 *
 * Architecture:
 *   Layer 0: CACHE CHECK       — return instantly if seen before
 *   Layer 1: INTENT INFERENCE  — infer task type, domain, output format, control level
 *   Layer 2: PROMPT BLUEPRINT  — build structured, inspectable blueprint
 *   Layer 3: TEMPLATE GENERATION — transform blueprint into model-aware prompt
 *   Layer 4: LLM REFINEMENT    — optional GPT-4o-mini polish (server-only, advanced mode)
 *   + ANALYZER LOOP            — score v1, auto-improve if below threshold
 *
 * Cost optimization:
 *   - 70-80% of requests served from templates (zero LLM cost)
 *   - Cache eliminates redundant work on repeated inputs
 *   - LLM refinement only triggered for advanced difficulty or low template scores
 *   - Compact refinement prompts (~150 tokens system + ~200 tokens user)
 */

const { MODEL_PROFILES, MODEL_OUTPUT_SECTIONS } = require('../config/scoring');
const OpenAI = require('openai');

// Initialize OpenRouter client
const openrouter = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || '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',
    defaultHeaders: {
        'HTTP-Referer': 'https://promptlab.ai', // Optional but recommended
        'X-OpenRouter-Title': 'PromptLab Generator',
    },
});

// ── Score threshold for auto-improvement ────────────────────────
const IMPROVEMENT_THRESHOLD = 3.5;

// ── Token cost baseline (avg full LLM generation) ───────────────
const LLM_BASELINE_TOKENS = 750;

// ════════════════════════════════════════════════════════════════
//  IN-MEMORY PROMPT CACHE
// ════════════════════════════════════════════════════════════════

const _promptCache = new Map();   // cacheKey → { result, timestamp }
const _cacheStats = { hits: 0, misses: 0 };
const CACHE_MAX = 500;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * djb2-style hash — no crypto dep, works in Node.js and browser bundle.
 */
function _hashKey(text, model, difficulty) {
    const str = `${text.toLowerCase().trim()}|${model}|${difficulty || 'basic'}`;
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return (h >>> 0).toString(36);
}

function _cacheGet(key) {
    if (!_promptCache.has(key)) return null;
    const entry = _promptCache.get(key);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        _promptCache.delete(key);
        return null;
    }
    return entry.result;
}

function _cacheSet(key, result) {
    if (_promptCache.size >= CACHE_MAX) {
        // Evict the oldest entry
        _promptCache.delete(_promptCache.keys().next().value);
    }
    _promptCache.set(key, { result, timestamp: Date.now() });
}

// ════════════════════════════════════════════════════════════════
//  TOKEN ESTIMATION
// ════════════════════════════════════════════════════════════════

function _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.35);
}

// ════════════════════════════════════════════════════════════════
//  TEMPLATE LIBRARY
//  8 named categories. Each entry has match patterns and a build()
//  function. build() returns model-aware intent overrides that
//  feed into the existing blueprint pipeline — no code duplication.
// ════════════════════════════════════════════════════════════════

const TEMPLATE_LIBRARY = {

    blog: {
        match: [/\b(blog|article|post|seo|content marketing|editorial|newsletter)\b/i],
        intentOverrides: { taskType: 'content', domain: 'Content Writing' },
        roleFragments: {
            openai: 'You are a senior SEO content strategist and copywriter with 10+ years of audience-targeted content creation.',
            anthropic: 'You are a content strategy expert who creates compelling, well-researched articles optimized for readers and search engines.',
            gemini: 'You are a content marketing specialist who produces data-driven, audience-aware articles with strong SEO foundations.',
        },
        constraintFragments: [
            'Include a compelling hook in the introduction.',
            'Use short paragraphs (3-4 sentences max) and subheadings for scannability.',
            'Maintain an informative yet engaging tone throughout.',
        ],
    },

    coding: {
        match: [/\b(code|function|script|api|algorithm|implement|debug|program|python|javascript|typescript|sql|backend|frontend)\b/i],
        intentOverrides: { taskType: 'code', domain: 'Software Development' },
        roleFragments: {
            openai: 'You are a senior software engineer known for writing clean, well-documented, production-ready code.',
            anthropic: 'You are an experienced developer who writes robust, well-tested code with clear documentation.',
            gemini: 'You are a software engineering expert who produces clean, efficient, and well-commented code.',
        },
        constraintFragments: [
            'Include inline comments explaining key logic.',
            'Handle edge cases and validate inputs.',
            'Add a brief explanation of design decisions after the code.',
        ],
    },

    research: {
        match: [/\b(research|literature review|study|findings|methodology|data analysis|survey|academic|paper)\b/i],
        intentOverrides: { taskType: 'analyze', domain: 'Research & Analysis' },
        roleFragments: {
            openai: 'You are a senior research analyst skilled at multi-dimensional analysis and evidence-based conclusions.',
            anthropic: 'You are a thorough researcher who examines topics from multiple perspectives with balanced, well-supported findings.',
            gemini: 'You are an analytical expert who provides structured, evidence-based analysis with actionable insights.',
        },
        constraintFragments: [
            'Cite evidence or data to support each key finding.',
            'Acknowledge limitations or counterarguments where relevant.',
            'Organize findings from most to least significant.',
        ],
    },

    marketing: {
        match: [/\b(marketing|campaign|brand|advertis|copywriting|social media|conversion|funnel|cta|headline|landing page)\b/i],
        intentOverrides: { taskType: 'generate', domain: 'Content Writing' },
        roleFragments: {
            openai: 'You are an expert marketing copywriter who creates persuasive, conversion-focused content.',
            anthropic: 'You are a brand strategist who crafts compelling marketing narratives that resonate with target audiences.',
            gemini: 'You are a performance marketing specialist who produces data-informed, audience-targeted marketing content.',
        },
        constraintFragments: [
            'Focus on benefits, not just features.',
            'Use clear, action-oriented language with a strong CTA.',
            'Keep sentences concise and punchy.',
        ],
    },

    planning: {
        match: [/\b(plan|roadmap|schedule|timeline|milestone|goal|habit|productivity|organize|workflow|routine)\b/i],
        intentOverrides: { taskType: 'plan', domain: 'Planning & Productivity' },
        roleFragments: {
            openai: 'You are a productivity and planning expert specializing in structured goal-setting and workflow optimization.',
            anthropic: 'You are a methodical planning strategist with expertise in breaking complex goals into actionable milestones.',
            gemini: 'You are a planning specialist who creates evidence-based, structured action plans.',
        },
        constraintFragments: [
            'Break the plan into clear phases or milestones.',
            'Include time estimates or priority levels for each step.',
            'Make every action item specific and measurable.',
        ],
    },

    storytelling: {
        match: [/\b(story|narrative|fiction|novel|character|plot|screenplay|creative writing|tale)\b/i],
        intentOverrides: { taskType: 'story', domain: 'Storytelling & Fiction' },
        roleFragments: {
            openai: 'You are a bestselling novelist with deep expertise in narrative structure, character development, and emotional pacing.',
            anthropic: 'You are a creative writing mentor who crafts compelling narratives with rich character arcs and emotional depth.',
            gemini: 'You are a narrative design expert who creates engaging stories with clear structure and meaningful themes.',
        },
        constraintFragments: [
            'Establish a clear three-act structure.',
            'Ground characters in specific, believable motivations.',
            'Show, don\'t tell — use concrete details over abstract descriptions.',
        ],
    },

    analysis: {
        match: [/\b(analyze|analyse|evaluate|assess|compare|review|critique|examine|pros and cons|SWOT)\b/i],
        intentOverrides: { taskType: 'analyze', domain: 'Research & Analysis' },
        roleFragments: {
            openai: 'You are a senior analyst with deep domain expertise, skilled at multi-dimensional analysis and evidence-based conclusions.',
            anthropic: 'You are a thorough analyst who examines topics from multiple perspectives with balanced, well-supported findings.',
            gemini: 'You are an analytical expert who provides structured, evidence-based analysis with actionable recommendations.',
        },
        constraintFragments: [
            'Evaluate across at least 3 distinct dimensions.',
            'Support each point with evidence, data, or concrete examples.',
            'End with a clear, actionable recommendation or conclusion.',
        ],
    },

    general: {
        match: [/.*/],  // catch-all — always matches
        intentOverrides: {},
        roleFragments: {
            openai: 'You are a highly capable expert assistant.',
            anthropic: 'You are a knowledgeable assistant who provides clear, well-structured responses.',
            gemini: 'You are an expert assistant who provides evidence-based, well-organized responses.',
        },
        constraintFragments: [
            'Provide a clear, focused response that directly addresses the objective.',
            'Organize your response with logical structure and clear language.',
        ],
    },
};

/**
 * Classify input text into a template category.
 * Returns the template key (e.g. 'blog', 'coding', 'general').
 */
function _classifyTemplate(text) {
    for (const [key, tpl] of Object.entries(TEMPLATE_LIBRARY)) {
        if (key === 'general') continue; // check last
        if (tpl.match.some(re => re.test(text))) return key;
    }
    return 'general';
}

// ════════════════════════════════════════════════════════════════
//  TASK PATTERNS (extended from analyzer)
// ════════════════════════════════════════════════════════════════

const TASK_PATTERNS = [
    { task: 'plan', patterns: [/\b(plan|schedule|roadmap|timeline|milestone|daily routine|weekly plan|organize my|time management)\b/i] },
    { task: 'story', patterns: [/\b(story|narrative|fiction|tale|novel|short story|creative writing|plot|character)\b/i] },
    { task: 'content', patterns: [/\b(blog|article|seo|content|social media|marketing|copywriting|headline)\b/i] },
    { task: 'evaluate', patterns: [/\b(evaluate|assess|grade|score|rate|critique|review and improve|feedback on)\b/i] },
    { task: 'explain', patterns: [/\b(explain|describe|what is|define|clarify|elaborate|break down|tell me about|teach me)\b/i] },
    { task: 'compare', patterns: [/\b(compare|contrast|difference|versus|vs\.?|similarities|pros and cons|better)\b/i] },
    { task: 'generate', patterns: [/\b(write|create|generate|compose|draft|produce|come up with|make me)\b/i] },
    { task: 'summarize', patterns: [/\b(summarize|summary|overview|recap|condense|tldr|brief)\b/i] },
    { task: 'analyze', patterns: [/\b(analyze|analyse|evaluate|assess|review|examine)\b/i] },
    { task: 'list', patterns: [/\b(list|enumerate|name|give me|what are|identify all|top \d+)\b/i] },
    { task: 'instruct', patterns: [/\b(how to|steps to|guide|tutorial|instructions|walk me through|teach me how)\b/i] },
    { task: 'code', patterns: [/\b(code|program|function|script|implement|algorithm|debug|api|python|javascript|html|css|sql|build a|write a script)\b/i] },
    { task: 'brainstorm', patterns: [/\b(brainstorm|suggest|recommend|ideas?|options?|alternatives?|creative)\b/i] },
    { task: 'optimize', patterns: [/\b(optimize|improve|enhance|refine|upgrade|boost|maximize|streamline)\b/i] },
];

// ── Domain/Niche patterns ───────────────────────────────────────
const DOMAIN_PATTERNS = [
    { domain: 'Planning & Productivity', patterns: [/\b(plan|schedule|routine|productivity|time management|goal|habit|workflow|organize)\b/i] },
    { domain: 'Storytelling & Fiction', patterns: [/\b(story|fiction|narrative|novel|plot|character|creative writing|screenplay)\b/i] },
    { domain: 'Content Writing', patterns: [/\b(blog|article|seo|content|copywriting|headline|social media|marketing)\b/i] },
    { domain: 'Learning & Education', patterns: [/\b(learn|study|education|course|lesson|explain|teach|student|university|school)\b/i] },
    { domain: 'Research & Analysis', patterns: [/\b(research|analysis|data|study|paper|literature|findings|methodology)\b/i] },
    { domain: 'Software Development', patterns: [/\b(code|programming|software|api|database|frontend|backend|deploy|architecture)\b/i] },
    { domain: 'Business & Strategy', patterns: [/\b(business|strategy|market|competitor|revenue|startup|pitch|investor)\b/i] },
    { domain: 'Health & Fitness', patterns: [/\b(health|fitness|diet|exercise|workout|nutrition|gym|wellness|mental health)\b/i] },
    { domain: 'Design & Creative', patterns: [/\b(design|ui|ux|graphic|visual|brand|logo|color|aesthetic|layout)\b/i] },
    { domain: 'Communication', patterns: [/\b(email|message|letter|speech|presentation|pitch|negotiate)\b/i] },
];

// ── Output Format inference ─────────────────────────────────────
const FORMAT_PATTERNS = [
    { format: 'step-by-step plan', patterns: [/\b(step.by.step|steps|how to|guide|tutorial|instructions|walk.through)\b/i] },
    { format: 'checklist', patterns: [/\b(checklist|check.list|to.do|task list)\b/i] },
    { format: 'table', patterns: [/\b(table|comparison table|grid|matrix|spreadsheet|columns)\b/i] },
    { format: 'narrative', patterns: [/\b(story|essay|narrative|paragraph|write about|creative)\b/i] },
    { format: 'structured bullets', patterns: [/\b(bullet|bullets|points|key points|list|enumerat)\b/i] },
    { format: 'explanation + example', patterns: [/\b(explain|example|illustrat|demonstrate|show me)\b/i] },
    { format: 'code block', patterns: [/\b(code|function|script|implement|program|snippet)\b/i] },
];

// ── Control Level inference ─────────────────────────────────────
const HIGH_CONTROL_SIGNALS = /\b(exact|exactly|precise|strict|must|required|structured|formatted|step-by-step|specific|explicit|constraint|follow this format|no more than|at least|between \d+ and \d+)\b/i;
const LOW_CONTROL_SIGNALS = /\b(help|suggest|any|open-ended|whatever|creative|flexible|freestyle|anything|general)\b/i;

// ════════════════════════════════════════════════════════════════
//  LLM REFINEMENT LAYER (server-only, async, optional)
// ════════════════════════════════════════════════════════════════

/**
 * Decide whether to invoke LLM refinement.
 * Only true for advanced difficulty or very low template scores.
 */
function _shouldRefine(difficulty, v1Score) {
    if (difficulty === 'advanced') return true;
    if (v1Score !== null && v1Score < IMPROVEMENT_THRESHOLD - 0.5) return true;
    return false;
}

/**
 * Refine a template-generated prompt using an LLM (via OpenRouter).
 * - Only runs server-side (Node.js with API key configured)
 * - Gracefully falls back to the template prompt on any error
 * - Uses a compact system prompt to minimize token usage
 *
 * @returns {{ refined: string, used: boolean, tokensUsed: number }}
 */
async function _refineWithLLM(templatePrompt, modelTarget, difficulty) {
    // Guard: browser bundle, or no API key configured
    if (
        typeof process === 'undefined' ||
        !process.env ||
        (!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY)
    ) {
        return { refined: templatePrompt, used: false, tokensUsed: 0 };
    }

    // Compact system + user messages to minimize refinement token cost
    const systemMsg = 'You are a prompt engineer. Refine the prompt below for clarity, specificity, and alignment with the target model. Return only the improved prompt text — no explanation, no preamble.';
    const userMsg = `Target model: ${modelTarget}\nDifficulty: ${difficulty}\n\n---\n${templatePrompt}`;

    try {
        const completion = await openrouter.chat.completions.create({
            model: process.env.OPENROUTER_MODEL || 'openai/gpt-5.2',
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: userMsg },
            ],
            max_tokens: 600,
            temperature: 0.3,
        });

        const refined = completion.choices[0]?.message?.content?.trim() || templatePrompt;

        // Estimate refinement tokens (system + user input + output)
        const tokensUsed = _estimateTokens(systemMsg) + _estimateTokens(userMsg) + _estimateTokens(refined);
        return { refined, used: true, tokensUsed };

    } catch (error) {
        console.error('OpenRouter refinement error:', error);
        return { refined: templatePrompt, used: false, tokensUsed: 0 };
    }
}

// ════════════════════════════════════════════════════════════════
//  PUBLIC API
// ════════════════════════════════════════════════════════════════

/**
 * Generate a high-quality, model-aware prompt using the hybrid system.
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

    const lower = text.toLowerCase();

    // ═══════════════════════════════════════════════════════════
    //  LAYER 0: CACHE CHECK
    // ═══════════════════════════════════════════════════════════
    const cacheKey = _hashKey(text, modelTarget, difficulty);
    const cached = _cacheGet(cacheKey);

    if (cached) {
        _cacheStats.hits++;
        return { ...cached, cacheHit: true };
    }
    _cacheStats.misses++;

    // ═══════════════════════════════════════════════════════════
    //  CLASSIFY → TEMPLATE LIBRARY
    // ═══════════════════════════════════════════════════════════
    const templateKey = _classifyTemplate(text);
    const template = TEMPLATE_LIBRARY[templateKey];

    // ═══════════════════════════════════════════════════════════
    //  LAYER 1: INTENT INFERENCE (with template overrides)
    // ═══════════════════════════════════════════════════════════
    const intent = _inferIntent(text, lower, template.intentOverrides);

    // ═══════════════════════════════════════════════════════════
    //  LAYER 2: PROMPT BLUEPRINT (template-aware)
    // ═══════════════════════════════════════════════════════════
    const blueprint = _buildBlueprint(text, intent, modelTarget, template);

    // ═══════════════════════════════════════════════════════════
    //  LAYER 3: PROMPT GENERATION (v1 — template-based)
    // ═══════════════════════════════════════════════════════════
    const v1Prompt = _generateFromBlueprint(blueprint, modelTarget);

    // ═══════════════════════════════════════════════════════════
    //  ANALYZER LOOP: Score v1, improve if needed
    // ═══════════════════════════════════════════════════════════
    let v1Score = null;
    let v2 = null;
    let improvements = [];

    if (analyzerFn) {
        const v1Analysis = analyzerFn({ promptText: v1Prompt, modelTarget });
        v1Score = {
            overall: v1Analysis.overall_score || 0,
            dimensions: v1Analysis.dimension_scores || {},
        };

        if (v1Score.overall < IMPROVEMENT_THRESHOLD) {
            const { prompt: v2Prompt, changes } = _improvePrompt(v1Prompt, blueprint, v1Analysis, modelTarget);
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
    //  LAYER 4: LLM REFINEMENT (optional — server-only)
    // ═══════════════════════════════════════════════════════════
    let llmUsed = false;
    let llmTokensUsed = 0;
    let finalPromptText = v2 ? v2.prompt : v1Prompt;

    if (_shouldRefine(difficulty, v1Score ? v1Score.overall : null)) {
        const llmResult = await _refineWithLLM(finalPromptText, modelTarget, difficulty);
        if (llmResult.used) {
            finalPromptText = llmResult.refined;
            llmUsed = true;
            llmTokensUsed = llmResult.tokensUsed;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  COMPUTE COST METRICS
    // ═══════════════════════════════════════════════════════════
    const templateTokens = _estimateTokens(finalPromptText);
    // Savings = what a raw LLM generation would cost minus what we actually spent
    const tokensSaved = Math.max(0, LLM_BASELINE_TOKENS - templateTokens - llmTokensUsed);

    // ═══════════════════════════════════════════════════════════
    //  BUILD EXPLANATION
    // ═══════════════════════════════════════════════════════════
    const whyItWorks = _buildExplanation(intent, blueprint, v1Score, v2, modelTarget, templateKey, llmUsed);

    // Compose final result
    const finalScore = v2 ? v2.score : v1Score;

    const output = {
        // ── Existing fields (unchanged for backward compat) ──────
        intent,
        blueprint,
        v1: { prompt: v1Prompt, score: v1Score },
        v2,
        improvements,
        whyItWorks,
        finalPrompt: finalPromptText,
        finalScore,
        // ── New fields (API spec + cost monitoring) ──────────────
        generatedPrompt: finalPromptText,
        tokensSaved,
        generationMethod: llmUsed ? 'llm_refined' : 'template',
        cacheHit: false,
        templateUsed: templateKey,
    };

    // Store in cache (cache-safe copy without functions)
    _cacheSet(cacheKey, output);

    return output;
}

/**
 * Return current cache performance metrics.
 * Useful for monitoring cost optimization effectiveness.
 */
function getCacheStats() {
    const total = _cacheStats.hits + _cacheStats.misses;
    return {
        size: _promptCache.size,
        totalRequests: total,
        cacheHits: _cacheStats.hits,
        cacheMisses: _cacheStats.misses,
        hitRate: total > 0 ? (_cacheStats.hits / total * 100).toFixed(1) + '%' : '0%',
    };
}

// ════════════════════════════════════════════════════════════════
//  LAYER 1: INTENT INFERENCE
// ════════════════════════════════════════════════════════════════

function _inferIntent(text, lower, templateOverrides) {
    // A. Task Type (allow template to override)
    let taskType = templateOverrides.taskType || 'general';
    if (!templateOverrides.taskType) {
        for (const { task, patterns } of TASK_PATTERNS) {
            if (patterns.some(p => p.test(lower))) {
                taskType = task;
                break;
            }
        }
    }

    // B. Domain / Niche (allow template to override)
    let domain = templateOverrides.domain || 'General';
    if (!templateOverrides.domain) {
        for (const { domain: d, patterns } of DOMAIN_PATTERNS) {
            if (patterns.some(p => p.test(lower))) {
                domain = d;
                break;
            }
        }
    }

    // C. Desired Output Format
    let outputFormat = _getDefaultFormat(taskType);
    for (const { format, patterns } of FORMAT_PATTERNS) {
        if (patterns.some(p => p.test(lower))) {
            outputFormat = format;
            break;
        }
    }

    // D. Control Level
    let controlLevel = 'medium';
    if (HIGH_CONTROL_SIGNALS.test(lower)) {
        controlLevel = 'high';
    } else if (LOW_CONTROL_SIGNALS.test(lower)) {
        controlLevel = 'low';
    }
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 40) controlLevel = 'high';

    // E. Subject extraction
    const subject = _extractSubject(text, lower);

    // F. Audience
    const audience = _inferAudience(lower);

    // G. Depth
    const depth = _inferDepth(lower, wordCount);

    return { taskType, domain, outputFormat, controlLevel, subject, audience, depth };
}

function _extractSubject(text, lower) {
    const verbSubject = text.match(/\b(?:explain|describe|summarize|compare|analyze|write|create|list|review|evaluate|implement|build|define|discuss|teach|outline|critique|plan|schedule|generate|optimize|improve)\s+(?:a\s+|an\s+|the\s+)?(?:concept\s+of\s+|basics\s+of\s+|fundamentals\s+of\s+|principles\s+of\s+)?(.{3,80}?)(?:\.|,|\?|$|\bfor\b|\bin\b|\bto\b|\busing\b|\bwith\b|\bkeeping\b)/i);
    if (verbSubject) return verbSubject[1].trim().replace(/\b(some|a|an)\b/gi, '').trim();

    const aboutMatch = text.match(/\b(?:about|regarding|on|related to|concerning)\s+(.{3,60}?)(?:\.|,|\?|$|\band\b|\bwith\b|\bthat\b|\bwhich\b)/i);
    if (aboutMatch) return aboutMatch[1].trim().replace(/\b(some|the|a|an)\b/gi, '').trim();

    const words = text.split(/\s+/).filter(w => w.length > 3);
    const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should', 'about', 'into', 'them', 'then', 'than', 'also', 'just', 'like', 'make', 'more', 'most', 'only', 'very', 'when', 'what', 'your', 'help']);
    const candidates = words.filter(w => !stopWords.has(w.toLowerCase()));
    if (candidates.length > 0) return candidates.slice(0, 5).join(' ');

    return text.substring(0, 40).trim();
}

function _inferAudience(lower) {
    if (/\b(beginner|simple|basic|eli5|elementary|for kids|for children)\b/.test(lower)) return 'beginner';
    if (/\b(expert|advanced|PhD|graduate|specialist|professional|senior)\b/.test(lower)) return 'expert';
    if (/\b(student|undergraduate|college|university|learner)\b/.test(lower)) return 'student';
    if (/\b(developer|programmer|engineer|coder)\b/.test(lower)) return 'developer';
    return 'general';
}

function _inferDepth(lower, wordCount) {
    if (/\b(brief|quick|short|concise|overview|high-level|tldr)\b/.test(lower)) return 'surface';
    if (/\b(detailed|in-depth|comprehensive|thorough|exhaustive|deep dive)\b/.test(lower)) return 'deep';
    if (wordCount < 8) return 'surface';
    return 'moderate';
}

function _getDefaultFormat(taskType) {
    return {
        plan: 'step-by-step plan',
        story: 'narrative',
        content: 'structured bullets',
        evaluate: 'explanation + example',
        explain: 'explanation + example',
        compare: 'table',
        generate: 'structured bullets',
        summarize: 'structured bullets',
        analyze: 'structured bullets',
        list: 'structured bullets',
        instruct: 'step-by-step plan',
        code: 'code block',
        brainstorm: 'structured bullets',
        optimize: 'structured bullets',
        general: 'structured bullets',
    }[taskType] || 'structured bullets';
}

// ════════════════════════════════════════════════════════════════
//  LAYER 2: PROMPT BLUEPRINT
// ════════════════════════════════════════════════════════════════

function _buildBlueprint(text, intent, modelTarget, template) {
    const parsed = _parsePromptContent(text, intent);

    // Role: prefer template role fragment, fall back to task-based assignment
    const role = (template && template.roleFragments && template.roleFragments[modelTarget])
        ? template.roleFragments[modelTarget]
        : _assignRole(intent, modelTarget);

    const task = _buildTaskInstruction(text, intent, parsed);

    const context = parsed.context;

    // Constraints: merge template-specific + standard constraints
    const templateConstraints = (template && template.constraintFragments) ? template.constraintFragments : [];
    const standardConstraints = _buildConstraints(text, intent, parsed, modelTarget);
    // Deduplicate by merging, template constraints first
    const constraints = [...templateConstraints, ...standardConstraints.filter(
        c => !templateConstraints.some(tc => tc.toLowerCase().includes(c.substring(0, 20).toLowerCase()))
    )];

    const outputFormat = _mapOutputFormat(intent.outputFormat, intent.taskType, modelTarget);

    return {
        role,
        task,
        context,
        constraints,
        output_format: outputFormat,
        control_level: intent.controlLevel,
        model: modelTarget,
        _parsed: parsed,
        _intent: intent,
    };
}

function _parsePromptContent(text, intent) {
    const subject = intent.subject || text.trim().split(/[.,!?]/)[0].trim();
    const contextMatch = text.match(/\b(?:i am|i'm|we are|we're|my|our|currently|working on|i need|i want|i have|given)\b[^.!?]*/i);
    const goalMatch = text.match(/\b(?:goal|objective|aim|want to|need to|trying to|hoping to|looking to)\b[^.!?]*/i);
    const constraintMatch = text.match(/\b(?:constraint|limit|within|between|from|must|should|only|under|maximum|minimum|at least|no more|prioriti)\b[^.!?]*/i);
    const audienceMatch = text.match(/\b(?:for|targeting|aimed at|audience)\s+(?:a\s+)?(\w+(?:\s+\w+)?)/i);
    const toneMatch = text.match(/\b(?:tone|style|voice)\s*[:=]?\s*(\w+)/i);

    let context;
    if (contextMatch) {
        context = contextMatch[0].trim();
        if (context.split(/\s+/).length < 6) context += `. The task involves ${subject}.`;
    } else {
        context = `I need assistance with ${subject}. ${goalMatch ? goalMatch[0].trim() + '.' : `The goal is to get a high-quality ${intent.outputFormat} on this topic.`}`;
    }

    let constraintText;
    if (constraintMatch) {
        constraintText = constraintMatch[0].trim();
        if (!constraintText.match(/^[A-Z]/)) constraintText = constraintText.charAt(0).toUpperCase() + constraintText.slice(1);
    } else {
        constraintText = `Focus specifically on ${subject}. Avoid tangential information or overly generic responses.`;
    }

    return {
        subject,
        context,
        constraints: constraintText,
        goal: goalMatch ? goalMatch[0].trim() : null,
        audience: audienceMatch ? audienceMatch[1] : intent.audience,
        tone: toneMatch ? toneMatch[1] : null,
        originalText: text.trim(),
    };
}

function _assignRole(intent, modelTarget) {
    const sub = intent.subject || 'this domain';

    const roleMap = {
        plan: {
            openai: `You are a productivity and planning expert specializing in structured goal-setting, time management, and workflow optimization.`,
            anthropic: `You are a methodical planning strategist with expertise in breaking complex goals into actionable, time-bound milestones.`,
            gemini: `You are a planning and productivity specialist who creates evidence-based, structured action plans.`,
        },
        story: {
            openai: `You are a bestselling novelist and story architect with deep expertise in narrative structure, character development, and emotional pacing.`,
            anthropic: `You are an experienced creative writing mentor who excels at crafting compelling narratives with rich character arcs and emotional depth.`,
            gemini: `You are a narrative design expert who creates engaging stories with clear structure, vivid characters, and meaningful themes.`,
        },
        content: {
            openai: `You are a senior SEO content strategist and copywriter with 10+ years of experience in audience-targeted content creation.`,
            anthropic: `You are a content strategy expert who creates compelling, well-researched content optimized for both readers and search engines.`,
            gemini: `You are a content marketing specialist who produces data-driven, audience-aware content with strong SEO foundations.`,
        },
        evaluate: {
            openai: `You are a critical analyst who uses the Evaluate → Diagnose → Improve framework to systematically identify weaknesses and produce better iterations.`,
            anthropic: `You are a systematic evaluator who provides balanced, evidence-based assessments with clear improvement pathways.`,
            gemini: `You are an analytical reviewer who applies structured evaluation frameworks to produce measurable improvements.`,
        },
        explain: {
            openai: `You are an expert educator and ${sub} specialist who excels at making complex topics accessible through clear structure and practical examples.`,
            anthropic: `You are a knowledgeable instructor who explains ${sub} with clarity, precision, and well-chosen examples.`,
            gemini: `You are a subject matter expert in ${sub} who provides clear, structured explanations grounded in current knowledge.`,
        },
        compare: {
            openai: `You are a research analyst specializing in objective, data-driven comparisons with deep expertise in ${sub}.`,
            anthropic: `You are an analytical comparator who provides balanced, evidence-based assessments of ${sub}.`,
            gemini: `You are a comparative analyst who evaluates ${sub} across well-defined criteria with supporting evidence.`,
        },
        generate: {
            openai: `You are a skilled content creator with expertise in ${sub}, known for producing engaging, well-structured content.`,
            anthropic: `You are a creative professional who produces high-quality, thoughtfully crafted content about ${sub}.`,
            gemini: `You are a content generation specialist who creates well-organized, audience-appropriate material on ${sub}.`,
        },
        code: {
            openai: `You are a senior software engineer specializing in ${sub}, known for writing clean, well-documented, production-ready code.`,
            anthropic: `You are an experienced developer who writes robust, well-tested code with clear documentation for ${sub}.`,
            gemini: `You are a software engineering expert who produces clean, efficient, and well-commented code for ${sub}.`,
        },
        analyze: {
            openai: `You are a senior analyst with deep expertise in ${sub}, skilled at multi-dimensional analysis and evidence-based conclusions.`,
            anthropic: `You are a thorough analyst who examines ${sub} from multiple perspectives with balanced, well-supported findings.`,
            gemini: `You are an analytical expert in ${sub} who provides structured, evidence-based analysis with actionable insights.`,
        },
        brainstorm: {
            openai: `You are a creative strategist and innovation consultant with expertise in ${sub}, skilled at generating diverse, unconventional ideas.`,
            anthropic: `You are an ideation specialist who generates creative, practical solutions for ${sub} across multiple dimensions.`,
            gemini: `You are a creative problem solver who brainstorms diverse, feasible approaches to ${sub}.`,
        },
        optimize: {
            openai: `You are an optimization specialist with expertise in ${sub}, focused on identifying inefficiencies and implementing measurable improvements.`,
            anthropic: `You are a systematic improvement consultant who identifies weaknesses in ${sub} and proposes evidence-based optimizations.`,
            gemini: `You are an efficiency expert who analyzes ${sub} to find optimization opportunities with clear implementation steps.`,
        },
    };

    const defaultRole = {
        openai: `You are a highly capable expert assistant specialized in ${sub}.`,
        anthropic: `You are a knowledgeable assistant with expertise in ${sub}.`,
        gemini: `You are an expert assistant who provides well-structured, evidence-based responses about ${sub}.`,
    };

    const roles = roleMap[intent.taskType] || defaultRole;
    return roles[modelTarget] || roles.openai;
}

function _buildTaskInstruction(text, intent, parsed) {
    const taskVerbs = {
        plan: 'Create a comprehensive, actionable plan for',
        story: 'Write a compelling narrative outline for',
        content: 'Create optimized content for',
        evaluate: 'Evaluate, diagnose, and improve',
        explain: 'Provide a clear, structured explanation of',
        compare: 'Create a detailed comparison of',
        generate: 'Write',
        summarize: 'Provide a concise, structured summary of',
        analyze: 'Conduct a thorough analysis of',
        list: 'Create a curated, prioritized list of',
        instruct: 'Provide clear, step-by-step instructions for',
        code: 'Implement',
        brainstorm: 'Generate diverse, creative ideas for',
        optimize: 'Analyze and optimize',
        general: 'Provide a well-structured response about',
    };

    const verb = taskVerbs[intent.taskType] || taskVerbs.general;
    return `${verb} ${parsed.subject || text.trim()}`;
}

function _buildConstraints(text, intent, parsed, modelTarget) {
    const constraints = [];

    if (parsed.constraints && !parsed.constraints.includes('[')) {
        constraints.push(parsed.constraints);
    }

    const audienceMap = {
        beginner: 'Use simple language, avoid jargon, and explain any technical terms',
        student: 'Assume foundational knowledge but explain advanced concepts clearly',
        expert: 'Use technical terminology freely and focus on depth over breadth',
        developer: 'Include code examples and technical details',
        general: 'Write for a moderately knowledgeable audience with clear language',
    };
    constraints.push(audienceMap[intent.audience] || audienceMap.general);

    if (intent.depth === 'surface') {
        constraints.push('Keep the response brief and focused on key points');
    } else if (intent.depth === 'deep') {
        constraints.push('Provide comprehensive coverage with detailed explanations');
    }

    if (intent.controlLevel === 'high') {
        constraints.push('Follow the exact structure and format specified');
        constraints.push('Do not deviate from the requested scope');
    }

    if (modelTarget === 'anthropic') {
        constraints.push('Ensure accuracy, balance, and factual correctness');
    } else if (modelTarget === 'gemini') {
        constraints.push('Ground your response in current best practices and evidence');
    }

    return constraints;
}

function _mapOutputFormat(format, taskType, modelTarget) {
    const modelFormats = {
        openai: {
            'step-by-step plan': 'Respond as a structured timeline with numbered phases, each containing specific action items, deadlines, and priority levels',
            'checklist': 'Respond as a numbered checklist with clear, actionable items that can be checked off',
            'table': 'Respond as a well-formatted markdown comparison table with clear column headers and data rows',
            'narrative': 'Respond as a flowing narrative with clear paragraph breaks, engaging language, and a logical arc',
            'structured bullets': 'Respond in structured markdown with headers and bullet points for easy scanning',
            'explanation + example': 'Respond with a clear explanation followed by a concrete, practical example',
            'code block': 'Respond with clean, well-commented code in a fenced code block, followed by a brief explanation',
        },
        anthropic: {
            'step-by-step plan': 'Present as clearly numbered steps, each starting with an action verb and including expected outcomes',
            'checklist': 'Provide a clean checklist with concise, actionable items',
            'table': 'Present as a structured comparison with clear dimensions and balanced assessment',
            'narrative': 'Write in clear, engaging prose with logical flow and precise language',
            'structured bullets': 'Respond with concise bullet points organized under clear headings',
            'explanation + example': 'Provide a clear explanation with a well-chosen illustrative example',
            'code block': 'Provide well-documented code with error handling and a brief explanation of design choices',
        },
        gemini: {
            'step-by-step plan': 'Respond as a structured plan with phases, tasks, and milestones in a clear hierarchical format',
            'checklist': 'Provide an organized checklist grounded in best practices',
            'table': 'Present as a well-structured table with clear criteria columns and supporting evidence',
            'narrative': 'Write a well-organized narrative with clear structure and evidence-based claims',
            'structured bullets': 'Respond with organized sections, headers, and bullet points using clear formatting',
            'explanation + example': 'Provide a structured explanation with practical examples and visual aids where appropriate',
            'code block': 'Provide clean, efficient code with inline comments and a structured explanation',
        },
    };

    return (modelFormats[modelTarget] || modelFormats.openai)[format] || 'Respond in structured markdown with clear organization';
}

// ════════════════════════════════════════════════════════════════
//  LAYER 3: PROMPT GENERATION
// ════════════════════════════════════════════════════════════════

function _generateFromBlueprint(blueprint, modelTarget) {
    const parts = [];

    if (blueprint.role) {
        parts.push('ROLE:');
        parts.push(blueprint.role);
        parts.push('');
    }

    if (blueprint.task) {
        parts.push('OBJECTIVE:');
        let objective = blueprint.task;
        if (modelTarget === 'gemini' && !objective.toLowerCase().startsWith('execute')) {
            objective = `Execute the following task: ${objective}`;
        }
        parts.push(objective + (objective.endsWith('.') ? '' : '.'));
        parts.push('');
    }

    if (blueprint.context) {
        parts.push('CONTEXT:');
        parts.push(blueprint.context);
        parts.push('');
    }

    if (blueprint.constraints && blueprint.constraints.length > 0) {
        parts.push('CONSTRAINTS:');
        const finalConstraints = [...blueprint.constraints];

        if (modelTarget === 'openai') {
            finalConstraints.push('Strictly follow all explicitly stated constraints and formatting rules.');
        } else if (modelTarget === 'anthropic') {
            finalConstraints.push('Maintain high-level structural integrity; avoid excessive bullet nesting.');
        }

        finalConstraints.forEach(c => parts.push(`- ${c}`));
        parts.push('');
    }

    parts.push('PROCESS:');
    if (modelTarget === 'anthropic') {
        parts.push('1. Think carefully about the objective and available context.');
        parts.push('2. Outline the reasoning steps required to fulfill the goal.');
        parts.push('3. Provide the final response with a clean, high-level structure.');
    } else if (modelTarget === 'openai') {
        parts.push('1. Review constraints and ensure full compliance.');
        parts.push('2. Process the request methodically and step-by-step.');
        parts.push('3. Generate output that strictly adheres to the requested schema.');
    } else if (modelTarget === 'gemini') {
        parts.push('1. Analyze the practical execution steps needed.');
        parts.push('2. Ground the response in best practices.');
        parts.push('3. Output the final execution-focused result directly.');
    } else {
        parts.push('Think step by step before providing your answer.');
    }
    parts.push('');

    if (blueprint.output_format) {
        parts.push('OUTPUT FORMAT:');
        parts.push(blueprint.output_format + (blueprint.output_format.endsWith('.') ? '' : '.'));
        parts.push('');
    }

    return parts.join('\n').trim();
}

// ════════════════════════════════════════════════════════════════
//  ANALYZER LOOP: AUTO-IMPROVEMENT (sync, no LLM)
// ════════════════════════════════════════════════════════════════

function _improvePrompt(v1Prompt, blueprint, analysis, modelTarget) {
    const changes = [];
    let improved = v1Prompt;
    const dims = analysis.dimension_scores || {};

    if (dims.clarity < 4) {
        const vagueReplacements = {
            'stuff': 'specific details',
            'things': 'key elements',
            'something': 'a concrete example',
            'anything': 'any relevant information',
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

    if (dims.constraint_completeness < 4) {
        if (!/\b(\d+\s*words?|\d+\s*sentences?|\d+\s*paragraphs?|brief|concise|keep it short|max\s+\d+|limit\s+to)\b/i.test(improved)) {
            const scope = _getDefaultScope(blueprint._intent ? blueprint._intent.taskType : 'general');
            appendToSection('CONSTRAINTS', scope.replace('Scope: ', ''));
            changes.push('Added explicit scope constraint');
        }
        if (!/\b(tone|style|formal|informal|casual|professional)\b/i.test(improved)) {
            appendToSection('CONSTRAINTS', 'Maintain a professional and informative tone.');
            changes.push('Added explicit tone constraint');
        }
    }

    if (dims.output_controllability < 4) {
        if (!/\b(format|structure|organize|present|respond as)\b/i.test(improved)) {
            appendToSection('CONSTRAINTS', `Format strictly as requested: ${blueprint.output_format}.`);
            changes.push('Reinforced output format specification');
        }
    }

    if (dims.ambiguity_risk > 3) {
        const quantReplacements = {
            'some': '3-5',
            'many': '5-7',
            'few': '2-3',
            'several': '4-6',
            'a lot': 'a comprehensive set',
        };
        for (const [vague, exact] of Object.entries(quantReplacements)) {
            const regex = new RegExp(`\\b${vague}\\b`, 'gi');
            if (regex.test(improved)) {
                improved = improved.replace(regex, exact);
                changes.push(`Replaced ambiguous "${vague}" with precise "${exact}"`);
            }
        }
    }

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

function _getDefaultScope(taskType) {
    return {
        plan: 'Scope: Break into 3-5 milestones with actionable sub-tasks.',
        story: 'Scope: Cover 3 acts with 3-5 scenes each.',
        content: 'Scope: Generate a full outline with 5-7 sections.',
        evaluate: 'Scope: Evaluate across 4-6 criteria, provide improved version.',
        explain: 'Scope: Keep the response between 150-300 words.',
        compare: 'Scope: Compare across 3-5 key criteria.',
        generate: 'Scope: Target 200-500 words.',
        summarize: 'Scope: Limit to 100-150 words.',
        analyze: 'Scope: Cover 3-4 key dimensions of analysis.',
        list: 'Scope: Provide exactly 5-7 items.',
        instruct: 'Scope: Use 5-10 clear steps.',
        code: 'Scope: Keep code under 50 lines with inline comments.',
        brainstorm: 'Scope: Generate 5-8 distinct ideas.',
        optimize: 'Scope: Identify top 3-5 improvements with implementation steps.',
        general: 'Scope: Keep under 300 words.',
    }[taskType] || 'Scope: Keep under 300 words.';
}

// ════════════════════════════════════════════════════════════════
//  "WHY THIS PROMPT WORKS" EXPLANATION
// ════════════════════════════════════════════════════════════════

function _buildExplanation(intent, blueprint, v1Score, v2, modelTarget, templateKey, llmUsed) {
    const profile = MODEL_PROFILES ? (MODEL_PROFILES[modelTarget] || {}) : {};
    const parts = [];

    parts.push(`**Template matched:** \`${templateKey}\` — Intent detected: ${intent.taskType} (${intent.domain}). ` +
        `${intent.subject ? `Subject: "${intent.subject}". ` : ''}` +
        `Control level: ${intent.controlLevel}. Output format: ${intent.outputFormat}.`);

    parts.push(`**Blueprint built** with ${blueprint.constraints.length} constraints tailored for ${_modelLabel(modelTarget)}. ` +
        `Role, context, task instruction, and output format were inferred and optimized for ${profile.name || modelTarget}.`);

    const modelNotes = {
        openai: 'OpenAI GPT benefits from explicit system roles, structured constraints, and step-by-step reasoning instructions.',
        anthropic: 'Claude excels with XML-tagged sections for clear boundaries, and responds well to thoughtful, well-organized instructions.',
        gemini: 'Gemini performs best when context/background comes before the task instruction, with evidence-based grounding.',
    };
    parts.push(`**Model optimization:** ${modelNotes[modelTarget] || modelNotes.openai}`);

    if (llmUsed) {
        parts.push(`**LLM-refined:** The template output was further refined by GPT-4o-mini for enhanced clarity and specificity (advanced mode).`);
    } else {
        parts.push(`**Generation method:** Template-based (zero LLM cost). ${v1Score ? `Template scored ${v1Score.overall.toFixed(1)}/5.0.` : 'No scoring pass performed.'}`);
    }

    if (v1Score && v2 && !llmUsed) {
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

module.exports = { generate, getCacheStats };
