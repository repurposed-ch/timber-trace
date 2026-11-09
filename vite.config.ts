import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/timber-trace/",
  plugins: [react()],
  // Isolate from the parent repo's PostCSS/Tailwind config.
  css: { postcss: {} },
});
