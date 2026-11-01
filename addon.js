/**
 * Persian Streams - Stremio Addon
 * 
 * Scrapes streaming links from the source configured via BASE_URL (in .env)
 * for movies and TV series. This is an Iranian source providing content with
 * Persian subtitles.
 * 
 * The site uses title-based URLs (e.g., /series/house-of-the-dragon/)
 * so we fetch the title from Stremio's metadata service and convert it to a slug.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { addonBuilder } = require('stremio-addon-sdk');

// Resolve BASE_URL from multiple sources (Node env, Worker env, global fallback)
// The original code exited if not set, but for Worker compatibility and tests we fallback
let BASE_URL = process.env.BASE_URL;
if (!BASE_URL && typeof globalThis !== 'undefined' && globalThis.BASE_URL) {
  BASE_URL = globalThis.BASE_URL;
}
if (!BASE_URL) {
  // Fallback to the production default used in wrangler.jsonc
  BASE_URL = 'https://film2med.top';
  console.warn(`[CONFIG] BASE_URL not set, falling back to ${BASE_URL}`);
}

// Diagnostic helper - clean, maintainable logging
function debugLog(scope, message, data = {}) {
  const hasData = data && typeof data === 'object' && Object.keys(data).length > 0;
  if (hasData) {
    console.log(`[${scope}] ${message}`, data);
  } else {
    console.log(`[${scope}] ${message}`);
  }
}

function verboseLog(scope, message, data = {}) {
  if (process.env.DEBUG_STREAMS === 'true' || process.env.DEBUG_STREAMS === '1') {
    debugLog(scope, message, data);
  }
}

function sanitizeUrlForLog(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    // Avoid logging tokens - truncate query if too long
    if (u.search && u.search.length > 80) {
      return u.origin + u.pathname + '?[truncated]';
    }
    return url;
  } catch (_) {
    return String(url).slice(0, 200);
  }
}

// Sandbox/proxied environments: axios does not read proxy env vars on its own.
function axiosProxyFor(targetUrl) {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const raw = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
  if (!raw) return undefined;
  let targetHost = '';
  try { targetHost = new URL(targetUrl).hostname; } catch { return undefined; }
  const noProxy = (process.env.no_proxy || process.env.NO_PROXY || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (noProxy.some((entry) => entry === '*' || targetHost === entry || targetHost.endsWith('.' + entry))) return undefined;
  try {
    const u = new URL(raw);
    if (!u.hostname || !u.port) return undefined;
    const proxy = { protocol: (u.protocol || 'http:').replace(':', ''), host: u.hostname, port: Number(u.port) };
    if (u.username) proxy.auth = { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
    return proxy;
  } catch { return undefined; }
}

const PROXY = axiosProxyFor(BASE_URL);

// Create axios instance with proper headers
let client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  },
  timeout: 15000,
  maxRedirects: 5,
  validateStatus: status => status < 500,
  ...(PROXY ? { proxy: PROXY } : {}),
});

function setBaseUrl(newBaseUrl) {
  if (newBaseUrl && newBaseUrl !== BASE_URL) {
    BASE_URL = newBaseUrl;
    const proxy = axiosProxyFor(BASE_URL);
    if (client && client.defaults) {
      client.defaults.baseURL = BASE_URL;
      if (proxy) {
        client.defaults.proxy = proxy;
      }
    }
    debugLog('CONFIG', `BASE_URL updated to ${BASE_URL}`);
  }
}

function getBaseUrl() {
  return BASE_URL;
}

// Logo is served as a static file by the HTTP server (see serveHTTP static
// option below), so it is referenced by a URL instead of being embedded.
const LOGO = '/assets/icons/logo.png';

// Initialize addon builder with manifest
const manifest = {
  id: 'org.alirostami.streams.persian',
  name: 'Persian Streams',
  description: 'Fast streaming links from Iranian media providers with Persian subtitles and audio.\n\nAuthor: Ali Rostami  \nWebsite: alirostami.com/support \nGitHub: https://github.com/alirostami01/Persian-Streams/',
  version: '1.7.1',
  resources: ['stream', 'catalog', 'meta'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [
    {
      type: 'movie',
      id: 'persian-streams-movies',
      name: 'Persian Streams',
      extra: [
        { name: 'search' },
        { name: 'skip' }
      ]
    },
    {
      type: 'series',
      id: 'persian-streams-series',
      name: 'Persian Streams',
      extra: [
        { name: 'search' },
        { name: 'skip' }
      ]
    }
  ],
  contactEmail: 'rostami.ali@gmail.com',
  author: 'Ali Rostami rostami.ali@gmail.com',
  logo: LOGO
};

const builder = new addonBuilder(manifest);

/**
 * Fetch metadata title from Stremio's meta endpoint using IMDB ID
 */
async function fetchTitleFromMeta(type, imdbId) {
  try {
    // Stremio meta endpoint format: https://v3-cinemeta.strem.io/meta/<type>/<imdbId>.json
    const metaUrl = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
    const response = await axios.get(metaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 5000
    });

    if (response.data && response.data.meta && response.data.meta.name) {
      return {
        name: response.data.meta.name,
        year: response.data.meta.year || null
      };
    }
    return null;
  } catch (error) {
    console.log(`Failed to fetch metadata for ${imdbId}: ${error.message}`);
    return null;
  }
}

let PUBLIC_URL = (typeof process !== 'undefined' && process.env && process.env.PUBLIC_URL) ||
  (typeof process !== 'undefined' && process.env && process.env.PORT ? `http://localhost:${process.env.PORT}` : 'https://stremio.alirostami.com');

function setPublicUrl(url) {
  if (url) {
    PUBLIC_URL = String(url).replace(/\/$/, '');
  }
}

function getPublicUrl() {
  return PUBLIC_URL;
}

/**
 * Proxies an image URL through our addon endpoint with aggressive caching headers.
 */
function proxyImageUrl(rawUrl, proxyBaseUrl = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return trimmed;
  // If already proxied, avoid double proxying
  if (
    trimmed.includes('/streams/thumb') ||
    trimmed.includes('/streams/poster') ||
    trimmed.includes('/thumb?') ||
    trimmed.includes('/poster?')
  ) {
    return trimmed;
  }
  const base = (proxyBaseUrl || PUBLIC_URL || 'https://stremio.alirostami.com').replace(/\/$/, '');
  const prefix = base.endsWith('/streams') ? base : `${base}/streams`;
  return `${prefix}/thumb?url=${encodeURIComponent(trimmed)}`;
}

// In-memory cache for metadata responses to avoid repeated network roundtrips
const metaCache = new Map();
const META_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_META_CACHE_SIZE = 200;

// In-memory cache for official IMDb posters (Amazon CloudFront CDN)
const imdbPosterCache = new Map();
const IMDB_POSTER_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_IMDB_POSTER_CACHE_SIZE = 1000;

/**
 * Fetch official high-res poster from IMDb suggestion API (m.media-amazon.com)
 */
