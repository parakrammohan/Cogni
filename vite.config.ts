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
        name: "Cogni",
        short_name: "Cogni",
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
        globPatterns: ["**/*.{js,css,html,svg,json}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
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
  // onnxruntime-web is gone: inference now happens server-side. See
  // backend/app/ml for the ONNX runtime used by the FastAPI service.
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Pre-transform the main source files when the dev server starts so the
    // browser's first wave of import requests hits a warm cache. Cuts
    // cold first-page-load from "many seconds" to roughly the production
    // load time on a typical laptop.
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/views/PatientView.tsx",
        "./src/views/CaregiverView.tsx",
        "./src/views/patient/HomeScene.tsx",
        "./src/views/patient/EyeScene.tsx",
        "./src/components/layout/AppShell.tsx",
        "./src/components/layout/Sidebar.tsx",
        "./src/components/layout/TopBar.tsx",
        "./src/components/layout/BottomNav.tsx",
      ],
    },
  },
  optimizeDeps: {
    // Pre-bundle these on dev-server start with esbuild instead of letting
    // them get lazy-bundled when the browser first hits them. Without this,
    // first cold load on dev triggers a long pause while Vite discovers
    // and bundles each heavy dep.
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "framer-motion",
      "lucide-react",
      "sonner",
      "@radix-ui/react-dialog",
      "@radix-ui/react-slider",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
    ],
    // Heavy lazy-loaded deps stay out of the initial pre-bundle so dev
    // server boot isn't penalized by code that only runs on opt-in scenes
    // (screening, gaze tracking). NOTE: leaflet / react-leaflet are NOT
    // excluded — leaflet's published distribution is CJS, and excluding it
    // makes Vite serve it as native ESM. react-leaflet then can't find
    // named exports like `DomUtil` and dies with a module-load error.
    // Letting Vite pre-bundle them (the default behaviour) costs ~50 ms
    // of dev-server boot but keeps imports working.
    exclude: [
      "@mediapipe/tasks-vision",
    ],
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@mediapipe/tasks-vision")) return "vision-runtime";
          if (id.includes("react-leaflet") || id.includes("/leaflet/")) return "map-runtime";
          return undefined;
        },
      },
    },
  },
});
