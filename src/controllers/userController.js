/**
 * PromptLab — User Controller
 *
 * Handles user onboarding and profile retrieval.
 */

const User = require('../models/User');
const UserLearningStats = require('../models/UserLearningStats');
const AppError = require('../utils/AppError');

/**
 * POST /api/users/onboard
 *
 * Creates a new user profile. In production the externalAuthId
 * would come from the identity provider; here it's provided directly.
 */
async function onboard(req, res, next) {
    try {
        const { externalAuthId, email, displayName, userType } = req.body;

        // Check for existing user
        const existing = await User.findOne({
            $or: [{ externalAuthId }, { email }],
        });

        if (existing) {
            throw new AppError('A user with this auth ID or email already exists.', 409);
        }

        const user = await User.create({
            externalAuthId,
            email,
            displayName,
            userType,
        });

        // Initialise empty learning stats
        await UserLearningStats.create({ userId: user._id });

        res.status(201).json({
            success: true,
            data: {
                userId: user._id,
                email: user.email,
                displayName: user.displayName,
                userType: user.userType,
                subscriptionTier: user.subscriptionTier,
            },
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/users/profile
 *
 * Returns the authenticated user's profile and subscription info.
 * Requires auth middleware to have set req.user.
 */
async function getProfile(req, res, next) {
    try {
        const user = req.user;

        const stats = await UserLearningStats.findOne({ userId: user._id }).lean();

        res.json({
            success: true,
            data: {
                userId: user._id,
                email: user.email,
                displayName: user.displayName,
                userType: user.userType,
                subscriptionTier: user.subscriptionTier,
                stats: stats
                    ? {
                        totalPrompts: stats.totalPrompts,
                        averageScore: Math.round(stats.averageScore * 10) / 10,
                        streakDays: stats.streakDays,
                    }
                    : null,
                createdAt: user.createdAt,
            },
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { onboard, getProfile };
