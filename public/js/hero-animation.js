document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('animated-word-container');
    if (!container) return;

    const words = [
        "<span class='text-primary'>NOT A TRICK</span>",
        "LIKE A PRO",
        "OPTIMIZATION",
        "ANTI-PATTERNS",
        "BLUEPRINTS"
    ];

    // Create spans for each word
    words.forEach((wordHTML, index) => {
        const span = document.createElement('span');
        span.className = 'animated-word';
        if (index === 0) {
            span.classList.add('active'); // First word active by default
        } else {
            span.classList.add('exit'); // Other words start at bottom
        }
        span.innerHTML = wordHTML;
        container.appendChild(span);
    });

    const wordElements = container.querySelectorAll('.animated-word');
    let currentIndex = 0;

    if (wordElements.length > 0) {
        setInterval(() => {
            const currentElement = wordElements[currentIndex];

            // Move current element to TOP (remove active)
            currentElement.classList.remove('active');
            // By default, removing active makes it go to translate(-50%, -100%)

            currentIndex = (currentIndex + 1) % words.length;
            const nextElement = wordElements[currentIndex];

            // The next element is currently at TOP (-100%). We need it to jump to BOTTOM (exit) without animating.
            nextElement.style.transition = 'none';
            nextElement.classList.add('exit');

            // Force reflow
            void nextElement.offsetWidth;

            // Animate to active (0%)
            nextElement.style.transition = '';
            nextElement.classList.remove('exit');
            nextElement.classList.add('active');

        }, 3000);
    }
});
