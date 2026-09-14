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
  BASE_URL = 'https://f2my.top';
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

// Create axios instance with proper headers
let client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': BASE_URL,
  },
  timeout: 15000,
  maxRedirects: 5,
  validateStatus: status => status < 500
});

function setBaseUrl(newBaseUrl) {
  if (newBaseUrl && newBaseUrl !== BASE_URL) {
    BASE_URL = newBaseUrl;
    if (client && client.defaults) {
      client.defaults.baseURL = BASE_URL;
      if (client.defaults.headers) {
        client.defaults.headers['Referer'] = BASE_URL;
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
const builder = new addonBuilder({
  id: 'org.alirostami.streams.persian',
  name: 'Persian Streams',
  description: 'Fast streaming links from Iranian media providers with Persian subtitles and audio.\n\nAuthor: Ali Rostami  \nWebsite: alirostami.com/support \nGitHub: https://github.com/alirostami01/Persian-Streams/',
  version: '1.2.0',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [],
  contactEmail: 'rostami.ali@gmail.com',
  author: 'Ali Rostami rostami.ali@gmail.com',
  logo: LOGO
});

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
async function resolveViaQuickSearch(imdbId, title = null, year = null) {
  const normalizeImdb = value => String(value ?? '').trim().toLowerCase();
  const requestedImdb = normalizeImdb(imdbId);

  const queries = [imdbId];
  if (title && String(title).trim()) {
    queries.push(String(title).trim());
    if (year) queries.push(`${String(title).trim()} ${year}`);
  }

  for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    const query = queries[queryIndex];
    const mode = queryIndex === 0 ? 'imdb' : (queryIndex === 1 ? 'title' : 'title_year');
    debugLog('QUICK_SEARCH', `query=${query} mode=${mode} imdb=${imdbId}`);

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

      const match = results.find(r => {
        if (!r || r._kind === 'term') return false;
        const candidateImdb = normalizeImdb(r.imdb_id || r.imdb);
        return candidateImdb === requestedImdb;
      });

      const exactMatch = match
        ? JSON.stringify({
            imdb_id: match.imdb_id || match.imdb,
            url: match.url,
            title: match.title || match.name,
            kind: match._kind
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
 * Fetch and parse a page with detailed diagnostics
 */
async function fetchPage(url) {
  if (!url) {
    debugLog('FETCH', `url is null/empty, cannot fetch`);
    return null;
  }
  debugLog('FETCH', `url=${sanitizeUrlForLog(url)}`);
  try {
    const response = await client.get(url);
    const status = response.status;
    const finalUrl = response.request && response.request.res && response.request.res.responseUrl
      ? response.request.res.responseUrl
      : (response.request && response.request.responseURL) || url;
    const contentType = response.headers && response.headers['content-type'];
    const body = response.data;
    const bodyLength = body ? String(body).length : 0;
    const isHtml = contentType && contentType.includes('text/html');
    const bodyStr = body ? String(body) : '';

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

    const containsAkira = bodyStr.toLowerCase().includes('akira');
    const containsDownloadList = bodyStr.includes('download-list');
    const containsMkv = bodyStr.toLowerCase().includes('.mkv');
    const containsAbrtech = bodyStr.toLowerCase().includes('abrtech');
    debugLog('FETCH', `contains_akira=${containsAkira} contains_download_list=${containsDownloadList} contains_mkv=${containsMkv} contains_abrtech=${containsAbrtech}`);

    if (status !== 200) {
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

    verboseLog('FETCH', `load cheerio`, { body_preview: bodyStr.slice(0, 300).replace(/\n/g, ' ') });
    return cheerio.load(bodyStr);
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

function extractSeasonNumberFromLegacyLink(text, href) {
  const combined = toEnglishDigits(`${text || ''} ${decodeUrlPart(href || '')}`);

  const seasonMatch = combined.match(/(?:فصل|season|\bS)\s*0*(\d{1,2})\b/i);
  if (seasonMatch) return parseInt(seasonMatch[1], 10);

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

    // Determine season number from Persian or English text
    let seasonNum = seasonIdx + 1;

    const persianNumbers = {
      'اول': 1, 'دوم': 2, 'سوم': 3, 'چهارم': 4, 'پنجم': 5,
      'ششم': 6, 'هفتم': 7, 'هشتم': 8, 'نهم': 9, 'دهم': 10
    };

    for (const [persian, digit] of Object.entries(persianNumbers)) {
      if (buttonText.includes(persian)) {
        seasonNum = digit;
        break;
      }
    }

    const digitSeasonMatch = buttonText.match(/(?:season|فصل)[\s\u06F0-\u06F9\u0660-\u0669]*(\d+)/i);
    if (digitSeasonMatch) {
      seasonNum = parseInt(digitSeasonMatch[1], 10);
    }

    if (parseInt(targetSeason, 10) !== seasonNum) return;

    debugLog('PARSER', `Found matching season container (Season ${seasonNum})`);

    const episodeItems = $seasonEl.find('.series-downloaditems .d-flex');

    episodeItems.each((epIdx, epEl) => {
      const $epEl = $(epEl);
      const epLink = $epEl.find('a.btn-block.btn-default').first();
      const epText = epLink.text().trim();
      let epNum = epIdx + 1;

      const persianEpMatch = epText.match(/(?:قسمت)[\s\u06F0-\u06F9\u0660-\u0669]*(\d+)/i);
      if (persianEpMatch) {
        epNum = parseInt(persianEpMatch[1], 10);
      } else {
        const englishEpMatch = epText.match(/(?:episode|ep)[\s\u06F0-\u06F9\u0660-\u0669]*(\d+)/i);
        if (englishEpMatch) {
          epNum = parseInt(englishEpMatch[1], 10);
        } else {
          const href = epLink.attr('href');
          if (href) {
            const hrefEpMatch = href.match(/[?&]episode=(\d+)/i);
            if (hrefEpMatch) epNum = parseInt(hrefEpMatch[1], 10);
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
  debugLog('PARSER', `Extracting movie streams...`);
  const pageReleaseInfo = extractReleaseInfoFromElement($, $('main, article, .single, .post, body').first()[0]);

  const downloadListCount = $('.download-list').length;
  const downloadBoxCount = $('.download-box').length;
  const dlBoxCount = $('.dl-box').length;
  const mkvLinkCount = $('a[href*=".mkv"]').length;
  const mp4LinkCount = $('a[href*=".mp4"]').length;
  const iframeCount = $('iframe[src]').length;
  debugLog('PARSER', `download-list-count=${downloadListCount} download-box-count=${downloadBoxCount} dl-box-count=${dlBoxCount} mkv-link-count=${mkvLinkCount} mp4-link-count=${mp4LinkCount} iframe-count=${iframeCount}`);

  $('.download-list, .download-box, .dl-box').each((_, box) => {
    const $box = $(box);
    const qualityLabel = $box.find('.title span').first().text() || '';

    $box.find('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const onclick = $(el).attr('onclick') || '';
      const text = $(el).text().trim();
      const combinedForFilter = `${href} ${onclick}`;

      // Support both direct href and onclick-based URLs (e.g., href="#" with handleDownloadClick)
      if (!(combinedForFilter.includes('.mkv') || combinedForFilter.includes('.mp4') || combinedForFilter.includes('abrtech'))) return;

      let videoUrl = href;
      if (onclick) {
        const urlMatch = onclick.match(/handleDownloadClick\(['"]([^'"]+)['"]/);
        if (urlMatch) videoUrl = urlMatch[1];
      }
      // If href is empty or placeholder like "#", fallback to onclick URL
      if (!videoUrl || videoUrl === '#' || videoUrl.trim() === '') {
        const urlMatch = onclick.match(/handleDownloadClick\(['"]([^'"]+)['"]/);
        if (urlMatch) videoUrl = urlMatch[1];
      }
      if (!videoUrl) return;

      // Ensure absolute URL
      if (!videoUrl.startsWith('http')) {
        videoUrl = resolveUrl(videoUrl, BASE_URL);
      }

      if (!videoUrl || !videoUrl.startsWith('http')) {
        debugLog('PARSER', `skipping invalid url`, { href, videoUrl });
        return;
      }

      const releaseElement = $(el).closest('.d-flex, li, .download-item, .download-list, .download-box, .dl-box');
      const releaseInfo = extractReleaseInfoNearElement($, releaseElement[0] || box);
      const boxReleaseInfo = extractReleaseInfoFromElement($, box);
      const fallbackContext = `${qualityLabel} ${releaseElement.text()} ${text} ${videoUrl}`;
      const quality = releaseInfo.quality || boxReleaseInfo.quality || detectQuality(videoUrl, fallbackContext);
      const encoder = releaseInfo.encoder || boxReleaseInfo.encoder;
      const subtitleStatus = releaseInfo.subtitleStatus || boxReleaseInfo.subtitleStatus || pageReleaseInfo.subtitleStatus;
      // Check if the content is dubbed based on text and video URL
      const dubbedLabel = isDubbed(`${releaseElement.text()} ${text} ${videoUrl}`) ? ' • دوبله' : '';
      const streamName = buildStreamName(quality, dubbedLabel, subtitleStatus);
      const encoderTitle = encoder ? ` • encoder: ${encoder}` : '';
      const subtitleTitle = formatSubtitleLabel(subtitleStatus);
      const subtitleTitlePart = subtitleTitle ? ` • ${subtitleTitle}` : '';

      verboseLog('PARSER', `candidate quality=${quality} extension=${videoUrl.split('.').pop().split('?')[0]} encoder=${encoder} dubbed=${!!dubbedLabel} url=${sanitizeUrlForLog(videoUrl)}`);

      // Validate stream object format
      if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.length === 0) {
        debugLog('PARSER', `skipping stream with invalid url`);
        return;
      }

      streams.push({
        name: streamName,
        title: `${quality}${encoderTitle}${subtitleTitlePart}`,
        url: videoUrl
      });
    });
  });

  // Fallback: if no streams found but there are mkv links elsewhere (e.g., different HTML structure or onclick-based)
  if (streams.length === 0) {
    const fallbackLinks = $('a');
    let candidateCount = 0;
    fallbackLinks.each((_, el) => {
      const href = $(el).attr('href') || '';
      const onclick = $(el).attr('onclick') || '';
      const combined = `${href} ${onclick}`;
      if (!(combined.includes('.mkv') || combined.includes('.mp4') || combined.includes('abrtech'))) return;
      candidateCount++;
    });
    if (candidateCount > 0) {
      debugLog('PARSER', `no streams from boxes, trying fallback link scan: ${candidateCount} candidates`);
      fallbackLinks.each((_, el) => {
        let href = $(el).attr('href') || '';
        let onclick = $(el).attr('onclick') || '';
        const combined = `${href} ${onclick}`;
        if (!(combined.includes('.mkv') || combined.includes('.mp4') || combined.includes('abrtech'))) return;
        let videoUrl = href;
        if (onclick) {
          const urlMatch = onclick.match(/handleDownloadClick\(['"]([^'"]+)['"]/);
          if (urlMatch) videoUrl = urlMatch[1];
        }
        if (!videoUrl || videoUrl === '#' || videoUrl.trim() === '') {
          const urlMatch = onclick.match(/handleDownloadClick\(['"]([^'"]+)['"]/);
          if (urlMatch) videoUrl = urlMatch[1];
        }
        if (!videoUrl) return;
        if (!videoUrl.startsWith('http')) {
          videoUrl = resolveUrl(videoUrl, BASE_URL);
        }
        if (!videoUrl.startsWith('http')) return;
        const quality = detectQuality(videoUrl, $(el).text() || videoUrl);
        const dubbedLabel = isDubbed(`${$(el).text()} ${videoUrl}`) ? ' • دوبله' : '';
        const streamName = buildStreamName(quality, dubbedLabel, null);
        const existing = streams.find(s => s.url === videoUrl);
        if (!existing) {
          streams.push({
            name: streamName,
            title: quality,
            url: videoUrl
          });
          debugLog('PARSER', `Added fallback stream: ${streamName}`);
        }
      });
    }
  }

  $('iframe[src]').each((_, iframe) => {
    const src = $(iframe).attr('src');
    if (src && (src.includes('.mp4') || src.includes('.m3u8'))) {
      let videoUrl = src;
      if (!videoUrl.startsWith('http')) videoUrl = resolveUrl(videoUrl, BASE_URL);
      streams.push({
        name: `Stream`,
        title: 'Embedded Stream',
        url: videoUrl
      });
      debugLog('PARSER', `Added iframe stream: ${sanitizeUrlForLog(videoUrl)}`);
    }
  });

  debugLog('PARSER', `movie extraction complete: ${streams.length} streams`);
  return streams;
}

/**
 * Main stream handler - get streams for a given content
 */
async function getStreams(type, imdbId, season = null, episode = null) {
  debugLog('STREAM', `Request type=${type} imdb=${imdbId} season=${season} episode=${episode}`);
  verboseLog('STREAM', `BASE_URL=${BASE_URL}`);

  // Resolve the metadata title (and year) from Stremio's cinemeta service.
  const meta = await fetchTitleFromMeta(type, imdbId);
  const title = meta ? meta.name : null;
  const year = meta ? meta.year : null;
  if (title) verboseLog('STREAM', `meta title=${title} year=${year}`);

  let contentUrl = null;

  try {
    contentUrl = await resolveViaQuickSearch(imdbId, title, year);
  } catch (e) {
    debugLog('STREAM', `resolveViaQuickSearch threw`, { error: e.message });
  }

  if (!contentUrl) {
    debugLog('STREAM', `Failed to resolve content URL for ${imdbId}, returning empty streams`);
    return [];
  }

  debugLog('STREAM', `contentUrl resolved: ${sanitizeUrlForLog(contentUrl)}`);

  let $ = null;
  try {
    $ = await fetchPage(contentUrl);
  } catch (e) {
    debugLog('STREAM', `fetchPage threw`, { error: e.message });
    return [];
  }

  if (!$) {
    debugLog('STREAM', `Failed to fetch content page: ${sanitizeUrlForLog(contentUrl)}, returning empty streams`);
    return [];
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
    return [];
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

  return validStreams;
}

// Define stream handler
builder.defineStreamHandler((args) => {
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

  return getStreams(type, imdbId, season, episode);
});

module.exports = {
  manifest: builder.getManifest(),
  getStreams,
  setBaseUrl,
  getBaseUrl,
  fetchTitleFromMeta,
  resolveViaQuickSearch,
  fetchPage,
  extractMovieStreams,
  extractSeriesStreams
};
