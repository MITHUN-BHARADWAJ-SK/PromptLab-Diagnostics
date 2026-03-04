# Vertical Diagnostic Dashboard Integration Plan

## Goal Description
The objective is to overhaul the Analyzer interface (index.html) with the provided modern, dark aesthetic ("Vertical Diagnostic Dashboard") using Tailwind CSS. We will preserve the current Single-Page Application (SPA) architecture (Analyzer, Generator, Dashboard) while completely transforming the Analyzer's visuals and dynamic result rendering in `app.js`.

## Proposed Changes

### 1. `public/index.html`
- **Head & Styling**: 
  - Add the Tailwind script and custom configuration (fonts, colors: `primary`, `background-dark`, `surface`, etc.) from the provided HTML.
  - Add the custom `<style>` block (`.glow-red`, `.radar-grid`, etc.).
- **Header**: 
  - Redesign the global navigation bar with the new "biotech" icon and "PROMPTLAB" typography.
  - Re-attach `onclick="switchView(...)"` to the navigation links.
  - Add the Dark/Light mode toggle (for aesthetic completeness) and "UPGRADE PRO" button.
- **Analyzer View (`#view-analyzer`)**:
  - Update the Hero section (heading with "text-glow italic").
  - Update the input section (`.bg-surface`, `.glow-red` container).
  - Bind existing IDs (`analyzerPrompt`, `analyzerModel`, `analyzerExample`, `analyzeBtn`) to the new Tailwind form inputs.
  - Maintain the empty `<div class="results-panel" id="analyzerResults"></div>` for dynamic injection.

### 2. `public/js/app.js`
- **`renderAnalysisResults` Refactoring**: 
  - Completely rewrite this function to output the new Tailwind-based constituent sections instead of the old vanilla CSS cards.
  - **Score Banner**: Implement the new SVG ring SVG and the large text block ("We detected your intent as...").
  - **Metric Pentagon Diagnostic**: Render the custom SVG Radar Chart dynamically based on the 5 dimension scores (`clarity`, `constraint_completeness`, `model_alignment`, `ambiguity_risk`, `output_controllability`). Calculate the polygon coordinates using trigonometry based on the 0-5 scores!
  - **Optimization Checklist**: Render the 6-grid layout with dynamic red/emerald colors based on `item.passed`.
  - **Prompt Blueprint**: Render the dark badge grids for Required and Recommended elements. Identify them dynamically from the engine output.
  - **Optimized Structure**: Render the new `bg-primary/5` block with the multi-colored "System"/"User" text and copy button.
  - **Tips**: Render the two-column grid at the bottom using the new layout.

### 3. Global CSS Adjustments
- Because the existing `index.css` applies bare element styles (like `body`, `h1`), we may need to scope some existing CSS tightly to the Generator and Dashboard views temporarily, ensuring they don't break under Tailwind's reset, or migrate them to Tailwind alongside the Analyzer.

## Verification Plan
1. Launch the local web server.
2. Sign in and use the Analyzer with a sample planning prompt.
3. Verify that the UI matches the provided "Vertical Diagnostic Dashboard" perfectly, while dynamically rendering correct data, scores, radar bounds, and text.
