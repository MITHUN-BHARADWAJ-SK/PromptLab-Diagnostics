/**
 * PromptLab — Firestore Database Helper
 * 
 * Replaces LocalStorage with Firebase Firestore for all data persistence.
 */

import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    collection,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    serverTimestamp,
    increment,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

const PromptLabDB = {
    // ── User Profile ──────────────────────────────────────────
    async initUserProfile(uid, email, displayName, userType) {
        const db = getFirestore();
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            const userData = {
                uid,
                email,
                displayName,
                userType,
                subscriptionTier: 'free',
                dailyCredits: 5,
                bonusCredits: 0,
                dailyCreditReset: this._nextMidnight(),
                createdAt: serverTimestamp(),
            };
            await setDoc(userRef, userData);

            // Initialize Stats
            await setDoc(doc(db, "stats", uid), {
                totalPrompts: 0,
                averageScore: 0,
                streakDays: 0,
                lastActiveDate: null,
                scoreHistory: [],
                totalCreditsUsed: 0,
            });

            // Initial Welcome Notification
            await this.addNotification(uid, 'Welcome to PromptLab!', 'You have received your first 5 daily credits.', 'success');
        }
        return (await getDoc(userRef)).data();
    },

    async getUserProfile(uid) {
        const db = getFirestore();
        const userSnap = await getDoc(doc(db, "users", uid));
        return userSnap.exists() ? userSnap.data() : null;
    },

    async updateUserProfile(uid, data) {
        const db = getFirestore();
        await updateDoc(doc(db, "users", uid), data);
    },

    // ── Credit Management ──────────────────────────────────────
    getTierLimit(tier) {
        switch (tier) {
            case 'starter': return { limit: 200, period: 'month' };
            case 'pro': return { limit: 1000, period: 'month' };
            case 'advanced': return { limit: 3000, period: 'month' };
            case 'builder': return { limit: 5000, period: 'month' };
            case 'builder_pro': return { limit: 7000, period: 'month' };
            case 'free':
            default: return { limit: 5, period: 'day' };
        }
    },

    // ── Generation Quota (paid tiers only) ────────────────────
    getGenerationLimit(tier) {
        switch (tier) {
            case 'starter': return 200;
            case 'pro': return 1000;
            case 'advanced': return 3000;
            case 'builder': return 5000;
            case 'builder_pro': return 7000;
            default: return null; // free tier uses credits instead
        }
    },

    async checkGenerations(uid) {
        const db = getFirestore();
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return null;

        const user = userSnap.data();
        const limit = this.getGenerationLimit(user.subscriptionTier);
        if (limit === null) return null; // free tier — caller should use checkCredits

        const now = new Date();
        const reset = user.monthlyGenerationReset ? new Date(user.monthlyGenerationReset) : null;

        if (!reset || now >= reset) {
            const nextReset = this._nextMonth();
            await updateDoc(userRef, {
                monthlyGenerations: limit,
                monthlyGenerationReset: nextReset,
            });
            await this.addNotification(uid, 'Generations Refilled',
                `Your ${limit} monthly generations have been reset.`, 'success');
            return { remaining: limit, limit, resetDate: nextReset };
        }

        const remaining = user.monthlyGenerations ?? limit;
        return { remaining, limit, resetDate: user.monthlyGenerationReset };
    },

    async consumeGeneration(uid) {
        const db = getFirestore();
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return false;

        const user = userSnap.data();
        const remaining = user.monthlyGenerations ?? 0;
        if (remaining <= 0) return false;

        await updateDoc(userRef, { monthlyGenerations: increment(-1) });
        return true;
    },

    async checkCredits(uid) {
        const db = getFirestore();
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) return { daily: 5, bonus: 0, total: 5, limit: 5, period: 'day' };

        const user = userSnap.data();
        const now = new Date();
        const tierInfo = this.getTierLimit(user.subscriptionTier);

        // Handle Daily Reset
        if (tierInfo.period === 'day') {
            const reset = user.dailyCreditReset ? new Date(user.dailyCreditReset) : now;
            if (now >= reset) {
                const nextReset = this._nextMidnight();
                const dailyLimit = tierInfo.limit;
                await updateDoc(userRef, {
                    dailyCredits: dailyLimit,
                    dailyCreditReset: nextReset
                });
                await this.addNotification(uid, 'Daily Credits Refilled', `You have received your ${dailyLimit} daily credits.`, 'success');
                return { daily: dailyLimit, bonus: user.bonusCredits || 0, total: dailyLimit + (user.bonusCredits || 0), limit: dailyLimit, period: 'day' };
            }
            return { daily: user.dailyCredits ?? tierInfo.limit, bonus: user.bonusCredits ?? 0, total: (user.dailyCredits ?? tierInfo.limit) + (user.bonusCredits ?? 0), limit: tierInfo.limit, period: 'day' };
        }

        // Handle Monthly Reset
        else {
            const reset = user.monthlyCreditReset ? new Date(user.monthlyCreditReset) : now;
            if (!user.monthlyCreditReset || now >= reset) {
                const nextReset = this._nextMonth();
                const monthlyLimit = tierInfo.limit;
                await updateDoc(userRef, {
                    monthlyCredits: monthlyLimit,
                    monthlyCreditReset: nextReset
                });
                await this.addNotification(uid, 'Monthly Credits Refilled', `You have received your ${monthlyLimit} monthly credits for your ${user.subscriptionTier} plan.`, 'success');
                return { monthly: monthlyLimit, bonus: user.bonusCredits || 0, total: monthlyLimit + (user.bonusCredits || 0), limit: monthlyLimit, period: 'month' };
            }
            return { monthly: user.monthlyCredits ?? tierInfo.limit, bonus: user.bonusCredits ?? 0, total: (user.monthlyCredits ?? tierInfo.limit) + (user.bonusCredits ?? 0), limit: tierInfo.limit, period: 'month' };
        }
    },

    async consumeCredits(uid, amount, actionName = null) {
        const db = getFirestore();
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return false;

        const user = userSnap.data();
        const tierInfo = this.getTierLimit(user.subscriptionTier);

        let currentCredits = tierInfo.period === 'day' ? (user.dailyCredits ?? 0) : (user.monthlyCredits ?? 0);
        let currentBonus = user.bonusCredits ?? 0;

        if (currentCredits + currentBonus < amount) return false;

        let mainDeduct = Math.min(currentCredits, amount);
        let bonusDeduct = amount - mainDeduct;

        const updateData = {
            bonusCredits: increment(-bonusDeduct)
        };

        if (tierInfo.period === 'day') {
            updateData.dailyCredits = increment(-mainDeduct);
        } else {
            updateData.monthlyCredits = increment(-mainDeduct);
        }

        await updateDoc(userRef, updateData);

        // Update total credits used in stats
        await updateDoc(doc(db, "stats", uid), {
            totalCreditsUsed: increment(amount)
        });

        if (actionName) {
            const label = actionName === 'Basic Analysis'
                ? `You used ${amount} credit for analysis.`
                : actionName === 'Prompt Optimization'
                ? `You used ${amount} credits for prompt optimization.`
                : actionName === 'Prompt Generation'
                ? `You used ${amount} credits for prompt generation.`
                : `You used ${amount} credit(s) for ${actionName}.`;
            await this.addNotification(uid, 'Credits Used', label, 'info');
        }

        return true;
    },

    // ── Prompt Analysis Storage ───────────────────────────────
    async saveAnalysis(uid, data) {
        const db = getFirestore();
        const analysisData = {
            userId: uid,
            type: data.type || 'analysis',
            promptText: data.promptText,
            modelTarget: data.modelTarget,
            exampleOutput: data.exampleOutput || null,
            overall_score: data.overall_score || 0,
            dimension_scores: data.dimension_scores || {},
            blueprint_tips: data.blueprint_tips || [],
            issues: data.issues || [],
            suggestions: data.suggestions || [],
            educational_summary: data.educational_summary || '',
            // generation-specific fields
            finalPrompt: data.finalPrompt || null,
            templateUsed: data.templateUsed || null,
            createdAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, "analyses"), analysisData);
        return docRef.id;
    },

    // ── History ───────────────────────────────────────────────
    async getHistory(uid, limitCount = 20) {
        const db = getFirestore();
        // Use only a single-field query to avoid composite index requirement.
        // Sort client-side after fetching.
        const q = query(
            collection(db, "analyses"),
            where("userId", "==", uid),
            limit(limitCount * 2) // fetch extra since we'll sort+trim client-side
        );

        const querySnapshot = await getDocs(q);
        const docs = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort by createdAt descending client-side
        docs.sort((a, b) => {
            const ta = a.createdAt?.seconds ?? 0;
            const tb = b.createdAt?.seconds ?? 0;
            return tb - ta;
        });
        return docs.slice(0, limitCount);
    },

    // ── Learning Stats ────────────────────────────────────────
    async getOrCreateStats(uid) {
        const db = getFirestore();
        const statsRef = doc(db, "stats", uid);
        const statsSnap = await getDoc(statsRef);

        if (!statsSnap.exists()) {
            const initialStats = {
                totalPrompts: 0,
                averageScore: 0,
                streakDays: 0,
                lastActiveDate: null,
                scoreHistory: [],
                totalCreditsUsed: 0
            };
            await setDoc(statsRef, initialStats);
            return initialStats;
        }
        return statsSnap.data();
    },

    async updateStats(uid, analysisResult) {
        const stats = await this.getOrCreateStats(uid);
        const db = getFirestore();
        const statsRef = doc(db, "stats", uid);

        const prevTotal = stats.totalPrompts || 0;
        const newTotal = prevTotal + 1;
        const newAvg = ((stats.averageScore || 0) * prevTotal + (analysisResult.overall_score || 0)) / newTotal;

        const today = new Date().toISOString().slice(0, 10);
        const lastActive = stats.lastActiveDate ? new Date(stats.lastActiveDate.seconds * 1000).toISOString().slice(0, 10) : null;
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

        let streakDays = stats.streakDays || 0;
        if (lastActive === today) { /* same day */ }
        else if (lastActive === yesterday) { streakDays += 1; }
        else { streakDays = 1; }

        const historyItem = { date: today, score: analysisResult.overall_score || 0 };

        await updateDoc(statsRef, {
            totalPrompts: newTotal,
            averageScore: Math.round(newAvg * 10) / 10,
            streakDays,
            lastActiveDate: serverTimestamp(),
            scoreHistory: arrayUnion(historyItem)
        });

        return (await getDoc(statsRef)).data();
    },

    // ── Notifications ──────────────────────────────────────────
    async addNotification(uid, title, message, type = 'info') {
        const db = getFirestore();
        await addDoc(collection(db, "notifications"), {
            userId: uid,
            title,
            message,
            type,
            read: false,
            timestamp: serverTimestamp()
        });
    },

    async getNotifications(uid) {
        const db = getFirestore();
        let querySnapshot;
        try {
            // Prefer indexed query (requires composite index: userId + timestamp desc)
            const q = query(
                collection(db, "notifications"),
                where("userId", "==", uid),
                orderBy("timestamp", "desc"),
                limit(50)
            );
            querySnapshot = await getDocs(q);
        } catch (_) {
            // Composite index not yet built — fall back to unordered query, sort client-side
            const q = query(
                collection(db, "notifications"),
                where("userId", "==", uid),
                limit(50)
            );
            querySnapshot = await getDocs(q);
        }
        const docs = querySnapshot.docs.map(doc => {
            const data = doc.data();
            if (data.timestamp && data.timestamp.toDate) {
                data.timestamp = data.timestamp.toDate();
            }
            return { id: doc.id, ...data };
        });
        // Ensure newest-first order regardless of which query path ran
        docs.sort((a, b) => {
            const ta = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
            const tb = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
            return tb - ta;
        });
        return docs;
    },

    async markNotificationsRead(uid) {
        const db = getFirestore();
        const q = query(
            collection(db, "notifications"),
            where("userId", "==", uid),
            where("read", "==", false)
        );
        const querySnapshot = await getDocs(q);
        const promises = [];
        querySnapshot.forEach((d) => {
            promises.push(updateDoc(doc(db, "notifications", d.id), { read: true }));
        });
        await Promise.all(promises);
    },

    // ── Daily Login Bonus ─────────────────────────────────────
    async claimDailyLoginBonus(uid) {
        const db = getFirestore();
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return { granted: false };

        const user = userSnap.data();
        const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
        const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

        if (user.lastLoginBonusDate === todayStr) {
            return { granted: false }; // Already claimed today
        }

        // ── Streak tracking ──────────────────────────────────────
        // loginStreak counts consecutive calendar days signed in
        let loginStreak = user.loginStreak || 0;
        if (user.lastLoginBonusDate === yesterdayStr) {
            // Continued streak
            loginStreak += 1;
        } else {
            // Missed a day (or first time) — reset to 1
            loginStreak = 1;
        }

        // ── Credit calculation ───────────────────────────────────
        // Free tier: 1 credit/day. Paid tiers: 1 credit/day too (only spec'd free).
        const DAILY_LOGIN_BONUS = 1;
        let totalBonus = DAILY_LOGIN_BONUS;
        let streakMilestone = false;

        if (loginStreak % 5 === 0) {
            // Every 5th consecutive day earns +3 streak bonus credits
            totalBonus += 3;
            streakMilestone = true;
        }

        await updateDoc(userRef, {
            bonusCredits: increment(totalBonus),
            lastLoginBonusDate: todayStr,
            loginStreak,
        });

        if (streakMilestone) {
            await this.addNotification(uid, `🔥 ${loginStreak}-Day Streak!`,
                `You signed in ${loginStreak} days in a row! +${totalBonus} bonus credits (1 daily + 3 streak reward).`, 'success');
        } else {
            await this.addNotification(uid, 'Daily Login Bonus!',
                `+1 bonus credit for signing in today. ${5 - (loginStreak % 5)} more days to your next streak reward!`, 'success');
        }

        return { granted: true, amount: totalBonus, loginStreak, streakMilestone };
    },

    // ── Helpers ───────────────────────────────────────────────
    _nextMidnight() {
        const d = new Date();
        d.setHours(24, 0, 0, 0);
        return d.toISOString();
    },

    _nextMonth() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setMonth(d.getMonth() + 1, 1);
        return d.toISOString();
    }
};

window.PromptLabDB = PromptLabDB;
export default PromptLabDB;
