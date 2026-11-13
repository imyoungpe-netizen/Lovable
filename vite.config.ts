import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: projectRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src"),
      "@workspace/api-client-react": path.resolve(projectRoot, "src/shared/api-client-react/index.ts"),
      "@workspace/api-zod": path.resolve(projectRoot, "src/shared/api-zod/index.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: { host: "0.0.0.0", allowedHosts: true },
});
