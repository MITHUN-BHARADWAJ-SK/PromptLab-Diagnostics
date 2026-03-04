/**
 * PromptLab — User Routes
 *
 * POST /api/users/onboard  → Create user profile
 * GET  /api/users/profile   → Get authenticated user profile
 */

const { Router } = require('express');
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = Router();

// Onboarding (no auth required — this is the first call)
router.post(
    '/onboard',
    validate({
        externalAuthId: { required: true, type: 'string' },
        email: { required: true, type: 'string' },
        displayName: { required: true, type: 'string', maxLength: 100 },
        userType: { required: true, type: 'string', enum: ['student', 'creator'] },
    }),
    userController.onboard
);

// Profile (auth required)
router.get('/profile', auth, userController.getProfile);

module.exports = router;
