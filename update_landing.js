const fs = require('fs');
const path = require('path');

const htmlPath = path.join('f:', 'PROMPTLAB', 'public', 'landing.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const newSection = `        <!-- ── How It Works ─────────────────────────────────────── -->
        <section class="relative z-10 py-24 px-4 bg-white dark:bg-[#000000] transition-colors duration-500 min-h-[800px]"
            id="how-it-works">
            <div class="absolute inset-0 grid-overlay-works pointer-events-none opacity-10 dark:opacity-40 transition-opacity duration-500"></div>
            <div class="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/5 dark:bg-primary/5 blur-[120px] rounded-full pointer-events-none transition-colors duration-500"></div>
            
            <div class="relative z-10 max-w-7xl mx-auto flex flex-col items-center">
                <div class="flex flex-col gap-4 text-center items-center mb-16">
                    <div
                        class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-bold tracking-widest text-slate-500 dark:text-white/60 uppercase transition-colors duration-500">
                        Process
                    </div>
                    <h2
                        class="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-slate-900 dark:text-white transition-colors duration-500 mb-8 w-full block">
                        How <span
                            class="text-primary dark:breathing-glow transition-all duration-500">PromptLab</span>
                        Works
                    </h2>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 w-full relative">
                    <!-- Connector Line (Desktop only) -->
                    <div
                        class="hidden md:block absolute top-[32px] left-[15%] right-[15%] h-px connector-line transition-all duration-500">
                    </div>

                    <!-- Step 1 -->
                    <div class="flex flex-col items-center text-center relative z-10 group">
                        <div
                            class="size-16 rounded-lg bg-white dark:bg-black border border-slate-200 dark:border-primary/30 shadow-lg dark:shadow-[0_0_20px_rgba(255,77,77,0.15)] flex items-center justify-center mb-6 text-xl font-bold font-mono text-primary group-hover:scale-110 transition-transform duration-300 dark:card-glass-works">
                            01
                        </div>
                        <h3
                            class="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-3 transition-colors duration-500">
                            Paste Your Prompt</h3>
                        <p class="text-slate-500 dark:text-white/40 text-sm max-w-xs transition-colors duration-500 leading-relaxed">
                            Enter any prompt you'd send to ChatGPT, Claude, or Gemini. Choose your target model.
                        </p>
                    </div>

                    <!-- Step 2 -->
                    <div class="flex flex-col items-center text-center relative z-10 group">
                        <div
                            class="size-16 rounded-lg bg-white dark:bg-black border border-slate-200 dark:border-primary/30 shadow-lg dark:shadow-[0_0_20px_rgba(255,77,77,0.15)] flex items-center justify-center mb-6 text-xl font-bold font-mono text-primary group-hover:scale-110 transition-transform duration-300 dark:card-glass-works">
                            02
                        </div>
                        <h3
                            class="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-3 transition-colors duration-500">
                            Blueprint Comparison</h3>
                        <p class="text-slate-500 dark:text-white/40 text-sm max-w-xs transition-colors duration-500 leading-relaxed">
                            PromptLab compares your prompt against the ideal structural blueprint for that model × task.
                        </p>
                    </div>

                    <!-- Step 3 -->
                    <div class="flex flex-col items-center text-center relative z-10 group">
                        <div
                            class="size-16 rounded-lg bg-white dark:bg-black border border-slate-200 dark:border-primary/30 shadow-lg dark:shadow-[0_0_20px_rgba(255,77,77,0.15)] flex items-center justify-center mb-6 text-xl font-bold font-mono text-primary group-hover:scale-110 transition-transform duration-300 dark:card-glass-works">
                            03
                        </div>
                        <h3
                            class="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-3 transition-colors duration-500">
                            Actionable Feedback</h3>
                        <p class="text-slate-500 dark:text-white/40 text-sm max-w-xs transition-colors duration-500 leading-relaxed">
                            See scores, issues, suggestions, and a model-specific optimization checklist — then improve.
                        </p>
                    </div>
                </div>
            </div>
        </section>`;

const startToken = "<!-- ── How It Works ─────────────────────────────────────── -->";
const endToken = "<!-- ── Testimonials Section ─────────────────────────────────── -->";

const startIdx = html.indexOf(startToken);
const endIdx = html.indexOf(endToken);

if (startIdx !== -1 && endIdx !== -1) {
    const newHtml = html.substring(0, startIdx) + newSection + "\\n\\n        " + html.substring(endIdx);
    fs.writeFileSync(htmlPath, newHtml, 'utf8');
    console.log("Replaced How It Works section successfully");
} else {
    console.log("Tokens not found.");
}

// Update CSS path
const cssPath = path.join('f:', 'PROMPTLAB', 'public', 'css', 'landing.css');
let css = fs.readFileSync(cssPath, 'utf8');

if (!css.includes('.grid-overlay-works')) {
    const cssAppend = `\n
.grid-overlay-works {
    background-size: 60px 60px;
    background-image: 
        linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px);
}

.dark .grid-overlay-works {
    background-image: 
        linear-gradient(to right, rgba(255, 77, 77, 0.05) 1px, transparent 1px);
}

.dark .card-glass-works {
    background: rgba(10, 10, 10, 0.6);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 77, 77, 0.1);
}

.connector-line {
    background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.1), transparent);
}

.dark .connector-line {
    background: linear-gradient(90deg, transparent, rgba(255, 77, 77, 0.3), transparent);
    box-shadow: 0 0 15px rgba(255, 77, 77, 0.1);
}

.dark .breathing-glow {
    animation: breathe 3s ease-in-out infinite;
}

@keyframes breathe {
    0%, 100% { text-shadow: 0 0 10px rgba(255, 77, 77, 0.4); }
    50% { text-shadow: 0 0 25px rgba(255, 77, 77, 0.8), 0 0 45px rgba(255, 77, 77, 0.4); }
}
`;
    fs.appendFileSync(cssPath, cssAppend, 'utf8');
    console.log("CSS How-It-Works utilities added successfully");
} else {
    console.log("CSS already has How-It-Works utilities");
}
