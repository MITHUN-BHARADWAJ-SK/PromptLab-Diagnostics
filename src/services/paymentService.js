/**
 * PromptLab — Payment Service (Razorpay)
 *
 * Handles subscription creation, order creation (credit packs),
 * payment signature verification, and webhook signature verification.
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');

// ── Tier → Razorpay Plan ID map (from env) ───────────────────────
// Plan IDs are created in the Razorpay Dashboard and stored in .env
// Format: RAZORPAY_PLAN_{TIER}_{CURRENCY}
// e.g.  RAZORPAY_PLAN_STARTER_INR, RAZORPAY_PLAN_PRO_USD
function getPlanId(tier, currency = 'INR') {
    const key = `RAZORPAY_PLAN_${tier.toUpperCase()}_${currency.toUpperCase()}`;
    return process.env[key] || null;
}

function _getClient() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error('Razorpay keys not configured.');
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// ── Subscriptions ─────────────────────────────────────────────────

/**
 * Create a Razorpay subscription for a given tier + currency.
 */
async function createSubscription({ tier, uid, currency = 'INR', userEmail, userName }) {
    const planId = getPlanId(tier, currency);
    if (!planId) {
        throw new Error(
            `No Razorpay plan configured for tier "${tier}" in ${currency}. ` +
            `Set RAZORPAY_PLAN_${tier.toUpperCase()}_${currency.toUpperCase()} in your environment.`
        );
    }

    const razorpay = _getClient();
    const subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        quantity: 1,
        total_count: 0, // 0 = until cancelled (indefinite monthly billing)
        notes: { uid, tier, currency },
        ...(userEmail ? { notify_info: { notify_email: userEmail } } : {}),
    });
    return subscription;
}

/**
 * Verify a subscription payment signature (sent by Razorpay checkout to frontend).
 * Signature = HMAC-SHA256(razorpay_payment_id + "|" + razorpay_subscription_id, key_secret)
 */
function verifySubscriptionSignature({ razorpay_payment_id, razorpay_subscription_id, razorpay_signature }) {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new Error('Razorpay key secret not configured.');
    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
        .digest('hex');
    return expected === razorpay_signature;
}

// ── Credit Pack Orders ────────────────────────────────────────────

const CREDIT_PACK = {
    INR: { amount: 59900, credits: 1000 }, // ₹599 in paise
    USD: { amount: 999, credits: 1000 },   // $9.99 in cents
};

/**
 * Create a one-time Razorpay order for a credit pack purchase.
 */
async function createCreditPackOrder({ uid, currency = 'INR' }) {
    const pack = CREDIT_PACK[currency.toUpperCase()];
    if (!pack) throw new Error(`Unsupported currency: ${currency}`);

    const razorpay = _getClient();
    const order = await razorpay.orders.create({
        amount: pack.amount,
        currency: currency.toUpperCase(),
        notes: { uid, type: 'credit_pack', credits: pack.credits },
    });
    return { order, credits: pack.credits };
}

/**
 * Verify a one-time order payment signature.
 * Signature = HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
 */
function verifyOrderSignature({ razorpay_payment_id, razorpay_order_id, razorpay_signature }) {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new Error('Razorpay key secret not configured.');
    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
    return expected === razorpay_signature;
}

// ── Webhook Verification ──────────────────────────────────────────

/**
 * Verify that a webhook request came from Razorpay.
 * @param {string} rawBody  Raw request body as string
 * @param {string} signature  X-Razorpay-Signature header value
 */
function verifyWebhookSignature(rawBody, signature) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET not configured.');
    const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
    return expected === signature;
}

module.exports = {
    getPlanId,
    createSubscription,
    verifySubscriptionSignature,
    createCreditPackOrder,
    verifyOrderSignature,
    verifyWebhookSignature,
    CREDIT_PACK,
};
