# Unused / Dead / Redundant Code Report

**Repository:** `alirostami01/iranian-provider-media` (Persian Streams — Stremio Addon)
**Analysis Date:** 2026-09-01
**Commit Base:** `2b70f1a51360fe74cbccd401abf89a902aa85bb7` (HEAD)
**Branch:** `arena/01a05ba0-iranian-provider-media`
**Scope (all non-ignored files):**
| Path | Size / Type |
|------|-------------|
| `addon.js` | 451 lines, CommonJS (only JS source file) |
| `package.json` | 26 lines |
| `package-lock.json` | 157 packages, lockfile v3 |
| `README.md` | 281 lines |
| `docs/DOCUMENTATION.md` | 966 lines, Persian |
| `assets/icons/logo.png` | 75,508 bytes (referenced 7×) |
| `assets/icons/player-fa.png` | 3,697,736 bytes (**zero code references**) |
| `.gitignore` | 2 lines (`.env`, `node_modules/`) |

> **Read-only compliance:** No source, config, documentation, or asset file was modified. This report is the only file written.

---

## 0. Executive Summary

The repository is a single-module Node.js addon with no test suite, no build step, no bundler, and no helper modules. The analysis found:

- **No dead functions, no dead classes, no unreachable statements, no unreachable `return`/`throw`, and no unused npm dependencies.**
- **Exactly one genuinely unused project file:** `assets/icons/player-fa.png` (3.7 MB, zero references in code; the project docs explicitly say it is not used in the manifest).
- **Two categories of unused bindings** that a strict linter flags: one empty `catch (error)` binding and five `_` callback parameters.
- **Twelve redundant-logic findings** (duplicated filters, redundant regex flags, double `parseInt`, per-iteration constant allocation, redundant template literals, conditionally-unused imports/constants, one overly-broad fallback condition).
- The public export (`module.exports = addonInterface`) is **live** — verified by importing the module at runtime (exports `manifest` and `get`).
- `docs/DOCUMENTATION.md` is **current**.

**Correction to the previous report** (the pre-existing `UNUSED_CODE_REPORT.md` produced on a different branch, `arena/01a05b6f`): its finding 4.2 claimed `docs/DOCUMENTATION.md` is obsolete documentation referencing deleted functions. That is **incorrect for the current tree** — the only mention of `fetchTitleFromMeta`, `searchSite`, `slugifyTitle`, and `resolveViaEndpoint` in the docs is an explicit note at `docs/DOCUMENTATION.md:5` stating these functions **no longer exist** and that the current flow uses only `quick-search` + IMDb ID. The docs also correctly document `player-fa.png` as unused (lines 99 and 878 of `DOCUMENTATION.md`, lines 62–63 of `README.md`) and contain no stale line-number references to deleted code.

---

## 1. Methodology (all read-only)

| Check | Tool / Command | Result |
|-------|----------------|--------|
| Syntax parse | `node --check addon.js` | OK |
| Runtime import (library mode) | `BASE_URL=http://localhost:9 node -e "require('./addon.js')"` | OK — exports `['manifest', 'get']`; `require.main !== module` branch skipped |
| Unused vars/params/args | ESLint 9 (`no-unused-vars` with `vars: all`, `args: all`, `caughtErrors: all`) | 6 findings (all reported below) |
| Unreachable code | ESLint `no-unreachable`, `no-constant-condition`, `no-constant-binary-expression` | 0 findings |
| Unused files/exports/deps | `knip@5` (default: files, exports, dependencies) | 0 findings (exit 0, no output) |
| Cross-reference | `grep -c` / `grep -n` of every identifier, function, require, asset, and docs reference against `addon.js`, `README.md`, `docs/`, `package.json` | All live identifiers confirmed; see §3 |
| Manual review | Full line-by-line read of all 451 lines of `addon.js` | Branch/control-flow walkthrough (§2.13, §3) |
| Asset check | grep for `player-fa`, `logo` across all text files | `player-fa` → docs only; `logo` → code + docs |

ESLint config used for verification:

