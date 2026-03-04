/**
 * PromptLab — Prompt Model
 *
 * A Prompt is the top-level record created when a user first submits
 * a prompt for analysis or generation. It acts as a container for
 * one or more PromptVersions.
 */

const mongoose = require('mongoose');

const promptSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
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
        modelTarget: {
            type: String,
            enum: ['openai', 'anthropic', 'gemini'],
            required: true,
        },
        latestVersion: {
            type: Number,
            default: 1,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Prompt', promptSchema);
