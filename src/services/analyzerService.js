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