```js
rules: {
  'no-unused-vars': ['error', { vars: 'all', args: 'all', caughtErrors: 'all', ignoreRestSiblings: true }],
  'no-unreachable': 'error', 'no-constant-condition': 'error', 'no-useless-escape': 'error',
  'no-unneeded-ternary': 'error', 'no-constant-binary-expression': 'error',
  'no-regex-spaces': 'error', 'no-empty': ['error', { allowEmptyCatch: false }]
}
```

---

## 2. Findings

### 2.1 Unused Variables, Constants, and Parameters

#### F-01 — Unused `catch (error)` binding in `detectQuality`

- **File Path & Line Numbers:** `addon.js` (Lines 139–143)
- **Code Snippet / Identifier:**
  ```js
  try {
    decodedUrl = decodeURIComponent(decodedUrl);
  } catch (error) {
    // Malformed escape sequence - keep the raw URL.
  }
  ```
- **Category:** Unused Variable (catch binding)
- **Reasoning & Explanation:** `error` is bound but never read, logged, or rethrown. The empty catch is intentional defensive code (malformed percent-encoding must not abort quality detection), but the binding itself is unused — ESLint's `no-unused-vars` with `caughtErrors: 'all'` flags it (verified: `141:12 error 'error' is defined but never used`).
- **Safety / Dependency Note:** Safe to change to optional catch binding (`catch {}` — supported since Node 10, and this project targets Node ≥ 18 given the `node --watch` dev script). No behavioral change. Do **not** remove the `try/catch` itself, because `decodeURIComponent` throws on malformed sequences such as `%31%30%38%30` fragments observed upstream.

#### F-02 — Unused `_` callback parameters (5 sites)

- **File Path & Line Numbers:** `addon.js` (Lines 259, 300, 304, 329, and 431)
- **Code Snippet / Identifier:**
  ```js
  $epEl.find('a[onclick]').each((_, aEl) => {          // 259
  $('.download-list, .download-box, .dl-box').each((_, box) => {   // 300
  $box.find('a[href*=".mkv"], ...').each((_, el) => {  // 304
  $('iframe[src]').each((_, iframe) => {               // 329
  app.get('/', (_, res) => {                           // 431
  ```
- **Category:** Unused Parameter
- **Reasoning & Explanation:** Cheerio's `.each(callback)` passes `(index, element)`; in all five callbacks the first parameter is bound to `_` and never read (the element/res is what matters). ESLint `no-unused-vars` with `args: 'all'` flags all five (verified: lines 259:38, 300:53, 304:77, 329:26, 431:17). Note the sibling index parameters at lines 196 (`seasonIdx`) and 228 (`epIdx`) **are** used (for the `seasonIdx + 1` / `epIdx + 1` fallbacks), so they are not findings.
- **Safety / Dependency Note:** Purely cosmetic. Renaming to `_index`, or converting to `function () { ... }` with `$(this)`, or configuring ESLint to `argsIgnorePattern: '^_'` silences the lint without any runtime change. No side effects either way.

#### F-03 — Default parameter `context = ''` in `detectQuality` never exercised

- **File Path & Line Numbers:** `addon.js` (Line 134)
- **Code Snippet / Identifier:** `function detectQuality(url, context = '')`
- **Category:** Unused Default Parameter (dead default branch)
- **Reasoning & Explanation:** There are exactly two call sites, and both pass a second argument explicitly:
  - Line 277: `detectQuality(videoUrl, buttonText + ' ' + epText)`
  - Line 317: `detectQuality(videoUrl, qualityLabel + ' ' + text)`
  Therefore `context = ''` is never evaluated in the current code path; the default only exists as an API affordance for hypothetical future one-argument callers. It is not *dead code* (a single-argument call would still work), but it is currently unexercised.
