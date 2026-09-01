# Unused / Dead / Redundant Code Report

**Repository:** `alirostami01/iranian-provider-media` (Persian Streams — Stremio addon)
**Analysis date:** 2026-09-01
**Scope analysed:** every non-ignored file in the repo.

## 0. Project inventory

The project is a single-module Node.js application. There is no build step, no test suite and no
transpiler, so all reachability below is determined by direct source reading plus grep-based
cross-referencing.

| Path | Type | Status |
| --- | --- | --- |
| `addon.js` (453 lines) | Application source — **the only JavaScript file** | Analysed in full |
| `package.json` / `package-lock.json` | Manifest | Analysed (dependency usage) |
| `README.md`, `docs/DOCUMENTATION.md` | Docs | Cross-referenced only |
| `assets/icons/logo.png` | Asset | Referenced |
| `assets/icons/player-fa.png` | Asset | **Unreferenced** (see 4.2) |
| `.gitignore` | Config | Fine (`.env`, `node_modules/`) |

Because there is exactly one module, there are no unused `require`s of local files and no orphaned
helper modules other than the item noted in section 4.

---

## 1. Dead / effectively-unused code

### 1.1 `fetchTitleFromMeta()` — result never used (dead function)

- **File Path & Line Numbers:** `addon.js` (Lines 60–85, consumed at 358–360)
- **Code Snippet / Identifier:** `async function fetchTitleFromMeta(type, imdbId)`
- **Category:** Dead Function / Unused Network Call
- **Reasoning & Explanation:** The function is called exactly once, in `getStreams()`:
  ```js
  const meta = await fetchTitleFromMeta(type, imdbId);
  const title = meta ? meta.name : null;   // never read afterwards
  const year  = meta ? meta.year : null;   // never read afterwards
  ```
  Neither `title` nor `year` is referenced anywhere else in the file (verified by grep: the only
  other occurrences of `title` are the unrelated `title:` keys of the stream objects and the
  `.title span` CSS selector). Content resolution is done purely by IMDB id through
  `resolveViaQuickSearch()` (Line 364). The file header comment ("we fetch the title from Stremio's
  metadata service and convert it to a slug") documents a slug-based strategy that no longer exists
  in the code — the slug conversion helper it refers to has already been removed, leaving this
  fetch behind as a leftover.
- **Safety / Dependency Note:** Removing it is behaviourally safe but has a **positive** side
  effect: it eliminates one blocking HTTPS round-trip (5 s timeout) to
  `v3-cinemeta.strem.io` on every single stream request. Keep it only if a title-based fallback
  resolver is planned; in that case wire it up rather than leaving it dormant.

### 1.2 Unused local variables `title` and `year`

- **File Path & Line Numbers:** `addon.js` (Lines 359–360)
- **Code Snippet / Identifier:** `const title = ...`, `const year = ...`
- **Category:** Unused Variable
- **Reasoning & Explanation:** Assigned once, read zero times. Any linter with
  `no-unused-vars` enabled flags both.
- **Safety / Dependency Note:** None. Pure locals, not exported, not captured in a closure.

### 1.3 Redundant initialisation of `contentUrl`

- **File Path & Line Numbers:** `addon.js` (Lines 362–364)
- **Code Snippet / Identifier:**
  ```js
  let contentUrl = null;

  contentUrl = await resolveViaQuickSearch(imdbId);
  ```
- **Category:** Redundant Assignment / Dead Store
- **Reasoning & Explanation:** The `null` initialiser is overwritten on the very next executed
  statement with no intervening read or branch, so the store is dead. The `let` + separate
  assignment shape is a remnant of an earlier multi-strategy resolver (quick-search → slug →
  search page); with a single strategy left it collapses to
  `const contentUrl = await resolveViaQuickSearch(imdbId);`.
- **Safety / Dependency Note:** Safe. Note the related latent bug in 3.4 before touching this area.

### 1.4 Duplicate `builder.getInterface()` call

- **File Path & Line Numbers:** `addon.js` (Lines 406 and 411)
- **Code Snippet / Identifier:** `module.exports = builder.getInterface();` … `const addonInterface = builder.getInterface();`
- **Category:** Redundant Code
- **Reasoning & Explanation:** The interface is built twice within the same process. Line 411 could
  simply reuse `module.exports`. Additionally, the export on Line 406 is **effectively an
  unreachable export**: no file in the repository `require()`s `addon.js` (it is only ever the
  process entry point via `"main": "addon.js"` / `npm start`), so the exported interface has no
  in-repo consumer.
- **Safety / Dependency Note:** **Do not delete the export.** It is the conventional public surface
  of a Stremio addon and is what allows the module to be embedded by an external host or by
  `stremio-addon-sdk`'s `serveHTTP`. Only the duplicated *call* on Line 411 is safely collapsible.

---

## 2. Unreachable / dead logic branches

### 2.1 `quality=` query-parameter fallback in `detectQuality()` — unreachable

- **File Path & Line Numbers:** `addon.js` (Lines 158–165)
- **Code Snippet / Identifier:**
  ```js
  const qualityParam = url.match(/[?&]quality=([^&]*)/i);
  if (qualityParam) {
    const q = decodeURIComponent(qualityParam[1]).toLowerCase();
    if (q.includes('2160') || q.includes('4k')) return '4K';
    if (q.includes('1080')) return '1080p';
    if (q.includes('720'))  return '720p';
    if (q.includes('480'))  return '480p';
  }
  ```
- **Category:** Unreachable Branch / Dead Logic
- **Reasoning & Explanation:** `combined` (Line 150) is `url + ' ' + context` lower-cased, i.e. it
  is a **superset** of the query-string being re-parsed here. Every token this block tests for
  (`2160`, `4k`, `1080`, `720`, `480`) is already tested against `combined` on Lines 152–155, which
  `return` first. Therefore any URL that would satisfy a condition inside this block has already
  caused an early return, and control can only reach Lines 158–165 in the case where **none** of the
  inner conditions can match either. The only theoretical escape hatch is a percent-encoded value
  (e.g. `?quality=%31%30%38%30`) that `decodeURIComponent` would reveal — no such encoding is
  produced by the scraped site, whose links are plain `.mkv`/`.mp4` paths. Net effect: the block can
  only ever fall through to `return 'Unknown'`.
- **Safety / Dependency Note:** Low risk to remove; the only behaviour lost is the exotic
  percent-encoded case. A cheaper fix that preserves intent is to decode the URL *once* into
  `combined` at the top of the function and drop this block entirely.

### 2.2 "Strategy 3" onclick scan — duplicate of Strategy 1, never yields a new result

- **File Path & Line Numbers:** `addon.js` (Lines 272–281)
- **Code Snippet / Identifier:**
  ```js
  // Strategy 3: Check sibling elements
  if (!videoUrl) {
    $epEl.find('a[onclick]').each((_, aEl) => { ... handleDownloadClick ... });
  }
  ```
- **Category:** Redundant / Dead Logic Branch
- **Reasoning & Explanation:** Strategy 1 (Lines 254–262) already runs
  `$epEl.find('a[onclick]').first()` over the *same* subtree with the *same*
  `handleDownloadClick(...)` regex. Strategy 3 re-runs the identical query set. It can therefore
  only produce a URL when the **first** matching `a[onclick]` lacks a parsable `onclick` while a
  **later** sibling has one — a case the comment ("check sibling elements") anticipates but which
  the selector cannot actually broaden, since Strategy 1 is a strict prefix of Strategy 3's
  iteration. For every real page shape observed in the extractor's own selectors, Strategy 3 is a
  no-op. The comment is also misleading: it never leaves `$epEl`, so it inspects descendants, not
  siblings.
- **Safety / Dependency Note:** Slight residual value in the "first element unparsable, second
  parsable" edge case. **Recommended action: keep the loop, delete Strategy 1** (the loop subsumes
  it) rather than the reverse — that removes the duplication without narrowing coverage.

