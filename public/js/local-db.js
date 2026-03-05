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
            stats: {},
            notifications: {}
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
                dailyCredits: 5, // Default for free tier
                bonusCredits: 0,
                dailyCreditReset: this._nextMidnight(),
                createdAt: new Date().toISOString(),
            };
            db.stats[uid] = {
                totalPrompts: 0,
                averageScore: 0,
                streakDays: 0,
                lastActiveDate: null,
                scoreHistory: [],
                totalCreditsUsed: 0,
            };
            db.notifications[uid] = [];

            // Add initial welcome notification
            db.notifications[uid].unshift({
                id: 'notif_' + Date.now(),
                title: 'Welcome to PromptLab!',
                message: 'You have received your first 5 daily credits.',
                type: 'success', // success, info, warning
                read: false,
                timestamp: new Date().toISOString()
            });

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

    // ── Credit Management ──────────────────────────────────────
    getTierDailyLimit(tier) {
        switch (tier) {
            case 'essential': return 15;
            case 'pro': return 30;
            case 'advanced': return 100;
            case 'enterprise': return 250;
            case 'free':
            default: return 5;
        }
    },

    async checkCredits(uid) {
        const db = getDb();
        const user = db.users[uid];
        if (!user) return { daily: 5, bonus: 0, total: 5, limit: 5 };

        const now = new Date();
        const reset = user.dailyCreditReset ? new Date(user.dailyCreditReset) : now;
        const dailyLimit = this.getTierDailyLimit(user.subscriptionTier);

        // Reset if new day
        if (now >= reset) {
            user.dailyCredits = dailyLimit;
            user.dailyCreditReset = this._nextMidnight();

            // Add automated notification for refill
            if (!db.notifications[uid]) db.notifications[uid] = [];
            db.notifications[uid].unshift({
                id: 'notif_' + Date.now(),
                title: 'Daily Credits Refilled',
                message: `You have received your ${dailyLimit} daily credits according to your ${user.subscriptionTier} plan.`,
                type: 'success',
                read: false,
                timestamp: new Date().toISOString()
            });

            saveDb(db);
        }

        // Ensure properties exist
        if (user.dailyCredits === undefined) user.dailyCredits = dailyLimit;
        if (user.bonusCredits === undefined) user.bonusCredits = 0;

        return {
            daily: user.dailyCredits,
            bonus: user.bonusCredits,
            total: user.dailyCredits + user.bonusCredits,
            limit: dailyLimit
        };
    },

    async consumeCredits(uid, amount) {
        const db = getDb();
        const user = db.users[uid];
        const stats = db.stats[uid];
        if (!user) return false;

        let needed = amount;

        // Deduct from daily first
        if (user.dailyCredits >= needed) {
            user.dailyCredits -= needed;
            needed = 0;
        } else {
            needed -= (user.dailyCredits || 0);
            user.dailyCredits = 0;
        }

        // Deduct from bonus if needed
        if (needed > 0) {
            if ((user.bonusCredits || 0) >= needed) {
                user.bonusCredits -= needed;
                needed = 0;
            }
        }

        if (needed > 0) return false; // Insufficient credits

        if (stats) stats.totalCreditsUsed = (stats.totalCreditsUsed || 0) + amount;

        // Auto-generate notification if actionName was provided (app.js should pass it)
        const actionName = arguments.length > 2 ? arguments[2] : null;
        if (actionName) {
            if (!db.notifications[uid]) db.notifications[uid] = [];
            db.notifications[uid].unshift({
                id: 'notif_' + Date.now(),
                title: 'Credits Consumed',
                message: `Used ${amount} credit(s) for ${actionName}.`,
                type: 'info',
                read: false,
                timestamp: new Date().toISOString()
            });
        }

        saveDb(db);
        return true;
    },

    async addBonusCredits(uid, amount) {
        const db = getDb();
        const user = db.users[uid];
        if (!user) return;
        user.bonusCredits = (user.bonusCredits || 0) + amount;
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

    // ── Internal Helpers ───────────────────────────────────────
    _nextMidnight() {
        const d = new Date();
        d.setHours(24, 0, 0, 0);
        return d.toISOString();
    },

    // ── Notifications ──────────────────────────────────────────
    async addNotification(uid, title, message, type = 'info') {
        const db = getDb();
        // Ensure notifications object exists in db if it's the first time
        if (!db.notifications) db.notifications = {};
        if (!db.users[uid]) return; // User must exist to receive notifications

        if (!db.notifications[uid]) db.notifications[uid] = [];
        db.notifications[uid].unshift({
            id: 'notif_' + Date.now(),
            title,
            message,
            type,
            read: false,
            timestamp: new Date().toISOString()
        });

        // Keep list bounded (e.g. 50 items)
        if (db.notifications[uid].length > 50) {
            db.notifications[uid] = db.notifications[uid].slice(0, 50);
        }

        saveDb(db);
    },

    async getNotifications(uid) {
        const db = getDb();
        return db.notifications?.[uid] || [];
    },

    async markNotificationsRead(uid) {
        const db = getDb();
        if (db.notifications?.[uid]) {
            let changed = false;
            db.notifications[uid].forEach(n => {
                if (!n.read) {
                    n.read = true;
                    changed = true;
                }
            });
            if (changed) saveDb(db);
        }
    }
};

window.PromptLabDB = PromptLabDB;
