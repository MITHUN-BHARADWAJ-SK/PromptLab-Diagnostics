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
    const profile = await PromptLabDB.getUserProfile(activeUid);
    if (profile) {
      state.userTier = profile.subscriptionTier || 'free';
      state.userType = profile.userType || 'student';
      state.userName = profile.displayName || 'User';
      state.userEmail = profile.email || '';
    } else {
      // User not found in DB but token exists (cache cleared?)
      localStorage.removeItem('promptlab_active_user');
      window.location.href = '/login.html';
      return;
    }
  } catch (e) {
    console.warn('[PromptLab] Could not load profile:', e);
  }

  updateUserChip();
  refreshQuota();
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

  if (viewName === 'dashboard') loadDashboard();
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
      promptText,
      modelTarget,
      exampleOutput: exampleOutput || null,
      overall_score: result.overall_score,
      dimension_scores: result.dimension_scores,
      issues: result.issues || [],
      suggestions: result.suggestions || [],
      educational_summary: result.educational_summary || '',
    });

    // Consume credits
    await PromptLabDB.consumeCredits(state.uid, 1);

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
    // Check credits for generation (3 credits)
    const credits = await PromptLabDB.checkCredits(state.uid);
    if (credits.total < 3) {
      showToast('Insufficient credits (3 required for optimization). Upgrade your plan or wait for tomorrow.', 'error');
      return;
    }

    // Run the generation engine to optimize
    const genResult = PromptLabEngine.generate({ promptText, modelTarget });

    if (genResult.error) {
      showToast(genResult.error, 'error');
      return;
    }

    // Consume 3 credits
    await PromptLabDB.consumeCredits(state.uid, 3);

    // Replace the text in the analyzer input with the new text
    document.getElementById('analyzerPrompt').value = genResult.finalPrompt || genResult.v1 || promptText;

    showToast('Prompt optimized successfully!', 'success');
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

    // Run the two-stage generation pipeline
    setStatus('DETECTING AMBIGUITY...');
    await new Promise(r => setTimeout(r, 120)); // Let UI repaint

    const genResult = PromptLabEngine.generate({ promptText, modelTarget });

    if (genResult.error) {
      showToast(genResult.error, 'error');
      setStatus('ENGINE: ERROR');
      return;
    }

    if (genResult.route === 'analyze_first') {
      setStatus('ANALYZING INTENT...');
      await new Promise(r => setTimeout(r, 100));
      setStatus('GENERATING MODEL-SPECIFIC PROMPT...');
    } else {
      setStatus('GENERATING PROMPT...');
      await new Promise(r => setTimeout(r, 100));
      setStatus(genResult.v2 ? 'REFINING PROMPT...' : 'FINALIZING...');
    }
    await new Promise(r => setTimeout(r, 100));

    await PromptLabDB.consumeCredits(state.uid, 3);

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
    const [history, credits, stats] = await Promise.all([
      PromptLabDB.getHistory(state.uid, 20),
      PromptLabDB.checkCredits(state.uid),
      PromptLabDB.getOrCreateStats(state.uid),
    ]);

    document.getElementById('statRemaining').textContent = credits.total;
    document.getElementById('statTotal').textContent = stats.totalPrompts || 0;
    document.getElementById('statAvg').textContent =
      typeof stats.averageScore === 'number' ? stats.averageScore.toFixed(1) : '0.0';
    document.getElementById('statStreak').textContent = (stats.streakDays || 0) + ' DAYS';

    renderHistory(history);
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