### 2.3 Corrupted Persian season regex — one alternative can never match

- **File Path & Line Numbers:** `addon.js` (Line 215)
- **Code Snippet / Identifier:** `buttonText.match(/(?:season|fصل)[\s\u06F0-\u06F9\u0660-\u0669]*(\d+)/i)`
- **Category:** Dead Logic / Mojibake Literal
- **Reasoning & Explanation:** The second alternative is `fصل` — a **Latin `f`** followed by the
  Persian letters `صل`. The intended word is clearly `فصل` ("season"). No Persian page will ever
  emit the mixed-script sequence `fصل`, so that half of the alternation is unreachable. In practice
  season detection relies entirely on the `persianNumbers` map (Lines 203–213) and the English
  `season` alternative.
- **Safety / Dependency Note:** This is a **latent bug, not merely dead code**. Fixing it (`fصل` →
  `فصل`) would *activate* a code path that currently never runs and could change which season
  container matches on sites that write "فصل 2". Treat as a behaviour change, not a cleanup — test
  against a live page before altering.

### 2.4 Character-class range in the same regexes is inert

- **File Path & Line Numbers:** `addon.js` (Lines 215, 232, 236)
- **Code Snippet / Identifier:** `[\s\u06F0-\u06F9\u0660-\u0669]*(\d+)`
- **Category:** Redundant Pattern
- **Reasoning & Explanation:** The class permits Persian/Arabic-Indic digits as *separators*, but
  the capture group `(\d+)` only accepts ASCII digits, and `parseInt` is then applied to the ASCII
  result. So a page that writes "قسمت ۱۲" entirely in Persian digits matches nothing at all, and the
  Persian-digit ranges in the separator class never contribute to a successful match — they can only
  ever skip digits immediately preceding an ASCII number, which does not occur.
