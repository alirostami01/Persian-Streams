/**
 * Persian Streams - Stremio Addon
 *
 * Scrapes streaming links from the source configured via BASE_URL (in .env)
 * for movies and TV series. This is an Iranian source providing content with
 * Persian subtitles.
 *
 * Content is resolved by IMDB id through the site's quick-search endpoint,
 * which returns the canonical URL for both movies and series.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { addonBuilder } = require('stremio-addon-sdk');
require('dotenv').config();

const PORT = process.env.PORT || 8000;
const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) {
  console.error('BASE_URL is not set. Please define it in your .env file (e.g. BASE_URL=https://www.example.com)');
  process.exit(1);
}

// Create axios instance with proper headers
const client = axios.create({
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

// Logo is served as a static file by the HTTP server (see the express.static
// mount below), so it is referenced by a URL instead of being embedded.
//
// Stremio requires ABSOLUTE URLs for manifest images. PUBLIC_URL (optional, in
// .env) is the externally reachable origin of this addon; when it is set the
// manifest carries a correct absolute URL even for consumers that import this
// module directly. When it is not set we fall back to the local origin, and the
// /manifest.json route below rewrites the logo per-request from the Host header.
const LOGO_PATH = '/assets/icons/logo.png';
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

/**
 * Single source of truth for the absolute logo URL: joins any origin with
 * LOGO_PATH, tolerating a trailing slash on the origin.
 * @param {string} origin - externally reachable origin, e.g. https://host
 * @returns {string} absolute logo URL
 */
function logoUrlFor(origin) {
  return `${origin.replace(/\/+$/, '')}${LOGO_PATH}`;
}

const LOGO = logoUrlFor(PUBLIC_URL);

