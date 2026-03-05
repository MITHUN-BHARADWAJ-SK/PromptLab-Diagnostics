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
        const db = getFirestore();
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) return { daily: 5, bonus: 0, total: 5, limit: 5 };

        const user = userSnap.data();
        const now = new Date();
        const reset = user.dailyCreditReset ? new Date(user.dailyCreditReset) : now;
        const dailyLimit = this.getTierDailyLimit(user.subscriptionTier);

        // Reset if new day
        if (now >= reset) {
            const nextReset = this._nextMidnight();
            await updateDoc(userRef, {
                dailyCredits: dailyLimit,
                dailyCreditReset: nextReset
            });

            await this.addNotification(uid, 'Daily Credits Refilled', `You have received your ${dailyLimit} daily credits according to your ${user.subscriptionTier} plan.`, 'success');

            return {
                daily: dailyLimit,
                bonus: user.bonusCredits || 0,
                total: dailyLimit + (user.bonusCredits || 0),
                limit: dailyLimit
            };
        }

        return {
            daily: user.dailyCredits ?? dailyLimit,
            bonus: user.bonusCredits ?? 0,
            total: (user.dailyCredits ?? dailyLimit) + (user.bonusCredits ?? 0),
            limit: dailyLimit
        };
    },

    async consumeCredits(uid, amount, actionName = null) {
        const db = getFirestore();
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return false;

        const user = userSnap.data();
        let currentDaily = user.dailyCredits ?? 0;
        let currentBonus = user.bonusCredits ?? 0;

        if (currentDaily + currentBonus < amount) return false;

        let dailyDeduct = Math.min(currentDaily, amount);
        let bonusDeduct = amount - dailyDeduct;

        await updateDoc(userRef, {
            dailyCredits: increment(-dailyDeduct),
            bonusCredits: increment(-bonusDeduct)
        });

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
    }
};

window.PromptLabDB = PromptLabDB;
export default PromptLabDB;
