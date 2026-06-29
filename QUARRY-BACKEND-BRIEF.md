# Project Brief: Quarry — Firestore backend + email-update bot

This brief is written to be ingested by a fresh Claude Code session. It has two phases:
**(1)** give the existing Quarry app a Firebase/Firestore backend with offline support, and
**(2)** build a separate email bot that proposes status updates. Read this whole brief
before writing code. Confirm you understand the constraints, then work phase by phase.

---

## Background: what Quarry is today

Quarry is a single-user job-search tracker styled as a sales pipeline. It is currently a
**static single-file app** with all state in browser `localStorage`. No backend, no
accounts. It deploys as one HTML file to GitHub Pages.

Existing files (the human will provide them):
- `index-cdn.html` — the editable source. React component in a `<script type="text/babel">`
  block, libraries loaded from esm.sh. THIS is the file you edit for app logic.
- `PipelineDashboard.jsx` — the same component as an ES-module React source. Must be kept
  in sync with index-cdn.html (every change ported to both).
- `index.html` — the OFFLINE build (~1.2MB, all libs inlined, JSX precompiled). GENERATED
  from index-cdn.html by `build-offline.js`. Never hand-edit. Regenerate after changes.
- `build-offline.js` — the build script (Node). Reads index-cdn.html, writes index.html.
- `QUARRY-HANDOFF.md` — deep context on conventions, color system, build/test process.
  READ THIS; it documents the sync requirement and the offline build gotchas.

**Hard constraints inherited from the existing project (do not violate):**
- index-cdn.html and PipelineDashboard.jsx must stay byte-for-byte equivalent in logic.
- After any app change, regenerate index.html via build-offline.js and verify it renders
  (there is a headless jsdom test approach documented in QUARRY-HANDOFF.md; polyfill
  ResizeObserver and matchMedia — their absence is a jsdom gap, not a real bug).
- No em dashes in any user-facing copy or docs (the human considers it an AI tell).
- Remove orphaned styles/vars/props when a change makes them dead.
- Keep the app deployable as a static file. The whole point is avoiding a server to operate.

### Current data model
State object: `{ categories: string[], records: Record[] }`, persisted to localStorage
key `quarry-data`. Column order persists separately to `quarry-colorder`.

A Record (exact current shape):
```js
{
  id,                       // string, locally generated
  company, role, category,  // strings
  source,                   // "referral" | "recruiter" | "direct" | "board"
  salaryMin, salaryMax,     // strings (numeric or "")
  location, remote,         // remote: "remote" | "hybrid" | "onsite"
  status,                   // "applied"|"interview"|"offer"|"rejected"|"withdrawn"|"noResponse"
  skills,                   // string[]
  link,                     // string (URL or "")
  appliedDate, responseDate,// "YYYY-MM-DD" or ""
  notes,                    // string
  starred                   // boolean
}
```
Stats/charts are all DERIVED from records at render time. There are no stored aggregates.
Do not introduce stored aggregates.

---

## Decisions already made (do not relitigate)

- **Backend: Firebase / Cloud Firestore.** Chosen for hosted datastore + built-in offline
  persistence + auth, with no server for the human to operate.
- **Multi-tenant: yes, eventually.** "Others may use their own copies." So data must be
  isolated per user. Use **Firebase Auth**; every record is owned by a uid; security rules
  enforce that a user can only read/write their own data.
- **Offline still works.** Quarry must remain usable with no connection. Use Firestore's
  offline persistence (local cache, auto-sync on reconnect) as the primary mechanism.
  localStorage may remain as a secondary/no-auth fallback (see Phase 1, step 5).
- **Static-file deployment stays.** Firebase is reached from the browser via the client SDK;
  there is no app server. GitHub Pages (or any static host) still serves the app.

---

## Phase 1 — Add the Firestore backend

Goal: Quarry reads/writes its records from Firestore, scoped to the signed-in user, while
still working offline. A logged-out user falls back to local-only mode (current behavior).