- **Safety / Dependency Note:** Safe to keep (robust API) or remove (today's behavior identical). If removed, a future one-argument call would produce `combined = "<url> undefined"` — slightly worse diagnostics but no crash. Low risk either way; no runtime dependency.

#### F-04 — Default parameters `season = null, episode = null` in `getStreams` never exercised

- **File Path & Line Numbers:** `addon.js` (Line 346)
- **Code Snippet / Identifier:** `async function getStreams(type, imdbId, season = null, episode = null)`
- **Category:** Unused Default Parameter (dead default branch)
- **Reasoning & Explanation:** The only caller is the stream handler at line 391, which always passes all four arguments (`getStreams(type, imdbId, season, episode)`), where `season`/`episode` are either parsed numbers or `null` from lines 384–385. The `= null` defaults are therefore never triggered. (The `null` values themselves are load-bearing — see F-13 — but the *defaults* are not.)
- **Safety / Dependency Note:** Safe to keep; if removed, a hypothetical 2-argument call would receive `undefined` instead of `null`, and the guard at line 363 (`season !== null`) would still reject series requests but with `undefined !== null` semantics. No runtime impact today.

#### F-05 — `LOGO` / `PUBLIC_URL` constants shadowed in CLI mode (conditionally redundant)

- **File Path & Line Numbers:** `addon.js` (Lines 50–51, 65, and 413–420)
- **Code Snippet / Identifier:**
  ```js
  const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
  const LOGO = `${PUBLIC_URL}${LOGO_PATH}`;
  // ...
  logo: LOGO                       // line 65 — manifest builder
  // ...
  const origin = process.env.PUBLIC_URL ? PUBLIC_URL : `${req.protocol}://${req.get('host') || ...}`;
  const manifestWithLogo = { ...addonInterface.manifest, logo: `${origin}${LOGO_PATH}` };  // 417–420
  ```
- **Category:** Redundant / Shadowed Logic (conditionally unused constant)
- **Reasoning & Explanation:** `LOGO` is used only to seed `builder`'s manifest (line 65), and remains in `addonInterface.manifest`. When the addon runs as a server (`node addon.js`), the `/manifest.json` route (lines 413–423) always rebuilds the logo from `origin`, overwriting the `LOGO` value — so under CLI mode the computed `LOGO` (and therefore the `http://localhost:${PORT}` fallback branch of `PUBLIC_URL` on line 50) is superseded and never served. `LOGO` is only actually used when the module is consumed as a library (external wrapper calls `getRouter(require('./addon.js'))`), which is a supported but secondary mode. Additionally, the localhost fallback on line 50 duplicates the `req.get('host') || \`localhost:${PORT}\`` fallback on line 416, and the `process.env.PUBLIC_URL` test is performed twice (line 50 vs line 414).
- **Safety / Dependency Note:** Not safe to simply delete — library mode (importing the module and serving with the SDK router directly) does rely on `LOGO`/`PUBLIC_URL`. A safe refactor is to keep one source of truth, e.g. `const trimmedPublicUrl = (process.env.PUBLIC_URL || '').replace(...)` used by both the manifest builder and the route. Removing the line-50 localhost fallback changes **only** the library-mode default logo origin (currently `http://localhost:PORT`, which is unreachable for remote Stremio clients anyway). Confirm no external wrapper relies on the localhost default before changing.

---

### 2.2 Redundant Logic Branches and Guards

#### F-06 — Redundant `/i` regex flag after explicit `.toLowerCase()`

- **File Path & Line Numbers:** `addon.js` (Lines 151–152)
- **Code Snippet / Identifier:**
  ```js
  const combined = (decodedUrl + ' ' + context).toLowerCase();
  if (combined.includes('720') || /\bhd\b/i.test(combined)) return '720p';
  if (combined.includes('480') || /\bsd\b/i.test(combined)) return '480p';
  ```
- **Category:** Redundant Flag (dead regex option)
- **Reasoning & Explanation:** `combined` is guaranteed lowercase by line 145, so the `i` flag on `/\bhd\b/` and `/\bsd\b/` can never change the match outcome — it is semantically dead. Verified: `/\bhd\b/i.test('...') === /\bhd\b/.test('...')` for a lowercased input. The word-boundary `\b` itself is valuable and must be kept (it prevents CDN hashes containing "hd"/"sd" from being misread as quality markers).
- **Safety / Dependency Note:** Safe to replace with `/\bhd\b/` and `/\bsd\b/` — identical behavior for all inputs, since the tested string is always lowercased before the regex runs. No side effects.

#### F-07 — Duplicated substring filter in `extractMovieStreams` (selector + `if`)

- **File Path & Line Numbers:** `addon.js` (Lines 304–308)
- **Code Snippet / Identifier:**
  ```js
  $box.find('a[href*=".mkv"], a[href*=".mp4"], a[href*="abrtech"]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && (href.includes('.mkv') || href.includes('.mp4') || href.includes('abrtech'))) {
  ```
- **Category:** Redundant Guard / Double Filter
- **Reasoning & Explanation:** The CSS selector `a[href*=".mkv"], a[href*=".mp4"], a[href*="abrtech"]` already guarantees that only elements whose `href` contains one of those three substrings reach the callback. The `if` then re-tests the exact same three substrings — a redundant second filter. The only non-redundant part of the condition is the `href &&` null/undefined guard.
- **Safety / Dependency Note:** Safe to simplify to `if (!href) return;` (behavior identical, since the selector already filtered the substrings). Keep the selector itself. Minor DOM-iteration cost saving; no runtime side effects. (Cheerio attribute selectors are case-sensitive ASCII, matching the `includes` behavior of the same substrings.)

#### F-08 — Overly broad `href.includes('http')` fallback in `extractSeriesStreams`

- **File Path & Line Numbers:** `addon.js` (Lines 268–274)
- **Code Snippet / Identifier:**
  ```js
  // Strategy 2: Direct href
  if (!videoUrl) {
    const href = epLink.attr('href');
    if (href && (href.includes('.mkv') || href.includes('.mp4') || href.includes('http'))) {
      videoUrl = href;
    }
  }
  ```
- **Category:** Overly Broad / Effectively Dead Condition
- **Reasoning & Explanation:** The third alternative, `href.includes('http')`, accepts **any** absolute URL (e.g. `https://.../profile/`, navigation links, or a link back to the episode page), not just playable media. The movie extractor (line 308) deliberately uses the tighter `abrtech` token instead. In practice this branch is rarely the winning path: Strategy 1 (the `a[onclick]` scan for `handleDownloadClick(...)`, lines 259–266) already captures the real video URL for the site's download buttons, and the series `epLink` (`a.btn-block.btn-default`) is expected to carry `.mkv`/`.mp4` hrefs. When Strategy 1 fails, accepting a bare `http` link can push a non-video URL into the stream list, which Stremio will fail to play.
- **Safety / Dependency Note:** Recommend tightening to `href.includes('.mkv') || href.includes('.mp4') || href.includes('.m3u8') || href.includes('abrtech')` to mirror the movie logic. This removes false-positive streams, not valid ones — but it is a **behavioral** change, so validate against the live source's actual markup before removing the `http` clause. Low risk.

#### F-09 — Redundant double `parseInt` of `targetSeason` / `targetEpisode`

- **File Path & Line Numbers:** `addon.js` (Lines 193, 222; upstream parsing at 384–385)
- **Code Snippet / Identifier:**
  ```js
  const targetEpNum = parseInt(targetEpisode, 10);      // 193
  // ...
  if (parseInt(targetSeason, 10) !== seasonNum) return; // 222
  ```
  ```js
  season = parts[1] ? parseInt(parts[1], 10) : null;    // 384
  episode = parts[2] ? parseInt(parts[2], 10) : null;   // 385
  ```
- **Category:** Redundant Conversion
- **Reasoning & Explanation:** The stream handler already parses `season`/`episode` into numbers (or `null`), and `extractSeriesStreams` is only called when both are non-null (guard at line 363). Therefore `targetSeason` and `targetEpisode` are always numbers at lines 193/222, and `parseInt(number, 10)` is a meaningless round-trip (verified: `parseInt(2, 10) === 2`). The re-parse also silently converts any accidental string value, which is why it survives — but for the current call graph it is redundant.
- **Safety / Dependency Note:** Safe to replace with `const targetEpNum = targetEpisode;` and `targetSeason !== seasonNum`. Edge caveat: `parseInt(null, 10)` is `NaN`, so if the guard at line 363 were ever removed/loosened, the direct comparison changes behavior for `null` (would no longer match `seasonNum`) — currently impossible via the call graph. Trivial risk.

#### F-10 — `persianNumbers` constant re-allocated on every season iteration

- **File Path & Line Numbers:** `addon.js` (Lines 205–208)
- **Code Snippet / Identifier:**
  ```js
  $('.download-season').each((seasonIdx, seasonEl) => {
    ...
    const persianNumbers = {
      'اول': 1, 'دوم': 2, 'سوم': 3, 'چهارم': 4, 'پنجم': 5,
      'ششم': 6, 'هفتم': 7, 'هشتم': 8, 'نهم': 9, 'دهم': 10
    };
  ```
- **Category:** Redundant Allocation (per-iteration constant)
- **Reasoning & Explanation:** The object is a constant whose contents are never mutated; it is rebuilt on every `.download-season` iteration (and per request). The allocation is redundant work — the map could be a module-level `const PERSIAN_NUMBERS = {...}` (or a `switch`/array lookup).
- **Safety / Dependency Note:** Safe to hoist to module scope; no behavioral change. Pure micro-optimization (page structures typically have few season containers, so the performance impact is negligible). No side effects.

#### F-11 — Redundant template literals (no/trivial interpolation)

- **File Path & Line Numbers:** `addon.js` (Line 333: `` name: `Stream` ``; Line 322: `` title: `${quality}` ``)
- **Code Snippet / Identifier:**
  ```js
  name: `Stream`,                    // 333 — no interpolation at all
  title: `${quality}`,               // 322 — single interpolation, no surrounding text
  ```
- **Category:** Redundant Template Literal
- **Reasoning & Explanation:** Line 333 is a template literal with zero interpolations — equivalent to the plain string `'Stream'`. Line 322 interpolates only one value with no surrounding text — equivalent to `quality` (or `String(quality)`). Both are stylistic redundancies, not dead code.
- **Safety / Dependency Note:** Safe to convert to plain strings. No runtime difference (both produce identical values). No dependency concerns.

#### F-12 — `express` and `path` required at top level but used only in CLI mode

- **File Path & Line Numbers:** `addon.js` (Lines 12–13; used only at 407 and 427)
- **Code Snippet / Identifier:**
  ```js
  const express = require('express');   // 12
  const path = require('path');         // 13
  ...
  if (require.main === module) {        // 404 — CLI/server mode only
    const app = express();              // 407
    app.use('/assets/icons', express.static(path.join(...))); // 427
  }
  ```
- **Category:** Conditionally Unused Import
- **Reasoning & Explanation:** When `addon.js` is imported as a library (`require('./addon.js')` — the documented consumption mode for Stremio hosting wrappers), `require.main !== module`, the entire block at lines 404–450 is skipped, and `express`/`path` are loaded but never referenced. They are needed only for standalone serving (`node addon.js` / `npm start`). Note the contrast: `getRouter` is already lazily required *inside* the guard at line 405, so the eager `express`/`path` requires are inconsistent with the existing lazy pattern.
- **Safety / Dependency Note:** Moving `require('express')` / `require('path')` inside the `if (require.main === module)` block is safe and reduces module-load cost in library mode (and mirrors line 405). Caveats: (a) both are still declared dependencies required by `package.json` — do not remove them from `package.json`; (b) eager top-level requires fail fast on a missing dependency even in library mode, so moving them changes error timing for misconfigured installations (a `MODULE_NOT_FOUND` would surface only when the server starts). Low risk.

#### F-13 — No-op branch for series requests without season/episode (behavioral gap)

- **File Path & Line Numbers:** `addon.js` (Lines 362–368)
- **Code Snippet / Identifier:**
  ```js
  let streams = [];
  if (type === 'series' && season !== null && episode !== null) {
    streams = extractSeriesStreams($, season, episode);
  } else if (type === 'movie') {
    streams = extractMovieStreams($);
  }
  ```
- **Category:** Dead/No-Op Branch Path (low confidence — behavioral, not syntactic)
- **Reasoning & Explanation:** If `type === 'series'` arrives with `season === null` or `episode === null` (e.g. a Stremio id like `tt123` with no `:S:E` suffix, or malformed ids such as `tt123:1`), neither branch executes: `extractSeriesStreams` is skipped and no log line explains why. `streams` silently stays `[]`. This is a dead region of the state space rather than dead code — the branch **can** be reached, it just does nothing. (The handler at lines 381–389 only ever sets `season`/`episode` to numbers or `null`; Stremio normally supplies `tt…:S:E` for series, so in practice the gap is rare.)
- **Safety / Dependency Note:** Do not remove without deciding the intended behavior: adding an `else if (type === 'series')` warning/log branch would improve observability without changing responses. Removing the current `else if (type === 'movie')` would break movie handling. Low risk to leave as-is.

---

### 2.3 Redundant or Obsolete Files / Assets / Modules

#### F-14 — `assets/icons/player-fa.png` — unreferenced 3.7 MB asset

- **File Path & Line Numbers:** `assets/icons/player-fa.png` (entire file, 3,697,736 bytes)
- **Code Snippet / Identifier:** `player-fa.png`
- **Category:** Unused Asset / Obsolete Resource
- **Reasoning & Explanation:** Full-text grep across `addon.js`, `package.json`, `package-lock.json`, `README.md`, and `docs/DOCUMENTATION.md` yields zero references to `player-fa` in any code path. It is **not** referenced by the manifest (`logo: LOGO` → `/assets/icons/logo.png`, line 65), not referenced by `LOGO_PATH` (line 49), and not referenced in the HTML root route (lines 431–439). It is nevertheless reachable over HTTP because the static mount at line 427 (`app.use('/assets/icons', express.static(...))`) serves the **entire** `assets/icons` directory, exposing it at `/assets/icons/player-fa.png`. Its only textual mentions are documentation notes that it is *currently unused in the manifest* (`README.md:62–63`, `docs/DOCUMENTATION.md:99`, `docs/DOCUMENTATION.md:878`). It appears to be a leftover from an earlier UI iteration (likely a Persian-language player banner), and it dominates the repo's binary footprint (3.7 MB vs. 75 KB for `logo.png`).
- **Safety / Dependency Note:** Deletion carries two external-observability risks: (1) the file is publicly served by `express.static`, so a browser bookmark, README in another repo, cached page, or a hardcoded Stremio/staging config could request it (404 afterward); (2) the project docs currently mention it, so docs would need updating (docs/README lines noted above). No code or manifest logic depends on it. If kept, a follow-up improvement is to serve only `logo.png` explicitly (e.g. `app.use('/assets/icons/logo.png', express.static(...))`) so unused assets are not exposed.

#### F-15 — No orphaned helper modules / obsolete JS files (negative finding)

- **File Path & Line Numbers:** N/A (`addon.js` is the only JS file; no `utils/`, `helpers/`, `lib/`, `src/`, or `test/` directories)
- **Code Snippet / Identifier:** N/A
- **Category:** N/A — verified negative
- **Reasoning & Explanation:** `find` across the tree (excluding `.git` and `node_modules`) returns exactly one `.js` file (`addon.js`), plus `package.json`/`package-lock.json`, two markdown docs, and two icons. There are no unreferenced wrappers, duplicate utilities, or stale scaffold files. `knip@5` (files/exports/dependencies modes) reports zero issues. The docs are current (see §0 correction), so there is no obsolete JS-adjacent documentation to flag.
- **Safety / Dependency Note:** N/A — nothing to remove.

---

### 2.4 Minor / Cosmetic Observations (non-functional)

These do not affect runtime behavior and are listed for completeness:

- `addon.js` Lines 194–195: double blank line inside `extractSeriesStreams` — formatting only.
- `addon.js` Line 302: `qualityLabel = ... || ''` — the `|| ''` guard is technically redundant because Cheerio's `.text()` never returns `null`/`undefined` (it returns `''` for empty matches); harmless defensive style.
- `package.json` Line 16: `"author": ""` is empty while `addon.js` sets a manifest author — metadata completeness only, not dead code.
- Version drift: `package.json` `version: "1.0.0"` vs. manifest `version: "1.2.0"` — metadata consistency, not dead code.
- `package.json` name/description/keywords refer to `f2my-stremio-addon` / `f2my.top`, while the manifest/README use "Persian Streams" / `iranian-provider-media` — naming drift, not dead code.

---

## 3. Verified-Live Code (negative findings — do NOT remove)

### 3.1 All 8 top-level functions are called

| Function | Declared | Call site(s) |
|----------|----------|--------------|
| `resolveViaQuickSearch` | 76 | 350 (`getStreams`) |
| `fetchPage` | 113 | 356 (`getStreams`) |
| `detectQuality` | 134 | 277, 317 |
| `normalizeDigits` | 164 | 200, 232 |
| `isDubbed` | 177 | 279, 319 |
| `extractSeriesStreams` | 191 | 365 (`getStreams`) |
| `extractMovieStreams` | 296 | 367 (`getStreams`) |
| `getStreams` | 346 | 391 (stream handler) |

### 3.2 No dead classes, no unreachable statements, no throw

- No `class` declarations exist in the repo.
- ESLint `no-unreachable`, `no-constant-condition`, `no-constant-binary-expression`, `no-unneeded-ternary`, `no-useless-escape`, `no-regex-spaces` report zero issues.
- No `throw` statement exists in the repo; every `return` is reachable; `process.exit(1)` (line 24) is guarded by `if (!BASE_URL)` and correctly terminates the branch.

### 3.3 No unused npm dependencies

`knip@5` and manual grep confirm all five `package.json` dependencies are used:

| Dependency | Usage |
|------------|-------|
| `axios` | 28 (`axios.create`), 81/115 (`client.get`) |
| `cheerio` | 124 (`cheerio.load`) |
| `dotenv` | 17 (`require('dotenv').config()`) |
| `express` | 407 (`express()`), 427 (`express.static`) |
| `stremio-addon-sdk` | 16 (`addonBuilder`), 405 (`getRouter`) |

`package-lock.json` contains no extraneous top-level deps (root `dependencies` == `package.json` dependencies, 157 locked packages total, all transitive).

### 3.4 The module export is live, not an unreachable export

- **File Path & Line Numbers:** `addon.js` (Lines 400–401)
- Runtime verification: `require('./addon.js')` succeeds with `BASE_URL` set and yields `{ manifest, get }` (the `stremio-addon-sdk` interface). No file inside the repo imports it, but the export is the documented consumption surface for external Stremio hosting wrappers and is required for library mode. **Do not remove.** (This corrects a claim in the older report.)

### 3.5 "Looks dead but is live" — false positives worth documenting

| Identifier | Line | Why it is live |
|------------|------|----------------|
| `catalogs: []` | 62 | Required (must-be-array) manifest field of the SDK; empty catalogs are valid for a stream-only addon. |
| `resources: ['stream']`, `types`, `idPrefixes` | 59–61 | Manifest metadata consumed by the Stremio client for routing/validation (external consumer). |
| `validateStatus: status => status < 500` | 38 | Intentional: 4xx responses are resolved so callers can inspect `response.status` (lines 82, 116); 5xx/network errors still reject and are caught. |
| `timeout` / `maxRedirects` | 36–37 | Axios config read at request time. |
| `LOGO_PATH` | 49 | Used at lines 51, 65, 419. |
| `/profile/` guard | 97–100 | Live branch: the source resolves missing content to a `/profile/` URL; prevents emitting a non-content page. |
| All five `isDubbed` indicators | 181–185 | Each string is a real on-page marker family (`dubbed`, `dooble`, `دوبله`, `farsi dub`, `persian dub`). |
| Handler `.catch` | 393–396 | Defensive and reachable: `resolveViaQuickSearch`/`fetchPage` swallow their own errors, but `extractSeriesStreams`/`extractMovieStreams` (Cheerio DOM walks) can throw (e.g. malformed page) and are caught here. |
| `else` (movie log) in handler | 387–389 | Reachable for any non-series type (manifest allows `movie`/`series`, and the SDK can deliver both). |

---

## 4. Summary Table

| ID | Location | Identifier | Category | Confidence | Safe to Remove? |
|----|----------|-----------|----------|------------|-----------------|
| F-01 | `addon.js:139–143` | `catch (error)` | Unused binding (catch) | High | Yes → `catch {}`; keep the try/catch |
| F-02 | `addon.js:259,300,304,329,431` | `_` callback params | Unused Parameter | High | Yes → rename/`argsIgnorePattern`; cosmetic |
| F-03 | `addon.js:134` | `context = ''` default | Unused Default | Medium | Optional — API affordance |
| F-04 | `addon.js:346` | `season/episode = null` defaults | Unused Default | Medium | Optional — keep for robustness |
| F-05 | `addon.js:50–51,65,413–420` | `LOGO`/`PUBLIC_URL` | Shadowed/duplicated logic | Medium | Refactor only — do not delete in full |
| F-06 | `addon.js:151–152` | `/\bhd\b/i`, `/\bsd\b/i` | Redundant flag | High | Yes — remove `i` only |
| F-07 | `addon.js:304–308` | selector + `if` substring re-test | Redundant guard | Medium | Yes — keep `href &&` guard |
| F-08 | `addon.js:271` | `href.includes('http')` | Overly broad / dead clause | Medium | Tighten — behavioral change; test |
| F-09 | `addon.js:193,222` | `parseInt` re-parse | Redundant conversion | High | Yes — direct compare |
| F-10 | `addon.js:205–208` | `persianNumbers` in loop | Redundant allocation | Medium | Yes — hoist to module scope |
| F-11 | `addon.js:322,333` | `` `Stream` ``, `` `${quality}` `` | Redundant template literal | High | Yes — plain strings |
| F-12 | `addon.js:12–13` | `express`, `path` top-level requires | Conditional unused import | Medium | Optional — lazy-require inside guard |
| F-13 | `addon.js:362–368` | series w/o S/E no-op branch | No-op branch / gap | Low | Keep, or add logging branch |
| F-14 | `assets/icons/player-fa.png` | whole file | Unused asset | High | Likely yes — verify no external hot-link/docs; saves ~3.7 MB |
| F-15 | N/A | orphaned modules | Negative finding | High | Nothing to remove |

**Key takeaways:**

- The JS code is clean at the "dead code" level: no uncalled functions, no dead classes, no unreachable code, no unused dependencies, no unreachable exports. `knip` + strict ESLint + runtime import all agree.
- The worthwhile cleanups are low-risk hygiene: `player-fa.png` (3.7 MB asset), the empty `catch (error)` binding, the five `_` args, the `/i` flags, the double-parse `parseInt`, and the duplicated substring filter.
- The only findings with a *behavioral* component are F-08 (`http` fallback wideness), F-13 (silent no-op for series ids without `:S:E`), and F-05/F-12 (library-vs-CLI mode differences) — verify against the live source before touching.

---

## 5. Reproducibility

```bash
# 0. Baseline (read-only)
cd /home/user/iranian-provider-media
git status --porcelain          # expect: clean before analysis

# 1. Syntax + runtime import (library mode)
node --check addon.js
BASE_URL=http://localhost:9 node -e "console.log(Object.keys(require('./addon.js')))"  # -> [ 'manifest', 'get' ]

# 2. ESLint 9 (strict unused detection)
npx eslint@9 -c <config> addon.js    # config: no-unused-vars {vars:all,args:all,caughtErrors:all}, no-unreachable, ...

# 3. Dead files / exports / dependencies
npx knip@5                            # -> exit 0, no issues

# 4. Cross-reference
grep -nE 'resolveViaQuickSearch|fetchPage|detectQuality|normalizeDigits|isDubbed|extractSeriesStreams|extractMovieStreams|getStreams|LOGO_PATH|PUBLIC_URL|player-fa' addon.js README.md docs/DOCUMENTATION.md package.json
```

---

> **Status:** Read-only analysis completed. No source file was modified, deleted, or refactored. The only change in the working tree is this `UNUSED_CODE_REPORT.md`.
