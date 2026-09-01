# Unused / Dead / Redundant Code Report

**Repository:** `alirostami01/iranian-provider-media` (Persian Streams — Stremio Addon)
**Analysis Date:** 2026-09-01
**Commit Base:** `2e61a0f70855e8bff529e84ce2e08a175569979b` + working branch `arena/01a05b6f-iranian-provider-media`
**Analyser:** Static reading of all non-ignored files + grep cross-reference
**Scope:** `addon.js` (451 lines, single JS module), `package.json`, `assets/`, `docs/`, `README.md`

> This report **overwrites** any previous `UNUSED_CODE_REPORT.md` in the repo. The previous version referenced functions like `fetchTitleFromMeta`, `searchSite`, `slugifyTitle` that no longer exist in current `addon.js` (as of this analysis). This version reflects the **current** codebase.

---

## 0. Project Inventory

| Path | Lines / Type | Usage |
|------|--------------|-------|
| `addon.js` | 451 lines, CommonJS | Only JS source file, entry point and library export |
| `package.json` | 26 lines | 5 deps: axios, cheerio, dotenv, express, stremio-addon-sdk – all used |
| `assets/icons/logo.png` | binary | Referenced in manifest (`LOGO_PATH`, `LOGO`, `/manifest.json` route, static serve) |
| `assets/icons/player-fa.png` | binary | **Zero references** in code, docs, or manifest – see 4.1 |
| `docs/DOCUMENTATION.md` | ~600 lines, Persian | Documents deleted functions – see 4.2 |
| `README.md` | docs | Up to date |
| `.gitignore` | config | Ignores `.env`, `node_modules/` – correct |

No test suite, no build step, no transpiler, no additional helper modules. No `node_modules/` checked in.

---

## 1. Unused Variables, Constants, Parameters

### 1.1 Unused callback index parameters `_` in cheerio `.each()` loops

- **File Path & Line Numbers:** `addon.js` (Lines 259, 300, 304, 329)
- **Code Snippet / Identifier:** `(_, aEl)`, `(_, box)`, `(_, el)`, `(_, iframe)` in:
  ```js
  $epEl.find('a[onclick]').each((_, aEl) => {
  $('.download-list, .download-box, .dl-box').each((_, box) => {
    $box.find('...').each((_, el) => {
  $('iframe[src]').each((_, iframe) => {
  ```
- **Category:** Unused Parameter
- **Reasoning & Explanation:** The first argument of cheerio's `each` is the numeric index. In all four sites the index is bound to `_` and never read. The element itself (`aEl`, `box`, `el`, `iframe`) is the only used value. This is a conventional jQuery/cheerio pattern, not a bug, but a strict `no-unused-vars` lint would flag it. Same pattern appears at line 431 `app.get('/', (_, res) => {` where `_` is the unused `req` object – though `req` is intentionally ignored for the root page.
- **Safety / Dependency Note:** Safe to keep. If removed, you would change to `.each((i, el) =>` or `.each(function() { ... })` style. No runtime side effects. Renaming `_` to `_idx` or prefixing with underscore silences linters.

### 1.2 Default parameter `context = ''` in `detectQuality` never exercised

- **File Path & Line Numbers:** `addon.js` (Line 134)
- **Code Snippet / Identifier:** `function detectQuality(url, context = '')`
- **Category:** Unused Default / Dead Default Branch
- **Reasoning & Explanation:** Both call sites pass an explicit second argument:
  - Line 277: `detectQuality(videoUrl, buttonText + ' ' + epText)`
  - Line 317: `detectQuality(videoUrl, qualityLabel + ' ' + text)`
  Therefore the `= ''` default is never evaluated in current code. It is not dead code per se, but an API affordance that is currently unexercised. The function's own comment says it decodes percent-encoded URLs, so the second arg is optional by design.
- **Safety / Dependency Note:** Safe to keep – it makes the function robust if called elsewhere. Removing the default would not change behavior today, but would make future callers with single arg produce `"url undefined"` in `combined`. Low risk either way.

### 1.3 Error variable shadowing / unused in catch comment

