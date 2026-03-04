/**
 * PromptLab — Prompt Generator Service (v2 — Three-Layer Architecture)
 *
 * Architecture:
 *   Layer 1: INTENT INFERENCE   — infer task type, domain, output format, control level
 *   Layer 2: PROMPT BLUEPRINT   — build structured, inspectable blueprint
 *   Layer 3: PROMPT GENERATION  — transform blueprint into model-aware prompt
 *   + ANALYZER LOOP             — score v1, auto-improve if below threshold
 *
 * The generator NEVER produces a prompt directly from raw user input.
 * It always goes: raw input → intent → blueprint → prompt.
 */

const { MODEL_PROFILES, MODEL_OUTPUT_SECTIONS } = require('../config/scoring');

// ── Score threshold for auto-improvement ────────────────────────
const IMPROVEMENT_THRESHOLD = 3.5;

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
//  PUBLIC API
// ════════════════════════════════════════════════════════════════

/**
 * Generate a high-quality, model-aware prompt using the three-layer system.
 *
 * @param {Object} params
 * @param {string} params.promptText       Raw user input
 * @param {string} params.modelTarget      'openai' | 'anthropic' | 'gemini'
 * @param {Function} [params.analyzerFn]   Optional: PromptLabEngine.analyze function for scoring loop
 * @returns {Object} Full generation result with intent, blueprint, versions, scores
 */
function generate({ promptText, modelTarget, analyzerFn = null }) {
    if (!promptText || typeof promptText !== 'string' || promptText.trim().length === 0) {
        return { error: 'Please enter a prompt to generate.' };
    }

    const text = promptText.trim();
    const lower = text.toLowerCase();

    // ═══════════════════════════════════════════════════════════
    //  LAYER 1: INTENT INFERENCE
    // ═══════════════════════════════════════════════════════════
    const intent = _inferIntent(text, lower);

    // ═══════════════════════════════════════════════════════════
    //  LAYER 2: PROMPT BLUEPRINT
    // ═══════════════════════════════════════════════════════════
    const blueprint = _buildBlueprint(text, intent, modelTarget);

    // ═══════════════════════════════════════════════════════════
    //  LAYER 3: PROMPT GENERATION (v1)
    // ═══════════════════════════════════════════════════════════
    const v1Prompt = _generateFromBlueprint(blueprint, modelTarget);

    // ═══════════════════════════════════════════════════════════
    //  ANALYZER LOOP: Score v1, improve if needed
    // ═══════════════════════════════════════════════════════════
    let v1Score = null;
    let v2 = null;
    let improvements = [];

    if (analyzerFn) {
        // Score the generated prompt
        const v1Analysis = analyzerFn({
            promptText: v1Prompt,
            modelTarget,
        });

        v1Score = {
            overall: v1Analysis.overall_score || 0,
            dimensions: v1Analysis.dimension_scores || {},
        };

        // If score below threshold, auto-improve
        if (v1Score.overall < IMPROVEMENT_THRESHOLD) {
            const { prompt: v2Prompt, changes } = _improvePrompt(v1Prompt, blueprint, v1Analysis, modelTarget);
            improvements = changes;

            // Re-score v2
            const v2Analysis = analyzerFn({
                promptText: v2Prompt,
                modelTarget,
            });

            v2 = {
                prompt: v2Prompt,
                score: {
                    overall: v2Analysis.overall_score || 0,
                    dimensions: v2Analysis.dimension_scores || {},
                },
            };
        }
    }

    // Build "Why this prompt works" explanation
    const whyItWorks = _buildExplanation(intent, blueprint, v1Score, v2, modelTarget);

    return {
        intent,
        blueprint,
        v1: {
            prompt: v1Prompt,
            score: v1Score,
        },
        v2,
        improvements,
        whyItWorks,
        finalPrompt: v2 ? v2.prompt : v1Prompt,
        finalScore: v2 ? v2.score : v1Score,
    };
}

