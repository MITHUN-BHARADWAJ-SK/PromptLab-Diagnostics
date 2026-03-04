/**
 * PromptLab — Dashboard Controller
 *
 * Provides endpoints that power the user's learning dashboard:
 * prompt history, remaining quota, score trends, and common mistakes.
 */

const Prompt = require('../models/Prompt');
const PromptAnalysis = require('../models/PromptAnalysis');
const quotaService = require('../services/quotaService');
const learningStatsService = require('../services/learningStatsService');

/**
 * GET /api/dashboard/history
 *
 * Returns paginated prompt history with analysis summaries.
 * Query params: ?page=1&limit=20
 */
async function getHistory(req, res, next) {
    try {
        const userId = req.user._id;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const [prompts, total] = await Promise.all([
            Prompt.find({ userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Prompt.countDocuments({ userId }),
        ]);

        // Attach latest analysis to each prompt
        const promptIds = prompts.map((p) => p._id);
        const analyses = await PromptAnalysis.find({ promptId: { $in: promptIds } })
            .sort({ versionNumber: -1 })
            .lean();

        const analysisMap = {};
        for (const a of analyses) {
            const key = a.promptId.toString();
            if (!analysisMap[key]) {
                analysisMap[key] = a; // first one = latest version (sorted desc)
            }
        }

        const results = prompts.map((p) => ({
            promptId: p._id,
            promptText: p.promptText.substring(0, 200) + (p.promptText.length > 200 ? '…' : ''),
            modelTarget: p.modelTarget,
            latestVersion: p.latestVersion,
            latestScore: analysisMap[p._id.toString()]?.overallScore ?? null,
            createdAt: p.createdAt,
        }));

        res.json({
            success: true,
            data: {
                prompts: results,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            },
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/dashboard/quota
 *
 * Returns the user's remaining daily analysis quota.
 */
async function getQuota(req, res, next) {
    try {
        const quota = await quotaService.check(req.user);

        res.json({
            success: true,
            data: {
                tier: req.user.subscriptionTier,
                dailyLimit: quota.limit,
                used: quota.used,
                remaining: quota.remaining,
            },
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/dashboard/trends
 *
 * Returns score trends over the specified period.
 * Query params: ?days=30
 */
async function getTrends(req, res, next) {
    try {
        const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
        const trends = await learningStatsService.getTrends(req.user._id, days);

        const stats = await learningStatsService.getStats(req.user._id);

        res.json({
            success: true,
            data: {
                trends,
                summary: {
                    totalPrompts: stats.totalPrompts,
                    averageScore: Math.round(stats.averageScore * 10) / 10,
                    dimensionAverages: stats.dimensionAverages,
                    streakDays: stats.streakDays,
                },
            },
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/dashboard/mistakes
 *
 * Returns the user's most common prompt-writing mistakes.
 */
async function getMistakes(req, res, next) {
    try {
        const stats = await learningStatsService.getStats(req.user._id);

        res.json({
            success: true,
            data: {
                totalPrompts: stats.totalPrompts,
                commonMistakes: stats.commonMistakes || [],
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { getHistory, getQuota, getTrends, getMistakes };
