// Builds the viewer as a library other apps import: viewer/dist/index.js and viewer/dist/style.css. The libraries it
// draws with, @git-diff-view with this repo's patch among them, are bundled in, so an app that imports it never
// installs or patches them. React is left to the app, which must have one copy of it, and so is use-sync-external-store:
// it is CommonJS that requires React, which a bundle that leaves React out can't do in a browser.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index", cssFileName: "style" },
    rolldownOptions: { external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client", /^use-sync-external-store\//] },
  },
});