- **Safety / Dependency Note:** Harmless if left. If Persian-digit episode numbers need supporting,
  this requires a real normalisation helper, not a deletion.

### 2.5 `'hd'` / `'sd'` substring checks are shadowed and over-broad

- **File Path & Line Numbers:** `addon.js` (Lines 154–155)
- **Code Snippet / Identifier:** `combined.includes('hd')`, `combined.includes('sd')`
- **Category:** Partially Dead Condition
- **Reasoning & Explanation:** `'hd'` is a substring of `uhd` and `fhd`, both of which return on
  Lines 152–153 first — so the `'hd'` test can only ever fire on a bare `hd` token, never via those
  two. It is simultaneously over-broad: any URL containing the letters `hd` anywhere (including
  inside a random CDN hash) is silently classified `720p`. The `'sd'` test has the same weakness.
- **Safety / Dependency Note:** Do not delete outright — the bare-`hd` case is real. Tighten with
  word boundaries (`/\bhd\b/`) instead.

### 2.6 `href*="http"` selector is neutralised by the following guard

- **File Path & Line Numbers:** `addon.js` (Lines 311–315)
- **Code Snippet / Identifier:**
  ```js
  $box.find('a[href*=".mkv"], a[href*=".mp4"], a[href*="http"]').each((_, el) => {
    ...
    if (href && (href.includes('.mkv') || href.includes('.mp4') || href.includes('abrtech'))) {
  ```
- **Category:** Redundant Selector / Dead Filter Clause
- **Reasoning & Explanation:** The third selector `a[href*="http"]` widens the match set to every
  absolute link in the box, but the immediately following `if` discards everything that is not
  `.mkv`, `.mp4` or `abrtech`. Since the first two selectors already capture `.mkv`/`.mp4`, the only
  elements the third selector uniquely contributes are `abrtech` links that happen to be absolute —
  which an `a[href*="abrtech"]` selector would express directly. As written the selector does extra
  DOM work for a set that is then almost entirely thrown away.
- **Safety / Dependency Note:** Replacing `a[href*="http"]` with `a[href*="abrtech"]` is
  behaviour-preserving for all inputs except relative `abrtech` links (which would then also be
  caught — a strict improvement). Low risk.

### 2.7 `req.protocol` / `req.get('host')` fallbacks are unreachable under Express

- **File Path & Line Numbers:** `addon.js` (Lines 418–419)
- **Code Snippet / Identifier:** `req.protocol || 'http'`, `req.get('host') || \`localhost:${PORT}\``
- **Category:** Dead Defensive Branch
- **Reasoning & Explanation:** Express always populates `req.protocol` (it defaults to `'http'`
  internally), so the `|| 'http'` right-hand side is unreachable. `req.get('host')` is absent only
  for a malformed HTTP/1.0 request with no `Host` header, which Node's HTTP server and any real
  Stremio client never produce.
- **Safety / Dependency Note:** Cheap and harmless defensive code. Flagged for completeness;
  removal is optional and gains nothing.

