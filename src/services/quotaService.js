/**
 * PromptLab — Quota Service
 *
 * Manages daily analysis quotas per user.
 * Auto-resets at midnight UTC.
 */

const TIERS = require('../config/tiers');

/**
 * Check the user's remaining quota, resetting if a new day has started.
 * @param {import('mongoose').Document} user  Mongoose User document
 * @returns {{ limit: number, used: number, remaining: number }}
 */
async function check(user) {
    await _resetIfNewDay(user);

    const tierConfig = TIERS[user.subscriptionTier] || TIERS.free;
    const limit = tierConfig.dailyAnalysisLimit;
    const used = user.dailyAnalysisCount;

    return {
        limit,
        used,
        remaining: Math.max(0, limit - used),
    };
}

/**
 * Decrement the user's remaining quota by 1.
 * Call this AFTER a successful analysis.
 */
async function consume(user) {
    await _resetIfNewDay(user);
    user.dailyAnalysisCount += 1;
    await user.save();
}

/**
 * Reset the daily counter if the current time is past the reset timestamp.
 */
async function _resetIfNewDay(user) {
    const now = new Date();
    if (now >= user.dailyAnalysisReset) {
        user.dailyAnalysisCount = 0;
        // Set next reset to upcoming midnight UTC
        const nextMidnight = new Date();
        nextMidnight.setUTCHours(24, 0, 0, 0);
        user.dailyAnalysisReset = nextMidnight;
        await user.save();
    }
}

module.exports = { check, consume };