- **File Path & Line Numbers:** `addon.js` (Lines 139-143)
- **Code Snippet / Identifier:**
  ```js
  try {
    decodedUrl = decodeURIComponent(decodedUrl);
  } catch (error) {
    // Malformed escape sequence - keep the raw URL.
  }
  ```
- **Category:** Unused Variable (catch param)
- **Reasoning & Explanation:** `error` is caught but never logged or inspected. This is intentional defensive code – malformed percent-encoding should not crash quality detection. However the variable is technically unused, which linters flag.
- **Safety / Dependency Note:** Keep as-is, or use `catch {}` (Node 10+ supports optional catch binding) to silence lint. No side effects.

---

## 2. Uncalled Functions, Methods, Dead Classes

### 2.1 No dead functions – negative finding

- **File Path & Line Numbers:** `addon.js` (Lines 76-404)
- **Code Snippet / Identifier:** All 8 top-level functions
- **Category:** N/A – Verified Live
- **Reasoning & Explanation:** Cross-referenced each function:
  - `resolveViaQuickSearch` → called at line 354 in `getStreams`
  - `fetchPage` → called at line 359 in `getStreams`
  - `detectQuality` → called at lines 277 and 317
  - `normalizeDigits` → called at lines 200 and 232
  - `isDubbed` → called at lines 279 and 319
  - `extractSeriesStreams` → called at line 366
  - `extractMovieStreams` → called at line 368
  - `getStreams` → called at line 390 inside `defineStreamHandler`
  No orphaned helpers remain (unlike older versions that had `fetchTitleFromMeta`, `slugifyTitle`, `searchSite`, `resolveViaEndpoint`).
- **Safety / Dependency Note:** N/A

### 2.2 No dead classes

- **File Path & Line Numbers:** N/A
- **Code Snippet / Identifier:** No `class` declarations in repo
- **Category:** N/A
- **Reasoning & Explanation:** Repo uses only functions and module-level constants.
- **Safety / Dependency Note:** N/A

---

## 3. Unused Imports, Requires, and Unreachable Exports

### 3.1 Conditional unused requires: `express` and `path` only used when run as CLI

- **File Path & Line Numbers:** `addon.js` (Lines 12-13, used at Lines 407 and 427)
- **Code Snippet / Identifier:**
  ```js
  const express = require('express');
  const path = require('path');
  // ...
  if (require.main === module) {
    const app = express();
    app.use('/assets/icons', express.static(path.join(__dirname, 'assets', 'icons')));
  }
  ```
- **Category:** Unused Import (in library mode) / Conditional Dependency
- **Reasoning & Explanation:** When `addon.js` is imported as a library (`require('./addon.js')`), `require.main !== module`, so the entire `if` block is skipped. In that mode `express` and `path` are loaded but never referenced. They are only used in CLI mode (`node addon.js`). This is a common Stremio addon pattern – export interface for hosting, but also runnable standalone. The `package.json` `main` is `addon.js`, so both modes are supported. Strictly, the requires are not unused, but they are **conditionally unused** depending on entry mode. The more precise optimization would be to move `require('express')` and `require('path')` inside the `if (require.main === module)` guard, matching how `getRouter` is lazily required at line 408.
- **Safety / Dependency Note:** Low risk to move inside guard – reduces cold-start memory when imported. However `express` is still a declared dependency and needed for CLI mode. Do not remove from `package.json`. Moving requires inside guard is safe, but keep top-level requires if you want to fail fast on missing dependency even in library mode.

### 3.2 No unused npm dependencies

- **File Path & Line Numbers:** `package.json` (Lines 18-24)
- **Code Snippet / Identifier:** `axios`, `cheerio`, `dotenv`, `express`, `stremio-addon-sdk`
- **Category:** N/A – Verified Live
- **Reasoning & Explanation:** All five are referenced:
  - `axios` → `client` instance line 28
  - `cheerio` → `cheerio.load` lines 124, etc.
  - `dotenv` → `require('dotenv').config()` line 17
  - `express` → lines 407, 427, 431, 429
  - `stremio-addon-sdk` → `addonBuilder` line 16 and `getRouter` line 408
- **Safety / Dependency Note:** N/A

### 3.3 Export `module.exports = addonInterface` is live

