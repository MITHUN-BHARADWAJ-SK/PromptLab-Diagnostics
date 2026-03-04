/**
 * PromptLab — PromptVersion Model
 *
 * Each time a prompt is edited or generated, a new version is created.
 * This enables v1 → v2 → v3 tracking for learning insight.
 */

const mongoose = require('mongoose');

const promptVersionSchema = new mongoose.Schema(
    {
        promptId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Prompt',
            required: true,
            index: true,
        },
        versionNumber: {
            type: Number,
            required: true,
        },
        promptText: {
            type: String,
            required: true,
            maxlength: 10000,
        },
        exampleOutput: {
            type: String,
            default: null,
            maxlength: 10000,
        },
        analysisId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PromptAnalysis',
            default: null,
        },
    },
    { timestamps: true }
);

// Compound index for efficient version lookups
promptVersionSchema.index({ promptId: 1, versionNumber: 1 }, { unique: true });

module.exports = mongoose.model('PromptVersion', promptVersionSchema);
