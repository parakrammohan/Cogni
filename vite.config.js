import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("@tensorflow") ||
            id.includes("face-landmarks-detection") ||
            id.includes("tfjs")
          ) {
            return "vision-runtime";
          }
        },
      },
    },
  },
});
