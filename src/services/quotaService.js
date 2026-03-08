/**
 * PromptLab — Quota Service
 *
 * Manages daily analysis quotas per user.
 * Auto-resets at midnight UTC.
 */

const TIERS = require('../config/tiers');

/**
 * Check the user's remaining quota, resetting if a new period (day or month) has started.
 * @param {import('mongoose').Document} user  Mongoose User document
 * @returns {{ limit: number, used: number, remaining: number, period: string }}
 */
async function check(user) {
    await _resetIfNewPeriod(user);

    const tierConfig = TIERS[user.subscriptionTier] || TIERS.free;
    const limit = tierConfig.limit;
    const period = tierConfig.period;
    const used = period === 'day' ? user.dailyAnalysisCount : user.monthlyAnalysisCount;

    return {
        limit,
        used,
        remaining: Math.max(0, limit - used),
        period,
    };
}

/**
 * Decrement the user's remaining quota by 1.
 * Call this AFTER a successful analysis.
 */
async function consume(user) {
    await _resetIfNewPeriod(user);
    const tierConfig = TIERS[user.subscriptionTier] || TIERS.free;

    if (tierConfig.period === 'day') {
        user.dailyAnalysisCount += 1;
    } else {
        user.monthlyAnalysisCount += 1;
    }
    await user.save();
}

/**
 * Reset the daily/monthly counters if the current time is past the reset timestamp.
 */
async function _resetIfNewPeriod(user) {
    const now = new Date();
    let changed = false;

    // Daily Reset
    if (now >= user.dailyAnalysisReset) {
        user.dailyAnalysisCount = 0;
        const nextMidnight = new Date();
        nextMidnight.setUTCHours(24, 0, 0, 0);
        user.dailyAnalysisReset = nextMidnight;
        changed = true;
    }

    // Monthly Reset
    if (!user.monthlyAnalysisReset || now >= user.monthlyAnalysisReset) {
        user.monthlyAnalysisCount = 0;
        const nextMonth = new Date();
        nextMonth.setUTCHours(0, 0, 0, 0);
        nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
        user.monthlyAnalysisReset = nextMonth;
        changed = true;
    }

    if (changed) {
        await user.save();
    }
}

module.exports = { check, consume };
