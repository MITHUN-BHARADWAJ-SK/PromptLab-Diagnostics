/**
 * PromptLab — Quota Guard Middleware
 *
 * Checks whether the authenticated user has remaining daily analyses.
 * Uses the quotaService for reset logic. Returns 429 if quota exhausted.
 */

const quotaService = require('../services/quotaService');
const AppError = require('../utils/AppError');

async function quotaGuard(req, _res, next) {
    try {
        const { remaining } = await quotaService.check(req.user);

        if (remaining <= 0) {
            throw new AppError(
                'Daily analysis quota exhausted. Upgrade to Pro for more analyses, or try again tomorrow.',
                429
            );
        }

        next();
    } catch (err) {
        next(err);
    }
}

module.exports = quotaGuard;
