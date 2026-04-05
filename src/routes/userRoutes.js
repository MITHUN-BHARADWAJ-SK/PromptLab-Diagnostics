/**
 * PromptLab — User Routes
 *
 * POST /api/users/onboard  → Create user profile
 * GET  /api/users/profile   → Get authenticated user profile
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const onboardAuth = require('../middleware/onboardAuth');
const validate = require('../middleware/validate');

const router = Router();

// Strict rate limit on onboard — 5 accounts per IP per hour
const onboardLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: true, message: 'Too many account creation attempts. Try again later.' },
});

// Onboarding — requires a valid Firebase token; uid must match externalAuthId
router.post(
    '/onboard',
    onboardLimiter,
    onboardAuth,
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
