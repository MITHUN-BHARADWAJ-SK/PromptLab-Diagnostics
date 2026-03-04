import re

html_path = 'f:/PROMPTLAB/public/landing.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

new_section = """        <!-- ── Model Showcase ───────────────────────────────────── -->
        <section
            class="relative z-10 py-24 px-4 bg-slate-50 dark:bg-[#020202] border-y border-slate-200 dark:border-white/5 transition-colors duration-500 overflow-hidden"
            id="models">
            <div class="absolute inset-0 grid-overlay pointer-events-none opacity-10 dark:opacity-40 transition-opacity duration-500"></div>
            <div class="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-primary/5 dark:bg-primary/10 blur-[120px] rounded-full pointer-events-none transition-colors duration-500"></div>
            <div class="absolute bottom-[-10%] left-1/4 w-[600px] h-[400px] bg-primary/5 dark:bg-primary/5 blur-[100px] rounded-full pointer-events-none transition-colors duration-500"></div>
            
            <div class="relative z-10 max-w-7xl mx-auto flex flex-col items-center text-center">
                <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 dark:border-primary/30 bg-primary/5 mb-10 transition-colors duration-500">
                    <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                    <span class="text-[10px] font-bold tracking-[0.2em] uppercase text-primary">Model Support: Active Analysis</span>
                </div>
                <h2 class="text-4xl md:text-6xl lg:text-8xl font-black tracking-tight text-slate-900 dark:text-white mb-8 leading-none transition-colors duration-500">
                    OPTIMIZED FOR<br/>
                    <span class="text-primary glow-text-red">EVERY MAJOR AI MODEL</span>
                </h2>
                <p class="max-w-2xl mx-auto text-lg text-slate-500 dark:text-white/40 mb-20 leading-relaxed font-light transition-colors duration-500">
                    Each model has unique scoring weights, anti-patterns, and rewrite strategies tailored to how it actually works.
                </p>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24 w-full">
                    
                    <!-- OpenAI GPT -->
                    <div class="group flex flex-col p-10 rounded-[24px] text-left transition-all duration-500 bg-white dark:bg-[#0f0f0f]/40 backdrop-blur-xl border border-slate-200 dark:border-white/5 shadow-xl dark:shadow-none hover:border-[#10A37F]/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.05)] dark:hover:shadow-[0_0_30px_rgba(16,185,129,0.05)]">
                        <div class="w-14 h-14 rounded-xl bg-[#10A37F]/10 flex items-center justify-center mb-10 border border-[#10A37F]/20 group-hover:bg-[#10A37F]/20 transition-all overflow-hidden p-1.5">
                            <img src="/assets/logos/chatgpt.png" alt="ChatGPT Logo" class="w-full h-full object-contain dark:invert" />
                        </div>
                        <h3 class="text-2xl font-bold text-slate-900 dark:text-white mb-2 transition-colors duration-500">OpenAI GPT</h3>
                        <p class="text-[9px] font-bold tracking-[0.2em] uppercase text-[#10A37F] mb-10">Instruction-Following Powerhouse</p>
                        
                        <ul class="space-y-4 mb-14 flex-1">
                            <li class="flex items-center gap-3 text-sm text-slate-600 dark:text-white/70 transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#10A37F]"></span> System-role framing emphasis
                            </li>
                            <li class="flex items-center gap-3 text-sm text-slate-600 dark:text-white/70 transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#10A37F]"></span> Chain-of-thought triggers
                            </li>
                            <li class="flex items-center gap-3 text-sm text-slate-600 dark:text-white/70 transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#10A37F]"></span> Output format adherence
                            </li>
                            <li class="flex items-center gap-3 text-sm text-slate-800 dark:text-white font-medium transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#10A37F]"></span> 30% weight on controllability
                            </li>
                        </ul>
                        
                        <div class="h-1 w-full bg-slate-100 dark:bg-white/5 rounded-full flex overflow-hidden transition-colors duration-500">
                            <div class="h-full bg-primary w-[15%]"></div>
                            <div class="h-full bg-amber-500 w-[20%]"></div>
                            <div class="h-full bg-[#10A37F] w-[45%]"></div>
                            <div class="h-full bg-slate-200 dark:bg-white/10 w-[20%]"></div>
                        </div>
                    </div>

                    <!-- Anthropic Claude -->
                    <div class="group flex flex-col p-10 rounded-[24px] text-left transition-all duration-500 bg-primary/[0.02] dark:bg-primary/[0.04] backdrop-blur-xl border border-primary/20 dark:border-primary/20 shadow-xl dark:shadow-none hover:border-[#D97706]/30 hover:shadow-[0_0_30px_rgba(217,119,6,0.05)] dark:hover:shadow-[0_0_30px_rgba(217,119,6,0.05)] relative md:-translate-y-4">
                        <div class="absolute -top-3 right-8 bg-primary px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20">
                            Most Nuanced
                        </div>
                        <div class="w-14 h-14 rounded-xl bg-[#D97706]/10 flex items-center justify-center mb-10 border border-[#D97706]/20 group-hover:bg-[#D97706]/20 transition-all overflow-hidden p-1.5">
                            <img src="/assets/logos/claude.png" alt="Claude Logo" class="w-full h-full object-contain" />
                        </div>
                        <h3 class="text-2xl font-bold text-slate-900 dark:text-white mb-2 transition-colors duration-500">Anthropic Claude</h3>
                        <p class="text-[9px] font-bold tracking-[0.2em] uppercase text-[#D97706] mb-10">Safety-Aligned Precision Engine</p>
                        
                        <ul class="space-y-4 mb-14 flex-1">
                            <li class="flex items-center gap-3 text-sm text-slate-600 dark:text-white/70 transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#D97706]"></span> XML tag structure emphasis
                            </li>
                            <li class="flex items-center gap-3 text-sm text-slate-600 dark:text-white/70 transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#D97706]"></span> Explicit scope boundaries
                            </li>
                            <li class="flex items-center gap-3 text-sm text-slate-600 dark:text-white/70 transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#D97706]"></span> Safety-aligned framing
                            </li>
                            <li class="flex items-center gap-3 text-sm text-slate-800 dark:text-white font-medium transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#D97706]"></span> 30% weight on constraints
                            </li>
                        </ul>
                        
                        <div class="h-1 w-full bg-slate-100 dark:bg-white/5 rounded-full flex overflow-hidden transition-colors duration-500">
                            <div class="h-full bg-primary w-[10%]"></div>
                            <div class="h-full bg-[#D97706] w-[55%]"></div>
                            <div class="h-full bg-slate-200 dark:bg-white/10 w-[35%]"></div>
                        </div>
                    </div>

                    <!-- Google Gemini -->
                    <div class="group flex flex-col p-10 rounded-[24px] text-left transition-all duration-500 bg-white dark:bg-[#0f0f0f]/40 backdrop-blur-xl border border-slate-200 dark:border-white/5 shadow-xl dark:shadow-none hover:border-[#3B82F6]/30 hover:shadow-[0_0_30px_rgba(59,130,246,0.05)] dark:hover:shadow-[0_0_30px_rgba(59,130,246,0.05)]">
                        <div class="w-14 h-14 rounded-xl bg-[#3B82F6]/10 flex items-center justify-center mb-10 border border-[#3B82F6]/20 group-hover:bg-[#3B82F6]/20 transition-all overflow-hidden p-[2px]">
                            <img src="/assets/logos/gemini.png" alt="Gemini Logo" class="w-full h-full object-contain" />
                        </div>
                        <h3 class="text-2xl font-bold text-slate-900 dark:text-white mb-2 transition-colors duration-500">Google Gemini</h3>
                        <p class="text-[9px] font-bold tracking-[0.2em] uppercase text-[#3B82F6] mb-10">Multimodal &amp; Context-First</p>
                        
                        <ul class="space-y-4 mb-14 flex-1">
                            <li class="flex items-center gap-3 text-sm text-slate-600 dark:text-white/70 transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#3B82F6]"></span> Context-before-task structure
                            </li>
                            <li class="flex items-center gap-3 text-sm text-slate-600 dark:text-white/70 transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#3B82F6]"></span> Grounding cues emphasis
                            </li>
                            <li class="flex items-center gap-3 text-sm text-slate-600 dark:text-white/70 transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#3B82F6]"></span> Multimodal references
                            </li>
                            <li class="flex items-center gap-3 text-sm text-slate-800 dark:text-white font-medium transition-colors duration-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#3B82F6]"></span> 25% weight on model alignment
                            </li>
                        </ul>
                        
                        <div class="h-1 w-full bg-slate-100 dark:bg-white/5 rounded-full flex overflow-hidden transition-colors duration-500">
                            <div class="h-full bg-primary w-[15%]"></div>
                            <div class="h-full bg-[#3B82F6] w-[15%]"></div>
                            <div class="h-full bg-amber-400 w-[30%]"></div>
                            <div class="h-full bg-slate-200 dark:bg-white/10 w-[40%]"></div>
                        </div>
                    </div>

                </div>
            </div>
        </section>"""

start_token = "<!-- ── Model Showcase ───────────────────────────────────── -->"
end_token = "<!-- ── How It Works ─────────────────────────────────────── -->"

start_idx = html.find(start_token)
end_idx = html.find(end_token)

if start_idx != -1 and end_idx != -1:
    new_html = html[:start_idx] + new_section + "\n\n        " + html[end_idx:]
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(new_html)
    print("Replaced Model Showcase successfully")
else:
    print("Tokens not found.")

# Update CSS path
css_path = 'f:/PROMPTLAB/public/css/landing.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

if '.grid-overlay' not in css:
    css_append = """

.grid-overlay {
    background-size: 40px 40px;
    background-image: 
        linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px);
}

.dark .grid-overlay {
    background-image: 
        linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
}
"""
    with open(css_path, 'a', encoding='utf-8') as f:
        f.write(css_append)
    print("CSS grid-overlay added successfully")
else:
    print("CSS already has grid-overlay")

