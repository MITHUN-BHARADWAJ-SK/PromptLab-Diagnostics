/**
 * PromptLab — Subscription Tier Definitions
 *
 * Each tier defines feature gates and daily quotas.
 * Add new tiers here; the middleware reads from this map.
 */

const TIERS = {
    free: {
        name: 'Free',
        dailyAnalysisLimit: 10,
        features: {
            crossModelAnalysis: false,     // single-model only
            fullBreakdowns: false,         // summary-level explanations
            historyInsights: false,        // no trend / mistake aggregation
        },
    },
    pro: {
        name: 'Pro',
        dailyAnalysisLimit: 200,
        features: {
            crossModelAnalysis: true,
            fullBreakdowns: true,
            historyInsights: true,
        },
    },
};

module.exports = TIERS;
