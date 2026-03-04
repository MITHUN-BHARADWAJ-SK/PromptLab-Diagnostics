/**
 * PromptLab — Prompt Controller (v2 — Strict Schema)
 *
 * Handles prompt analysis and generation requests.
 * Orchestrates services + persistence in a single transaction-like flow.
 */

const Prompt = require('../models/Prompt');
const PromptVersion = require('../models/PromptVersion');
const PromptAnalysis = require('../models/PromptAnalysis');
const analyzerService = require('../services/analyzerService');
const generatorService = require('../services/generatorService');
const quotaService = require('../services/quotaService');
const learningStatsService = require('../services/learningStatsService');

/**
 * POST /api/prompts/analyze
 *
 * Accepts a prompt, scores it across five dimensions,
 * persists the result, and returns the strict analysis JSON.
 */
async function analyzePrompt(req, res, next) {
    try {
        const { promptText, exampleOutput, modelTarget } = req.body;
        const userId = req.user._id;

        // 1. Run analysis (strict rubric engine)
        const result = analyzerService.analyze({
            promptText,
            exampleOutput: exampleOutput || null,
            modelTarget,
        });

        // Guard against invalid input
        if (result.error) {
            return res.status(400).json({ error: true, message: result.error });
        }

        // 2. Create Prompt record
        const prompt = await Prompt.create({
            userId,
            promptText,
            exampleOutput: exampleOutput || null,
            modelTarget,
            latestVersion: 1,
        });

        // 3. Persist PromptAnalysis
        const analysis = await PromptAnalysis.create({
            promptId: prompt._id,
            userId,
            versionNumber: 1,
            overall_score: result.overall_score,
            dimension_scores: result.dimension_scores,
            issues: result.issues,
            suggestions: result.suggestions,
            educational_summary: result.educational_summary,
            modelTarget,
        });

        // 4. Create initial PromptVersion
        await PromptVersion.create({
            promptId: prompt._id,
            versionNumber: 1,
            promptText,
            exampleOutput: exampleOutput || null,
            analysisId: analysis._id,
        });

        // 5. Consume quota
        await quotaService.consume(req.user);

        // 6. Update learning stats
        await learningStatsService.recordAnalysis(userId, result);

        // 7. Respond with strict schema + blueprint data + model-specific output
        res.status(201).json({
            success: true,
            data: {
                promptId: prompt._id,
                versionNumber: 1,
                overall_score: result.overall_score,
                dimension_scores: result.dimension_scores,
                scoring_emphasis: result.scoring_emphasis || [],
                intent: result.intent || null,
                structural_comparison: result.structural_comparison || [],
                issues: result.issues,
                model_specific_issues: result.model_specific_issues || [],
                suggestions: result.suggestions,
                educational_summary: result.educational_summary,
                blueprint_tips: result.blueprint_tips || [],
                model_profile: result.model_profile || null,
                prompt_rewrite_hint: result.prompt_rewrite_hint || null,
                optimization_checklist: result.optimization_checklist || [],
                bonus_patterns_matched: result.bonus_patterns_matched || [],
            },
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/prompts/generate
 *
 * Generates an improved prompt based on model requirements
 * and stores it as a new version. No analysis is performed.
 */
async function generatePrompt(req, res, next) {
    try {
        const { promptText, exampleOutput, taskIntent, modelTarget, promptId } = req.body;
        const userId = req.user._id;

        // 1. Generate improved prompt
        const result = generatorService.generate({
            promptText,
            exampleOutput: exampleOutput || null,
            taskIntent: taskIntent || '',
            modelTarget,
        });

        let prompt;
        let versionNumber;

        if (promptId) {
            prompt = await Prompt.findById(promptId);
            if (!prompt) {
                return res.status(404).json({ error: true, message: 'Prompt not found.' });
            }
            versionNumber = prompt.latestVersion + 1;
            prompt.latestVersion = versionNumber;
            await prompt.save();
        } else {
            prompt = await Prompt.create({
                userId,
                promptText: result.improvedPrompt,
                exampleOutput: exampleOutput || null,
                modelTarget,
                latestVersion: 1,
            });
            versionNumber = 1;
        }

        // 2. Create new PromptVersion (no analysis attached)
        await PromptVersion.create({
            promptId: prompt._id,
            versionNumber,
            promptText: result.improvedPrompt,
            exampleOutput: exampleOutput || null,
            analysisId: null, // No analysis for generated
        });

        // 3. Consume quota
        await quotaService.consume(req.user);

        // 4. Respond
        res.status(201).json({
            success: true,
            data: {
                promptId: prompt._id,
                versionNumber,
                originalPrompt: promptText,
                improvedPrompt: result.improvedPrompt,
                improvements: result.improvements,
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { analyzePrompt, generatePrompt };