// ════════════════════════════════════════════════════════════════
//  LAYER 1: INTENT INFERENCE
// ════════════════════════════════════════════════════════════════

function _inferIntent(text, lower) {
    // A. Task Type
    let taskType = 'general';
    for (const { task, patterns } of TASK_PATTERNS) {
        if (patterns.some(p => p.test(lower))) {
            taskType = task;
            break;
        }
    }

    // B. Domain / Niche
    let domain = 'General';
    for (const { domain: d, patterns } of DOMAIN_PATTERNS) {
        if (patterns.some(p => p.test(lower))) {
            domain = d;
            break;
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
    // Long, detailed prompts suggest high control
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 40) controlLevel = 'high';

    // E. Subject extraction
    const subject = _extractSubject(text, lower);

    // F. Audience
    const audience = _inferAudience(lower);

    // G. Depth
    const depth = _inferDepth(lower, wordCount);

    return {
        taskType,
        domain,
        outputFormat,
        controlLevel,
        subject,
        audience,
        depth,
    };
}

function _extractSubject(text, lower) {
    const verbSubject = text.match(/\b(?:explain|describe|summarize|compare|analyze|write|create|list|review|evaluate|implement|build|define|discuss|teach|outline|critique|plan|schedule|generate|optimize|improve)\s+(?:a\s+|an\s+|the\s+)?(?:concept\s+of\s+|basics\s+of\s+|fundamentals\s+of\s+|principles\s+of\s+)?(.{3,80}?)(?:\.|,|\?|$|\bfor\b|\bin\b|\bto\b|\busing\b|\bwith\b|\bkeeping\b)/i);
    if (verbSubject) {
        return verbSubject[1].trim().replace(/\b(some|a|an)\b/gi, '').trim();
    }

    const aboutMatch = text.match(/\b(?:about|regarding|on|related to|concerning)\s+(.{3,60}?)(?:\.|,|\?|$|\band\b|\bwith\b|\bthat\b|\bwhich\b)/i);
    if (aboutMatch) {
        return aboutMatch[1].trim().replace(/\b(some|the|a|an)\b/gi, '').trim();
    }

    // Fallback: use first meaningful phrase
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

function _buildBlueprint(text, intent, modelTarget) {
    const parsed = _parsePromptContent(text, intent);

    // Role assignment based on task type and model
    const role = _assignRole(intent, modelTarget);

    // Task instruction — enriched from original text
    const task = _buildTaskInstruction(text, intent, parsed);

    // Context — extracted or inferred
    const context = parsed.context;

    // Constraints — from text analysis + defaults
    const constraints = _buildConstraints(text, intent, parsed, modelTarget);

    // Output format — map to model-appropriate format
    const outputFormat = _mapOutputFormat(intent.outputFormat, intent.taskType, modelTarget);

    return {
        role,
        task,
        context,
        constraints,
        output_format: outputFormat,
        control_level: intent.controlLevel,
        model: modelTarget,
        // Keep parsed data for generation
        _parsed: parsed,
        _intent: intent,
    };
}

function _parsePromptContent(text, intent) {
    const lower = text.toLowerCase();
    const subject = intent.subject || text.trim().split(/[.,!?]/)[0].trim();

    // Extract explicit signals from prompt
    const contextMatch = text.match(/\b(?:i am|i'm|we are|we're|my|our|currently|working on|i need|i want|i have|given)\b[^.!?]*/i);
    const goalMatch = text.match(/\b(?:goal|objective|aim|want to|need to|trying to|hoping to|looking to)\b[^.!?]*/i);
    const constraintMatch = text.match(/\b(?:constraint|limit|within|between|from|must|should|only|under|maximum|minimum|at least|no more|prioriti)\b[^.!?]*/i);
    const audienceMatch = text.match(/\b(?:for|targeting|aimed at|audience)\s+(?:a\s+)?(\w+(?:\s+\w+)?)/i);
    const toneMatch = text.match(/\b(?:tone|style|voice)\s*[:=]?\s*(\w+)/i);

    // Build context
    let context;
    if (contextMatch) {
        context = contextMatch[0].trim();
        if (context.split(/\s+/).length < 6) {
            context += `. The task involves ${subject}.`;
        }
    } else {
        context = `I need assistance with ${subject}. ${goalMatch ? goalMatch[0].trim() + '.' : `The goal is to get a high-quality ${intent.outputFormat} on this topic.`}`;
    }

    // Build constraints
    let constraintText;
    if (constraintMatch) {
        constraintText = constraintMatch[0].trim();
        if (!constraintText.match(/^[A-Z]/)) {
            constraintText = constraintText.charAt(0).toUpperCase() + constraintText.slice(1);
        }
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

    // From text extraction
    if (parsed.constraints && !parsed.constraints.includes('[')) {
        constraints.push(parsed.constraints);
    }

    // Audience constraint
    const audienceMap = {
        beginner: 'Use simple language, avoid jargon, and explain any technical terms',
        student: 'Assume foundational knowledge but explain advanced concepts clearly',
        expert: 'Use technical terminology freely and focus on depth over breadth',
        developer: 'Include code examples and technical details',
        general: 'Write for a moderately knowledgeable audience with clear language',
    };
    constraints.push(audienceMap[intent.audience] || audienceMap.general);

    // Depth constraint
    if (intent.depth === 'surface') {
        constraints.push('Keep the response brief and focused on key points');
    } else if (intent.depth === 'deep') {
        constraints.push('Provide comprehensive coverage with detailed explanations');
    }

    // Control level constraints
    if (intent.controlLevel === 'high') {
        constraints.push('Follow the exact structure and format specified');
        constraints.push('Do not deviate from the requested scope');
    }

    // Model-specific constraints
    if (modelTarget === 'anthropic') {
        constraints.push('Ensure accuracy, balance, and factual correctness');
    } else if (modelTarget === 'gemini') {
        constraints.push('Ground your response in current best practices and evidence');
    }

    return constraints;
}

function _mapOutputFormat(format, taskType, modelTarget) {
    // Model-specific format descriptions
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

    // 1. ROLE
    if (blueprint.role) {
        parts.push('ROLE:');
        parts.push(blueprint.role);
        parts.push('');
    }

    // 2. OBJECTIVE
    if (blueprint.task) {
        parts.push('OBJECTIVE:');
        let objective = blueprint.task;
        if (modelTarget === 'gemini' && !objective.toLowerCase().startsWith('execute')) {
            // Task-oriented phrasing for Gemini
            objective = `Execute the following task: ${objective}`;
        }
        parts.push(objective + (objective.endsWith('.') ? '' : '.'));
        parts.push('');
    }

    // 3. CONTEXT
    if (blueprint.context) {
        parts.push('CONTEXT:');
        parts.push(blueprint.context);
        parts.push('');
    }

    // 4. CONSTRAINTS
    if (blueprint.constraints && blueprint.constraints.length > 0) {
        parts.push('CONSTRAINTS:');

        let finalConstraints = [...blueprint.constraints];

        if (modelTarget === 'openai') {
            finalConstraints.push('Strictly follow all explicitly stated constraints and formatting rules.');
        } else if (modelTarget === 'anthropic') {
            finalConstraints.push('Maintain high-level structural integrity; avoid excessive bullet nesting.');
        }

        finalConstraints.forEach(c => {
            parts.push(`- ${c}`);
        });
        parts.push('');
    }

    // 5. PROCESS
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

    // 6. OUTPUT FORMAT
    if (blueprint.output_format) {
        parts.push('OUTPUT FORMAT:');
        parts.push(blueprint.output_format + (blueprint.output_format.endsWith('.') ? '' : '.'));
        parts.push('');
    }

    return parts.join('\n').trim();
}

// ════════════════════════════════════════════════════════════════
//  ANALYZER LOOP: AUTO-IMPROVEMENT
// ════════════════════════════════════════════════════════════════

function _improvePrompt(v1Prompt, blueprint, analysis, modelTarget) {
    const changes = [];
    let improved = v1Prompt;
    const dims = analysis.dimension_scores || {};
    const issues = [...(analysis.issues || []), ...(analysis.model_specific_issues || [])];

    // Fix clarity issues
    if (dims.clarity < 4) {
        // Replace vague terms
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

    // Helper to safely append to a section if it exists, otherwise append to end
    const appendToSection = (sectionName, textToAdd) => {
        const regex = new RegExp(`(${sectionName}:\\n)`);
        if (regex.test(improved)) {
            improved = improved.replace(regex, `$1- ${textToAdd}\n`);
        } else {
            improved += `\n\n${sectionName}:\n- ${textToAdd}`;
        }
    };

    // Fix constraint completeness
    if (dims.constraint_completeness < 4) {
        // Add scope if missing
        if (!/\b(\d+\s*words?|\d+\s*sentences?|\d+\s*paragraphs?|brief|concise|keep it short|max\s+\d+|limit\s+to)\b/i.test(improved)) {
            const scope = _getDefaultScope(blueprint._intent ? blueprint._intent.taskType : (blueprint.taskType || 'general'));
            appendToSection('CONSTRAINTS', scope.replace('Scope: ', ''));
            changes.push('Added explicit scope constraint');
        }

        // Add tone if missing
        if (!/\b(tone|style|formal|informal|casual|professional)\b/i.test(improved)) {
            appendToSection('CONSTRAINTS', 'Maintain a professional and informative tone.');
            changes.push('Added explicit tone constraint');
        }
    }

    // Fix output controllability
    if (dims.output_controllability < 4) {
        if (!/\b(format|structure|organize|present|respond as)\b/i.test(improved)) {
            appendToSection('CONSTRAINTS', `Format strictly as requested: ${blueprint.output_format}.`);
            changes.push('Reinforced output format specification');
        }
    }

    // Fix ambiguity
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

    // Fix model alignment
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

    // If no changes were needed, add a general enhancement
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

function _buildExplanation(intent, blueprint, v1Score, v2, modelTarget) {
    const profile = MODEL_PROFILES ? (MODEL_PROFILES[modelTarget] || {}) : {};
    const parts = [];

    // Intent detection
    parts.push(`**Intent detected:** ${intent.taskType} — ${intent.domain}. ` +
        `${intent.subject ? `Subject: "${intent.subject}". ` : ''}` +
        `Control level: ${intent.controlLevel}. Output format: ${intent.outputFormat}.`);

    // Blueprint construction
    parts.push(`**Blueprint built** with ${blueprint.constraints.length} constraints tailored for ${_modelLabel(modelTarget)}. ` +
        `Role, context, task instruction, and output format were all inferred from your input and optimized for ${profile.name || modelTarget}.`);

    // Model awareness
    const modelNotes = {
        openai: 'OpenAI GPT benefits from explicit system roles, structured constraints, and step-by-step reasoning instructions.',
        anthropic: 'Claude excels with XML-tagged sections for clear boundaries, and responds well to thoughtful, well-organized instructions.',
        gemini: 'Gemini performs best when context/background comes before the task instruction, with evidence-based grounding.',
    };
    parts.push(`**Model optimization:** ${modelNotes[modelTarget] || modelNotes.openai}`);

    // Score improvement (if v2 exists)
    if (v1Score && v2) {
        const delta = (v2.score.overall - v1Score.overall).toFixed(1);
        parts.push(`**Auto-improved:** v1 scored ${v1Score.overall.toFixed(1)}/5.0 (below ${IMPROVEMENT_THRESHOLD} threshold). ` +
            `The system revised the prompt and v2 scored ${v2.score.overall.toFixed(1)}/5.0 (+${delta} improvement).`);
    } else if (v1Score) {
        parts.push(`**Quality verified:** The generated prompt scored ${v1Score.overall.toFixed(1)}/5.0, meeting the quality threshold.`);
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

module.exports = { generate };
