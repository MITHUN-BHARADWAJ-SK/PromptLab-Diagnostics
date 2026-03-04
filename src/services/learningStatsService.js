/**
 * PromptLab — Learning Stats Service (v2 — Strict Schema)
 *
 * Incrementally updates a user's aggregated learning statistics
 * after each prompt analysis. Computes running averages, tracks
 * common mistakes, maintains score history, and manages streaks.
 */

const UserLearningStats = require('../models/UserLearningStats');

/**
 * Update learning stats after a new analysis.
 *
 * @param {string} userId        Mongoose ObjectId as string
 * @param {Object} analysis      The analysis result (strict schema)
 * @param {number} analysis.overall_score
 * @param {Object} analysis.dimension_scores
 * @param {Array}  analysis.issues
 */
async function recordAnalysis(userId, analysis) {
    let stats = await UserLearningStats.findOne({ userId });

    if (!stats) {
        stats = new UserLearningStats({ userId });
    }

    const prevTotal = stats.totalPrompts;
    const newTotal = prevTotal + 1;

    // ── Running average (overall) ──────────────────────────────────
    stats.averageScore =
        (stats.averageScore * prevTotal + analysis.overall_score) / newTotal;

    // ── Running averages (per dimension) ───────────────────────────
    for (const dim of Object.keys(analysis.dimension_scores)) {
        const prev = stats.dimensionAverages[dim] || 0;
        stats.dimensionAverages[dim] =
            (prev * prevTotal + analysis.dimension_scores[dim]) / newTotal;
    }
    stats.markModified('dimensionAverages');

    // ── Common mistakes (track by dimension) ────────────────────────
    for (const issue of analysis.issues) {
        const existing = stats.commonMistakes.find(
            (m) => m.issueType === issue.dimension
        );
        if (existing) {
            existing.count += 1;
            existing.lastSeen = new Date();
        } else {
            stats.commonMistakes.push({
                issueType: issue.dimension,
                count: 1,
                lastSeen: new Date(),
            });
        }
    }

    // Sort by count descending, keep top 20
    stats.commonMistakes.sort((a, b) => b.count - a.count);
    if (stats.commonMistakes.length > 20) {
        stats.commonMistakes = stats.commonMistakes.slice(0, 20);
    }

    // ── Score history ──────────────────────────────────────────────
    stats.scoreHistory.push({
        date: new Date(),
        overallScore: analysis.overall_score,
    });

    // Cap history at 365 entries (one per day for a year)
    if (stats.scoreHistory.length > 365) {
        stats.scoreHistory = stats.scoreHistory.slice(-365);
    }

    // ── Streak tracking ───────────────────────────────────────────
    const today = _dateString(new Date());
    const lastActive = stats.lastActiveDate ? _dateString(stats.lastActiveDate) : null;

    if (lastActive === today) {
        // Same day, no streak change
    } else if (lastActive === _dateString(_yesterday())) {
        stats.streakDays += 1;
    } else {
        stats.streakDays = 1;
    }
    stats.lastActiveDate = new Date();

    stats.totalPrompts = newTotal;
    await stats.save();

    return stats;
}

/**
 * Retrieve a user's current learning stats.
 */
async function getStats(userId) {
    const stats = await UserLearningStats.findOne({ userId });
    return stats || { totalPrompts: 0, averageScore: 0, dimensionAverages: {}, commonMistakes: [], scoreHistory: [], streakDays: 0 };
}

/**
 * Return score trends for the last N days.
 */
async function getTrends(userId, days = 30) {
    const stats = await UserLearningStats.findOne({ userId });
    if (!stats || stats.scoreHistory.length === 0) {
        return { period: `${days}d`, data: [] };
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const data = stats.scoreHistory
        .filter((entry) => entry.date >= cutoff)
        .map((entry) => ({
            date: _dateString(entry.date),
            overallScore: entry.overallScore,
        }));

    return { period: `${days}d`, data };
}

// ── Helpers ──────────────────────────────────────────────────────

function _dateString(d) {
    return d.toISOString().slice(0, 10);
}

function _yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
}

module.exports = { recordAnalysis, getStats, getTrends };