function renderAnalysisResults(containerId, data, modelTarget) {
  const panel = document.getElementById(containerId);
  const score = data.overall_score || 0;
  const dims = data.dimension_scores || {};
  const issues = data.issues || [];
  const modelIssues = data.model_specific_issues || [];
  const suggestions = data.suggestions || [];
  const summary = data.educational_summary || '';
  const colors = MODEL_COLORS[modelTarget] || MODEL_COLORS.openai;
  const profile = data.model_profile || null;

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
              <h2 class="text-3xl font-extrabold mb-4 text-white">${scoreLabel}</h2>
              <p class="text-base text-neutral-400 leading-relaxed max-w-xl">
                  ${escapeHtml(summary).replace(/\*\*(.*?)\*\*/g, '<b class="text-white">$1</b>').replace(/\n\n/g, '<br><br>')}
              </p>
          </div>
      </div>
    </section>
  `;

  // ── 2. METRIC PENTAGON DIAGNOSTIC ─────────────────────────────
  const dimValues = [
    dims.output_controllability || 0,
    dims.clarity || 0,
    dims.constraint_completeness || 0,
    dims.ambiguity_risk || 0,
    dims.model_alignment || 0
  ];
  const dimLabels = ['Controllability', 'Clarity', 'Completeness', 'Ambiguity Risk', 'Model Alignment'];

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
    const labelRadius = 92;
    const tx = (cx + labelRadius * Math.sin(angles[i])).toFixed(1);
    const ty = (cx - labelRadius * Math.cos(angles[i])).toFixed(1);

    let anchor = "middle";
    if (Math.sin(angles[i]) > 0.1) anchor = "start";
    else if (Math.sin(angles[i]) < -0.1) anchor = "end";

    let dy = "0.3em";
    if (Math.cos(angles[i]) > 0.1) dy = "0em";
    else if (Math.cos(angles[i]) < -0.1) dy = "0.7em";

    return '<text x="' + tx + '" y="' + ty + '" text-anchor="' + anchor + '" dy="' + dy + '" class="fill-neutral-500 text-[8px] font-mono font-bold uppercase tracking-widest">' + label + '</text>';
  }).join('');

  html += '<section class="max-w-5xl mx-auto mb-8">' +
    '<div class="bg-surface border border-neutral-800 rounded-xl overflow-hidden">' +
    '<div class="px-6 py-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">' +
    '<h3 class="text-xs font-mono font-bold uppercase tracking-widest flex items-center gap-2">' +
    '<span class="material-icons-outlined text-sm">radar</span> Metric Pentagon Diagnostic</h3>' +
    '<div class="text-[10px] font-mono text-neutral-500 uppercase">Analysis Engine Active</div>' +
    '</div>' +
    '<div class="p-10 flex flex-col md:flex-row items-center gap-12">' +
    '<div class="relative w-72 h-72 shrink-0 md:w-80 md:h-80 mx-auto">' +
    '<svg class="w-full h-full overflow-visible" viewBox="0 0 200 200">' +
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
    // For Ambiguity Risk (index 3): raw score 5 = "no risk", 0 = "high risk"
    // So risk percentage = (5 - v) / 5 * 100
    const pct = i === 3 ? (((5 - v) / 5) * 100).toFixed(0) : ((v / 5) * 100).toFixed(0);

    let isGood, colorClass, bgClass, icon;

    if (i === 3) { // Ambiguity Risk
      // If raw score >= 2.5, risk is low (<= 50%), this is "Good"
      isGood = v >= 2.5;
      const isExcellent = v >= 4.0; // risk <= 20%
      const isWarning = v <= 1.0;   // risk >= 80%

      // User requested: green for low risk (0%), red for high risk (100%)
      colorClass = isGood ? 'text-emerald-500' : 'text-red-500';
      bgClass = isGood ? 'bg-emerald-500' : 'bg-red-500';
      icon = isGood ? (isExcellent ? 'check_circle' : 'trending_down') : (isWarning ? 'priority_high' : 'trending_up');
    } else { // Standard logic
      isGood = v >= 3.5;
      const isExcellent = v >= 4.5;
      const isWarning = v < 2.0;

      colorClass = isGood ? 'text-emerald-500' : 'text-primary';
      bgClass = isGood ? 'bg-emerald-500' : 'bg-primary';
      icon = isGood ? (isExcellent ? 'check_circle' : 'trending_up') : (isWarning ? 'priority_high' : 'trending_down');
    }

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

  // ── 5. GPT-OPTIMIZED STRUCTURE ───────────────────────────────
  if (data.prompt_rewrite_hint) {
    const titleText = (profile ? profile.name : 'AI') + '-Optimized Structure';

    // Parse System vs User blocks for colored rendering
    const templateRows = escapeHtml(data.prompt_rewrite_hint.template).split('\n');
    let formattedTemplate = '';
    const metadataHtml = [];

    templateRows.forEach(row => {
      if (row.startsWith('System:')) {
        formattedTemplate += '<p><span class="text-primary font-bold">System:</span> ' + row.substring(7) + '</p>';
      } else if (row.startsWith('User:')) {
        formattedTemplate += '<p class="mt-4"><span class="text-primary font-bold">User:</span> ' + row.substring(5) + '</p>';
      } else if (row.startsWith('Context:') || row.startsWith('Constraints:') || row.startsWith('Format:') || row.startsWith('Scope:') || row.startsWith('Tone:')) {
        const parts = row.split(':');
        metadataHtml.push('<p><span class="text-neutral-500 text-xs">' + parts[0] + ':</span> ' + parts.slice(1).join(':') + '</p>');
      } else if (row.trim()) {
        if (formattedTemplate.length === 0) {
          formattedTemplate += '<p>' + row + '</p>';
        } else {
          formattedTemplate += '<br/>' + row;
        }
      }
    });

    html += '<section class="max-w-5xl mx-auto mb-12">' +
      '<div class="bg-primary/5 border border-primary/20 rounded-xl overflow-hidden">' +
      '<div class="px-6 py-4 border-b border-primary/20 flex justify-between items-center bg-primary/5">' +
      '<div class="flex items-center gap-3">' +
      '<div class="w-8 h-8 rounded bg-primary flex items-center justify-center shadow-lg shadow-primary/20">' +
      '<span class="material-icons-outlined text-white text-lg">auto_fix_high</span>' +
      '</div>' +
      '<h3 class="text-sm font-bold tracking-tight text-white">' + titleText + '</h3>' +
      '</div>' +
      '<button class="text-xs font-mono font-bold text-primary flex items-center gap-1 hover:underline cursor-pointer" onclick="navigator.clipboard.writeText(document.getElementById(&quot;rewriteHintClean&quot;).textContent)">' +
      'COPY ALL <span class="material-icons-outlined text-xs">content_copy</span>' +
      '</button>' +
      '</div>' +
      '<div class="p-6">' +
      '<p class="text-xs text-neutral-400 mb-6 italic">' + escapeHtml(data.prompt_rewrite_hint.description) + '</p>' +
      '<div class="bg-black/80 rounded-lg p-6 font-mono text-sm text-neutral-300 leading-relaxed space-y-4 border border-white/5">' +
      formattedTemplate +
      (metadataHtml.length > 0 ? '<div class="pt-4 border-t border-white/10 space-y-2">' + metadataHtml.join('') + '</div>' : '') +
      '</div>' +
      '<div id="rewriteHintClean" style="display:none;">' + escapeHtml(data.prompt_rewrite_hint.template) + '</div>' +
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
  const intent = data._intent || {};
  const v1 = data.v1 || '';
  const v2 = data.v2 || null;
  const finalPrompt = data.finalPrompt || v1 || '';
  const route = data.route || 'generate_first';
  const ambiguityScore = data.ambiguityScore || 0;

  const modelNames = { openai: 'OpenAI GPT', anthropic: 'Anthropic Claude', gemini: 'Google Gemini' };
  const modelName = modelNames[modelTarget] || modelTarget;
  const routeLabel = route === 'analyze_first' ? 'Analyzed → Generated' : 'Generated → Refined';
  const routeColor = route === 'analyze_first' ? 'text-amber-500' : 'text-emerald-500';
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

  // ── 2. PIPELINE INFO ──────────────────────────────────────
  html += `
    <section class="max-w-5xl mx-auto mb-8">
      <div class="bg-surface border border-neutral-800 rounded-xl overflow-hidden">
        <div class="px-6 py-3 border-b border-neutral-800 bg-neutral-900/50 flex items-center gap-3">
          <span class="material-icons-outlined text-primary text-sm">route</span>
          <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-500">Pipeline Analysis</span>
        </div>
        <div class="p-6">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
              <div class="text-[9px] font-mono font-bold text-neutral-500 uppercase mb-2">Ambiguity Score</div>
              <div class="text-2xl font-black ${ambiguityScore >= 0.5 ? 'text-amber-500' : 'text-emerald-500'}">${(ambiguityScore * 100).toFixed(0)}%</div>
              <div class="text-[10px] font-mono text-neutral-500 mt-1">${ambiguityScore >= 0.5 ? 'High — analyzed first' : 'Low — direct generation'}</div>
            </div>
            <div class="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
              <div class="text-[9px] font-mono font-bold text-neutral-500 uppercase mb-2">Route Taken</div>
              <div class="text-sm font-bold ${routeColor}">${routeLabel}</div>
              <div class="text-[10px] font-mono text-neutral-500 mt-1">${v2 ? 'V1 → Refined to V2' : 'Single-pass generation'}</div>
            </div>
            <div class="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
              <div class="text-[9px] font-mono font-bold text-neutral-500 uppercase mb-2">Target Model</div>
              <div class="text-sm font-bold text-white">${escapeHtml(modelName)}</div>
              <div class="text-[10px] font-mono text-neutral-500 mt-1">Model-native syntax applied</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  // ── 3. V1 → V2 COMPARISON (if refiner ran) ────────────────
  if (v2 && v1) {
    html += `
    <section class="max-w-5xl mx-auto mb-8">
      <div class="bg-surface border border-neutral-800 rounded-xl overflow-hidden">
        <div class="px-6 py-3 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="material-icons-outlined text-emerald-500 text-sm">trending_up</span>
            <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-500">Refiner Output — V1 → V2</span>
          </div>
          <span class="text-xs font-mono font-bold text-emerald-500">REFINED</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-px bg-neutral-800">
          <div class="p-6 bg-surface">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">V1 — RAW</span>
            </div>
            <div class="bg-black/60 rounded-lg p-4 font-mono text-xs text-neutral-500 leading-relaxed border border-neutral-800 max-h-48 overflow-y-auto whitespace-pre-wrap">${escapeHtml(v1)}</div>
          </div>
          <div class="p-6 bg-surface">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500">V2 — REFINED</span>
            </div>
            <div class="bg-black/60 rounded-lg p-4 font-mono text-xs text-neutral-300 leading-relaxed border border-emerald-500/20 max-h-48 overflow-y-auto whitespace-pre-wrap">${escapeHtml(v2)}</div>
          </div>
        </div>
      </div>
    </section>
    `;
  }

  // ── 4. INTENT CONTRACT ────────────────────────────────────
  html += `
    <section class="max-w-5xl mx-auto mb-8">
      <div class="bg-black/40 border border-primary/20 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl shadow-primary/5">
        <button class="w-full px-8 py-5 flex justify-between items-center bg-gradient-to-r from-primary/10 to-transparent cursor-pointer hover:bg-primary/10 transition-colors" onclick="this.parentElement.querySelector('.gen-intent-body').classList.toggle('hidden'); this.querySelector('.gen-chevron').classList.toggle('rotate-180')">
          <div class="flex items-center gap-3">
             <div class="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
             <h3 class="text-xs font-mono font-bold uppercase tracking-widest text-primary/90">
               INTENT CONTRACT
             </h3>
          </div>
          <span class="material-icons-outlined text-sm text-neutral-500 gen-chevron transition-transform">expand_more</span>
        </button>
        <div class="gen-intent-body hidden p-8 bg-black/20">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div class="group p-4 bg-surface/50 border border-neutral-800/50 hover:border-primary/30 rounded-xl transition-all hover:bg-primary/5">
              <div class="text-[9px] font-mono text-neutral-500 uppercase mb-1">Task Type</div>
              <div class="text-sm font-semibold text-white capitalize">${escapeHtml(intent.task_type || 'general')}</div>
            </div>
            <div class="group p-4 bg-surface/50 border border-neutral-800/50 hover:border-primary/30 rounded-xl transition-all hover:bg-primary/5">
              <div class="text-[9px] font-mono text-neutral-500 uppercase mb-1">Domain</div>
              <div class="text-sm font-semibold text-white capitalize">${escapeHtml(intent.domain || 'General')}</div>
            </div>
            <div class="group p-4 bg-surface/50 border border-neutral-800/50 hover:border-primary/30 rounded-xl transition-all hover:bg-primary/5">
              <div class="text-[9px] font-mono text-neutral-500 uppercase mb-1">Audience</div>
              <div class="text-sm font-semibold text-white capitalize">${escapeHtml(intent.audience || 'general')}</div>
            </div>
            <div class="group p-4 bg-surface/50 border border-neutral-800/50 hover:border-primary/30 rounded-xl transition-all hover:bg-primary/5">
              <div class="text-[9px] font-mono text-neutral-500 uppercase mb-1">Depth</div>
              <div class="text-sm font-semibold text-white capitalize">${escapeHtml(intent.depth || 'moderate')}</div>
            </div>
            <div class="group p-4 bg-surface/50 border border-neutral-800/50 hover:border-primary/30 rounded-xl transition-all hover:bg-primary/5">
              <div class="text-[9px] font-mono text-neutral-500 uppercase mb-1">Tone</div>
              <div class="text-sm font-semibold text-white capitalize">${escapeHtml(intent.tone || 'professional')}</div>
            </div>
            <div class="group p-4 bg-surface/50 border border-neutral-800/50 hover:border-primary/30 rounded-xl transition-all hover:bg-primary/5">
              <div class="text-[9px] font-mono text-neutral-500 uppercase mb-1">Primary Goal</div>
              <div class="text-sm font-semibold text-white">${escapeHtml((intent.primary_goal || '').substring(0, 60))}${(intent.primary_goal || '').length > 60 ? '…' : ''}</div>
            </div>
          </div>
          ${(intent.must_include && intent.must_include.length > 0) ? `
          <div class="mt-4">
            <div class="text-[9px] font-mono text-emerald-500 uppercase mb-2">Must Include</div>
            <div class="flex flex-wrap gap-2">
              ${intent.must_include.map(i => '<span class="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-mono text-emerald-400">' + escapeHtml(i) + '</span>').join('')}
            </div>
          </div>` : ''}
          ${(intent.must_exclude && intent.must_exclude.length > 0) ? `
          <div class="mt-4">
            <div class="text-[9px] font-mono text-primary uppercase mb-2">Must Exclude</div>
            <div class="flex flex-wrap gap-2">
              ${intent.must_exclude.map(i => '<span class="px-2 py-1 bg-primary/10 border border-primary/20 rounded text-[10px] font-mono text-primary">' + escapeHtml(i) + '</span>').join('')}
            </div>
          </div>` : ''}
          ${(intent.assumptions && intent.assumptions.length > 0) ? `
          <div class="mt-4">
            <div class="text-[9px] font-mono text-amber-500 uppercase mb-2">Assumptions Made</div>
            <div class="flex flex-wrap gap-2">
              ${intent.assumptions.map(a => '<span class="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-mono text-amber-400">' + escapeHtml(a) + '</span>').join('')}
            </div>
          </div>` : ''}
        </div>
      </div>
    </section>
  `;

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
//  RENDER: HISTORY (Firestore format)
// ════════════════════════════════════════════════════════════════

function renderHistory(entries) {
  const tbody = document.getElementById('historyBody');

  if (!entries || entries.length === 0) {
    tbody.innerHTML = `<div class="p-8 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-[#191919]/40 border border-slate-200 dark:border-white/10 rounded-xl glow-border transition-all duration-300">
          No prompts analyzed yet. Head to the Analyzer to get started!
      </div>`;
    return;
  }

  const modelNames = { openai: 'OpenAI GPT', anthropic: 'Anthropic Claude', gemini: 'Google Gemini' };
  const modelColors = { openai: 'text-emerald-500', anthropic: 'text-amber-500', gemini: 'text-blue-500' };

  tbody.innerHTML = entries.map(p => {
    const score = p.overall_score || 0;
    const scoreColor = score >= 4 ? 'text-emerald-500' : score >= 2.5 ? 'text-amber-500' : 'text-primary';
    const promptPreview = (p.promptText || '').substring(0, 80) + ((p.promptText || '').length > 80 ? '...' : '');
    const mName = modelNames[p.modelTarget] || p.modelTarget;
    const mColor = modelColors[p.modelTarget] || 'text-primary';
    const shortId = '#' + (p.id || '').split('_').pop().substring(0, 4).toUpperCase();

    // Create a mini bar chart for dimension scores
    const dims = p.dimension_scores || {};
    const dValues = [
      dims.output_controllability || 0,
      dims.clarity || 0,
      dims.constraint_completeness || 0,
      dims.ambiguity_risk || 0,
      dims.model_alignment || 0
    ];
    const barsHtml = dValues.map(v => {
      const height = Math.max(10, (v / 5) * 100);
      return `<div class="w-1.5 bg-primary/40 rounded-full" style="height: ${height}%"></div>`;
    }).join('');

    return `
        <div class="group bg-white dark:bg-[#191919]/40 border border-slate-200 dark:border-white/10 hover:border-primary/40 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 transition-all duration-300 cursor-pointer glow-border terminal-glass">
            <div class="w-12 text-center border-r border-slate-100 dark:border-white/10 pr-4 hidden md:block">
                <span class="text-[10px] font-mono text-slate-400 block">ID</span>
                <span class="font-mono text-sm font-bold text-slate-600 dark:text-slate-300">${shortId}</span>
            </div>
          <div class="flex-1 min-w-0 w-full">
              <span class="text-[10px] font-mono ${mColor} uppercase tracking-widest font-bold">${escapeHtml(mName)}</span>
              <h4 class="font-mono text-sm truncate mt-1 text-slate-800 dark:text-slate-200">"${escapeHtml(promptPreview)}"</h4>
          </div>
          <div class="w-24 hidden lg:block">
              <div class="flex items-end gap-1 h-8 items-center">
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
              <span class="font-mono text-xs text-slate-500">${new Date(p.createdAt).toLocaleDateString()}</span>
          </div>
      </div>
    `;
  }).join('');
}

function renderDashboardRadar(history) {
  const container = document.getElementById('dashRadarContainer');
  if (!container) return;

  const dimLabels = ['Control', 'Clarity', 'Constraints', 'Ambiguity', 'Alignment'];
  let dimValues = [0, 0, 0, 0, 0];

  if (history && history.length > 0) {
    let counts = [0, 0, 0, 0, 0];
    history.forEach(h => {
      if (h.dimension_scores) {
        dimValues[0] += h.dimension_scores.output_controllability || 0;
        dimValues[1] += h.dimension_scores.clarity || 0;
        dimValues[2] += h.dimension_scores.constraint_completeness || 0;
        dimValues[3] += h.dimension_scores.ambiguity_risk || 0;
        dimValues[4] += h.dimension_scores.model_alignment || 0;
        for (let i = 0; i < 5; i++) counts[i]++;
      }
    });
    for (let i = 0; i < 5; i++) {
      if (counts[i] > 0) dimValues[i] /= counts[i];
    }
  } else {
    dimValues = [2.5, 2.5, 2.5, 2.5, 2.5];
  }

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
    const labelRadius = 92;
    const tx = (cx + labelRadius * Math.sin(angles[i])).toFixed(1);
    const ty = (cx - labelRadius * Math.cos(angles[i])).toFixed(1);

    let anchor = "middle";
    if (Math.sin(angles[i]) > 0.1) anchor = "start";
    else if (Math.sin(angles[i]) < -0.1) anchor = "end";

    let dy = "0.3em";
    if (Math.cos(angles[i]) > 0.1) dy = "0em";
    else if (Math.cos(angles[i]) < -0.1) dy = "0.7em";

    return '<text x="' + tx + '" y="' + ty + '" text-anchor="' + anchor + '" dy="' + dy + '" class="fill-slate-500 font-mono font-bold uppercase tracking-tighter" style="font-size: 8px;">' + label + '</text>';
  }).join('');

  container.innerHTML = '<svg class="w-full h-full max-w-[300px] radar-glow overflow-visible" viewBox="0 0 200 200">' +
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
    circleTags + labelTags +
    '</svg>';
}

// ════════════════════════════════════════════════════════════════
//  QUOTA (Firestore-based)
// ════════════════════════════════════════════════════════════════

async function refreshCredits() {
  if (!state.uid) return;
  try {
    const credits = await PromptLabDB.checkCredits(state.uid);

    // Hide old quota bar if it exists
    const bar = document.getElementById('quotaBar');
    if (bar) bar.style.display = 'none';

    // Update header pill globally
    const headerPill = document.getElementById('headerProfilePill');
    if (headerPill) {
      headerPill.style.display = 'flex';
      const tier = state.userTier || 'Free';
      document.getElementById('headerRole').textContent = `${tier} · ${credits.total} Credits`;
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