---

## 3. Observations that are *not* dead code (recorded to prevent false positives)

These were checked and confirmed **live** — listed so a future cleanup pass does not remove them by
mistake.

1. **`const path = require('path')` (Line 13)** — used at Line 432 (`path.join`). *Live.*
2. **`const express = require('express')` (Line 12)** — used at Lines 413 and 432. *Live.* Note it
   is only reachable inside the `require.main === module` guard, so it is a genuine runtime
   dependency of the CLI entry point, not of the exported module.
3. **`cheerio`, `axios`, `dotenv`, `stremio-addon-sdk`** — all four `dependencies` in
   `package.json` are used. No unused npm dependencies were found.
4. **`getRouter` (Line 410)** — a lazily-scoped `require` inside the entry guard; intentional and
   used at Line 428. *Live.*
5. **`isDubbed()`** — called at Lines 286 and 326. *Live.* Its five keyword variants
   (`dubbed`, `dooble`, `dooble`-style transliterations, `farsi dub`, `persian dub`) are all
   plausible real-world spellings; none is subsumed by another.
6. **`detectQuality`'s `context = ''` default parameter** — both call sites pass an argument
   explicitly, so the default is never exercised, but it is a harmless API affordance rather than
   dead logic.
7. **iframe extraction block (Lines 336–345)** — no evidence it is unreachable; the scraped site may
   serve embedded players. Left as live code.
8. **`persianNumbers` map (Lines 203–206)** — allocated inside the `.each` callback on every season
   element rather than hoisted to module scope. That is a minor performance smell, **not** dead
   code; the map is read on Line 208.

---

## 4. Redundant / obsolete files and assets

### 4.1 No obsolete JavaScript modules

- **Category:** N/A — negative finding
- **Reasoning & Explanation:** The repository contains exactly one `.js` file outside
  `node_modules/`. There are no orphaned helper modules, no duplicated utility files, and therefore
  no unused local `require()` statements anywhere in the project.

### 4.2 `assets/icons/player-fa.png` — unreferenced asset

- **File Path & Line Numbers:** `assets/icons/player-fa.png` (whole file)
- **Code Snippet / Identifier:** `player-fa.png`
- **Category:** Unused Asset / Obsolete Resource
- **Reasoning & Explanation:** A full-text search across `addon.js`, `README.md`,
  `docs/DOCUMENTATION.md` and `package.json` returns **zero** references to `player-fa`. By
  contrast, its sibling `logo.png` is referenced four times. The whole `assets/icons` directory is
  served statically (Line 432), so the file is *reachable over HTTP* but is never linked by any
  code, manifest or document.
- **Safety / Dependency Note:** Because the directory is exposed via `express.static`, an external
  consumer (a README on another site, a Stremio client cache, or a link shared out-of-band) could
  in principle be hot-linking it. Deletion is very likely safe but is technically an
  externally-observable change. Recommend confirming with the author before removing.

### 4.3 `LOGO` constant — obsolete value, superseded at runtime

- **File Path & Line Numbers:** `addon.js` (Lines 41–43, consumed Line 57, overridden Line 422)
- **Code Snippet / Identifier:** `const LOGO = '/assets/icons/logo.png';`
- **Category:** Obsolete Constant / Overridden Value
- **Reasoning & Explanation:** `LOGO` is a **relative** path, but the code's own comment (Lines
  415–416) states "Stremio requires absolute URLs for images in the manifest." The `/manifest.json`
  route therefore rebuilds the manifest with an absolute logo URL, discarding the `LOGO` value for
  every request that goes through the Express entry point. The constant survives only in
  `addonInterface.manifest` as an invalid relative URL — i.e. it is dead for the served manifest and
  actively wrong for any consumer that imports the module (section 1.4) and reads `manifest.logo`
  directly.
- **Safety / Dependency Note:** **Do not simply delete.** The `manifest` object requires *some*
  `logo` key for SDK validation, and the imported-module path has no other source for it. The right
  fix is to make the constant absolute (e.g. derive from a `PUBLIC_URL` env var), which would in
  turn make the Line 417–426 override redundant. Coupled change — handle both together.

---

## 5. Latent correctness issues adjacent to the dead code

Not "unused code" strictly, but discovered during reachability analysis and worth recording because
they sit inside the same functions and would be disturbed by a cleanup.

