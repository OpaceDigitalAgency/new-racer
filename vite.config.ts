import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => ({
  plugins: [
    mode === "analyze"
      ? (visualizer({
          filename: "dist/bundle-stats.html",
          gzipSize: true,
          brotliSize: true
        }) as any)
      : undefined
  ].filter(Boolean),
  optimizeDeps: {
    // Babylon's modular packages include shader chunks and side-effect components that can confuse Vite's dep optimizer.
    // Excluding them keeps dev mode stable (no missing optimized deps files).
    exclude: ["@babylonjs/core", "@babylonjs/gui", "@babylonjs/loaders", "cannon-es"]
  },
  build: {
    target: "es2020",
    sourcemap: false
  }
}));
