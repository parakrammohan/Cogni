# Care features

Caregiver-managed data that surfaces in the patient view. All persisted to `localStorage` under stable keys; a master "Reset all local data" button in Parameters wipes them all and re-seeds defaults.

## Data shapes

Defined in `src/features/care/types.ts`.

### `PatientProfile`
```ts
{
  name: string;
  preferredName: string;
  birthDate: string;       // ISO date (YYYY-MM-DD), or empty
  bloodType: string;
  allergies: string;
  medicalNotes: string;
  homeAddress: string;
  photo: string;           // data URL or remote URL; empty = initials avatar
}
```

Surfaced in:
- Patient **Profile** scene (read-only, with hero header + emergency CTA)
- Patient **Home** scene (hero greeting uses `preferredName`, photo button)
- Caregiver **Overview** scene (header card)
- Caregiver **Manage** scene (full editor with photo upload via FileReader → data URL)

### `CareContact`
```ts
{
  id: string;
  name: string;
  relationship: string;    // "Daughter", "Son", "Family doctor", etc.
  phone: string;           // free-form; we strip whitespace before tel: links
  isEmergency: boolean;    // bumps to top of list with red treatment
  photo: string;
}
```

Surfaced in:
- Patient **People** scene (emergency contacts at top with red surface; family/team in a 3-up grid; tap-to-call + tap-to-message)
- Patient **Home** (top 3 non-emergency contacts as quick-call buttons)
- Patient **Profile** (emergency-call CTA references the first emergency contact)
- Caregiver **Manage** (add / remove / edit / mark emergency)

### `CareReminder`
```ts
{
  id: string;
  label: string;           // "Morning medication", "Short walk"
  time: string;            // "HH:MM" 24h
  recurring: boolean;      // currently always true; reserved for future one-off support
  notes: string;           // dosage, instructions
  completedAt: number | null;  // timestamp when patient marked done
}
```

Surfaced in:
- Patient **Home** scene (sorted by time, tap to toggle complete)
- Patient bell drawer (`PatientNotificationsDialog`) — upcoming/overdue + done today
- Caregiver **Manage** (full editor)

The completion semantic is intentionally simple: any non-null `completedAt` means done. There's no auto-clear at midnight today — the caregiver's reset button or a future scheduled job would handle that. The patient can untoggle by tapping again.

### `CareMemory`
```ts
{
  id: string;
  caption: string;
  photo: string;           // data URL or remote URL
  context: string;         // "March 2024", "My 70th birthday"
}
```

Surfaced in:
- Patient **Memories** scene (3-up gallery; falls back to a deterministic gradient + image-icon when no photo set)
- Caregiver **Manage** (add / edit caption + context / photo upload)

## Patient bell vs caregiver bell — different semantics

The bell icon in the topbar means different things in each view:

- **Caregiver bell** → opens the **Alerts** scene with the persistent anomaly feed (geofence, dwelling, fall, vision risk, cognitive decline).
- **Patient bell** → opens `PatientNotificationsDialog`. **No clinical anomalies.** It shows:
  - Reminders due now or in the next 30 minutes
  - Reminders that recently went overdue
  - Reminders completed today
  - Recent memory-game wins (last 5 final sessions)

The bell badge count comes from `countPatientNotifications()` (upcoming/overdue reminders that aren't done) on the patient side, and `alerts.length` on the caregiver side.

This is deliberate — Alzheimer's patients shouldn't be presented with clinical-sounding anomaly warnings. They should see helpful next-action prompts.

## How edits propagate

`App.tsx` owns four pieces of state: `profile`, `contacts`, `reminders`, `memories`. They're passed:
- Down to `PatientView` for read-only display in patient scenes
- Down to `CaregiverView` along with their setters for the **Manage** editor
- Through `App`'s `handleToggleReminder` callback so the patient can mark reminders done from their Home scene

When the caregiver edits, `usePersistentState` writes the new value to `localStorage` immediately, and the patient view's next render picks it up. No reload needed.

## Why localStorage data URLs for photos

For a hackathon demo, photo uploads via FileReader → data URL → localStorage are the smallest-friction path:
- No backend
- No file-system access
- No upload-failure error states

The trade-off: localStorage has a per-origin quota (typically 5–10 MB). A few large photos can exceed it. `safeWrite` swallows the QuotaExceeded error silently — in a real product you'd warn the user and either compress or move to IndexedDB.

## Defaults

The factory defaults in `features/care/types.ts` are deliberately empty
post-Stage-3 — real data comes from the backend, per patient. The only
baked-in entry is a single "Emergency · Call 995" contact so a freshly
paired patient still has something tap-callable before the caregiver
fills in the people list.

Caregivers populate everything else from the Manage scene; those edits
PUT/POST to `/api/v1/patients/{id}/...` and round-trip through the
TanStack Query cache for instant UI.
