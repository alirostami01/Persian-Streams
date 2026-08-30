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

const express = require('express');
const path = require('path');
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

// Logo is served as a static file by the HTTP server (see serveHTTP static
// option below), so it is referenced by a URL instead of being embedded.
const LOGO = '/assets/icons/logo.png';

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
    return cheerio.load(response.data);
  } catch (error) {
    console.error(`Fetch error for ${url}:`, error.message);
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
    'زیرنویس', 'Subtitle',
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
function extractReleaseInfoFromElement($, element) {
  if (!element) return { quality: null, encoder: null };

  const text = $(element).text();

  return {
    quality: extractLabeledValue(text, ['کیفیت', 'Quality']),
    encoder: extractLabeledValue(text, ['انکودر', 'Encoder', 'Encode'])
  };
}

/**
 * Try the current node first, then walk up a few parents. This handles pages
 * where quality/encoder labels are placed on a wrapper around the download row.
 */
function extractReleaseInfoNearElement($, element, maxDepth = 4) {
  let current = $(element);

  for (let depth = 0; depth <= maxDepth && current.length > 0; depth += 1) {
    const info = extractReleaseInfoFromElement($, current[0]);
    if (info.quality || info.encoder) return info;
    current = current.parent();
  }

  return { quality: null, encoder: null };
}

function buildStreamName(quality, dubbedLabel = '') {
  return `${quality}${dubbedLabel}`.trim();
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
        const releaseInfo = extractReleaseInfoNearElement($, epEl);
        const fallbackContext = `${buttonText} ${$epEl.text()} ${videoUrl}`;
        const quality = releaseInfo.quality || detectQuality(videoUrl, fallbackContext);
        const encoder = releaseInfo.encoder;
        // Check if the content is dubbed based on episode text and video URL
        const dubbedLabel = isDubbed(`${$epEl.text()} ${videoUrl}`) ? ' • دوبله' : '';
        const streamName = buildStreamName(quality, dubbedLabel);
        const encoderTitle = encoder ? ` • encoder: ${encoder}` : '';

        streams.push({
          name: streamName,
          title: `S${targetSeason}E${targetEpisode} - ${quality}${encoderTitle}`,
          url: videoUrl
        });
        console.log(`Added stream: ${streamName}`);
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

        const releaseElement = $(el).closest('.d-flex, li, .download-item, .download-list, .download-box, .dl-box');
        const releaseInfo = extractReleaseInfoNearElement($, releaseElement[0] || box);
        const boxReleaseInfo = extractReleaseInfoFromElement($, box);
        const fallbackContext = `${qualityLabel} ${releaseElement.text()} ${text} ${videoUrl}`;
        const quality = releaseInfo.quality || boxReleaseInfo.quality || detectQuality(videoUrl, fallbackContext);
        const encoder = releaseInfo.encoder || boxReleaseInfo.encoder;
        // Check if the content is dubbed based on text and video URL
        const dubbedLabel = isDubbed(`${releaseElement.text()} ${text} ${videoUrl}`) ? ' • دوبله' : '';
        const streamName = buildStreamName(quality, dubbedLabel);
        const encoderTitle = encoder ? ` • encoder: ${encoder}` : '';

        streams.push({
          name: streamName,
          title: `${quality}${encoderTitle}`,
          url: videoUrl
        });
      }
    });
  });

  $('iframe[src]').each((_, iframe) => {
    const src = $(iframe).attr('src');
    if (src && (src.includes('.mp4') || src.includes('.m3u8'))) {
      streams.push({
        name: `Stream`,
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

  contentUrl = await resolveViaQuickSearch(imdbId);

  let $ = await fetchPage(contentUrl);

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
module.exports = builder.getInterface();

// Start server if run directly
if (require.main === module) {
  const http = require('http');
  const { getRouter } = require('stremio-addon-sdk');
  const addonInterface = builder.getInterface();

  const app = express();

  // Override the manifest route to inject an absolute logo URL.
  // Stremio requires absolute URLs for images in the manifest.
  app.get('/manifest.json', (req, res) => {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const manifestWithLogo = {
      ...addonInterface.manifest,
      logo: `${protocol}://${host}/assets/icons/logo.png`
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(manifestWithLogo));
  });

  app.use(getRouter(addonInterface));

  // Serve the addon logo and other assets from the same origin so the manifest
  // can reference them by a relative URL (Stremio manifest size limit is 8kb).
  app.use('/assets/icons', express.static(path.join(__dirname, 'assets', 'icons')));

  app.get('/', (_, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(
      `<h1>${addonInterface.manifest.name}</h1>` +
      `<p>${addonInterface.manifest.description}</p>` +
      `<p>${addonInterface.manifest.author}</p>` +
      `<p>Install: <a href="stremio://localhost:${PORT}/manifest.json">stremio://localhost:${PORT}/manifest.json</a></p>`
    );
  });

  const server = http.createServer(app);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use.`);
      console.error('Stop the other process using this port, or start the addon with another port:');
      console.error(`PORT=${Number(PORT) + 1 || 8001} npm start\n`);
      process.exit(1);
    }

    console.error('Server error:', error);
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log('\n===========================================');
    console.log(`${addonInterface.manifest.name} Stremio Addon (Iranian Source)`);
    console.log('===========================================');
    console.log(`Server running on port ${PORT}`);
    console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
    console.log(`Install: stremio://localhost:${PORT}/manifest.json`);
    console.log('===========================================\n');
  });
}