### Step 1.1 — Schema versioning (do this first, it is the contract)
Wrap the persisted/exported shape in a version envelope so the app, the bot, and any
exported file agree on format:
```js
{ version: 1, categories: [...], records: [...] }
```
- Export writes `{ version: 1, ... }`.
- Import accepts versioned files; if `version` is absent, treat as legacy v0 and migrate
  (current files are just `{ categories, records }`).
- Keep a `migrate(data)` function so future schema changes are centralized.
- Each Record gains two metadata fields going forward: `updatedAt` (ISO timestamp) and
  `source_of_change` (e.g. "user" | "bot"). These are needed by the bot and by merge logic.
  Default them so existing records remain valid.

### Step 1.2 — Firebase project + config
- Use the Firebase **modular v9+ SDK**, imported via esm.sh in index-cdn.html (matches the
  existing CDN approach) and as a normal import in the .jsx.
- Firebase config (apiKey, projectId, etc.) is NOT a secret for client apps — it identifies
  the project, it does not authorize access. Security is enforced by Auth + Firestore rules,
  not by hiding config. So the config can live in the committed file. (Document this clearly
  so the human is not alarmed to see "keys" in a public repo.)
- BUT: lock the Firebase project down — restrict the API key to the deployed domain(s),
  enable only the auth providers you use, and write strict Firestore rules (below).

### Step 1.3 — Auth
- Add Firebase Auth. Start with a single simple provider (Google sign-in is least friction;
  email-link is an alternative). The UI gets a small sign-in / sign-out control in the header.
- Logged-out = local-only mode (records live in localStorage exactly like today; no sync).
- Logged-in = records sync to Firestore under that user.
- On first sign-in with existing local data, offer to upload the local records to the cloud
  (one-time migration). Do not silently discard local data.

### Step 1.4 — Firestore data layout
```
users/{uid}/records/{recordId}   // one doc per application
users/{uid}/meta/profile         // categories list, colOrder, schema version
```
- One document per record (not one big array doc) so the bot can update a single record
  without read-modify-write races, and so Firestore offline/merge works per-record.
- Firestore security rules: a user can read/write only under their own `users/{uid}/**`.
  Provide the rules file. Default-deny everything else.

### Step 1.5 — Wire the app to Firestore with offline
- Enable Firestore offline persistence (IndexedDB-backed local cache).
- Replace the localStorage read/write of records with Firestore reads/writes WHEN signed in;
  keep localStorage path WHEN signed out.
- Use a real-time listener (onSnapshot) so changes from the bot (or another device) appear
  live without a refresh. This is what makes "bot updates my entries" feel automatic.
- The existing derived stats/charts must not change — they still read from the in-memory
  records array; only the source of that array changes (Firestore vs localStorage).

### Step 1.6 — Keep export/import working
- Export still produces a versioned JSON file (now `{ version: 1, ... }`).
- Import still works and, when signed in, writes the imported records to Firestore.
- This keeps the file-based workflow alive as a backup/portability path and as the bridge
  to the bot in case the human wants a no-credentials fallback.

### Phase 1 acceptance
- Signed out: app behaves exactly as today (localStorage), offline fine.
- Signed in: records persist to Firestore, sync across devices, work offline and reconcile
  on reconnect, and a change written directly to Firestore appears live in the open app.
- Security rules verified: user A cannot read user B's records.
- index.html (offline build) regenerated and renders clean in the jsdom check.
- index-cdn.html and PipelineDashboard.jsx in sync.

---

## Phase 2 — The email-update bot (separate codebase)

A standalone script (its own repo/folder, NOT part of the Quarry static app) that reads the
human's Gmail, figures out which application each email is about, classifies what happened,
and updates the corresponding Firestore record — but in **propose-then-commit** mode at
first, not silent auto-write.

### Architecture
```
Gmail (read-only)  ->  fetch new msgs  ->  match to a record  ->  classify intent
                       (Gmail API)         (heuristics + LLM)      (LLM)
                   ->  write proposal  ->  human approves  ->  update Firestore record
```

