/**
 * PromptLab — Payment Routes (Razorpay)
 *
 * POST /api/payments/create-subscription  — create recurring subscription
 * POST /api/payments/confirm              — verify payment + upgrade tier
 * POST /api/payments/create-order         — create one-time credit pack order
 * POST /api/payments/confirm-order        — verify order payment + add credits
 * POST /api/payments/webhook              — Razorpay server-to-server webhook
 * GET  /api/payments/status               — get current subscription status
 */

const { Router } = require('express');
const paymentService = require('../services/paymentService');
const User = require('../models/User');
const TIERS = require('../config/tiers');
const admin = require('firebase-admin');

// Ensure Firebase Admin is initialised (idempotent — auth.js may have done it first)
if (!admin.apps.length) {
    const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
        : admin.credential.applicationDefault();
    admin.initializeApp({ credential, projectId: process.env.FIREBASE_PROJECT_ID || 'promptlab-abaed' });
}

const router = Router();

const VALID_PAID_TIERS = ['starter', 'pro', 'advanced', 'builder', 'builder_pro'];

const TIER_GENERATIONS = {
    starter: 200,
    pro: 1000,
    advanced: 3000,
    builder: 5000,
    builder_pro: 7000,
};

function _nextMonthISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() + 1, 1);
    return d.toISOString();
}

// Update Firestore user document with the new subscription tier + generation quota
async function _updateFirestoreSubscription(uid, tier) {
    try {
        const db = admin.firestore();
        const limit = TIER_GENERATIONS[tier];
        await db.collection('users').doc(uid).update({
            subscriptionTier: tier,
            monthlyGenerations: limit,
            monthlyGenerationReset: _nextMonthISO(),
        });
        console.log(`[Payment] Firestore updated: ${uid} → ${tier} (${limit} gen/mo)`);
    } catch (err) {
        console.error('[Payment] Firestore update failed:', err.message);
    }
}

// Revert Firestore user to free tier when subscription is cancelled/expired
async function _revertFirestoreSubscription(uid) {
    try {
        const db = admin.firestore();
        await db.collection('users').doc(uid).update({
            subscriptionTier: 'free',
            monthlyGenerations: admin.firestore.FieldValue.delete(),
            monthlyGenerationReset: admin.firestore.FieldValue.delete(),
        });
        console.log(`[Payment] Firestore reverted: ${uid} → free`);
    } catch (err) {
        console.error('[Payment] Firestore revert failed:', err.message);
    }
}

// ── Create Subscription ───────────────────────────────────────────
router.post('/create-subscription', async (req, res) => {
    const { tier, uid, currency = 'INR' } = req.body;

    if (!tier || !uid) return res.status(400).json({ error: 'tier and uid are required.' });
    if (!VALID_PAID_TIERS.includes(tier)) return res.status(400).json({ error: 'Invalid tier.' });

    try {
        const user = await User.findOne({ externalAuthId: uid }).maxTimeMS(3000).catch(() => null);
        const subscription = await paymentService.createSubscription({
            tier, uid, currency,
            userEmail: user?.email,
            userName: user?.displayName,
        });
        res.json({
            subscriptionId: subscription.id,
            keyId: process.env.RAZORPAY_KEY_ID,
            currency: currency.toUpperCase(),
        });
    } catch (err) {
        console.error('[Payment] create-subscription error:', err?.error || err.message, err?.statusCode);
        res.status(500).json({ error: err?.error?.description || err.message });
    }
});

