/**
 * PromptLab — Frontend Application (v4 — Firebase + Client Engine)
 *
 * Single-page app that runs the analyzer engine locally (via promptlab-engine.js)
 * and persists data through Firebase Firestore (via firebase-config.js).
 *
 * Auth is handled by Firebase Auth — user must be signed in to use.
 */

// ════════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════════

const state = {
  uid: null,
  userName: null,
  userEmail: null,
  userTier: 'free',
  userType: 'student',
};

// Model color themes for UI differentiation
const MODEL_COLORS = {
  openai: { primary: '#10a37f', bg: 'rgba(16,163,127,0.08)', border: 'rgba(16,163,127,0.3)', text: '#34d399' },
  anthropic: { primary: '#d97757', bg: 'rgba(217,119,87,0.08)', border: 'rgba(217,119,87,0.3)', text: '#f0a882' },
  gemini: { primary: '#4285f4', bg: 'rgba(66,133,244,0.08)', border: 'rgba(66,133,244,0.3)', text: '#7fb3ff' },
};

// ════════════════════════════════════════════════════════════════
//  AUTH INIT
// ════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  const activeUid = localStorage.getItem('promptlab_active_user');

  if (!activeUid) {
    // Not signed in → redirect to login
    window.location.href = '/login.html';
    return;
  }

  state.uid = activeUid;

  // Load user profile from Local DB
  try {
    let profile = await PromptLabDB.getUserProfile(activeUid);

    if (!profile) {
      console.log('[PromptLab] Profile missing for active UID. Attempting recovery...');
      // Recovery: Re-init profile if UID exists but data is gone (e.g. storage partial clear)
      // We don't have the email/name here, so we use placeholders or wait for next login
      // However, to stop the loop, we MUST either create a profile or clear the UID.
      // If we clear the UID, the user goes to login once and stays there.
      localStorage.removeItem('promptlab_active_user');
      window.location.href = '/login.html';
      return;
    }

    state.userTier = profile.subscriptionTier || 'free';
    state.userType = profile.userType || 'student';
    state.userName = profile.displayName || 'User';
    state.userEmail = profile.email || '';

  } catch (e) {
    console.warn('[PromptLab] Could not load profile:', e);
  }

  updateUserChip();
  refreshCredits();

  // Restore last active view (default: analyzer)
  const savedView = localStorage.getItem('promptlab_active_view') || 'analyzer';
  switchView(savedView);

  // Daily login bonus — +5 bonus credits once per calendar day (accumulates)
  try {
    const bonus = await PromptLabDB.claimDailyLoginBonus(state.uid);
    if (bonus.granted) {
      showToast(`+${bonus.amount} daily login bonus credits added!`, 'success');
      refreshCredits();
    }
  } catch (e) {
    console.warn('[PromptLab] Could not claim daily login bonus:', e);
  }
});

// ════════════════════════════════════════════════════════════════
//  SIGN OUT
// ════════════════════════════════════════════════════════════════

async function signOut() {
  try {
    if (window.firebaseSignOut) {
      await window.firebaseSignOut();
    }
    localStorage.removeItem('promptlab_active_user');
    window.location.href = '/login.html';
  } catch (e) {
    showToast('Failed to sign out.', 'error');
  }
}

// ════════════════════════════════════════════════════════════════
//  VIEW SWITCHING
// ════════════════════════════════════════════════════════════════

function switchView(viewName) {
  localStorage.setItem('promptlab_active_view', viewName);
  // Hide all views
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });

  // Show target view
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.classList.remove('hidden');
    targetView.classList.add('active'); // Keep for fade-in animation
  }

  // Update sidebar buttons
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('active', 'text-primary');
    b.classList.add('text-slate-400');
  });

  const navBtns = document.querySelectorAll(`.nav-btn[data-view="${viewName}"]`);
  navBtns.forEach(btn => {
    btn.classList.remove('text-slate-400');
    btn.classList.add('active', 'text-primary');
  });

  if (viewName === 'dashboard') {
    loadDashboard();
  } else if (viewName === 'profile') {
    loadProfile();
  } else if (viewName === 'notifications') {
    loadNotifications();
  }
}

function updateUserChip() {
  const initial = (state.userName || '?')[0].toUpperCase();
  const name = state.userName || 'User';
  const tier = state.userTier || 'Free Tier';
  const email = state.userEmail || 'email@example.com';

  // Old header chip (if it still exists somewhere)
  const chip = document.getElementById('userChip');
  if (chip) chip.style.display = 'flex';
  if (document.getElementById('userAvatar')) document.getElementById('userAvatar').textContent = initial;
  if (document.getElementById('userName')) document.getElementById('userName').textContent = name;
  if (document.getElementById('userTier')) document.getElementById('userTier').textContent = tier;

  // New Profile Header Pill
  const headerPill = document.getElementById('headerProfilePill');
  if (headerPill) headerPill.style.display = 'flex';
  if (document.getElementById('headerAvatar')) document.getElementById('headerAvatar').textContent = initial;
  if (document.getElementById('headerName')) document.getElementById('headerName').textContent = name;
  if (document.getElementById('headerRole')) document.getElementById('headerRole').textContent = tier;

  // New Profile Page Big View
  if (document.getElementById('profileAvatarBig')) document.getElementById('profileAvatarBig').textContent = initial;
  if (document.getElementById('profileNameBig')) document.getElementById('profileNameBig').textContent = name;
  if (document.getElementById('profileEmailBig')) document.getElementById('profileEmailBig').textContent = email;
  if (document.getElementById('profileDisplayNameInput')) document.getElementById('profileDisplayNameInput').value = name;
  if (document.getElementById('profileEmailInput')) document.getElementById('profileEmailInput').value = email;

  // Refresh credits to update the chip role text
  refreshCredits();
}
// ════════════════════════════════════════════════════════════════
//  PROMPT ANALYZER (runs locally via PromptLabEngine)
// ════════════════════════════════════════════════════════════════

