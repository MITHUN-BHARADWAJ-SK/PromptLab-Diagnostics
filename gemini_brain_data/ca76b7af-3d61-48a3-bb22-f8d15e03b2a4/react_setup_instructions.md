# React + Shadcn UI Setup Guide

Your project currently uses vanilla HTML, CSS, and Express. If you choose to migrate to React/Next.js to natively utilize Shadcn UI components (like the `RainbowButton` you shared), follow these instructions to set up a brand new foundation.

### Step 1: Initialize a Next.js Project
Shadcn strongly recommends using a framework like Next.js for a robust setup. Run the following command in your terminal:
```bash
npx create-next-app@latest
```
*   **TypeScript**: Choose `Yes` to strongly type your components and satisfy your `tsx` files.
*   **Tailwind CSS**: Choose `Yes` to natively support your utility classes.
*   **src/ directory**: Choose `Yes`.
*   **App Router**: Choose `Yes` (recommended for modern React).

### Step 2: Initialize Shadcn UI CLI
Once your Next.js project is configured, run the Shadcn CLI tool inside the project root:
```bash
npx shadcn@latest init
```

*   **Style**: Choose `New York` (or `Default`).
*   **Base color**: Choose `Slate`.
*   **CSS variables**: Choose `yes`.

### Step 3: Why `/components/ui`?
The Shadcn initialization process automatically creates a `components/ui` folder. This specific path is important because **Shadcn components represent base-level UI building blocks** that you "own" rather than importing them opaquely from an npm module. The framework uses this directory as a centralized library of base elements (buttons, inputs, dialogs) that you are free to customize, distinct from feature-level components.

### Step 4: Add the Rainbow Button
Now you can safely copy your target component into the project:

1. Create `components/ui/rainbow-button.tsx`.
2. Paste your provided TypeScript source code.
3. You will need to install the utility helper library the button depends on, specifically `clsx` and `tailwind-merge` (which are bundled via Shadcn's init process into `lib/utils`):
   ```bash
   npm install clsx tailwind-merge
   ```

### Step 5: Update Configuration
As detailed in your prompt, paste the `animation` and `keyframes` into your `tailwind.config.ts`, and paste the CSS root variables into `globals.css` (or `app/globals.css`).

Your React environment will now be fully equipped to parse, mount, and animate Shadcn components cleanly!
