/**
 * PromptLab — Authentication Middleware (Stub)
 *
 * In production, this would verify a JWT / OAuth token from an
 * external identity provider. For now it reads a plain `x-user-id`
 * header and attaches the corresponding User document to `req.user`.
 *
 * Replace the stub logic here once an auth provider is integrated —
 * no other files need to change.
 */

const User = require('../models/User');
const AppError = require('../utils/AppError');

async function auth(req, _res, next) {
    try {
        const userId = req.headers['x-user-id'];

        if (!userId) {
            throw new AppError('Missing x-user-id header. Authentication required.', 401);
        }

        const user = await User.findById(userId);
        if (!user) {
            throw new AppError('User not found. Invalid credentials.', 401);
        }

        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = auth;
