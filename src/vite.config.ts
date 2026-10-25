import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: `${import.meta.dirname}/../viewer`,
  plugins: [react()],
  server: { host: "127.0.0.1", port: 4620 },
});
