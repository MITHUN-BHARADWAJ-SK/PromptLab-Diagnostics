/**
 * PromptLab — Central Error Handler
 *
 * Catches all errors forwarded via next(err) and returns a
 * consistent JSON response. Operational errors expose their
 * message; unexpected errors log a stack trace and return a
 * generic 500.
 */

function errorHandler(err, _req, res, _next) {
    const statusCode = err.statusCode || 500;
    const isOperational = err.isOperational || false;

    // Log unexpected errors for debugging
    if (!isOperational) {
        console.error('💥 UNEXPECTED ERROR:', err);
    }

    res.status(statusCode).json({
        error: true,
        message: isOperational ? err.message : 'Internal server error.',
        ...(process.env.NODE_ENV === 'development' && !isOperational
            ? { stack: err.stack }
            : {}),
    });
}

module.exports = errorHandler;
