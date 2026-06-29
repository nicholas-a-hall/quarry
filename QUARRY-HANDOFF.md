# Quarry: Development Handoff

A job-search tracking app built as a sales pipeline. This doc lets a fresh session
(new Claude instance or any developer) continue work without re-deriving decisions
already made. Read this first, then open the files.

---

## What Quarry is

A single-user job-application tracker that treats the job hunt as a sales pipeline:
applications are leads, categories/sources are segments, statuses are pipeline stages,
and the analytics show where effort converts. Data lives entirely in the user's browser
(localStorage) or in JSON files they export/import. No backend, no accounts, no network
calls in the offline build.

The visual identity is "Quarry", a terraced stone-pit logo with a mineral vein, on a
mid-slate neumorphic theme. The name and look are settled; don't redesign them.

---

## The files (and which is canonical)

There are two real builds plus a (currently STALE) React source. The file GitHub Pages
serves is `index.html`, and that is the OFFLINE build (the one that deploys).

1. **`index-cdn.html`**, THE SOURCE OF TRUTH. This is the file you edit for all app logic.
   It is the CDN build (loads React/Recharts/lucide/Babel from esm.sh at runtime, ~68KB,
   REQUIRES INTERNET) AND the source the offline build is compiled from. When in doubt,
   this file is authoritative. (Earlier named `pipeline.html`.)

2. **`index.html`**, the OFFLINE build, fully self-contained (~1.2MB). All libraries
   inlined, JSX pre-compiled to plain JS, zero network calls. This is what deploys to
   GitHub Pages (Pages serves `index.html` by default). GENERATED from `index-cdn.html` by
   the build step (see "Build process"), never hand-edit it. (Earlier `quarry-offline.html`.)

