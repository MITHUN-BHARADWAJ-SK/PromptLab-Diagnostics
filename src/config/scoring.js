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
