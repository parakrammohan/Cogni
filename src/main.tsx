import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import { QueryClientProvider } from "@tanstack/react-query";

import App from "./App";
import { queryClient } from "./api/queryClient";
import { AuthGate } from "./auth/AuthGate";
import { AuthProvider } from "./auth/AuthContext";
import { installChunkRecovery } from "./lib/chunk-recovery";
import { LiveStreamProvider } from "./ws/useLiveStream";
import "./index.css";

installChunkRecovery();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find root element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <LiveStreamProvider>
            <App />
          </LiveStreamProvider>
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