- **File Path & Line Numbers:** `addon.js` (Line 405)
- **Code Snippet / Identifier:** `module.exports = addonInterface;`
- **Category:** N/A – Live Export
- **Reasoning & Explanation:** This is the conventional public surface of a Stremio addon. While no file *inside* this repo `require()`s `addon.js`, external consumers (Stremio hosting wrappers, `stremio-addon-sdk` `serveHTTP`, tests) import it. Removing it would break library mode. Previous report flagged it as “effectively unreachable export” – that assessment is incorrect for a published addon.
- **Safety / Dependency Note:** Do not delete. It is required for SDK embedding.

---

## 4. Redundant or Obsolete Helper Files / Assets

### 4.1 `assets/icons/player-fa.png` — unreferenced static asset

- **File Path & Line Numbers:** `assets/icons/player-fa.png` (whole file)
- **Code Snippet / Identifier:** `player-fa.png`
- **Category:** Unused Asset / Obsolete Resource
- **Reasoning & Explanation:** Full-text grep across `addon.js`, `package.json`, `README.md`, `docs/DOCUMENTATION.md` yields zero hits for `player-fa`. Its sibling `logo.png` is referenced four times: `LOGO_PATH` constant (line 49), `LOGO` constant (line 51), manifest builder (line 65), manifest override route (line 419), and static middleware (line 427) which serves the *entire* `assets/icons` directory, making `player-fa.png` reachable over HTTP (`/assets/icons/player-fa.png`) but never linked. Likely leftover from earlier UI iteration.
- **Safety / Dependency Note:** Because `express.static` exposes the whole directory, external hot-linking could exist (e.g., README on another site, browser cache). Deletion is externally observable. Verify no external documentation or Stremio client hardcodes `/assets/icons/player-fa.png` before removing. Otherwise safe – no code depends on it. Saves ~few KB.

### 4.2 `docs/DOCUMENTATION.md` — obsolete documentation referencing deleted code

- **File Path & Line Numbers:** `docs/DOCUMENTATION.md` (Lines 12-300+)
- **Code Snippet / Identifier:** Sections for `fetchTitleFromMeta`, `searchSite`, `slugifyTitle`, `resolveViaEndpoint`, `contentUrlRegex`, `BASE_HOST`, `Persian_Streams`, `Persian_Streams` name
- **Category:** Redundant / Obsolete Documentation (not code, but affects maintainability)
- **Reasoning & Explanation:** The docs describe a 5-stage resolver (quick-search → endpoint → searchSite) with `slugifyTitle` and `fetchTitleFromMeta` calling `v3-cinemeta.strem.io`. Current `addon.js` implements **only** quick-search (single strategy). Functions `searchSite`, `slugifyTitle`, `fetchTitleFromMeta`, `resolveViaEndpoint`, variables `BASE_HOST`, `contentUrlRegex`, constant `Persian_Streams` do not exist in current code (verified by grep). The docs also still show line numbers like `addon.js:76-98` for `fetchTitleFromMeta` that now point to `resolveViaQuickSearch`. This is documentation drift, not dead code, but it is redundant and misleading for new contributors.
- **Safety / Dependency Note:** Safe to update docs to match current single-strategy flow. No runtime impact.

### 4.3 No obsolete JS modules

- **File Path & Line Numbers:** N/A
- **Code Snippet / Identifier:** No `utils/`, `helpers/`, `lib/` directories
- **Category:** N/A – Negative finding
- **Reasoning & Explanation:** Repo contains exactly one JS file outside `node_modules`. No orphaned helper modules, no duplicated utilities.
- **Safety / Dependency Note:** N/A

---

## 5. Dead Logic Branches, Unreachable Returns/Throws, Redundant Guards

### 5.1 Redundant `/i` flag after explicit `.toLowerCase()`

- **File Path & Line Numbers:** `addon.js` (Lines 151-152)
- **Code Snippet / Identifier:**
  ```js
  const combined = (decodedUrl + ' ' + context).toLowerCase();
  if (combined.includes('720') || /\bhd\b/i.test(combined)) return '720p';
  if (combined.includes('480') || /\bsd\b/i.test(combined)) return '480p';
  ```
