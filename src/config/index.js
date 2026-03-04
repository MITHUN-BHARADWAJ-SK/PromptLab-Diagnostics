/**
 * PromptLab — Centralised Configuration
 * Reads from environment variables with sensible defaults.
 */

require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/promptlab',
  nodeEnv: process.env.NODE_ENV || 'development',
};
