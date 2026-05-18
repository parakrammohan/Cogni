import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import { QueryClientProvider } from "@tanstack/react-query";

import App from "./App";
import { queryClient } from "./api/queryClient";
import { AccountMenu } from "./auth/AccountMenu";
import { AuthGate } from "./auth/AuthGate";
import { AuthProvider } from "./auth/AuthContext";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find root element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <AccountMenu />
          <App />
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
