# PromptLab Backend — Implementation Plan

Build a production-grade Node.js + Express + MongoDB backend for a SaaS prompt-engineering learning platform.

## Proposed Changes

### Project Scaffolding

#### [NEW] [package.json](file:///f:/PROMPTLAB/package.json)
- Dependencies: `express`, `mongoose`, `dotenv`, `helmet`, `cors`, `express-rate-limit`, `uuid`, `morgan`
- Dev dependencies: `nodemon`
- Scripts: `start`, `dev`, `seed`

#### [NEW] [.env](file:///f:/PROMPTLAB/.env)
- `PORT`, `MONGODB_URI`, `NODE_ENV`

#### [NEW] [src/server.js](file:///f:/PROMPTLAB/src/server.js)
- Express app bootstrapping with middleware stack (helmet, cors, morgan, JSON parser)
- Route registration, MongoDB connection, error handler

---

### Configuration

#### [NEW] [src/config/index.js](file:///f:/PROMPTLAB/src/config/index.js)
- Centralised env-var reader, defaults

#### [NEW] [src/config/tiers.js](file:///f:/PROMPTLAB/src/config/tiers.js)
- Subscription tier constants (`free` / `pro`) with daily quotas and feature flags

#### [NEW] [src/config/scoring.js](file:///f:/PROMPTLAB/src/config/scoring.js)
- Scoring dimension definitions, weight/rules, and model-specific rule sets

---

### Data Models (Mongoose)

#### [NEW] [src/models/User.js](file:///f:/PROMPTLAB/src/models/User.js)
- Fields: `externalAuthId`, `email`, `displayName`, `userType` (student | creator), `subscriptionTier` (free | pro), `dailyAnalysisCount`, `dailyAnalysisReset`, timestamps

#### [NEW] [src/models/Prompt.js](file:///f:/PROMPTLAB/src/models/Prompt.js)
- Fields: `userId`, `promptText`, `exampleOutput`, `modelTarget`, `latestVersion`, timestamps

#### [NEW] [src/models/PromptAnalysis.js](file:///f:/PROMPTLAB/src/models/PromptAnalysis.js)
- Fields: `promptId`, `userId`, `versionNumber`, `overallScore`, `dimensionScores` (clarity/constraintCompleteness/modelAlignment/ambiguityRisk/outputControllability), `highlightedIssues[]`, `modelSpecificSuggestions[]`, `educationalExplanation`, `modelTarget`, timestamps

#### [NEW] [src/models/PromptVersion.js](file:///f:/PROMPTLAB/src/models/PromptVersion.js)
- Fields: `promptId`, `versionNumber`, `promptText`, `exampleOutput`, `analysisId`, timestamps

#### [NEW] [src/models/UserLearningStats.js](file:///f:/PROMPTLAB/src/models/UserLearningStats.js)
- Fields: `userId`, `totalPrompts`, `averageScore`, `dimensionAverages`, `commonMistakes[]` (issueType + count + lastSeen), `scoreHistory[]` (date + score), `streakDays`, timestamps

---

### Core Services

#### [NEW] [src/services/analyzerService.js](file:///f:/PROMPTLAB/src/services/analyzerService.js)
Rule-based, deterministic scoring engine:
- **Clarity** — sentence length, passive voice, vague pronouns, hedge words
- **Constraint Completeness** — presence of format/length/style/audience/tone constraints
- **Model Alignment** — model-specific keywords, system-prompt patterns, model-idiomatic checks
- **Ambiguity Risk** — ambiguous quantifiers, unclear referents, multiple interpretations
- **Output Controllability** — explicit output format, examples given, structured output markers

Each rule produces a deduction from 5.0 with an issue annotation. Overall score = mean of five dimensions.

#### [NEW] [src/services/generatorService.js](file:///f:/PROMPTLAB/src/services/generatorService.js)
- Accept base prompt + intent + model, apply rule-based improvements (add constraints, reduce ambiguity, model-align)
- Auto-call `analyzerService.analyze()` on the improved prompt
- Persist as new `PromptVersion`

#### [NEW] [src/services/learningStatsService.js](file:///f:/PROMPTLAB/src/services/learningStatsService.js)
- Incremental stat updates after each analysis
- Common-mistake aggregation
- Score history append
- Trend computation (last 7/30 days)

#### [NEW] [src/services/quotaService.js](file:///f:/PROMPTLAB/src/services/quotaService.js)
- Check remaining daily quota for user
- Decrement on analysis
- Auto-reset at midnight UTC

---

### Middleware

#### [NEW] [src/middleware/auth.js](file:///f:/PROMPTLAB/src/middleware/auth.js)
- Stub that reads `x-user-id` header and attaches `req.user` from DB. Production-ready slot for JWT / OAuth.

