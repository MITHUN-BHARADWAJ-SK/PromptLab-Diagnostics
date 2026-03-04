/**
 * PromptLab — Prompt Generator Service (v3 — Two-Stage Pipeline)
 *
 * Architecture (per PRD):
 *   Stage 0: AMBIGUITY DETECTOR  — score input 0–1, route decision
 *   Route A: Low Ambiguity  → Generator → Refiner → Final Prompt
 *   Route B: High Ambiguity → Analyzer (intent contract) → Generator → Final Prompt
 *
 * Strict role isolation:
 *   - Analyzer: resolves ambiguity, produces intent contract. Never generates prompts.
 *   - Generator: translates intent contract into model-specific prompt. Never infers intent.
 *   - Refiner: hardens an existing prompt. Never reinterprets or expands scope.
 *
 * Output rules:
 *   - Final output is ONLY the paste-ready prompt
 *   - No explanations, no metadata, no confidence scores
 *   - No markdown unless required by target model
 */

const { MODEL_PROFILES } = require('../config/scoring');

// ════════════════════════════════════════════════════════════════
//  CONSTANTS & PATTERNS
// ════════════════════════════════════════════════════════════════

const AMBIGUITY_THRESHOLD = 0.5;

// Multiple task verbs increase ambiguity
const TASK_VERB_PATTERNS = [
    /\b(explain|describe|define|clarify|elaborate|break down|teach)\b/i,
    /\b(write|create|generate|compose|draft|produce|make)\b/i,
    /\b(analyze|analyse|evaluate|assess|review|examine|critique)\b/i,
    /\b(compare|contrast|versus|vs\.?|difference)\b/i,
    /\b(summarize|summary|overview|recap|condense)\b/i,
    /\b(plan|schedule|roadmap|timeline|organize)\b/i,
    /\b(list|enumerate|name|identify|top \d+)\b/i,
    /\b(code|program|function|script|implement|debug)\b/i,
    /\b(brainstorm|suggest|recommend|ideas?|options?)\b/i,
    /\b(optimize|improve|enhance|refine|upgrade|boost)\b/i,
    /\b(instruct|how to|steps to|guide|tutorial|walk me through)\b/i,
];

// Hedge / soft language signals ambiguity
const HEDGE_PATTERNS = /\b(maybe|perhaps|possibly|might|could|something like|sort of|kind of|i guess|not sure|i think|whatever|anything|somehow|some kind of)\b/i;

// Conflicting constraint signals
const CONFLICT_SIGNALS = [
    { a: /\b(brief|short|concise)\b/i, b: /\b(detailed|comprehensive|thorough|exhaustive|in-depth)\b/i },
    { a: /\b(formal|professional)\b/i, b: /\b(casual|informal|friendly|fun)\b/i },
    { a: /\b(simple|basic)\b/i, b: /\b(advanced|complex|expert)\b/i },
];

// Task type detection patterns (single canonical task)
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

// Domain detection
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

// ════════════════════════════════════════════════════════════════
//  PUBLIC API
// ════════════════════════════════════════════════════════════════

/**
 * Generate a paste-ready, model-specific prompt using the two-stage pipeline.
 *
 * @param {Object} params
 * @param {string} params.promptText       Raw user input
 * @param {string} params.modelTarget      'openai' | 'anthropic' | 'gemini'
 * @param {Function} [params.analyzerFn]   Optional: PromptLabEngine.analyze (used for scoring, not routing)
 * @returns {Object} { finalPrompt, v1, v2, route, ambiguityScore }
 */
function generate({ promptText, modelTarget, analyzerFn = null }) {
    if (!promptText || typeof promptText !== 'string' || promptText.trim().length === 0) {
        return { error: 'Please enter a prompt to generate.' };
    }

    const text = promptText.trim();
    const model = modelTarget || 'openai';

    // ═══════════════════════════════════════════════════════════
    //  STAGE 0: AMBIGUITY DETECTION
    // ═══════════════════════════════════════════════════════════
    const ambiguity = _detectAmbiguity(text, model);

    let intentContract;
    let v1Prompt;
    let v2Prompt = null;

    if (ambiguity.route === 'analyze_first') {
        // ═══════════════════════════════════════════════════════
        //  ROUTE B: HIGH AMBIGUITY → Analyzer → Generator
        // ═══════════════════════════════════════════════════════
        intentContract = _analyzeIntent(text, model);
        v1Prompt = _generatePrompt(intentContract, model);

    } else {
        // ═══════════════════════════════════════════════════════
        //  ROUTE A: LOW AMBIGUITY → Generator → Refiner
        // ═══════════════════════════════════════════════════════
        intentContract = _buildDirectContract(text, model);
        v1Prompt = _generatePrompt(intentContract, model);
        v2Prompt = _refinePrompt(v1Prompt, intentContract, model);
    }

    const finalPrompt = v2Prompt || v1Prompt;

    return {
        finalPrompt,
        v1: v1Prompt,
        v2: v2Prompt,
        route: ambiguity.route,
        ambiguityScore: ambiguity.score,
        // Keep intent for internal debugging (not shown to user)
        _intent: intentContract,
    };
}