async function analyzePrompt() {
  const promptText = document.getElementById('analyzerPrompt').value.trim();
  const modelTarget = document.getElementById('analyzerModel').value;
  const exampleOutput = document.getElementById('analyzerExample').value.trim() || undefined;

  if (!promptText) {
    showToast('Please enter a prompt to analyze.', 'error');
    return;
  }

  if (!state.uid) {
    showToast('Please sign in first.', 'error');
    return;
  }

  const btn = document.getElementById('analyzeBtn');
  setLoading(btn, true);

  try {
    // Check credits
    const credits = await PromptLabDB.checkCredits(state.uid);
    if (credits.total < 1) {
      showToast('Insufficient credits (1 required). Upgrade your plan or wait for tomorrow.', 'error');
      return;
    }

    // Run analysis locally via engine bundle
    const result = PromptLabEngine.analyze({
      promptText,
      exampleOutput: exampleOutput || null,
      modelTarget,
    });

    if (result.error) {
      showToast(result.error, 'error');
      return;
    }

    // Save to Firestore
    await PromptLabDB.saveAnalysis(state.uid, {
      type: 'analysis',
      promptText,
      modelTarget,
      exampleOutput: exampleOutput || null,
      overall_score: result.overall_score,
      dimension_scores: result.dimension_scores,
      blueprint_tips: result.blueprint_tips || [],
      issues: result.issues || [],
      suggestions: result.suggestions || [],
      educational_summary: result.educational_summary || '',
    });

    // Consume credits
    await PromptLabDB.consumeCredits(state.uid, 1, 'Basic Analysis');

    // Update learning stats
    await PromptLabDB.updateStats(state.uid, result);

    // Render results
    renderAnalysisResults('analyzerResults', result, modelTarget);
    refreshCredits();
  } catch (err) {
    showToast(err.message || 'Analysis failed.', 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function optimizePrompt() {
  const promptText = document.getElementById('analyzerPrompt').value.trim();
  const modelTarget = document.getElementById('analyzerModel').value;

  if (!promptText) {
    showToast('Please enter a prompt to optimize.', 'error');
    return;
  }

  if (!state.uid) {
    showToast('Please sign in first.', 'error');
    return;
  }

  const btn = document.getElementById('optimizeBtn');
  setLoading(btn, true);

  try {
    // Check credits (3 required)
    const credits = await PromptLabDB.checkCredits(state.uid);
    if (credits.total < 3) {
      showToast('Insufficient credits (3 required for optimization). Upgrade your plan or wait for tomorrow.', 'error');
      return;
    }

    // Run analyzer for pentagon metrics
    const analysisResult = PromptLabEngine.analyze({ promptText, modelTarget });
    if (analysisResult.error) {
      showToast(analysisResult.error, 'error');
      return;
    }

    // Run generator to produce the optimized prompt
    const genResult = await PromptLabEngine.generate({ promptText, modelTarget, uid: state.uid });
    if (genResult.error) {
      showToast(genResult.error, 'error');
      return;
    }

    // Inject generated prompt into analysis result as the optimized structure
    const scoreStr = genResult.v1?.score?.overall != null
      ? ` · Score: ${genResult.v1.score.overall.toFixed(1)}/5.0`
      : '';
    analysisResult.prompt_rewrite_hint = {
      template: genResult.finalPrompt,
      description: `Generated by PromptLab Engine (${genResult.templateUsed || 'template'} template${scoreStr}). Ready to paste into ${modelTarget === 'openai' ? 'ChatGPT' : modelTarget === 'anthropic' ? 'Claude' : 'Gemini'}.`,
    };

    await PromptLabDB.consumeCredits(state.uid, 3, 'Prompt Optimization');
    renderAnalysisResults('analyzerResults', analysisResult, modelTarget, true);
    showToast('Optimized prompt generated! See the Optimized Structure section below.', 'success');
    refreshCredits();
  } catch (err) {
    showToast(err.message || 'Optimization failed.', 'error');
  } finally {
    setLoading(btn, false);
  }
}

// ════════════════════════════════════════════════════════════════
//  PROMPT GENERATOR (runs locally via PromptLabEngine)
// ════════════════════════════════════════════════════════════════

async function generatePrompt() {
  const promptText = document.getElementById('generatorPrompt').value.trim();
  const modelTarget = document.getElementById('generatorModel').value;

  if (!promptText) {
    showToast('Please enter a prompt description.', 'error');
    return;
  }

  if (!state.uid) {
    showToast('Please sign in first.', 'error');
    return;
  }

  const btn = document.getElementById('generateBtn');
  const statusEl = document.getElementById('generatorEngineStatus');
  const resultsPanel = document.getElementById('generatorResults');
  resultsPanel.innerHTML = '';
  resultsPanel.classList.remove('visible');
  setLoading(btn, true);

  // Progress indicator helper
  const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

  try {
    // Check credits
    setStatus('CHECKING CREDITS...');
    const credits = await PromptLabDB.checkCredits(state.uid);
    if (credits.total < 3) {
      showToast('Insufficient credits (3 required). Upgrade your plan or wait for tomorrow.', 'error');
      setStatus('INSUFFICIENT CREDITS');
      return;
    }

    // Run the three-layer generation pipeline
    setStatus('LAYER 1: INFERRING INTENT...');
    await new Promise(r => setTimeout(r, 120)); // Let UI repaint

    const genResult = await PromptLabEngine.generate({ promptText, modelTarget, uid: state.uid });

    if (genResult.error) {
      showToast(genResult.error, 'error');
      setStatus('ENGINE: ERROR');
      return;
    }

    setStatus('LAYER 2: BUILDING BLUEPRINT...');
    await new Promise(r => setTimeout(r, 100));

    setStatus('LAYER 3: GENERATING PROMPT...');
    await new Promise(r => setTimeout(r, 100));

    setStatus(genResult.v2 ? 'AUTO-IMPROVING V1 → V2...' : 'SCORING PROMPT...');
    await new Promise(r => setTimeout(r, 100));

    await PromptLabDB.consumeCredits(state.uid, 3, 'Prompt Generation');

    // Save generation to Firestore history
    try {
      await PromptLabDB.saveAnalysis(state.uid, {
        type: 'generation',
        promptText,
        modelTarget,
        overall_score: genResult.v1?.score?.overall || 0,
        dimension_scores: genResult.v1?.score?.dimensions || {},
        finalPrompt: genResult.finalPrompt || '',
        templateUsed: genResult.templateUsed || null,
      });
    } catch (e) { console.warn('Failed to save generation to history:', e); }

    setStatus('ENGINE: COMPLETE');

    // Pass the full generation result to the renderer
    renderGeneratorResults('generatorResults', genResult, modelTarget);
    refreshCredits();
  } catch (err) {
    showToast(err.message || 'Generation failed.', 'error');
    setStatus('ENGINE: ERROR');
  } finally {
    setLoading(btn, false);
  }
}

// ════════════════════════════════════════════════════════════════
//  DASHBOARD (loads from Firestore)
// ════════════════════════════════════════════════════════════════

async function loadDashboard() {
  if (!state.uid) return;

  try {
    // 1. Load Credits safely
    let credits = { total: 0 };
    try {
      credits = await PromptLabDB.checkCredits(state.uid);
    } catch (e) { console.warn("Credits error:", e); }

    // 2. Load Stats safely
    let stats = {};
    try {
      stats = await PromptLabDB.getOrCreateStats(state.uid);
    } catch (e) { console.warn("Stats error:", e); }

    // 3. Load History
    let history = [];
    try {
      history = await PromptLabDB.getHistory(state.uid, 20);
    } catch (e) {
      console.warn("History load error:", e);
      document.getElementById('historyBody').innerHTML = `<div class="p-8 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-[#191919]/40 border border-slate-200 dark:border-white/10 rounded-xl">No activity yet. Analyze or generate a prompt to see it here.</div>`;
    }

    // Populate basic stats
    document.getElementById('statRemaining').textContent = credits.total;
    document.getElementById('statTotal').textContent = stats.totalPrompts || 0;
    document.getElementById('statAvg').textContent =
      typeof stats.averageScore === 'number' ? stats.averageScore.toFixed(1) : '0.0';
    document.getElementById('statStreak').textContent = (stats.streakDays || 0) + ' DAYS';

    // Render components if history is present
    if (history.length > 0) {
      renderHistory(history);
    }

    // Always render radar (it handles empty arrays safely)
    renderDashboardRadar(history);
  } catch (err) {
    showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════════
//  RENDER: ANALYSIS RESULTS (Model-Specific Architecture)
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
//  RENDER: ANALYSIS RESULTS (Vertical Diagnostic Dashboard)
// ════════════════════════════════════════════════════════════════

const BASIC_MODEL_STRUCTURES = {
  openai: `System: You are a [role/expert] specializing in [domain].\n\nUser: [Your task instruction here]\n\nContext: [Relevant background information]\nConstraints: [Rules, format, length, tone]\nFormat: [Expected output structure]`,
  anthropic: `<context>\n[Background information and relevant details here]\n</context>\n\n<instructions>\n[Your task clearly stated here]\n</instructions>\n\n<constraints>\n[Format, length, tone, exclusions]\n</constraints>\n\n<format>\n[Expected output structure]\n</format>`,
  gemini: `Context: [Background information here]\n\nTask: [Your clear instruction here]\n\nRequirements:\n- [Requirement 1]\n- [Requirement 2]\n\nFormat: [Specify output format]\nScope: [Define length and depth]`,
};

function renderAnalysisResults(containerId, data, modelTarget, showOptimized = false) {
  const panel = document.getElementById(containerId);
  const score = data.overall_score || 0;
  const dims = data.dimension_scores || {};
  const issues = data.issues || [];
  const modelIssues = data.model_specific_issues || [];
  const suggestions = data.suggestions || [];
  const summary = data.educational_summary || '';
  const colors = MODEL_COLORS[modelTarget] || MODEL_COLORS.openai;


  // ── 1. SCORE BANNER ─────────────────────────────────────────
  const circumference = 2 * Math.PI * 86;
  const scorePct = Math.min(5, Math.max(0, score)) / 5;
  const scoreOffset = circumference - (scorePct * circumference);
  const scoreLabel = score >= 4 ? 'Excellent' : score >= 3 ? 'Good' : score >= 2 ? 'Needs Work' : 'Weak';
  const scoreColorClass = score >= 4 ? 'text-emerald-500' : score >= 3.5 ? 'text-amber-500' : 'text-primary';

  let html = `
    <section class="max-w-5xl mx-auto mb-8 mt-8">
      <div class="bg-surface border border-neutral-800 p-8 rounded-xl flex flex-col md:flex-row items-center gap-12 relative overflow-hidden">
          <div class="absolute top-0 right-0 p-4">
              <span class="material-icons-outlined text-primary/10 text-8xl rotate-12">${score >= 4 ? 'verified' : 'warning'}</span>
          </div>
          <div class="relative w-48 h-48 flex items-center justify-center shrink-0">
              <svg class="w-full h-full -rotate-90">
                  <circle class="text-neutral-900" cx="96" cy="96" fill="transparent" r="86" stroke="currentColor" stroke-width="8"></circle>
                  <circle class="${scoreColorClass}" cx="96" cy="96" fill="transparent" r="86" stroke="currentColor" stroke-dasharray="${circumference}" stroke-dashoffset="${scoreOffset}" stroke-linecap="round" stroke-width="8"></circle>
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                  <span class="text-5xl font-black ${scoreColorClass} text-glow">${score.toFixed(1)}</span>
                  <span class="text-[10px] font-mono text-neutral-500 mt-1">SCORE / 5.0</span>
              </div>
          </div>
          <div class="flex-1 relative z-10">
              <h2 class="text-3xl font-extrabold text-white text-center sm:text-left">${scoreLabel}</h2>
          </div>
      </div>
    </section>
  `;

  // ── 2. METRIC PENTAGON DIAGNOSTIC ─────────────────────────────
  const dimValues = [
    dims.constraint_strength || 0,
    dims.intent_clarity || 0,
    dims.structural_completeness || 0,
    dims.execution_readiness || 0,
    dims.model_compatibility || 0
  ];
  const dimLabels = ['Constraint Strength', 'Intent Clarity', 'Completeness', 'Exec Readiness', 'Model Alignment'];

  const angles = [0, 72, 144, 216, 288].map(d => (d * Math.PI) / 180);
  const r = 80;
  const cx = 100;
  function getPoint(val, idx) {
    const v = (Math.max(0, Math.min(5, val)) / 5) * r;
    return (cx + v * Math.sin(angles[idx])).toFixed(1) + ',' + (cx - v * Math.cos(angles[idx])).toFixed(1);
  }

  const pts = dimValues.map((v, i) => getPoint(v, i)).join(' ');
  const circleTags = dimValues.map((v, i) => {
    const pt = getPoint(v, i).split(',');
    return '<circle cx="' + pt[0] + '" cy="' + pt[1] + '" fill="#EF4444" r="3"></circle>';
  }).join('');

  const labelTags = dimLabels.map((label, i) => {
    const labelRadius = 108;
    const tx = (cx + labelRadius * Math.sin(angles[i])).toFixed(1);
    const ty = (cx - labelRadius * Math.cos(angles[i])).toFixed(1);

    let anchor = "middle";
    if (Math.sin(angles[i]) > 0.1) anchor = "start";
    else if (Math.sin(angles[i]) < -0.1) anchor = "end";

    // Split long labels into two tspan lines
    const words = label.split(' ');
    let textContent;
    if (words.length > 1) {
      const mid = Math.ceil(words.length / 2);
      const line1 = words.slice(0, mid).join(' ');
      const line2 = words.slice(mid).join(' ');
      textContent = '<tspan x="' + tx + '" dy="-0.6em">' + line1 + '</tspan>' +
                    '<tspan x="' + tx + '" dy="1.2em">' + line2 + '</tspan>';
    } else {
      textContent = label;
    }

    return '<text x="' + tx + '" y="' + ty + '" text-anchor="' + anchor + '" dominant-baseline="middle" class="fill-neutral-400 font-mono font-bold uppercase" style="font-size:6px;letter-spacing:0.05em">' + textContent + '</text>';
  }).join('');

  html += '<section class="max-w-5xl mx-auto mb-8">' +
    '<div class="bg-surface border border-neutral-800 rounded-xl overflow-hidden">' +
    '<div class="px-6 py-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">' +
    '<h3 class="text-xs font-mono font-bold uppercase tracking-widest flex items-center gap-2">' +
    '<span class="material-icons-outlined text-sm">radar</span> Metric Pentagon Diagnostic</h3>' +
    '<div class="text-[10px] font-mono text-neutral-500 uppercase">Analysis Engine Active</div>' +
    '</div>' +
    '<div class="p-10 flex flex-col md:flex-row items-center gap-12">' +
    '<div class="relative w-80 h-80 shrink-0 md:w-96 md:h-96 mx-auto overflow-visible">' +
    '<svg class="w-full h-full" viewBox="-55 -40 310 280" style="overflow:visible">' +
    '<polygon class="radar-grid" points="100,20 176,75 147,165 53,165 24,75"></polygon>' +
    '<polygon class="radar-grid" points="100,40 157,81 135,149 65,149 43,81"></polygon>' +
    '<polygon class="radar-grid" points="100,60 138,87 123,133 77,133 62,87"></polygon>' +
    '<polygon class="radar-grid" points="100,80 119,93 111,117 89,117 81,93"></polygon>' +
    '<line class="radar-axis" x1="100" x2="100" y1="100" y2="20"></line>' +
    '<line class="radar-axis" x1="100" x2="176" y1="100" y2="75"></line>' +
    '<line class="radar-axis" x1="100" x2="147" y1="100" y2="165"></line>' +
    '<line class="radar-axis" x1="100" x2="53" y1="100" y2="165"></line>' +
    '<line class="radar-axis" x1="100" x2="24" y1="100" y2="75"></line>' +
    '<polygon class="radar-area" points="' + pts + '"></polygon>' + circleTags + labelTags +
    '</svg>' +
    '</div>' +
    '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">';

  dimValues.forEach((v, i) => {
    const pct = ((v / 5) * 100).toFixed(0);
    const isGood = v >= 3.5;
    const isExcellent = v >= 4.5;
    const isWarning = v < 2.0;
    const colorClass = isGood ? 'text-emerald-500' : 'text-primary';
    const bgClass = isGood ? 'bg-emerald-500' : 'bg-primary';
    const icon = isGood ? (isExcellent ? 'check_circle' : 'trending_up') : (isWarning ? 'priority_high' : 'trending_down');

    html += '<div class="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg ' + (i === 4 ? 'sm:col-span-2' : '') + '">' +
      '<div class="text-[10px] font-mono font-bold text-neutral-500 uppercase mb-2">' + dimLabels[i] + '</div>' +
      '<div class="flex items-center justify-between mb-1">' +
      '<span class="text-lg font-mono font-bold ' + colorClass + '">' + pct + '%</span>' +
      '<span class="material-icons-outlined text-xs ' + colorClass + '">' + icon + '</span>' +
      '</div>' +
      '<div class="w-full bg-neutral-800 h-1 rounded-full overflow-hidden">' +
      '<div class="' + bgClass + ' h-full transition-all duration-700" style="width: ' + pct + '%"></div>' +
      '</div>' +
      '</div>';
  });

  html += '</div></div></div></section>';

  // ── 3. OPTIMIZATION CHECKLIST ────────────────────────────────
  if (data.optimization_checklist && data.optimization_checklist.length > 0) {
    const passedCount = data.optimization_checklist.filter(c => c.passed).length;
    const totalCount = data.optimization_checklist.length;
    const checklistPct = Math.round((passedCount / totalCount) * 100);
    const statusColor = passedCount === totalCount ? 'text-emerald-500' : 'text-primary';

    html += '<section class="max-w-5xl mx-auto mb-8">' +
      '<div class="bg-surface border border-neutral-800 rounded-xl overflow-hidden">' +
      '<div class="px-6 py-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">' +
      '<h3 class="text-xs font-mono font-bold uppercase tracking-widest flex items-center gap-2">' +
      '<span class="material-icons-outlined text-sm">checklist</span> Optimization Checklist</h3>' +
      '<span class="text-[10px] font-mono font-bold ' + statusColor + '">' + passedCount + '/' + totalCount + ' ELEMENTS FOUND (' + checklistPct + '%)</span>' +
      '</div>' +
      '<div class="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';

    data.optimization_checklist.forEach(item => {
      const cls = item.passed ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5';
      const iconCls = item.passed ? 'text-emerald-500' : 'text-primary';
      const iconMode = item.passed ? 'check' : 'close';

      html += '<div class="flex items-center gap-3 p-3 rounded-lg border ' + cls + '">' +
        '<span class="material-icons-outlined ' + iconCls + '">' + iconMode + '</span>' +
        '<span class="text-[10px] font-mono font-bold uppercase tracking-widest truncate ' + (item.passed ? 'text-emerald-500/90' : 'text-primary/90') + '">' + escapeHtml(item.label) + '</span>' +
        '</div>';
    });

    html += '</div></div></section>';
  }

  // ── 4. PROMPT BLUEPRINT ──────────────────────────────────────
  if (data.structural_comparison && data.structural_comparison.length > 0) {
    const presentCount = data.structural_comparison.filter(e => e.present).length;
    const totalBp = data.structural_comparison.length;
    const bpPct = (presentCount / totalBp) * 100;

    html += '<section class="max-w-5xl mx-auto mb-8">' +
      '<div class="bg-surface border border-neutral-800 rounded-xl p-6">' +
      '<div class="flex justify-between items-center mb-6">' +
      '<h3 class="text-xs font-mono font-bold uppercase tracking-widest flex items-center gap-2">' +
      '<span class="material-icons-outlined text-sm">architecture</span> Prompt Blueprint</h3>' +
      '<div class="flex items-center gap-2">' +
      '<div class="w-24 h-2 bg-neutral-800 rounded-full overflow-hidden">' +
      '<div class="bg-primary h-full transition-all duration-700" style="width: ' + bpPct + '%"></div>' +
      '</div>' +
      '<span class="text-[10px] font-mono text-neutral-500">' + presentCount + '/' + totalBp + ' ELEMENTS</span>' +
      '</div>' +
      '</div>' +
      '<div class="space-y-6">';

    const reqEls = data.structural_comparison.filter(e => e.tier === 'required');
    if (reqEls.length > 0) {
      html += '<div>' +
        '<div class="text-[9px] font-mono text-neutral-500 uppercase mb-3 tracking-widest">Required Elements</div>' +
        '<div class="flex flex-wrap gap-3">';

      reqEls.forEach(el => {
        if (el.present) {
          html += '<div class="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded flex items-center gap-2">' +
            '<span class="material-icons-outlined text-xs text-emerald-500">verified</span>' +
            '<div class="flex flex-col">' +
            '<span class="text-[10px] font-bold uppercase text-white">' + escapeHtml(el.label) + '</span>' +
            '<span class="text-[8px] font-mono text-emerald-500">IDENTIFIED</span>' +
            '</div></div>';
        } else {
          html += '<div class="px-4 py-2 bg-red-500/5 border border-red-500/20 rounded flex items-center gap-2 opacity-60">' +
            '<span class="material-icons-outlined text-xs text-primary">cancel</span>' +
            '<div class="flex flex-col">' +
            '<span class="text-[10px] font-bold uppercase text-white">' + escapeHtml(el.label) + '</span>' +
            '<span class="text-[8px] font-mono text-primary">MISSING</span>' +
            '</div></div>';
        }
      });
      html += '</div></div>';
    }

    const recEls = data.structural_comparison.filter(e => e.tier === 'recommended' || e.tier === 'optional');
    if (recEls.length > 0) {
      html += '<div>' +
        '<div class="text-[9px] font-mono text-neutral-500 uppercase mb-3 tracking-widest">Recommended</div>' +
        '<div class="flex flex-wrap gap-3">';

      recEls.forEach(el => {
        if (el.present) {
          html += '<div class="px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded flex items-center gap-2 opacity-80">' +
            '<span class="material-icons-outlined text-xs text-emerald-500">check_circle</span>' +
            '<span class="text-[10px] font-bold uppercase text-white">' + escapeHtml(el.label) + '</span>' +
            '</div>';
        } else {
          html += '<div class="px-3 py-2 border border-neutral-800 rounded flex items-center gap-2 opacity-40">' +
            '<span class="material-icons-outlined text-xs text-white">radio_button_unchecked</span>' +
            '<span class="text-[10px] font-bold uppercase text-white">' + escapeHtml(el.label) + '</span>' +
            '</div>';
        }
      });
      html += '</div></div>';
    }

    html += '</div></div></section>';
  }

  // ── 5. PROMPT STRUCTURE (only when Optimize was clicked) ─────
  if (showOptimized && data.prompt_rewrite_hint) {
    const modelNames = { openai: 'OpenAI GPT', anthropic: 'Anthropic Claude', gemini: 'Google Gemini' };
    const modelName = modelNames[modelTarget] || modelTarget;

    const structureTitle = modelName + ' — Optimized Structure';
    const structureDesc = data.prompt_rewrite_hint.description || 'Rewritten prompt based on analysis findings.';
    const structureText = data.prompt_rewrite_hint.template;
    const structureId = 'rewriteHintClean';

    // Parse System/User/XML blocks for colored rendering
    const templateRows = escapeHtml(structureText).split('\n');
    let formattedTemplate = '';
    const metadataHtml = [];
    templateRows.forEach(row => {
      if (row.startsWith('System:')) {
        formattedTemplate += '<p><span class="text-primary font-bold">System:</span>' + row.substring(7) + '</p>';
      } else if (row.startsWith('User:')) {
        formattedTemplate += '<p class="mt-4"><span class="text-primary font-bold">User:</span>' + row.substring(5) + '</p>';
      } else if (row.startsWith('Task:') || row.startsWith('Context:') || row.startsWith('Constraints:') || row.startsWith('Format:') || row.startsWith('Scope:') || row.startsWith('Tone:')) {
        const parts = row.split(':');
        metadataHtml.push('<p><span class="text-neutral-500 text-xs">' + parts[0] + ':</span> ' + parts.slice(1).join(':') + '</p>');
      } else if (row.startsWith('&lt;') || row.startsWith('-')) {
        formattedTemplate += '<p class="text-neutral-400">' + row + '</p>';
      } else if (row.trim()) {
        formattedTemplate += '<p>' + row + '</p>';
      } else {
        formattedTemplate += '<br/>';
      }
    });

    const borderClass = 'border-primary/20 bg-primary/5';
    const headerClass = 'border-primary/20 bg-primary/5';
    const iconName = 'auto_fix_high';
    const iconBg = 'bg-primary';

    html += '<section class="max-w-5xl mx-auto mb-12">' +
      '<div class="border rounded-xl overflow-hidden ' + borderClass + '">' +
      '<div class="px-6 py-4 border-b flex justify-between items-center ' + headerClass + '">' +
      '<div class="flex items-center gap-3">' +
      '<div class="w-8 h-8 rounded ' + iconBg + ' flex items-center justify-center">' +
      '<span class="material-icons-outlined text-white text-lg">' + iconName + '</span>' +
      '</div>' +
      '<h3 class="text-sm font-bold tracking-tight text-white">' + structureTitle + '</h3>' +
      '</div>' +
      '<button class="text-xs font-mono font-bold text-primary flex items-center gap-1 hover:underline" onclick="navigator.clipboard.writeText(document.getElementById(\'' + structureId + '\').textContent)">' +
      'COPY <span class="material-icons-outlined text-xs">content_copy</span>' +
      '</button>' +
      '</div>' +
      '<div class="p-6">' +
      '<p class="text-xs text-neutral-400 mb-4 italic">' + structureDesc + '</p>' +
      '<div class="bg-black/80 rounded-lg p-6 font-mono text-sm text-neutral-300 leading-relaxed space-y-1 border border-white/5">' +
      formattedTemplate +
      (metadataHtml.length > 0 ? '<div class="pt-4 border-t border-white/10 space-y-2">' + metadataHtml.join('') + '</div>' : '') +
      '</div>' +
      '<div id="' + structureId + '" style="display:none;">' + escapeHtml(structureText) + '</div>' +
      '</div>' +
      '</div>' +
      '</section>';
  }

  // ── 6. TIPS ──────────────────────────────────────────────────
  if (data.blueprint_tips && data.blueprint_tips.length > 0) {
    html += '<section class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">';
    const idxCat = ['Model Alignment Tip', 'Control Strategy', 'Context Guidance', 'Formatting Rule'];
    const iconList = ['lightbulb', 'settings_input_component', 'find_in_page', 'rule'];

    data.blueprint_tips.slice(0, 4).forEach((tip, idx) => {
      html += '<div class="p-5 bg-surface border border-neutral-800 rounded-lg flex gap-4">' +
        '<span class="material-icons-outlined text-primary">' + iconList[idx % 4] + '</span>' +
        '<div>' +
        '<h4 class="text-xs font-bold uppercase mb-1 text-white">' + idxCat[idx % 4] + '</h4>' +
        '<p class="text-xs text-neutral-400 leading-normal">' + escapeHtml(tip) + '</p>' +
        '</div></div>';
    });
    html += '</section>';
  }

  panel.innerHTML = html;
  panel.classList.add('visible');
}

// ════════════════════════════════════════════════════════════════
//  RENDER: GENERATOR RESULTS
// ════════════════════════════════════════════════════════════════

function renderGeneratorResults(containerId, data, modelTarget) {
  const panel = document.getElementById(containerId);
  const intent = data.intent || {};
  const blueprint = data.blueprint || {};
  const v1 = data.v1 || {};
  const v2 = data.v2 || null;
  const improvements = data.improvements || [];
  const whyItWorks = data.whyItWorks || '';
  const finalPrompt = data.finalPrompt || v1.prompt || '';
  const finalScore = data.finalScore || v1.score || null;

  const modelNames = { openai: 'OpenAI GPT', anthropic: 'Anthropic Claude', gemini: 'Google Gemini' };
  const modelName = modelNames[modelTarget] || modelTarget;
  let html = '';

  // ── 1. FINAL GENERATED PROMPT ──────────────────────────────
  html += `
    <section class="max-w-5xl mx-auto mb-8 mt-8">
      <div class="bg-surface border border-neutral-800 rounded-xl overflow-hidden relative">
        <div class="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none"></div>
        <div class="px-6 py-4 border-b border-neutral-800 flex justify-between items-center relative z-10">
          <h2 class="text-lg font-extrabold text-white flex items-center gap-2">
            <span class="material-icons-outlined text-primary">auto_awesome</span>
            Generated Prompt for ${escapeHtml(modelName)}
          </h2>
          <button onclick="_copyGenPrompt()" class="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-800 hover:bg-primary/20 text-xs font-mono font-bold text-neutral-400 hover:text-primary transition-all">
            COPY <span class="material-icons-outlined text-sm">content_copy</span>
          </button>
        </div>
        <div class="p-6 relative z-10">
          <div id="genPromptClean" class="bg-black/60 rounded-lg p-6 font-mono text-sm text-neutral-200 leading-relaxed border border-neutral-800/50 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">${escapeHtml(finalPrompt)}</div>
        </div>
      </div>
    </section>
  `;

  // ── 2. AUTO-SCORE ──────────────────────────────────────────
  if (finalScore) {
    const overallPct = ((finalScore.overall / 5) * 100).toFixed(0);
    const scoreLabel = finalScore.overall >= 4 ? 'Excellent' : finalScore.overall >= 3 ? 'Good' : finalScore.overall >= 2 ? 'Needs Work' : 'Weak';
    const scoreColor = finalScore.overall >= 4 ? 'text-emerald-500' : finalScore.overall >= 3 ? 'text-amber-500' : 'text-primary';
    const dims = finalScore.dimensions || {};
    const dimLabels = ['Controllability', 'Clarity', 'Completeness', 'Ambiguity Risk', 'Model Alignment'];
    const dimKeys = ['output_controllability', 'clarity', 'constraint_completeness', 'ambiguity_risk', 'model_alignment'];

    html += `
    <section class="max-w-5xl mx-auto mb-8">
      <div class="bg-surface border border-neutral-800 rounded-xl overflow-hidden">
        <div class="px-6 py-3 border-b border-neutral-800 bg-neutral-900/50 flex items-center gap-3">
          <span class="material-icons-outlined text-primary text-sm">speed</span>
          <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-500">Auto-Score — Analyzed by PromptLab Engine</span>
        </div>
        <div class="p-6">
          <div class="flex items-center gap-6 mb-6">
            <div class="text-4xl font-black ${scoreColor}">${finalScore.overall.toFixed(1)}<span class="text-lg text-neutral-600">/5.0</span></div>
            <div>
              <div class="text-sm font-bold text-white">${scoreLabel}</div>
              <div class="text-[10px] font-mono text-neutral-500 uppercase">${v2 ? 'V2 — AUTO-IMPROVED' : 'V1 — FIRST PASS'}</div>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
    `;

    dimKeys.forEach((key, i) => {
      const val = dims[key] || 0;

      // For Ambiguity Risk: raw score 5 = "no risk", 0 = "high risk"
      // So risk percentage = (5 - val) / 5 * 100
      const pct = key === 'ambiguity_risk' ? (((5 - val) / 5) * 100).toFixed(0) : ((val / 5) * 100).toFixed(0);

      // Val >= 3.5 is good for ALL metrics (meaning 5 = best)
      const isGood = val >= 3.5;

      // For ambiguity risk, if it's NOT good (high risk), use red instead of primary color
      const colorGood = 'emerald-500';
      const colorBad = key === 'ambiguity_risk' ? 'red-500' : 'primary';

      const barColor = isGood ? `bg-${colorGood}` : `bg-${colorBad}`;
      const textColor = isGood ? `text-${colorGood}` : `text-${colorBad}`;

      html += `
        <div class="p-3 bg-neutral-900/50 border border-neutral-800 rounded-lg">
          <div class="text-[9px] font-mono font-bold text-neutral-500 uppercase mb-2">${dimLabels[i]}</div>
          <div class="flex items-center gap-2">
            <div class="flex-1 bg-neutral-800 h-1.5 rounded-full overflow-hidden">
              <div class="${barColor} h-full rounded-full transition-all duration-700" style="width: ${pct}%"></div>
            </div>
            <span class="text-xs font-mono font-bold ${textColor}">${pct}%</span>
          </div>
        </div>
      `;
    });

    html += `
          </div>
        </div>
      </div>
    </section>
    `;
  }

  // ── 3. V1 → V2 COMPARISON (if auto-improvement triggered) ──
  if (v2 && v1.score) {
    const v1Score = (v1.score.overall || 0).toFixed(1);
    const v2Score = (v2.score.overall || 0).toFixed(1);
    const delta = (v2.score.overall - v1.score.overall).toFixed(1);

    html += `
    <section class="max-w-5xl mx-auto mb-8">
      <div class="bg-surface border border-neutral-800 rounded-xl overflow-hidden">
        <div class="px-6 py-3 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="material-icons-outlined text-emerald-500 text-sm">trending_up</span>
            <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-500">Auto-Improvement Loop</span>
          </div>
          <span class="text-xs font-mono font-bold text-emerald-500">+${delta} improvement</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-px bg-neutral-800">
          <div class="p-6 bg-surface">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">V1</span>
              <span class="text-[10px] font-mono text-primary">${v1Score}/5.0</span>
            </div>
            <div class="bg-black/60 rounded-lg p-4 font-mono text-xs text-neutral-500 leading-relaxed border border-neutral-800 max-h-48 overflow-y-auto whitespace-pre-wrap">${escapeHtml(v1.prompt || '')}</div>
          </div>
          <div class="p-6 bg-surface">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500">V2</span>
              <span class="text-[10px] font-mono text-emerald-500">${v2Score}/5.0</span>
            </div>
            <div class="bg-black/60 rounded-lg p-4 font-mono text-xs text-neutral-300 leading-relaxed border border-emerald-500/20 max-h-48 overflow-y-auto whitespace-pre-wrap">${escapeHtml(v2.prompt || '')}</div>
          </div>
        </div>
    `;

    // Show improvements list
    if (improvements.length > 0) {
      html += '<div class="px-6 pb-6"><div class="text-[10px] font-mono font-bold uppercase text-neutral-500 mb-2">CHANGES APPLIED</div>';
      improvements.forEach(imp => {
        html += '<div class="flex items-center gap-2 mb-1"><span class="material-icons-outlined text-xs text-emerald-500">check</span><span class="text-xs text-neutral-400">' + escapeHtml(imp) + '</span></div>';
      });
      html += '</div>';
    }

    html += '</div></section>';
  }

  // ── 4. INTENT & BLUEPRINT ─────────────────────────────────
  html += `
    <section class="max-w-5xl mx-auto mb-8">
      <div class="bg-black/40 border border-primary/20 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl shadow-primary/5">
        <div class="px-8 py-5 border-b border-primary/10 flex justify-between items-center bg-gradient-to-r from-primary/10 to-transparent">
          <div class="flex items-center gap-3">
             <div class="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
             <h3 class="text-xs font-mono font-bold uppercase tracking-widest text-primary/90">
               INTENT & BLUEPRINT ANALYSIS
             </h3>
          </div>
          <span class="text-[9px] font-mono font-bold text-neutral-500 uppercase tracking-widest">LAYER 1 & 2</span>
        </div>
        
        <div class="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-primary/10">
          
          <!-- Intent side -->
          <div class="flex-1 p-8 bg-black/20">
            <h4 class="text-white font-bold mb-6 flex items-center gap-2"><span class="material-icons-outlined text-primary text-sm">psychology</span> Inferred Intent</h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="group p-4 bg-surface/50 border border-neutral-800/50 hover:border-primary/30 rounded-xl transition-all hover:bg-primary/5">
                <div class="text-[9px] font-mono text-neutral-500 uppercase mb-1 group-hover:text-primary/70 transition-colors">Task Type</div>
                <div class="text-sm font-semibold text-white capitalize">${escapeHtml(intent.taskType || 'general')}</div>
              </div>
              <div class="group p-4 bg-surface/50 border border-neutral-800/50 hover:border-primary/30 rounded-xl transition-all hover:bg-primary/5">
                <div class="text-[9px] font-mono text-neutral-500 uppercase mb-1 group-hover:text-primary/70 transition-colors">Domain</div>
                <div class="text-sm font-semibold text-white capitalize">${escapeHtml(intent.domain || 'General')}</div>
              </div>
              <div class="group p-4 bg-surface/50 border border-neutral-800/50 hover:border-primary/30 rounded-xl transition-all hover:bg-primary/5">
                <div class="text-[9px] font-mono text-neutral-500 uppercase mb-1 group-hover:text-primary/70 transition-colors">Format</div>
                <div class="text-sm font-semibold text-white capitalize">${escapeHtml(intent.outputFormat || 'auto')}</div>
              </div>
              <div class="group p-4 bg-surface/50 border border-neutral-800/50 hover:border-primary/30 rounded-xl transition-all hover:bg-primary/5">
                <div class="text-[9px] font-mono text-neutral-500 uppercase mb-1 group-hover:text-primary/70 transition-colors">Control Level</div>
                <div class="text-sm font-semibold text-white capitalize flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full ${(intent.controlLevel || '') === 'high' ? 'bg-primary' : (intent.controlLevel || '') === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
                    ${escapeHtml(intent.controlLevel || 'medium')}
                </div>
              </div>
            </div>
          </div>
          
          <!-- Blueprint side -->
          <div class="flex-1 p-8 bg-gradient-to-br from-surface/20 to-black/40">
            <h4 class="text-white font-bold mb-6 flex items-center gap-2"><span class="material-icons-outlined text-primary text-sm">architecture</span> Prompt Blueprint</h4>
            
            <div class="space-y-4">
               <div>
                  <div class="text-[10px] uppercase font-mono text-primary/70 mb-1 flex justify-between"><span>System Role</span><span class="text-neutral-600">Contextual Base</span></div>
                  <div class="text-xs text-neutral-300 font-mono leading-relaxed bg-black/40 p-3 border border-neutral-800/50 rounded-lg whitespace-pre-wrap">${escapeHtml((blueprint.role || '').substring(0, 200))}${(blueprint.role || '').length > 200 ? '…' : ''}</div>
               </div>
               
               <div>
                  <div class="text-[10px] uppercase font-mono text-primary/70 mb-1 flex justify-between"><span>Core Task</span><span class="text-neutral-600">Instruction</span></div>
                  <div class="text-xs text-neutral-300 font-mono leading-relaxed bg-black/40 p-3 border border-neutral-800/50 rounded-lg whitespace-pre-wrap">${escapeHtml(blueprint.task || '')}</div>
               </div>
               
               <div class="flex flex-wrap gap-2 pt-2">
                  <div class="px-2 py-1 bg-primary/10 border border-primary/20 rounded text-[10px] font-mono text-primary flex items-center gap-1">
                      <span class="material-icons-outlined" style="font-size: 10px;">rule</span> ${(blueprint.constraints || []).length} Constraints
                  </div>
                  <div class="px-2 py-1 bg-primary/10 border border-primary/20 rounded text-[10px] font-mono text-primary flex items-center gap-1">
                      <span class="material-icons-outlined" style="font-size: 10px;">smart_toy</span> Target: ${escapeHtml(modelName)}
                  </div>
                  <div class="px-2 py-1 bg-primary/10 border border-primary/20 rounded text-[10px] font-mono text-primary flex items-center gap-1">
                      <span class="material-icons-outlined" style="font-size: 10px;">tune</span> ${escapeHtml(blueprint.output_format || 'auto')}
                  </div>
               </div>
            </div>
            
          </div>
          
        </div>
      </div>
    </section>
  `;

  // ── 5. WHY THIS PROMPT WORKS ───────────────────────────────
  if (whyItWorks) {
    html += `
    <section class="max-w-5xl mx-auto mb-12">
      <div class="bg-black/40 border border-emerald-500/20 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl shadow-emerald-500/5">
        <button class="w-full px-8 py-5 flex justify-between items-center bg-gradient-to-r from-emerald-500/10 to-transparent cursor-pointer hover:bg-emerald-500/10 transition-colors" onclick="this.parentElement.querySelector('.gen-why-body').classList.toggle('hidden'); this.querySelector('.gen-chevron').classList.toggle('rotate-180')">
          <div class="flex items-center gap-3">
             <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
             <h3 class="text-xs font-mono font-bold uppercase tracking-widest text-emerald-500/90">
               WHY THIS PROMPT WORKS
             </h3>
          </div>
          <span class="material-icons-outlined text-sm text-neutral-500 gen-chevron transition-transform">expand_more</span>
        </button>
        <div class="gen-why-body hidden p-8">
          <div class="text-sm text-neutral-300 leading-relaxed space-y-5">
            ${whyItWorks.split('\n\n').map(p => {
      let formatted = formatExplanation(p);
      return '<p class="flex gap-4 items-start"><span class="material-icons-outlined text-emerald-500/50 text-base mt-0.5 shrink-0">auto_awesome</span><span>' + formatted + '</span></p>';
    }).join('')}
          </div>
        </div>
      </div>
    </section>
    `;
  }

  panel.innerHTML = html;
  panel.classList.add('visible');
}

// Helper: Copy generated prompt
function _copyGenPrompt() {
  const el = document.getElementById('genPromptClean');
  if (el) {
    navigator.clipboard.writeText(el.textContent).then(() => showToast('Prompt copied!', 'success')).catch(() => showToast('Copy failed.', 'error'));
  }
}

// ════════════════════════════════════════════════════════════════
//  EXPORTS TO WINDOW (for HTML event handlers)
// ════════════════════════════════════════════════════════════════

window.signOut = signOut;
window.switchView = switchView;
window.analyzePrompt = analyzePrompt;
window.optimizePrompt = optimizePrompt;
window.generatePrompt = generatePrompt;
window.openPricingModal = openPricingModal;
window.closePricingModal = closePricingModal;
window.subscribeToPlan = subscribeToPlan;
window.buyCreditPack = buyCreditPack;
window.markAllNotificationsRead = markAllNotificationsRead;
window._copyGenPrompt = _copyGenPrompt;
window.loadNotifications = loadNotifications;
window.toggleNotificationsDropdown = toggleNotificationsDropdown;
window.closeNotificationsDropdown = closeNotificationsDropdown;

// ════════════════════════════════════════════════════════════════
//  RENDER: HISTORY (Firestore format)
// ════════════════════════════════════════════════════════════════

// Store history data globally so click handlers can access it
const _historyDataCache = {};

function renderHistory(entries) {
  const tbody = document.getElementById('historyBody');

  if (!entries || entries.length === 0) {
    tbody.innerHTML = `<div class="p-8 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-[#191919]/40 border border-slate-200 dark:border-white/10 rounded-xl glow-border transition-all duration-300">
          No prompts analyzed or generated yet. Head to the Analyzer or Generator to get started!
      </div>`;
    return;
  }

  const modelNames = { openai: 'OpenAI GPT', anthropic: 'Anthropic Claude', gemini: 'Google Gemini' };
  const modelColors = { openai: 'text-emerald-500', anthropic: 'text-amber-500', gemini: 'text-blue-500' };

  tbody.innerHTML = entries.map(p => {
    const score = p.overall_score || 0;
    const scoreColor = score >= 4 ? 'text-emerald-500' : score >= 2.5 ? 'text-amber-500' : 'text-primary';
    const promptPreview = (p.promptText || '').substring(0, 80) + ((p.promptText || '').length > 80 ? '...' : '');
    const mName = modelNames[p.modelTarget] || p.modelTarget || '';
    const mColor = modelColors[p.modelTarget] || 'text-primary';
    const isGen = p.type === 'generation';
    const typeBadge = isGen
      ? '<span class="text-[9px] font-mono bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded uppercase">Generate</span>'
      : '<span class="text-[9px] font-mono bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase">Analyze</span>';

    // Cache item for click access
    _historyDataCache[p.id] = p;

    // Mini bar chart
    const dims = p.dimension_scores || {};
    const dValues = [
      dims.constraint_strength || 0,
      dims.intent_clarity || 0,
      dims.structural_completeness || 0,
      dims.execution_readiness || 0,
      dims.model_compatibility || 0
    ];
    const barsHtml = dValues.map(v => {
      const height = Math.max(10, (v / 5) * 100);
      return `<div class="w-1.5 bg-primary/40 rounded-full" style="height: ${height}%"></div>`;
    }).join('');

    // Date
    let dateObj;
    if (p.createdAt && p.createdAt.toDate) dateObj = p.createdAt.toDate();
    else if (p.createdAt && p.createdAt.seconds) dateObj = new Date(p.createdAt.seconds * 1000);
    else dateObj = new Date(p.createdAt || Date.now());

    return `
        <div class="group bg-white dark:bg-[#191919]/40 border border-slate-200 dark:border-white/10 hover:border-primary/40 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 transition-all duration-300 cursor-pointer glow-border terminal-glass"
             onclick="viewHistoryItem('${escapeHtml(p.id)}')">
          <div class="flex-1 min-w-0 w-full">
            <div class="flex items-center gap-2 mb-1">
              ${typeBadge}
              <span class="text-[10px] font-mono ${mColor} uppercase tracking-widest font-bold">${escapeHtml(mName)}</span>
            </div>
            <h4 class="font-mono text-sm truncate text-slate-800 dark:text-slate-200">"${escapeHtml(promptPreview)}"</h4>
          </div>
          <div class="w-24 hidden lg:block">
            <div class="flex items-end gap-1 h-8">
              ${barsHtml}
            </div>
            <span class="text-[9px] font-mono text-slate-400 mt-1 block uppercase">Metrics</span>
          </div>
          <div class="w-16 text-center">
            <span class="text-[10px] font-mono text-slate-400 block uppercase">Score</span>
            <span class="font-mono text-sm font-bold ${scoreColor}">${score.toFixed(1)}</span>
          </div>
          <div class="w-24 text-right">
            <span class="text-[10px] font-mono text-slate-400 block uppercase">Date</span>
            <span class="font-mono text-xs text-slate-500">${dateObj.toLocaleDateString()}</span>
          </div>
          <div class="text-slate-400 group-hover:text-primary transition-colors hidden md:block">
            <span class="material-icons-outlined text-sm">arrow_forward</span>
          </div>
        </div>
    `;
  }).join('');
}

function viewHistoryItem(itemId) {
  const item = _historyDataCache[itemId];
  if (!item) return;

  if (item.type === 'generation') {
    // Switch to generator tab and show the generated prompt
    switchView('generator');
    const promptInput = document.getElementById('generatorPrompt');
    const modelSelect = document.getElementById('generatorModel');
    if (promptInput) promptInput.value = item.promptText || '';
    if (modelSelect && item.modelTarget) modelSelect.value = item.modelTarget;
    if (item.finalPrompt) {
      const resultsPanel = document.getElementById('generatorResults');
      if (resultsPanel) {
        const fakeResult = {
          finalPrompt: item.finalPrompt,
          templateUsed: item.templateUsed || 'template',
          v1: { score: { overall: item.overall_score || 0, dimensions: item.dimension_scores || {} } },
        };
        renderGeneratorResults('generatorResults', fakeResult, item.modelTarget);
      }
    }
  } else {
    // Switch to analyzer tab and show the analysis
    switchView('analyzer');
    const promptInput = document.getElementById('analyzerPrompt');
    const modelSelect = document.getElementById('analyzerModel');
    if (promptInput) promptInput.value = item.promptText || '';
    if (modelSelect && item.modelTarget) modelSelect.value = item.modelTarget;
    renderAnalysisResults('analyzerResults', item, item.modelTarget, false);
    // Scroll to results
    const resultsEl = document.getElementById('analyzerResults');
    if (resultsEl) setTimeout(() => resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }
}
window.viewHistoryItem = viewHistoryItem;

function renderDashboardRadar(history) {
  const container = document.getElementById('dashRadarContainer');
  if (!container) return;

  const dimLabels = ['Constraint', 'Clarity', 'Completeness', 'Exec Ready', 'Alignment'];
  const dimKeys = ['constraint_strength', 'intent_clarity', 'structural_completeness', 'execution_readiness', 'model_compatibility'];
  let dimValues = [0, 0, 0, 0, 0];
  let analysisCount = 0;

  // Only aggregate analysis entries (not generations — they have no real dimension data)
  const analyses = (history || []).filter(h => h.type !== 'generation' && h.dimension_scores);
  if (analyses.length > 0) {
    const sums = [0, 0, 0, 0, 0];
    analyses.forEach(h => {
      dimKeys.forEach((k, i) => { sums[i] += h.dimension_scores[k] || 0; });
    });
    dimValues = sums.map(s => s / analyses.length);
    analysisCount = analyses.length;
  }

  const angles = [0, 72, 144, 216, 288].map(d => (d * Math.PI) / 180);
  const r = 80;
  const cx = 100;

  function getPoint(val, idx) {
    const v = (Math.max(0, Math.min(5, val)) / 5) * r;
    return (cx + v * Math.sin(angles[idx])).toFixed(1) + ',' + (cx - v * Math.cos(angles[idx])).toFixed(1);
  }

  const hasData = analysisCount > 0;
  const pts = hasData ? dimValues.map((v, i) => getPoint(v, i)).join(' ') : '100,100 100,100 100,100 100,100 100,100';

  const circleTags = hasData ? dimValues.map((v, i) => {
    const pt = getPoint(v, i).split(',');
    return '<circle cx="' + pt[0] + '" cy="' + pt[1] + '" fill="#EF4444" r="3.5"></circle>';
  }).join('') : '';

  const labelTags = dimLabels.map((label, i) => {
    const labelRadius = 96;
    const scoreRadius = 108;
    const tx = (cx + labelRadius * Math.sin(angles[i])).toFixed(1);
    const ty = (cx - labelRadius * Math.cos(angles[i])).toFixed(1);
    const sx = (cx + scoreRadius * Math.sin(angles[i])).toFixed(1);
    const sy = (cx - scoreRadius * Math.cos(angles[i])).toFixed(1);

    let anchor = 'middle';
    if (Math.sin(angles[i]) > 0.1) anchor = 'start';
    else if (Math.sin(angles[i]) < -0.1) anchor = 'end';

    const scoreColor = hasData
      ? (dimValues[i] >= 4 ? '#10b981' : dimValues[i] >= 2.5 ? '#f59e0b' : '#EF4444')
      : '#6b7280';
    const scoreText = hasData ? dimValues[i].toFixed(1) : '—';

    return '<text x="' + tx + '" y="' + ty + '" text-anchor="' + anchor + '" dy="0.3em" class="fill-slate-500 font-mono font-bold uppercase tracking-tighter" style="font-size: 7.5px;">' + label + '</text>' +
      '<text x="' + sx + '" y="' + sy + '" text-anchor="' + anchor + '" dy="1.5em" font-family="monospace" font-weight="bold" style="font-size: 8px; fill: ' + scoreColor + ';">' + scoreText + '</text>';
  }).join('');

  const subtitle = hasData
    ? '<text x="100" y="196" text-anchor="middle" class="fill-slate-400" style="font-size:7px; font-family: monospace;">Based on ' + analysisCount + ' analysis' + (analysisCount > 1 ? 'es' : '') + '</text>'
    : '<text x="100" y="196" text-anchor="middle" class="fill-slate-500" style="font-size:7px; font-family: monospace;">No analyses yet</text>';

  container.innerHTML = '<svg class="w-full h-full max-w-[300px] radar-glow overflow-visible" viewBox="-20 -20 240 230">' +
    '<circle class="stroke-slate-100 dark:stroke-white/5" cx="100" cy="100" fill="none" r="80" stroke-width="0.5"></circle>' +
    '<circle class="stroke-slate-100 dark:stroke-white/5" cx="100" cy="100" fill="none" r="60" stroke-width="0.5"></circle>' +
    '<circle class="stroke-slate-100 dark:stroke-white/5" cx="100" cy="100" fill="none" r="40" stroke-width="0.5"></circle>' +
    '<circle class="stroke-slate-100 dark:stroke-white/5" cx="100" cy="100" fill="none" r="20" stroke-width="0.5"></circle>' +
    '<polygon class="stroke-slate-100 dark:stroke-white/5" fill="none" stroke-width="1" points="100,20 176,75 147,165 53,165 24,75"></polygon>' +
    '<line class="stroke-slate-100 dark:stroke-white/5" stroke-width="0.5" x1="100" x2="100" y1="100" y2="20"></line>' +
    '<line class="stroke-slate-100 dark:stroke-white/5" stroke-width="0.5" x1="100" x2="176" y1="100" y2="75"></line>' +
    '<line class="stroke-slate-100 dark:stroke-white/5" stroke-width="0.5" x1="100" x2="147" y1="100" y2="165"></line>' +
    '<line class="stroke-slate-100 dark:stroke-white/5" stroke-width="0.5" x1="100" x2="53" y1="100" y2="165"></line>' +
    '<line class="stroke-slate-100 dark:stroke-white/5" stroke-width="0.5" x1="100" x2="24" y1="100" y2="75"></line>' +
    '<polygon class="stroke-primary" fill="rgba(239, 68, 68, 0.15)" points="' + pts + '" stroke-width="2" style="transition: all 1s ease-out;"></polygon>' +
    circleTags + labelTags + subtitle +
    '</svg>';
}

// ════════════════════════════════════════════════════════════════
//  QUOTA (Firestore-based)
// ════════════════════════════════════════════════════════════════

async function refreshCredits() {
  if (!state.uid) return;
  try {
    const credits = await PromptLabDB.checkCredits(state.uid);
    const tier = state.userTier || 'Free';
    const periodLabel = credits.period === 'day' ? 'Daily' : 'Monthly';

    // Update header pill globally
    const headerPill = document.getElementById('headerProfilePill');
    if (headerPill) {
      headerPill.style.display = 'flex';
      const roleEl = document.getElementById('headerRole');
      if (roleEl) {
        roleEl.textContent = `${tier} · ${credits.total} ${periodLabel} Credits`;
      }
    }

    // Update dashboard stat card if present
    const dashRemaining = document.getElementById('statRemaining');
    if (dashRemaining) {
      dashRemaining.textContent = credits.total;
    }

    const dashRemainingLabel = document.getElementById('statRemainingLabel');
    if (dashRemainingLabel) {
      dashRemainingLabel.textContent = `${periodLabel.toUpperCase()} CREDITS`;
    }

    // Sync unread badge alongside credits
    updateUnreadBadge();
    // Refresh dropdown list if it's currently open
    const dropdown = document.getElementById('notificationsDropdown');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      loadNotificationsDropdown();
    }
  } catch (_) { }
}

// ════════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════════

function getScoreColor(score) {
  if (score >= 4) return '#34d399';
  if (score >= 3) return '#fbbf24';
  if (score >= 2) return '#f97316';
  return '#ef4444';
}

function formatDimension(dim) {
  const map = {
    clarity: 'Clarity',
    constraint_completeness: 'Constraints',
    model_alignment: 'Model Align',
    ambiguity_risk: 'Ambiguity',
    output_controllability: 'Control',
  };
  return map[dim] || dim;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatExplanation(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function setLoading(btn, loading) {
  if (loading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.innerHTML = '<div class="spinner"></div> Working…';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalHtml;
    btn.disabled = false;
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Pricing Modal Logic ──
function openPricingModal() {
  const modal = document.getElementById('pricingModal');
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // Re-trigger animations for cards
  const cards = modal.querySelectorAll('.pricing-card-animate');
  cards.forEach((card, idx) => {
    card.style.animation = 'none';
    card.offsetHeight; // trigger reflow
    card.style.animation = '';
    card.style.animationDelay = `${idx * 0.15}s`;
  });
}

function closePricingModal() {
  const modal = document.getElementById('pricingModal');
  if (!modal) return;

  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// ── Razorpay Payment ──────────────────────────────────────────────

const TIER_LABELS = {
  starter: 'Starter — ₹99/mo',
  pro: 'Pro — ₹299/mo',
  advanced: 'Advanced — ₹499/mo',
  builder: 'Builder — ₹699/mo',
  builder_pro: 'Builder Pro — ₹899/mo',
};

async function subscribeToPlan(tier, currency = 'INR') {
  if (!state.uid) { showToast('Please sign in first.', 'error'); return; }
  if (!window.Razorpay) { showToast('Payment SDK not loaded. Please refresh.', 'error'); return; }

  showToast('Opening payment...', 'info');

  let subData;
  try {
    const res = await fetch('/api/payments/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, uid: state.uid, currency }),
    });
    const text = await res.text();
    try { subData = JSON.parse(text); } catch (_) { throw new Error('Server error. Please try again.'); }
    if (!res.ok) throw new Error(subData.error || 'Failed to create subscription.');
  } catch (err) {
    showToast(err.message, 'error'); return;
  }

  const profile = await PromptLabDB.getUserProfile(state.uid).catch(() => ({}));

  const options = {
    key: subData.keyId,
    subscription_id: subData.subscriptionId,
    name: 'PromptLab',
    description: TIER_LABELS[tier] || tier,
    image: '/favicon.ico',
    prefill: {
      email: profile?.email || '',
      name: profile?.displayName || '',
    },
    theme: { color: '#dc2626' },
    handler: async function (response) {
      // Payment succeeded — verify server-side and upgrade tier
      try {
        const confirmRes = await fetch('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_subscription_id: response.razorpay_subscription_id,
            razorpay_signature: response.razorpay_signature,
            uid: state.uid,
            tier,
          }),
        });
        const confirmText = await confirmRes.text();
        let confirmData; try { confirmData = JSON.parse(confirmText); } catch (_) { throw new Error('Server error during verification.'); }
        if (!confirmRes.ok) throw new Error(confirmData.error || 'Verification failed.');

        // Sync new tier + credits to Firestore
        await _applyUpgradedTier(tier);

        closePricingModal();
        showToast(`🎉 Upgraded to ${TIER_LABELS[tier]}! Enjoy your new plan.`, 'success');
        await PromptLabDB.addNotification(state.uid, 'Subscription Activated',
          `You are now on the ${TIER_LABELS[tier]} plan. Your limits have been updated.`, 'success');
        refreshCredits();
        updateUnreadBadge();
      } catch (err) {
        showToast('Payment received but verification failed. Contact support.', 'error');
        console.error('[Payment] Confirm error:', err);
      }
    },
    modal: {
      ondismiss: () => showToast('Payment cancelled.', 'warning'),
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', (resp) => {
    showToast(`Payment failed: ${resp.error.description}`, 'error');
  });
  rzp.open();
}

async function buyCreditPack(currency = 'INR') {
  if (!state.uid) { showToast('Please sign in first.', 'error'); return; }
  if (!window.Razorpay) { showToast('Payment SDK not loaded. Please refresh.', 'error'); return; }

  showToast('Opening payment...', 'info');

  let orderData;
  try {
    const res = await fetch('/api/payments/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: state.uid, currency }),
    });
    const text = await res.text();
    try { orderData = JSON.parse(text); } catch (_) { throw new Error('Server error. Please try again.'); }
    if (!res.ok) throw new Error(orderData.error || 'Failed to create order.');
  } catch (err) {
    showToast(err.message, 'error'); return;
  }

  const profile = await PromptLabDB.getUserProfile(state.uid).catch(() => ({}));

  const options = {
    key: orderData.keyId,
    amount: orderData.amount,
    currency: orderData.currency,
    order_id: orderData.orderId,
    name: 'PromptLab',
    description: '1000 Bonus Credits — Never Expires',
    prefill: { email: profile?.email || '', name: profile?.displayName || '' },
    theme: { color: '#dc2626' },
    handler: async function (response) {
      try {
        const confirmRes = await fetch('/api/payments/confirm-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
            uid: state.uid,
          }),
        });
        const confirmText = await confirmRes.text();
        let confirmData; try { confirmData = JSON.parse(confirmText); } catch (_) { throw new Error('Server error during verification.'); }
        if (!confirmRes.ok) throw new Error(confirmData.error || 'Verification failed.');

        // Add 1000 bonus credits to Firestore
        await PromptLabDB.updateUserProfile(state.uid, { bonusCredits: (profile?.bonusCredits || 0) + 1000 });
        closePricingModal();
        showToast('🎉 1000 credits added to your account!', 'success');
        await PromptLabDB.addNotification(state.uid, 'Credit Pack Purchased',
          'You received 1000 bonus credits. They never expire.', 'success');
        refreshCredits();
        updateUnreadBadge();
      } catch (err) {
        showToast('Payment received but verification failed. Contact support.', 'error');
      }
    },
    modal: { ondismiss: () => showToast('Payment cancelled.', 'warning') },
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', (resp) => showToast(`Payment failed: ${resp.error.description}`, 'error'));
  rzp.open();
}

// Apply upgraded tier to Firestore — updates subscriptionTier and resets credits to new tier limits
async function _applyUpgradedTier(tier) {
  const tierCredits = {
    starter: { monthlyCredits: 200, dailyCredits: null },
    pro: { monthlyCredits: 1000, dailyCredits: null },
    advanced: { monthlyCredits: 3000, dailyCredits: null },
    builder: { monthlyCredits: 5000, dailyCredits: null },
    builder_pro: { monthlyCredits: 7000, dailyCredits: null },
  };
  const credits = tierCredits[tier] || {};
  const update = { subscriptionTier: tier };
  if (credits.monthlyCredits) {
    update.monthlyCredits = credits.monthlyCredits;
    update.monthlyCreditReset = new Date(new Date().setMonth(new Date().getMonth() + 1, 1)).toISOString();
  }
  await PromptLabDB.updateUserProfile(state.uid, update);
  state.userTier = tier.charAt(0).toUpperCase() + tier.slice(1).replace('_', ' ');
}

// ════════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ════════════════════════════════════════════════════════════════

async function loadNotifications() {
  if (!state.uid) return;

  const listEl = document.getElementById('notificationsList');
  if (!listEl) return;

  let notifs = [];
  try {
    notifs = await PromptLabDB.getNotifications(state.uid);
  } catch (err) {
    console.warn("Notifications index error:", err);
    listEl.innerHTML = `
      <div class="text-center py-12 text-amber-500">
          <span class="material-icons-round text-4xl mb-4 opacity-50">hourglass_empty</span>
          <p>Database indexes are currently building. Your notifications will be available here in a few minutes.</p>
      </div>`;
    return;
  }

  if (!notifs || notifs.length === 0) {
    listEl.innerHTML = `
      <div class="text-center py-12 text-slate-500">
          <span class="material-icons-round text-4xl mb-4 opacity-50">notifications_none</span>
          <p>You have no notifications yet.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = notifs.map(n => {
    // Determine visual style based on type
    let icon, color, bgClass, borderClass;
    if (n.type === 'success') {
      icon = 'check_circle';
      color = 'text-emerald-500';
      bgClass = 'bg-emerald-500/10';
      borderClass = 'hover:border-emerald-500/50';
    } else if (n.type === 'warning') {
      icon = 'warning';
      color = 'text-amber-500';
      bgClass = 'bg-amber-500/10';
      borderClass = 'hover:border-amber-500/50';
    } else {
      icon = 'bolt';
      color = 'text-primary';
      bgClass = 'bg-primary/10';
      borderClass = 'hover:border-primary/50';
    }

    // Format timestamp
    const date = new Date(n.timestamp);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

    return `
      <div class="bg-white dark:bg-[#191919]/40 border ${n.read ? 'border-transparent dark:border-white/5 opacity-70' : 'border-slate-200 dark:border-white/10'} p-5 rounded-2xl flex items-start gap-4 transition-all duration-300 ${borderClass} glow-border relative overflow-hidden">
        ${!n.read ? `<div class="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>` : ''}
        <div class="p-3 ${bgClass} rounded-xl shrink-0 mt-1">
            <span class="material-icons-round ${color}">${icon}</span>
        </div>
        <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-4 mb-1">
                <h3 class="text-base font-bold text-slate-900 dark:text-white truncate">${escapeHtml(n.title)}</h3>
                <span class="text-xs text-slate-500 font-mono tracking-widest shrink-0">${dateString} ${timeString}</span>
            </div>
            <p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">${escapeHtml(n.message)}</p>
        </div>
      </div>
    `;
  }).join('');
}

async function markAllNotificationsRead() {
  if (!state.uid) return;
  await PromptLabDB.markNotificationsRead(state.uid);
  loadNotifications();
  loadNotificationsDropdown();
  updateUnreadBadge();
  showToast('All notifications marked as read', 'success');
}

async function updateUnreadBadge() {
  if (!state.uid) return;
  const badge = document.getElementById('unreadBadge');
  if (!badge) return;

  const notifs = await PromptLabDB.getNotifications(state.uid);
  const unreadCount = notifs.filter(n => !n.read).length;

  if (unreadCount > 0) {
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ── Notifications Dropdown ───────────────────────────────────────

function toggleNotificationsDropdown(event) {
  event.stopPropagation();
  const dropdown = document.getElementById('notificationsDropdown');
  if (!dropdown) return;
  const isOpen = !dropdown.classList.contains('hidden');
  if (isOpen) {
    dropdown.classList.add('hidden');
  } else {
    dropdown.classList.remove('hidden');
    loadNotificationsDropdown();
  }
}

function closeNotificationsDropdown() {
  const dropdown = document.getElementById('notificationsDropdown');
  if (dropdown) dropdown.classList.add('hidden');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const wrapper = document.getElementById('notificationsWrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    closeNotificationsDropdown();
  }
});

async function loadNotificationsDropdown() {
  if (!state.uid) return;
  const listEl = document.getElementById('notificationsDropdownList');
  if (!listEl) return;

  let notifs = [];
  try {
    notifs = await PromptLabDB.getNotifications(state.uid);
  } catch (_) { return; }

  if (!notifs || notifs.length === 0) {
    listEl.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
        <span class="material-icons-round text-3xl opacity-40">notifications_none</span>
        <p class="text-xs">No notifications yet</p>
      </div>`;
    return;
  }

  // Show newest 8
  const recent = notifs.slice(0, 8);
  listEl.innerHTML = recent.map(n => {
    let icon, color, bgClass;
    if (n.type === 'success') {
      icon = 'check_circle'; color = 'text-emerald-500'; bgClass = 'bg-emerald-500/10';
    } else if (n.type === 'warning') {
      icon = 'warning'; color = 'text-amber-500'; bgClass = 'bg-amber-500/10';
    } else {
      icon = 'bolt'; color = 'text-primary'; bgClass = 'bg-primary/10';
    }

    const ts = n.timestamp ? new Date(n.timestamp) : null;
    const timeAgo = ts ? _timeAgo(ts) : '';

    return `
      <div class="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${!n.read ? 'bg-primary/5' : ''}">
        ${!n.read ? `<div class="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0"></div>` : `<div class="mt-2 w-1.5 h-1.5 shrink-0"></div>`}
        <div class="p-1.5 ${bgClass} rounded-lg shrink-0">
          <span class="material-icons-round ${color} text-base">${icon}</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-slate-900 dark:text-white leading-snug">${escapeHtml(n.title)}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">${escapeHtml(n.message)}</p>
          ${timeAgo ? `<p class="text-[10px] text-slate-400 dark:text-slate-600 mt-1 font-mono">${timeAgo}</p>` : ''}
        </div>
      </div>`;
  }).join('');
}

function _timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

