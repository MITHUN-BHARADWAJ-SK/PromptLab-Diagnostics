# Implementation Plan - Header & Hero Updates

Based on your reference photo and instructions, I will update the header navigation, simplify the animated text cycle, remove the "Initialize Session" button, and implement the "Rainbow Button" effect. 

## Approach to React Component Request
Your prompt included instructions to drop a React component (`rainbow-button.tsx`) into a shadcn/Tailwind project. However, the current `PromptLab` frontend is built with vanilla HTML, CSS, and JS. 

**My Strategy:** 
1. **Seamless Integration**: To avoid breaking your app or forcing a massive architectural rewrite to React, I will port the exact visual logic, gradients, and animations of the "Rainbow Button" into vanilla CSS in `landing.css`. This gives you the exact effect requested, instantly and perfectly integrated.
2. **React Setup Instructions**: As requested, I will also create a separate file `react_setup_instructions.md` containing the step-by-step instructions on how to set up a new React + shadcn + Tailwind project, should you decide to migrate the entire codebase in the future.

## Proposed Changes

### [Frontend - HTML Content]

#### [MODIFY] [landing.html](file:///f:/PROMPTLAB/public/landing.html)
- **Header Navigation**: Update the navigation links in the header to specifically include: `Features`, `Models`, `How It Works`, `Pricing`, `Reviews`, `Sign In`, and `Get Started`.
- **Rainbow Button**: Apply the new rainbow styling class to the "Get Started" button in the top right.
- **Hero Title**: Update the HTML so the text under "LEARN PROMPTING" is fully handled by the animation container (removing the static "AS A SKILL," text).
- **Hero Actions**: Remove the `<div class="hero-actions">` block containing the "Initialize Session" button.

### [Frontend - Logic]

#### [MODIFY] [hero-animation.js](file:///f:/PROMPTLAB/public/js/hero-animation.js)
- Change the `words` array to only contain the two specific phrases:
  1. `"NOT A <span class='text-primary' style='color: var(--accent-primary);'>TRICK</span>"`
  2. `"AS A SKILL"`

### [Frontend - Styling]

#### [MODIFY] [landing.css](file:///f:/PROMPTLAB/public/css/landing.css)
- Implement the `.rainbow-button` CSS class, translating the provided Tailwind classes (gradients, `before:` pseudo-elements, `animate-rainbow` keyframes) directly into standard CSS variables and rules.

## Verification Plan
- I will use the browser subagent to verify that the header contains the correct links and the new animated rainbow button.
- I will verify that the text successfully alternates between "NOT A TRICK" and "AS A SKILL" without any extra words, and that the "Initialize Session" button is gone.