// ════════════════════════════════════════════════════════════════
//  STAGE 0: AMBIGUITY DETECTOR
// ════════════════════════════════════════════════════════════════

function _detectAmbiguity(text, modelTarget) {
    const lower = text.toLowerCase();
    let score = 0;
    const signals = [];

    // A. Multiple task verbs (each additional verb adds 0.15)
    let verbMatches = 0;
    for (const { patterns } of TASK_VERB_PATTERNS) {
        if (patterns[0].test(lower)) verbMatches++;
    }
    if (verbMatches > 1) {
        const penalty = Math.min((verbMatches - 1) * 0.15, 0.45);
        score += penalty;
        signals.push(`${verbMatches} competing task verbs detected`);
    }

    // B. Hedge / soft language (0.2)
    if (HEDGE_PATTERNS.test(lower)) {
        score += 0.2;
        signals.push('Hedge/soft language detected');
    }

    // C. Very short input — likely incomplete (0.15)
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 5) {
        score += 0.15;
        signals.push('Very short input (< 5 words)');
    }

    // D. No clear subject or object (0.1)
    const hasSubject = /\b(about|for|on|regarding|of)\s+\w+/i.test(text) ||
        /\b(write|create|build|make|explain|analyze|plan|code)\s+\w+/i.test(text);
    if (!hasSubject && wordCount < 10) {
        score += 0.1;
        signals.push('No clear subject identified');
    }

    // E. Conflicting constraints (0.2 per conflict)
    for (const { a, b } of CONFLICT_SIGNALS) {
        if (a.test(lower) && b.test(lower)) {
            score += 0.2;
            signals.push('Conflicting constraints detected');
        }
    }

    // F. Vague quantifiers without specifics (0.1)
    if (/\b(some|a few|many|several|a lot of|various)\b/i.test(lower) &&
        !/\b\d+\b/.test(text)) {
        score += 0.1;
        signals.push('Vague quantifiers without specifics');
    }

    score = Math.min(score, 1.0);

    return {
        score: Math.round(score * 100) / 100,
        route: score >= AMBIGUITY_THRESHOLD ? 'analyze_first' : 'generate_first',
        signals,
    };
}

// ════════════════════════════════════════════════════════════════
//  STAGE 1A: INTENT ANALYZER (high ambiguity path)
// ════════════════════════════════════════════════════════════════

/**
 * Resolve ambiguity into a clean intent contract.
 * Rules:
 *   - May infer missing details
 *   - May resolve conflicts (choose dominant interpretation)
 *   - Must NOT ask questions
 *   - Must NOT generate prompts
 */