async function fetchImdbPoster(imdbId) {
  if (!imdbId || typeof imdbId !== 'string' || !imdbId.startsWith('tt')) return null;

  const cached = imdbPosterCache.get(imdbId);
  if (cached && (Date.now() - cached.timestamp < IMDB_POSTER_CACHE_TTL)) {
    return cached.url;
  }

  try {
    const url = `https://v3.sg.media-imdb.com/suggestion/t/${imdbId}.json`;
    let data = null;
    if (typeof fetch === 'function') {
      try {
        const resp = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (resp.ok) data = await resp.json();
      } catch (_) {}
    }
    if (!data) {
      const resp = await axios.get(url, {
        timeout: 4000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      data = resp.data;
    }

    if (data && Array.isArray(data.d)) {
      const match = data.d.find(item => item.id === imdbId) || data.d[0];
      if (match && match.i && match.i.imageUrl) {
        const posterUrl = match.i.imageUrl;
        if (imdbPosterCache.size >= MAX_IMDB_POSTER_CACHE_SIZE) {
          const firstKey = imdbPosterCache.keys().next().value;
          imdbPosterCache.delete(firstKey);
        }
        imdbPosterCache.set(imdbId, { timestamp: Date.now(), url: posterUrl });
        return posterUrl;
      }
    }
  } catch (err) {
    verboseLog('IMDB_POSTER', `Failed to fetch IMDb poster for ${imdbId}: ${err.message}`);
  }
  return null;
}

/**
 * Fetch and transform metadata (movies & series) from Cinemeta,
 * rewriting episode thumbnails to our proxy for reliable loading in Iran.
 */
async function getMeta(type, id, proxyBaseUrl = '') {
  if (!id || typeof id !== 'string') return { meta: null };
  const imdbId = id.split(':')[0];
  if (!imdbId.startsWith('tt')) return { meta: null };

  const effectiveBaseUrl = (proxyBaseUrl || PUBLIC_URL || 'https://stremio.alirostami.com').replace(/\/$/, '');
  const cacheKey = `${type}:${imdbId}:${effectiveBaseUrl}`;
  const now = Date.now();

  const cached = metaCache.get(cacheKey);
  if (cached && (now - cached.timestamp < META_CACHE_TTL)) {
    return {
      meta: cached.meta,
      cacheMaxAge: 86400,
      staleRevalidate: 86400 * 7
    };
  }

  const metaUrl = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
  let cinemetaData = null;

  try {
    if (typeof fetch === 'function') {
      try {
        const resp = await fetch(metaUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          }
        });
        if (resp.ok) {
          cinemetaData = await resp.json();
        }
      } catch (err) {
        verboseLog('META', `fetch error for ${imdbId}: ${err.message}`);
      }
    }

    if (!cinemetaData) {
      const response = await axios.get(metaUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        timeout: 8000
      });
      cinemetaData = response.data;
    }

    if (!cinemetaData || !cinemetaData.meta) {
      return { meta: null };
    }

    const meta = { ...cinemetaData.meta };

    // Rewrite episode thumbnails to proxy through our addon so they load and cache in Iran
    if (Array.isArray(meta.videos)) {
      meta.videos = meta.videos.map(video => {
        if (!video) return video;
        const videoCopy = { ...video };
        let thumb = videoCopy.thumbnail;
        if (!thumb && imdbId.startsWith('tt') && videoCopy.season && videoCopy.episode) {
          // Metahub standard URL for episode thumbnails (redirects to TMDB)
          thumb = `https://episodes.metahub.space/${imdbId}/${videoCopy.season}/${videoCopy.episode}/w780.jpg`;
        }
        if (thumb) {
          // Fix legacy invalid domain if present
          thumb = String(thumb).replace('episodes.images.metahub.space', 'episodes.metahub.space');
          videoCopy.thumbnail = proxyImageUrl(thumb, effectiveBaseUrl);
        } else if (meta.background || meta.poster) {
          // Graceful fallback to background or poster if no thumbnail is available
          videoCopy.thumbnail = meta.background || meta.poster;
        }
        return videoCopy;
      });
    }

    // Enhance poster with official high-res IMDb poster if available
    try {
      const imdbPoster = await fetchImdbPoster(imdbId);
      if (imdbPoster) {
        meta.poster = imdbPoster;
      }
    } catch (_) {}

    // Proxy poster, background, and logo so they reliably load without VPN in Iran
    if (meta.poster && typeof meta.poster === 'string') {
      meta.poster = proxyImageUrl(meta.poster, effectiveBaseUrl);
    }

    // Proxy background so it reliably loads without VPN in Iran
    if (meta.background && typeof meta.background === 'string') {
      meta.background = proxyImageUrl(meta.background, effectiveBaseUrl);
    }

    // Proxy logo if present
    if (meta.logo && typeof meta.logo === 'string') {
      meta.logo = proxyImageUrl(meta.logo, effectiveBaseUrl);
    }

    // Cache the transformed metadata
    if (metaCache.size >= MAX_META_CACHE_SIZE) {
      const oldestKey = metaCache.keys().next().value;
      metaCache.delete(oldestKey);
    }
    metaCache.set(cacheKey, { timestamp: now, meta });

    return {
      meta,
      cacheMaxAge: 86400,
      staleRevalidate: 86400 * 7
    };
  } catch (error) {
    debugLog('META', `Failed to fetch meta for ${id}: ${error.message}`);
    return { meta: null };
  }
}


/**
 * Resolve the real content URL via the site's quick-search endpoint.
 *
 * Resolution strategy:
 * 1. Search by IMDB id and require an exact IMDB match.
 * 2. If the source search does not index the IMDB id (for example,
 *    Akira: tt0094625), search by the Cinemeta title.
 * 3. Optionally retry with title + year.
 *
 * Every fallback still requires an exact normalized IMDB match and a
 * real post result, so actor/term results are never accepted.
 *
 * @returns {Promise<string|null>} final content URL or null
 */
async function resolveViaQuickSearch(imdbId, title = null, year = null, expectedType = null) {
  const normalizeImdb = value => String(value ?? '').trim().toLowerCase();
  const requestedImdb = normalizeImdb(imdbId);

  const isTypeMatch = item => {
    if (!item) return false;
    const isSeries = item.type === 'series' || (item.url && item.url.startsWith('/series/'));
    if (expectedType === 'series') return isSeries;
    if (expectedType === 'movie') return !isSeries;
    return true;
  };

  const queries = [imdbId];
  if (title && String(title).trim()) {
    queries.push(String(title).trim());
    if (year) queries.push(`${String(title).trim()} ${year}`);
  }

  for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    const query = queries[queryIndex];
    const mode = queryIndex === 0 ? 'imdb' : (queryIndex === 1 ? 'title' : 'title_year');
    debugLog('QUICK_SEARCH', `query=${query} mode=${mode} imdb=${imdbId} type=${expectedType}`);

    try {
      const qsUrl = `/quick-search?q=${encodeURIComponent(query)}&sort=modified_at%3Adesc`;
      verboseLog('QUICK_SEARCH', `request url=${qsUrl} base=${BASE_URL}`);

      const response = await client.get(qsUrl);
      const status = response.status;
      const contentType = response.headers && response.headers['content-type'];
      debugLog('QUICK_SEARCH', `status=${status} mode=${mode}`, { contentType });

      if (status !== 200) {
        debugLog('QUICK_SEARCH', `non-200 status`, { status, query, mode });
        continue;
      }

      const data = response.data;
      const isArray = Array.isArray(data);
      const resultCount = isArray
        ? data.length
        : (data && typeof data === 'object' ? Object.keys(data).length : 0);
      debugLog('QUICK_SEARCH', `result_count=${resultCount} isArray=${isArray} mode=${mode}`);

      let results = data;
      if (!Array.isArray(results)) {
        if (results && Array.isArray(results.data)) {
          results = results.data;
          debugLog('QUICK_SEARCH', `unwrapped data field, new count=${results.length}`);
        } else if (results && Array.isArray(results.results)) {
          results = results.results;
          debugLog('QUICK_SEARCH', `unwrapped results field, new count=${results.length}`);
        } else {
          debugLog('QUICK_SEARCH', `response.data is not an array`, {
            type: typeof data,
            preview: JSON.stringify(data).slice(0, 300)
          });
          continue;
        }
      }

      if (results.length > 0) {
        const sampleIds = results.slice(0, 5).map(r => r && (r.imdb_id || r.imdb) || 'N/A');
        verboseLog('QUICK_SEARCH', `sample imdb_ids`, { sampleIds, mode });
      }

      // Check exact IMDB match that satisfies requested type (movie vs series)
      let match = results.find(r => {
        if (!r || r._kind === 'term') return false;
        const candidateImdb = normalizeImdb(r.imdb_id || r.imdb);
        return candidateImdb === requestedImdb && isTypeMatch(r);
      });

      // If still no match and searching by title, match item by title query and expected type
      if (!match && queryIndex > 0) {
        match = results.find(r => {
          if (!r || r._kind === 'term') return false;
          return isTypeMatch(r);
        });
      }

      const exactMatch = match
        ? JSON.stringify({
            imdb_id: match.imdb_id || match.imdb,
            url: match.url,
            title: match.title || match.name,
            kind: match._kind,
            type: match.type
          }).slice(0, 300)
        : 'null';
      debugLog('QUICK_SEARCH', `exact_match=${match ? 'found' : 'not_found'} mode=${mode}`, {
        detail: exactMatch
      });

      if (!match || !match.url) {
        continue;
      }

      let contentUrl;
      try {
        contentUrl = new URL(match.url, BASE_URL).toString();
      } catch (e) {
        contentUrl = String(match.url).startsWith('http')
          ? match.url
          : `${BASE_URL.replace(/\/$/, '')}/${String(match.url).replace(/^\//, '')}`;
      }

      debugLog('QUICK_SEARCH', `resolved_url=${sanitizeUrlForLog(contentUrl)} mode=${mode}`);

      if (contentUrl.includes('/profile/')) {
        debugLog('QUICK_SEARCH', `resolved to /profile/ (not found)`, { mode });
        continue;
      }

      return contentUrl;
    } catch (error) {
      debugLog('QUICK_SEARCH', `error mode=${mode}: ${error.message}`, {
        stack: error.stack && error.stack.slice(0, 500)
      });
    }
  }

  debugLog('QUICK_SEARCH', `no IMDB match found after all queries`, {
    imdb: imdbId,
    title,
    year
  });
  return null;
}

