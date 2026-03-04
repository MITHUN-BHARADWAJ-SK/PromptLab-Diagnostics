# Landing Page, Login Page & Firebase Migration

Migrate PromptLab from Express + MongoDB/Mongoose to a fully client-side Firebase architecture (Firebase Auth for login, Firestore for data, Firebase Hosting for deployment). Add a stunning landing page and a login/signup page.

## User Review Required

> [!IMPORTANT]
> **Architecture Change**: The entire Express backend (server.js, routes, controllers, middleware) will be **removed**. All data operations will happen client-side via Firebase SDK (Firestore + Auth). The analyzer and generator services remain pure JS and run in the browser.
>
> **Firebase Setup Required**: You'll need a Firebase project. I'll add a placeholder config — you'll paste your real Firebase config values before deploying.

> [!WARNING]
> The MongoDB models, Express routes, and all backend middleware will be **deleted**. This is intentional — Firebase replaces all of them.

## Proposed Changes

### Frontend Pages

#### [NEW] [landing.html](file:///F:/PROMPTLAB/public/landing.html)
Stunning, premium landing page with:
- Hero section with animated gradient headline + CTA buttons
- Feature cards (Analyzer, Generator, Dashboard) with hover animations
- Model showcase strip (OpenAI / Claude / Gemini)
- Social proof / stats section  
- Footer with links
- Redirects to `/login.html` or `/index.html` based on auth state

#### [NEW] [login.html](file:///F:/PROMPTLAB/public/login.html)
Firebase Auth login/signup page with:
- Email/password sign-in + sign-up toggle
- Google sign-in button
- Dark theme matching the design system
- Auto-redirect to `/index.html` after successful auth

#### [MODIFY] [index.html](file:///F:/PROMPTLAB/public/index.html)
- Remove the onboarding modal (replaced by Firebase login)
- Add Firebase SDK scripts
- Add auth state listener — redirect to login if not signed in
- Add sign-out button to header

---

### Firebase Integration

#### [NEW] [firebase-config.js](file:///F:/PROMPTLAB/public/js/firebase-config.js)
Firebase SDK initialization + Firestore helper functions:
- `initFirebase()` — initialize app with config
- `signUpEmail()`, `signInEmail()`, `signInGoogle()`, `signOut()`
- `onAuthChange()` — auth state observer
- Firestore CRUD: `saveAnalysis()`, `getHistory()`, `getUserStats()`, `updateQuota()`

#### [MODIFY] [app.js](file:///F:/PROMPTLAB/public/js/app.js)
- Replace all `api()` fetch calls with Firestore SDK calls from `firebase-config.js`
- Remove `onboardUser()` — replaced by Firebase Auth
- Add `checkAuth()` at page load — redirect to login if unauthenticated
- Update `refreshQuota()` to use Firestore user doc
- Add sign-out handler

---

### Styling

#### [NEW] [landing.css](file:///F:/PROMPTLAB/public/css/landing.css)
Landing page styles: hero gradient, feature grid, model strip, animations

#### [NEW] [login.css](file:///F:/PROMPTLAB/public/css/login.css)
Login page styles: centered auth card, input fields, social sign-in button

---

### Firebase Hosting

#### [NEW] [firebase.json](file:///F:/PROMPTLAB/firebase.json)
Firebase Hosting config — serves from `public/`, rewrites for SPA

#### [NEW] [.firebaserc](file:///F:/PROMPTLAB/.firebaserc)
Firebase project alias config (placeholder for user's project ID)

---

### Removed Files

#### [DELETE] `src/server.js` — Express server (replaced by Firebase Hosting)
#### [DELETE] `src/config/index.js` — MongoDB config
#### [DELETE] `src/models/*` — All 5 Mongoose models (replaced by Firestore)
#### [DELETE] `src/controllers/*` — All 3 controllers (logic moves to client)
#### [DELETE] `src/routes/*` — All 3 route files
#### [DELETE] `src/middleware/*` — All 5 middleware files (auth → Firebase Auth)
#### [DELETE] `src/services/quotaService.js` — Quota (moves to Firestore)
#### [DELETE] `src/services/learningStatsService.js` — Stats (moves to Firestore)
#### [DELETE] `src/utils/AppError.js` — Express error class
#### [DELETE] `package.json` — Backend deps (not needed for static hosting)

> [!NOTE]
> **Kept intact**: `src/config/scoring.js`, `src/config/blueprints.js`, `src/services/analyzerService.js`, `src/services/generatorService.js` — these are pure JS and will be bundled into the client as inline modules or imported via script tags.

Since these service files use `require()` (CommonJS), I'll create a **browser-compatible wrapper** that exposes the analyzer and generator as global functions, bundling them into a single `promptlab-engine.js` file.

#### [NEW] [promptlab-engine.js](file:///F:/PROMPTLAB/public/js/promptlab-engine.js)
Browser bundle of the analyzer + generator + scoring + blueprints. All `require()` calls resolved into a single self-contained script.

---

## Verification Plan

### Automated
- Open landing page → verify hero, features, CTA buttons render
- Click "Get Started" → navigates to login page
- Sign up with email → redirected to app
- Sign in with Google → redirected to app
- Analyze a prompt → results saved to Firestore
- Dashboard loads history from Firestore
- Sign out → redirected to login

### Manual
- User provides Firebase config and runs `firebase deploy`
- Verify live site works end-to-end
