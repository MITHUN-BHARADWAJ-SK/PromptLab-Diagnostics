/**
 * PromptLab — Subscription Tier Definitions
 *
 * Each tier defines feature gates and daily quotas.
 * Add new tiers here; the middleware reads from this map.
 */

const TIERS = {
    free: {
        name: 'Free',
        limit: 5,
        period: 'day',
        features: {
            crossModelAnalysis: false,
            fullBreakdowns: false,
            historyInsights: false,
        },
    },
    starter: {
        name: 'Starter',
        limit: 200,
        period: 'month',
        price: 99,
        features: {
            crossModelAnalysis: true,
            fullBreakdowns: true,
            historyInsights: true,
        },
    },
    pro: {
        name: 'Pro',
        limit: 1000,
        period: 'month',
        price: 299,
        features: {
            crossModelAnalysis: true,
            fullBreakdowns: true,
            historyInsights: true,
        },
    },
    advanced: {
        name: 'Advanced',
        limit: 3000,
        period: 'month',
        price: 499,
        features: {
            crossModelAnalysis: true,
            fullBreakdowns: true,
            historyInsights: true,
        },
    },
    builder: {
        name: 'Builder',
        limit: 5000,
        period: 'month',
        price: 699,
        features: {
            crossModelAnalysis: true,
            fullBreakdowns: true,
            historyInsights: true,
        },
    },
    builder_pro: {
        name: 'Builder Pro',
        limit: 7000,
        period: 'month',
        price: 899,
        features: {
            crossModelAnalysis: true,
            fullBreakdowns: true,
            historyInsights: true,
        },
    },
};

module.exports = TIERS;
