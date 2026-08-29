/**
 * F2My.top Stremio Addon
 * 
 * Scrapes streaming links from https://www.f2my.top for movies and TV series.
 * This is an Iranian source providing content with Persian subtitles.
 * 
 * The site uses title-based URLs (e.g., /series/house-of-the-dragon/)
 * so we fetch the title from Stremio's metadata service and convert it to a slug.
 */

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { addonBuilder } = require('stremio-addon-sdk');
require('dotenv').config();

const PORT = process.env.PORT || 8000;
const BASE_URL = process.env.BASE_URL;

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

// Initialize addon builder with manifest
const builder = new addonBuilder({
  id: 'org.f2my.stremio',
  name: 'F2My.top',
  description: 'Iranian streaming source - Movies & Series with Persian Subtitles',
  version: '1.2.0',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [],
  logo: 'https://www.f2my.top/favicon.ico'
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
 * Search the site for content and return the best matching content URL.
 *
 * Real content URLs have the format https://www.f2my.top/<id>/<slug>/
 * (e.g. https://www.f2my.top/76906/spider-man-brand-new-day/), so we match
 * that pattern and rank results by how well the slug matches the query.
 */
async function searchSite(query) {
  try {
    const searchUrl = `/?s=${encodeURIComponent(query)}`;
    console.log(`Searching site for: ${query}`);

    const response = await client.get(searchUrl);
    if (response.status !== 200) return null;

    const $ = cheerio.load(response.data);
    const candidates = [];

    // Match real content pages: https://www.f2my.top/<numeric-id>/<slug>/
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const m = href.match(/f2my\.top\/(\d+)\/([^\/\?#]+)\/?$/i);
      if (m) {
        candidates.push({ url: href, slug: m[2].toLowerCase() });
      }
    });

    if (!candidates.length) return null;

    // Rank candidates by how many query tokens appear in the slug
    const tokens = query
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const scored = candidates.map(c => {
      const score = tokens.reduce((s, t) => s + (c.slug.includes(t) ? 1 : 0), 0);
      return { ...c, score };
    });

    scored.sort((a, b) => b.score - a.score || b.slug.length - a.slug.length);

    const best = scored[0].url;
    console.log(`Found via search (score ${scored[0].score}): ${best}`);
    return best;
  } catch (error) {
    console.error('Search error:', error.message);
    return null;
  }
}

/**
 * Build a URL-friendly slug from a title (lowercase, drop apostrophes/quotes,
 * replace non-alphanumerics with hyphens). The site matches these loosely,
 * e.g. /movie/dont-say-good-luck/ -> /84233/dont-say-good-luck-2026/.
 */
function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/[''`\u2019\u2018]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

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
 * Resolve the real content URL via the site's direct endpoint.
 *
 * Movies:  /movie/<slug>/  302-redirects to /<id>/<slug>/  (the content page)
 * Series:  /series/<slug>/ is itself the content page (HTTP 200)
 *
 * Unknown slugs redirect to /profile/, which we treat as "not found".
 *
 * @returns {Promise<string|null>} final content URL or null
 */
async function resolveViaEndpoint(title, type) {
  try {
    const slug = slugifyTitle(title);
    const kind = type === 'series' ? 'series' : 'movie';
    console.log(`Resolving via /${kind}/${slug}/ ...`);

    const response = await client.get(`/${kind}/${slug}/`);
    const finalUrl = response.request.res.responseUrl || `${BASE_URL}${response.config.url}`;

    if (finalUrl && finalUrl.includes('f2my.top') && !finalUrl.includes('/profile/')) {
      console.log(`Resolved via endpoint: ${finalUrl}`);
      return finalUrl;
    }
    console.log(`Endpoint did not resolve (${finalUrl})`);
    return null;
  } catch (error) {
    console.log(`Endpoint resolve error: ${error.message}`);
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
 * Extract streams from series page for specific season/episode
 */
function extractSeriesStreams($, targetSeason, targetEpisode) {
  const streams = [];
  const targetEpNum = parseInt(targetEpisode, 10);

  console.log(`Looking for Season ${targetSeason}, Episode ${targetEpisode}`);

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

    const digitSeasonMatch = buttonText.match(/(?:season|fصل)[\s\u06F0-\u06F9\u0660-\u0669]*(\d+)/i);
    if (digitSeasonMatch) {
      seasonNum = parseInt(digitSeasonMatch[1], 10);
    }

    if (parseInt(targetSeason, 10) !== seasonNum) return;

    console.log(`Found matching season container (Season ${seasonNum})`);

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

      console.log(`Found matching episode ${epNum}`);

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
        const quality = detectQuality(videoUrl, buttonText + ' ' + epText);
        // Check if the content is dubbed based on episode text and video URL
        const dubbedLabel = isDubbed(epText + ' ' + videoUrl) ? ' • دوبله' : '';
        streams.push({
          name: `F2My.top\n${quality} • Iranian Source${dubbedLabel}`,
          title: `S${targetSeason}E${targetEpisode} - ${quality}\nPersian Subtitles`,
          url: videoUrl
        });
        console.log(`Added stream: ${quality}${dubbedLabel}`);
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

  $('.download-list, .download-box, .dl-box').each((_, box) => {
    const $box = $(box);
    const qualityLabel = $box.find('.title span').first().text() || '';

    $box.find('a[href*=".mkv"], a[href*=".mp4"], a[href*="http"]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();

      if (href && (href.includes('.mkv') || href.includes('.mp4') || href.includes('abrtech'))) {
        const onclick = $(el).attr('onclick');
        let videoUrl = href;

        if (onclick) {
          const urlMatch = onclick.match(/handleDownloadClick\(['"]([^'"]+)['"]/);
          if (urlMatch) videoUrl = urlMatch[1];
        }

        const quality = detectQuality(videoUrl, qualityLabel + ' ' + text);
        // Check if the content is dubbed based on text and video URL
        const dubbedLabel = isDubbed(text + ' ' + videoUrl) ? ' • دوبله' : '';
        streams.push({
          name: `F2My.top\n${quality} • Iranian Source${dubbedLabel}`,
          title: `${quality}\nPersian Subtitles`,
          url: videoUrl
        });
      }
    });
  });

  $('iframe[src]').each((_, iframe) => {
    const src = $(iframe).attr('src');
    if (src && (src.includes('.mp4') || src.includes('.m3u8'))) {
      streams.push({
        name: `F2My.top\nStream`,
        title: 'Embedded Stream',
        url: src
      });
    }
  });

  return streams;
}

/**
 * Main stream handler - get streams for a given content
 */
async function getStreams(type, imdbId, season = null, episode = null) {
  console.log('\n=== Stream Request ===');
  console.log(`Type: ${type}, IMDB: ${imdbId}, Season: ${season}, Episode: ${episode}`);

  // Resolve the metadata title (and year) from Stremio's cinemeta service.
  const meta = await fetchTitleFromMeta(type, imdbId);
  const title = meta ? meta.name : null;
  const year = meta ? meta.year : null;

  let contentUrl = null;

  // Step 1 (preferred): query the site's quick-search endpoint by the IMDB id
  // and match the returned `imdb_id`. This works for both movies and series
  // and is far more reliable than title/slug-based lookups.
  contentUrl = await resolveViaQuickSearch(imdbId);

  // Step 2: Fallback to the site's direct /movie/<slug>/ or /series/<slug>/
  // endpoint using the title.
  if (!contentUrl && title) {
    contentUrl = await resolveViaEndpoint(title, type);
  }

  // Step 3: Fallback to site search using the title (and year). The site
  // indexes titles with a curly apostrophe (Don't), so we also try a query
  // with straight quotes normalized to curly, otherwise search returns nothing.
  if (!contentUrl && title) {
    const queries = [
      title,
      year ? `${title} ${year}` : null,
      title.replace(/[''`]/g, '\u2019'),
      year ? `${title.replace(/[''`]/g, '\u2019')} ${year}` : null
    ].filter(Boolean);

    for (const q of queries) {
      contentUrl = await searchSite(q);
      if (contentUrl) break;
    }
  }

  if (!contentUrl) {
    console.log('No content found for this IMDB ID');
    return [];
  }

  // Step 4: Fetch the content page
  let $ = await fetchPage(contentUrl);

  // Step 4: If page fetch failed, try search fallback once more
  if (!$) {
    console.log('Direct page fetch failed, trying search fallback...');
    const searchUrl = await searchSite(title || imdbId);
    if (searchUrl) {
      contentUrl = searchUrl;
      $ = await fetchPage(contentUrl);
    }
  }

  if (!$) {
    console.log('Failed to load content page');
    return [];
  }

  // Step 5: Extract streams based on type
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
    console.log(`Series request: ${imdbId}, S${season}E${episode}`);
  } else {
    console.log(`Movie request: ${imdbId}`);
  }

  return getStreams(type, imdbId, season, episode)
    .then(streams => ({ streams }))
    .catch(error => {
      console.error('Handler error:', error);
      return { streams: [] };
    });
});

// Export addon interface
module.exports = builder.getInterface();

// Start server if run directly
if (require.main === module) {
  const { serveHTTP } = require('stremio-addon-sdk');
  const addonInterface = builder.getInterface();

  serveHTTP(addonInterface, { port: PORT });

  console.log('\n===========================================');
  console.log('F2My.top Stremio Addon (Iranian Source)');
  console.log('===========================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
  console.log(`Install: stremio://localhost:${PORT}/manifest.json`);
  console.log('===========================================\n');
}