3. **`PipelineDashboard.jsx`**, a React-module version of the component. **WARNING: this
   file has DRIFTED out of sync with index-cdn.html and is currently STALE.** Over recent
   sessions, features were added to index-cdn.html that were not fully ported to the jsx:
   the Paste-JSON modal (the jsx has no paste button or modal at all), the responsive modal
   classes (mRow2/mRow3/modalOverlay/modalSheet/modalBody/statusBtnRow are referenced in the
   jsx's CSS but NOT applied to its modal elements), and possibly more. Do NOT treat the jsx
   as authoritative. If a real React project is needed, the jsx should be REGENERATED from
   index-cdn.html as a deliberate task (see "Known sharp edges").

### What this means for editing
- For any app change: edit `index-cdn.html`, then regenerate `index.html` with the build
  script, then TEST index.html (see Testing). That is the whole loop that ships.
- The `.jsx` can be left alone unless the human explicitly wants a React-project version,
  in which case reconcile it against index-cdn.html first rather than trusting it.
- index-cdn.html uses esm.sh imports in a `<script type="text/babel">` block; a React
  project would use normal ES-module imports and add a mount + the localStorage/persistence
  wiring that currently lives inline in the HTML.

---

## Core data model

A single state object: `{ categories: string[], records: Record[] }`, persisted to
localStorage key `quarry-data`.

Each **Record** (one application):
```
{
  id, company, role, category, source, salaryMin, salaryMax,
  location, remote, status, skills[], link, appliedDate, responseDate,
  notes, starred
}
```

**Records are the single source of truth.** Every stat, chart, and KPI is DERIVED from
filtering/grouping the records array at render time. There are no stored aggregates.
This was a deliberate architecture choice, earlier versions stored weekly counts and
it was the wrong model. Do not reintroduce stored aggregates.

### Statuses (pipeline stages)
`applied, interview, offer, rejected, withdrawn, noResponse`
- Sentiment mapping: interview/offer = positive; rejected = negative; the rest = neutral.
- `withdrawn` = user pulled out. Counts as a RESPONSE (employer engaged) but is neither
  positive nor negative, and must NOT inflate ghost rate. This distinction is load-bearing.
- `offer` is still selectable, but its dedicated metrics (Close Rate, Offer funnel stage,
  offer-median salary) were intentionally REMOVED, once there's an offer the search is
  over, so those readouts are noise. Offer still counts toward positive/reachedInterview.

### Sources (lead segments)
`referral, recruiter, direct, board`, colors: violet, coral(red), gold(amber), cyan.

### Derived "stale" flag
Not a stored status. A record is stale if `status === "applied"` AND applied more than
`STALE_DAYS` (14) ago. Computed live via `isStale(r)`. Surfaces as a table badge, in the
Total Applied KPI subtitle, and as a tile on the LinkedIn summary card.

---

## Color system (important, there were collisions)

The theme has 6 accent colors but THREE categorical dimensions competing for them
(sources, statuses, metrics). Rules that resolve the conflict:

- **Metric bars** (positive rate / any-response rate) are LOCKED to green + blue. These
  are NOT source or status colors, so a rate bar never reads as a category.
- **Source colors**: violet / coral / gold / cyan.
- **Status colors** overlap with sources (e.g. Offer=gold=Direct) but never appear in the
  same chart, so context disambiguates. This is acceptable and intentional; don't "fix" it
  by adding more colors unless the user asks.

Theme tokens live in the `T` object at the top of each file. Token NAMES (cyan, violet,
amber, etc.) are kept stable even though their hex values were remapped to the slate
palette, this avoids touching hundreds of references. If asked to recolor, remap hex
values in `T`, don't rename tokens.

---

## Layout / section order (top to bottom)

1. Header (brand mark + QUARRY wordmark + action buttons)
2. Priority Targets (COLLAPSIBLE, only shows if any starred), sits ABOVE the table
3. Filter bar (COLLAPSIBLE, COLLAPSED BY DEFAULT), search + Category/Source/Status chips
4. Applications table
5. KPI strip (5 tiles: Total Applied, Response Rate, Interview Rate, Median Response, Ghost Rate)
6. Analytics grid (Conversion by Source, Status Breakdown, Funnel, Salary, Category, Skills, Weekly Trend)
7. LinkedIn summary card (exports as PNG)
8. Edit/Add modal + Paste-JSON modal (rendered last, shown on demand)

Note: Priority Targets has been moved above/below the table more than once at the human's
request. It currently sits ABOVE the table. The filter bar now defaults to COLLAPSED.

### The applications table (most complex part)
- Driven by a `COLUMNS` registry (module-level array). Each column has
  `{ key, label, sortKey, render(r, ctx), tdStyle? }`.
- **Star + Edit pinned far left; Trash pinned far right**, sticky, always visible.
- The 10 data columns between them are DRAGGABLE to reorder (HTML5 drag events) AND
  click-to-sort (where `sortKey` is set). Column order persists to localStorage key
  `quarry-colorder`.
- To add a column: add an entry to `COLUMNS`. The order array auto-heals (unknown keys
  dropped, new keys appended) so existing users' saved orders don't break.
- The table has `min-width: 900` and lives in a `tableWrap` with `overflow-x: auto`, so on
  mobile it scrolls horizontally inside its own container. That horizontal scroll is
  INTENTIONAL, do not try to crush the table to fit a phone.

### The modal(s)
Edit/Add modal: fields ordered by priority, Company/Role (only REQUIRED fields), then
Status (button row, not a dropdown), then Source/Salary, Location, dates, a divider, then
ancillary (Category, link, Skills, Notes). The `valid` check gates save on company+role only.

Paste-JSON modal: opened by the "Paste JSON" header button. A real modal with a multiline
`<textarea>` (replaced an old single-line `prompt()`), Cancel + Import buttons, validates
JSON on import. NOTE: this exists in index-cdn.html only; the jsx does not have it.

### Header action buttons + icons
Log application (Plus, accent), Import (FileUp), Paste JSON (ClipboardPaste), Export JSON
(Save, the floppy-disk icon), PNG (ImageIcon), reset (RotateCcw). Import and Paste used to
share one icon; they are now distinct. Export uses Save (disk), not a download arrow.

### Responsive / mobile
There is a mobile stylesheet at the end of the CSS string (in index-cdn.html, and mirrored
into the jsx CSS). Breakpoints:
- `@media (max-width: 760px)`: the analytics grid (`.analyticsGrid`) collapses from 3
  columns to 1. This was the main cause of page-wide horizontal overflow on phones.
- `@media (max-width: 560px)`: modal rows (`.mRow2`/`.mRow3`) collapse to one column; the
  modal overlay pins to top + stretches full-width (`.modalOverlay`/`.modalSheet`); status
  buttons (`.statusBtnRow .statusBtn`) drop their min-width and reflow; header actions
  (`.topActionsRow`) stretch to fill.
- Gotcha that bit us: an inline `placeItems: center` on the overlay could not be overridden
  by a stylesheet `align-items` rule. The mobile override uses `place-items` + `!important`
  because it is fighting inline styles. Grid tracks use `minmax(0,1fr)` (not `1fr`) so
  columns can actually shrink below content min-width.
- The viewport meta tag (`width=device-width, initial-scale=1`) is present and required;
  without it no breakpoint fires on real mobile Safari.
- IMPORTANT: the responsive classes (mRow2/mRow3/modalOverlay/modalSheet/modalBody/
  statusBtnRow) are applied to elements in index-cdn.html. In the jsx they are referenced
  in CSS but NOT applied to elements (part of the drift).

---

## User's standing preferences (the person you're building for)

- **No em dashes** anywhere, they consider it an AI tell. Use commas, parens, or restructure.
- Direct prose, no corporate filler or hedging. Contractions are fine.
- Wants to BE right, not be told they're right. Push back when warranted; concede cleanly
  when wrong without over-explaining.
- Catches overclaiming AND underclaiming. Don't oversell what a change does.
- Generic utility, NOT personalized to them, earlier versions leaked SRE/Netflix-specific
  defaults and they had those stripped. Keep placeholders and defaults domain-neutral.
- Wants orphaned styles/vars/props removed when they're created, not left as dead code.
- Expects both builds (CDN + offline) kept in sync.

---

## Build process (how to regenerate index.html, the offline build)

The offline file is compiled, not hand-written. The pipeline:

1. Extract the component code from `index-cdn.html`'s `<script type="text/babel">` block.
2. Strip the esm.sh import lines.
3. Prepend a shim that binds names from UMD globals:
   `const { useState, ... } = React; const { LineChart, ... } = Recharts;` etc.
   **The shim derives its icon/recharts lists from the source imports automatically**
   (parse the import statements), do NOT hardcode the lists, they drift. This bit one
   earlier session (GripVertical was added to source but not the hardcoded shim list).
4. Pre-compile the whole thing JSX→JS with Babel (`@babel/preset-react`, classic runtime),
   so no runtime Babel is needed.
5. Inline 5 UMD bundles as `<script>` blocks IN THIS ORDER: React, ReactDOM, PropTypes,
   Recharts, lucide-react. Each wrapped in an IIFE that shadows `module/exports/define`
   as undefined, forcing the browser-global branch of each UMD wrapper.
6. **Add lowercase global aliases BEFORE Recharts/lucide load:**
   `window.react = window.React; window.reactDom = window.ReactDOM; window.propTypes = window.PropTypes;`
   lucide-react's UMD reads `window.react` (lowercase), without this alias it gets
   undefined React and silently produces an empty icon set (`forwardRef of undefined`).
   This was a real bug that cost time; don't remove the aliases.
7. Also set `window.process = { env: { NODE_ENV: 'production' } }` before React loads.

UMD bundle locations after `npm install react@18.3.1 react-dom@18.3.1 recharts@2.12.7
lucide-react@0.408.0 prop-types@15.8.1`:
- `node_modules/react/umd/react.production.min.js`
- `node_modules/react-dom/umd/react-dom.production.min.js`
- `node_modules/prop-types/prop-types.min.js`
- `node_modules/recharts/umd/Recharts.js`
- `node_modules/lucide-react/dist/umd/lucide-react.min.js`

Pin to React 18, not 19. Declare ALL deps in package.json before installing, bare
`npm install --no-save X` prunes packages not in the manifest, which caused repeated
"package disappeared" loops in earlier sessions.

---

## Testing (do this, it has caught real bugs every time)

After any change, before claiming it works:

1. **Transpile check**: extract the component, run it through `@babel/preset-react`. Catches
   syntax errors. Every edit was validated this way.
2. **Headless render test (jsdom)**: load index.html (the offline build) in jsdom with
   `runScripts: "dangerously"`, seed a record via an injected `localStorage.setItem`
   script, and assert: header count, row count, cells-per-row, that sample data renders,
   that there are zero console errors. This caught the GripVertical bug and the missing
   useEffect import.
   - jsdom lacks `ResizeObserver` and `matchMedia`, POLYFILL them in the test
     (`window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} }`).
     Errors about those are jsdom gaps, NOT real bugs; real browsers have them.
3. **Always tell the user to open the file in a REAL browser** to confirm visuals and
   interactions (drag, charts painting), jsdom proves wiring, not pixels.

---

## Known sharp edges / things not done

- **JSX DRIFT (most important):** `PipelineDashboard.jsx` is stale and out of sync with
  index-cdn.html. It is missing the Paste-JSON modal entirely and the responsive classes are
  in its CSS but not applied to its elements. If the human wants a React-project version, the
  jsx must be regenerated/reconciled from index-cdn.html as a deliberate task, not trusted
  as-is. For everything that ships (index.html via index-cdn.html), the jsx is irrelevant.
- Open/closed state of the collapsible sections (filters, priority targets) does NOT
  persist across reloads. Filters now default to COLLAPSED; priority targets default open.
  Could be persisted to localStorage if asked.
- Responsive layout was added but only ever verified in headless jsdom (which proves the
  CSS/structure exist, NOT the visual result). It has NOT been confirmed on a real device by
  Claude. The human should open index.html on an actual phone to confirm. If something still
  overflows, the table's intentional horizontal scroll is fine; anything else is a bug.
- Sticky pinned table columns use `T.panel` background; on row hover the row bg changes
  but the sticky cells don't match. Minor cosmetic, left as-is.
- Median response time only counts records with a responseDate filled in; small samples
  swing it. The "N measured" subtext shows the sample size honestly.
- The offline `index.html` needs NO internet, it is fully self-contained. (index-cdn.html
  is the one that needs internet every load.)

---

## Planned next work (briefs already written)

- **`QUARRY-BACKEND-BRIEF.md`** exists, a full brief for adding a Firebase/Firestore
  backend (hosted DB, no server to operate, per-user auth, offline persistence) plus a
  Gmail email-bot that reads job emails and proposes status updates in propose-then-commit
  mode. Decisions already locked: Firestore, multi-tenant via Firebase Auth, keep
  localStorage as offline fallback, schema versioning as step one. If the human asks about
  the backend or the bot, read that brief; do not re-derive the architecture.

---

## How to start a fresh session

Paste something like:

> I'm continuing development on Quarry, a job-search pipeline tracker. Read the attached
> handoff doc FIRST, then we'll work. [attach QUARRY-HANDOFF.md and index-cdn.html, which is
> the source of truth; index.html is regenerated from it; the .jsx is stale, ignore it
> unless I ask for a React version]. Today I want to [your task].

The fresh instance should: read the handoff, confirm it understands that index-cdn.html is
the source of truth and index.html is the built output, NOT hand-edit index.html, and follow
the build + test loop. It should NOT trust PipelineDashboard.jsx. Respect the human's style
preferences (no em dashes, terse, remove orphans, no overselling changes).
