/**
 * PromptLab — Server Entry Point
 *
 * Bootstraps Express with security, logging, and parsing middleware,
 * connects to MongoDB, registers all API routes, and starts listening.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

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
const paymentRoutes = require('./routes/paymentRoutes');

// ── Express App ──────────────────────────────────────────────────
const app = express();

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",           // required: Tailwind CDN config blocks + inline handlers
                'https://cdn.tailwindcss.com',
                'https://www.gstatic.com',
                'https://apis.google.com',
                'https://checkout.razorpay.com',
            ],
            // script-src-attr removed — onclick attributes now use data-* + event delegation
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            connectSrc: [
                "'self'",
                'https://*.googleapis.com',
                'https://*.firebaseio.com',
                'https://securetoken.googleapis.com',
                'https://api.razorpay.com',
                'https://lumberjack.razorpay.com',
            ],
            frameSrc: ["'self'", 'https://promptlab-abaed.firebaseapp.com', 'https://api.razorpay.com'],
            // data: removed — prevents data-URI script/SVG injection
            imgSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://ui-avatars.com'],
            objectSrc: ["'none'"],           // blocks Flash / plugin exploits
            baseUri: ["'self'"],             // prevents <base> tag hijacking
            upgradeInsecureRequests: [],
        },
    },
    // Additional hardening headers
    crossOriginEmbedderPolicy: false,       // keep false — Firebase SDK needs cross-origin resources
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS (allow all origins in dev, lock down in prod)
app.use(cors());

// Request logging
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// Body parsing — capture rawBody for Razorpay webhook signature verification
app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => { req.rawBody = buf; },
}));

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

// ── Generator Endpoint ───────────────────────────────────────────
const generatorService = require('./services/generatorService');
const { checkGeneration, consumeGeneration } = require('./services/quotaService');
const User = require('./models/User');

app.post('/api/generate', async (req, res) => {
    const { promptText, modelTarget, difficulty, uid } = req.body;
    if (!promptText || !modelTarget) {
        return res.status(400).json({ error: 'promptText and modelTarget are required.' });
    }

    // Enforce per-tier daily generation limit when UID is provided
    let user = null;
    if (uid) {
        try {
            user = await User.findOne({ externalAuthId: uid });
        } catch (_) { /* non-fatal — proceed without limit enforcement */ }

        if (user) {
            const quota = await checkGeneration(user);
            if (quota.remaining <= 0) {
                return res.status(429).json({
                    error: `Daily generation limit reached (${quota.limit}/day for your plan). Resets at midnight UTC.`,
                    limit: quota.limit,
                    used: quota.used,
                    remaining: 0,
                });
            }
        }
    }

    try {
        const result = await generatorService.generate({ promptText, modelTarget, difficulty: difficulty || 'basic' });
        if (result.error) return res.status(400).json({ error: result.error });

        // Consume one generation credit after success
        if (user) {
            await consumeGeneration(user).catch(() => {});
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── API Routes ───────────────────────────────────────────────────
app.use('/api/prompts', promptRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);

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