- **Category:** Redundant Logic / Redundant Flag
- **Reasoning & Explanation:** `combined` is already lowercased on line 145. The regex `/\bhd\b/i` and `/\bsd\b/i` use case-insensitive flag `i` that can never change outcome because input is guaranteed lowercase. The `i` flag is dead logic. The word-boundary `\b` itself is valuable – it prevents false positives from hashes containing `hd`/`sd` substrings – but the `i` is redundant.
- **Safety / Dependency Note:** Safe to replace with `/\bhd\b/` and `/\bsd\b/`. No behavior change, just removes redundant flag. Keep `\b`.

### 5.2 Redundant guard in `extractMovieStreams` – selector already filters, then `if` repeats same condition

- **File Path & Line Numbers:** `addon.js` (Lines 304-308)
- **Code Snippet / Identifier:**
  ```js
  $box.find('a[href*=".mkv"], a[href*=".mp4"], a[href*="abrtech"]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && (href.includes('.mkv') || href.includes('.mp4') || href.includes('abrtech'))) {
  ```
- **Category:** Redundant Guard / Double Filter
- **Reasoning & Explanation:** The CSS selector `a[href*=".mkv"], a[href*=".mp4"], a[href*="abrtech"]` already guarantees `href` contains one of those substrings (modulo Cheerio's attribute selector case-sensitivity, which matches `includes` behavior for ASCII). The subsequent `if (href && (...))` re-checks exactly the same three substrings. It is not dead (it also guards against `href` being undefined), but the substring part is redundant. The `href &&` null guard is the only useful part.
- **Safety / Dependency Note:** Safe to simplify to `if (!href) return;` or keep as defensive. No behavior change. Slight DOM performance win if selector is tightened.

### 5.3 Broad `href.includes('http')` in series fallback – overly permissive, potentially dead for non-video URLs

- **File Path & Line Numbers:** `addon.js` (Lines 268-273)
- **Code Snippet / Identifier:**
  ```js
  if (!videoUrl) {
    const href = epLink.attr('href');
    if (href && (href.includes('.mkv') || href.includes('.mp4') || href.includes('http'))) {
      videoUrl = href;
    }
  }
  ```
- **Category:** Dead Logic Branch / Overly Broad Condition
- **Reasoning & Explanation:** The third alternative `href.includes('http')` matches **any** absolute URL, not just video URLs. In the movie extractor the equivalent is tightened to `abrtech`, but here `http` would accept e.g. `https://example.com/profile/` or any navigation link, which would then be pushed as a stream and fail in Stremio. In practice `epLink` is expected to be a download button, so its `href` is usually a video or `handleDownloadClick` trigger; the `http` clause rarely fires for non-video because Strategy 1 (`a[onclick]` scan) already captures the real video URL. When Strategy 1 fails, falling back to *any* http link is risky. The condition is not technically unreachable, but it is effectively dead for valid video detection and a source of false positives.
- **Safety / Dependency Note:** Recommend tightening to `href.includes('.mkv') || href.includes('.mp4') || href.includes('.m3u8') || href.includes('abrtech')` to match movie logic. Low risk – removes false-positive streams, not valid ones. Test against live site.

### 5.4 Redundant `parseInt` on already-numbered `targetSeason` / `targetEpisode`

- **File Path & Line Numbers:** `addon.js` (Lines 193, 222, 372-373)
- **Code Snippet / Identifier:**
  ```js
  const targetEpNum = parseInt(targetEpisode, 10); // line 193, targetEpisode already number from line 373
  if (parseInt(targetSeason, 10) !== seasonNum) return; // line 222, targetSeason already number
  // in handler:
  season = parts[1] ? parseInt(parts[1], 10) : null;
  episode = parts[2] ? parseInt(parts[2], 10) : null;
  ```
- **Category:** Redundant Conversion
- **Reasoning & Explanation:** The stream handler (lines 372-373) already parses `season` and `episode` to numbers (or null). `getStreams` receives numbers. Then `extractSeriesStreams` re-parses them with `parseInt`. `parseInt(number, 10)` coerces number to string then parses it back – e.g., `parseInt(2,10) === 2`. So the second parse is redundant, though not harmful except for NaN edge: `parseInt(null,10)` => NaN, but `parseInt(null)` never happens here because handler already produced null. However `parseInt(undefined)` => NaN, which would be caught.
- **Safety / Dependency Note:** Safe to replace with direct numeric comparison `targetSeason !== seasonNum` and `targetEpNum = targetEpisode`. Slightly cleaner and avoids NaN pitfalls. No behavior change for valid inputs.

### 5.5 `persianNumbers` map re-allocated inside `.each` loop

- **File Path & Line Numbers:** `addon.js` (Lines 205-208)
- **Code Snippet / Identifier:**
  ```js
  $('.download-season').each((seasonIdx, seasonEl) => {
    // ...
    const persianNumbers = {
      'اول': 1, 'دوم': 2, 'سوم': 3, 'چهارم': 4, 'پنجم': 5,
      'ششم': 6, 'هفتم': 7, 'هشتم': 8, 'نهم': 9, 'دهم': 10
    };
  ```
- **Category:** Redundant Allocation / Performance Smell (not dead)
- **Reasoning & Explanation:** The map is constant and re-created on every season element iteration. It is read on line 210 but never mutated. Hoisting it to module scope would avoid repeated allocation. Not dead code, but redundant work.
- **Safety / Dependency Note:** Safe to hoist to top-level `const PERSIAN_NUMBERS = {...}`. No side effects.

### 5.6 Defensive `req.get('host') || localhost` fallback – effectively unreachable under HTTP/1.1

- **File Path & Line Numbers:** `addon.js` (Line 415)
- **Code Snippet / Identifier:** `` `${req.protocol}://${req.get('host') || `localhost:${PORT}`}` ``
- **Category:** Dead Defensive Branch (practically unreachable)
- **Reasoning & Explanation:** Express's `req.get('host')` reads the `Host` header. Under HTTP/1.1, `Host` is mandatory. Node's HTTP parser will still provide it for any real Stremio client, browser, or curl request. The fallback `localhost:PORT` only fires for malformed HTTP/1.0 requests without Host, which never occur in this addon's usage. Similarly `req.protocol` is always set by Express (defaults to `http` if not TLS), so no fallback needed. This is cheap defensive code, not harmful.
- **Safety / Dependency Note:** Keep for robustness, or remove fallback – no runtime impact. Flagged for completeness.

### 5.7 `PUBLIC_URL` env check duplicated in manifest route

- **File Path & Line Numbers:** `addon.js` (Lines 50, 414-415)
- **Code Snippet / Identifier:**
  ```js
  const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
  // ...
  const origin = process.env.PUBLIC_URL ? PUBLIC_URL : `${req.protocol}://${req.get('host')}`;
  ```
- **Category:** Redundant Logic / Partial Duplication
- **Reasoning & Explanation:** `PUBLIC_URL` already encapsulates `process.env.PUBLIC_URL || localhost`. The ternary `process.env.PUBLIC_URL ? PUBLIC_URL : req-derived` re-checks the env var to decide whether to use request host. The intent is: if env var is set, use it (absolute, trimmed); else derive from request. The duplication is not dead, but the intermediate constant `PUBLIC_URL` is partially redundant – it could be just the trimmed env var, not the fallback. Current logic works: when env var unset, `PUBLIC_URL` = `http://localhost:PORT`, but `origin` becomes request host, so `PUBLIC_URL` fallback is ignored in HTTP mode, which is correct. The constant is still used for `LOGO` (line 51) which is the fallback for imported module mode. So not dead, but the dual meaning (sometimes localhost, sometimes trimmed env) is confusing.
- **Safety / Dependency Note:** Could be clarified by splitting into `TRIMMED_PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(...)` and using that for the ternary. No behavior change, just clarity.

### 5.8 No unreachable `return`/`throw`

- **File Path & Line Numbers:** N/A
- **Code Snippet / Identifier:** All `return` statements reachable
- **Category:** N/A – Negative finding
- **Reasoning & Explanation:** Scanned for code after `return`, `throw`, `process.exit`. No statements after `return` in same block, no `throw` at all. `process.exit(1)` at line 24 is guarded by `if (!BASE_URL)` and terminates process – no code after it in that branch.
- **Safety / Dependency Note:** N/A

---

## 6. Summary Table

| # | Location | Identifier | Category | Confidence | Safe to Remove? |
|---|----------|------------|----------|------------|-----------------|
| 1.1 | `addon.js:259,300,304,329,431` | `_` index params | Unused Parameter | High | Yes – rename to `_idx` or ignore, no behavior change |
| 1.2 | `addon.js:134` | `context = ''` default | Unused Default | Medium | Keep – useful API affordance |
| 1.3 | `addon.js:141` | `catch (error)` | Unused Variable | Medium | Replace with `catch {}` if linting |
| 3.1 | `addon.js:12-13` | `express`, `path` top-level requires | Conditional Unused Import | Medium | Move inside `if (require.main===module)` guard – safe, minor optimization |
| 4.1 | `assets/icons/player-fa.png` | whole file | Unused Asset | High | Likely safe – confirm no external hot-link |
| 4.2 | `docs/DOCUMENTATION.md` | `fetchTitleFromMeta`, `searchSite`, `slugifyTitle`, `resolveViaEndpoint` | Obsolete Docs | High | Update docs, not code |
| 5.1 | `addon.js:151-152` | `/\bhd\b/i`, `/\bsd\b/i` | Redundant Flag | High | Remove `i` flag – safe |
| 5.2 | `addon.js:304-308` | `a[href*=".mkv"]` + `if (href.includes...)` | Redundant Guard | Medium | Simplify to null guard – safe |
| 5.3 | `addon.js:270` | `href.includes('http')` | Overly Broad / Dead Branch | Medium | Tighten to video extensions – behavior improvement |
| 5.4 | `addon.js:193,222` | `parseInt(targetSeason)` double parse | Redundant Conversion | High | Replace with direct compare – safe |
| 5.5 | `addon.js:205-208` | `persianNumbers` inside loop | Redundant Allocation | Medium | Hoist to module scope – safe, perf win |
| 5.6 | `addon.js:415` | `req.get('host') || localhost` | Dead Defensive Branch | Low | Keep or remove – no impact |
| 5.7 | `addon.js:50,414` | `PUBLIC_URL` dual use | Redundant Logic | Low | Refactor for clarity – safe |

**Key Takeaways:**
- **No dead functions, no unused npm dependencies, no orphaned JS modules.** The codebase is lean – only one source file.
- **Highest-value cleanup:** `assets/icons/player-fa.png` (unused asset) and `docs/DOCUMENTATION.md` drift. Both are non-code but affect repo hygiene.
- **No blocking network calls are dead** – unlike previous report's `fetchTitleFromMeta`, current code only calls quick-search + page fetch, both necessary.
- **No security-relevant dead code** that would hide vulnerabilities.
- **All regexes and quality detection branches are live**, though `/i` flag is redundant after `toLowerCase()`.

---

## 7. Recommendations (Read-Only, No Code Changes Made)

1. **Delete or document `player-fa.png`** – if not needed, remove; if needed for future player UI, add reference in README or manifest.
2. **Rewrite `docs/DOCUMENTATION.md`** to reflect current single-strategy resolver. Remove sections for deleted functions, update line numbers, update flow diagram.
3. **Hoist `persianNumbers` to module scope** and rename to `PERSIAN_SEASON_MAP` for clarity and to avoid per-iteration allocation.
4. **Tighten `href.includes('http')`** to specific video extensions (`mkv`, `mp4`, `m3u8`, `abrtech`) to prevent false-positive streams.
5. **Simplify redundant guards** in movie extractor and remove `/i` flag from lowercased regexes – low-risk lint cleanup.
6. **Move `express` and `path` requires inside `if (require.main === module)`** to reduce import cost when used as library, matching existing lazy `getRouter` pattern.
7. **Optional:** Replace `catch (error)` with `catch {}` where error is unused, and rename unused `_` params to `_index` or use `_` prefix convention per ESLint config.

> No source files were modified in producing this report. This document is the only file added/overwritten per task instructions.
