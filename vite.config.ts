import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "CogniTrack",
        short_name: "CogniTrack",
        description:
          "Alzheimer's detection and care prototype with patient and caregiver views.",
        theme_color: "#0e7490",
        background_color: "#f8fbfd",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,onnx,json}"],
        // ONNX model is ~330 KiB; default precache size limit is 2 MiB but
        // raise to be safe in case more models get added.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "jsdelivr-cache",
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/storage\.googleapis\.com\/mediapipe-models\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "mediapipe-models",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "osm-tiles",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts" },
          },
        ],
      },
    }),
  ],
  resolve: {
    // Pick the onnxruntime-web entry that loads wasm externally instead of
    // base64-bundling the 26 MiB binary into our app chunk.
    conditions: ["onnxruntime-web-use-extern-wasm", "import", "module", "default"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@mediapipe/tasks-vision")) return "vision-runtime";
          if (id.includes("react-leaflet") || id.includes("/leaflet/")) return "map-runtime";
          if (id.includes("onnxruntime-web")) return "onnx-runtime";
          return undefined;
        },
      },
    },
  },
});