/**
 * Resiliently fetch page content. Handles servers that abruptly close
 * HTTP/2 or chunked connections after sending HTML content (aborted / ECONNRESET).
 */
async function fetchHtmlContent(url) {
  // Strategy 1: Standard globalThis.fetch (native in Node 18+ and Cloudflare Workers)
  // Highly resilient, handles modern HTTP/2, TLS, and huge chunked responses without prematurely aborting
  if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
    try {
      const resp = await globalThis.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      const status = resp.status;
      const finalUrl = resp.url || url;
      const contentType = resp.headers.get('content-type');

      // Attempt clean text() first
      try {
        const html = await resp.text();
        if (html && html.length > 500) {
          return { html, status, finalUrl, contentType };
        }
      } catch (streamErr) {
        debugLog('FETCH', `resp.text() threw, falling back to stream reader: ${streamErr.message}`);
      }

      // If stream interrupted, read chunk by chunk to salvage partial HTML
      if (resp.body && typeof resp.body.getReader === 'function') {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let html = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            html += decoder.decode(value, { stream: true });
          }
        } catch (streamErr) {
          if (html.length > 1000) {
            debugLog('FETCH', `fetch reader interrupted, recovered ${html.length} bytes`);
            return { html, status, finalUrl, contentType };
          }
          throw streamErr;
        }
        return { html, status, finalUrl, contentType };
      }
    } catch (fetchErr) {
      debugLog('FETCH', `global fetch failed, trying fallback: ${fetchErr.message}`);
    }
  }

  // Strategy 2: Node.js axios stream collector fallback
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      const result = await new Promise((resolve, reject) => {
        client.get(url, {
          responseType: 'stream',
          timeout: 25000
        }).then(response => {
          let html = '';
          const stream = response.data;
          const status = response.status;
          const contentType = response.headers && response.headers['content-type'];
          const finalUrl = response.request && response.request.res && response.request.res.responseUrl
            ? response.request.res.responseUrl
            : (response.request && response.request.responseURL) || url;

          stream.on('data', chunk => {
            html += chunk.toString('utf-8');
          });
          stream.on('end', () => resolve({ html, status, finalUrl, contentType }));
          stream.on('error', err => {
            // When origin prematurely closes after sending the page content
            if (html && html.length > 1000 && (html.includes('<html') || html.includes('download') || html.includes('series-downloaditems'))) {
              debugLog('FETCH', `stream closed early by origin (${err.message}), recovered ${html.length} bytes of partial HTML`);
              resolve({ html, status, finalUrl, contentType });
            } else {
              reject(err);
            }
          });
        }).catch(reject);
      });
      if (result && result.html) return result;
    } catch (e) {
      debugLog('FETCH', `stream fetch failed, trying standard fetch: ${e.message}`);
    }
  }

  // Strategy 3: Standard client.get
  const response = await client.get(url);
  return {
    html: response.data ? String(response.data) : '',
    status: response.status,
    finalUrl: response.request && response.request.res && response.request.res.responseUrl
      ? response.request.res.responseUrl
      : (response.request && response.request.responseURL) || url,
    contentType: response.headers && response.headers['content-type']
  };
}

/**
 * Fetch and parse a page with detailed diagnostics
 */
