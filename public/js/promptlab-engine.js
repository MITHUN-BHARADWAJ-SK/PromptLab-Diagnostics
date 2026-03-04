/**
 * PromptLab Engine — Browser Bundle (Auto-generated)
 * Contains: scoring config, blueprints, analyzer service, generator service
 * DO NOT EDIT — regenerate via: node build-engine.js
 */
(function(global) {
'use strict';

// ── Module system shim ──────────────────────────────────────
const _modules = {};
const _exports = {};

function _require(name) {
    if (_exports[name]) return _exports[name];
    if (_modules[name]) {
        const mod = { exports: {} };
        _modules[name](mod, mod.exports, _require);
        _exports[name] = mod.exports;
        return mod.exports;
    }
    // Fallback for unknown modules
    console.warn('[PromptLab Engine] Unknown require:', name);
    return {};
}

// ── Tiers Config ─────────────────────────────────────────────
_modules['../config/tiers'] = function(module, exports, require) {
/**
 * PromptLab — Subscription Tier Definitions
 *
 * Each tier defines feature gates and daily quotas.
 * Add new tiers here; the middleware reads from this map.
 */

const TIERS = {
    free: {
        name: 'Free',
        dailyAnalysisLimit: 10,
        features: {
            crossModelAnalysis: false,     // single-model only
            fullBreakdowns: false,         // summary-level explanations
            historyInsights: false,        // no trend / mistake aggregation
        },
    },
    pro: {
        name: 'Pro',
        dailyAnalysisLimit: 200,
        features: {
            crossModelAnalysis: true,
            fullBreakdowns: true,
            historyInsights: true,
        },
    },
};

module.exports = TIERS;

};
_modules['./tiers'] = _modules['../config/tiers'];

// ── scoring.js ──────────────────────────────────────
_modules['../config/scoring'] = function(module, exports, require) {
/**
 * PromptLab — Scoring Configuration (v2 — Model-Specific)
 *
 * Defines the five evaluation dimensions, model-specific weights,
 * anti-patterns, bonus patterns, and output format configuration.
 *
 * Each model (OpenAI, Anthropic, Gemini) has its own tuned profile.
 */

// ── Dimension Definitions ──────────────────────────────────────────
const DIMENSIONS = {
    intent_clarity: {
        label: 'Intent Clarity',
        description: 'How clear and unambiguous the prompt\'s core intent is.',
        maxScore: 5,
    },
    structural_completeness: {
        label: 'Structural Completeness',
        description: 'Whether the prompt includes necessary structured sections.',
        maxScore: 5,
    },
    constraint_strength: {
        label: 'Constraint Strength',
        description: 'The robustness of format, length, and style constraints.',
        maxScore: 5,
    },
    model_compatibility: {
        label: 'Model Compatibility',
        description: 'How well the prompt leverages the target model\'s specific strengths.',
        maxScore: 5,
    },
    execution_readiness: {
        label: 'Execution Readiness',
        description: 'How much control the user has over the final execution and content of the output.',
        maxScore: 5,
    },
};

// ══════════════════════════════════════════════════════════════════
//  MODEL-SPECIFIC WEIGHT PROFILES
//
//  Each model emphasises different dimensions based on how that
//  model actually behaves in practice.
// ══════════════════════════════════════════════════════════════════

const MODEL_WEIGHTS = {
    openai: {
        intent_clarity: 0.25,
        structural_completeness: 0.20,
        constraint_strength: 0.15,
        execution_readiness: 0.30,
        model_compatibility: 0.10,
    },
    anthropic: {
        intent_clarity: 0.20,
        structural_completeness: 0.30,
        constraint_strength: 0.25,
        execution_readiness: 0.15,
        model_compatibility: 0.10,
    },
    gemini: {
        intent_clarity: 0.25,
        structural_completeness: 0.15,
        constraint_strength: 0.15,
        execution_readiness: 0.20,
        model_compatibility: 0.25,
    },
};

// Fallback for unknown models
const DEFAULT_WEIGHTS = {
    intent_clarity: 0.25,
    structural_completeness: 0.25,
    constraint_strength: 0.20,
    execution_readiness: 0.20,
    model_compatibility: 0.10,
};

// ══════════════════════════════════════════════════════════════════
//  MODEL-SPECIFIC ANTI-PATTERNS
//
//  Each model has 5–8 anti-patterns that reduce effectiveness.
//  Penalty is deducted from model_alignment (clamped to 1.0 max).
// ══════════════════════════════════════════════════════════════════

const MODEL_ANTI_PATTERNS = {
    openai: [
        {
            id: 'oai_no_system_role',
            pattern: /^(?!.*(you are|act as|system:|role:))/is,
            penalty: 0.5,
            dimension: 'model_compatibility',
            message: 'OpenAI GPT models perform best with system-role framing ("You are a …"). Add a clear role to set the model\'s expertise.',
        },
        {
            id: 'oai_no_cot',
            pattern: /^(?!.*(step by step|chain of thought|think through|reason through|let\'s think))/is,
            penalty: 0.3,
            dimension: 'model_compatibility',
            message: 'GPT models produce better reasoning with chain-of-thought triggers. Add "Think step by step" for complex tasks.',
        },
        {
            id: 'oai_vague_format',
            pattern: /^(?!.*(json|markdown|table|list|bullet|numbered|csv|code block|format:|formatted as|respond in))/is,
            penalty: 0.4,
            dimension: 'execution_readiness',
            message: 'GPT follows explicit format instructions precisely. Specify "Format: JSON / markdown table / numbered list" for consistent output.',
        },
        {
            id: 'oai_wall_of_text',
            test: (text) => text.split(/\s+/).length > 500,
            penalty: 0.5,
            dimension: 'intent_clarity',
            message: 'Very long prompts (500+ words) can reduce GPT\'s instruction-following. Break into numbered sections or use system/user message separation.',
        },
        {
            id: 'oai_ambiguous_you',
            pattern: /\byou\b(?!.*\b(you are|you should|your role)\b)/i,
            penalty: 0.3,
            dimension: 'constraint_strength',
            message: 'Ambiguous "you" without role context can confuse GPT\'s identity. Pair with "You are a [role]" for clarity.',
        },
        {
            id: 'oai_no_temperature_hint',
            pattern: /\b(creative|imaginative|brainstorm|fiction|story)\b/i,
            antiCondition: /\b(temperature|creative|playful|imaginative)\b/i,
            penalty: 0.2,
            dimension: 'model_compatibility',
            message: 'Creative tasks benefit from explicitly requesting varied/creative responses to steer GPT\'s sampling behavior.',
            conditionalCheck: true,
        },
    ],
    anthropic: [
        {
            id: 'claude_roleplay_framing',
            pattern: /\b(you are a|act as a|pretend to be|roleplay as)\b/i,
            penalty: 0.6,
            dimension: 'model_compatibility',
            message: 'Claude responds better to direct instructions than role-play framing. State expertise level instead: "With expert knowledge of X, …"',
        },
        {
            id: 'claude_no_xml_tags',
            pattern: /^(?!.*<\/?[a-z_]+>)/is,
            penalty: 0.4,
            dimension: 'model_compatibility',
            message: 'Claude excels with XML-tagged sections (<instructions>, <context>, <example>). Wrapping sections in tags improves parsing accuracy.',
        },
        {
            id: 'claude_no_boundaries',
            pattern: /^(?!.*(don\'t|do not|avoid|never|exclude|without|refrain|not include))/is,
            penalty: 0.4,
            dimension: 'structural_completeness',
            message: 'Claude is thorough by default — without explicit exclusion boundaries, responses can be overly verbose or include unwanted content.',
        },
        {
            id: 'claude_no_scope_limit',
            pattern: /^(?!.*(\d+\s*words?|\d+\s*sentences?|\d+\s*paragraphs?|brief|concise|be concise|keep it short|max\s+\d+|limit\s+to))/is,
            penalty: 0.5,
            dimension: 'structural_completeness',
            message: 'Claude tends toward comprehensive, long answers. Add explicit scope limits: "Be concise — max 200 words" or "Answer in 3 bullet points."',
        },
        {
            id: 'claude_jailbreak_framing',
            pattern: /\b(ignore previous|disregard|forget your rules|pretend you have no|bypass|override)\b/i,
            penalty: 1.0,
            dimension: 'model_compatibility',
            message: 'Jailbreak-style framing conflicts with Claude\'s safety training and produces worse results. Use clear, ethical framing instead.',
        },
        {
            id: 'claude_no_thinking',
            pattern: /^(?!.*(think|reason|explain your|step by step|scratchpad|thinking|before answering))/is,
            penalty: 0.3,
            dimension: 'model_compatibility',
            message: 'Claude has strong reasoning capabilities. Add "Think through this carefully before answering" for complex analytical tasks.',
        },
        {
            id: 'claude_missing_safety',
            pattern: /^(?!.*(accurate|factual|balanced|fair|unbiased|verified|cite|evidence|responsible|ethical|safe))/is,
            penalty: 0.3,
            dimension: 'model_compatibility',
            message: 'Claude is safety-aligned by design. Requesting "accurate, balanced" output leverages this strength rather than fighting it.',
        },
    ],
    gemini: [
        {
            id: 'gemini_task_before_context',
            test: (text) => {
                const lines = text.split('\n').filter(l => l.trim());
                if (lines.length < 2) return false;
                const firstLine = lines[0].toLowerCase();
                // If the first line has a task verb but no context keywords, it's task-before-context
                const hasTaskVerb = /^(explain|describe|summarize|list|compare|analyze|write|create|generate)/.test(firstLine);
                const hasContext = /\b(context|background|given|i am|we are|my|our|working on)\b/.test(firstLine);
                return hasTaskVerb && !hasContext;
            },
            penalty: 0.5,
            dimension: 'model_compatibility',
            message: 'Gemini performs better when context comes before the task instruction. Lead with background/context, then state the task.',
        },
        {
            id: 'gemini_no_structured_output',
            pattern: /^(?!.*(json|table|list|bullet|numbered|csv|markdown|structured|organized|format))/is,
            penalty: 0.4,
            dimension: 'execution_readiness',
            message: 'Gemini produces the most reliable output with explicit structured format requests (table, list, JSON). Specify the desired structure.',
        },
        {
            id: 'gemini_no_grounding',
            pattern: /^(?!.*(based on|according to|source|reference|cite|evidence|given that|from the|using the))/is,
            penalty: 0.3,
            dimension: 'model_compatibility',
            message: 'Gemini benefits from grounding cues — "based on current research" or "using the provided data" improves factual accuracy.',
        },
        {
            id: 'gemini_overly_complex',
            test: (text) => {
                const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
                const avgLen = sentences.reduce((a, s) => a + s.split(/\s+/).length, 0) / Math.max(sentences.length, 1);
                return avgLen > 35;
            },
            penalty: 0.4,
            dimension: 'intent_clarity',
            message: 'Gemini responds best to concise, direct instructions. Sentences averaging 35+ words are too complex — break into shorter directives.',
        },
        {
            id: 'gemini_no_multimodal_when_applicable',
            pattern: /\b(image|photo|picture|diagram|chart|screenshot|document|pdf|video|visual|attached|upload)\b/i,
            antiCondition: /\b(describe the|analyze the|based on the|from the|in the)\b/i,
            penalty: 0.3,
            dimension: 'model_compatibility',
            message: 'When referencing visual/multimodal content, explicitly tell Gemini what to do with it: "Describe the chart and extract key trends."',
            conditionalCheck: true,
        },
        {
            id: 'gemini_system_role_overhead',
            pattern: /\b(you are a|act as a|system prompt|system message)\b/i,
            penalty: 0.3,
            dimension: 'model_compatibility',
            message: 'Gemini doesn\'t use a system-role paradigm like GPT. State expertise needs directly: "Using expert knowledge of X, …"',
        },
        {
            id: 'gemini_lost_in_middle',
            test: (text) => text.split(/\s+/).length > 300,
            penalty: 0.3,
            dimension: 'intent_clarity',
            message: 'Very long prompts risk the "lost in the middle" effect with Gemini. Put critical instructions at the start and end, not buried in the middle.',
        },
    ],
};

// ══════════════════════════════════════════════════════════════════
//  MODEL-SPECIFIC BONUS PATTERNS
//
//  Patterns that, when present, add score to model_alignment.
// ══════════════════════════════════════════════════════════════════

const MODEL_BONUS_PATTERNS = {
    openai: [
        { pattern: /\b(you are a?|act as a?)\s+\w+/i, bonus: 0.4, label: 'System-role framing' },
        { pattern: /\b(step by step|chain of thought|think through)\b/i, bonus: 0.3, label: 'Chain-of-thought trigger' },
        { pattern: /\b(json|markdown|table|code block)\b/i, bonus: 0.3, label: 'Explicit output format' },
        { pattern: /\b(format:|respond as|output as)\b/i, bonus: 0.2, label: 'Format instruction' },
        { pattern: /\b(temperature|creative|precise|deterministic)\b/i, bonus: 0.2, label: 'Sampling guidance' },
    ],
    anthropic: [
        { pattern: /<\/?[a-z_]+>/i, bonus: 0.5, label: 'XML tag structure' },
        { pattern: /\b(think|reason|scratchpad|before answering)\b/i, bonus: 0.3, label: 'Thinking/reasoning prompt' },
        { pattern: /\b(concise|brief|max \d+|limit to)\b/i, bonus: 0.3, label: 'Scope boundary' },
        { pattern: /\b(don\'t|avoid|exclude|never|refrain)\b/i, bonus: 0.2, label: 'Exclusion boundary' },
        { pattern: /\b(accurate|balanced|fair|factual|ethical)\b/i, bonus: 0.3, label: 'Safety-aligned framing' },
    ],
    gemini: [
        { pattern: /^(context|background|given|i am|we are|my|our)/im, bonus: 0.5, label: 'Context-first structure' },
        { pattern: /\b(based on|according to|source|reference|evidence)\b/i, bonus: 0.3, label: 'Grounding cues' },
        { pattern: /\b(table|list|structured|organized|json|csv)\b/i, bonus: 0.3, label: 'Structured output request' },
        { pattern: /\b(image|photo|diagram|chart|visual|multimodal)\b/i, bonus: 0.3, label: 'Multimodal reference' },
        { pattern: /\b(concise|direct|brief|short)\b/i, bonus: 0.2, label: 'Concise imperative tone' },
    ],
};

// ══════════════════════════════════════════════════════════════════
//  MODEL PROFILES (user-visible metadata)
// ══════════════════════════════════════════════════════════════════

const MODEL_PROFILES = {
    openai: {
        name: 'OpenAI GPT',
        icon: '🟢',
        color: '#10a37f',
        tagline: 'Instruction-following powerhouse',
        strengths: ['Structured output', 'Role-based framing', 'Chain-of-thought reasoning', 'Format adherence'],
        scoringFocus: 'Output Controllability & Clarity',
        preferredStructure: 'System role → Task → Constraints → Format',
    },
    anthropic: {
        name: 'Anthropic Claude',
        icon: '🟠',
        color: '#d97757',
        tagline: 'Safety-aligned precision engine',
        strengths: ['Nuanced reasoning', 'XML-tagged parsing', 'Long-context handling', 'Balanced analysis'],
        scoringFocus: 'Constraint Completeness & Ambiguity Risk',
        preferredStructure: '<instructions> → <context> → <constraints> → <output>',
    },
    gemini: {
        name: 'Google Gemini',
        icon: '🔵',
        color: '#4285f4',
        tagline: 'Multimodal & context-first thinker',
        strengths: ['Multimodal understanding', 'Context grounding', 'Structured responses', 'Concise directives'],
        scoringFocus: 'Model Alignment & Clarity',
        preferredStructure: 'Context/Background → Task → Structure → Constraints',
    },
};

// ══════════════════════════════════════════════════════════════════
//  MODEL-SPECIFIC OUTPUT FORMAT CONFIG
//
//  Defines which sections appear and in what order per model.
// ══════════════════════════════════════════════════════════════════

const MODEL_OUTPUT_SECTIONS = {
    openai: {
        dimensionOrder: ['execution_readiness', 'intent_clarity', 'structural_completeness', 'constraint_strength', 'model_compatibility'],
        showPromptRewriteHint: true,
        rewriteStyle: 'system-user',
        showOptimizationChecklist: true,
        optimizationItems: [
            { id: 'system_role', label: 'System role defined', check: /\b(you are|act as|system:)\b/i },
            { id: 'task_verb', label: 'Clear task verb at start', check: /^(explain|describe|summarize|list|compare|analyze|write|create|generate|evaluate|review|build|implement)/i },
            { id: 'output_format', label: 'Output format specified', check: /\b(json|markdown|table|list|format:|formatted as|respond in)\b/i },
            { id: 'cot_trigger', label: 'Chain-of-thought trigger', check: /\b(step by step|think through|chain of thought)\b/i },
            { id: 'scope_bound', label: 'Scope/length defined', check: /\b(\d+\s*words?|\d+\s*sentences?|brief|concise|max\s+\d+)\b/i },
            { id: 'examples', label: 'Example provided', check: /\b(example|e\.g\.|for instance|like this|sample)\b/i },
        ],
    },
    anthropic: {
        dimensionOrder: ['structural_completeness', 'constraint_strength', 'intent_clarity', 'execution_readiness', 'model_compatibility'],
        showPromptRewriteHint: true,
        rewriteStyle: 'xml-tagged',
        showOptimizationChecklist: true,
        optimizationItems: [
            { id: 'xml_tags', label: 'XML tags for sections', check: /<\/?[a-z_]+>/i },
            { id: 'direct_instruction', label: 'Direct instruction (no role-play)', check: /^(?!.*\b(act as|pretend|roleplay)\b)/i },
            { id: 'scope_limit', label: 'Explicit scope limit', check: /\b(\d+\s*words?|concise|brief|max\s+\d+|be concise|keep it short)\b/i },
            { id: 'exclusions', label: 'Exclusion boundaries set', check: /\b(don't|do not|avoid|exclude|never|without|refrain)\b/i },
            { id: 'safety_framing', label: 'Safety-aligned framing', check: /\b(accurate|factual|balanced|fair|ethical)\b/i },
            { id: 'thinking_prompt', label: 'Thinking/reasoning prompt', check: /\b(think|reason|before answering|step by step|scratchpad)\b/i },
        ],
    },
    gemini: {
        dimensionOrder: ['model_compatibility', 'intent_clarity', 'execution_readiness', 'structural_completeness', 'constraint_strength'],
        showPromptRewriteHint: true,
        rewriteStyle: 'context-first',
        showOptimizationChecklist: true,
        optimizationItems: [
            { id: 'context_first', label: 'Context before task', check: /^(context|background|given|i am|we are|my|our)/im },
            { id: 'structured_output', label: 'Structured output request', check: /\b(table|list|structured|json|csv|numbered|organized)\b/i },
            { id: 'grounding', label: 'Grounding cues present', check: /\b(based on|according to|source|reference|evidence|given that)\b/i },
            { id: 'concise_directives', label: 'Concise directives', check: (text) => text.split(/[.!?]+/).every(s => s.split(/\s+/).length <= 30) },
            { id: 'multimodal_ref', label: 'Multimodal references (if applicable)', check: /\b(image|photo|diagram|chart|visual|document|pdf)\b/i },
            { id: 'no_system_role', label: 'No unnecessary system-role overhead', check: /^(?!.*\b(you are a|act as a|system prompt)\b)/is },
        ],
    },
};

// ── Legacy Issue Weights (kept for backward compat) ────────────────
const ISSUE_WEIGHTS = {
    vagueLanguage: 0.6,
    missingConstraint: 0.5,
    passiveVoice: 0.3,
    hedgeWord: 0.3,
    ambiguousQuantifier: 0.5,
    unclearReferent: 0.5,
    noOutputFormat: 0.8,
    noExampleProvided: 0.4,
    modelMisalignment: 0.6,
    tooShort: 0.7,
    tooLong: 0.3,
};

// ── Legacy MODEL_RULES (kept for generatorService backward compat) ─
const MODEL_RULES = {
    openai: {
        label: 'OpenAI (GPT)',
        preferredPatterns: [
            'system-role framing',
            'step-by-step instruction',
            'explicit output format (JSON / markdown)',
        ],
        commonPitfalls: [
            'Overly long system prompts reduce instruction-following',
            'Ambiguous "you" can confuse role assignment',
        ],
        bonusKeywords: ['step by step', 'format:', 'respond as', 'json', 'markdown'],
    },
    anthropic: {
        label: 'Anthropic (Claude)',
        preferredPatterns: [
            'XML tag delimiters for sections',
            'Explicit thinking / scratchpad sections',
            'Clear role + task separation',
        ],
        commonPitfalls: [
            'Missing closing tags cause parsing confusion',
            'Claude may refuse harmful tasks — frame ethically',
        ],
        bonusKeywords: ['<instructions>', '<example>', 'think step by step', 'xml', '</'],
    },
    gemini: {
        label: 'Google (Gemini)',
        preferredPatterns: [
            'Concise, direct instructions',
            'Multimodal context references',
            'Structured output requests',
        ],
        commonPitfalls: [
            'Very long prompts may lose context in the middle',
            'Gemini responds best to direct imperative tone',
        ],
        bonusKeywords: ['list', 'table', 'summarize', 'compare', 'structured'],
    },
};

module.exports = {
    DIMENSIONS,
    ISSUE_WEIGHTS,
    MODEL_RULES,
    MODEL_WEIGHTS,
    DEFAULT_WEIGHTS,
    MODEL_ANTI_PATTERNS,
    MODEL_BONUS_PATTERNS,
    MODEL_PROFILES,
    MODEL_OUTPUT_SECTIONS,
};

};
_modules['./scoring'] = _modules['../config/scoring'];

// ── blueprints.js ──────────────────────────────────────
_modules['../config/blueprints'] = function(module, exports, require) {
/**
 * PromptLab — Model-Specific Prompt Blueprints (v2 — Fully Differentiated)
 *
 * Every (model × task) combination has its own dedicated blueprint.
 * No fallback copying from OpenAI — each model's blueprint is tuned
 * to that model's actual strengths and prompt engineering best practices.
 */

// ════════════════════════════════════════════════════════════════
//  STRUCTURAL ELEMENTS (shared vocabulary)
// ════════════════════════════════════════════════════════════════

const ELEMENTS = {
    TASK_VERB: { id: 'task_verb', label: 'Task Verb', description: 'A clear action verb telling the AI what to do' },
    SUBJECT: { id: 'subject', label: 'Subject', description: 'The specific topic or subject matter' },
    AUDIENCE: { id: 'audience', label: 'Audience', description: 'Who the output is intended for' },
    OUTPUT_FORMAT: { id: 'output_format', label: 'Output Format', description: 'The format/structure of the response' },
    SCOPE: { id: 'scope', label: 'Scope/Length', description: 'Boundaries on how much to cover' },
    TONE: { id: 'tone', label: 'Tone/Style', description: 'The voice or register to use' },
    CONTEXT: { id: 'context', label: 'Context', description: 'Background information or situation' },
    EXAMPLES: { id: 'examples', label: 'Examples', description: 'Sample input/output or illustrations' },
    EXCLUSIONS: { id: 'exclusions', label: 'Exclusions', description: 'What to avoid or not include' },
    REASONING: { id: 'reasoning', label: 'Reasoning Guidance', description: 'Instructions on how to think through the task' },
    ROLE: { id: 'role', label: 'Role/Persona', description: 'A persona or expert role for the AI' },
    SAFETY: { id: 'safety', label: 'Safety Framing', description: 'Safety-aligned or bounded phrasing' },
    MULTIMODAL: { id: 'multimodal', label: 'Multimodal Cues', description: 'References to images, files, or non-text input' },
    SEQUENCE: { id: 'sequence', label: 'Sequencing', description: 'Numbered steps, ordering, or flow' },
    SUCCESS: { id: 'success', label: 'Success Criteria', description: 'What a good response looks like' },
    // ── New model-specific elements ──
    XML_TAGS: { id: 'xml_tags', label: 'XML Tags', description: 'XML tag delimiters for structured sections (Claude)' },
    GROUNDING: { id: 'grounding', label: 'Grounding Cues', description: 'References to sources, data, or evidence (Gemini)' },
    THINKING: { id: 'thinking', label: 'Thinking Prompt', description: 'Explicit instruction to reason before answering' },
};

// ════════════════════════════════════════════════════════════════
//  DETECTION PATTERNS (how we find each element in a prompt)
// ════════════════════════════════════════════════════════════════

const DETECTION = {
    task_verb: {
        patterns: [
            /^(explain|describe|summarize|list|compare|analyze|write|create|generate|evaluate|critique|review|build|design|translate|convert|teach|define|outline|discuss|elaborate|implement|debug|refactor|optimize|recommend|suggest|brainstorm|draft|compose|calculate|solve|classify|predict|extract|identify|illustrate|demonstrate|prove|argue|justify|clarify|paraphrase|rewrite|edit|proofread|improve|simplify|expand|condense)\b/i,
            /\b(explain|describe|summarize|list|compare|analyze|write|create|generate|evaluate|critique|review|build|design|translate|convert|teach|define|outline|discuss|elaborate|implement|debug|refactor|optimize|recommend|suggest|brainstorm|draft|compose|calculate|solve|classify|predict|extract|identify|illustrate|demonstrate|prove|argue|justify|clarify|paraphrase|rewrite|edit|proofread|improve|simplify|expand|condense)\b/i,
        ],
        qualityCheck: (text) => {
            const startsWithAction = /^(explain|describe|summarize|list|compare|analyze|write|create|generate|evaluate|critique|review|build|design|translate|convert|teach|define|outline|discuss|implement|debug|recommend|suggest|brainstorm|draft|compose|calculate|solve|classify|predict|extract|identify|illustrate|demonstrate|prove|clarify|rewrite|improve|simplify|expand|condense)\b/i.test(text.trim());
            const hasAction = /\b(explain|describe|summarize|list|compare|analyze|write|create|generate|evaluate|critique|review|build|design|translate|convert|teach|define|outline|discuss|implement|debug|recommend|suggest|brainstorm|draft|compose|calculate|solve|classify|predict|extract|identify|illustrate|demonstrate|prove|clarify|rewrite|improve|simplify|expand|condense)\b/i.test(text);
            if (startsWithAction) return 'strong';
            if (hasAction) return 'partial';
            return 'missing';
        },
    },
    subject: {
        patterns: [
            /\b(about|regarding|on|of|for|related to|concerning|involving)\s+\w+/i,
        ],
        qualityCheck: (text) => {
            const vagueSubjects = /\b(stuff|things|something|anything|everything|whatever|it|this|that)\b/i;
            const hasTopicNoun = /\b(about|regarding|on|of|for|related to)\s+[A-Z]?\w{3,}/i.test(text);
            const verbSubject = /\b(explain|describe|summarize|compare|analyze|write|create|list|review|evaluate|implement|build|define|discuss|teach|outline|critique)\s+(?:the\s+|a\s+|an\s+)?([A-Za-z]{3,})/i.test(text);
            if ((hasTopicNoun || verbSubject) && !vagueSubjects.test(text)) return 'strong';
            if (hasTopicNoun || verbSubject) return 'partial';
            const words = text.split(/\s+/);
            const hasSpecificSubject = words.length > 2 && !vagueSubjects.test(text);
            if (hasSpecificSubject) return 'partial';
            return 'missing';
        },
    },
    audience: {
        patterns: [
            /\b(for\s+(a\s+)?(beginner|student|expert|developer|child|adult|manager|layperson|specialist|teenager|non-technical|technical|professional|academic|general audience|5.year.old))/i,
            /\b(audience|reader|aimed at|targeting|write for|explain to|suitable for)\b/i,
        ],
        qualityCheck: (text) => {
            const explicit = /\b(for\s+(a\s+)?(beginner|student|expert|developer|child|adult|manager|layperson|specialist|teenager|non-technical|technical|professional|academic|general audience)|audience|aimed at|targeting)\b/i.test(text);
            const implied = /\b(simple|advanced|introductory|ELI5|elementary|graduate.level|PhD|undergraduate)\b/i.test(text);
            if (explicit) return 'strong';
            if (implied) return 'partial';
            return 'missing';
        },
    },
    output_format: {
        patterns: [
            /\b(json|csv|markdown|table|list|bullet|numbered|xml|yaml|html|code block|paragraph|essay|report|email|presentation|slide|diagram|chart|graph)\b/i,
            /\b(format|formatted as|output as|respond in|present as|structure as|organize as|in the form of)\b/i,
        ],
        qualityCheck: (text) => {
            const explicitFormat = /\b(json|csv|markdown|table|list|bullet|numbered|xml|yaml|html|code block|paragraph form|essay format|report format|email format)\b/i.test(text);
            const formatInstruction = /\b(format|formatted as|output as|respond in|present as|structure as|organize as|in the form of)\b/i.test(text);
            if (explicitFormat) return 'strong';
            if (formatInstruction) return 'partial';
            return 'missing';
        },
    },
    scope: {
        patterns: [
            /\b(\d+\s*words?|\d+\s*sentences?|\d+\s*paragraphs?|\d+\s*points?|\d+\s*items?|max|limit|brief|concise|short|long|detailed|comprehensive|in-depth|high-level|overview|thorough)\b/i,
        ],
        qualityCheck: (text) => {
            const explicitLimit = /\b(\d+\s*words?|\d+\s*sentences?|\d+\s*paragraphs?|\d+\s*points?|\d+\s*items?|max\s+\d+|limit\s+to)\b/i.test(text);
            const implicitScope = /\b(brief|concise|short|long|detailed|comprehensive|in-depth|high-level|overview|thorough|exhaustive|quick|one-paragraph)\b/i.test(text);
            if (explicitLimit) return 'strong';
            if (implicitScope) return 'partial';
            return 'missing';
        },
    },
    tone: {
        patterns: [
            /\b(tone|voice|style|formal|informal|casual|professional|academic|friendly|technical|conversational|authoritative|humorous|serious|neutral|empathetic|motivational|sarcastic|playful)\b/i,
        ],
        qualityCheck: (text) => {
            const explicit = /\b(tone|voice|style)\s*[:=]?\s*(formal|informal|casual|professional|academic|friendly|technical|conversational)\b/i.test(text);
            const implied = /\b(formal|informal|casual|professional|academic|friendly|technical|conversational|authoritative|humorous|serious|neutral)\b/i.test(text);
            if (explicit) return 'strong';
            if (implied) return 'partial';
            return 'missing';
        },
    },
    context: {
        patterns: [
            /\b(context|background|given that|assuming|scenario|situation|we are|i am|i'm|our|my|currently|working on)\b/i,
        ],
        qualityCheck: (text) => {
            const richContext = /\b(i am|i'm|we are|my|our|working on|currently|in my|for my)\s+\w+/i.test(text);
            const someContext = /\b(context|background|given|assuming|scenario|situation)\b/i.test(text);
            if (richContext) return 'strong';
            if (someContext) return 'partial';
            return 'missing';
        },
    },
    examples: {
        patterns: [
            /\b(example|e\.g\.|for instance|such as|like this|sample|here is|for example|illustration)\b/i,
        ],
        qualityCheck: (text) => {
            const hasExample = /\b(example|e\.g\.|for instance|such as|like this|sample|here is|for example)\b/i.test(text);
            if (hasExample) return 'strong';
            return 'missing';
        },
    },
    exclusions: {
        patterns: [
            /\b(don't|do not|avoid|exclude|never|without|no\s+\w+|except|skip|omit|refrain|not include)\b/i,
        ],
        qualityCheck: (text) => {
            const hasExclusion = /\b(don't|do not|avoid|exclude|never|without|except|skip|omit|refrain|not include)\b/i.test(text);
            if (hasExclusion) return 'strong';
            return 'missing';
        },
    },
    reasoning: {
        patterns: [
            /\b(step by step|think|reason|chain of thought|explain your|show your work|walk through|think through|reasoning|rationale|why)\b/i,
        ],
        qualityCheck: (text) => {
            const explicit = /\b(step by step|chain of thought|show your work|walk through|think through)\b/i.test(text);
            const implied = /\b(think|reason|explain your|reasoning|rationale|why)\b/i.test(text);
            if (explicit) return 'strong';
            if (implied) return 'partial';
            return 'missing';
        },
    },
    role: {
        patterns: [
            /\b(you are|act as|pretend|role|persona|as a|imagine you|assume the role|behave as)\b/i,
        ],
        qualityCheck: (text) => {
            const explicit = /\b(you are a|act as a|as a|assume the role of|behave as a)\s+\w+/i.test(text);
            const implied = /\b(expert|specialist|teacher|professor|engineer|doctor|analyst|consultant)\b/i.test(text);
            if (explicit) return 'strong';
            if (implied) return 'partial';
            return 'missing';
        },
    },
    safety: {
        patterns: [
            /\b(safe|appropriate|suitable|responsible|ethical|legal|accurate|factual|unbiased|balanced|fair)\b/i,
        ],
        qualityCheck: (text) => {
            const hasSafety = /\b(safe|appropriate|responsible|ethical|accurate|factual|unbiased|balanced|fair|cite sources|verified)\b/i.test(text);
            if (hasSafety) return 'strong';
            return 'missing';
        },
    },
    multimodal: {
        patterns: [
            /\b(image|photo|picture|diagram|screenshot|file|document|pdf|video|audio|chart|graph|visual)\b/i,
        ],
        qualityCheck: (text) => {
            const hasMultimodal = /\b(image|photo|picture|diagram|screenshot|file|document|pdf|video|audio|chart|graph|visual|attached|upload)\b/i.test(text);
            if (hasMultimodal) return 'strong';
            return 'missing';
        },
    },
    sequence: {
        patterns: [
            /\b(step\s*\d|first|second|third|1\.|2\.|3\.|phase \d|part \d|then|next|finally|after that)\b/i,
            /^\s*[-•*]\s+/m,
        ],
        qualityCheck: (text) => {
            const hasNumberedSteps = /\b(step\s*\d|\d\.\s+\w|1\)\s+\w)/i.test(text);
            const hasSequenceWords = /\b(first|second|third|then|next|finally|after that|followed by)\b/i.test(text);
            if (hasNumberedSteps) return 'strong';
            if (hasSequenceWords) return 'partial';
            return 'missing';
        },
    },
    success: {
        patterns: [
            /\b(success|good response|ideal output|criteria|requirement|must include|should contain|expected|goal|objective|deliverable)\b/i,
        ],
        qualityCheck: (text) => {
            const explicit = /\b(success criteria|must include|should contain|expected output|goal is|objective is|deliverable)\b/i.test(text);
            const implied = /\b(make sure|ensure|important that|key point|critical)\b/i.test(text);
            if (explicit) return 'strong';
            if (implied) return 'partial';
            return 'missing';
        },
    },
    // ── New model-specific detection elements ──
    xml_tags: {
        patterns: [
            /<\/?[a-z_]+>/i,
        ],
        qualityCheck: (text) => {
            const hasOpenClose = /<[a-z_]+>[\s\S]*<\/[a-z_]+>/i.test(text);
            const hasAnyTag = /<\/?[a-z_]+>/i.test(text);
            if (hasOpenClose) return 'strong';
            if (hasAnyTag) return 'partial';
            return 'missing';
        },
    },
    grounding: {
        patterns: [
            /\b(based on|according to|source|reference|cite|evidence|given that|from the|using the|research shows)\b/i,
        ],
        qualityCheck: (text) => {
            const strong = /\b(based on|according to|from the|using the|cite sources|reference the)\b/i.test(text);
            const partial = /\b(source|reference|evidence|research|data|findings|studies)\b/i.test(text);
            if (strong) return 'strong';
            if (partial) return 'partial';
            return 'missing';
        },
    },
    thinking: {
        patterns: [
            /\b(think|reason|before answering|scratchpad|think step by step|think through|reasoning process)\b/i,
        ],
        qualityCheck: (text) => {
            const explicit = /\b(think step by step|think through|before answering|scratchpad|reasoning process|show your reasoning)\b/i.test(text);
            const implied = /\b(think|reason|consider|reflect|ponder|deliberate)\b/i.test(text);
            if (explicit) return 'strong';
            if (implied) return 'partial';
            return 'missing';
        },
    },
};

// ════════════════════════════════════════════════════════════════
//  TASK-SPECIFIC BLUEPRINTS PER MODEL
//  Every (model × task) has a dedicated, tuned blueprint.
// ════════════════════════════════════════════════════════════════

const BLUEPRINTS = {

    // ──────────────────────────────────────────────────────────────
    //  OpenAI (GPT) — instruction-following, role-based, format-adherent
    // ──────────────────────────────────────────────────────────────
    openai: {
        explain: {
            required: ['task_verb', 'subject', 'audience', 'output_format', 'scope'],
            recommended: ['context', 'tone', 'examples', 'reasoning', 'role'],
            optional: ['exclusions', 'success'],
            tips: [
                'GPT responds best with system-role framing: "You are an expert educator in [topic]."',
                'Add "Think step by step" before answering — it significantly improves explanation quality.',
                'Specify exact output format (markdown headers, bullet points, tables) for consistent structure.',
                'Include audience level explicitly: "Explain for a beginner with no prior knowledge."',
            ],
        },
        compare: {
            required: ['task_verb', 'subject', 'output_format'],
            recommended: ['audience', 'scope', 'tone', 'examples', 'reasoning'],
            optional: ['context', 'exclusions', 'success', 'role'],
            tips: [
                'Request "Respond as a markdown table" — GPT excels at structured comparisons.',
                'Specify comparison criteria explicitly: "Compare across cost, ease of use, and scalability."',
                'Add a role: "As a technology analyst, compare…" for more authoritative output.',
            ],
        },
        generate: {
            required: ['task_verb', 'subject', 'output_format', 'tone'],
            recommended: ['audience', 'scope', 'context', 'examples', 'role'],
            optional: ['exclusions', 'success', 'reasoning'],
            tips: [
                'Provide a clear persona/role for creative generation: "You are a senior copywriter."',
                'Include a style sample: "Write in a tone similar to [example]."',
                'Specify word count and structure (e.g., "800 words, 4 sections with headers").',
            ],
        },
        summarize: {
            required: ['task_verb', 'subject', 'scope'],
            recommended: ['output_format', 'audience', 'context'],
            optional: ['tone', 'exclusions', 'success'],
            tips: [
                'Be explicit about length: "Summarize in exactly 3 bullet points" or "in 100 words."',
                'Tell GPT what to prioritize: "Focus on key findings, not methodology."',
                'Use a role: "As a research analyst, summarize the key takeaways."',
            ],
        },
        code: {
            required: ['task_verb', 'subject', 'output_format', 'context'],
            recommended: ['scope', 'examples', 'exclusions', 'reasoning'],
            optional: ['audience', 'tone', 'success'],
            tips: [
                'Specify language, framework, and version: "Python 3.11, using FastAPI 0.100+".',
                'Request inline comments: "Add comments explaining each section."',
                'Include error handling: "Handle edge cases and validate input parameters."',
                'Ask for step-by-step reasoning: "Explain your approach before writing code."',
            ],
        },
        analyze: {
            required: ['task_verb', 'subject', 'output_format', 'scope'],
            recommended: ['context', 'audience', 'reasoning', 'examples'],
            optional: ['tone', 'exclusions', 'success', 'role'],
            tips: [
                'Define analysis dimensions: "Analyze across cost, risk, feasibility, and timeline."',
                'Ask for evidence-based conclusions: "Support each finding with data or examples."',
                'Use system-role: "You are a senior business analyst with 15 years of experience."',
            ],
        },
        list: {
            required: ['task_verb', 'subject', 'scope'],
            recommended: ['output_format', 'audience', 'context'],
            optional: ['tone', 'exclusions', 'examples', 'success'],
            tips: [
                'Specify exact count: "List exactly 7 strategies" — GPT follows numeric instructions precisely.',
                'Request brief explanations: "Include a 1-sentence description for each item."',
                'Add ranking criteria: "Rank by effectiveness, most effective first."',
            ],
        },
        instruct: {
            required: ['task_verb', 'subject', 'output_format', 'audience'],
            recommended: ['scope', 'context', 'examples', 'sequence'],
            optional: ['tone', 'exclusions', 'success', 'reasoning'],
            tips: [
                'Request numbered steps: "Provide as numbered steps, each starting with an action verb."',
                'Specify prerequisites: "Assume the reader has basic Python knowledge."',
                'Include a role: "You are a senior developer writing documentation."',
            ],
        },
        brainstorm: {
            required: ['task_verb', 'subject', 'scope'],
            recommended: ['context', 'output_format', 'exclusions'],
            optional: ['audience', 'tone', 'examples', 'success'],
            tips: [
                'Specify quantity and type: "Generate 10 creative marketing strategies."',
                'Add constraints that spark creativity: "Budget under $5000, timeline 2 weeks."',
                'Request diversity: "Each idea should use a different approach."',
            ],
        },
        general: {
            required: ['task_verb', 'subject'],
            recommended: ['output_format', 'scope', 'audience', 'role'],
            optional: ['context', 'tone', 'examples', 'exclusions', 'reasoning', 'success'],
            tips: [
                'Start with a clear action verb: "Explain…", "Compare…", "List…".',
                'Assign a role: "You are a helpful assistant specializing in [domain]."',
                'Specify output format to avoid generic responses.',
            ],
        },
    },

    // ──────────────────────────────────────────────────────────────
    //  Anthropic (Claude) — safety-aligned, XML-structured, boundary-aware
    // ──────────────────────────────────────────────────────────────
    anthropic: {
        explain: {
            required: ['task_verb', 'subject', 'scope', 'audience'],
            recommended: ['output_format', 'tone', 'context', 'safety', 'exclusions'],
            optional: ['examples', 'success', 'xml_tags', 'thinking'],
            tips: [
                'Claude responds best to direct, clear instructions — no need for role-play framing.',
                'Set explicit scope limits: "Be concise — max 200 words" prevents over-long responses.',
                'Use XML tags for complex prompts: <context>…</context>, <instructions>…</instructions>.',
                'Request accuracy: "Ensure all claims are factually correct" leverages Claude\'s strength.',
            ],
        },
        compare: {
            required: ['task_verb', 'subject', 'output_format', 'scope'],
            recommended: ['audience', 'tone', 'safety', 'exclusions', 'context'],
            optional: ['examples', 'success', 'xml_tags'],
            tips: [
                'Claude excels at nuanced, balanced comparisons — ask for "fair, balanced analysis."',
                'Specify comparison structure: "Use a table with columns for [criteria]."',
                'Add exclusion boundaries: "Do not include personal opinions."',
                'Request evidence: "Support each comparison point with examples or data."',
            ],
        },
        generate: {
            required: ['task_verb', 'subject', 'output_format', 'tone', 'exclusions'],
            recommended: ['scope', 'audience', 'context', 'safety'],
            optional: ['examples', 'role', 'success', 'xml_tags'],
            tips: [
                'Claude is careful about creative content — specify boundaries clearly.',
                'Use natural language, not jailbreak-style framing.',
                'Set clear exclusions: "Do not include violent or controversial content."',
                'Specify scope to prevent unnecessarily long outputs.',
            ],
        },
        summarize: {
            required: ['task_verb', 'subject', 'scope'],
            recommended: ['output_format', 'audience', 'safety', 'exclusions'],
            optional: ['tone', 'context', 'success', 'xml_tags'],
            tips: [
                'Claude handles long-form summarization exceptionally well.',
                'Specify what to prioritize: "Focus on actionable insights, not background."',
                'Set word/bullet limits: Claude respects scope constraints precisely.',
                'Wrap source text in <document> tags for clear separation.',
            ],
        },
        analyze: {
            required: ['task_verb', 'subject', 'output_format', 'scope'],
            recommended: ['context', 'audience', 'thinking', 'safety', 'exclusions'],
            optional: ['tone', 'examples', 'success', 'xml_tags'],
            tips: [
                'Claude\'s reasoning is strongest when you ask it to "think through this carefully."',
                'Request balanced analysis: "Consider both pros and cons."',
                'Use <context> tags for background data and <instructions> for the analysis task.',
                'Set clear scope: "Analyze across exactly 4 dimensions."',
            ],
        },
        list: {
            required: ['task_verb', 'subject', 'scope', 'output_format'],
            recommended: ['audience', 'context', 'exclusions', 'safety'],
            optional: ['tone', 'examples', 'success'],
            tips: [
                'Claude follows count instructions well: "List exactly 7 items."',
                'Add exclusion boundaries: "Do not include items that require paid tools."',
                'Request explanations: "Include a 1-line rationale for each item."',
                'Ask Claude to be concise — it naturally tends toward comprehensive answers.',
            ],
        },
        instruct: {
            required: ['task_verb', 'subject', 'output_format', 'audience', 'scope'],
            recommended: ['context', 'sequence', 'examples', 'exclusions'],
            optional: ['tone', 'success', 'safety', 'xml_tags'],
            tips: [
                'Specify step format: "Number each step. Start each with an action verb."',
                'Include prerequisites: "The reader has [X] installed and knows [Y] basics."',
                'Add exclusions: "Do not include advanced optimizations — keep it beginner-friendly."',
                'Claude writes careful, precise instructions by default — leverage this.',
            ],
        },
        brainstorm: {
            required: ['task_verb', 'subject', 'scope'],
            recommended: ['context', 'output_format', 'exclusions', 'audience'],
            optional: ['tone', 'examples', 'success', 'safety'],
            tips: [
                'Claude may self-censor creative ideas — explicitly say "Be creative and unconventional."',
                'Set clear scope: "10 distinct ideas, each in 2 sentences."',
                'Add constraints for focus: "Budget under $1000, implementable in 1 week."',
                'Use exclusion boundaries to steer: "Avoid overused ideas like social media campaigns."',
            ],
        },
        code: {
            required: ['task_verb', 'subject', 'output_format', 'context'],
            recommended: ['scope', 'examples', 'reasoning', 'exclusions'],
            optional: ['audience', 'success', 'xml_tags', 'thinking'],
            tips: [
                'Claude writes careful, well-commented code by default.',
                'Specify error handling: "Include input validation and meaningful error messages."',
                'Use <context> for requirements and <instructions> for the coding task.',
                'Ask Claude to explain its reasoning: "Explain key design decisions in comments."',
            ],
        },
        general: {
            required: ['task_verb', 'subject'],
            recommended: ['output_format', 'scope', 'audience', 'safety', 'exclusions'],
            optional: ['context', 'tone', 'examples', 'reasoning', 'success', 'xml_tags', 'thinking'],
            tips: [
                'Be direct — Claude responds well to clear, unambiguous instructions.',
                'Specify scope to avoid overly cautious, long responses.',
                'Use XML tags for complex multi-part prompts.',
            ],
        },
    },

    // ──────────────────────────────────────────────────────────────
    //  Gemini — multimodal, context-first, grounded, structured
    // ──────────────────────────────────────────────────────────────
    gemini: {
        explain: {
            required: ['task_verb', 'subject', 'audience', 'output_format'],
            recommended: ['context', 'scope', 'tone', 'examples', 'grounding'],
            optional: ['exclusions', 'multimodal', 'success'],
            tips: [
                'Lead with context: "Background: [situation]. Task: Explain [topic]."',
                'Gemini produces reliable structured output — request tables, lists, or headers.',
                'Add grounding cues: "Based on current research…" improves factual accuracy.',
                'Reference multimodal inputs if available: "Looking at the attached diagram…".',
            ],
        },
        compare: {
            required: ['task_verb', 'subject', 'output_format', 'scope'],
            recommended: ['context', 'audience', 'grounding'],
            optional: ['tone', 'examples', 'exclusions', 'multimodal', 'success'],
            tips: [
                'Gemini handles table-format comparisons very well.',
                'Include context before the comparison task.',
                'Add grounding: "Based on 2024 market data, compare…"',
                'Reference charts or images if available for multimodal analysis.',
            ],
        },
        generate: {
            required: ['task_verb', 'subject', 'output_format', 'tone'],
            recommended: ['scope', 'context', 'audience', 'examples'],
            optional: ['exclusions', 'multimodal', 'success', 'grounding'],
            tips: [
                'Provide context before the generation task for better grounding.',
                'Be explicit about structure: "Write with 4 sections: intro, body, examples, conclusion."',
                'Gemini benefits from concrete examples of desired style.',
                'Keep instructions concise and direct — avoid overly complex sentences.',
            ],
        },
        summarize: {
            required: ['task_verb', 'subject', 'scope', 'output_format'],
            recommended: ['context', 'audience', 'grounding'],
            optional: ['tone', 'exclusions', 'success', 'multimodal'],
            tips: [
                'Provide the source text first as context, then the summarization task.',
                'Be explicit about length: "Summarize in 3 bullet points, max 20 words each."',
                'Request structure: "Organize as: key finding, supporting evidence, implication."',
                'Gemini handles multimodal summarization — summarize charts, images, or documents.',
            ],
        },
        analyze: {
            required: ['task_verb', 'subject', 'output_format', 'scope'],
            recommended: ['context', 'audience', 'grounding', 'reasoning'],
            optional: ['tone', 'examples', 'exclusions', 'success', 'multimodal'],
            tips: [
                'Lead with context and data, then state the analysis task.',
                'Add grounding: "Based on the provided data, analyze…"',
                'Specify analysis dimensions: "Analyze across 4 criteria: X, Y, Z, W."',
                'Request structured output: "Present as: Overview → Findings → Recommendations."',
            ],
        },
        list: {
            required: ['task_verb', 'subject', 'scope'],
            recommended: ['output_format', 'context', 'audience', 'grounding'],
            optional: ['tone', 'exclusions', 'examples', 'success'],
            tips: [
                'Specify exact count and format: "List 5 items as a numbered list with descriptions."',
                'Lead with context: "For a small business in [industry], list 5 strategies."',
                'Add grounding: "Based on current best practices, list…"',
                'Gemini follows numbered list formats reliably.',
            ],
        },
        instruct: {
            required: ['task_verb', 'subject', 'output_format', 'audience'],
            recommended: ['scope', 'context', 'sequence', 'examples', 'grounding'],
            optional: ['tone', 'exclusions', 'success', 'multimodal'],
            tips: [
                'Provide context first: "Context: The reader has [X]. Task: Provide step-by-step instructions."',
                'Request numbered steps with action verbs.',
                'Include visuals: "Add references to diagrams or screenshots where helpful."',
                'Gemini excels at clear, structured procedural content.',
            ],
        },
        brainstorm: {
            required: ['task_verb', 'subject', 'scope', 'context'],
            recommended: ['output_format', 'exclusions', 'audience'],
            optional: ['tone', 'examples', 'success', 'grounding'],
            tips: [
                'Provide rich context before asking for ideas: "Given [situation], brainstorm 8 approaches."',
                'Gemini generates more creative output when given specific constraints.',
                'Request structured output: "For each idea: title, description (2 sentences), feasibility."',
                'Add grounding: "Base ideas on current industry trends."',
            ],
        },
        code: {
            required: ['task_verb', 'subject', 'output_format', 'context'],
            recommended: ['scope', 'examples', 'reasoning', 'grounding'],
            optional: ['audience', 'exclusions', 'success'],
            tips: [
                'Specify language, framework, and version explicitly.',
                'Lead with context: "Given this API specification: [spec]. Implement…"',
                'Request structured code + explanation output format.',
                'Add grounding: "Following the official documentation patterns…"',
            ],
        },
        general: {
            required: ['task_verb', 'subject'],
            recommended: ['output_format', 'context', 'scope', 'audience', 'grounding'],
            optional: ['tone', 'examples', 'exclusions', 'multimodal', 'reasoning', 'success'],
            tips: [
                'Provide context first, then the task instruction.',
                'Leverage Gemini\'s multimodal capabilities when relevant.',
                'Keep instructions concise and direct.',
            ],
        },
    },
};

module.exports = { ELEMENTS, DETECTION, BLUEPRINTS };

};
_modules['./blueprints'] = _modules['../config/blueprints'];

// ── analyzerService.js ──────────────────────────────────────
_modules['analyzerService'] = function(module, exports, require) {
/**
 * PromptLab — Blueprint-Based Structural Analyzer (v5 — Model-Specific)
 *
 * Architecture:
 *   1. INTENT EXTRACTION — determine what the user wants before grading
 *   2. BLUEPRINT LOOKUP  — load model × task structural checklist
 *   3. STRUCTURAL COMPARISON — compare presence/absence/quality of each element
 *   4. MODEL-SPECIFIC SCORING — dimension scores derived from model-tuned weights
 *   5. ANTI-PATTERN & BONUS SCAN — deep per-model heuristic checks
 *   6. INTENT-AWARE EXPLANATION — show "we believe you want X"
 *   7. SCOPED SUGGESTIONS — fill missing blueprint elements (max 3)
 *   8. MODEL-SPECIFIC OUTPUT SHAPING — differentiated response per model
 *
 * Core principle: compare prompt to a model-specific reference structure,
 * NOT to "the best prompt ever". Grade structural alignment + intent match.
 * Each model gets its own weights, anti-patterns, and output format.
 */

const { ELEMENTS, DETECTION, BLUEPRINTS } = require('../config/blueprints');
const {
    MODEL_WEIGHTS,
    DEFAULT_WEIGHTS,
    MODEL_ANTI_PATTERNS,
    MODEL_BONUS_PATTERNS,
    MODEL_PROFILES,
    MODEL_OUTPUT_SECTIONS,
} = require('../config/scoring');

// ── Intent detection patterns ───────────────────────────────────
const TASK_PATTERNS = [
    { task: 'explain', patterns: [/\b(explain|describe|what is|define|clarify|elaborate|break down|tell me about|teach me)\b/i] },
    { task: 'compare', patterns: [/\b(compare|contrast|difference|versus|vs\.?|similarities|pros and cons|better)\b/i] },
    { task: 'generate', patterns: [/\b(write|create|generate|compose|draft|produce|come up with|make me)\b/i] },
    { task: 'summarize', patterns: [/\b(summarize|summary|overview|recap|condense|tldr|brief)\b/i] },
    { task: 'analyze', patterns: [/\b(analyze|analyse|evaluate|assess|review|critique|examine)\b/i] },
    { task: 'list', patterns: [/\b(list|enumerate|name|give me|what are|identify all|top \d+)\b/i] },
    { task: 'instruct', patterns: [/\b(how to|steps to|guide|tutorial|instructions|walk me through|teach me how)\b/i] },
    { task: 'code', patterns: [/\b(code|program|function|script|implement|algorithm|debug|api|python|javascript|html|css|sql|build a|write a script)\b/i] },
    { task: 'brainstorm', patterns: [/\b(brainstorm|suggest|recommend|ideas?|options?|alternatives?|creative)\b/i] },
];

// ════════════════════════════════════════════════════════════════
//  PUBLIC API
// ════════════════════════════════════════════════════════════════

function analyze({ promptText, exampleOutput = null, modelTarget }) {
    if (!promptText || typeof promptText !== 'string' || promptText.trim().length === 0) {
        return { error: 'invalid_input' };
    }

    const text = promptText.trim();
    const lower = text.toLowerCase();
    const wordCount = text.split(/\s+/).length;

    // ═══════════════════════════════════════════════════════════
    //  STEP 1: Intent Extraction
    // ═══════════════════════════════════════════════════════════
    const intent = _extractIntent(text, lower);

    // ═══════════════════════════════════════════════════════════
    //  STEP 2: Blueprint Lookup (model × task)
    // ═══════════════════════════════════════════════════════════
    const modelBlueprints = BLUEPRINTS[modelTarget] || BLUEPRINTS.openai;
    const blueprint = modelBlueprints[intent.task] || modelBlueprints.general;

    // ═══════════════════════════════════════════════════════════
    //  STEP 3: Structural Comparison
    // ═══════════════════════════════════════════════════════════
    const allElements = [...blueprint.required, ...blueprint.recommended, ...(blueprint.optional || [])];
    const comparison = [];

    for (const elementId of allElements) {
        const detector = DETECTION[elementId];
        const elementDef = ELEMENTS[elementId.toUpperCase()] ||
            Object.values(ELEMENTS).find(e => e.id === elementId);

        if (!detector || !elementDef) continue;

        const quality = detector.qualityCheck(text);
        const tier = blueprint.required.includes(elementId) ? 'required'
            : blueprint.recommended.includes(elementId) ? 'recommended'
                : 'optional';

        comparison.push({
            element: elementId,
            label: elementDef.label,
            description: elementDef.description,
            expected: tier !== 'optional',
            tier,
            present: quality !== 'missing',
            quality,  // 'strong' | 'partial' | 'missing'
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  STEP 4: Model-Specific Mechanical Scoring
    // ═══════════════════════════════════════════════════════════
    const weights = MODEL_WEIGHTS[modelTarget] || DEFAULT_WEIGHTS;
    const issues = [];
    const modelSpecificIssues = [];

    // ── CLARITY ───────────────────────────────────────────────
    const taskVerbRow = comparison.find(c => c.element === 'task_verb');
    const subjectRow = comparison.find(c => c.element === 'subject');

    let clarityScore = 5;
    if (!taskVerbRow || taskVerbRow.quality === 'missing') {
        clarityScore -= 2;
        issues.push({
            dimension: 'clarity',
            excerpt: text.substring(0, 50) + (text.length > 50 ? '…' : ''),
            explanation: `No clear task verb found. Start your prompt with a direct instruction verb like "${_suggestTaskVerb(intent)}" so the AI knows exactly what action to perform.`,
        });
    } else if (taskVerbRow.quality === 'partial') {
        clarityScore -= 1;
        issues.push({
            dimension: 'clarity',
            excerpt: text.substring(0, 50) + (text.length > 50 ? '…' : ''),
            explanation: `The task verb is present but not leading the prompt. Restructure to start with the action: "${_suggestTaskVerb(intent)} ${intent.subject || '…'}"`,
        });
    }

    if (!subjectRow || subjectRow.quality === 'missing') {
        clarityScore -= 2;
        issues.push({
            dimension: 'clarity',
            excerpt: '(entire prompt)',
            explanation: `No specific subject identified. Your ${intent.task} intent requires a concrete subject — "${intent.subject || 'the topic'}" should be named explicitly and precisely.`,
        });
    } else if (subjectRow.quality === 'partial') {
        clarityScore -= 1;
        issues.push({
            dimension: 'clarity',
            excerpt: '(entire prompt)',
            explanation: `Subject is vague or uses generic terms. Replace vague nouns with the exact topic you want the AI to ${intent.task}.`,
        });
    }

    // Short prompt penalty
    if (wordCount < 5) {
        clarityScore -= 1;
        issues.push({
            dimension: 'clarity',
            excerpt: text,
            explanation: `At ${wordCount} words, this prompt is too terse. For a ${intent.task} task, aim for 15–50 words covering subject, scope, and constraints.`,
        });
    }

    // Hedge words reduce clarity
    const hedgeCount = (lower.match(/\b(maybe|perhaps|possibly|might|i think|i guess|sort of|kind of)\b/g) || []).length;
    if (hedgeCount > 0) {
        clarityScore -= Math.min(1, hedgeCount * 0.5);
        const firstHedge = lower.match(/\b(maybe|perhaps|possibly|might|i think|i guess|sort of|kind of)\b/)[0];
        issues.push({
            dimension: 'clarity',
            excerpt: firstHedge,
            explanation: `"${firstHedge}" signals uncertainty. AI models produce better results with direct, assertive instructions. State what you want, not what you "might" want.`,
        });
    }

    clarityScore = _clamp(clarityScore);

    // ── CONSTRAINT COMPLETENESS ──────────────────────────────
    const requiredRows = comparison.filter(c => c.tier === 'required');
    const recommendedRows = comparison.filter(c => c.tier === 'recommended');

    const requiredPresent = requiredRows.filter(c => c.present).length;
    const requiredTotal = requiredRows.length;
    const recommendedPresent = recommendedRows.filter(c => c.present).length;
    const recommendedTotal = recommendedRows.length;

    const requiredRatio = requiredTotal > 0 ? requiredPresent / requiredTotal : 1;
    const recommendedRatio = recommendedTotal > 0 ? recommendedPresent / recommendedTotal : 1;

    // Score: 60% from required elements, 40% from recommended
    let constraintScore = _clamp(Math.round((requiredRatio * 0.6 + recommendedRatio * 0.4) * 5));

    const missingRequired = requiredRows.filter(c => !c.present);
    const missingRecommended = recommendedRows.filter(c => !c.present);

    if (missingRequired.length > 0) {
        issues.push({
            dimension: 'constraint_completeness',
            excerpt: '(structural comparison)',
            explanation: `Missing ${missingRequired.length} required element(s) for a ${intent.task} prompt on ${_modelLabel(modelTarget)}: ${missingRequired.map(c => c.label).join(', ')}. These are essential for the model to produce quality output.`,
        });
    }

    if (missingRecommended.length > 0 && missingRecommended.length >= 2) {
        issues.push({
            dimension: 'constraint_completeness',
            excerpt: '(structural comparison)',
            explanation: `Missing ${missingRecommended.length} recommended element(s): ${missingRecommended.map(c => c.label).join(', ')}. Adding these would significantly improve response quality.`,
        });
    }

    // ── MODEL ALIGNMENT ──────────────────────────────────────
    let alignmentScore = 5;

    // 4a. Check model-specific structural patterns from blueprint
    const modelSpecificElements = _getModelSpecificElements(modelTarget);
    const modelSpecificPresent = modelSpecificElements.filter(el => {
        const detector = DETECTION[el];
        return detector && detector.qualityCheck(text) !== 'missing';
    });

    const modelAlignRatio = modelSpecificElements.length > 0
        ? modelSpecificPresent.length / modelSpecificElements.length
        : 0.5;

    alignmentScore = _clamp(Math.round(modelAlignRatio * 5));

    // 4b. Apply model-specific BONUS patterns
    const bonusPatterns = MODEL_BONUS_PATTERNS[modelTarget] || [];
    let totalBonus = 0;
    const bonusHits = [];
    for (const bp of bonusPatterns) {
        if (bp.pattern.test(text)) {
            totalBonus += bp.bonus;
            bonusHits.push(bp.label);
        }
    }
    if (totalBonus > 0) {
        alignmentScore = _clamp(Math.round(alignmentScore + Math.min(totalBonus, 1.5)));
    }

    // 4c. Apply model-specific ANTI-PATTERNS
    const antiPatterns = MODEL_ANTI_PATTERNS[modelTarget] || [];
    for (const ap of antiPatterns) {
        let triggered = false;

        if (ap.conditionalCheck) {
            // Conditional: first pattern must match, antiCondition must NOT match
            triggered = ap.pattern && ap.pattern.test(text) && ap.antiCondition && !ap.antiCondition.test(text);
        } else if (ap.test) {
            // Function-based test
            triggered = ap.test(text);
        } else if (ap.pattern) {
            triggered = ap.pattern.test(text);
        }

        if (triggered) {
            const targetDim = ap.dimension;
            if (targetDim === 'model_alignment') {
                alignmentScore = Math.max(0, alignmentScore - ap.penalty);
            }
            // Other dimension penalties applied later
            modelSpecificIssues.push({
                dimension: targetDim,
                excerpt: `[${_modelLabel(modelTarget)}]`,
                explanation: ap.message,
                antiPatternId: ap.id,
            });
        }
    }

    alignmentScore = _clamp(alignmentScore);

    // Apply anti-pattern penalties to other dimensions
    let clarityAntiPenalty = 0;
    let constraintAntiPenalty = 0;
    let ambiguityAntiPenalty = 0;
    let controlAntiPenalty = 0;

    for (const msi of modelSpecificIssues) {
        if (msi.dimension === 'clarity') clarityAntiPenalty += (MODEL_ANTI_PATTERNS[modelTarget] || []).find(a => a.id === msi.antiPatternId)?.penalty || 0;
        if (msi.dimension === 'constraint_completeness') constraintAntiPenalty += (MODEL_ANTI_PATTERNS[modelTarget] || []).find(a => a.id === msi.antiPatternId)?.penalty || 0;
        if (msi.dimension === 'ambiguity_risk') ambiguityAntiPenalty += (MODEL_ANTI_PATTERNS[modelTarget] || []).find(a => a.id === msi.antiPatternId)?.penalty || 0;
        if (msi.dimension === 'output_controllability') controlAntiPenalty += (MODEL_ANTI_PATTERNS[modelTarget] || []).find(a => a.id === msi.antiPatternId)?.penalty || 0;
    }

    clarityScore = _clamp(clarityScore - clarityAntiPenalty);
    constraintScore = _clamp(constraintScore - constraintAntiPenalty);

    // ── AMBIGUITY RISK ───────────────────────────────────────
    let ambiguityScore = 5;

    // Ambiguous quantifiers
    const quantifiers = lower.match(/\b(some|many|few|several|various|numerous|multiple|a lot)\b/g) || [];
    if (quantifiers.length > 0) {
        ambiguityScore -= Math.min(2, quantifiers.length * 0.7);
        issues.push({
            dimension: 'ambiguity_risk',
            excerpt: quantifiers[0],
            explanation: `"${quantifiers[0]}" is ambiguous — the AI could interpret this as anywhere from 2 to 20+. Specify an exact number for predictable output.`,
        });
    }

    // Branching "or" without clarification
    const orBranch = text.match(/\b(\w+)\s+or\s+(\w+)\b/i);
    if (orBranch && !/\b(either|both|each)\b/i.test(text)) {
        ambiguityScore -= 0.5;
        issues.push({
            dimension: 'ambiguity_risk',
            excerpt: orBranch[0],
            explanation: `"${orBranch[0]}" creates branching ambiguity — should the AI do both, pick one, or compare them? Clarify: "both X and Y" or "choose between X and Y."`,
        });
    }

    // Multiple questions
    const questionCount = (text.match(/\?/g) || []).length;
    if (questionCount > 2) {
        ambiguityScore -= 1;
        issues.push({
            dimension: 'ambiguity_risk',
            excerpt: `(${questionCount} questions)`,
            explanation: `${questionCount} questions in one prompt. The AI may prioritize some over others. Combine into one focused question or number them explicitly.`,
        });
    }

    // Missing required elements increase ambiguity
    if (missingRequired.length >= 2) {
        ambiguityScore -= 1;
    }

    ambiguityScore = _clamp(ambiguityScore - ambiguityAntiPenalty);

    // ── OUTPUT CONTROLLABILITY ───────────────────────────────
    let controlScore = 5;
    const formatRow = comparison.find(c => c.element === 'output_format');
    const scopeRow = comparison.find(c => c.element === 'scope');

    if (!formatRow || formatRow.quality === 'missing') {
        controlScore -= 2;
        issues.push({
            dimension: 'output_controllability',
            excerpt: '(entire prompt)',
            explanation: `No output format specified. Without a format, the AI picks its own structure. For a ${intent.task} task, try: "${_suggestFormat(intent.task, modelTarget)}"`,
        });
    } else if (formatRow.quality === 'partial') {
        controlScore -= 1;
    }

    if (!scopeRow || scopeRow.quality === 'missing') {
        controlScore -= 1;
        issues.push({
            dimension: 'output_controllability',
            excerpt: '(entire prompt)',
            explanation: `No scope or length constraint. Without bounds, responses vary wildly in length. Add: "${_suggestScope(intent.task)}"`,
        });
    }

    if (!exampleOutput && (!comparison.find(c => c.element === 'examples') || !comparison.find(c => c.element === 'examples').present)) {
        controlScore -= 0.5;
    }

    controlScore = _clamp(controlScore - controlAntiPenalty);

    // ═══════════════════════════════════════════════════════════
    //  OVERALL SCORE (model-specific weighted, 1 decimal)
    // ═══════════════════════════════════════════════════════════
    const dimension_scores = {
        clarity: clarityScore,
        constraint_completeness: constraintScore,
        model_alignment: alignmentScore,
        ambiguity_risk: ambiguityScore,
        output_controllability: controlScore,
    };

    const overall_score = _round1(
        clarityScore * weights.clarity +
        constraintScore * weights.constraint_completeness +
        ambiguityScore * weights.ambiguity_risk +
        controlScore * weights.output_controllability +
        alignmentScore * weights.model_alignment
    );

    // ═══════════════════════════════════════════════════════════
    //  VALIDATION — at least 1 issue per dimension < 4
    // ═══════════════════════════════════════════════════════════
    const allIssues = [...issues, ...modelSpecificIssues];
    for (const [dim, score] of Object.entries(dimension_scores)) {
        if (score < 4 && !allIssues.some(i => i.dimension === dim)) {
            allIssues.push({
                dimension: dim,
                excerpt: '(entire prompt)',
                explanation: `${_dimLabel(dim)} scored ${score}/5 based on structural comparison. Review the blueprint elements for this dimension.`,
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  STEP 5: Intent-Aware Explanation
    // ═══════════════════════════════════════════════════════════
    const intentExplanation = _buildIntentExplanation(intent, comparison, dimension_scores, overall_score, blueprint, modelTarget);

    // ═══════════════════════════════════════════════════════════
    //  STEP 6: Suggestions — fill missing blueprint elements (max 3)
    // ═══════════════════════════════════════════════════════════
    const suggestions = _buildSuggestions(text, intent, comparison, blueprint, modelTarget);

    // ═══════════════════════════════════════════════════════════
    //  STEP 7: Model-Specific Output Shaping
    // ═══════════════════════════════════════════════════════════
    const modelProfile = MODEL_PROFILES[modelTarget] || MODEL_PROFILES.openai;
    const outputSections = MODEL_OUTPUT_SECTIONS[modelTarget] || MODEL_OUTPUT_SECTIONS.openai;

    // Build optimization checklist
    const optimizationChecklist = _buildOptimizationChecklist(text, outputSections);

    // Build prompt rewrite hint
    const promptRewriteHint = _buildRewriteHint(text, intent, modelTarget, outputSections);

    // Order dimensions per model preference
    const scoringEmphasis = outputSections.dimensionOrder.map(dim => ({
        dimension: dim,
        label: _dimLabel(dim),
        score: dimension_scores[dim],
        weight: weights[dim],
        weightPercent: Math.round(weights[dim] * 100),
    }));

    return {
        overall_score,
        dimension_scores,
        scoring_emphasis: scoringEmphasis,
        intent,
        structural_comparison: comparison,
        issues: issues.filter(i => !i.antiPatternId),
        model_specific_issues: modelSpecificIssues,
        suggestions,
        educational_summary: intentExplanation,
        blueprint_tips: blueprint.tips || [],
        // ── Model-specific output fields ──
        model_profile: modelProfile,
        prompt_rewrite_hint: promptRewriteHint,
        optimization_checklist: optimizationChecklist,
        bonus_patterns_matched: bonusHits,
    };
}

// ════════════════════════════════════════════════════════════════
//  STEP 1: Intent Extraction
// ════════════════════════════════════════════════════════════════

function _extractIntent(text, lower) {
    let task = 'general';
    for (const { task: t, patterns } of TASK_PATTERNS) {
        if (patterns.some(p => p.test(lower))) {
            task = t;
            break;
        }
    }

    const subject = _extractSubject(text, lower);
    const outputType = _inferOutputType(task, lower);
    const implicitAudience = _inferAudience(lower);
    const implicitDepth = _inferDepth(lower, text.split(/\s+/).length);

    return {
        task,
        subject,
        output_type: outputType,
        implicit_audience: implicitAudience,
        implicit_depth: implicitDepth,
    };
}

function _extractSubject(text, lower) {
    const verbSubject = text.match(/\b(?:explain|describe|summarize|compare|analyze|write|create|list|review|evaluate|implement|build|define|discuss|teach|outline|critique)\s+(?:the\s+)?(?:concept\s+of\s+|basics\s+of\s+|fundamentals\s+of\s+|principles\s+of\s+)?(.{3,60}?)(?:\.|,|\?|$|\bfor\b|\bin\b|\bto\b|\busing\b|\bwith\b|\bkeeping\b)/i);
    if (verbSubject) {
        return verbSubject[1].trim().replace(/\b(some|a|an)\b/gi, '').trim();
    }

    const aboutMatch = text.match(/\b(?:about|regarding|on|of|related to|concerning)\s+(.{3,60}?)(?:\.|,|\?|$|\band\b|\bwith\b|\bthat\b|\bwhich\b)/i);
    if (aboutMatch) {
        return aboutMatch[1].trim().replace(/\b(some|the|a|an)\b/gi, '').trim();
    }

    const words = text.split(/\s+/).filter(w => w.length > 3);
    const candidates = words.filter(w => /^[A-Z]/.test(w) || /\b(learning|programming|computing|engineering|science|analysis|design|marketing|management|networks?|algorithms?|systems?|models?)\b/i.test(w));
    if (candidates.length > 0) return candidates.slice(0, 4).join(' ');

    return null;
}

function _inferOutputType(task, lower) {
    const map = {
        explain: 'educational explanation',
        compare: 'structured comparison',
        generate: 'creative content',
        summarize: 'concise summary',
        analyze: 'analytical assessment',
        list: 'enumerated list',
        instruct: 'step-by-step guide',
        code: 'code implementation',
        brainstorm: 'idea generation',
        general: 'informational response',
    };
    return map[task] || 'informational response';
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

// ════════════════════════════════════════════════════════════════
//  STEP 5: Intent-Aware Explanation (model-aware)
// ════════════════════════════════════════════════════════════════

function _buildIntentExplanation(intent, comparison, scores, overall, blueprint, modelTarget) {
    const parts = [];
    const profile = MODEL_PROFILES[modelTarget] || MODEL_PROFILES.openai;

    parts.push(`We detected your intent as: **${intent.task}** — ${intent.output_type}${intent.subject ? ` about "${intent.subject}"` : ''}.`);

    if (intent.implicit_audience !== 'general' || intent.implicit_depth !== 'moderate') {
        parts.push(`Implicit audience: ${intent.implicit_audience}. Depth: ${intent.implicit_depth}.`);
    }

    // Model-specific context
    parts.push(`Analyzing for **${profile.name}** ${profile.icon} — scoring emphasis: ${profile.scoringFocus}.`);

    const requiredRows = comparison.filter(c => c.tier === 'required');
    const presentCount = requiredRows.filter(c => c.present).length;
    const ratio = requiredRows.length > 0 ? presentCount / requiredRows.length : 0;

    if (ratio >= 0.8) {
        parts.push('Your prompt expresses this intent clearly — most structural elements are present.');
    } else if (ratio >= 0.5) {
        parts.push('Your prompt partially expresses this intent — key structural elements are missing.');
    } else {
        parts.push('Your prompt weakly expresses this intent — most expected structural elements are absent.');
    }

    const missingRequired = requiredRows.filter(c => !c.present);
    if (missingRequired.length > 0) {
        parts.push(`Missing to fully express your intent: ${missingRequired.map(c => c.label).join(', ')}.`);
    }

    // Model-specific preferred structure
    parts.push(`Preferred structure for ${profile.name}: ${profile.preferredStructure}.`);

    if (blueprint.tips && blueprint.tips.length > 0) {
        parts.push(`Tip: ${blueprint.tips[0]}`);
    }

    return parts.join(' ');
}

// ════════════════════════════════════════════════════════════════
//  STEP 6: Suggestions — fill missing blueprint elements
// ════════════════════════════════════════════════════════════════

function _buildSuggestions(text, intent, comparison, blueprint, modelTarget) {
    const suggestions = [];

    const missingRequired = comparison.filter(c => c.tier === 'required' && !c.present);
    const missingRecommended = comparison.filter(c => c.tier === 'recommended' && !c.present);
    const allMissing = [...missingRequired, ...missingRecommended];

    for (const missing of allMissing.slice(0, 3)) {
        const suggestion = _generateSuggestionForElement(text, intent, missing, modelTarget);
        if (suggestion) {
            suggestions.push(suggestion);
        }
    }

    return suggestions;
}

function _generateSuggestionForElement(text, intent, missing, modelTarget) {
    const truncatedOriginal = text.length > 80 ? text.substring(0, 77) + '…' : text;

    const elementSuggestions = {
        task_verb: {
            dimension: 'clarity',
            original: truncatedOriginal,
            improved: `${_suggestTaskVerb(intent)} ${text.trim()}`,
        },
        subject: {
            dimension: 'clarity',
            original: truncatedOriginal,
            improved: text.trim().replace(/\b(stuff|things|something|anything|whatever)\b/gi, intent.subject || '[specific topic]'),
        },
        audience: {
            dimension: 'constraint_completeness',
            original: truncatedOriginal,
            improved: `${text.trim()}\n\nTarget audience: ${_suggestAudience(intent)}.`,
        },
        output_format: {
            dimension: 'output_controllability',
            original: truncatedOriginal,
            improved: `${text.trim()}\n\nFormat: ${_suggestFormat(intent.task, modelTarget)}.`,
        },
        scope: {
            dimension: 'output_controllability',
            original: truncatedOriginal,
            improved: `${text.trim()}\n\nScope: ${_suggestScope(intent.task)}.`,
        },
        tone: {
            dimension: 'constraint_completeness',
            original: truncatedOriginal,
            improved: `${text.trim()}\n\nTone: ${_suggestTone(intent)}.`,
        },
        context: {
            dimension: 'constraint_completeness',
            original: truncatedOriginal,
            improved: modelTarget === 'gemini'
                ? `Context: I am ${intent.implicit_audience === 'general' ? 'a user' : `a ${intent.implicit_audience}`} working on ${intent.subject || 'a project'}.\n\n${text.trim()}`
                : `${text.trim()}\n\nContext: I am ${intent.implicit_audience === 'general' ? 'a user' : `a ${intent.implicit_audience}`} working on ${intent.subject || 'a project'}.`,
        },
        examples: {
            dimension: 'output_controllability',
            original: truncatedOriginal,
            improved: modelTarget === 'anthropic'
                ? `${text.trim()}\n\n<example>\n[provide a brief sample of what good output looks like]\n</example>`
                : `${text.trim()}\n\nExample of desired output: [provide a brief sample of what good output looks like].`,
        },
        exclusions: {
            dimension: 'constraint_completeness',
            original: truncatedOriginal,
            improved: `${text.trim()}\n\nDo not include: [specify what to avoid or exclude].`,
        },
        reasoning: {
            dimension: 'model_alignment',
            original: truncatedOriginal,
            improved: modelTarget === 'openai'
                ? `${text.trim()}\n\nThink step by step before answering.`
                : modelTarget === 'anthropic'
                    ? `${text.trim()}\n\nThink through this carefully before providing your answer.`
                    : `${text.trim()}\n\nWalk through your reasoning before providing the final answer.`,
        },
        role: {
            dimension: 'model_alignment',
            original: truncatedOriginal,
            improved: modelTarget === 'openai'
                ? `You are an expert in ${intent.subject || 'this domain'}.\n\n${text.trim()}`
                : `With expert-level knowledge of ${intent.subject || 'this domain'}, ${text.trim()}`,
        },
        safety: {
            dimension: 'model_alignment',
            original: truncatedOriginal,
            improved: `${text.trim()}\n\nEnsure the response is accurate, balanced, and well-sourced.`,
        },
        sequence: {
            dimension: 'output_controllability',
            original: truncatedOriginal,
            improved: `${text.trim()}\n\nPresent your response in numbered steps.`,
        },
        success: {
            dimension: 'clarity',
            original: truncatedOriginal,
            improved: `${text.trim()}\n\nA good response should: [define what success looks like].`,
        },
        // ── New model-specific suggestions ──
        xml_tags: {
            dimension: 'model_alignment',
            original: truncatedOriginal,
            improved: `<instructions>\n${text.trim()}\n</instructions>\n\n<constraints>\n[add constraints here]\n</constraints>`,
        },
        grounding: {
            dimension: 'model_alignment',
            original: truncatedOriginal,
            improved: `Based on current research and best practices, ${text.trim().charAt(0).toLowerCase() + text.trim().slice(1)}`,
        },
        thinking: {
            dimension: 'model_alignment',
            original: truncatedOriginal,
            improved: `${text.trim()}\n\nThink through this step by step before providing your final answer.`,
        },
    };

    return elementSuggestions[missing.element] || null;
}

// ════════════════════════════════════════════════════════════════
//  STEP 7: Optimization Checklist & Rewrite Hint
// ════════════════════════════════════════════════════════════════

function _buildOptimizationChecklist(text, outputSections) {
    if (!outputSections.showOptimizationChecklist) return [];

    return outputSections.optimizationItems.map(item => {
        let passed = false;
        if (typeof item.check === 'function') {
            passed = item.check(text);
        } else {
            passed = item.check.test(text);
        }
        return {
            id: item.id,
            label: item.label,
            passed,
        };
    });
}

function _buildRewriteHint(text, intent, modelTarget, outputSections) {
    if (!outputSections.showPromptRewriteHint) return null;

    const style = outputSections.rewriteStyle;
    const subject = intent.subject || '[your topic]';
    const task = intent.task;

    if (style === 'system-user') {
        // OpenAI style: System role + User instruction
        return {
            style: 'system-user',
            label: 'GPT-Optimized Structure',
            description: 'OpenAI models perform best with system-role framing followed by a clear user instruction.',
            template: [
                `System: You are an expert in ${subject}.`,
                '',
                `User: ${_suggestTaskVerb(intent)} ${subject}.`,
                `Format: ${_suggestFormat(task, modelTarget)}.`,
                `Scope: ${_suggestScope(task)}.`,
                'Think step by step before answering.',
            ].join('\n'),
        };
    }

    if (style === 'xml-tagged') {
        // Anthropic style: XML-tagged sections
        return {
            style: 'xml-tagged',
            label: 'Claude-Optimized Structure',
            description: 'Claude excels with XML-tagged sections for clear structure and boundaries.',
            template: [
                `<context>`,
                `I need help with ${subject}.`,
                `</context>`,
                '',
                `<instructions>`,
                `${_suggestTaskVerb(intent)} ${subject}.`,
                `Be concise — ${_suggestScope(task)}.`,
                `</instructions>`,
                '',
                `<constraints>`,
                `- ${_suggestFormat(task, modelTarget)}`,
                `- Do not include: [exclusions]`,
                `- Ensure accuracy and balance`,
                `</constraints>`,
            ].join('\n'),
        };
    }

    if (style === 'context-first') {
        // Gemini style: Context first, then task
        return {
            style: 'context-first',
            label: 'Gemini-Optimized Structure',
            description: 'Gemini performs best when context/background comes before the task instruction.',
            template: [
                `Background: I am working on ${subject}. [add relevant context here]`,
                '',
                `Task: ${_suggestTaskVerb(intent)} ${subject}.`,
                '',
                `Output: ${_suggestFormat(task, modelTarget)}.`,
                `Scope: ${_suggestScope(task)}.`,
                `Ground your response in current best practices.`,
            ].join('\n'),
        };
    }

    return null;
}

// ════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════

function _clamp(v) { return Math.max(0, Math.min(5, Math.round(v))); }
function _round1(v) { return Math.round(v * 10) / 10; }

function _dimLabel(dim) {
    return {
        clarity: 'Clarity',
        constraint_completeness: 'Constraint Completeness',
        model_alignment: 'Model Alignment',
        ambiguity_risk: 'Ambiguity Risk',
        output_controllability: 'Output Controllability',
    }[dim] || dim;
}

function _modelLabel(model) {
    return {
        openai: 'OpenAI GPT',
        anthropic: 'Anthropic Claude',
        gemini: 'Google Gemini',
    }[model] || model;
}

function _suggestTaskVerb(intent) {
    return {
        explain: 'Explain', compare: 'Compare', generate: 'Write',
        summarize: 'Summarize', analyze: 'Analyze', list: 'List',
        instruct: 'Provide step-by-step instructions for', code: 'Implement',
        brainstorm: 'Brainstorm', general: 'Describe',
    }[intent.task] || 'Describe';
}

function _suggestFormat(task, modelTarget) {
    // Model-specific format suggestions
    const modelFormats = {
        openai: {
            explain: 'Respond in structured markdown with headers, key points as bullet lists, and a code/practical example',
            compare: 'Respond as a markdown comparison table with rows for each criterion',
            generate: 'Provide structured output with clear headings, sections, and formatting',
            summarize: 'Respond in 2–3 concise paragraphs: context, key points, conclusion',
            analyze: 'Structure as: Overview → Evidence → Analysis → Conclusion',
            list: 'Respond as a numbered list with a 1–2 sentence explanation per item',
            instruct: 'Respond as numbered steps, each starting with an action verb',
            code: 'Provide a fenced code block with inline comments, followed by explanation',
            brainstorm: 'Respond as a numbered list with title + brief description per idea',
            general: 'Respond in structured markdown with clear headings',
        },
        anthropic: {
            explain: 'Respond with a clear introduction, key concepts in bullet points, and a brief summary',
            compare: 'Respond as a structured comparison with clear dimensions, avoiding bias',
            generate: 'Provide the content with clear structure, within specified boundaries',
            summarize: 'Respond as concise bullet points prioritizing key insights',
            analyze: 'Structure as: Key Findings → Supporting Evidence → Balanced Conclusion',
            list: 'Respond as a numbered list with brief rationale for each item',
            instruct: 'Number each step clearly, starting with an action verb and noting prerequisites',
            code: 'Provide well-commented code in a fenced block with error handling explained',
            brainstorm: 'Numbered list with title, 2-sentence description, and feasibility note per idea',
            general: 'Respond clearly and concisely with structured formatting',
        },
        gemini: {
            explain: 'Respond with structured headers and sections, using tables or lists where appropriate',
            compare: 'Respond as a well-structured comparison table with clear criteria columns',
            generate: 'Provide structured output with headers, organized sections, and clear flow',
            summarize: 'Respond as a structured summary: key points, supporting details, takeaway',
            analyze: 'Structure as: Context → Analysis Dimensions → Findings → Recommendations',
            list: 'Respond as a numbered list with concise explanations grounded in evidence',
            instruct: 'Numbered steps with action verbs, referencing visual aids where applicable',
            code: 'Fenced code block with comments, followed by a structured explanation',
            brainstorm: 'Numbered ideas with title, description, and implementation difficulty rating',
            general: 'Respond in a well-structured format with clear organization',
        },
    };

    return (modelFormats[modelTarget] || modelFormats.openai)[task] || 'Respond in structured markdown';
}

function _suggestScope(task) {
    return {
        explain: 'Keep the response between 150–300 words',
        compare: 'Compare across 3–5 key criteria',
        generate: 'Target 200–500 words',
        summarize: 'Limit to 100–150 words',
        list: 'Provide exactly 5–7 items',
        instruct: 'Use 5–10 clear steps',
        code: 'Keep code under 50 lines with inline comments',
        brainstorm: 'Generate 5–8 distinct ideas',
        analyze: 'Cover 3–4 key dimensions of analysis',
        general: 'Keep under 300 words',
    }[task] || 'Keep under 300 words';
}

function _suggestAudience(intent) {
    return {
        beginner: 'someone new to the topic, avoid jargon',
        student: 'a student with basic knowledge who wants to learn more',
        expert: 'a domain expert, use technical terminology',
        developer: 'an intermediate developer familiar with fundamentals',
        general: 'a general audience with moderate domain knowledge',
    }[intent.implicit_audience] || 'a general audience';
}

function _suggestTone(intent) {
    return {
        explain: 'Professional and educational',
        code: 'Technical and precise',
        generate: 'Clear and engaging',
        brainstorm: 'Energetic and creative',
        general: 'Professional and informative',
    }[intent.task] || 'Professional and informative';
}

function _getModelSpecificElements(model) {
    if (model === 'openai') return ['role', 'reasoning', 'output_format', 'examples', 'sequence'];
    if (model === 'anthropic') return ['safety', 'scope', 'exclusions', 'xml_tags', 'thinking'];
    if (model === 'gemini') return ['context', 'output_format', 'grounding', 'multimodal', 'scope'];
    return ['output_format'];
}

module.exports = { analyze };

};

// ── generatorService.js ──────────────────────────────────────
_modules['generatorService'] = function(module, exports, require) {
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

};


// ── Public API ──────────────────────────────────────────────
const analyzerService = _require('analyzerService');
const generatorService = _require('generatorService');

global.PromptLabEngine = {
    analyze: function(opts) {
        return analyzerService.analyze(opts);
    },
    generate: function(opts) {
        // Wire analyzer into generator for the scoring loop
        opts.analyzerFn = function(analyzerOpts) {
            return analyzerService.analyze(analyzerOpts);
        };
        return generatorService.generate(opts);
    },
};

})(typeof window !== 'undefined' ? window : global);
