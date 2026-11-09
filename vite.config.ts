import { defineConfig } from "vite";

// Isolate from the parent repo's PostCSS/Tailwind config.
export default defineConfig({ css: { postcss: {} } });