### 5.1 Unguarded null flows into `fetchPage` and the extractors

- **File Path & Line Numbers:** `addon.js` (Lines 364–373)
- **Category:** Missing Guard (crash path)
- **Reasoning & Explanation:** `resolveViaQuickSearch()` returns `null` on four distinct paths
  (non-200/non-array response, no IMDB match, a `/profile/` redirect, or a thrown error).
  `contentUrl` is then passed straight to `fetchPage(contentUrl)` with no null check;
  `client.get(null)` resolves against `baseURL` and fetches the site homepage. `fetchPage` can also
  return `null`, and that `null` `$` is then passed to `extractSeriesStreams($, ...)` /
  `extractMovieStreams($)`, where the first `$(...)` call throws `TypeError: $ is not a function`.
  The throw is caught by the `.catch` in the stream handler (Lines 399–402) and degrades to
  `{ streams: [] }`, so it is invisible in production — which is precisely why it has survived.
- **Safety / Dependency Note:** Adding an early `if (!contentUrl) return [];` and
  `if (!$) return [];` is safe and strictly reduces wasted requests. This interacts with finding
  1.3 — fix them in one edit.

### 5.2 Stray space in stream `name` template

- **File Path & Line Numbers:** `addon.js` (Lines 288 and 328)
- **Code Snippet / Identifier:** `` name: `${quality} ${dubbedLabel}` ``
- **Category:** Cosmetic Redundancy
- **Reasoning & Explanation:** `dubbedLabel` is either `''` or `' • دوبله'` — it already carries its
  own leading space. The literal space in the template therefore produces a trailing space
  (`"1080p "`) for non-dubbed streams and a double space for dubbed ones, both visible in the
  Stremio UI.
- **Safety / Dependency Note:** Purely presentational; no consumer parses this string.

### 5.3 Static asset middleware registered after the SDK router

- **File Path & Line Numbers:** `addon.js` (Lines 428–432)
- **Category:** Middleware Ordering Smell
- **Reasoning & Explanation:** `getRouter(addonInterface)` is mounted at the root **before**
  `/assets/icons`. If the SDK router terminates unmatched requests (rather than calling `next()`),
  the static handler — and thus the manifest's own logo URL from Line 422 — becomes unreachable.
- **Safety / Dependency Note:** Moving `express.static` above `getRouter` is low-risk and makes the
  logo route deterministic. Verify the logo still loads after reordering.

---

## 6. Summary

| # | Finding | Category | Confidence | Safe to remove? |
| --- | --- | --- | --- | --- |
| 1.1 | `fetchTitleFromMeta()` result unused | Dead Function | High | Yes (also removes a 5 s network call) |
| 1.2 | `title`, `year` locals | Unused Variable | High | Yes |
| 1.3 | `contentUrl = null` dead store | Redundant Assignment | High | Yes |
| 1.4 | Duplicate `getInterface()` | Redundant Code | High | Collapse call only — keep the export |
| 2.1 | `quality=` param fallback | Unreachable Branch | High | Yes |
| 2.2 | "Strategy 3" onclick scan | Redundant Branch | Medium | Merge with Strategy 1 |
| 2.3 | `fصل` regex alternative | Dead Literal | High | Fix, don't delete (behaviour change) |
| 2.4 | Persian-digit separator class | Redundant Pattern | Medium | Leave or implement properly |
| 2.5 | `'hd'` / `'sd'` substring tests | Partially Dead | Medium | Tighten, don't delete |
| 2.6 | `a[href*="http"]` selector | Redundant Selector | Medium | Replace with `abrtech` |
| 2.7 | `req.protocol` fallback | Dead Defensive Branch | High | Optional |
| 4.2 | `assets/icons/player-fa.png` | Unused Asset | High | Likely — confirm no hot-linking |
| 4.3 | `LOGO` constant | Obsolete Constant | High | No — fix value instead |

**Highest-value cleanup:** findings **1.1 + 1.2** together remove an entire dead helper *and* a
per-request blocking HTTP call to an external service — the only change here with a measurable
runtime benefit.

**Unused dependencies:** none. **Unused local imports:** none. **Orphaned modules:** none.

> No source files were modified in producing this report. This document is the only file added.
