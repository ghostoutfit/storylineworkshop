# CLAUDE.md — Storyline Workshop

This file is for AI assistants (Claude Code, etc.) working on this project. It explains the codebase, conventions, and key decisions so you can be effective without re-reading all the source.

---

## What This Project Is

Storyline Workshop is a static, client-side-only resource-sharing site for physics teachers implementing OpenSciEd in Denver Public Schools.

- Teachers submit resources via Google Form → writes to Google Sheet
- This site fetches that sheet (published as TSV) and renders it
- Firebase Firestore stores comments and likes only
- No backend, no build step, no framework

**Hosted on GitHub Pages from the repository root.**

---

## File Map

| File | Role |
|---|---|
| `index.html` | All HTML markup. Single page. |
| `style.css` | All styles. No CSS framework. |
| `app.js` | Data fetching, parsing, filtering, rendering, event handling. |
| `firebase.js` | Firebase Firestore init + all reads/writes for likes and comments. |
| `config.js` | All configurable values (sheet URL, form URL, Firebase config, defaults). |
| `README.md` | Setup and deployment guide for humans. |
| `CLAUDE.md` | This file. |

---

## Architecture

```
Google Sheet (TSV) ──fetch──▶ app.js ──render──▶ DOM
                                 │
                                 └──read/write──▶ firebase.js ──▶ Firestore
```

- `config.js` is a plain `<script>` tag loaded before `app.js` and `firebase.js`
- `app.js` and `firebase.js` are ES modules (`type="module"`)
- `firebase.js` exports functions; `app.js` imports them
- `CONFIG` global is set by `config.js` before the modules load

---

## Data Flow

### Fetching

`app.js → fetchResources()` fetches the TSV from `CONFIG.sheetUrl`. The first row is the header and is skipped. Each subsequent row is split on `\t` and mapped to an object.

### TSV Column Order

```
Timestamp | Email | Program | Course | UnitName | Lesson | Part | Description | Coherence | Link | Contributor | ProjectTag
```

### Resource ID

Generated client-side via `simpleHash(Timestamp + Email)` — a simple non-cryptographic hash that produces a 6-character alphanumeric string. This is used as the Firestore document key for likes/comments. **Email is deleted from the object immediately after hashing.**

### Data in Memory

`allResources` — the full dataset, never mutated after load.
`filters` — current filter state object with optional keys: `program`, `course`, `unitName`, `lesson`, `part`, `contributor`, `projectTag`.

---

## Filtering & Sorting

### Cascading Dropdowns

Dropdowns cascade: Program → Course → Unit → Lesson → Part. Each dropdown's options come from resources that already match all upstream filters. Contributor and ProjectTag dropdowns filter from the fully-filtered set.

`buildDropdowns()` rebuilds all seven dropdowns on every state change.

### Sort Order (within filtered results)

1. Resources where `Part` contains "Whole Unit" — first
2. Resources where `Part` contains "Whole Lesson" — second
3. All others — sorted by `Lesson` (numeric ascending), then `Part` (numeric ascending)

Implemented in `partSortKey()` and `lessonSortKey()`.

---

## Rendering

Cards are rendered as a string of HTML via `renderCards()` and set with `innerHTML`. Event handling uses event delegation on `#results` — do not add individual listeners to cards.

`escapeHtml()` and `escapeAttr()` must be used on all user-sourced data to prevent XSS. These are already applied in `renderCards()`.

---

## Firebase

`firebase.js` exports:
- `initFirebase(config)` — called once in `app.js init()`
- `getLikes(resourceId)` → `number`
- `incrementLike(resourceId)` → `void` (creates doc if missing)
- `getComments(resourceId)` → `Array<{id, name, text, timestamp}>`
- `addComment(resourceId, name, text)` → `void`
- `isFirebaseAvailable()` → `boolean`

If Firebase init fails, all functions degrade gracefully (return 0/`[]`/throw). The app still works without Firebase.

### Firestore Structure

```
resources/
  {resourceId}/
    likes: number
    comments/
      {autoId}/
        name: string
        text: string
        timestamp: Firestore.Timestamp
```

---

## Likes

- Like counts are fetched from Firestore after cards render (async)
- `localStorage` key `sw_liked` stores a JSON array of resource IDs the user has liked
- Once liked, the button is disabled (no un-liking)
- Optimistic UI update happens immediately; Firestore write is async

---

## Comments

- Comments load only when the user expands a card's comment section
- The last-used commenter name is persisted in `localStorage` as `sw_commenter_name`
- Comments are displayed in chronological order
- No authentication, no moderation

---

## Key Conventions

- **No framework.** Vanilla JS, ES modules only.
- **No build step.** Files are served directly. Do not introduce bundlers, transpilers, or npm dependencies.
- **All config in `config.js`.** Do not hardcode URLs, credentials, or defaults anywhere else.
- **Email is never displayed.** Strip it immediately after hashing. Never log it. Never put it in the DOM.
- **Event delegation** for card interactions. `#results` is the event root.
- **Escape all dynamic content.** Use `escapeHtml()` for text nodes, `escapeAttr()` for attributes.
- **TSV parsing.** Split on `\n` then `\t`. Do not use a CSV library. No CSV.
- **One column of cards**, not a grid. Readability over density.
- **Design language:** clean, utilitarian. Cabin font. Creamy off-white background (`#faf7f2`), warm muted browns and sage green accent (`#6b7c5e`). Lots of whitespace. Not flashy.

---

## How to Add a Feature

1. **New filter field:** Add it to `HEADERS` check in `app.js`, add a `<select>` to `index.html`, extend `buildDropdowns()` and `getFilteredResources()`, and update `resetFilters()`.
2. **New card field:** Add rendering in `renderCards()` and apply `escapeHtml()`.
3. **New Firebase operation:** Add an exported function to `firebase.js` and import it in `app.js`.
4. **New config value:** Add it to `config.js` with a comment explaining its purpose.

---

## Deployment

GitHub Pages, no build step. Push to `main` (or `master`) and the site updates automatically.

Do not introduce:
- npm / package.json
- Webpack, Vite, Rollup, or any bundler
- TypeScript
- Any CSS framework (Tailwind, Bootstrap, etc.)
- Any JS framework (React, Vue, etc.)

Keep it static. That's the point.

---

## Firebase Setup (for new deployments)

See `README.md` for step-by-step instructions. In brief:
1. Create Firebase project at console.firebase.google.com
2. Enable Firestore in production mode
3. Set security rules as documented in README.md
4. Register a web app, copy `firebaseConfig`, paste into `config.js`
