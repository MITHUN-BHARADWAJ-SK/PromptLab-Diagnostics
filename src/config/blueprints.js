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
