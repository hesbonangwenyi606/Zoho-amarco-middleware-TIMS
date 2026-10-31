import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ command, mode }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    react(),
    {
      name: "local-api-token",
      resolveId(id) {
        if (id === "virtual:local-api-token") return "\0virtual:local-api-token";
      },
      load(id) {
        if (id !== "\0virtual:local-api-token") return;
        const env =
          command === "serve" && mode === "development"
            ? loadEnv(
                mode,
                fileURLToPath(new URL("..", import.meta.url)),
                "INVOICE_API_BEARER_TOKEN",
              )
            : {};
        return `export default ${JSON.stringify(env.INVOICE_API_BEARER_TOKEN ?? "")};`;
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/health": "http://127.0.0.1:3001",
      "/integrations": "http://127.0.0.1:3001",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
