/**
 * PromptLab — Custom Application Error
 *
 * Distinguishes operational errors (bad input, 404s, quota exceeded)
 * from programmer errors. The central error handler uses `isOperational`
 * to decide whether to show the message to the client.
 */

class AppError extends Error {
    /**
     * @param {string} message  Human-readable error message
     * @param {number} statusCode  HTTP status code (default 500)
     */
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
