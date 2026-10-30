import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: `${import.meta.dirname}/../viewer`,
  plugins: [react()],
  // cors: false, so only the viewer's own page can read what the server answers (by default other localhost pages can)
  server: { host: "127.0.0.1", port: 4620, cors: false },
});
