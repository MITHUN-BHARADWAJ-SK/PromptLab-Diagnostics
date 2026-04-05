/**
 * PromptLab — Onboard Auth Middleware
 *
 * The /onboard route can't use the standard auth middleware (the user
 * doesn't have a MongoDB profile yet), but it MUST still verify that
 * the Firebase token is valid and that the externalAuthId in the body
 * matches the token's uid — otherwise anyone can forge profiles.
 */

const admin = require('firebase-admin');
const AppError = require('../utils/AppError');

async function onboardAuth(req, _res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
            throw new AppError('Authorization header required to create a profile.', 401);
        }

        const idToken = authHeader.slice(7);
        let decoded;
        try {
            decoded = await admin.auth().verifyIdToken(idToken);
        } catch {
            throw new AppError('Invalid Firebase token.', 401);
        }

        // The uid in the verified token MUST match what the client sends —
        // prevents a logged-in user from creating a profile for someone else.
        if (decoded.uid !== req.body.externalAuthId) {
            throw new AppError('Token uid does not match externalAuthId.', 403);
        }

        // Stamp the verified uid so the controller doesn't trust req.body
        req.verifiedUid = decoded.uid;
        req.verifiedEmail = decoded.email || req.body.email;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = onboardAuth;
