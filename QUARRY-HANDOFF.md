# Quarry — Development Handoff

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

The visual identity is "Quarry" — a terraced stone-pit logo with a mineral vein, on a
mid-slate neumorphic theme. The name and look are settled; don't redesign them.

---

## The files (and which is canonical)

There are two real builds plus the React source. Note the naming: the file GitHub Pages
serves is `index.html`, and that is the OFFLINE build (the one that deploys).

1. **`PipelineDashboard.jsx`** — the React source of truth. A single-file component.
   Edit this when working in a real React project. ~1700 lines.

2. **`index-cdn.html`** — the CDN build. Loads React/Recharts/lucide/Babel from esm.sh at
   runtime. Small (~68KB) but REQUIRES INTERNET. This is also the editable HTML source that
   the offline build is compiled from. (Earlier in the project this file was named
   `pipeline.html` — a leftover from when the app was called "pipeline dashboard.")

3. **`index.html`** — the OFFLINE build, fully self-contained (~1.2MB). All libraries
   inlined, JSX pre-compiled to plain JS, zero network calls. This is what gets deployed to
   GitHub Pages (Pages serves `index.html` by default). It is GENERATED from `index-cdn.html`
   by the build step (see "Build process" below) — never hand-edit it. (Earlier this file
   was named `quarry-offline.html`.)

**CRITICAL: index-cdn.html and PipelineDashboard.jsx must stay in sync.** They contain
the same component with two differences only:
- The `.jsx` uses ES module imports (`import ... from "react"`); the `.html` uses
  esm.sh URLs in a `<script type="text/babel" data-type="module">` block.
- The `.html` has localStorage persistence + export/import fallbacks baked in; confirm
  whether a given feature belongs in both.

When you change one, port the identical change to the other, then regenerate
`index.html` with the build script. Every edit in this project was done as a matched pair.

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
This was a deliberate architecture choice — earlier versions stored weekly counts and
it was the wrong model. Do not reintroduce stored aggregates.

### Statuses (pipeline stages)
`applied, interview, offer, rejected, withdrawn, noResponse`
- Sentiment mapping: interview/offer = positive; rejected = negative; the rest = neutral.
- `withdrawn` = user pulled out. Counts as a RESPONSE (employer engaged) but is neither
  positive nor negative, and must NOT inflate ghost rate. This distinction is load-bearing.
- `offer` is still selectable, but its dedicated metrics (Close Rate, Offer funnel stage,
  offer-median salary) were intentionally REMOVED — once there's an offer the search is
  over, so those readouts are noise. Offer still counts toward positive/reachedInterview.

### Sources (lead segments)
`referral, recruiter, direct, board` — colors: violet, coral(red), gold(amber), cyan.

### Derived "stale" flag
Not a stored status. A record is stale if `status === "applied"` AND applied more than
`STALE_DAYS` (14) ago. Computed live via `isStale(r)`. Surfaces as a table badge, in the
Total Applied KPI subtitle, and as a tile on the LinkedIn summary card.

---

## Color system (important — there were collisions)

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
palette — this avoids touching hundreds of references. If asked to recolor, remap hex
values in `T`, don't rename tokens.

---

## Layout / section order (top to bottom)

1. Header (brand mark + QUARRY wordmark + action buttons)
2. Filter bar (COLLAPSIBLE) — search + Category/Source/Status chip rows
3. Applications table
4. Priority Targets (COLLAPSIBLE, only shows if any starred)
5. KPI strip (5 tiles: Total Applied, Response Rate, Interview Rate, Median Response, Ghost Rate)
6. Analytics grid (Conversion by Source, Status Breakdown, Funnel, Salary, Category, Skills, Weekly Trend)
7. LinkedIn summary card (exports as PNG)
8. Edit/Add modal (rendered last, shown on demand)

### The applications table (most complex part)
- Driven by a `COLUMNS` registry (module-level array). Each column has
  `{ key, label, sortKey, render(r, ctx), tdStyle? }`.
- **Star + Edit pinned far left; Trash pinned far right** — sticky, always visible.
- The 10 data columns between them are DRAGGABLE to reorder (HTML5 drag events) AND
  click-to-sort (where `sortKey` is set). Column order persists to localStorage key
  `quarry-colorder`.
