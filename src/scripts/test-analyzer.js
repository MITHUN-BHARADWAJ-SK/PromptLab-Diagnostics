/**
 * PromptLab — Standalone Analyzer Test (Model-Specific v5)
 *
 * Tests the analyzer service directly without needing MongoDB.
 * Verifies that each model produces differentiated output.
 *
 * Run: node src/scripts/test-analyzer.js
 */

const analyzerService = require('../services/analyzerService');

const TEST_PROMPT = 'tell me about quantum computing and how it works';
const STRONG_PROMPT = 'Explain the fundamentals of quantum computing for a beginner audience. Format as a markdown document with headers for: Basics, Qubits vs Bits, Key Algorithms, and Real-World Applications. Keep to 300 words. Use a professional, educational tone. Avoid overly technical jargon.';

const MODELS = ['openai', 'anthropic', 'gemini'];

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}`);
        failed++;
    }
}

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║   PromptLab Analyzer — Model-Specific Tests            ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

// ── Test 1: Weak prompt across all models ──
console.log('━━━ Test 1: Weak Prompt Differentiation ━━━');
const weakResults = {};

for (const model of MODELS) {
    const result = analyzerService.analyze({
        promptText: TEST_PROMPT,
        modelTarget: model,
    });
    weakResults[model] = result;

    console.log(`\n🔹 ${model.toUpperCase()}:`);
    assert(!result.error, `${model}: No error`);
    assert(result.overall_score >= 0 && result.overall_score <= 5, `${model}: Score in range (${result.overall_score})`);
    assert(result.model_profile !== undefined, `${model}: Has model_profile`);
    assert(result.model_profile && result.model_profile.name, `${model}: model_profile has name`);
    assert(result.scoring_emphasis && result.scoring_emphasis.length === 5, `${model}: Has 5 scoring_emphasis items`);
    assert(result.optimization_checklist && result.optimization_checklist.length > 0, `${model}: Has optimization_checklist`);
    assert(result.prompt_rewrite_hint !== null, `${model}: Has prompt_rewrite_hint`);
    assert(result.model_specific_issues !== undefined, `${model}: Has model_specific_issues array`);
    assert(result.bonus_patterns_matched !== undefined, `${model}: Has bonus_patterns_matched array`);
}

// ── Test 2: Model profiles are different ──
console.log('\n\n━━━ Test 2: Model Profile Differentiation ━━━');
assert(weakResults.openai.model_profile.name !== weakResults.anthropic.model_profile.name, 'OpenAI vs Anthropic profile names differ');
assert(weakResults.openai.model_profile.name !== weakResults.gemini.model_profile.name, 'OpenAI vs Gemini profile names differ');
assert(weakResults.anthropic.model_profile.color !== weakResults.gemini.model_profile.color, 'Anthropic vs Gemini profile colors differ');

// ── Test 3: Scoring weights differ per model ──
console.log('\n━━━ Test 3: Scoring Weight Differentiation ━━━');
const oaiWeights = weakResults.openai.scoring_emphasis.map(d => `${d.dimension}:${d.weightPercent}`).join(', ');
const claudeWeights = weakResults.anthropic.scoring_emphasis.map(d => `${d.dimension}:${d.weightPercent}`).join(', ');
const geminiWeights = weakResults.gemini.scoring_emphasis.map(d => `${d.dimension}:${d.weightPercent}`).join(', ');

console.log(`  OpenAI weights:   [${oaiWeights}]`);
console.log(`  Anthropic weights: [${claudeWeights}]`);
console.log(`  Gemini weights:    [${geminiWeights}]`);

const oaiFirstDim = weakResults.openai.scoring_emphasis[0].dimension;
const claudeFirstDim = weakResults.anthropic.scoring_emphasis[0].dimension;
const geminiFirstDim = weakResults.gemini.scoring_emphasis[0].dimension;

assert(oaiFirstDim === 'output_controllability', `OpenAI emphasizes output_controllability first (${oaiFirstDim})`);
assert(claudeFirstDim === 'constraint_completeness', `Anthropic emphasizes constraint_completeness first (${claudeFirstDim})`);
assert(geminiFirstDim === 'model_alignment', `Gemini emphasizes model_alignment first (${geminiFirstDim})`);

// ── Test 4: Rewrite hints are model-specific ──
console.log('\n━━━ Test 4: Rewrite Hint Styles ━━━');
assert(weakResults.openai.prompt_rewrite_hint.style === 'system-user', 'OpenAI rewrite style is system-user');
assert(weakResults.anthropic.prompt_rewrite_hint.style === 'xml-tagged', 'Anthropic rewrite style is xml-tagged');
assert(weakResults.gemini.prompt_rewrite_hint.style === 'context-first', 'Gemini rewrite style is context-first');

// ── Test 5: Optimization checklists are model-specific ──
console.log('\n━━━ Test 5: Optimization Checklist Items ━━━');
const oaiChecklistIds = weakResults.openai.optimization_checklist.map(c => c.id);
const claudeChecklistIds = weakResults.anthropic.optimization_checklist.map(c => c.id);
const geminiChecklistIds = weakResults.gemini.optimization_checklist.map(c => c.id);

assert(oaiChecklistIds.includes('system_role'), 'OpenAI checklist has system_role');
assert(oaiChecklistIds.includes('cot_trigger'), 'OpenAI checklist has cot_trigger');
assert(claudeChecklistIds.includes('xml_tags'), 'Anthropic checklist has xml_tags');
assert(claudeChecklistIds.includes('exclusions'), 'Anthropic checklist has exclusions');
assert(geminiChecklistIds.includes('context_first'), 'Gemini checklist has context_first');
assert(geminiChecklistIds.includes('grounding'), 'Gemini checklist has grounding');

// ── Test 6: Strong prompt scores higher ──
console.log('\n━━━ Test 6: Strong Prompt Scores Higher ━━━');
for (const model of MODELS) {
    const strong = analyzerService.analyze({
        promptText: STRONG_PROMPT,
        modelTarget: model,
    });
    assert(strong.overall_score > weakResults[model].overall_score,
        `${model}: Strong prompt (${strong.overall_score}) > Weak prompt (${weakResults[model].overall_score})`);
}

// ── Test 7: Model-specific anti-pattern detection ──
console.log('\n━━━ Test 7: Anti-Pattern Detection ━━━');

// Claude should flag roleplay framing
const claudeRoleplay = analyzerService.analyze({
    promptText: 'You are a wise wizard. Pretend to be an omniscient seer. Tell me the future of technology.',
    modelTarget: 'anthropic',
});
const hasClaudeRpIssue = claudeRoleplay.model_specific_issues.some(i => i.antiPatternId === 'claude_roleplay_framing');
assert(hasClaudeRpIssue, 'Anthropic detects roleplay framing anti-pattern');

// OpenAI should not flag roleplay framing (it's a best practice for GPT)
const oaiRoleplay = analyzerService.analyze({
    promptText: 'You are a wise wizard. Tell me about the future of technology.',
    modelTarget: 'openai',
});
const hasOaiRpIssue = oaiRoleplay.model_specific_issues.some(i => i.antiPatternId === 'claude_roleplay_framing');
assert(!hasOaiRpIssue, 'OpenAI does NOT flag roleplay framing (it\'s a GPT strength)');

// Gemini should flag system-role usage
const geminiRole = analyzerService.analyze({
    promptText: 'You are a helpful assistant. Act as a teacher. Explain quantum computing.',
    modelTarget: 'gemini',
});
const hasGeminiRoleIssue = geminiRole.model_specific_issues.some(i => i.antiPatternId === 'gemini_system_role_overhead');
assert(hasGeminiRoleIssue, 'Gemini detects unnecessary system-role overhead');

// ── Test 8: Scores differ per model for same prompt ──
console.log('\n━━━ Test 8: Score Differentiation ━━━');
const oaiScore = weakResults.openai.overall_score;
const claudeScore = weakResults.anthropic.overall_score;
const geminiScore = weakResults.gemini.overall_score;
console.log(`  OpenAI: ${oaiScore}, Anthropic: ${claudeScore}, Gemini: ${geminiScore}`);
// At least 2 of the 3 scores should differ (due to different weights)
const scoresSet = new Set([oaiScore, claudeScore, geminiScore]);
assert(scoresSet.size >= 2, `At least 2 of 3 model scores differ (got ${scoresSet.size} unique)`);

// ── Test 9: Intent extraction works ──
console.log('\n━━━ Test 9: Intent Extraction ━━━');
const intentTest = analyzerService.analyze({
    promptText: 'Compare Python and JavaScript for web development',
    modelTarget: 'openai',
});
assert(intentTest.intent.task === 'compare', `Intent task: compare (got ${intentTest.intent.task})`);
assert(intentTest.intent.subject !== null, `Intent subject detected: "${intentTest.intent.subject}"`);

// ── Test 10: Invalid input handling ──
console.log('\n━━━ Test 10: Edge Cases ━━━');
const empty = analyzerService.analyze({ promptText: '', modelTarget: 'openai' });
assert(empty.error === 'invalid_input', 'Empty prompt returns error');

const nullText = analyzerService.analyze({ promptText: null, modelTarget: 'openai' });
assert(nullText.error === 'invalid_input', 'Null prompt returns error');

const unknownModel = analyzerService.analyze({ promptText: 'test prompt', modelTarget: 'unknown_model' });
assert(!unknownModel.error, 'Unknown model falls back gracefully');

// ── Summary ──
console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log(`║  Results: ${passed} passed, ${failed} failed${' '.repeat(30 - `${passed} passed, ${failed} failed`.length)}║`);
console.log('╚══════════════════════════════════════════════════════════╝');

process.exit(failed === 0 ? 0 : 1);
