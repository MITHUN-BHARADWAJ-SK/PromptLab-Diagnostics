/**
 * PromptLab — PromptAnalysis Model (v2 — Strict Schema)
 *
 * Stores the full five-dimension analysis for a single prompt version.
 * Schema matches the strict rubric engine output exactly.
 */

const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema(
    {
        dimension: {
            type: String,
            enum: [
                'clarity',
                'constraint_completeness',
                'model_alignment',
                'ambiguity_risk',
                'output_controllability',
            ],
            required: true,
        },
        excerpt: { type: String, required: true },
        explanation: { type: String, required: true },
    },
    { _id: false }
);

const suggestionSchema = new mongoose.Schema(
    {
        dimension: {
            type: String,
            enum: [
                'clarity',
                'constraint_completeness',
                'model_alignment',
                'ambiguity_risk',
                'output_controllability',
            ],
            required: true,
        },
        original: { type: String, required: true },
        improved: { type: String, required: true },
    },
    { _id: false }
);

const promptAnalysisSchema = new mongoose.Schema(
    {
        promptId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Prompt',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        versionNumber: {
            type: Number,
            required: true,
        },
        overall_score: {
            type: Number,
            required: true,
            min: 0,
            max: 5,
        },
        dimension_scores: {
            clarity: { type: Number, min: 0, max: 5, required: true },
            constraint_completeness: { type: Number, min: 0, max: 5, required: true },
            model_alignment: { type: Number, min: 0, max: 5, required: true },
            ambiguity_risk: { type: Number, min: 0, max: 5, required: true },
            output_controllability: { type: Number, min: 0, max: 5, required: true },
        },
        issues: [issueSchema],
        suggestions: [suggestionSchema],
        educational_summary: {
            type: String,
            required: true,
        },
        modelTarget: {
            type: String,
            enum: ['openai', 'anthropic', 'gemini'],
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('PromptAnalysis', promptAnalysisSchema);
