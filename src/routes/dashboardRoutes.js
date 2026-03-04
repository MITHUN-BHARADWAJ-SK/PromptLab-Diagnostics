/**
 * PromptLab — Dashboard Routes
 *
 * GET /api/dashboard/history   → Prompt history
 * GET /api/dashboard/quota     → Daily quota remaining
 * GET /api/dashboard/trends    → Score trends over time
 * GET /api/dashboard/mistakes  → Common mistakes
 */

const { Router } = require('express');
const dashboardController = require('../controllers/dashboardController');
const auth = require('../middleware/auth');
const tierGate = require('../middleware/tierGate');

const router = Router();

// History is available to all tiers
router.get('/history', auth, dashboardController.getHistory);

// Quota is available to all tiers
router.get('/quota', auth, dashboardController.getQuota);

// Trends and mistakes require Pro tier
router.get('/trends', auth, tierGate('pro'), dashboardController.getTrends);
router.get('/mistakes', auth, tierGate('pro'), dashboardController.getMistakes);

module.exports = router;
