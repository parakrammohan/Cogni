# Frontend architecture

Cogni's frontend is a single Vite + React 19 + TypeScript SPA, deployed
on Vercel, hitting the FastAPI service at
`https://cogni-team-cogni.hf.space` for everything.

## Top-level shape

```
main.tsx
  └── QueryClientProvider          TanStack Query + localStorage persister
        └── AuthProvider           session cookie status (loading | anonymous | authenticated)
              └── AuthGate         renders <AuthScreen /> when anonymous
                    └── LiveStreamProvider     single WebSocket per session
                          └── App              orchestrates sensors + scenes
                                ├── PatientView (when user.role === "patient")
                                └── CaregiverView (when user.role === "caregiver")
```

`App.tsx` is intentionally one large composition root that owns sensor
hooks (vision, motion, location) and threads their output to the
appropriate view. The view (patient vs caregiver) is **derived from
the auth user's role** — there's no manual toggle.

## Auth (`src/auth/`)

- `AuthContext.tsx` — provider + `useAuth()`. On mount, calls
  `/api/v1/auth/me`; if it returns a user, status = authenticated; on
  401, status = anonymous.
- `AuthScreen.tsx` — combined login/signup form. Quick-fill buttons for
  the two demo accounts.
- `AuthGate.tsx` — gates the entire app shell.
- `api.ts` — typed wrappers over `/auth/{signup,login,logout,me,logout-everywhere}`.
- `types.ts` — `AuthUser`, `Role`, `LoginBody`, `SignupBody`.

There is no token state in JavaScript — the session lives in an
HttpOnly+Secure cookie set by the server. All `fetch` calls go through
`api()` with `credentials: "include"`, so the cookie rides cross-origin.

## API client (`src/api/`)

| File | Purpose |
|---|---|
| `client.ts` | `api<T>(path, opts)` fetch wrapper. Returns parsed JSON, throws `ApiError` on non-2xx. Handles `json`, `body` (for FormData), `credentials: "include"`. |
| `queryClient.ts` | One `QueryClient` instance with a localStorage persister. Write-through cache: cold reloads paint last-known data instantly while re-fetching in the background. `staleTime: 30s`, `gcTime: 7d`, no retry on 401/403. |
| `profile.ts` | `useProfile(patientId)`, `useUpdateProfile(patientId)`. |
| `contacts.ts` | `useContacts`, `useCreateContact`, `usePatchContact`, `useDeleteContact`. |
| `reminders.ts` | `useReminders`, `useCreateReminder`, `usePatchReminder`, `useToggleReminder`, `useDeleteReminder`. |
| `memories.ts` | `useMemories`, `useCreateMemory`, `usePatchMemory`, `useDeleteMemory`. |
| `pairing.ts` | `status`, `createInvite`, `redeem`, `unpair`. Plain functions, no React hooks. |

Pattern: each resource exposes a `<resource>Keys` object with stable
query keys, a `useResource(patientId)` for read, and `use*Mutation()`
hooks for write. Mutations invalidate the relevant list query on
success.

The localStorage persister means: tabs that already had data render
instantly on cold load, even before the API request completes. On a
deploy that changes response shapes, bump the `buster` field in
`queryClient.ts` to invalidate everyone's persisted cache.

## Subject patient (`src/hooks/useSubjectPatient.ts`)

```ts
const { patientId, patientName, isLoading } = useSubjectPatient();
```

- Patient role → returns themselves.
- Caregiver role → returns the first paired patient.

Used by every patient-scoped scene + the screening forms. Multi-patient
selection (caregivers with N patients) is a documented follow-up.

## WebSocket layer (`src/ws/`)

See [`websocket.md`](./websocket.md) for the protocol. `useLiveStream.tsx`
owns:

