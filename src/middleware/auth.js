/**
 * PromptLab — Authentication Middleware
 *
 * Verifies a Firebase ID token from the Authorization header,
 * then attaches the matching MongoDB User to req.user.
 *
 * Frontend sends:  Authorization: Bearer <firebase-id-token>
 * Firebase Admin verifies the token's signature + expiry.
 * The decoded uid maps to User.externalAuthId.
 */

const admin = require('firebase-admin');
const User = require('../models/User');
const AppError = require('../utils/AppError');

// Initialise Firebase Admin once (idempotent)
if (!admin.apps.length) {
    const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
        : admin.credential.applicationDefault(); // falls back to GOOGLE_APPLICATION_CREDENTIALS

    admin.initializeApp({
        credential,
        projectId: process.env.FIREBASE_PROJECT_ID || 'promptlab-abaed',
    });
}

async function auth(req, _res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
            throw new AppError('Missing or malformed Authorization header. Expected: Bearer <token>', 401);
        }

        const idToken = authHeader.slice(7); // strip "Bearer "

        // Verify signature, expiry, audience, and issuer — throws on any failure
        let decoded;
        try {
            decoded = await admin.auth().verifyIdToken(idToken, /* checkRevoked= */ true);
        } catch (firebaseErr) {
            const msg = firebaseErr.code === 'auth/id-token-revoked'
                ? 'Token has been revoked. Please sign in again.'
                : 'Invalid or expired token. Please sign in again.';
            throw new AppError(msg, 401);
        }

        // Map Firebase UID → MongoDB User
        const user = await User.findOne({ externalAuthId: decoded.uid });
        if (!user) {
            // User authenticated with Firebase but has no profile yet — onboard first
            throw new AppError('User profile not found. Complete onboarding first.', 403);
        }

        req.user = user;
        req.firebaseUid = decoded.uid; // available for any downstream middleware
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = auth;
