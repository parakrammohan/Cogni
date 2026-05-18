/**
 * WebSocket client for the live patient-state channel.
 *
 *   useLiveConnection()       — opens the WS, reconnects on drop, exposes status
 *   useLiveStream(patientId)  — latest server-pushed snapshot for one patient
 *   useLiveStreamSender(fn)   — 1Hz publisher of patient-side snapshots
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { apiBase } from "../api/client";
import { useAuth } from "../auth/AuthContext";

const PATIENT_PUSH_HZ = 1; // hard cap (matches docs/CLAUDE.md)
const PUSH_PERIOD_MS = Math.floor(1000 / PATIENT_PUSH_HZ);

export type ConnectionStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface PatientStateMessage {
  type: "patient_state";
  patient_id: string;
  data: Record<string, unknown>;
  ts?: string | number | null;
}

interface InboundEnvelope {
  type: string;
  [k: string]: unknown;
}

type Listener = (msg: InboundEnvelope) => void;

interface LiveContextValue {
  status: ConnectionStatus;
  send: (msg: object) => void;
  on: (listener: Listener) => () => void;
}

const LiveContext = createContext<LiveContextValue | null>(null);

// Vercel rewrites our HTTP /api/* to the HF Space so cookies stay
// first-party, but Vercel doesn't proxy WebSockets — the WS upgrade
// has to go straight at the HF backend. In normal browsers the
// cross-origin WS still gets the session cookie via SameSite=None +
// Secure. In strict third-party-cookie modes (e.g. Chrome incognito
// with the new defaults) the WS auth will fail; the rest of the app
// continues to work since REST is proxied first-party.
const WS_FALLBACK = "wss://cogni-team-cogni.hf.space";

function wsUrl(): string {
  // VITE_WS_BASE_URL (and the apiBase fallback) are only honoured in
  // development. Production builds always point at the known HF
  // hostname so the WS works regardless of any env vars left set on
  // the Vercel project.
  if (!import.meta.env.DEV) return `${WS_FALLBACK}/api/v1/ws`;
  const override = (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.replace(/\/$/, "");
  const candidate = override ?? (apiBase && !apiBase.startsWith("/") ? apiBase : "");
  if (!candidate) return `${WS_FALLBACK}/api/v1/ws`;
  const base = candidate.startsWith("https://")
    ? "wss://" + candidate.slice("https://".length)
    : candidate.startsWith("http://")
      ? "ws://" + candidate.slice("http://".length)
      : candidate;
  return `${base}/api/v1/ws`;
}

/** Provider that owns the single shared WS connection per app session. */
export function LiveStreamProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const backoffRef = useRef(1000);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      wsRef.current?.close();
      wsRef.current = null;
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let retryHandle: number | null = null;

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        backoffRef.current = 1000;
        setStatus("open");
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as InboundEnvelope;
          listenersRef.current.forEach((fn) => fn(msg));
        } catch {
          /* not JSON — ignore */
        }
      };
      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        wsRef.current = null;
        setStatus("closed");
        if (cancelled) return;
        const delay = Math.min(backoffRef.current, 30_000);
        backoffRef.current = Math.min(backoffRef.current * 2, 30_000);
        retryHandle = window.setTimeout(connect, delay + Math.random() * 250);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retryHandle !== null) window.clearTimeout(retryHandle);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [authStatus]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const on = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const value = useMemo<LiveContextValue>(() => ({ status, send, on }), [status, send, on]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

function useLiveContext(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive* must be used inside <LiveStreamProvider>");
  return ctx;
}

export function useLiveConnectionStatus(): ConnectionStatus {
  return useLiveContext().status;
}

/** Caregiver-side: returns the most recent `patient_state` for the
 *  given patient_id, or null until one arrives. */
export function useLiveStream(patientId: string | null): PatientStateMessage | null {
  const { on } = useLiveContext();
  const [snapshot, setSnapshot] = useState<PatientStateMessage | null>(null);

  useEffect(() => {
    if (!patientId) {
      setSnapshot(null);
      return;
    }
    return on((msg) => {
      if (msg.type !== "patient_state") return;
      const cast = msg as unknown as PatientStateMessage;
      if (cast.patient_id !== patientId) return;
      setSnapshot(cast);
    });
  }, [on, patientId]);

  return snapshot;
}

/** Patient-side: invokes `getSnapshot()` at most once per second and
 *  publishes the result. Safe no-op when the WS isn't open. */
export function useLiveStreamSender(
  getSnapshot: () => Record<string, unknown> | null,
  enabled: boolean = true,
): void {
  const { send, status } = useLiveContext();
  const getSnapshotRef = useRef(getSnapshot);
  useEffect(() => {
    getSnapshotRef.current = getSnapshot;
  }, [getSnapshot]);

  useEffect(() => {
    if (!enabled || status !== "open") return;
    const handle = window.setInterval(() => {
      const data = getSnapshotRef.current();
      if (!data) return;
      send({ type: "patient_state", data, ts: new Date().toISOString() });
    }, PUSH_PERIOD_MS);
    return () => window.clearInterval(handle);
  }, [enabled, status, send]);
}
