'use strict';

/**
 * PromptLab Landing — Interactive Layer
 * Adds premium futuristic interactivity without changing the UI layout.
 */
(function () {
    const isHoverDevice = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function lerp(a, b, t) { return a + (b - a) * t; }

    /* ══════════════════════════════════════════════════════════
       1. CURSOR SPOTLIGHT
       Smooth radial glow that follows the cursor across the page.
    ══════════════════════════════════════════════════════════ */
    function initCursorSpotlight() {
        if (!isHoverDevice || prefersReducedMotion) return;

        const el = document.createElement('div');
        el.id = 'cursor-spotlight';
        document.body.appendChild(el);

        let mouseX = -1000, mouseY = -1000;
        let curX = -1000, curY = -1000;

        document.addEventListener('mousemove', e => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            el.style.opacity = '1';
        }, { passive: true });

        document.addEventListener('mouseleave', () => el.style.opacity = '0');

        (function tick() {
            curX = lerp(curX, mouseX, 0.07);
            curY = lerp(curY, mouseY, 0.07);
            el.style.transform = `translate(${curX - 350}px, ${curY - 350}px)`;
            requestAnimationFrame(tick);
        })();
    }

    /* ══════════════════════════════════════════════════════════
       2. SCROLL REVEAL
       Sections and cards fade-up on scroll via IntersectionObserver.
    ══════════════════════════════════════════════════════════ */
    function initScrollReveal() {
        if (prefersReducedMotion) return;

        const groups = [
            '#features .glow-border',
            '#models .group',
            '#how-it-works .group',
            '#pricing .rounded-2xl',
        ];

        const allEls = [];
        groups.forEach(sel => {
            document.querySelectorAll(sel).forEach((el, i) => {
                // Skip if already visible (above the fold)
                const rect = el.getBoundingClientRect();
                if (rect.top < window.innerHeight - 80) return;

                el.classList.add('reveal');
                el.style.transitionDelay = (i * 85) + 'ms';
                allEls.push(el);
            });
        });

        if (!allEls.length) return;

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('reveal-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

        allEls.forEach(el => observer.observe(el));
    }

    /* ══════════════════════════════════════════════════════════
       3. 3D CARD TILT
       Subtle perspective tilt on feature, model, and pricing cards.
    ══════════════════════════════════════════════════════════ */
    function initCardTilt() {
        if (!isHoverDevice || prefersReducedMotion) return;

        const cards = document.querySelectorAll(
            '#features .glow-border, #models .group, #pricing .rounded-2xl'
        );

        cards.forEach(card => {
            // Read any existing Y-translate from responsive classes (e.g. md:-translate-y-4)
            const hasNegativeTranslate = Array.from(card.classList).some(c => c.includes('-translate-y'));
            const baseY = hasNegativeTranslate ? (parseFloat(getComputedStyle(card).transform.split(',')[13]) || 0) : 0;
            let leaveTimer;

            card.addEventListener('mousemove', e => {
                clearTimeout(leaveTimer);
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const rx = ((y - rect.height / 2) / (rect.height / 2)) * -5;
                const ry = ((x - rect.width / 2) / (rect.width / 2)) * 5;

                card.style.transition = 'transform 0.1s ease';
                card.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${baseY}px) translateZ(10px)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transition = 'transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)';
                card.style.transform = baseY ? `translateY(${baseY}px)` : '';
                leaveTimer = setTimeout(() => {
                    card.style.transition = '';
                    card.style.transform = '';
                }, 600);
            });
        });
    }

    /* ══════════════════════════════════════════════════════════
       4. MAGNETIC BUTTONS
       Primary CTA buttons softly attract cursor when hovered.
    ══════════════════════════════════════════════════════════ */
    function initMagneticButtons() {
        if (!isHoverDevice || prefersReducedMotion) return;

        // The Analyze button in hero and the CTA section button
        const btns = document.querySelectorAll(
            '.hero button.bg-primary, section > div > a.bg-primary.px-8'
        );

        btns.forEach(btn => {
            btn.addEventListener('mousemove', e => {
                const rect = btn.getBoundingClientRect();
                const dx = e.clientX - (rect.left + rect.width / 2);
                const dy = e.clientY - (rect.top + rect.height / 2);
                btn.style.transition = 'transform 0.12s ease';
                btn.style.transform = `translate(${dx * 0.25}px, ${dy * 0.25}px) scale(1.03)`;
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
                btn.style.transform = '';
                setTimeout(() => btn.style.transition = '', 500);
            });
        });
    }

    /* ══════════════════════════════════════════════════════════
       5. HERO AUTO-TYPING
       Animates demo prompts being typed in the hero terminal,
       updating the live ln/col counters and buffer bar.
    ══════════════════════════════════════════════════════════ */
    function initHeroTyping() {
        const textarea = document.querySelector('.hero textarea');
        if (!textarea) return;

        // Status elements inside the terminal
        const statusBar = textarea.closest('.flex-1').querySelector('.pointer-events-none');
        const lnEl = statusBar ? statusBar.querySelector('span:first-child') : null;
        const colEl = statusBar ? statusBar.querySelector('span:nth-child(2)') : null;
        const bufferBar = document.querySelector('.hero .h-full.bg-primary');

        const prompts = [
            `Act as a senior UX researcher. Analyze the UI description and return the top 3 friction points in JSON with keys "friction_point", "severity" (1-5), and "recommendation".`,
            `You are a legal expert. Summarize the following contract clause in plain English. Flag any ambiguities and rate overall risk on a scale of 1-10 with reasoning.`,
            `As a Python expert, refactor this function for clarity and performance. Preserve all edge cases, add type hints, and explain each change in a brief comment.`,
        ];

        let promptIdx = 0;
        let charIdx = 0;
        let stopped = false;
        let timer;

        function updateStats() {
            const val = textarea.value;
            const lines = val.split('\n');
            if (lnEl) lnEl.textContent = 'ln: ' + String(lines.length).padStart(2, '0');
            if (colEl) colEl.textContent = 'col: ' + String(lines[lines.length - 1].length).padStart(2, '0');
            if (bufferBar) {
                const pct = Math.round((charIdx / prompts[promptIdx].length) * 100);
                bufferBar.style.width = Math.min(pct, 100) + '%';
            }
        }

        function type() {
            if (stopped) return;
            const prompt = prompts[promptIdx];
            if (charIdx < prompt.length) {
                textarea.value += prompt[charIdx++];
                updateStats();
                timer = setTimeout(type, 20 + Math.random() * 28);
            } else {
                timer = setTimeout(erase, 3800);
            }
        }

        function erase() {
            if (stopped) return;
            if (textarea.value.length > 0) {
                textarea.value = textarea.value.slice(0, -1);
                charIdx = textarea.value.length;
                updateStats();
                timer = setTimeout(erase, 7);
            } else {
                promptIdx = (promptIdx + 1) % prompts.length;
                charIdx = 0;
                timer = setTimeout(type, 700);
            }
        }

        timer = setTimeout(type, 1800);

        // User clicking into the textarea triggers redirect (onfocus attr), just stop animation
        textarea.addEventListener('focus', () => {
            stopped = true;
            clearTimeout(timer);
        }, { once: true });
    }

    /* ══════════════════════════════════════════════════════════
       6. HEADER SCROLL EFFECT
       Adds depth/shadow to header as user scrolls down.
    ══════════════════════════════════════════════════════════ */
    function initHeaderScroll() {
        const header = document.querySelector('header');
        if (!header) return;

        window.addEventListener('scroll', () => {
            header.classList.toggle('header-scrolled', window.scrollY > 20);
        }, { passive: true });
    }

    /* ══════════════════════════════════════════════════════════
       7. ACTIVE NAV TRACKING
       Highlights the nav link corresponding to the visible section.
    ══════════════════════════════════════════════════════════ */
    function initActiveNav() {
        const ids = ['features', 'models', 'how-it-works', 'testimonials', 'pricing'];
        const navLinks = document.querySelectorAll('#desktopNav nav a');

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const href = '#' + entry.target.id;
                    navLinks.forEach(link => {
                        link.classList.toggle('nav-active', link.getAttribute('href') === href);
                    });
                }
            });
        }, { threshold: 0.35 });

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
    }

    /* ══════════════════════════════════════════════════════════
       8. RIPPLE EFFECT
       Material-style radial ripple on buttons and diagnostic pills.
    ══════════════════════════════════════════════════════════ */
    function initRippleEffect() {
        document.querySelectorAll('button, .diagnostic-pill').forEach(el => {
            if (el.dataset.rippleInit) return;
            el.dataset.rippleInit = '1';

            if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

            el.addEventListener('click', e => {
                const rect = el.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height) * 2.4;
                const ripple = document.createElement('span');
                ripple.className = 'btn-ripple';
                ripple.style.width = ripple.style.height = size + 'px';
                ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
                ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
                el.appendChild(ripple);
                ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
            });
        });
    }

    /* ══════════════════════════════════════════════════════════
       9. GLITCH HOVER on section headings
       Brief glitch flicker on hover for h2 elements in sections.
    ══════════════════════════════════════════════════════════ */
    function initGlitchHeadings() {
        if (!isHoverDevice || prefersReducedMotion) return;

        document.querySelectorAll('#features h2, #models h2, #how-it-works h2, #pricing h2').forEach(h => {
            h.classList.add('glitch-hover');
        });
    }

    /* ══════════════════════════════════════════════════════════
       10. DIAGNOSTIC PILL — score counter on click
       Shows a quick "+1 XP" badge pop when clicking pills.
    ══════════════════════════════════════════════════════════ */
    function initPillFeedback() {
        document.querySelectorAll('.diagnostic-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const badge = document.createElement('span');
                badge.className = 'xp-badge';
                badge.textContent = '+1 XP';
                pill.appendChild(badge);
                badge.addEventListener('animationend', () => badge.remove(), { once: true });
            });
        });
    }

    /* ══════════════════════════════════════════════════════════
       11. PRICING HORIZONTAL SCROLL
       Drag-to-scroll carousel with snap, dots, and arrow nav.
    ══════════════════════════════════════════════════════════ */
    function initPricingScroll() {
        const track = document.getElementById('pricingTrack');
        if (!track) return;

        const cards = track.querySelectorAll('.pricing-card-item');

        // ── Physics state ──
        let posX     = 0;    // current scroll position (mirrors track.scrollLeft)
        let velX     = 0;    // px per ms, smoothed
        let snapTo   = null; // null = coasting, number = target card offset
        let dragging = false;
        let moved    = 0;    // total drag distance this gesture (for click guard)
        let raf      = null;

        // Pointer tracking
        let pStart = 0, pStartPos = 0, pPrev = 0, pPrevT = 0;

        const FRICTION  = 0.95;  // per-frame decay — long natural coast
        const SNAP_K    = 0.16;  // lerp factor for snap-to-card (decisive but smooth)
        const VEL_SMOOTH = 0.35; // exponential smoothing on velocity samples

        function maxPos() { return Math.max(0, track.scrollWidth - track.clientWidth); }
        function clampPos(v) { return Math.max(0, Math.min(v, maxPos())); }
        function cardOffset(i) { return cards[i] ? Math.max(0, cards[i].offsetLeft - 56) : 0; }

        function nearestSnap() {
            let best = 0, bestD = Infinity;
            for (let i = 0; i < cards.length; i++) {
                const d = Math.abs(cardOffset(i) - posX);
                if (d < bestD) { bestD = d; best = i; }
            }
            return cardOffset(best);
        }

        function commit() { track.scrollLeft = posX; }

        function loop() {
            raf = null;
            if (dragging) return;

            if (snapTo !== null) {
                // Snap phase: lerp to target card
                const diff = snapTo - posX;
                if (Math.abs(diff) < 0.2) {
                    posX = snapTo;
                    snapTo = null;
                    commit();
                    return; // stop loop — fully settled
                }
                posX += diff * SNAP_K;
                commit();
            } else {
                // Momentum coast phase
                velX *= FRICTION;
                posX = clampPos(posX + velX);
                commit();
                if (Math.abs(velX) < 0.25) {
                    velX = 0;
                    snapTo = nearestSnap(); // hand off to snap phase
                }
            }

            raf = requestAnimationFrame(loop);
        }

        function startLoop() {
            if (!raf) raf = requestAnimationFrame(loop);
        }

        function stopLoop() {
            if (raf) { cancelAnimationFrame(raf); raf = null; }
        }

        // ── Sample velocity with exponential smoothing ──
        function sampleVel(clientX) {
            const now = performance.now();
            const dt  = Math.max(1, now - pPrevT);
            const raw = -(clientX - pPrev) / dt; // px/ms, negative = scroll right
            velX  = velX * (1 - VEL_SMOOTH) + raw * VEL_SMOOTH;
            pPrev = clientX;
            pPrevT = now;
        }

        // ── Mouse drag ──
        track.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            stopLoop();
            dragging  = true;
            snapTo    = null;
            velX      = 0;
            moved     = 0;
            pStart    = e.clientX;
            pStartPos = posX;
            pPrev     = e.clientX;
            pPrevT    = performance.now();
            track.classList.add('is-dragging');
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            sampleVel(e.clientX);
            moved = Math.abs(e.clientX - pStart);
            posX  = clampPos(pStartPos - (e.clientX - pStart));
            commit();
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            track.classList.remove('is-dragging');
            if (Math.abs(velX) < 0.15) snapTo = nearestSnap();
            startLoop();
        });

        // Suppress click if we actually dragged
        track.addEventListener('click', e => {
            if (moved > 6) e.preventDefault();
        }, true);

        // ── Touch drag ──
        let tStart = 0, tStartPos = 0;

        track.addEventListener('touchstart', e => {
            stopLoop();
            const t   = e.touches[0];
            dragging  = true;
            snapTo    = null;
            velX      = 0;
            moved     = 0;
            tStart    = t.clientX;
            tStartPos = posX;
            pPrev     = t.clientX;
            pPrevT    = performance.now();
        }, { passive: true });

        track.addEventListener('touchmove', e => {
            if (!dragging) return;
            const t = e.touches[0];
            sampleVel(t.clientX);
            moved = Math.abs(t.clientX - tStart);
            posX  = clampPos(tStartPos - (t.clientX - tStart));
            commit();
        }, { passive: true });

        track.addEventListener('touchend', () => {
            if (!dragging) return;
            dragging = false;
            if (Math.abs(velX) < 0.15) snapTo = nearestSnap();
            startLoop();
        }, { passive: true });

        // Sync posX if user somehow scrolls natively
        track.addEventListener('scroll', () => {
            if (!dragging && !raf) posX = track.scrollLeft;
        }, { passive: true });

        // ── Drag hint ──
        const hint = document.getElementById('pricingDragHint');
        if (hint) {
            setTimeout(() => { hint.style.opacity = '1'; }, 900);
            const hide = () => { hint.style.opacity = '0'; hint.style.pointerEvents = 'none'; };
            track.addEventListener('mousedown', hide, { once: true });
            track.addEventListener('touchstart', hide, { once: true, passive: true });
            setTimeout(hide, 5000);
        }
    }



    /* ══════════════════════════════════════════════════════════
       12. CUSTOM CURSOR
       Dot (instant) + ring (lerp) system replacing the native cursor.
       Morphs on hover; brightened glow on the dot.
    ══════════════════════════════════════════════════════════ */
    function initCustomCursor() {
        if (!isHoverDevice || prefersReducedMotion) return;

        const dot = document.createElement('div');
        const ring = document.createElement('div');
        dot.id = 'cursor-dot';
        ring.id = 'cursor-ring';
        document.body.appendChild(dot);
        document.body.appendChild(ring);

        let mx = -200, my = -200;
        let rx = -200, ry = -200;

        document.addEventListener('mousemove', e => {
            mx = e.clientX;
            my = e.clientY;
            dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
            dot.style.opacity = '1';
            ring.style.opacity = '1';
        }, { passive: true });

        document.addEventListener('mouseleave', () => {
            dot.style.opacity = '0';
            ring.style.opacity = '0';
        });

        // Hover detection on interactive elements
        const hoverTargets = 'a, button, [role="button"], input, textarea, select, label, .pricing-card-item, .glow-border';
        document.addEventListener('mouseover', e => {
            if (e.target.closest(hoverTargets)) {
                ring.classList.add('cursor-hover');
                dot.classList.add('cursor-hover');
            }
        });
        document.addEventListener('mouseout', e => {
            if (e.target.closest(hoverTargets)) {
                ring.classList.remove('cursor-hover');
                dot.classList.remove('cursor-hover');
            }
        });

        // Click pulse
        document.addEventListener('mousedown', () => {
            ring.classList.add('cursor-click');
            dot.classList.add('cursor-click');
        });
        document.addEventListener('mouseup', () => {
            ring.classList.remove('cursor-click');
            dot.classList.remove('cursor-click');
        });

        // Ring lags behind with lerp
        (function tick() {
            rx = lerp(rx, mx, 0.13);
            ry = lerp(ry, my, 0.13);
            ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
            requestAnimationFrame(tick);
        })();
    }

    /* ══════════════════════════════════════════════════════════
       13. SCROLL PROGRESS BAR
       Lerp-smoothed red glow line at the top of the viewport.
    ══════════════════════════════════════════════════════════ */
    function initScrollProgress() {
        const bar = document.createElement('div');
        bar.id = 'scroll-progress';
        document.body.appendChild(bar);

        let target = 0, current = 0, raf = null;

        window.addEventListener('scroll', () => {
            const h = document.documentElement;
            target = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) * 100;
            if (!raf) {
                const tick = () => {
                    current = lerp(current, target, 0.14);
                    bar.style.width = current + '%';
                    if (Math.abs(target - current) > 0.05) {
                        raf = requestAnimationFrame(tick);
                    } else {
                        bar.style.width = target + '%';
                        raf = null;
                    }
                };
                raf = requestAnimationFrame(tick);
            }
        }, { passive: true });
    }

    /* ══════════════════════════════════════════════════════════
       14. CARD INNER SHIMMER
       Mouse-tracking radial glow that lives inside each card,
       giving a sense of material depth and light refraction.
    ══════════════════════════════════════════════════════════ */
    function initCardShimmer() {
        if (!isHoverDevice) return;

        const targets = document.querySelectorAll(
            '#features .glow-border, #models .group, .pricing-card-item'
        );

        targets.forEach(card => {
            const cs = getComputedStyle(card);
            if (cs.position === 'static') card.style.position = 'relative';

            const shimmer = document.createElement('div');
            shimmer.className = 'card-shimmer';
            card.appendChild(shimmer);

            card.addEventListener('mousemove', e => {
                const r = card.getBoundingClientRect();
                shimmer.style.setProperty('--mx', ((e.clientX - r.left) / r.width  * 100) + '%');
                shimmer.style.setProperty('--my', ((e.clientY - r.top)  / r.height * 100) + '%');
                shimmer.style.opacity = '1';
            });
            card.addEventListener('mouseleave', () => { shimmer.style.opacity = '0'; });
        });
    }

    /* ══════════════════════════════════════════════════════════
       15. SMOOTH NAV INDICATOR PILL
       A thin red underline that glides between nav links,
       previewing on hover and locking onto the active section.
    ══════════════════════════════════════════════════════════ */
    function initNavPill() {
        if (!isHoverDevice) return;
        const nav = document.querySelector('#desktopNav nav.landing-nav');
        if (!nav) return;

        nav.style.position = 'relative';
        const pill = document.createElement('span');
        pill.id = 'nav-indicator';
        nav.appendChild(pill);

        function moveTo(link) {
            if (!link) { pill.style.opacity = '0'; return; }
            const navRect  = nav.getBoundingClientRect();
            const linkRect = link.getBoundingClientRect();
            pill.style.left  = (linkRect.left - navRect.left) + 'px';
            pill.style.width = linkRect.width + 'px';
            pill.style.opacity = '1';
        }

        // Slide on hover
        nav.querySelectorAll('a').forEach(a => {
            a.addEventListener('mouseenter', () => moveTo(a));
            a.addEventListener('mouseleave', () => moveTo(nav.querySelector('.nav-active')));
        });

        // Lock to active section via MutationObserver
        new MutationObserver(() => {
            const active = nav.querySelector('.nav-active');
            if (!document.querySelector(':hover')?.closest('nav')) moveTo(active);
        }).observe(nav, { subtree: true, attributeFilter: ['class'] });
    }

    /* ══════════════════════════════════════════════════════════
       16. HERO PARALLAX
       Hero layers drift at different speeds on scroll,
       creating a sense of physical depth.
    ══════════════════════════════════════════════════════════ */
    function initHeroParallax() {
        if (prefersReducedMotion) return;
        const hero = document.querySelector('.hero');
        if (!hero) return;

        const badge    = hero.querySelector('[class*="inline-flex"][class*="tracking"]');
        const heading  = hero.querySelector('h1');
        const sub      = hero.querySelector('p');
        const terminal = hero.querySelector('.terminal-glass')?.closest('[class*="max-w-3xl"]');

        const layers = [
            [badge,    0.025],
            [heading,  0.06 ],
            [sub,      0.04 ],
            [terminal, 0.10 ],
        ];

        window.addEventListener('scroll', () => {
            const y = window.scrollY;
            layers.forEach(([el, speed]) => {
                if (el) el.style.transform = `translateY(${(y * speed).toFixed(2)}px)`;
            });
        }, { passive: true });
    }

    /* ══════════════════════════════════════════════════════════
       17. TEXT SCRAMBLE
       Section headings decode from random chars when entering
       the viewport — hacker-terminal reveal effect.
    ══════════════════════════════════════════════════════════ */
    function initTextScramble() {
        if (prefersReducedMotion) return;

        const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&';

        function scramble(el, original, duration) {
            let frame = 0;
            const total = Math.round(duration / 16);
            const tick = () => {
                const progress = frame / total;
                let out = '';
                for (let i = 0; i < original.length; i++) {
                    const ch = original[i];
                    if (ch === ' ' || ch === '\n') { out += ch; continue; }
                    // Reveal left-to-right with a soft leading edge
                    if (progress > i / original.length * 1.3) {
                        out += ch;
                    } else {
                        out += CHARS[Math.floor(Math.random() * CHARS.length)];
                    }
                }
                el.textContent = out;
                if (frame < total) { frame++; requestAnimationFrame(tick); }
                else el.textContent = original;
            };
            tick();
        }

        document.querySelectorAll(
            '#features h2, #models h2, #how-it-works h2, #pricing h2'
        ).forEach(h => {
            if (h.childElementCount > 0) return; // skip gradient-span headings
            const orig = h.textContent.trim();
            if (!orig) return;
            const obs = new IntersectionObserver(entries => {
                if (entries[0].isIntersecting) { scramble(h, orig, 780); obs.disconnect(); }
            }, { threshold: 0.5 });
            obs.observe(h);
        });
    }

    /* ══════════════════════════════════════════════════════════
       18. CURSOR PARTICLE TRAIL
       Shiny sparks — white-hot core, red outer glow — drift
       outward from the cursor with randomised size + duration.
    ══════════════════════════════════════════════════════════ */
    function initCursorTrail() {
        if (!isHoverDevice || prefersReducedMotion) return;

        let lastSpawn = 0;

        function spawnParticle(x, y) {
            const p = document.createElement('span');
            p.className = 'cursor-trail-particle';

            // Randomise size: 3 – 7 px
            const size = 3 + Math.random() * 4;
            p.style.width  = size + 'px';
            p.style.height = size + 'px';
            p.style.left   = x + 'px';
            p.style.top    = y + 'px';

            // Alternate between bright spark (white core) and pure red glow
            if (Math.random() > 0.38) {
                // Shiny spark: white-hot center → red → transparent
                p.style.background = `radial-gradient(circle, #fff 0%, #ff3333 45%, transparent 100%)`;
                p.style.boxShadow  = [
                    `0 0 ${size * 1.5}px #fff`,
                    `0 0 ${size * 3}px rgba(220,38,38,0.9)`,
                    `0 0 ${size * 6}px rgba(220,38,38,0.45)`,
                    `0 0 ${size * 10}px rgba(220,38,38,0.2)`,
                ].join(', ');
            } else {
                // Deep red ember
                p.style.background = `radial-gradient(circle, #ff4d4d 0%, #dc2626 55%, transparent 100%)`;
                p.style.boxShadow  = [
                    `0 0 ${size * 2}px rgba(220,38,38,1)`,
                    `0 0 ${size * 5}px rgba(220,38,38,0.6)`,
                    `0 0 ${size * 9}px rgba(220,38,38,0.25)`,
                ].join(', ');
            }

            // Random drift angle, 25–55 px travel distance
            const angle = Math.random() * Math.PI * 2;
            const dist  = 25 + Math.random() * 30;
            p.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
            p.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');

            // Random lifetime: 0.7 – 1.2 s
            const dur = (0.7 + Math.random() * 0.5).toFixed(2);
            p.style.setProperty('--dur', dur + 's');

            document.body.appendChild(p);
            p.addEventListener('animationend', () => p.remove(), { once: true });
        }

        document.addEventListener('mousemove', e => {
            const now = performance.now();
            if (now - lastSpawn < 40) return; // ~25 sparks/sec
            lastSpawn = now;

            // Spawn 1-2 particles per tick for a denser trail
            spawnParticle(e.clientX, e.clientY);
            if (Math.random() > 0.55) spawnParticle(e.clientX, e.clientY);
        }, { passive: true });
    }

    /* ══════════════════════════════════════════════════════════
       19. FEATURES SECTION — PREMIUM INTERACTIONS
       Border beam, ghost numbers, icon sonar, tag highlight.
    ══════════════════════════════════════════════════════════ */
    function initFeatureEnhancements() {
        const cards = document.querySelectorAll('#features .glow-border');
        if (!cards.length) return;

        cards.forEach((card, idx) => {
            // ── Ghost card number (01 – 06) ──────────────────────
            const num = document.createElement('div');
            num.className = 'feature-card-num';
            num.textContent = String(idx + 1).padStart(2, '0');
            card.appendChild(num);

            // ── Tag class for CSS hover targeting ─────────────────
            card.querySelectorAll('.flex.flex-wrap.gap-2 span').forEach(tag => {
                tag.classList.add('feature-tag');
            });

            // ── Icon box class for CSS hover targeting ────────────
            const iconBox = card.querySelector('[class*="size-10"]');
            if (iconBox) iconBox.classList.add('feature-icon-box');

            if (!isHoverDevice || prefersReducedMotion) return;

            // ── Border beam ───────────────────────────────────────
            const beam = document.createElement('div');
            beam.className = 'feature-beam';
            card.appendChild(beam);

            let raf = null, progress = 0, opacity = 0, active = false;

            function tickBeam() {
                opacity = active
                    ? Math.min(1, opacity + 0.07)
                    : Math.max(0, opacity - 0.05);

                progress = (progress + 0.0035) % 1;

                const w = card.offsetWidth;
                const h = card.offsetHeight;
                const P = 2 * (w + h);
                const d = progress * P;

                let x, y;
                if      (d <= w)           { x = d;           y = 0; }
                else if (d <= w + h)       { x = w;           y = d - w; }
                else if (d <= 2 * w + h)   { x = 2*w + h - d; y = h; }
                else                       { x = 0;           y = P - d; }

                beam.style.left    = x + 'px';
                beam.style.top     = y + 'px';
                beam.style.opacity = opacity;

                if (opacity > 0) {
                    raf = requestAnimationFrame(tickBeam);
                } else {
                    raf = null;
                }
            }

            card.addEventListener('mouseenter', () => {
                active = true;
                if (!raf) raf = requestAnimationFrame(tickBeam);
            });

            card.addEventListener('mouseleave', () => { active = false; });

            // ── Icon sonar ping ───────────────────────────────────
            if (iconBox) {
                iconBox.style.position = 'relative';
                card.addEventListener('mouseenter', () => {
                    iconBox.querySelectorAll('.feature-icon-ring').forEach(r => r.remove());
                    const ring = document.createElement('span');
                    ring.className = 'feature-icon-ring';
                    iconBox.appendChild(ring);
                    ring.addEventListener('animationend', () => ring.remove(), { once: true });
                });
            }
        });
    }

    /* ══════════════════════════════════════════════════════════
       20. MODELS SECTION
       Color-keyed shimmer per card + progress bars fill from 0.
    ══════════════════════════════════════════════════════════ */
    function initModelsSection() {
        const MODEL_COLORS = ['#10A37F', '#D97706', '#3B82F6'];

        document.querySelectorAll('#models .group').forEach((card, idx) => {
            const hex   = MODEL_COLORS[idx] || '#dc2626';
            const r     = parseInt(hex.slice(1, 3), 16);
            const g     = parseInt(hex.slice(3, 5), 16);
            const b     = parseInt(hex.slice(5, 7), 16);

            // ── Recolour the generic shimmer with this model's hue ──
            if (isHoverDevice) {
                const shimmer = card.querySelector('.card-shimmer');
                if (shimmer) {
                    card.addEventListener('mousemove', e => {
                        const rect = card.getBoundingClientRect();
                        const mx = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1) + '%';
                        const my = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1) + '%';
                        shimmer.style.background =
                            `radial-gradient(circle at ${mx} ${my}, rgba(${r},${g},${b},0.13) 0%, transparent 65%)`;
                        shimmer.style.opacity = '1';
                    });
                    card.addEventListener('mouseleave', () => { shimmer.style.opacity = '0'; });
                }
            }

            // ── Progress bars: read target widths, reset to 0, animate on entry ──
            const barContainer = card.querySelector('.h-1.w-full');
            if (!barContainer) return;

            const colorBars = [...barContainer.children].filter(el =>
                /bg-(primary|\[|amber|blue|slate)/.test(el.className) &&
                !el.className.includes('bg-slate-100') &&
                !el.className.includes('bg-white')
            );
            if (!colorBars.length) return;

            // Capture rendered widths before zeroing
            const targets = colorBars.map(bar =>
                (bar.offsetWidth / barContainer.offsetWidth * 100).toFixed(1) + '%'
            );

            colorBars.forEach(bar => {
                bar.style.transition = 'none';
                bar.style.width = '0%';
            });

            new IntersectionObserver(entries => {
                if (!entries[0].isIntersecting) return;
                setTimeout(() => {
                    colorBars.forEach((bar, i) => {
                        bar.style.transition = `width 0.9s cubic-bezier(0.4,0,0.2,1) ${i * 110}ms`;
                        bar.style.width = targets[i];
                    });
                }, 150);
                entries[0].target._obs?.disconnect();
            }, { threshold: 0.4 }).observe(card);
        });
    }

    /* ══════════════════════════════════════════════════════════
       21. HOW IT WORKS SECTION
       Animated signal on connector line + step hover glow.
    ══════════════════════════════════════════════════════════ */
    function initHowItWorksSection() {
        const section = document.getElementById('how-it-works');
        if (!section || prefersReducedMotion) return;

        const connectors = section.querySelectorAll('.connector-line');
        if (!connectors.length) return;

        function fireSignals() {
            connectors.forEach((line, i) => {
                const sig = line.querySelector('.connector-signal');
                if (!sig) return;
                setTimeout(() => {
                    sig.style.animation = 'none';
                    void sig.offsetWidth;
                    sig.style.animation = 'signal-travel 1.4s cubic-bezier(0.4,0,0.2,1) forwards';
                }, i * 300);
            });
        }

        let fired = 0;
        new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting || fired >= 3) return;
            fired++;
            fireSignals();
            setTimeout(() => { if (fired < 3) { fired++; fireSignals(); } }, 2000);
            setTimeout(() => { if (fired < 3) { fired++; fireSignals(); } }, 4000);
        }, { threshold: 0.6 }).observe(section);
    }

    /* ══════════════════════════════════════════════════════════
       22. PRICING SECTION
       Featured glow + price count-up + card shimmer override.
    ══════════════════════════════════════════════════════════ */
    function initPricingSection() {
        const section = document.getElementById('pricing');
        if (!section) return;

        // Featured Pro card — breathing glow
        const proInner = section.querySelector('.pricing-card-featured > div');
        if (proInner && !prefersReducedMotion) proInner.classList.add('pro-card-glow');

        // Price count-up animation
        section.querySelectorAll('.pricing-card-item').forEach(item => {
            const priceEl = item.querySelector('[class*="text-4xl"]');
            if (!priceEl) return;
            const raw   = priceEl.textContent.trim();
            const match = raw.match(/(\D*)(\d+)(.*)/);
            if (!match) return;
            const [, pre, numStr, suf] = match;
            const target = parseInt(numStr, 10);
            if (!target) return;

            priceEl.textContent = pre + '0' + suf;

            new IntersectionObserver(entries => {
                if (!entries[0].isIntersecting) return;
                const t0  = performance.now();
                const dur = 850 + Math.random() * 200;
                const tick = now => {
                    const p     = Math.min((now - t0) / dur, 1);
                    const eased = 1 - Math.pow(1 - p, 3);
                    priceEl.textContent = pre + Math.round(target * eased) + suf;
                    if (p < 1) requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }, { threshold: 0.5, once: true }).observe(item);
        });
    }

    /* ══════════════════════════════════════════════════════════
       23. CTA SECTION
       Ambient border beam + gentle float animation.
    ══════════════════════════════════════════════════════════ */
    function initCTASection() {
        const section = [...document.querySelectorAll('section')].find(
            s => s.querySelector('h2')?.textContent.includes('Level Up')
        );
        if (!section) return;

        const box = section.querySelector('.rounded-3xl');
        if (!box) return;

        if (!prefersReducedMotion) box.style.animation = 'cta-float 7s ease-in-out infinite';

        if (!isHoverDevice || prefersReducedMotion) return;

        const beam = document.createElement('div');
        beam.className = 'feature-beam';
        beam.style.opacity = '0';
        box.appendChild(beam);

        let raf = null, progress = 0, visible = false;

        function tick() {
            if (!visible) { raf = null; beam.style.opacity = '0'; return; }
            progress = (progress + 0.0018) % 1;
            const w = box.offsetWidth, h = box.offsetHeight, P = 2 * (w + h);
            const d = progress * P;
            let x, y;
            if      (d <= w)         { x = d;           y = 0; }
            else if (d <= w + h)     { x = w;           y = d - w; }
            else if (d <= 2 * w + h) { x = 2*w + h - d; y = h; }
            else                     { x = 0;           y = P - d; }
            beam.style.left    = x + 'px';
            beam.style.top     = y + 'px';
            beam.style.opacity = '0.65';
            raf = requestAnimationFrame(tick);
        }

        new IntersectionObserver(entries => {
            visible = entries[0].isIntersecting;
            if (visible && !raf) raf = requestAnimationFrame(tick);
        }, { threshold: 0.3 }).observe(section);
    }

    /* ══════════════════════════════════════════════════════════
       24. TESTIMONIALS SECTION
       Pause-on-hover per column + card glow via delegation.
    ══════════════════════════════════════════════════════════ */
    function initTestimonialsSection() {
        // Pause the scrolling column when hovering it
        document.querySelectorAll('.testimonial-col-1, .testimonial-col-2, .testimonial-col-3').forEach(col => {
            const track = col.querySelector('.testimonial-track');
            if (!track) return;
            col.addEventListener('mouseenter', () =>
                track.getAnimations?.().forEach(a => a.pause())
            );
            col.addEventListener('mouseleave', () =>
                track.getAnimations?.().forEach(a => a.play())
            );
        });

        if (!isHoverDevice) return;

        // Card glow on hover (cards are dynamic, use delegation)
        const section = document.getElementById('testimonials');
        if (!section) return;

        section.addEventListener('mouseover', e => {
            const card = e.target.closest('.rounded-3xl');
            if (!card || !section.contains(card)) return;
            card.style.setProperty('box-shadow',
                '0 25px 50px -12px rgba(0,0,0,0.12), 0 0 0 1px rgba(220,38,38,0.12)', 'important'
            );
        });
        section.addEventListener('mouseout', e => {
            const card = e.target.closest('.rounded-3xl');
            if (!card || !section.contains(card)) return;
            card.style.removeProperty('box-shadow');
        });
    }

    /* ── Boot ────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        initCustomCursor();
        initCursorTrail();
        initCursorSpotlight();
        initScrollProgress();
        initScrollReveal();
        initCardTilt();
        initCardShimmer();
        initMagneticButtons();
        initNavPill();
        initHeroTyping();
        initHeroParallax();
        initHeaderScroll();
        initActiveNav();
        initRippleEffect();
        initGlitchHeadings();
        initTextScramble();
        initFeatureEnhancements();
        initModelsSection();
        initHowItWorksSection();
        initPricingSection();
        initCTASection();
        initTestimonialsSection();
        initPillFeedback();
        initPricingScroll();
    });

})();
