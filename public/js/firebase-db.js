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
            await this.addNotification(uid, 'Credits Consumed', `Used ${amount} credit(s) for ${actionName}.`, 'info');
        }

        return true;
    },

    // ── Prompt Analysis Storage ───────────────────────────────
    async saveAnalysis(uid, data) {
        const db = getFirestore();
        const analysisData = {
            userId: uid,
            promptText: data.promptText,
            modelTarget: data.modelTarget,
            exampleOutput: data.exampleOutput || null,
            overall_score: data.overall_score || 0,
            dimension_scores: data.dimension_scores || {},
            issues: data.issues || [],
            suggestions: data.suggestions || [],
            educational_summary: data.educational_summary || '',
            createdAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, "analyses"), analysisData);
        return docRef.id;
    },

    // ── History ───────────────────────────────────────────────
    async getHistory(uid, limitCount = 20) {
        const db = getFirestore();
        const q = query(
            collection(db, "analyses"),
            where("userId", "==", uid),
            orderBy("createdAt", "desc"),
            limit(limitCount)
        );

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        const q = query(
            collection(db, "notifications"),
            where("userId", "==", uid),
            orderBy("timestamp", "desc"),
            limit(50)
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            // Convert Firestore Timestamp to JS Date for consistency
            if (data.timestamp && data.timestamp.toDate) {
                data.timestamp = data.timestamp.toDate();
            }
            return { id: doc.id, ...data };
        });
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