function _analyzeIntent(text, modelTarget) {
    const lower = text.toLowerCase();
    const wordCount = text.split(/\s+/).length;

    // 1. Determine the SINGLE dominant task type
    let taskType = 'general';
    let maxPatternLength = 0;
    for (const { task, patterns } of TASK_PATTERNS) {
        for (const p of patterns) {
            const match = lower.match(p);
            if (match && match[0].length > maxPatternLength) {
                taskType = task;
                maxPatternLength = match[0].length;
            }
        }
    }

    // 2. Extract primary goal
    const goalPatterns = [
        /\b(?:i want|i need|i'd like|goal is|trying to|hoping to|looking to|help me)\s+(.{5,120}?)(?:\.|$|,|\?)/i,
        /\b(?:create|write|build|make|generate|produce)\s+(.{3,100}?)(?:\.|$|,|\?)/i,
    ];
    let primaryGoal = '';
    for (const p of goalPatterns) {
        const match = text.match(p);
        if (match) {
            primaryGoal = match[1].trim();
            break;
        }
    }
    if (!primaryGoal) {
        primaryGoal = _extractSubject(text, lower);
    }

    // 3. Extract must_include signals
    const mustInclude = [];
    const includePatterns = [
        /\b(?:include|must have|should have|with|containing|featuring|make sure|ensure)\s+(.{3,80}?)(?:\.|$|,|and\b)/gi,
    ];
    for (const p of includePatterns) {
        let match;
        while ((match = p.exec(text)) !== null) {
            const item = match[1].trim();
            if (item.length > 2 && item.length < 80) mustInclude.push(item);
        }
    }

    // 4. Extract must_exclude signals
    const mustExclude = [];
    const excludePatterns = [
        /\b(?:don't|do not|avoid|without|no\s|exclude|skip|never)\s+(.{3,60}?)(?:\.|$|,)/gi,
    ];
    for (const p of excludePatterns) {
        let match;
        while ((match = p.exec(text)) !== null) {
            const item = match[1].trim();
            if (item.length > 2 && item.length < 60) mustExclude.push(item);
        }
    }

    // 5. Build assumptions for anything that was inferred
    const assumptions = [];

    // Infer audience
    let audience = 'general';
    if (/\b(beginner|simple|basic|eli5)\b/i.test(lower)) { audience = 'beginner'; }
    else if (/\b(expert|advanced|senior|specialist|professional)\b/i.test(lower)) { audience = 'expert'; }
    else if (/\b(student|learner|undergrad)\b/i.test(lower)) { audience = 'student'; }
    else if (/\b(developer|programmer|engineer)\b/i.test(lower)) { audience = 'developer'; }

    if (audience === 'general') {
        assumptions.push('Audience: assumed general/moderate knowledge level');
    }

    // Infer depth
    let depth = 'moderate';
    if (/\b(brief|quick|short|concise|overview|tldr)\b/i.test(lower)) depth = 'surface';
    else if (/\b(detailed|comprehensive|thorough|deep dive|exhaustive)\b/i.test(lower)) depth = 'deep';
    else if (wordCount < 8) { depth = 'moderate'; assumptions.push('Depth: assumed moderate (short input)'); }

    // Infer tone
    let tone = 'professional';
    if (/\b(casual|friendly|fun|conversational)\b/i.test(lower)) tone = 'casual';
    else if (/\b(academic|scholarly|formal)\b/i.test(lower)) tone = 'academic';
    else if (/\b(technical)\b/i.test(lower)) tone = 'technical';
    else { assumptions.push('Tone: assumed professional'); }

    // Infer domain
    let domain = 'General';
    for (const { domain: d, patterns } of DOMAIN_PATTERNS) {
        if (patterns.some(p => p.test(lower))) { domain = d; break; }
    }

    // Resolve conflicts: if both "brief" and "detailed", choose explicit over hedge
    if (/\b(brief|concise)\b/i.test(lower) && /\b(detailed|comprehensive)\b/i.test(lower)) {
        depth = 'moderate';
        assumptions.push('Conflict resolved: mixed depth signals, chose moderate');
    }

    return {
        task_type: taskType,
        target_model: modelTarget,
        primary_goal: primaryGoal,
        domain,
        audience,
        depth,
        tone,
        must_include: mustInclude,
        must_exclude: mustExclude,
        assumptions,
        output_expectation: 'single paste-ready prompt',
    };
}

// ════════════════════════════════════════════════════════════════
//  DIRECT CONTRACT BUILDER (low ambiguity — no full analysis)
// ════════════════════════════════════════════════════════════════

function _buildDirectContract(text, modelTarget) {
    const lower = text.toLowerCase();
    const wordCount = text.split(/\s+/).length;

    let taskType = 'general';
    for (const { task, patterns } of TASK_PATTERNS) {
        if (patterns.some(p => p.test(lower))) { taskType = task; break; }
    }

    let domain = 'General';
    for (const { domain: d, patterns } of DOMAIN_PATTERNS) {
        if (patterns.some(p => p.test(lower))) { domain = d; break; }
    }

    let audience = 'general';
    if (/\b(beginner|simple|basic|eli5)\b/i.test(lower)) audience = 'beginner';
    else if (/\b(expert|advanced|senior|professional)\b/i.test(lower)) audience = 'expert';
    else if (/\b(developer|programmer|engineer)\b/i.test(lower)) audience = 'developer';

    let depth = 'moderate';
    if (/\b(brief|quick|short|concise)\b/i.test(lower)) depth = 'surface';
    else if (/\b(detailed|comprehensive|thorough)\b/i.test(lower)) depth = 'deep';
    else if (wordCount > 30) depth = 'deep';

    const mustInclude = [];
    const includeMatch = text.match(/\b(?:include|must have|with|featuring|ensure)\s+(.{3,80}?)(?:\.|$|,)/gi);
    if (includeMatch) {
        includeMatch.forEach(m => {
            const cleaned = m.replace(/^(include|must have|with|featuring|ensure)\s+/i, '').trim();
            if (cleaned.length > 2) mustInclude.push(cleaned);
        });
    }

    const mustExclude = [];
    const excludeMatch = text.match(/\b(?:don't|do not|avoid|without|no\s|exclude)\s+(.{3,60}?)(?:\.|$|,)/gi);
    if (excludeMatch) {
        excludeMatch.forEach(m => {
            const cleaned = m.replace(/^(don't|do not|avoid|without|no|exclude)\s+/i, '').trim();
            if (cleaned.length > 2) mustExclude.push(cleaned);
        });
    }

    return {
        task_type: taskType,
        target_model: modelTarget,
        primary_goal: _extractSubject(text, lower),
        domain,
        audience,
        depth,
        tone: 'professional',
        must_include: mustInclude,
        must_exclude: mustExclude,
        assumptions: [],
        output_expectation: 'single paste-ready prompt',
        _originalText: text,
    };
}

// ════════════════════════════════════════════════════════════════
//  STAGE 1B: PROMPT GENERATOR (model-specific)
// ════════════════════════════════════════════════════════════════

/**
 * Translate a clean intent contract into a model-accurate, optimized prompt.
 * Rules:
 *   - No intent inference
 *   - No ambiguity resolution
 *   - No explanation
 *   - No reviewer tone
 *   - No optionality
 */
function _generatePrompt(contract, modelTarget) {
    switch (modelTarget) {
        case 'openai': return _generateForOpenAI(contract);
        case 'anthropic': return _generateForClaude(contract);
        case 'gemini': return _generateForGemini(contract);
        default: return _generateForOpenAI(contract);
    }
}

// ── OpenAI GPT: System-role framing ─────────────────────────────

function _generateForOpenAI(c) {
    const parts = [];

    // Role
    parts.push(`# Role`);
    parts.push(_buildRole(c, 'openai'));
    parts.push('');

    // Task
    parts.push(`# Task`);
    parts.push(_buildTaskLine(c));
    parts.push('');

    // Context
    const context = _buildContext(c);
    if (context) {
        parts.push(`# Context`);
        parts.push(context);
        parts.push('');
    }

    // Instructions
    parts.push(`# Instructions`);
    const instructions = _buildInstructions(c, 'openai');
    instructions.forEach(inst => parts.push(`- ${inst}`));
    parts.push('');

    // Constraints
    const constraints = _buildConstraintLines(c, 'openai');
    if (constraints.length > 0) {
        parts.push(`# Constraints`);
        constraints.forEach(con => parts.push(`- ${con}`));
        parts.push('');
    }

    // Output format
    parts.push(`# Output`);
    parts.push(_buildOutputSpec(c, 'openai'));

    return parts.join('\n').trim();
}

// ── Anthropic Claude: XML-tagged sections ───────────────────────

function _generateForClaude(c) {
    const parts = [];

    // Role
    parts.push(`<role>`);
    parts.push(_buildRole(c, 'anthropic'));
    parts.push(`</role>`);
    parts.push('');

    // Task
    parts.push(`<task>`);
    parts.push(_buildTaskLine(c));
    parts.push(`</task>`);
    parts.push('');

    // Context
    const context = _buildContext(c);
    if (context) {
        parts.push(`<context>`);
        parts.push(context);
        parts.push(`</context>`);
        parts.push('');
    }

    // Instructions with thinking step
    parts.push(`<instructions>`);
    parts.push('Think through this carefully before responding.');
    const instructions = _buildInstructions(c, 'anthropic');
    instructions.forEach(inst => parts.push(`- ${inst}`));
    parts.push(`</instructions>`);
    parts.push('');

    // Constraints (explicit scope boundaries)
    const constraints = _buildConstraintLines(c, 'anthropic');
    if (constraints.length > 0) {
        parts.push(`<constraints>`);
        constraints.forEach(con => parts.push(`- ${con}`));
        parts.push(`</constraints>`);
        parts.push('');
    }

    // Output
    parts.push(`<output>`);
    parts.push(_buildOutputSpec(c, 'anthropic'));
    parts.push(`</output>`);

    return parts.join('\n').trim();
}

// ── Google Gemini: Context-first, direct commands ───────────────

function _generateForGemini(c) {
    const parts = [];

    // Context FIRST (Gemini best practice)
    const context = _buildContext(c);
    if (context) {
        parts.push(`**Context:**`);
        parts.push(context);
        parts.push('');
    }

    // Role
    parts.push(`**Role:** ${_buildRole(c, 'gemini')}`);
    parts.push('');

    // Direct task command
    parts.push(`**Task:** ${_buildTaskLine(c)}`);
    parts.push('');

    // Instructions with grounding
    parts.push(`**Instructions:**`);
    const instructions = _buildInstructions(c, 'gemini');
    instructions.forEach(inst => parts.push(`- ${inst}`));
    parts.push('');

    // Constraints
    const constraints = _buildConstraintLines(c, 'gemini');
    if (constraints.length > 0) {
        parts.push(`**Constraints:**`);
        constraints.forEach(con => parts.push(`- ${con}`));
        parts.push('');
    }

    // Output
    parts.push(`**Output:** ${_buildOutputSpec(c, 'gemini')}`);

    return parts.join('\n').trim();
}

// ════════════════════════════════════════════════════════════════
//  PROMPT COMPONENT BUILDERS
// ════════════════════════════════════════════════════════════════

function _buildRole(contract, model) {
    const goal = contract.primary_goal || 'this domain';
    const domain = contract.domain !== 'General' ? contract.domain : null;

    const roleTemplates = {
        plan: {
            openai: `You are a strategic planning expert specializing in structured, time-bound action plans${domain ? ` for ${domain}` : ''}.`,
            anthropic: `You are a methodical planning strategist who breaks complex goals into actionable, prioritized milestones${domain ? ` within ${domain}` : ''}.`,
            gemini: `You are a planning specialist who creates evidence-based, execution-ready action plans${domain ? ` in ${domain}` : ''}.`,
        },
        story: {
            openai: `You are a master storyteller and narrative architect with deep expertise in structure, pacing, and character development.`,
            anthropic: `You are an experienced creative writing mentor who crafts compelling narratives with rich character arcs and emotional resonance.`,
            gemini: `You are a narrative design expert who creates engaging stories with clear structure, vivid characters, and meaningful themes.`,
        },
        content: {
            openai: `You are a senior content strategist and copywriter with 10+ years of experience in audience-targeted, SEO-optimized content creation.`,
            anthropic: `You are a content strategy expert who creates compelling, well-researched content optimized for both readers and search engines.`,
            gemini: `You are a content marketing specialist who produces data-driven, audience-aware content with strong SEO foundations.`,
        },
        code: {
            openai: `You are a senior software engineer who writes clean, well-documented, production-ready code with comprehensive error handling.`,
            anthropic: `You are an experienced developer who writes robust, well-tested code with clear documentation and thoughtful design.`,
            gemini: `You are a software engineering expert who produces clean, efficient, well-commented code following current best practices.`,
        },
        explain: {
            openai: `You are an expert educator in ${goal} who excels at making complex topics accessible through clear structure and practical examples.`,
            anthropic: `You are a knowledgeable instructor who explains ${goal} with clarity, precision, and well-chosen illustrative examples.`,
            gemini: `You are a subject matter expert in ${goal} who provides clear, structured explanations grounded in current knowledge.`,
        },
        analyze: {
            openai: `You are a senior analyst with deep expertise in ${goal}, skilled at multi-dimensional analysis and evidence-based conclusions.`,
            anthropic: `You are a thorough analyst who examines ${goal} from multiple perspectives with balanced, well-supported findings.`,
            gemini: `You are an analytical expert in ${goal} who provides structured, evidence-based analysis with actionable insights.`,
        },
        compare: {
            openai: `You are a research analyst specializing in objective, criteria-driven comparisons with expertise in ${goal}.`,
            anthropic: `You are an analytical comparator who provides balanced, evidence-based assessments of ${goal}.`,
            gemini: `You are a comparative analyst who evaluates ${goal} across well-defined criteria with supporting evidence.`,
        },
        brainstorm: {
            openai: `You are a creative strategist and innovation consultant skilled at generating diverse, unconventional ideas for ${goal}.`,
            anthropic: `You are an ideation specialist who generates creative, practical solutions for ${goal} across multiple dimensions.`,
            gemini: `You are a creative problem solver who brainstorms diverse, feasible approaches to ${goal}.`,
        },
        optimize: {
            openai: `You are an optimization specialist focused on identifying inefficiencies in ${goal} and implementing measurable improvements.`,
            anthropic: `You are a systematic improvement consultant who identifies weaknesses in ${goal} and proposes evidence-based optimizations.`,
            gemini: `You are an efficiency expert who analyzes ${goal} to find optimization opportunities with clear implementation steps.`,
        },
        evaluate: {
            openai: `You are a critical analyst who systematically evaluates ${goal} using structured criteria to identify strengths and weaknesses.`,
            anthropic: `You are a systematic evaluator who provides balanced, evidence-based assessments with clear improvement pathways.`,
            gemini: `You are an analytical reviewer who applies structured evaluation frameworks to produce measurable improvements.`,
        },
        summarize: {
            openai: `You are a precision summarizer who distills complex information about ${goal} into clear, essential takeaways.`,
            anthropic: `You are a skilled synthesizer who condenses ${goal} into accurate, well-organized summaries without losing critical nuance.`,
            gemini: `You are a concise summarizer who extracts and organizes the key points from ${goal} with factual accuracy.`,
        },
        instruct: {
            openai: `You are a clear, step-by-step instructor who creates actionable guides for ${goal} that anyone can follow.`,
            anthropic: `You are an expert tutor who delivers precise, sequenced instructions for ${goal} with clear success criteria.`,
            gemini: `You are a practical instructor who creates evidence-based, executable guides for ${goal}.`,
        },
        list: {
            openai: `You are a research-backed curator who creates prioritized, well-organized lists relevant to ${goal}.`,
            anthropic: `You are a systematic compiler who produces accurate, well-categorized lists for ${goal}.`,
            gemini: `You are a fact-based list curator who identifies and organizes the most relevant items for ${goal}.`,
        },
        generate: {
            openai: `You are a skilled content creator with expertise in ${goal}, known for producing engaging, well-structured output.`,
            anthropic: `You are a creative professional who produces high-quality, thoughtfully crafted content about ${goal}.`,
            gemini: `You are a content generation specialist who creates well-organized, audience-appropriate material on ${goal}.`,
        },
    };

    const defaults = {
        openai: `You are a highly capable expert assistant specialized in ${goal}.`,
        anthropic: `You are a knowledgeable assistant with deep expertise in ${goal}, focused on accuracy and clarity.`,
        gemini: `You are an expert assistant who provides well-structured, evidence-based responses about ${goal}.`,
    };

    const templates = roleTemplates[contract.task_type] || defaults;
    return templates[model] || templates.openai;
}

function _buildTaskLine(contract) {
    const taskVerbs = {
        plan: 'Create a comprehensive, actionable plan for',
        story: 'Write a compelling',
        content: 'Create optimized content for',
        evaluate: 'Evaluate and systematically improve',
        explain: 'Provide a clear, structured explanation of',
        compare: 'Create a detailed, criteria-driven comparison of',
        generate: 'Write',
        summarize: 'Provide a concise, structured summary of',
        analyze: 'Conduct a thorough, multi-dimensional analysis of',
        list: 'Create a curated, prioritized list of',
        instruct: 'Provide clear, step-by-step instructions for',
        code: 'Implement',
        brainstorm: 'Generate diverse, actionable ideas for',
        optimize: 'Analyze and optimize',
        general: 'Provide a precise, well-structured response about',
    };

    const verb = taskVerbs[contract.task_type] || taskVerbs.general;
    const goal = contract.primary_goal || contract._originalText || 'the specified topic';
    return `${verb} ${goal}.`;
}

function _buildContext(contract) {
    const parts = [];

    if (contract.domain && contract.domain !== 'General') {
        parts.push(`Domain: ${contract.domain}.`);
    }

    if (contract.audience && contract.audience !== 'general') {
        const audienceDesc = {
            beginner: 'The target audience is beginners with limited prior knowledge.',
            student: 'The target audience is students with foundational knowledge.',
            expert: 'The target audience is experts who expect depth and technical precision.',
            developer: 'The target audience is developers who expect code examples and technical details.',
        };
        parts.push(audienceDesc[contract.audience] || '');
    }

    if (contract.assumptions && contract.assumptions.length > 0) {
        parts.push(`Working assumptions: ${contract.assumptions.join('; ')}.`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
}

function _buildInstructions(contract, model) {
    const instructions = [];
    const goal = contract.primary_goal || 'the request';

    // Core task instructions
    switch (contract.task_type) {
        case 'plan':
            instructions.push('Break the plan into numbered phases with specific action items and deadlines');
            instructions.push('Assign priority levels (high/medium/low) to each action item');
            instructions.push('Include measurable success criteria for each milestone');
            break;
        case 'story':
            instructions.push('Establish setting, characters, and central conflict immediately');
            instructions.push('Maintain consistent narrative voice and emotional pacing');
            instructions.push('Resolve with a satisfying conclusion that ties back to the central theme');
            break;
        case 'content':
            instructions.push('Open with a compelling hook that captures reader attention');
            instructions.push('Structure with clear headings and scannable sections');
            instructions.push('Include specific data points, examples, or quotes to support claims');
            break;
        case 'code':
            instructions.push('Write clean, production-ready code with inline comments');
            instructions.push('Include error handling and edge case coverage');
            instructions.push('Follow the language\'s idiomatic conventions and best practices');
            break;
        case 'explain':
            instructions.push(`Define core concepts clearly before building complexity`);
            instructions.push('Use concrete examples to illustrate abstract ideas');
            instructions.push('Connect new concepts to familiar knowledge when possible');
            break;
        case 'compare':
            instructions.push('Define comparison criteria explicitly before comparing');
            instructions.push('Present balanced evidence for each option across all criteria');
            instructions.push('Conclude with a clear synthesis or recommendation');
            break;
        case 'analyze':
            instructions.push('Examine the subject across multiple relevant dimensions');
            instructions.push('Support each finding with specific evidence or data');
            instructions.push('Distinguish between facts, inferences, and opinions');
            break;
        case 'brainstorm':
            instructions.push('Generate ideas across multiple categories and perspectives');
            instructions.push('Include both conventional and unconventional approaches');
            instructions.push('For each idea, note feasibility and potential impact');
            break;
        case 'optimize':
            instructions.push('Identify the top inefficiencies or bottlenecks first');
            instructions.push('Provide specific, implementable improvement steps for each');
            instructions.push('Estimate the expected impact of each optimization');
            break;
        case 'summarize':
            instructions.push('Capture the core thesis and key supporting points');
            instructions.push('Preserve critical nuance without unnecessary detail');
            instructions.push('Organize the summary in logical order, not source order');
            break;
        case 'evaluate':
            instructions.push('Apply consistent evaluation criteria across all items');
            instructions.push('Provide specific evidence for each rating or judgment');
            instructions.push('Include actionable improvement recommendations');
            break;
        case 'instruct':
            instructions.push('Number each step sequentially with clear action verbs');
            instructions.push('Include expected outcomes or checkpoints at key stages');
            instructions.push('Anticipate common mistakes and include warnings');
            break;
        case 'list':
            instructions.push('Order items by relevance or priority, not arbitrarily');
            instructions.push('Include a brief explanation for why each item is included');
            break;
        default:
            instructions.push(`Address ${goal} directly and completely`);
            instructions.push('Organize the response with clear logical structure');
            break;
    }

    // Must-include items
    if (contract.must_include && contract.must_include.length > 0) {
        contract.must_include.forEach(item => {
            instructions.push(`Include: ${item}`);
        });
    }

    // Model-specific instruction enhancements
    if (model === 'openai') {
        instructions.push('Follow all stated constraints precisely with no deviation');
    } else if (model === 'anthropic') {
        instructions.push('Maintain accuracy, balance, and factual correctness throughout');
    } else if (model === 'gemini') {
        instructions.push('Ground your response in current best practices and verified information');
    }

    return instructions;
}

function _buildConstraintLines(contract, model) {
    const constraints = [];

    // Must-exclude items
    if (contract.must_exclude && contract.must_exclude.length > 0) {
        contract.must_exclude.forEach(item => {
            constraints.push(`Do not ${item}`);
        });
    }

    // Depth constraints
    if (contract.depth === 'surface') {
        constraints.push('Keep the response brief and focused on essentials only');
    } else if (contract.depth === 'deep') {
        constraints.push('Provide comprehensive, in-depth coverage with thorough explanations');
    }

    // Tone constraints
    if (contract.tone && contract.tone !== 'professional') {
        constraints.push(`Tone: ${contract.tone}`);
    }

    // Audience-adaptive language
    if (contract.audience === 'beginner') {
        constraints.push('Use simple language, avoid jargon, explain any technical terms');
    } else if (contract.audience === 'expert') {
        constraints.push('Use technical terminology freely, focus on depth over breadth');
    }

    // Scope constraints based on task type
    const scopeMap = {
        plan: 'Organize into 3–5 phases with actionable sub-tasks',
        story: 'Structure into beginning, middle, and end with clear narrative arc',
        content: 'Structure with 5–7 scannable sections',
        evaluate: 'Evaluate across 4–6 distinct criteria',
        explain: 'Keep between 150–300 words unless deeper coverage is requested',
        compare: 'Compare across 3–5 key criteria in a structured format',
        summarize: 'Limit to 100–150 words unless specified otherwise',
        list: 'Provide exactly 5–7 items unless a specific count is requested',
        instruct: 'Use 5–10 clear, numbered steps',
        code: 'Keep code under 50 lines with inline comments',
        brainstorm: 'Generate 5–8 distinct ideas',
        optimize: 'Identify top 3–5 improvements with implementation steps',
    };
    if (scopeMap[contract.task_type]) {
        constraints.push(scopeMap[contract.task_type]);
    }

    // Model-specific structural constraints
    if (model === 'openai') {
        constraints.push('Strictly follow all formatting rules and output structure');
    } else if (model === 'anthropic') {
        constraints.push('Maintain high-level structural integrity; avoid excessive nesting');
        constraints.push('Ensure accuracy and balanced perspective');
    } else if (model === 'gemini') {
        constraints.push('Lead with the most important information first');
    }

    return constraints;
}

function _buildOutputSpec(contract, model) {
    const formatMap = {
        plan: {
            openai: 'Respond as a structured timeline with numbered phases, each containing specific action items, deadlines, and priority levels.',
            anthropic: 'Present as clearly numbered phases, each starting with an action verb and including expected outcomes.',
            gemini: 'Respond as a structured plan with phases, tasks, and milestones in a clear hierarchical format.',
        },
        story: {
            openai: 'Respond as a flowing narrative with clear paragraph breaks and engaging language.',
            anthropic: 'Write in clear, engaging prose with logical flow and precise language.',
            gemini: 'Write a well-organized narrative with clear structure and vivid detail.',
        },
        content: {
            openai: 'Respond in structured markdown with H2 headings, bullet points, and bold key terms.',
            anthropic: 'Respond with concise sections organized under clear headings with actionable content.',
            gemini: 'Respond with organized sections, headers, and bullet points using clear formatting.',
        },
        code: {
            openai: 'Respond with clean, well-commented code in a fenced code block. Add a brief usage example.',
            anthropic: 'Provide well-documented code with error handling. Include design rationale in code comments.',
            gemini: 'Provide clean, efficient code with inline comments and a structured explanation of key logic.',
        },
        compare: {
            openai: 'Respond as a well-formatted markdown comparison table with clear column headers and data rows.',
            anthropic: 'Present as a structured comparison with clear dimensions and balanced assessment.',
            gemini: 'Present as a well-structured table with clear criteria columns and supporting evidence.',
        },
        explain: {
            openai: 'Respond with a clear explanation followed by a concrete, practical example.',
            anthropic: 'Provide a clear explanation with a well-chosen illustrative example.',
            gemini: 'Provide a structured explanation with practical examples and supporting evidence.',
        },
        summarize: {
            openai: 'Respond as a concise summary with key takeaways in bullet points.',
            anthropic: 'Provide a clean, concise summary preserving all critical nuance.',
            gemini: 'Respond with a structured summary highlighting the most important findings.',
        },
        list: {
            openai: 'Respond as a numbered list with a one-line description per item.',
            anthropic: 'Provide a clean, prioritized list with concise explanations.',
            gemini: 'Respond as an organized, fact-based list with brief supporting context per item.',
        },
        analyze: {
            openai: 'Respond in structured sections covering each dimension of analysis with evidence.',
            anthropic: 'Present findings in organized sections with balanced assessment and supporting data.',
            gemini: 'Respond with structured analysis covering key dimensions with evidence-based conclusions.',
        },
        brainstorm: {
            openai: 'Respond as a numbered list of distinct ideas, each with a one-sentence rationale.',
            anthropic: 'Provide categorized ideas with brief feasibility notes for each.',
            gemini: 'Respond as a structured list of ideas organized by category with impact estimates.',
        },
        instruct: {
            openai: 'Respond as numbered steps, each beginning with an action verb.',
            anthropic: 'Present as clearly numbered steps with expected outcomes at key checkpoints.',
            gemini: 'Respond as a structured guide with numbered steps and practical tips.',
        },
        optimize: {
            openai: 'Respond with prioritized improvements, each with specific implementation steps.',
            anthropic: 'Present improvements in order of impact with evidence-based rationale.',
            gemini: 'Respond with a ranked list of optimizations, each with clear implementation actions.',
        },
        evaluate: {
            openai: 'Respond with a structured evaluation covering each criterion with specific evidence.',
            anthropic: 'Present balanced evaluations per criterion with improvement recommendations.',
            gemini: 'Respond with a criteria-based evaluation matrix with supporting evidence.',
        },
    };

    const defaults = {
        openai: 'Respond in structured, well-organized markdown.',
        anthropic: 'Respond with clear organization and precise language.',
        gemini: 'Respond with well-structured formatting grounded in evidence.',
    };

    const templates = formatMap[contract.task_type] || defaults;
    return templates[model] || templates.openai;
}

// ════════════════════════════════════════════════════════════════
//  STAGE 2: PROMPT REFINER (low ambiguity path only)
// ════════════════════════════════════════════════════════════════

/**
 * Tighten and harden an already generated prompt.
 * Allowed: remove ambiguity, harden constraints, improve formatting, enforce model syntax
 * Forbidden: reinterpret intent, add features, expand scope, change task type
 */
function _refinePrompt(prompt, contract, modelTarget) {
    let refined = prompt;
    let changed = false;

    // 1. Replace vague quantifiers with precise ones
    const vagueReplacements = {
        'some': '3–5',
        'many': '5–7',
        'few': '2–3',
        'several': '4–6',
        'a lot of': 'a comprehensive set of',
        'stuff': 'specific details',
        'things': 'key elements',
        'something': 'a concrete example',
        'anything': 'any relevant information',
        'whatever': 'the most effective approach',
    };
    for (const [vague, precise] of Object.entries(vagueReplacements)) {
        const regex = new RegExp(`\\b${vague}\\b`, 'gi');
        if (regex.test(refined)) {
            refined = refined.replace(regex, precise);
            changed = true;
        }
    }

    // 2. Ensure prompt ends cleanly (no trailing whitespace or incomplete sentences)
    refined = refined.trim();
    if (refined.endsWith(',') || refined.endsWith(' and') || refined.endsWith(' or')) {
        refined = refined.replace(/[,]\s*$/, '.').replace(/\s+(and|or)\s*$/, '.');
        changed = true;
    }

    // 3. Model-specific syntax enforcement
    if (modelTarget === 'openai') {
        // Ensure # headers are used consistently
        if (!refined.includes('# ')) {
            // Convert bold markers to headers if present
            refined = refined.replace(/^\*\*([^*]+)\*\*:?\s*$/gm, '# $1');
            changed = true;
        }
    } else if (modelTarget === 'anthropic') {
        // Ensure XML tags are properly closed
        const openTags = refined.match(/<(\w+)>/g) || [];
        const closeTags = refined.match(/<\/(\w+)>/g) || [];
        if (openTags.length !== closeTags.length) {
            // Find unclosed tags and close them
            for (const tag of openTags) {
                const tagName = tag.replace(/[<>]/g, '');
                const closeTag = `</${tagName}>`;
                if (!refined.includes(closeTag)) {
                    refined += `\n${closeTag}`;
                    changed = true;
                }
            }
        }
    } else if (modelTarget === 'gemini') {
        // Ensure context appears before task (Gemini best practice)
        const contextIdx = refined.indexOf('**Context:**');
        const taskIdx = refined.indexOf('**Task:**');
        if (contextIdx > -1 && taskIdx > -1 && contextIdx > taskIdx) {
            // Context should come before task — already enforced in generation
            // but double-check here
            const contextBlock = refined.match(/\*\*Context:\*\*[\s\S]*?(?=\*\*\w+:\*\*|$)/);
            if (contextBlock) {
                refined = refined.replace(contextBlock[0], '');
                refined = contextBlock[0].trim() + '\n\n' + refined.trim();
                changed = true;
            }
        }
    }

    // 4. Remove any accidental explanation leakage
    const leakagePatterns = [
        /\b(Note:|NB:|Explanation:|Here's why|The reason|I chose|This works because)\b.*$/gm,
        /\b(Let me know|Feel free to|Hope this helps|If you need)\b.*$/gm,
    ];
    for (const pattern of leakagePatterns) {
        if (pattern.test(refined)) {
            refined = refined.replace(pattern, '').trim();
            changed = true;
        }
    }

    return changed ? refined : null; // Return null if no refinement was needed
}

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════

function _extractSubject(text, lower) {
    const verbSubject = text.match(/\b(?:explain|describe|summarize|compare|analyze|write|create|list|review|evaluate|implement|build|define|discuss|teach|outline|critique|plan|schedule|generate|optimize|improve)\s+(?:a\s+|an\s+|the\s+)?(?:concept\s+of\s+|basics\s+of\s+|fundamentals\s+of\s+|principles\s+of\s+)?(.{3,80}?)(?:\.|,|\?|$|\bfor\b|\bin\b|\bto\b|\busing\b|\bwith\b|\bkeeping\b)/i);
    if (verbSubject) {
        return verbSubject[1].trim().replace(/\b(some|a|an)\b/gi, '').trim();
    }

    const aboutMatch = text.match(/\b(?:about|regarding|on|related to|concerning)\s+(.{3,60}?)(?:\.|,|\?|$|\band\b|\bwith\b|\bthat\b|\bwhich\b)/i);
    if (aboutMatch) {
        return aboutMatch[1].trim().replace(/\b(some|the|a|an)\b/gi, '').trim();
    }

    // Fallback: first meaningful phrase
    const words = text.split(/\s+/).filter(w => w.length > 3);
    const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should', 'about', 'into', 'them', 'then', 'than', 'also', 'just', 'like', 'make', 'more', 'most', 'only', 'very', 'when', 'what', 'your', 'help']);
    const candidates = words.filter(w => !stopWords.has(w.toLowerCase()));
    if (candidates.length > 0) return candidates.slice(0, 5).join(' ');

    return text.substring(0, 40).trim();
}

module.exports = { generate };
