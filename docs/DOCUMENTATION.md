# Persian Streams Stremio Addon - Technical Documentation

Persian Streams is an unofficial Stremio addon that resolves movie and series streams from an Iranian media provider configured through `BASE_URL`. The addon receives Stremio stream requests by IMDb ID, resolves the matching source page through the provider quick-search API, scrapes stream links from the page, enriches each stream with release metadata, and returns a Stremio-compatible `streams` response.

> This project does not host media. It only extracts links from the configured provider and exposes them to Stremio.

---

## Table of Contents

- [Runtime Requirements](#runtime-requirements)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Addon Manifest](#addon-manifest)
- [HTTP Routes](#http-routes)
- [Request Flow](#request-flow)
- [Core Modules and Functions](#core-modules-and-functions)
  - [Metadata and Page Resolution](#metadata-and-page-resolution)
  - [Quality and Release Metadata](#quality-and-release-metadata)
  - [Dubbed and Subtitle Detection](#dubbed-and-subtitle-detection)
  - [Modern Series Extraction](#modern-series-extraction)
  - [Legacy Series Directory Extraction](#legacy-series-directory-extraction)
  - [Movie Extraction](#movie-extraction)
  - [Stremio Stream Handler](#stremio-stream-handler)
  - [HTTP Server](#http-server)
- [Stream Object Format](#stream-object-format)
- [Supported Provider Layouts](#supported-provider-layouts)
- [Error Handling](#error-handling)
- [Validation](#validation)
- [Known Limitations](#known-limitations)

---

## Runtime Requirements

- Node.js 18 or newer is recommended.
- npm.
- A Stremio client that supports external addons.
- Network access to:
  - the configured media provider (`BASE_URL`),
  - Stremio Cinemeta (`https://v3-cinemeta.strem.io`),
  - season directory hosts when the provider links to legacy directory indexes.

Install dependencies:

```bash
npm install
```

Run the addon:

```bash
npm start
```

Development mode:

```bash
npm run dev
```

---

## Environment Variables

The application loads environment variables with `dotenv`.

| Variable | Required | Default | Description |
|---|---:|---|---|
| `BASE_URL` | Yes | None | Base URL of the Iranian provider. Example: `https://www.f2my.top` |
| `PORT` | No | `8000` | HTTP port for the addon server |

If `BASE_URL` is missing, the process exits immediately with an explanatory error.

Example `.env`:

```env
PORT=8000
BASE_URL=https://www.f2my.top
```

---

## Project Structure

```text
.
├── addon.js                 # Main addon, scraper, stream handler, and HTTP server
├── package.json             # npm scripts and dependencies
├── package-lock.json
├── assets/
│   └── icons/
│       ├── logo.png
│       └── player-fa.png
└── docs/
    └── DOCUMENTATION.md
```

---

## Addon Manifest

The manifest is created with `addonBuilder` from `stremio-addon-sdk`.

Important manifest fields:

| Field | Value / Behavior |
|---|---|
| `id` | `org.alirostami.streams.persian` |
| `name` | `Persian Streams` |
| `version` | `1.2.0` |
| `resources` | `['stream']` |
| `types` | `['movie', 'series']` |
| `idPrefixes` | `['tt']` for IMDb IDs |
| `catalogs` | Empty; this addon only provides streams |
| `logo` | Initially relative (`/assets/icons/logo.png`), then converted to an absolute URL by the custom `/manifest.json` route |

Stremio requires image URLs in manifests to be absolute, so the Express server overrides `/manifest.json` and injects the request host into the logo URL.

---

## HTTP Routes

| Route | Description |
|---|---|
| `GET /` | Simple HTML landing page with local install link |
| `GET /manifest.json` | Stremio addon manifest with absolute logo URL |
| `GET /assets/icons/logo.png` | Static addon logo |
| `GET /stream/movie/{imdbId}.json` | Movie stream request handled by Stremio SDK router |
| `GET /stream/series/{imdbId}:{season}:{episode}.json` | Series episode stream request handled by Stremio SDK router |

There is no custom `/health` route in the current code.

---

## Request Flow

```text
Stremio selects a movie or series episode
        │
        ▼
defineStreamHandler(args)
        │
        ├─ parse type and id
        ├─ for series: parse imdbId, season, episode
        ▼
getStreams(type, imdbId, season, episode)
        │
        ├─ fetchTitleFromMeta(type, imdbId)
        │     └─ reads title/year from Cinemeta; currently not used for fallback search
        │
        ├─ resolveViaQuickSearch(imdbId)
        │     └─ queries provider /quick-search by IMDb ID
        │
        ├─ fetchPage(contentUrl)
        │     └─ loads provider HTML into Cheerio
        │
        └─ extraction
              ├─ movie  -> extractMovieStreams($)
              └─ series -> await extractSeriesStreams($, season, episode)
                         ├─ modern page extraction
                         └─ legacy season directory extraction when modern extraction finds nothing
```

The final result is returned to Stremio as:

```js
{ streams: [...] }
```

---

## Core Modules and Functions

### Metadata and Page Resolution

#### `fetchTitleFromMeta(type, imdbId)`

Fetches title and year from Stremio Cinemeta:

```text
https://v3-cinemeta.strem.io/meta/{type}/{imdbId}.json
```

Returns:

```js
{ name: 'Title', year: 2024 }
```

or `null` on failure.

The current implementation still calls this function, but stream page resolution primarily relies on the provider `quick-search` endpoint and IMDb ID matching.

#### `resolveViaQuickSearch(imdbId)`

Queries the provider endpoint:

```text
/quick-search?q={imdbId}&sort=modified_at%3Adesc
```

Expected response shape is an array of objects containing at least:

```js
{
  imdb_id: 'tt...',
  url: 'https://...'
}
```

The function:

1. Finds the item whose `imdb_id` exactly matches the requested IMDb ID.
2. Converts relative URLs to absolute URLs using `BASE_URL`.
3. Rejects `/profile/` URLs as invalid/not-found results.
4. Returns the content page URL or `null`.

#### `fetchPage(url)`

Fetches HTML through the configured Axios `client`, validates status `200`, and returns a Cheerio root object.

Returns `null` on fetch failure.

---

### Quality and Release Metadata

The addon tries to preserve the provider's exact release/quality label whenever possible. For example:

```text
کیفیت : WEB-DL 4K 2160p 10bit HDR
```

is converted to:

```text
WEB-DL 4K 2160p 10bit HDR
```

#### `detectQuality(url, context)`

Fallback quality detector used when no explicit provider quality label is available.

Recognized values include:

- `4K`, `2160`, `UHD` -> `4K`
- `1080`, `Full HD`, `FHD` -> `1080p`
- `720`, `HD` -> `720p`
- `480`, `SD` -> `480p`
- `360` -> `360p`
- `?quality=...` URL parameter

Returns `Unknown` when nothing matches.

#### `cleanMetadataValue(value)`

Cleans extracted metadata by:

- replacing `&nbsp;`,
- removing Persian RTL/LTR zero-width marks,
- trimming separators such as `:`, `؛`, `|`, `-`,
- normalizing whitespace.

#### `extractLabeledValue(text, labels)`

Extracts the value after one of the given labels.

Examples:

```text
کیفیت : WEB-DL 4K 2160p 10bit HDR -> WEB-DL 4K 2160p 10bit HDR
انکودر : PSA                      -> PSA
```

The parser stops at known boundary labels to avoid mixing unrelated metadata into quality or encoder values. Boundary labels include:

- quality/encoder labels,
- size, language, format, resolution, duration,
- season/episode/download labels,
- subtitle labels,
- rating markers such as `میانگین`, `امتیاز`, `IMDb`, `Rating`,
- genre, year, country, director, actors, status, network, story/plot.

This prevents values like `میانگین امتیاز` from being appended to stream names or titles.

#### `extractReleaseInfoFromElement($, element)`

Reads a DOM fragment and returns:

```js
{
  quality: string | null,
  encoder: string | null,
  subtitleStatus: 'persian' | 'none' | null
}
```

It combines explicit labeled metadata and subtitle status detection.

#### `extractReleaseInfoNearElement($, element, maxDepth = 4)`

Walks from a download row/link up through a few parent nodes and merges metadata fields independently.

This is important because provider pages may place:

- quality on the row,
- encoder on a parent wrapper,
- subtitle information on another nearby wrapper.

The function keeps walking until all available fields are found or the maximum depth is reached.

#### `extractReleaseFormatFromFilename(filename)`

Used by legacy season-directory pages where each file is listed by filename only.

Example:

```text
Louie.S01E01.1080p.WEB-DL.x265.PSA.mkv
```

produces:

```text
1080p WEB-DL x265
```

The function extracts known release/format tokens such as:

- resolution: `2160p`, `1080p`, `720p`, `480p`, `360p`, `4K`, `UHD`,
- source: `WEB-DL`, `WEBRip`, `BluRay`, `BRRip`, `HDRip`, `DVDRip`, `HDTV`,
- codec: `x264`, `x265`, `H264`, `H265`, `HEVC`, `AVC`,
- video flags: `10bit`, `8bit`, `HDR`, `DV`, `DolbyVision`,
- platform tags: `NF`, `AMZN`, `DSNP`, `HULU`, `ATVP`, `MAX`.

Encoder/group names such as `PSA` are intentionally not included in `name`.

#### `buildStreamName(quality, dubbedLabel, subtitleStatus)`

Builds the Stremio stream `name` field.

The `name` field intentionally contains only:

1. release/format quality,
2. dubbed status when detected,
3. Persian subtitle availability when detected.

Encoder metadata is not included in `name`; it is only displayed in `title`.

---

### Dubbed and Subtitle Detection

#### `isDubbed(text)`

Detects Persian dubbed releases using indicators such as:

- `dubbed`,
- `dooble`,
- `دوبله`,
- `farsi dub`,
- `persian dub`.

When detected, ` • دوبله` is appended to the stream `name`.

#### `detectPersianSubtitleStatus(text)`

Detects whether a stream or page explicitly says Persian subtitles are available or not.

Positive examples:

- `زیرنویس فارسی`,
- `با زیرنویس`,
- `دارای زیرنویس`,
- `زیرنویس فارسی : دارد`,
- `زیرنویس چسبیده`,
- `Persian Subtitles`,
- `Farsi Subtitles`,
- `HardSub`, `Hardcoded Subtitles`, `Subbed`.

Negative examples:

- `بدون زیرنویس`,
- `فاقد زیرنویس`,
- `زیرنویس فارسی : ندارد`,
- `No Persian Subtitles`,
- `Without Persian Subtitles`.

Returns:

```js
'persian' | 'none' | null
```

#### `formatSubtitleLabel(status)`

Maps subtitle status to display labels:

| Status | Label |
|---|---|
| `persian` | `زیرنویس فارسی` |
| `none` | `بدون زیرنویس فارسی` |
| `null` | no label |

---

### Modern Series Extraction

#### `extractSeriesStreams($, targetSeason, targetEpisode)`

Extracts series streams from the current provider box layout.

This function is asynchronous because it may fall back to legacy directory scraping.

Modern extraction uses these selectors:

- seasons: `.download-season`,
- season header: `button[data-bs-toggle="collapse"]`,
- episode rows: `.series-downloaditems .d-flex`,
- primary episode link: `a.btn-block.btn-default`.

Season detection:

- defaults to the `.download-season` index,
- supports Persian ordinal words from `اول` to `دهم`,
- supports text patterns like `season 2` or `فصل 2`.

Episode detection:

- defaults to the row index,
- supports `قسمت 5`, `episode 5`, and `ep 5`,
- supports fallback to `?episode=` URL parameter.

Video URL extraction strategies:

1. `onclick` handler with `handleDownloadClick('URL')`,
2. direct `href` containing `.mkv`, `.mp4`, or any HTTP URL,
3. sibling `a[onclick]` elements.

For every matching stream, the function builds:

```js
{
  name: '<quality> [• دوبله] [• subtitle label]',
  title: 'S{season}E{episode} - <quality> [• encoder: ...] [• subtitle label]',
  url: '<video URL>'
}
```

If the modern selector path returns no stream, the function calls `extractLegacySeriesStreams`.

---

### Legacy Series Directory Extraction

Some older series pages do not expose episode download rows. Instead, they only contain links to season directories, for example:

```text
دانلود فصل 1 -> https://.../Series/Louie/S01/
دانلود فصل 2 -> https://.../Series/Louie/S02/
```

The `Louie` page is an example of this layout.

#### `extractSeasonNumberFromLegacyLink(text, href)`

Determines the season number from link text or URL.

Supported examples:

- `دانلود فصل 1`,
- `Download Season 1`,
- `/S01/`, `/S1/`.

Persian and Arabic digits are normalized with `toEnglishDigits`.

#### `extractEpisodeMatchFromFilename(filename, targetSeason, targetEpisode)`

Checks whether a directory file belongs to the requested episode.

Supported filename patterns:

- `S01E01`, `S1E1`,
- `1x01`,
- episode-only fallback like `E01` when the directory already represents the requested season.

#### `extractStreamsFromSeasonDirectory(seasonUrl, targetSeason, targetEpisode, pageSubtitleStatus)`

Fetches a season directory index and extracts all media files for the requested episode.

Recognized file extensions:

- `.mkv`,
- `.mp4`,
- `.m3u8`,
- `.avi`.

For every matching file, it:

1. resolves relative file links against the final directory URL,
2. extracts release format from the filename,
3. detects dubbed status from filename/URL,
4. detects subtitle status from filename or falls back to page-level subtitle status,
5. returns one stream per file.

Example directory entries:

```text
Louie.S01E01.720p.BluRay.PaHe.mkv
Louie.S01E01.1080p.WEB-DL.x265.PSA.mkv
```

Example stream output:

```json
[
  {
    "name": "720p BluRay",
    "title": "S1E1 - 720p BluRay",
    "url": "https://cdn.example/Series/Louie/S01/Louie.S01E01.720p.BluRay.PaHe.mkv"
  },
  {
    "name": "1080p WEB-DL x265",
    "title": "S1E1 - 1080p WEB-DL x265",
    "url": "https://cdn.example/Series/Louie/S01/Louie.S01E01.1080p.WEB-DL.x265.PSA.mkv"
  }
]
```

#### `extractLegacySeriesStreams($, targetSeason, targetEpisode)`

Scans the provider page for season-directory links, selects the link matching the requested season, and delegates to `extractStreamsFromSeasonDirectory`.

This fallback is only used when modern `.download-season` extraction finds no streams.

---

### Movie Extraction

#### `extractMovieStreams($)`

Extracts movie streams from these containers:

- `.download-list`,
- `.download-box`,
- `.dl-box`.

For each container, it scans links matching:

- `a[href*=".mkv"]`,
- `a[href*=".mp4"]`,
- `a[href*="http"]`.

A link is accepted when its `href` contains `.mkv`, `.mp4`, or `abrtech`.

The actual stream URL may come from:

1. direct `href`,
2. `handleDownloadClick('URL')` in the `onclick` handler.

Metadata behavior:

- quality is read from nearby labeled metadata first,
- then from the download box,
- then from `detectQuality` as a fallback,
- encoder is displayed in `title` only,
- subtitle status can be read from the row, box, or page-level fallback.

Embedded streams:

The function also scans `iframe[src]` and accepts iframe URLs containing `.mp4` or `.m3u8`.

---

### Stremio Stream Handler

The stream handler is registered with:

```js
builder.defineStreamHandler((args) => { ... })
```

Input examples:

Movie:

```js
{
  type: 'movie',
  id: 'tt1234567'
}
```

Series episode:

```js
{
  type: 'series',
  id: 'tt1234567:1:2'
}
```

For series, the handler splits `id` by `:`:

```text
imdbId:season:episode
```

It calls `getStreams(...)` and returns:

```js
{ streams }
```

If any error occurs, the handler logs it and returns an empty stream list to Stremio.

---

### HTTP Server

The server only starts when `addon.js` is executed directly:

```js
if (require.main === module) { ... }
```

It uses Express and an HTTP server created with `http.createServer(app)`.

Server behavior:

- registers a custom `/manifest.json` route before the SDK router,
- mounts the Stremio SDK router with `getRouter(addonInterface)`,
- serves static logo assets from `/assets/icons`,
- serves a basic landing page at `/`,
- handles `EADDRINUSE` gracefully.

When the configured port is already in use, the server prints:

```text
Port 8000 is already in use.
Stop the other process using this port, or start the addon with another port:
PORT=8001 npm start
```

and exits with status code `1`.

---

## Stream Object Format

The addon returns Stremio stream objects with this shape:

```js
{
  name: string,
  title: string,
  url: string
}
```

### `name`

The `name` field is intentionally concise. It contains only:

- release format / quality,
- dubbed status when detected,
- Persian subtitle status when detected.

Examples:

```text
WEB-DL 4K 2160p 10bit HDR
WEB-DL 1080p • دوبله
WEB-DL 720p • زیرنویس فارسی
WEB-DL 1080p • بدون زیرنویس فارسی
```

Encoder information is not included in `name`.

### `title`

The `title` field can contain additional details:

- season/episode for series,
- release format / quality,
- encoder metadata,
- subtitle status.

Examples:

```text
S1E2 - WEB-DL 4K 2160p 10bit HDR • encoder: PSA • زیرنویس فارسی
WEB-DL 1080p • encoder: PSA • بدون زیرنویس فارسی
```

---

## Supported Provider Layouts

### 1. Modern series download boxes

Expected structure:

```text
.download-season
  button[data-bs-toggle="collapse"]
  .series-downloaditems .d-flex
    a.btn-block.btn-default
    a[onclick]
```

This layout supports per-episode metadata such as quality, encoder, dubbed status, and subtitle availability.

### 2. Legacy series season directories

Expected structure:

```text
Provider page
  a[href=".../S01/"]  دانلود فصل 1

Season directory index
  Series.S01E01.720p.BluRay.Group.mkv
  Series.S01E01.1080p.WEB-DL.x265.Group.mkv
```

This layout allows multiple files/formats for the same episode to be exposed as separate Stremio streams.

### 3. Movie download boxes

Expected structure:

```text
.download-list | .download-box | .dl-box
  a[href="..."]
  optional onclick="handleDownloadClick('...')"
```

### 4. Embedded movie players

The movie extractor also supports direct iframe sources ending in or containing:

- `.mp4`,
- `.m3u8`.

---

## Error Handling

| Situation | Behavior |
|---|---|
| Missing `BASE_URL` | Logs error and exits immediately |
| Cinemeta failure | Logs the failure and continues with `null` metadata |
| Quick-search failure | Logs failure and returns no streams |
| Content page fetch failure | Logs failure and returns no streams |
| Extraction error inside Stremio handler | Logs error and returns `{ streams: [] }` |
| Season directory fetch failure | Logs failure and continues with no legacy streams |
| Port already in use | Logs a friendly `EADDRINUSE` message and exits |

---

## Validation

Syntax check:

```bash
node --check addon.js
```

Manual runtime check:

```bash
BASE_URL=https://www.f2my.top PORT=8000 npm start
```

Manifest check:

```bash
curl http://localhost:8000/manifest.json
```

Example stream endpoints:

```text
http://localhost:8000/stream/movie/tt1234567.json
http://localhost:8000/stream/series/tt1492966:1:1.json
```

---

## Known Limitations

- The addon currently relies on the provider `quick-search` endpoint for page resolution. Title/slug fallback search is not implemented in the current code path.
- Extraction depends on the provider HTML structure and directory index format. Selector changes on the provider side may require code updates.
- Legacy directory extraction can only list files if the season directory is publicly browsable as an HTML index.
- Subtitle status is heuristic. It is displayed only when the page, row, or filename contains recognizable Persian/English subtitle phrases.
- Encoder names are preserved in `title` when explicit labels exist, but legacy filename parsing intentionally keeps `name` focused on format/quality and does not expose release group names as encoder metadata.
