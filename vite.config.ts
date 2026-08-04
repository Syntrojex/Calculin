import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Plain client-side SPA build — no SSR, no server runtime required.
// Builds to a static dist/ folder that can be deployed on Netlify,
// Vercel, GitHub Pages, Cloudflare Pages, or any static host.
export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    viteReact(),
    tailwindcss(),
  ],
  build: {
    outDir: "dist",
    // three.js and mathjs are inherently large, but both are only pulled in
    // via the lazy-loaded tab components that need them (Graph3D, ImplicitSurface3D,
    // math-solver), so they never sit in the initial page load. Raising this just
    // quiets the cosmetic warning for those already-async chunks.
    chunkSizeWarningLimit: 600,
  },
});
