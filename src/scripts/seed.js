/**
 * PromptLab — Seed Script
 *
 * Creates two test users (free + pro) for local development.
 * Run with: npm run seed
 */

const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');
const UserLearningStats = require('../models/UserLearningStats');

async function seed() {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('✅ MongoDB connected');

        // ── Free-tier test user ────────────────────────────────────
        const freeUser = await User.findOneAndUpdate(
            { externalAuthId: 'test-free-001' },
            {
                externalAuthId: 'test-free-001',
                email: 'student@test.com',
                displayName: 'Test Student (Free)',
                userType: 'student',
                subscriptionTier: 'free',
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        await UserLearningStats.findOneAndUpdate(
            { userId: freeUser._id },
            { userId: freeUser._id },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log(`📦 Free user seeded:  ID=${freeUser._id}  email=${freeUser.email}`);

        // ── Pro-tier test user ─────────────────────────────────────
        const proUser = await User.findOneAndUpdate(
            { externalAuthId: 'test-pro-001' },
            {
                externalAuthId: 'test-pro-001',
                email: 'creator@test.com',
                displayName: 'Test Creator (Pro)',
                userType: 'creator',
                subscriptionTier: 'pro',
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        await UserLearningStats.findOneAndUpdate(
            { userId: proUser._id },
            { userId: proUser._id },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log(`📦 Pro user seeded:   ID=${proUser._id}  email=${proUser.email}`);

        console.log('\n🎉 Seeding complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding failed:', err.message);
        process.exit(1);
    }
}

seed();
