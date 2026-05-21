# Care features

Caregiver-managed data that surfaces in the patient view. Everything is **persisted server-side in Postgres** through TanStack Query hooks (`src/api/{profile,contacts,reminders,memories}.ts`); a localStorage persister caches reads so reloads paint instantly. Both the patient and the paired caregiver can edit (subject to the caregiver-controlled lock — see "Profile editing flow" below). The `Reset all local data` button in Parameters only wipes the cached copy; it doesn't touch the server.

PII columns (`profiles.full_name`, `preferred_name`, `allergies`, `medical_notes`, `home_address`; `contacts.name`, `phone`) are Fernet-encrypted at rest via Alembic `0007` — see [`security.md`](./security.md). The encryption is transparent to the API surface; the frontend sees plain strings.

## Data shapes

Defined in `src/features/care/types.ts`. UI types use camelCase; backend stores snake_case; `src/hooks/useBackendProfile.ts` translates between them.

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
  caregiverLocked: boolean; // when true, patient cannot self-edit
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

The custom **ReminderTimePicker** (in `ManageScene.tsx`) replaces the OS-default `<input type="time">` with two `<select>`s (hour + minute) plus an AM/PM toggle and preset chips (Morning, Noon, Afternoon, Evening, Night). Avoids the inconsistent native time picker UX across browsers.

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

## Profile editing flow

Both patient and caregiver edit the same row. The UI uses an explicit "Edit details" → draft → "Save changes" pattern (not auto-save-per-keystroke) — that pattern caused a real bug where in-flight server responses would clobber the user's in-progress typing.

- **Patient ProfileScene**: read-only by default, "Edit details" button opens an editor with local draft state, "Save" PUTs to `/api/v1/patients/{id}/profile`. When `caregiverLocked=true`, the Edit button is replaced with a Locked badge + an amber explanation banner.
- **Caregiver Manage → Patient profile**: same explicit-edit pattern. Photo upload + the caregiver-lock toggle bypass the draft and PUT immediately (single-click affordances, no text to lose).
- **Caregiver lock**: `profiles.caregiver_locked` boolean (Alembic `0006`). Toggling it from Manage is an immediate action. The backend route enforces the lock — `PUT /patients/<id>/profile` returns 403 if the row is locked and the caller is the patient. The patient can never toggle the flag themselves (server strips `caregiver_locked` from any payload submitted by the patient role).

## How edits propagate

`App.tsx` owns the four resource hooks: `useBackendProfile`, `useContacts`, `useReminders`, `useMemories`. Each is a thin wrapper around a TanStack Query + mutation pair. When either side edits and saves, the mutation PUTs/POSTs to the server, the response invalidates the query cache, the WS feed doesn't carry profile data (it carries live sensor state only), and the next focus on the other device fetches the fresh row.

## Photo uploads

Photos are uploaded as base64 data URLs in the profile/contact payload. For a hackathon demo this avoids the complexity of a file-bucket — the JPEG bytes ride through Postgres as text. Trade-off: row size. Acceptable until the Aiven free-tier 1 GB cap becomes a concern; the documented follow-up is to move photos to an external bucket (HF static files or Cloudflare R2).

## Defaults

The factory defaults in `features/care/types.ts` are deliberately empty
post-Stage-3 — real data comes from the backend, per patient. The only
baked-in entry is a single "Emergency · Call 995" contact so a freshly
paired patient still has something tap-callable before the caregiver
fills in the people list.

Caregivers populate everything else from the Manage scene; those edits
PUT/POST to `/api/v1/patients/{id}/...` and round-trip through the
TanStack Query cache for instant UI.