### Decisions / constraints
- **Mailbox: Gmail.** Use the Gmail API with a **read-only** scope (`gmail.readonly`). The
  bot never sends, deletes, labels, or modifies mail.
- **Runs outside the browser** (the human's machine or a tiny scheduled job). It talks to
  Firestore via the Firebase **Admin SDK** with a service account (server-side credentials,
  kept secret, never in any repo). This is the one place real secrets exist.
- **Writes to the SAME Firestore** the app uses, under the human's uid. Because the app uses
  onSnapshot, approved changes appear live in the open dashboard.
- **Propose-then-commit.** Phase 2a: bot writes a human-readable proposal (a report file or
  a `proposals` collection) and commits nothing to records until approved. Phase 2b (only
  once trusted): optional auto-commit above a confidence threshold.

### The hard part is email -> intent (not the Firestore write)
- **Matching.** For each email, pick one record or "none". Heuristics first (sender domain,
  company name in subject/body, role title). Ambiguous ones go to an LLM with the record
  list: return matching id + confidence 0-1, or null. Below a threshold -> "unmatched, for
  human review", never an auto-change.
- **Classification.** Given a matched email, classify: rejection / interview invite /
  recruiter outreach / offer / info request / noise. Return proposed status + a one-line
  reason quoting the email. LLM-based; regex will not keep up with phrasing variety.
- **Idempotency.** Track processed Gmail message IDs (store them; e.g. a `processed` doc or
  collection). Re-running must not re-propose the same change.
- **Never destructive.** Bot only ever proposes status/responseDate changes. It never
  deletes records or overwrites `notes`. Every proposed change cites the triggering email.
  Set `source_of_change: "bot"` and `updatedAt` on any record it writes.
- **Privacy.** Send the LLM the minimum (sender, subject, snippet), not whole threads. Be
  explicit about which LLM provider sees job-search mail.

### Phase 2 build order
1. Read-only Gmail fetch script: auth, pull recent messages, print sender/subject/snippet.
   Prove mail access before anything else. Use a Gmail `q` filter to narrow (e.g.
   `newer_than:14d -category:promotions`).
2. Matching + classification against a Firestore export (or live read). Iterate here; this
   is the meat. Build a small eval set of real emails to tune confidence thresholds.
3. Proposal output: human-readable report of proposed changes with citations + confidence.
4. Approval -> Firestore write (Admin SDK), idempotent, non-destructive, tagged as bot.

### Phase 2 acceptance
- Bot reads Gmail read-only, never modifies the mailbox.
- For a test batch, produces a proposal that correctly matches + classifies the clear cases
  and flags the ambiguous ones rather than guessing.
- Re-running on the same mail produces no duplicate proposals (idempotent).
- Approved changes land on the right Firestore record, appear live in the open app, and are
  tagged `source_of_change: "bot"` with `updatedAt`.
- Service-account and OAuth credentials are outside any repo.

---

## Security model summary (state this back before building)
- Firebase client config in the static app is public by design; it is not a secret.
- Access is controlled by Firebase Auth + Firestore security rules (per-uid isolation),
  NOT by hiding config.
- The bot's Admin SDK service account and Gmail OAuth token are the ONLY real secrets, live
  only with the bot, never committed.
- Default-deny Firestore rules; users reach only `users/{their-uid}/**`.

## Suggested tech
- App: existing React-in-HTML + Firebase JS SDK v9 modular (esm.sh).
- Bot: Node or Python. Gmail API client, Firebase Admin SDK, one LLM API for match/classify.
- Keep the bot's LLM provider and prompt in one place so it is easy to swap/tune.

## Start here
Begin with Phase 1, Step 1.1 (schema versioning) — it is the contract everything else
depends on and the only change that is purely internal to the existing app. Confirm the
security model back to the human before touching Firebase config. Do not start Phase 2 until
Phase 1 acceptance is met.
