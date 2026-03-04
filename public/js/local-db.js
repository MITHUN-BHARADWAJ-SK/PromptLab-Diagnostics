/**
 * PromptLab — LocalStorage Database Helper
 *
 * Provides all database CRUD operations used by the app,
 * storing data completely offline in the browser.
 */

const LOCAL_STORAGE_KEY = 'promptlab_data';

// Initialize state
function getDb() {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
        return {
            users: {},
            analyses: [],
            stats: {}
        };
    }
    return JSON.parse(raw);
}

function saveDb(data) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
}

// ════════════════════════════════════════════════════════════════
//  PromptLabDB — Local CRUD Operations
// ════════════════════════════════════════════════════════════════

const PromptLabDB = {
    // ── Authentication ─────────────────────────────────────────
    signIn(email, password) {
        const db = getDb();
        const user = Object.values(db.users).find(u => u.email === email && u.password === password);
        return user || null;
    },

    signUp(email, password, displayName, userType) {
        const db = getDb();
        if (Object.values(db.users).some(u => u.email === email)) {
            throw new Error('email-already-in-use');
        }

        const uid = 'user_' + Date.now();
        this.initUserProfile(uid, email, displayName, userType);
        return getDb().users[uid];
    },

    initUserProfile(uid, email, displayName, userType) {
        const db = getDb();
        if (!db.users[uid]) {
            db.users[uid] = {
                uid,
                email,
                displayName,
                userType,
                subscriptionTier: 'free',
                dailyAnalysisCount: 0,
                dailyAnalysisReset: this._nextMidnight(),
                createdAt: new Date().toISOString(),
            };
            db.stats[uid] = {
                totalPrompts: 0,
                averageScore: 0,
                streakDays: 0,
                lastActiveDate: null,
                scoreHistory: [],
            };
            saveDb(db);
        }
        return db.users[uid];
    },

    // ── User Profile ──────────────────────────────────────────
    async getUserProfile(uid) {
        const db = getDb();
        return db.users[uid] || null;
    },

    async updateUserProfile(uid, data) {
        const db = getDb();
        if (db.users[uid]) {
            db.users[uid] = { ...db.users[uid], ...data };
            saveDb(db);
        }
    },

    // ── Quota Management ──────────────────────────────────────
    async checkQuota(uid) {
        const db = getDb();
        const user = db.users[uid];
        if (!user) return { limit: 10, used: 0, remaining: 10 };

        const now = new Date();
        const reset = user.dailyAnalysisReset ? new Date(user.dailyAnalysisReset) : now;

        // Reset if new day
        if (now >= reset) {
            user.dailyAnalysisCount = 0;
            user.dailyAnalysisReset = this._nextMidnight();
            saveDb(db);
        }

        const limit = user.subscriptionTier === 'pro' ? 100 : 10;
        const used = user.dailyAnalysisCount || 0;

        return { limit, used, remaining: Math.max(0, limit - used) };
    },

    async consumeQuota(uid) {
        const db = getDb();
        const user = db.users[uid];
        if (!user) return;

        user.dailyAnalysisCount = (user.dailyAnalysisCount || 0) + 1;
        saveDb(db);
    },

    // ── Prompt Analysis Storage ───────────────────────────────
    async saveAnalysis(uid, data) {
        const db = getDb();
        const id = 'analysis_' + Date.now();

        db.analyses.push({
            id,
            userId: uid,
            promptText: data.promptText,
            modelTarget: data.modelTarget,
            exampleOutput: data.exampleOutput || null,
            overall_score: data.overall_score || 0,
            dimension_scores: data.dimension_scores || {},
            issues: data.issues || [],
            suggestions: data.suggestions || [],
            educational_summary: data.educational_summary || '',
            createdAt: new Date().toISOString(),
        });

        saveDb(db);
        return id;
    },

    // ── History ───────────────────────────────────────────────
    async getHistory(uid, limitCount = 20) {
        const db = getDb();
        return db.analyses
            .filter(a => a.userId === uid)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limitCount);
    },

    // ── Learning Stats ────────────────────────────────────────
    async getOrCreateStats(uid) {
        const db = getDb();
        if (!db.stats[uid]) {
            db.stats[uid] = {
                totalPrompts: 0,
                averageScore: 0,
                streakDays: 0,
                lastActiveDate: null,
                scoreHistory: [],
            };
            saveDb(db);
        }
        return db.stats[uid];
    },

    async updateStats(uid, analysisResult) {
        const db = getDb();
        const stats = db.stats[uid] || await this.getOrCreateStats(uid);

        const prevTotal = stats.totalPrompts;
        const newTotal = prevTotal + 1;

        const newAvg = (stats.averageScore * prevTotal + (analysisResult.overall_score || 0)) / newTotal;

        // Streak tracking
        const today = new Date().toISOString().slice(0, 10);
        const lastActive = stats.lastActiveDate ? stats.lastActiveDate.slice(0, 10) : null;
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

        let streakDays = stats.streakDays || 0;
        if (lastActive === today) { /* same day */ }
        else if (lastActive === yesterday) { streakDays += 1; }
        else { streakDays = 1; }

        // Score history (keep last 100)
        const history = stats.scoreHistory || [];
        history.push({ date: today, score: analysisResult.overall_score || 0 });
        if (history.length > 100) history.splice(0, history.length - 100);

        db.stats[uid] = {
            totalPrompts: newTotal,
            averageScore: Math.round(newAvg * 10) / 10,
            streakDays,
            lastActiveDate: new Date().toISOString(),
            scoreHistory: history,
        };

        saveDb(db);
        return db.stats[uid];
    },

    _nextMidnight() {
        const d = new Date();
        d.setUTCHours(24, 0, 0, 0);
        return d.toISOString();
    }
};

window.PromptLabDB = PromptLabDB;
