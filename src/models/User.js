/**
 * PromptLab — User Model
 *
 * Represents a registered user. Auth is handled externally;
 * `externalAuthId` links to the identity provider.
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        externalAuthId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        displayName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        userType: {
            type: String,
            enum: ['student', 'creator'],
            required: true,
        },
        subscriptionTier: {
            type: String,
            enum: ['free', 'starter', 'pro', 'advanced', 'builder', 'builder_pro'],
            default: 'free',
        },

        // ── Daily Quota Tracking ────────────────────────────────────
        dailyAnalysisCount: {
            type: Number,
            default: 0,
        },
        dailyAnalysisReset: {
            type: Date,
            default: () => _midnight(),
        },

        // ── Monthly Quota Tracking ──────────────────────────────────
        monthlyAnalysisCount: {
            type: Number,
            default: 0,
        },
        monthlyAnalysisReset: {
            type: Date,
            default: () => _nextMonth(),
        },
    },
    { timestamps: true }
);

/** Returns the next midnight UTC from now. */
function _midnight() {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d;
}

/** Returns the first day of the next month UTC. */
function _nextMonth() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
    return d;
}

module.exports = mongoose.model('User', userSchema);
