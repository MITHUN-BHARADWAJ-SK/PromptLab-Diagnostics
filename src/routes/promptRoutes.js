/**
 * PromptLab — Prompt Routes
 *
 * POST /api/prompts/analyze   → Analyze a prompt
 * POST /api/prompts/generate  → Generate improved prompt (auto-analyzed)
 */

const { Router } = require('express');
const promptController = require('../controllers/promptController');
const auth = require('../middleware/auth');
const quotaGuard = require('../middleware/quotaGuard');
const validate = require('../middleware/validate');

const router = Router();

// ── Analyze ──────────────────────────────────────────────────────
router.post(
    '/analyze',
    auth,
    quotaGuard,
    validate({
        promptText: { required: true, type: 'string', maxLength: 10000 },
        modelTarget: { required: true, type: 'string', enum: ['openai', 'anthropic', 'gemini'] },
        exampleOutput: { required: false, type: 'string', maxLength: 10000 },
    }),
    promptController.analyzePrompt
);

// ── Generate ─────────────────────────────────────────────────────
router.post(
    '/generate',
    auth,
    quotaGuard,
    validate({
        promptText: { required: true, type: 'string', maxLength: 10000 },
        modelTarget: { required: true, type: 'string', enum: ['openai', 'anthropic', 'gemini'] },
        taskIntent: { required: false, type: 'string', maxLength: 500 },
        exampleOutput: { required: false, type: 'string', maxLength: 10000 },
        promptId: { required: false, type: 'string' },
    }),
    promptController.generatePrompt
);

module.exports = router;