// ── Confirm Subscription Payment ──────────────────────────────────
// Called by frontend after Razorpay checkout succeeds.
// Verifies signature server-side, then upgrades the tier in MongoDB.
router.post('/confirm', async (req, res) => {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, uid, tier } = req.body;

    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature || !uid || !tier) {
        return res.status(400).json({ error: 'Missing required payment confirmation fields.' });
    }
    if (!VALID_PAID_TIERS.includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier.' });
    }

    const valid = paymentService.verifySubscriptionSignature({
        razorpay_payment_id,
        razorpay_subscription_id,
        razorpay_signature,
    });
    if (!valid) return res.status(400).json({ error: 'Payment signature verification failed.' });

    try {
        // Update MongoDB
        await User.findOneAndUpdate(
            { externalAuthId: uid },
            {
                subscriptionTier: tier,
                razorpaySubscriptionId: razorpay_subscription_id,
                subscriptionStatus: 'active',
            },
            { new: true }
        ).maxTimeMS(3000).catch((e) => console.warn('[Payment] MongoDB update skipped:', e.message));

        // Update Firestore — this is what the frontend reads
        await _updateFirestoreSubscription(uid, tier);

        res.json({ success: true, tier, subscriptionId: razorpay_subscription_id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Create Credit Pack Order ──────────────────────────────────────
router.post('/create-order', async (req, res) => {
    const { uid, currency = 'INR' } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid is required.' });

    try {
        const { order, credits } = await paymentService.createCreditPackOrder({ uid, currency });
        res.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            credits,
            keyId: process.env.RAZORPAY_KEY_ID,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Confirm Credit Pack Order ─────────────────────────────────────
router.post('/confirm-order', async (req, res) => {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, uid } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !uid) {
        return res.status(400).json({ error: 'Missing required payment confirmation fields.' });
    }

    const valid = paymentService.verifyOrderSignature({
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
    });
    if (!valid) return res.status(400).json({ error: 'Payment signature verification failed.' });

    try {
        // Return success — frontend will add bonus credits in Firestore
        res.json({ success: true, credits: paymentService.CREDIT_PACK['INR'].credits });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Webhook (Razorpay → Server) ───────────────────────────────────
// Receives raw body — must be registered BEFORE express.json() parses it.
router.post('/webhook', (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody;

    if (!rawBody || !signature) return res.status(400).json({ error: 'Missing body or signature.' });

    let valid;
    try {
        valid = paymentService.verifyWebhookSignature(rawBody.toString(), signature);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
    if (!valid) return res.status(400).json({ error: 'Invalid webhook signature.' });

    let event;
    try { event = JSON.parse(rawBody); } catch (_) {
        return res.status(400).json({ error: 'Invalid JSON body.' });
    }

    _handleWebhookEvent(event).catch(err => console.error('[Webhook] Handler error:', err));

    // Acknowledge immediately — processing is async
    res.json({ received: true });
});

async function _handleWebhookEvent(event) {
    const type = event.event;
    const sub = event.payload?.subscription?.entity;
    const payment = event.payload?.payment?.entity;

    // Subscription activated or payment charged → upgrade tier
    if (type === 'subscription.activated' || type === 'subscription.charged') {
        const uid = sub?.notes?.uid;
        const tier = sub?.notes?.tier;
        if (uid && tier && VALID_PAID_TIERS.includes(tier)) {
            await User.findOneAndUpdate(
                { externalAuthId: uid },
                { subscriptionTier: tier, razorpaySubscriptionId: sub.id, subscriptionStatus: 'active' }
            );
            await _updateFirestoreSubscription(uid, tier);
            console.log(`[Webhook] Upgraded ${uid} → ${tier}`);
        }
    }

    // Subscription cancelled or completed → revert to free
    if (type === 'subscription.cancelled' || type === 'subscription.completed') {
        const uid = sub?.notes?.uid;
        if (uid) {
            await User.findOneAndUpdate(
                { externalAuthId: uid },
                { subscriptionTier: 'free', subscriptionStatus: type === 'subscription.cancelled' ? 'cancelled' : 'expired' }
            );
            await _revertFirestoreSubscription(uid);
            console.log(`[Webhook] Reverted ${uid} → free (${type})`);
        }
    }

    // Payment failed on subscription
    if (type === 'subscription.halted') {
        const uid = sub?.notes?.uid;
        if (uid) {
            await User.findOneAndUpdate({ externalAuthId: uid }, { subscriptionStatus: 'halted' });
        }
    }
}

// ── Status Check ──────────────────────────────────────────────────
router.get('/status', async (req, res) => {
    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: 'uid is required.' });

    try {
        const user = await User.findOne({ externalAuthId: uid }).select(
            'subscriptionTier subscriptionStatus razorpaySubscriptionId'
        );
        if (!user) return res.status(404).json({ error: 'User not found.' });

        res.json({
            tier: user.subscriptionTier,
            status: user.subscriptionStatus || null,
            subscriptionId: user.razorpaySubscriptionId || null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
