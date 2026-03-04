/**
 * PromptLab — UserLearningStats Model
 *
 * Aggregated learning metrics per user, updated incrementally
 * after each prompt analysis. Powers the dashboard.
 */

const mongoose = require('mongoose');

const commonMistakeSchema = new mongoose.Schema(
    {
        issueType: { type: String, required: true },
        count: { type: Number, default: 1 },
        lastSeen: { type: Date, default: Date.now },
    },
    { _id: false }
);

const scoreHistoryEntrySchema = new mongoose.Schema(
    {
        date: { type: Date, required: true },
        overallScore: { type: Number, required: true },
    },
    { _id: false }
);

const userLearningStatsSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        totalPrompts: {
            type: Number,
            default: 0,
        },
        averageScore: {
            type: Number,
            default: 0,
        },
        dimensionAverages: {
            clarity: { type: Number, default: 0 },
            constraintCompleteness: { type: Number, default: 0 },
            modelAlignment: { type: Number, default: 0 },
            ambiguityRisk: { type: Number, default: 0 },
            outputControllability: { type: Number, default: 0 },
        },
        commonMistakes: [commonMistakeSchema],
        scoreHistory: [scoreHistoryEntrySchema],
        streakDays: {
            type: Number,
            default: 0,
        },
        lastActiveDate: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('UserLearningStats', userLearningStatsSchema);
