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
            enum: ['free', 'pro'],
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
    },
    { timestamps: true }
);

/** Returns the next midnight UTC from now. */
function _midnight() {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d;
}

module.exports = mongoose.model('User', userSchema);