- `<LiveStreamProvider>` — single WS connection per session.
- `useLiveConnectionStatus()` → `"idle" | "connecting" | "open" | "closed" | "error"`.
- `useLiveStream(patientId)` — caregiver-side, latest snapshot.
- `useLiveStreamSender(getSnapshot, enabled)` — patient-side, 1 Hz.

## Patient view scenes (`src/views/patient/`)

| Scene | What it does |
|---|---|
| Home | Greeting, today's reminders, vision/gait status, big "I'm OK" button |
| Map | Patient's location on Leaflet with safe-zone overlay |
| Eye check | Live MediaPipe face mesh + smooth-pursuit test |
| Games | 6 cognitive games (Simon, Reaction, Bubbles, Matching, Math, Words) + the memory hub |
| People | Contact list (read-only) + tap-to-call |
| Memories | Photo gallery with captions |
| Profile | Care record (DOB, allergies, medical notes, home address) + PairingCard |

## Caregiver view scenes (`src/views/caregiver/`)

| Scene | What it does |
|---|---|
| Overview | Patient online/offline pill (live from WS), four big metric tiles, alerts feed, status board |
| Alerts | Severity-sorted notification list with dismiss |
| Gait | Live SVG waveform + gait label + fall classifier |
| Map | Multi-polygon geofence editor + breadcrumbs + wandering toggle |
| Vision | Live mesh + iris overlay + ocular metrics |
| Cognition | Trend chart against the rolling baseline |
| Screening | Four ML model tabs (backend inference via /api/v1) |
| Profile | Caregiver's own account + PairingCard |
| Manage | Patient's care record editor (profile, contacts, reminders, memories) |

## Layout (`src/components/layout/`)

- `AppShell.tsx` — adaptive shell, hosts both roles. Sidebar on desktop,
  bottom-nav on mobile.
- `Sidebar.tsx` — collapsible left rail. Same items power the mobile
  bottom-nav.
- `TopBar.tsx` — sticky topbar. Title + subtitle + mode badge + bell +
  account-menu dropdown.
- `BottomNav.tsx` — mobile-only tab bar with a "More" overflow sheet.

## State persistence layers

1. **TanStack Query** localStorage persister — server data cache,
   replaces the patchwork of `usePersistentState` calls for resources
   that now live in the backend. Auto-invalidates per mutation.
2. **`usePersistentState`** — local-only legacy state: voice settings,
   game history, sidebar collapsed flag, gaze calibration model,
   safeZone radius. These don't sync across devices because they're
   device-specific tuning, not user data.
3. **Auth cookie** — server-side session token. JavaScript can't read
   it; the browser just sends it on every fetch with
   `credentials: "include"`.

## Build pipeline

- `npm run dev` → Vite dev server on port 5173.
- `npm run build` → `tsc --noEmit && vite build`.
- `npm run preview` → serve the `dist/` build locally.

Vite manualChunks:
- `vision-runtime` — `@mediapipe/tasks-vision` (lazy on Eye Check scene)
- `map-runtime` — Leaflet + react-leaflet (lazy on Map scene)

There is no `onnxruntime-web` chunk — screening inference is server-side.

PWA / Service Worker: `vite-plugin-pwa` produces `dist/sw.js` and
precaches the SPA assets. Stale-chunk recovery (see `src/lib/chunk-recovery.ts`)
catches "Failed to fetch dynamically imported module" — the classic
SPA + new-deploy race — and triggers a one-shot reload.

## Stale-chunk recovery

Vite emits hashed bundle file names. After a deploy, a tab loaded
against the old build references chunks that no longer exist. When the
user navigates and triggers a lazy import, the fetch 404s and React
throws "Failed to fetch dynamically imported module". The installed
global handler catches this and reloads the page once (gated by a
`?_chunk_reload=…` query param so it can't loop).

## Env vars

- `VITE_API_BASE_URL` — backend URL (default fallback:
  `https://cogni-team-cogni.hf.space`). Set on the Vercel project so
  preview builds also point at production.

That's the entire frontend env surface — everything else is in code.
