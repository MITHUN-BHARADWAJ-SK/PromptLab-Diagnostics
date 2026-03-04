/**
 * PromptLab — Server Entry Point
 *
 * Bootstraps Express with security, logging, and parsing middleware,
 * connects to MongoDB, registers all API routes, and starts listening.
 */

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

// ── Route Imports ────────────────────────────────────────────────
const promptRoutes = require('./routes/promptRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const userRoutes = require('./routes/userRoutes');

// ── Express App ──────────────────────────────────────────────────
const app = express();

// Security headers — allow inline scripts for SPA event handlers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://www.gstatic.com', 'https://apis.google.com'],
            'script-src-attr': ["'unsafe-inline'"],
            'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com'],
            'connect-src': ["'self'", 'https://*.googleapis.com', 'https://*.firebaseio.com', 'https://securetoken.googleapis.com'],
            'frame-src': ["'self'", 'https://promptlab-abaed.firebaseapp.com'],
            'img-src': ["'self'", 'data:', 'https://cdn.jsdelivr.net', 'https://ui-avatars.com', 'https://randomuser.me'],
        },
    },
}));

// CORS (allow all origins in dev, lock down in prod)
app.use(cors());

// Request logging
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, '..', 'public')));

// Global rate limiter (100 requests per minute per IP)
app.use(
    rateLimit({
        windowMs: 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: true, message: 'Too many requests. Please slow down.' },
    })
);

// ── Health Check ─────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'PromptLab API',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

// ── API Routes ───────────────────────────────────────────────────
app.use('/api/prompts', promptRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);

// ── SPA Fallback (serve index.html for non-API routes) ───────────
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── 404 Handler (API routes only) ────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({
        error: true,
        message: 'Endpoint not found.',
    });
});

// ── Central Error Handler ────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────
async function start() {
    try {
        let mongoUri = config.mongoUri;

        // Use in-memory MongoDB for development when no external instance is available
        if (process.env.USE_MEMORY_DB === 'true') {
            const { MongoMemoryServer } = require('mongodb-memory-server');
            const mongod = await MongoMemoryServer.create();
            mongoUri = mongod.getUri();
            console.log('📦 Using in-memory MongoDB');
        }

        await mongoose.connect(mongoUri);
        console.log('✅ MongoDB connected');

        app.listen(config.port, () => {
            console.log(`🚀 PromptLab API running on http://localhost:${config.port}`);
            console.log(`   Environment: ${config.nodeEnv}`);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err.message);
        process.exit(1);
    }
}

start();

module.exports = app; // for testing
