/**
 * PromptLab — Request Validation Middleware
 *
 * Lightweight schema-check factory. Validates required fields,
 * enum values, and string length constraints on `req.body`.
 *
 * Usage:
 *   validate({
 *     promptText:  { required: true, type: 'string', maxLength: 10000 },
 *     modelTarget: { required: true, type: 'string', enum: ['openai','anthropic','gemini'] },
 *   })
 */

const AppError = require('../utils/AppError');

/**
 * @param {Object} schema  Field name ➜ constraints
 */
function validate(schema) {
    return (req, _res, next) => {
        const errors = [];

        for (const [field, rules] of Object.entries(schema)) {
            const value = req.body[field];

            // Required check
            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push(`"${field}" is required.`);
                continue; // skip further checks for this field
            }

            // Only validate further if value is present
            if (value === undefined || value === null) continue;

            // Type check
            if (rules.type && typeof value !== rules.type) {
                errors.push(`"${field}" must be of type ${rules.type}.`);
                continue;
            }

            // Enum check
            if (rules.enum && !rules.enum.includes(value)) {
                errors.push(`"${field}" must be one of: ${rules.enum.join(', ')}.`);
            }

            // Max length check
            if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
                errors.push(`"${field}" must be at most ${rules.maxLength} characters.`);
            }
        }

        if (errors.length > 0) {
            return next(new AppError(errors.join(' '), 400));
        }

        next();
    };
}

module.exports = validate;