async function fetchPage(url) {
  if (!url) {
    debugLog('FETCH', `url is null/empty, cannot fetch`);
    return null;
  }
  debugLog('FETCH', `url=${sanitizeUrlForLog(url)}`);
  try {
    const { html, status, finalUrl, contentType } = await fetchHtmlContent(url);
    const bodyStr = html || '';
    const bodyLength = bodyStr.length;

    debugLog('FETCH', `status=${status}`, { final_url: sanitizeUrlForLog(finalUrl), content_type: contentType, body_length: bodyLength });

    // Detect Cloudflare challenge / bot protection
    const lowerBody = bodyStr.toLowerCase();
    const isCloudflareChallenge = lowerBody.includes('cf-challenge') ||
      lowerBody.includes('attention required') ||
      lowerBody.includes('just a moment') ||
      lowerBody.includes('checking if the site connection is secure') ||
      lowerBody.includes('cf-browser-verification') ||
      lowerBody.includes('cloudflare');

    if (isCloudflareChallenge) {
      debugLog('FETCH', `cloudflare challenge detected`, { url: sanitizeUrlForLog(url) });
    }

    if (status && status !== 200) {
      debugLog('FETCH', `non-200 status, returning null`, { status });
      return null;
    }

    // Ensure we have HTML before cheerio load
    if (!bodyStr || bodyStr.length < 100) {
      debugLog('FETCH', `body too short or empty`, { length: bodyLength });
      return null;
    }

    if (contentType && !contentType.includes('html') && !contentType.includes('text')) {
      debugLog('FETCH', `unexpected content-type`, { contentType });
      // Still try to parse if body looks like HTML
      if (!bodyStr.includes('<html') && !bodyStr.includes('<div')) {
        return null;
      }
    }

    let cleanedBody = bodyStr;
    const commentsIndex = cleanedBody.search(/<(?:div|section)\b[^>]*(?:id|class)=["'][^"']*(?:comment|نظر)[^"']*["']/i);
    if (commentsIndex !== -1 && commentsIndex > 5000) {
      cleanedBody = cleanedBody.slice(0, commentsIndex) + '</body></html>';
    }

    verboseLog('FETCH', `load cheerio`, { body_preview: cleanedBody.slice(0, 300).replace(/\n/g, ' ') });
    return cheerio.load(cleanedBody);
  } catch (error) {
    const status = error.response && error.response.status;
    const finalUrl = error.response && error.response.request && error.response.request.res && error.response.request.res.responseUrl;
    debugLog('FETCH', `fetch error for ${sanitizeUrlForLog(url)}: ${error.message}`, { status, final_url: finalUrl ? sanitizeUrlForLog(finalUrl) : undefined });
    verboseLog('FETCH', `error stack`, { stack: error.stack && error.stack.slice(0, 800) });
    return null;
  }
}

/**
 * Detect video quality from URL and text as a fallback when the source page
 * does not expose a dedicated quality label.
 */
function detectQuality(url, context = '') {
  const combined = (url + ' ' + context).toLowerCase();

  if (combined.includes('2160') || combined.includes('4k') || combined.includes('uhd')) return '4K';
  if (combined.includes('1080') || combined.includes('full hd') || combined.includes('fhd')) return '1080p';
  if (combined.includes('720') || combined.includes('hd')) return '720p';
  if (combined.includes('480') || combined.includes('sd')) return '480p';
  if (combined.includes('360')) return '360p';

  const qualityParam = url.match(/[?&]quality=([^&]*)/i);
  if (qualityParam) {
    const q = decodeURIComponent(qualityParam[1]).toLowerCase();
    if (q.includes('2160') || q.includes('4k')) return '4K';
    if (q.includes('1080')) return '1080p';
    if (q.includes('720')) return '720p';
    if (q.includes('480')) return '480p';
  }

  return 'Unknown';
}

function toEnglishDigits(value) {
  if (value === null || value === undefined) return '';

  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';

  return String(value).replace(/[۰-۹٠-٩]/g, digit => {
    const persianIndex = persianDigits.indexOf(digit);
    if (persianIndex !== -1) return String(persianIndex);

    const arabicIndex = arabicDigits.indexOf(digit);
    if (arabicIndex !== -1) return String(arabicIndex);

    return digit;
  });
}

function decodeUrlPart(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function extractReleaseFormatFromFilename(filename) {
  if (!filename) return null;

  const decodedFilename = decodeUrlPart(filename)
    .replace(/\.(mkv|mp4|m3u8|avi)$/i, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const episodeMatch = decodedFilename.match(/\bS\d{1,2}\s*E\d{1,3}\b/i);
  const releasePart = episodeMatch
    ? decodedFilename.slice(episodeMatch.index + episodeMatch[0].length).trim()
    : decodedFilename;

  const releaseTokens = releasePart.split(/\s+/).filter(Boolean);
  const formatTokens = releaseTokens.filter(token => (
    /^(?:2160p|1080p|720p|480p|360p|4k|uhd|fhd|hd)$/i.test(token) ||
    /^(?:web-?dl|web-?rip|blu-?ray|brrip|hdrip|dvdrip|hdtv)$/i.test(token) ||
    /^(?:x264|x265|h264|h265|hevc|avc)$/i.test(token) ||
    /^(?:10bit|8bit|hdr|dv|dolbyvision)$/i.test(token) ||
    /^(?:nf|amzn|dsnp|hulu|atvp|max)$/i.test(token)
  ));

  return formatTokens.length > 0 ? formatTokens.join(' ') : null;
}

function resolveUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch (_) {
    return href;
  }
}

/**
 * Convert labels like `کیفیت : WEB-DL 4K 2160p 10bit HDR` to the clean
 * value that should be shown in Stremio (`WEB-DL 4K 2160p 10bit HDR`).
 */
function cleanMetadataValue(value) {
  if (!value) return null;

  const cleaned = String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/[\u200c\u200e\u200f]/g, ' ')
    .replace(/^[\s:：؛;،,|\-–—]+/, '')
    .replace(/[\s|\-–—]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || null;
}

/**
 * Extract the value that comes after one of the given labels.
 *
 * Examples:
 *   کیفیت : WEB-DL 4K 2160p 10bit HDR  -> WEB-DL 4K 2160p 10bit HDR
 *   انکودر : PSA                       -> PSA
 */
function extractLabeledValue(text, labels) {
  if (!text) return null;

  const boundaryLabels = [
    'کیفیت', 'Quality',
    'انکودر', 'Encoder', 'Encode',
    'حجم', 'Size',
    'زبان', 'Language',
    'فرمت', 'Format',
    'رزولوشن', 'Resolution',
    'مدت', 'زمان', 'Duration',
    'فصل', 'قسمت', 'Season', 'Episode',
    'دانلود', 'Download',
    'بدون زیرنویس فارسی', 'بدون زیرنویس', 'زیرنویس فارسی', 'زیرنویس',
    'No Persian Subtitles', 'No Persian Subtitle', 'Without Persian Subtitles', 'Without Persian Subtitle',
    'No Farsi Subtitles', 'No Farsi Subtitle', 'Without Farsi Subtitles', 'Without Farsi Subtitle',
    'No Subtitles', 'No Subtitle', 'Without Subtitles', 'Without Subtitle',
    'Persian Subtitles', 'Persian Subtitle', 'Farsi Subtitles', 'Farsi Subtitle',
    'Subtitles', 'Subtitle',
    'صوت', 'Audio',
    'میانگین', 'امتیاز', 'IMDb', 'IMDB', 'Rating', 'Rate',
    'ژانر', 'Genre',
    'سال', 'Year',
    'کشور', 'Country',
    'کارگردان', 'Director',
    'بازیگران', 'Actors', 'Cast',
    'رده', 'Age',
    'وضعیت', 'Status',
    'شبکه', 'Network',
    'خلاصه', 'Story', 'Plot'
  ];

  const normalizedText = String(text)
    .replace(/&nbsp;/gi, ' ')
    .replace(/[\u200c\u200e\u200f]/g, ' ')
    .replace(/\r/g, '\n');
  const lowerText = normalizedText.toLowerCase();

  for (const label of labels) {
    const labelIndex = lowerText.indexOf(label.toLowerCase());
    if (labelIndex === -1) continue;

    let valueStart = labelIndex + label.length;
    while (valueStart < normalizedText.length && /[\s:：؛]/.test(normalizedText[valueStart])) {
      valueStart += 1;
    }

    let valueEnd = normalizedText.length;
    const lineEnd = normalizedText.indexOf('\n', valueStart);
    if (lineEnd !== -1) valueEnd = Math.min(valueEnd, lineEnd);

    for (const boundaryLabel of boundaryLabels) {
      const boundaryIndex = lowerText.indexOf(boundaryLabel.toLowerCase(), valueStart);
      if (boundaryIndex !== -1 && boundaryIndex < valueEnd) {
        valueEnd = boundaryIndex;
      }
    }

    const value = cleanMetadataValue(normalizedText.slice(valueStart, valueEnd));
    if (value) return value;
  }

  return null;
}

/**
 * Extract source-provided release labels from an HTML fragment. This preserves
 * the exact quality line from the provider instead of reducing it to only
 * `1080p`/`720p`, and also exposes encoder information when present.
 */
function detectPersianSubtitleStatus(text) {
  if (!text) return null;

  const normalizedText = String(text)
    .replace(/&nbsp;/gi, ' ')
    .replace(/[\u200c\u200e\u200f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const negativePatterns = [
    /بدون\s+زیر\s*نویس/,
    /فاقد\s+زیر\s*نویس/,
    /زیر\s*نویس\s*(?:فارسی)?\s*[:：؛]?\s*(?:ندارد|موجود\s+نیست|اضافه\s+نشده)/,
    /no\s+(?:persian\s+|farsi\s+)?sub(?:title)?s?/,
    /without\s+(?:persian\s+|farsi\s+)?sub(?:title)?s?/
  ];

  if (negativePatterns.some(pattern => pattern.test(normalizedText))) {
    return 'none';
  }

  const positivePatterns = [
    /زیر\s*نویس\s+فارسی/,
    /زیر\s*نویس\s*(?:فارسی)?\s*[:：؛]?\s*(?:دارد|موجود)/,
    /با\s+زیر\s*نویس/,
    /دارای\s+زیر\s*نویس/,
    /زیر\s*نویس\s+چسبیده/,
    /persian\s+sub(?:title)?s?/,
    /farsi\s+sub(?:title)?s?/,
    /hard\s*sub(?:bed)?/,
    /hardcoded\s+sub(?:title)?s?/,
    /\bsubbed\b/
  ];

  if (positivePatterns.some(pattern => pattern.test(normalizedText))) {
    return 'persian';
  }

  return null;
}

function formatSubtitleLabel(status) {
  if (status === 'persian') return '';
  if (status === 'none') return '';
  return null;
}

function extractReleaseInfoFromElement($, element) {
  if (!element) return { quality: null, encoder: null, subtitleStatus: null };

  const text = $(element).text();

  return {
    quality: extractLabeledValue(text, ['کیفیت', 'Quality']),
    encoder: extractLabeledValue(text, ['انکودر', 'Encoder', 'Encode']),
    subtitleStatus: detectPersianSubtitleStatus(text)
  };
}

/**
 * Try the current node first, then walk up a few parents. This handles pages
 * where quality/encoder/subtitle labels are placed on a wrapper around the
 * download row. Fields are merged independently so finding quality in the row
 * does not prevent reading subtitle information from a parent wrapper.
 */
function extractReleaseInfoNearElement($, element, maxDepth = 4) {
  const result = { quality: null, encoder: null, subtitleStatus: null };
  let current = $(element);

  for (let depth = 0; depth <= maxDepth && current.length > 0; depth += 1) {
    const info = extractReleaseInfoFromElement($, current[0]);
    result.quality = result.quality || info.quality;
    result.encoder = result.encoder || info.encoder;
    result.subtitleStatus = result.subtitleStatus || info.subtitleStatus;

    if (result.quality && result.encoder && result.subtitleStatus) break;
    current = current.parent();
  }

  return result;
}

function buildStreamName(quality, dubbedLabel = '', subtitleStatus = null) {
  const subtitleLabel = formatSubtitleLabel(subtitleStatus);
  const subtitlePart = subtitleLabel ? ` • ${subtitleLabel}` : '';
  return `${quality}${dubbedLabel}${subtitlePart}`.trim();
}

/**
 * Check if content is dubbed based on filename/text
 * Looks for "Dubbed", "Dooble", "دوبله" in the text
 * @param {string} text - Text to check (filename, title, etc.)
 * @returns {boolean} True if dubbed
 */
function isDubbed(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  // Check for various dubbed indicators
  return lowerText.includes('dubbed') ||
    lowerText.includes('dooble') ||
    lowerText.includes('دوبله') ||
    lowerText.includes('farsi dub') ||
    lowerText.includes('persian dub');
}

const PERSIAN_SEASON_ORDINALS = [
  { pattern: /بیست\s*و\s*پنجم/i, val: 25 },
  { pattern: /بیست\s*و\s*چهارم/i, val: 24 },
  { pattern: /بیست\s*و\s*سوم/i, val: 23 },
  { pattern: /بیست\s*و\s*دوم/i, val: 22 },
  { pattern: /بیست\s*و\s*یکم/i, val: 21 },
  { pattern: /بیستم/i, val: 20 },
  { pattern: /نوزدهم/i, val: 19 },
  { pattern: /هجدهم/i, val: 18 },
  { pattern: /هفدهم/i, val: 17 },
  { pattern: /شانزدهم/i, val: 16 },
  { pattern: /پانزدهم/i, val: 15 },
  { pattern: /چهاردهم/i, val: 14 },
  { pattern: /سیزدهم/i, val: 13 },
  { pattern: /دوازدهم/i, val: 12 },
  { pattern: /یازدهم/i, val: 11 },
  { pattern: /دهم/i, val: 10 },
  { pattern: /نهم/i, val: 9 },
  { pattern: /هشتم/i, val: 8 },
  { pattern: /هفتم/i, val: 7 },
  { pattern: /ششم/i, val: 6 },
  { pattern: /پنجم/i, val: 5 },
  { pattern: /چهارم/i, val: 4 },
  { pattern: /سوم/i, val: 3 },
  { pattern: /دوم/i, val: 2 },
  { pattern: /اول/i, val: 1 }
];

function extractSeasonNumber(rawText, fallbackIndex = null) {
  if (!rawText) return fallbackIndex;
  const normalized = toEnglishDigits(rawText);

  // Check digit patterns first: "فصل 12", "season 12", "S12"
  const digitSeasonMatch = normalized.match(/(?:season|فصل|\bS)[\s:]*0*(\d{1,2})\b/i);
  if (digitSeasonMatch) {
    return parseInt(digitSeasonMatch[1], 10);
  }

  // Check Persian ordinals (from longest/highest to shortest to avoid "یازدهم" matching "دهم")
  for (const { pattern, val } of PERSIAN_SEASON_ORDINALS) {
    if (pattern.test(normalized)) {
      return val;
    }
  }

  return fallbackIndex;
}

function extractSeasonNumberFromLegacyLink(text, href) {
  const combined = toEnglishDigits(`${text || ''} ${decodeUrlPart(href || '')}`);

  const fromNumber = extractSeasonNumber(combined);
  if (fromNumber !== null) return fromNumber;

  const folderMatch = combined.match(/\/S0*(\d{1,2})(?:\/|$)/i);
  if (folderMatch) return parseInt(folderMatch[1], 10);

  return null;
}

function extractEpisodeMatchFromFilename(filename, targetSeason, targetEpisode) {
  const normalizedFilename = toEnglishDigits(decodeUrlPart(filename));
  const seasonNum = parseInt(targetSeason, 10);
  const episodeNum = parseInt(targetEpisode, 10);

  const seasonEpisodeMatch = normalizedFilename.match(/\bS0*(\d{1,2})\s*E0*(\d{1,3})\b/i);
  if (seasonEpisodeMatch) {
    return parseInt(seasonEpisodeMatch[1], 10) === seasonNum &&
      parseInt(seasonEpisodeMatch[2], 10) === episodeNum;
  }

  const xMatch = normalizedFilename.match(/\b0*(\d{1,2})x0*(\d{1,3})\b/i);
  if (xMatch) {
    return parseInt(xMatch[1], 10) === seasonNum &&
      parseInt(xMatch[2], 10) === episodeNum;
  }

  const episodeOnlyMatch = normalizedFilename.match(/\bE0*(\d{1,3})\b/i);
  return episodeOnlyMatch ? parseInt(episodeOnlyMatch[1], 10) === episodeNum : false;
}

async function extractStreamsFromSeasonDirectory(seasonUrl, targetSeason, targetEpisode, pageSubtitleStatus = null) {
  const streams = [];

  try {
    debugLog('LEGACY', `Fetching legacy season directory: ${sanitizeUrlForLog(seasonUrl)}`);
    const response = await axios.get(seasonUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: status => status < 500
    });

    if (response.status !== 200) {
      debugLog('LEGACY', `season directory returned status ${response.status}`);
      return streams;
    }

    const finalUrl = response.request?.res?.responseUrl || seasonUrl;
    const $directory = cheerio.load(response.data);

    $directory('a[href]').each((_, link) => {
      const href = $directory(link).attr('href');
      if (!href || href === '../' || href.startsWith('?')) return;
      if (!/\.(mkv|mp4|m3u8|avi)(?:$|[?#])/i.test(href)) return;

      const filename = decodeUrlPart(href.split('/').pop().split('?')[0]);
      if (!extractEpisodeMatchFromFilename(filename, targetSeason, targetEpisode)) return;

      const videoUrl = resolveUrl(href, finalUrl);
      const quality = extractReleaseFormatFromFilename(filename) || detectQuality(videoUrl, filename);
      const dubbedLabel = isDubbed(`${filename} ${videoUrl}`) ? ' • دوبله' : '';
      const subtitleStatus = detectPersianSubtitleStatus(filename) || pageSubtitleStatus;
      const streamName = buildStreamName(quality, dubbedLabel, subtitleStatus);
      const subtitleTitle = formatSubtitleLabel(subtitleStatus);
      const subtitleTitlePart = subtitleTitle ? ` • ${subtitleTitle}` : '';

      streams.push({
        name: streamName,
        title: `S${targetSeason}E${targetEpisode} - ${quality}${subtitleTitlePart}`,
        url: videoUrl
      });
      debugLog('LEGACY', `Added legacy directory stream: ${streamName} url=${sanitizeUrlForLog(videoUrl)}`);
    });
  } catch (error) {
    debugLog('LEGACY', `season directory error: ${error.message}`);
  }

  return streams;
}

async function extractLegacySeriesStreams($, targetSeason, targetEpisode) {
  if (!$) {
    debugLog('PARSER', `extractLegacySeriesStreams called with null $`);
    return [];
  }
  const seasonLinks = [];
  const pageSubtitleStatus = detectPersianSubtitleStatus($('main, article, .single, .post, body').first().text());

  $('a[href]').each((_, link) => {
    const $link = $(link);
    const href = $link.attr('href');
    const text = $link.text().trim();
    if (!href) return;

    const seasonNum = extractSeasonNumberFromLegacyLink(text, href);
    if (seasonNum !== parseInt(targetSeason, 10)) return;

    const decodedHref = decodeUrlPart(href);
    const looksLikeSeasonDirectory = /\/S0*\d{1,2}\/?(?:$|[?#])/i.test(decodedHref) ||
      /دانلود\s+فصل|download\s+season/i.test(toEnglishDigits(text));
    if (!looksLikeSeasonDirectory) return;

    const absoluteUrl = href.startsWith('http') ? href : resolveUrl(href, BASE_URL);
    if (!seasonLinks.includes(absoluteUrl)) seasonLinks.push(absoluteUrl);
  });

  debugLog('PARSER', `legacy season links found: ${seasonLinks.length}`);

  const streams = [];
  for (const seasonUrl of seasonLinks) {
    const directoryStreams = await extractStreamsFromSeasonDirectory(
      seasonUrl,
      targetSeason,
      targetEpisode,
      pageSubtitleStatus
    );
    streams.push(...directoryStreams);
  }

  return streams;
}

/**
 * Extract streams from series page for specific season/episode
 */
async function extractSeriesStreams($, targetSeason, targetEpisode) {
  if (!$ || typeof $ !== 'function') {
    debugLog('PARSER', `extractSeriesStreams called with invalid $`, { type: typeof $ });
    return [];
  }
  const streams = [];
  const targetEpNum = parseInt(targetEpisode, 10);

  const downloadSeasonCount = $('.download-season').length;
  const dflexCount = $('.series-downloaditems .d-flex').length;
  debugLog('PARSER', `series download-season-count=${downloadSeasonCount} d-flex-count=${dflexCount}`);

  $('.download-season').each((seasonIdx, seasonEl) => {
    const $seasonEl = $(seasonEl);
    const button = $seasonEl.find('button[data-bs-toggle="collapse"]').first();
    const buttonText = button.text();

    // Determine season number from Persian ordinals or digits
    const seasonNum = extractSeasonNumber(buttonText, seasonIdx + 1);

    if (parseInt(targetSeason, 10) !== seasonNum) return;

    debugLog('PARSER', `Found matching season container (Season ${seasonNum})`);

    const episodeItems = $seasonEl.find('.series-downloaditems .d-flex');

    episodeItems.each((epIdx, epEl) => {
      const $epEl = $(epEl);
      const epLink = $epEl.find('a.btn-block.btn-default').first();
      const epText = epLink.text().trim();
      const normalizedEpText = toEnglishDigits(epText);
      let epNum = epIdx + 1;

      const persianEpMatch = normalizedEpText.match(/(?:قسمت)[\s:]*0*(\d+)/i);
      if (persianEpMatch) {
        epNum = parseInt(persianEpMatch[1], 10);
      } else {
        const englishEpMatch = normalizedEpText.match(/(?:episode|ep)[\s:]*0*(\d+)/i);
        if (englishEpMatch) {
          epNum = parseInt(englishEpMatch[1], 10);
        } else {
          const href = epLink.attr('href') || '';
          const filenameMatch = toEnglishDigits(href).match(/(?:[._-]S\d+E|E|episode=)0*(\d+)/i);
          if (filenameMatch) {
            epNum = parseInt(filenameMatch[1], 10);
          }
        }
      }

      if (epNum !== targetEpNum) return;

      debugLog('PARSER', `Found matching episode ${epNum}`);

      let videoUrl = null;

      // Strategy 1: onclick handler
      const onclickBtn = $epEl.find('a[onclick]').first();
      if (onclickBtn.length > 0) {
        const onclick = onclickBtn.attr('onclick');
        if (onclick) {
          const urlMatch = onclick.match(/handleDownloadClick\(['"]([^'"]+)['"]/);
          if (urlMatch) videoUrl = urlMatch[1];
        }
      }

      // Strategy 2: Direct href
      if (!videoUrl) {
        const href = epLink.attr('href');
        if (href && (href.includes('.mkv') || href.includes('.mp4') || href.includes('http'))) {
          videoUrl = href;
        }
      }

      // Strategy 3: Check sibling elements
      if (!videoUrl) {
        $epEl.find('a[onclick]').each((_, aEl) => {
          const onclick = $(aEl).attr('onclick');
          if (onclick && !videoUrl) {
            const urlMatch = onclick.match(/handleDownloadClick\(['"]([^'"]+)['"]/);
            if (urlMatch) videoUrl = urlMatch[1];
          }
        });
      }

      if (videoUrl) {
        // Ensure absolute URL
        if (!videoUrl.startsWith('http')) {
          videoUrl = resolveUrl(videoUrl, BASE_URL);
        }
        const releaseInfo = extractReleaseInfoNearElement($, epEl);
        const fallbackContext = `${buttonText} ${$epEl.text()} ${videoUrl}`;
        const quality = releaseInfo.quality || detectQuality(videoUrl, fallbackContext);
        const encoder = releaseInfo.encoder;
        const subtitleStatus = releaseInfo.subtitleStatus;
        // Check if the content is dubbed based on episode text and video URL
        const dubbedLabel = isDubbed(`${$epEl.text()} ${videoUrl}`) ? ' • دوبله' : '';
        const streamName = buildStreamName(quality, dubbedLabel, subtitleStatus);
        const encoderTitle = encoder ? ` • encoder: ${encoder}` : '';
        const subtitleTitle = formatSubtitleLabel(subtitleStatus);
        const subtitleTitlePart = subtitleTitle ? ` • ${subtitleTitle}` : '';

        verboseLog('PARSER', `candidate quality=${quality} encoder=${encoder} dubbed=${!!dubbedLabel} url=${sanitizeUrlForLog(videoUrl)}`);

        streams.push({
          name: streamName,
          title: `S${targetSeason}E${targetEpisode} - ${quality}${encoderTitle}${subtitleTitlePart}`,
          url: videoUrl
        });
        debugLog('PARSER', `Added stream: ${streamName}`);
      }
    });
  });

  if (streams.length === 0) {
    debugLog('PARSER', `no streams from main selector, trying legacy fallback`);
    const legacyStreams = await extractLegacySeriesStreams($, targetSeason, targetEpisode);
    streams.push(...legacyStreams);
  }

  debugLog('PARSER', `series extraction complete: ${streams.length} streams`);
  return streams;
}

/**
 * Extract streams from movie page
 */
function extractMovieStreams($) {
  if (!$ || typeof $ !== 'function') {
    debugLog('PARSER', `extractMovieStreams called with invalid $`, { type: typeof $ });
    return [];
  }

  const streams = [];
  const seenUrls = new Set();
  const mediaExtensions = /\.(mkv|mp4|m3u8|avi|mov|webm)(?:$|[?#])/i;

  debugLog('PARSER', `Extracting movie streams directly from page file links...`);

  // Movie pages can contain the same <a> inside several nested download
  // containers. Scan each link once instead of walking overlapping containers.
  $('a[href], a[onclick]').each((_, el) => {
    const $link = $(el);
    const href = ($link.attr('href') || '').trim();
    const onclick = ($link.attr('onclick') || '').trim();
    const text = $link.text().trim();

    let videoUrl = href;
    const onclickMatch = onclick.match(/handleDownloadClick\(['"]([^'"]+)['"]/i);
    if (onclickMatch) videoUrl = onclickMatch[1];

    if (!videoUrl || videoUrl === '#') return;
    if (!mediaExtensions.test(videoUrl)) return;

    if (!videoUrl.startsWith('http')) videoUrl = resolveUrl(videoUrl, BASE_URL);
    if (!videoUrl || !videoUrl.startsWith('http')) return;

    // Only exact URL duplicates are removed. Different files, even when
    // they have the same quality, are always kept.
    if (seenUrls.has(videoUrl)) return;
    seenUrls.add(videoUrl);

    let filename = '';
    try {
      const parsed = new URL(videoUrl);
      filename = decodeUrlPart(parsed.pathname.split('/').pop() || '');
    } catch (_) {
      filename = decodeUrlPart(videoUrl.split('/').pop().split('?')[0]);
    }

    if (!filename) filename = text || 'Video file';

    const extensionMatch = filename.match(/\.(mkv|mp4|m3u8|avi|mov|webm)$/i);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
    const filenameWithoutExtension = filename.replace(/\.[^.]+$/, '').trim();

    // Metadata is presentation-only. It is never used for deduplication.
    const nearbyElement = $link.closest('li, .d-flex, .download-item, .download-list, .download-box, .dl-box')[0] || el;
    const releaseInfo = extractReleaseInfoNearElement($, nearbyElement);
    const fallbackContext = `${filename} ${text} ${videoUrl}`;
    const quality = releaseInfo.quality || extractReleaseFormatFromFilename(filename) || detectQuality(videoUrl, fallbackContext);
    const encoder = releaseInfo.encoder;
    const subtitleStatus = releaseInfo.subtitleStatus ||
      detectPersianSubtitleStatus(filename) ||
      detectPersianSubtitleStatus(text);
    const dubbedLabel = isDubbed(`${filename} ${text} ${videoUrl}`) ? ' • دوبله' : '';
    const streamName = buildStreamName(quality, dubbedLabel, subtitleStatus);
    const encoderTitle = encoder ? ` • encoder: ${encoder}` : '';
    const subtitleTitle = formatSubtitleLabel(subtitleStatus);
    const subtitleTitlePart = subtitleTitle ? ` • ${subtitleTitle}` : '';

    streams.push({
      name: streamName,
      title: `${filenameWithoutExtension || filename}${extension ? `.${extension}` : ''}${encoderTitle}${subtitleTitlePart}`,
      url: videoUrl
    });

    debugLog('PARSER', `Added movie file: ${filename}`, {
      extension,
      quality,
      encoder,
      url: sanitizeUrlForLog(videoUrl)
    });
  });

  debugLog('PARSER', `movie extraction complete: ${streams.length} file(s)`);
  return streams;
}

/**
 * Main stream handler - get streams for a given content
 */
async function getStreams(type, imdbId, season = null, episode = null) {
  debugLog('STREAM', `Request type=${type} imdb=${imdbId} season=${season} episode=${episode}`);
  // Temporarily disabled trailer stream
  const ENABLE_TRAILER_STREAM = false;
  const trailerStream = (ENABLE_TRAILER_STREAM && imdbId && String(imdbId).startsWith('tt')) ? {
    name: '🎬 تریلر رسمی',
    title: 'مشاهده تریلر رسمی در IMDb\n⭐ Official IMDb Trailer',
    externalUrl: `https://www.imdb.com/title/${imdbId}/videogallery/`
  } : null;

  // Resolve the metadata title (and year) from Stremio's cinemeta service.
  const meta = await fetchTitleFromMeta(type, imdbId);
  const title = meta ? meta.name : null;
  const year = meta ? meta.year : null;
  if (title) verboseLog('STREAM', `meta title=${title} year=${year}`);

  let contentUrl = null;

  try {
    contentUrl = await resolveViaQuickSearch(imdbId, title, year, type);
  } catch (e) {
    debugLog('STREAM', `resolveViaQuickSearch threw`, { error: e.message });
  }

  if (!contentUrl) {
    debugLog('STREAM', `Failed to resolve content URL for ${imdbId}`);
    return trailerStream ? [trailerStream] : [];
  }

  debugLog('STREAM', `contentUrl resolved: ${sanitizeUrlForLog(contentUrl)}`);

  let $ = null;
  try {
    $ = await fetchPage(contentUrl);
  } catch (e) {
    debugLog('STREAM', `fetchPage threw`, { error: e.message });
    return trailerStream ? [trailerStream] : [];
  }

  if (!$) {
    debugLog('STREAM', `Failed to fetch content page: ${sanitizeUrlForLog(contentUrl)}`);
    return trailerStream ? [trailerStream] : [];
  }

  let streams = [];
  try {
    if (type === 'series' && season !== null && episode !== null) {
      debugLog('STREAM', `Looking for Season ${season}, Episode ${episode}`);
      streams = await extractSeriesStreams($, season, episode);
    } else if (type === 'movie') {
      streams = extractMovieStreams($);
    } else {
      debugLog('STREAM', `Unknown type or missing season/episode`, { type, season, episode });
    }
  } catch (e) {
    debugLog('STREAM', `parser threw`, { error: e.message, stack: e.stack && e.stack.slice(0, 800) });
    return trailerStream ? [trailerStream] : [];
  }

  debugLog('STREAM', `Found ${streams.length} stream(s) for ${imdbId}`);

  // Validate stream objects and remove duplicate URLs. Some source pages
  // expose the same download link through nested/overlapping containers, so
  // the parser can encounter one physical file more than once.
  const seenUrls = new Set();
  const validStreams = streams.filter(s => {
    if (!s || !s.url || typeof s.url !== 'string' || !s.url.startsWith('http')) {
      return false;
    }

    if (seenUrls.has(s.url)) {
      return false;
    }

    seenUrls.add(s.url);
    return true;
  });

  const duplicateCount = streams.length - validStreams.length - streams.filter(s => s && s.url && typeof s.url === 'string' && s.url.startsWith('http')).length + streams.filter(s => s && s.url && typeof s.url === 'string' && s.url.startsWith('http')).length;
  if (validStreams.length !== streams.length) {
    debugLog('STREAM', `filtered duplicate/invalid streams`, {
      original: streams.length,
      valid_unique: validStreams.length
    });
  }

  if (validStreams.length > 0) {
    const donationStream = {
      name: '💖 Persian Streams',
      title: '⚡ جهت نگهداری و بهبود پروژه لطفا دونیت کنید\n🔗 کلیک کنید: alirostami.com/support',
      externalUrl: 'https://alirostami.com/support'
    };
    return trailerStream
      ? [donationStream, trailerStream, ...validStreams]
      : [donationStream, ...validStreams];
  }

  if (trailerStream) {
    return [trailerStream];
  }

  return validStreams;
}

// ---- Catalog Support --------------------------------------------------------
function decodeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

function cleanText(str) {
  return decodeHtmlEntities(String(str || '').replace(/<[^>]*>/g, '')).trim();
}

function toCatalogMeta(item, expectedType) {
  if (!item || item._kind === 'term') return null;

  const imdbId = item.imdb_id || item.imdb;
  if (!imdbId || !String(imdbId).startsWith('tt')) return null;

  const isSeries = item.type === 'series' || String(item.url || '').startsWith('/series/');
  const itemType = isSeries ? 'series' : 'movie';
  if (expectedType && expectedType !== itemType) return null;

  const rawTitle = item.title || item.name;
  const rawTitleFa = item.title_fa || '';
  const title = cleanText(rawTitle) || cleanText(rawTitleFa);
  if (!title) return null;

  // Stremio poster proxied through our addon to load reliably without VPN in Iran
  let poster = undefined;
  if (imdbId && String(imdbId).startsWith('tt')) {
    const cachedImdb = imdbPosterCache.get(imdbId);
    if (cachedImdb && cachedImdb.url) {
      poster = cachedImdb.url;
    } else {
      poster = `https://images.metahub.space/poster/medium/${imdbId}/img.jpg`;
    }
  } else if (item.image) {
    const rawImage = String(item.image).trim();
    if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
      poster = rawImage;
    } else {
      poster = `${BASE_URL.replace(/\/$/, '')}${rawImage.startsWith('/') ? '' : '/'}${rawImage}`;
    }
  }

  if (poster) {
    poster = proxyImageUrl(poster);
  }

  const persianTitle = cleanText(rawTitleFa);
  const rating = item.rating ? String(item.rating) : null;
  const descParts = [];
  if (persianTitle) descParts.push(persianTitle);

  const tags = [];
  if (item.is_dubbled) tags.push('🎙️ دوبله فارسی');
  if (item.is_hardsub) tags.push('📝 زیرنویس چسبیده');
  if (rating) tags.push(`⭐ امتیاز: ${rating}/10`);
  if (item.year) tags.push(`📅 سال: ${item.year}`);
  if (tags.length > 0) descParts.push(tags.join(' | '));

  return {
    id: String(imdbId).trim(),
    type: itemType,
    name: title,
    poster,
    releaseInfo: item.year ? String(item.year) : undefined,
    description: descParts.length > 0 ? descParts.join('\n\n') : undefined,
    imdbRating: rating || undefined
  };
}

const LATEST_CATALOG_LIMIT = 1000;
const CATALOG_SEARCH_LIMIT = 100;
const CATALOG_PAGE_SIZE = 20;
const CATALOG_CACHE_TTL = 10 * 60 * 1000;

let latestCatalogCache = {
  movie: [],
  series: [],
  timestamp: 0
};

async function getLatestCatalog(type) {
  const isCacheValid = (Date.now() - latestCatalogCache.timestamp < CATALOG_CACHE_TTL) &&
    Array.isArray(latestCatalogCache[type]) &&
    latestCatalogCache[type].length > 0;

  if (isCacheValid) {
    return latestCatalogCache[type];
  }

  try {
    const response = await client.get(`/quick-search?q=&sort=release_date%3Adesc&limit=${LATEST_CATALOG_LIMIT}`);
    let results = response.data;
    if (!Array.isArray(results)) {
      results = (results && (results.data || results.results)) || [];
    }
    if (!Array.isArray(results)) return latestCatalogCache[type] || [];

    // Sort numerically by modified_at desc (newest posts and episode updates appear first)
    results.sort((a, b) => {
      const modB = Number(b.modified_at || 0);
      const modA = Number(a.modified_at || 0);
      if (modB !== modA) return modB - modA;
      const relB = Number(b.release_date || 0);
      const relA = Number(a.release_date || 0);
      return relB - relA;
    });

    const movieMetas = [];
    const seriesMetas = [];
    const seenMovies = new Set();
    const seenSeries = new Set();

    for (const item of results) {
      const meta = toCatalogMeta(item);
      if (!meta) continue;

      if (meta.type === 'movie' && !seenMovies.has(meta.id)) {
        seenMovies.add(meta.id);
        movieMetas.push(meta);
      } else if (meta.type === 'series' && !seenSeries.has(meta.id)) {
        seenSeries.add(meta.id);
        seriesMetas.push(meta);
      }
    }

    latestCatalogCache = {
      movie: movieMetas,
      series: seriesMetas,
      timestamp: Date.now()
    };

    return latestCatalogCache[type] || [];
  } catch (err) {
    console.error('[CATALOG] Error fetching latest catalog items:', err.message);
    return latestCatalogCache[type] || [];
  }
}

async function searchCatalog(query, type) {
  try {
    const response = await client.get(`/quick-search?q=${encodeURIComponent(query)}&limit=${CATALOG_SEARCH_LIMIT}`);
    let results = response.data;
    if (!Array.isArray(results)) {
      results = (results && (results.data || results.results)) || [];
    }
    if (!Array.isArray(results)) return [];

    // Sort search results by modified_at descending so newest updates appear first
    results.sort((a, b) => (Number(b.modified_at || 0) - Number(a.modified_at || 0)));

    const metas = [];
    const seen = new Set();
    for (const item of results) {
      const meta = toCatalogMeta(item, type);
      if (!meta || seen.has(meta.id)) continue;
      seen.add(meta.id);
      metas.push(meta);
    }
    return metas;
  } catch (err) {
    console.error(`[CATALOG] Search error for query "${query}":`, err.message);
    return [];
  }
}

builder.defineCatalogHandler(async (args) => {
  const { type, id, extra } = args;
  try {
    const skip = Number((extra && extra.skip) || 0) || 0;
    const search = extra && extra.search ? String(extra.search).trim() : null;

    let metas = [];
    if (search) {
      metas = await searchCatalog(search, type);
    } else {
      metas = await getLatestCatalog(type);
    }

    return {
      metas: metas.slice(skip, skip + CATALOG_PAGE_SIZE),
      cacheMaxAge: 600,
      staleRevalidate: 1200
    };
  } catch (err) {
    console.error('[CATALOG] Error handling catalog request:', err.message);
    return { metas: [] };
  }
});

// Define meta handler
builder.defineMetaHandler(async (args) => {
  const { type, id, config } = args;
  debugLog('HANDLER', `Meta request: type=${type}, id=${id}`);
  const origin = (config && config.origin) || PUBLIC_URL;
  return getMeta(type, id, origin);
});

// Define stream handler
builder.defineStreamHandler(async (args) => {
  const { type, id } = args;
  let imdbId = id;
  let season = null;
  let episode = null;

  if (type === 'series') {
    const parts = id.split(':');
    imdbId = parts[0];
    season = parts[1] ? parseInt(parts[1], 10) : null;
    episode = parts[2] ? parseInt(parts[2], 10) : null;
    debugLog('HANDLER', `Series request: ${imdbId}, S${season}E${episode}`);
  } else {
    debugLog('HANDLER', `Movie request: ${imdbId}`);
  }

  const streams = await getStreams(type, imdbId, season, episode);
  return { streams: streams || [] };
});

const addonInterface = builder.getInterface();

module.exports = {
  manifest: addonInterface.manifest || manifest,
  get: addonInterface.get.bind(addonInterface),
  getInterface: () => addonInterface,
  getStreams,
  getMeta,
  proxyImageUrl,
  setPublicUrl,
  getPublicUrl,
  setBaseUrl,
  getBaseUrl,
  fetchTitleFromMeta,
  resolveViaQuickSearch,
  fetchPage,
  extractMovieStreams,
  extractSeriesStreams,
  toCatalogMeta,
  getLatestCatalog,
  searchCatalog,
  extractSeasonNumber,
  cleanText,
  decodeHtmlEntities,
  fetchImdbPoster
};