// Initialize addon builder with manifest
const builder = new addonBuilder({
  id: 'org.alirostami.streams.persian',
  name: 'Persian Streams',
  description: 'Fast streaming links from Iranian media providers with Persian subtitles and audio.\n\nAuthor: Ali Rostami  \nWebsite: alirostami.com/support \nGitHub: https://github.com/alirostami01/iranian-provider-media',
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
 * Resolve the real content URL via the site's quick-search endpoint using the
 * IMDB id. This is the most reliable method: we query the endpoint with the
 * IMDB code and match the returned `imdb_id` against the requested one, then
 * take that entry's `url` (works for both movies and series).
 *
 * @returns {Promise<string|null>} final content URL or null
 */
async function resolveViaQuickSearch(imdbId) {
  try {
    const qsUrl = `/quick-search?q=${encodeURIComponent(imdbId)}&sort=modified_at%3Adesc`;
    console.log(`Quick-search for IMDB ${imdbId} ...`);

    const response = await client.get(qsUrl);
    if (response.status !== 200 || !Array.isArray(response.data)) return null;

    const match = response.data.find(
      r => (r.imdb_id || '').toLowerCase() === imdbId.toLowerCase()
    );

    if (!match || !match.url) {
      console.log('Quick-search: no IMDB match found');
      return null;
    }

    const contentUrl = match.url.startsWith('http')
      ? match.url
      : `${BASE_URL}${match.url}`;

    if (contentUrl.includes('/profile/')) {
      console.log('Quick-search resolved to /profile/ (not found)');
      return null;
    }

    console.log(`Resolved via quick-search: ${contentUrl}`);
    return contentUrl;
  } catch (error) {
    console.log(`Quick-search error: ${error.message}`);
    return null;
  }
}

/**
 * Fetch and parse a page
 */
async function fetchPage(url) {
  try {
    const response = await client.get(url);
    if (response.status !== 200) {
      console.log(`Failed to fetch: Status ${response.status}`);
      return null;
    }
    if (!response.data || typeof response.data !== 'string') {
      console.log(`Empty or non-HTML response for ${url}`);
      return null;
    }
    return cheerio.load(response.data);
  } catch (error) {
    console.error(`Fetch error for ${url}:`, error.message);
    return null;
  }
}

/**
 * Detect video quality from URL and text
 */
function detectQuality(url, context = '') {
  // Decode once up front so percent-encoded values (e.g. ?quality=%31%30%38%30)
  // are matched by the same checks as plain text. decodeURIComponent throws on
  // malformed sequences, so fall back to the raw string.
  let decodedUrl = url || '';
  try {
    decodedUrl = decodeURIComponent(decodedUrl);
  } catch {
    // Malformed escape sequence - keep the raw URL.
  }

  const combined = (decodedUrl + ' ' + context).toLowerCase();

  if (combined.includes('2160') || combined.includes('4k') || combined.includes('uhd')) return '4K';
  if (combined.includes('1080') || combined.includes('full hd') || combined.includes('fhd')) return '1080p';
  // Match a standalone "hd"/"sd" token only, so arbitrary CDN hashes containing
  // those letters are not misread as a quality marker.
  if (combined.includes('720') || /\bhd\b/.test(combined)) return '720p';
  if (combined.includes('480') || /\bsd\b/.test(combined)) return '480p';
  if (combined.includes('360')) return '360p';

  return 'Unknown';
}

/**
 * Convert Persian (\u06F0-\u06F9) and Arabic-Indic (\u0660-\u0669) digits to
 * ASCII so numeric captures can be parsed with parseInt.
 * @param {string} text
 * @returns {string} text with all digits normalised to ASCII
 */
function normalizeDigits(text) {
  if (!text) return '';
  return text
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
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

/**
 * Persian ordinal words used in season headings, mapped to their season number.
 * Module-scope constant: read-only lookup, never mutated.
 */
const PERSIAN_NUMBERS = {
  'اول': 1, 'دوم': 2, 'سوم': 3, 'چهارم': 4, 'پنجم': 5,
  'ششم': 6, 'هفتم': 7, 'هشتم': 8, 'نهم': 9, 'دهم': 10
};

/**
 * Extract streams from series page for specific season/episode
 */
function extractSeriesStreams($, targetSeason, targetEpisode) {
  const streams = [];
  // targetSeason/targetEpisode are already numbers: the stream handler parses
  // them and getStreams only calls this once both are non-null.
  const targetEpNum = targetEpisode;


  $('.download-season').each((seasonIdx, seasonEl) => {
    const $seasonEl = $(seasonEl);
    const button = $seasonEl.find('button[data-bs-toggle="collapse"]').first();
    const buttonText = button.text();
    const buttonTextNorm = normalizeDigits(buttonText);

    // Determine season number from Persian or English text
    let seasonNum = seasonIdx + 1;

    for (const [persian, digit] of Object.entries(PERSIAN_NUMBERS)) {
      if (buttonText.includes(persian)) {
        seasonNum = digit;
        break;
      }
    }

    const digitSeasonMatch = buttonTextNorm.match(/(?:season|فصل)\s*(\d+)/i);
    if (digitSeasonMatch) {
      seasonNum = parseInt(digitSeasonMatch[1], 10);
    }

    if (targetSeason !== seasonNum) return;

    console.log(`Found matching season container (Season ${seasonNum})`);

    const episodeItems = $seasonEl.find('.series-downloaditems .d-flex');

    episodeItems.each((epIdx, epEl) => {
      const $epEl = $(epEl);
      const epLink = $epEl.find('a.btn-block.btn-default').first();
      const epText = epLink.text().trim();
      const epTextNorm = normalizeDigits(epText);
      let epNum = epIdx + 1;

      const persianEpMatch = epTextNorm.match(/(?:قسمت)\s*(\d+)/i);
      if (persianEpMatch) {
        epNum = parseInt(persianEpMatch[1], 10);
      } else {
        const englishEpMatch = epTextNorm.match(/(?:episode|ep)\s*(\d+)/i);
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

      console.log(`Found matching episode ${epNum}`);

      let videoUrl = null;

      // Strategy 1: scan every onclick handler in the episode row for a
      // handleDownloadClick(...) URL, taking the first one that parses.
      for (const aEl of $epEl.find('a[onclick]').toArray()) {
        if (videoUrl) break;
        const onclick = $(aEl).attr('onclick');
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

      if (videoUrl) {
        const quality = detectQuality(videoUrl, buttonText + ' ' + epText);
        // Check if the content is dubbed based on episode text and video URL
        const dubbedLabel = isDubbed(epText + ' ' + videoUrl) ? '• دوبله' : '';
        streams.push({
          name: `${quality}${dubbedLabel ? ` ${dubbedLabel}` : ''}`.trim(),
          title: `S${targetSeason}E${targetEpisode} - ${quality}`,
          url: videoUrl
        });
        console.log(`Added stream: ${quality}${dubbedLabel ? ` ${dubbedLabel}` : ''}`);
      }
    });
  });

  return streams;
}

/**
 * Extract streams from movie page
 */
function extractMovieStreams($) {
  const streams = [];
  console.log('Extracting movie streams...');

  for (const box of $('.download-list, .download-box, .dl-box').toArray()) {
    const $box = $(box);
    const qualityLabel = $box.find('.title span').first().text() || '';

    // The selector already guarantees the href contains .mkv/.mp4/abrtech,
    // so only the null/undefined guard is needed here.
    for (const el of $box.find('a[href*=".mkv"], a[href*=".mp4"], a[href*="abrtech"]').toArray()) {
      const href = $(el).attr('href');
      if (!href) continue;

      const text = $(el).text().trim();
      const onclick = $(el).attr('onclick');
      let videoUrl = href;

      if (onclick) {
        const urlMatch = onclick.match(/handleDownloadClick\(['"]([^'"]+)['"]/);
        if (urlMatch) videoUrl = urlMatch[1];
      }

      const quality = detectQuality(videoUrl, qualityLabel + ' ' + text);
      // Check if the content is dubbed based on text and video URL
      const dubbedLabel = isDubbed(text + ' ' + videoUrl) ? '• دوبله' : '';
      streams.push({
        name: `${quality}${dubbedLabel ? ` ${dubbedLabel}` : ''}`.trim(),
        title: quality,
        url: videoUrl
      });
    }
  }

  for (const iframe of $('iframe[src]').toArray()) {
    const src = $(iframe).attr('src');
    if (src && (src.includes('.mp4') || src.includes('.m3u8'))) {
      streams.push({
        name: 'Stream',
        title: 'Embedded Stream',
        url: src
      });
    }
  }

  return streams;
}

/**
 * Main stream handler - get streams for a given content
 */
async function getStreams(type, imdbId, season = null, episode = null) {
  console.log('\n=== Stream Request ===');
  console.log(`Type: ${type}, IMDB: ${imdbId}, Season: ${season}, Episode: ${episode}`);

  const contentUrl = await resolveViaQuickSearch(imdbId);
  if (!contentUrl) {
    console.log('No content URL resolved, aborting');
    return [];
  }

  const $ = await fetchPage(contentUrl);
  if (!$) {
    console.log('Failed to load content page, aborting');
    return [];
  }

  let streams = [];
  if (type === 'series' && season !== null && episode !== null) {
    console.log(`Looking for Season ${season}, Episode ${episode}`);
    streams = extractSeriesStreams($, season, episode);
  } else if (type === 'movie') {
    streams = extractMovieStreams($);
  }

  console.log(`Found ${streams.length} stream(s)`);
  return streams;
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
    console.log(`\nSeries request: ${imdbId}, S${season}E${episode}`);
  } else {
    console.log(`\nMovie request: ${imdbId}`);
  }

  return getStreams(type, imdbId, season, episode)
    .then(streams => ({ streams }))
    .catch(error => {
      console.error('Handler error:', error);
      return { streams: [] };
    });
});

// Export addon interface
const addonInterface = builder.getInterface();
module.exports = addonInterface;

// Start server if run directly
if (require.main === module) {
  const { getRouter } = require('stremio-addon-sdk');
  const express = require('express');
  const path = require('path');

  const app = express();

  // Override the manifest route to inject an absolute logo URL.
  // Stremio requires absolute URLs for images in the manifest. An explicit
  // PUBLIC_URL always wins; otherwise derive the origin from the request so the
  // addon works behind any host without configuration.
  app.get('/manifest.json', (req, res) => {
    const origin = process.env.PUBLIC_URL
      ? PUBLIC_URL
      : `${req.protocol}://${req.get('host') || `localhost:${PORT}`}`;
    const manifestWithLogo = {
      ...addonInterface.manifest,
      logo: logoUrlFor(origin)
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(manifestWithLogo));
  });

  // Serve the addon logo and other assets from the same origin. Mounted BEFORE
  // the SDK router so asset requests are never swallowed by it.
  app.use('/assets/icons', express.static(path.join(__dirname, 'assets', 'icons')));

  app.use(getRouter(addonInterface));

  app.get('/', (_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(
      `<h1>${addonInterface.manifest.name}</h1>` +
      `<p>${addonInterface.manifest.description}</p>` +
      `<p>${addonInterface.manifest.author}</p>` +
      `<p>Install: <a href="stremio://localhost:${PORT}/manifest.json">stremio://localhost:${PORT}/manifest.json</a></p>`
    );
  });

  app.listen(PORT, () => {
    console.log('\n===========================================');
    console.log(`${addonInterface.manifest.name} Stremio Addon (Iranian Source)`);
    console.log('===========================================');
    console.log(`Server running on port ${PORT}`);
    console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
    console.log(`Install: stremio://localhost:${PORT}/manifest.json`);
    console.log('===========================================\n');
  });
}

