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

import { api, apiBase } from "../api/client";
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
  /** True when the server has told us another patient device has
   *  taken over the primary writer slot. Auto-reconnect is suppressed
   *  in this state; call `reclaim()` to take primacy back. Always
   *  false for caregivers (multiple caregiver tabs are fine). */
  displaced: boolean;
  /** Clear the displaced flag and force a fresh WebSocket connection,
   *  which the server will treat as a new primary claim. */
  reclaim: () => void;
}

const LiveContext = createContext<LiveContextValue | null>(null);

/** WebSocket close code we send when the patient is displaced by a
 *  newer device. Application-defined (4000-4999 per RFC 6455). */
const DISPLACED_CLOSE_CODE = 4001;

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
  const [displaced, setDisplaced] = useState(false);
  // Generation counter: bumped by `reclaim()` to force the connect
  // effect to tear down + restart even when authStatus is unchanged.
  const [generation, setGeneration] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const backoffRef = useRef(1000);
  // Mirrors `displaced` for use inside event handlers without
  // re-binding the effect every state change.
  const displacedRef = useRef(false);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      wsRef.current?.close();
      wsRef.current = null;
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let retryHandle: number | null = null;

    const connect = async () => {
      if (cancelled) return;
      setStatus("connecting");
      // Fetch a single-use ticket over the REST proxy first — the session
      // cookie rides first-party there. The WS upgrade itself goes
      // cross-origin to HF Space where the cookie ISN'T set, so we pass
      // the ticket as a query param to authenticate the handshake.
      let url: string;
      try {
        const { ticket } = await api<{ ticket: string; expires_in: number }>(
          "/api/v1/auth/ws-ticket",
          { method: "POST" },
        );
        url = `${wsUrl()}?ticket=${encodeURIComponent(ticket)}`;
      } catch {
        if (cancelled) return;
        // REST failed (offline, auth lapsed, server down). Treat like a
        // dropped connection and let the exponential backoff retry.
        setStatus("error");
        const delay = Math.min(backoffRef.current, 30_000);
        backoffRef.current = Math.min(backoffRef.current * 2, 30_000);
        retryHandle = window.setTimeout(() => void connect(), delay + Math.random() * 250);
        return;
      }
      if (cancelled) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        backoffRef.current = 1000;
        setStatus("open");
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as InboundEnvelope;
          // Server sends `{type: "displaced"}` just before closing
          // with code 4001 when a newer patient device claims primary.
          // Set the flag synchronously so we don't accidentally
          // auto-reconnect in onclose.
          if (msg.type === "displaced") {
            displacedRef.current = true;
            setDisplaced(true);
          }
          listenersRef.current.forEach((fn) => fn(msg));
        } catch {
          /* not JSON — ignore */
        }
      };
      ws.onerror = () => setStatus("error");
      ws.onclose = (event: CloseEvent) => {
        wsRef.current = null;
        setStatus("closed");
        if (cancelled) return;
        // A 4001 close means we were displaced — don't try to
        // reconnect automatically; the UI surfaces a "use this device
        // instead" button that calls `reclaim()`.
        if (event.code === DISPLACED_CLOSE_CODE || displacedRef.current) {
          displacedRef.current = true;
          setDisplaced(true);
          return;
        }
        const delay = Math.min(backoffRef.current, 30_000);
        backoffRef.current = Math.min(backoffRef.current * 2, 30_000);
        retryHandle = window.setTimeout(() => void connect(), delay + Math.random() * 250);
      };
    };

    void connect();
    return () => {
      cancelled = true;
      if (retryHandle !== null) window.clearTimeout(retryHandle);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // generation is included so reclaim() can force a fresh attempt
    // even when authStatus is steady.
  }, [authStatus, generation]);

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

  const reclaim = useCallback(() => {
    displacedRef.current = false;
    setDisplaced(false);
    backoffRef.current = 1000;
    setGeneration((g) => g + 1);
  }, []);

  const value = useMemo<LiveContextValue>(
    () => ({ status, send, on, displaced, reclaim }),
    [status, send, on, displaced, reclaim],
  );
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

/**
 * Returns `{ unhealthy }` — true when the live channel has been
 * non-`open` for ≥ `gracePeriodMs` while the user is signed in.
 *
 * The use case: in strict-third-party-cookie browsers (Chrome incognito
 * with new defaults, Safari ITP, Brave) the WS upgrade can't carry the
 * session cookie, so the handshake quietly fails and the reconnect
 * loop runs forever. Before this hook the caregiver dashboard just sat
 * with stale "patient online" indicators and no UI feedback. With it,
 * the caller can render a banner once the channel has been down long
 * enough to be more than a transient blip.
 */
export function useLiveStreamHealth(gracePeriodMs = 15_000): {
  unhealthy: boolean;
  status: ConnectionStatus;
} {
  const { status } = useLiveContext();
  const { status: authStatus } = useAuth();
  const [unhealthy, setUnhealthy] = useState(false);

  useEffect(() => {
    if (authStatus !== "authenticated" || status === "open") {
      setUnhealthy(false);
      return;
    }
    // Status is idle / connecting / closed / error and we're signed in.
    // Wait the grace period before flipping the banner on, so a 1-2 s
    // reconnect doesn't flash a scary message.
    const t = window.setTimeout(() => setUnhealthy(true), gracePeriodMs);
    return () => window.clearTimeout(t);
  }, [status, authStatus, gracePeriodMs]);

  return { unhealthy, status };
}

/** Patient-side: true when this device has been displaced by another
 *  one that claimed the primary writer slot. Also returns a `reclaim`
 *  action that re-establishes the WS and re-claims primacy on this
 *  device (which will in turn displace the other). */
export function useDisplacedState(): { displaced: boolean; reclaim: () => void } {
  const { displaced, reclaim } = useLiveContext();
  return { displaced, reclaim };
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
