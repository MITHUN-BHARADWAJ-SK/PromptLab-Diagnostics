/**
 * PromptLab — Subscription Tier Gate Middleware
 *
 * Factory function: `tierGate('pro')` returns middleware that blocks
 * users whose subscription tier does not meet the minimum requirement.
 */

const AppError = require('../utils/AppError');

const TIER_RANK = { free: 0, pro: 1 };

/**
 * @param {string} requiredTier  Minimum subscription tier ('free' | 'pro')
 */
function tierGate(requiredTier) {
    return (req, _res, next) => {
        const userRank = TIER_RANK[req.user.subscriptionTier] ?? 0;
        const requiredRank = TIER_RANK[requiredTier] ?? 0;

        if (userRank < requiredRank) {
            return next(
                new AppError(
                    `This feature requires a ${requiredTier} subscription. ` +
                    `Your current tier is "${req.user.subscriptionTier}".`,
                    403
                )
            );
        }
        next();
    };
}

module.exports = tierGate;