#### [NEW] [src/middleware/tierGate.js](file:///f:/PROMPTLAB/src/middleware/tierGate.js)
- Factory middleware: `tierGate('pro')` blocks free-tier users from gated endpoints

#### [NEW] [src/middleware/quotaGuard.js](file:///f:/PROMPTLAB/src/middleware/quotaGuard.js)
- Checks daily quota via `quotaService`; returns `429` if exhausted

#### [NEW] [src/middleware/validate.js](file:///f:/PROMPTLAB/src/middleware/validate.js)
- Lightweight schema validation (checks required fields, enum values, string lengths)

#### [NEW] [src/middleware/errorHandler.js](file:///f:/PROMPTLAB/src/middleware/errorHandler.js)
- Centralised error formatter returning `{ error, message, details }`

---

### API Routes & Controllers

#### [NEW] [src/routes/promptRoutes.js](file:///f:/PROMPTLAB/src/routes/promptRoutes.js)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/prompts/analyze` | Analyze a prompt |
| POST | `/api/prompts/generate` | Generate improved prompt (auto-analyzed) |

#### [NEW] [src/routes/dashboardRoutes.js](file:///f:/PROMPTLAB/src/routes/dashboardRoutes.js)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/history` | Prompt history for user |
| GET | `/api/dashboard/quota` | Remaining daily quota |
| GET | `/api/dashboard/trends` | Score trends over time |
| GET | `/api/dashboard/mistakes` | Aggregated common mistakes |

#### [NEW] [src/routes/userRoutes.js](file:///f:/PROMPTLAB/src/routes/userRoutes.js)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/users/onboard` | Create user profile |
| GET | `/api/users/profile` | Retrieve profile + tier |

#### [NEW] [src/controllers/promptController.js](file:///f:/PROMPTLAB/src/controllers/promptController.js)
- Delegates to `analyzerService` / `generatorService`, returns structured JSON

#### [NEW] [src/controllers/dashboardController.js](file:///f:/PROMPTLAB/src/controllers/dashboardController.js)
- Queries models + `learningStatsService`

#### [NEW] [src/controllers/userController.js](file:///f:/PROMPTLAB/src/controllers/userController.js)
- Onboarding + profile retrieval

---

### Utilities

#### [NEW] [src/utils/AppError.js](file:///f:/PROMPTLAB/src/utils/AppError.js)
- Custom error class with `statusCode` and `isOperational` flag

#### [NEW] [src/scripts/seed.js](file:///f:/PROMPTLAB/src/scripts/seed.js)
- Seeds a test user (free + pro) for local development and testing

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Rule-based scoring (no LLM calls)** | Deterministic, explainable, zero external dependency — exactly what the spec demands |
| **MongoDB + Mongoose** | Flexible schema for score vectors, issue arrays, and version chains |
| **Auth stub via header** | Keeps architecture auth-ready without coupling to a provider |
| **Auto-analysis on generate** | Generator pipe always routes through Analyzer — enforced at service layer |
| **Quota at middleware level** | Clean separation; routes don't need to know about limits |

## Verification Plan

### Automated Tests

1. **Server startup** — `npm run dev` must start without errors and log `Server running on port ...` + `MongoDB connected`
2. **Seed script** — `npm run seed` creates two test users (free + pro)
3. **cURL integration tests** — run the following commands in order after the server is running:

```bash
# 1. Onboard a test user
curl -s -X POST http://localhost:3000/api/users/onboard \
  -H "Content-Type: application/json" \
  -d '{"externalAuthId":"test-001","email":"student@test.com","displayName":"Test Student","userType":"student"}'

# 2. Get profile
curl -s http://localhost:3000/api/users/profile \
  -H "x-user-id: <userId from step 1>"

# 3. Analyze a prompt (free tier)
curl -s -X POST http://localhost:3000/api/prompts/analyze \
  -H "Content-Type: application/json" \
  -H "x-user-id: <userId>" \
  -d '{"promptText":"tell me about dogs","modelTarget":"openai"}'

# 4. Generate an improved prompt
curl -s -X POST http://localhost:3000/api/prompts/generate \
  -H "Content-Type: application/json" \
  -H "x-user-id: <userId>" \
  -d '{"promptText":"tell me about dogs","taskIntent":"research","modelTarget":"openai"}'

# 5. Dashboard — history, quota, trends, mistakes
curl -s http://localhost:3000/api/dashboard/history -H "x-user-id: <userId>"
curl -s http://localhost:3000/api/dashboard/quota -H "x-user-id: <userId>"
curl -s http://localhost:3000/api/dashboard/trends -H "x-user-id: <userId>"
curl -s http://localhost:3000/api/dashboard/mistakes -H "x-user-id: <userId>"
```

Each endpoint will be verified for correct HTTP status codes and response structure.