- To add a column: add an entry to `COLUMNS`. The order array auto-heals (unknown keys
  dropped, new keys appended) so existing users' saved orders don't break.

### The modal
Fields are ordered by information priority: Company/Role (the only REQUIRED fields) →
Status (button row, not dropdown) → Source/Salary → Location → dates → divider →
ancillary (Category, link, Skills, Notes). The `valid` check gates save on company+role only.

---

## User's standing preferences (the person you're building for)

- **No em dashes** anywhere — they consider it an AI tell. Use commas, parens, or restructure.
- Direct prose, no corporate filler or hedging. Contractions are fine.
- Wants to BE right, not be told they're right. Push back when warranted; concede cleanly
  when wrong without over-explaining.
- Catches overclaiming AND underclaiming. Don't oversell what a change does.
- Generic utility, NOT personalized to them — earlier versions leaked SRE/Netflix-specific
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
   (parse the import statements) — do NOT hardcode the lists, they drift. This bit one
   earlier session (GripVertical was added to source but not the hardcoded shim list).
4. Pre-compile the whole thing JSX→JS with Babel (`@babel/preset-react`, classic runtime),
   so no runtime Babel is needed.
5. Inline 5 UMD bundles as `<script>` blocks IN THIS ORDER: React, ReactDOM, PropTypes,
   Recharts, lucide-react. Each wrapped in an IIFE that shadows `module/exports/define`
   as undefined, forcing the browser-global branch of each UMD wrapper.
6. **Add lowercase global aliases BEFORE Recharts/lucide load:**
   `window.react = window.React; window.reactDom = window.ReactDOM; window.propTypes = window.PropTypes;`
   lucide-react's UMD reads `window.react` (lowercase) — without this alias it gets
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

Pin to React 18, not 19. Declare ALL deps in package.json before installing — bare
`npm install --no-save X` prunes packages not in the manifest, which caused repeated
"package disappeared" loops in earlier sessions.

---

## Testing (do this — it has caught real bugs every time)

After any change, before claiming it works:

1. **Transpile check**: extract the component, run it through `@babel/preset-react`. Catches
   syntax errors. Every edit was validated this way.
2. **Headless render test (jsdom)**: load index.html (the offline build) in jsdom with
   `runScripts: "dangerously"`, seed a record via an injected `localStorage.setItem`
   script, and assert: header count, row count, cells-per-row, that sample data renders,
   that there are zero console errors. This caught the GripVertical bug and the missing
   useEffect import.
   - jsdom lacks `ResizeObserver` and `matchMedia` — POLYFILL them in the test
     (`window.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} }`).
     Errors about those are jsdom gaps, NOT real bugs; real browsers have them.
3. **Always tell the user to open the file in a REAL browser** to confirm visuals and
   interactions (drag, charts painting) — jsdom proves wiring, not pixels.

---

## Known sharp edges / things not done

- Open/closed state of the collapsible sections (filters, priority targets) does NOT
  persist across reloads — resets to open. Could be added to localStorage if asked.
- Sticky pinned table columns use `T.panel` background; on row hover the row bg changes
  but the sticky cells don't match. Minor cosmetic inconsistency, left as-is.
- Median response time only counts records with a responseDate filled in; small samples
  swing it. The "N measured" subtext shows the sample size honestly.
- The offline file needs internet on FIRST nothing — it's fully self-contained. (The CDN
  index-cdn.html is the one that needs internet every load.)

---

## How to start a fresh session

Paste something like:

> I'm continuing development on Quarry, a job-search pipeline tracker. I'm attaching the
> handoff doc and the three files. Read the handoff first. [attach QUARRY-HANDOFF.md,
> PipelineDashboard.jsx, index-cdn.html — the offline build (index.html) can be regenerated]. Today I
> want to [your task].

The fresh instance should read the handoff, confirm it understands the sync requirement
and the build process, then work. If it starts hand-editing index.html (the offline build) or
forgets to keep the two source files in sync, stop it and point back here.
