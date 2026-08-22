/**
 * Stremio.IR Stremio Addon
 * 
 * Scrapes streaming links from Iranian web sites for movies and TV series.
 * This is an Iranian source providing content with Persian subtitles.
 * 
 * The site uses title-based URLs (e.g., /series/house-of-the-dragon/)
 * so we fetch the title from Stremio's metadata service and convert it to a slug.
 */

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { addonBuilder } = require('stremio-addon-sdk');

const PORT = process.env.PORT || 8000;
const BASE_URL = 'https://www.f2my.top';

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
  id: 'org.stremioir.stremio',
  name: 'Stremio.IR',
  description: 'Iranian streaming source - Movies & Series with Persian Subtitles',
  version: '1.2.0',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [],
  logo: 'https://www.f2my.top/favicon.ico'
});

/**
 * Convert title to URL slug
 * "House of the Dragon" -> "house-of-the-dragon"
 * "Cape Fear (2024)" -> "cape-fear"
 */
function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .trim()
    .replace(/\s+/g, '-'); // Replace spaces with hyphens
}

/**
 * Clean title for slug generation (remove year, special chars)
 */
function cleanTitleForSlug(title) {
  // Remove year in parentheses
  let clean = title.replace(/\s*\(\d{4}\)\s*/g, '');
  // Remove common suffixes like "The Complete Series", etc.
  clean = clean.replace(/\s*-.*Complete.*$/i, '');
  clean = clean.replace(/\s*:.*$/i, '');
  return clean.trim();
}

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
      return response.data.meta.name;
    }
    return null;
  } catch (error) {
    console.log(`Failed to fetch metadata for ${imdbId}: ${error.message}`);
    return null;
  }
}

/**
 * Construct the content URL based on type and title from metadata
 */
async function constructContentUrl(type, imdbId) {
  // Fetch title from Stremio's metadata service
  const title = await fetchTitleFromMeta(type, imdbId);

  if (!title) {
    console.log(`Could not fetch title for ${imdbId}`);
    return null;
  }

  // Clean the title and convert to slug
  const cleanTitle = cleanTitleForSlug(title);
  const slug = titleToSlug(cleanTitle);

  console.log(`Original title: "${title}"`);
  console.log(`Cleaned title: "${cleanTitle}"`);
  console.log(`Generated slug: "${slug}"`);

  const url = `${BASE_URL}/${type === 'movie' ? 'movie' : 'series'}/${slug}/`;
  console.log(`Constructed URL: ${url}`);

  return url;
}

/**
 * Search the site for content as fallback
 */
async function searchSite(query) {
  try {
    const searchUrl = `/?s=${encodeURIComponent(query)}`;
    console.log(`Searching site for: ${query}`);

    const response = await client.get(searchUrl);
    if (response.status !== 200) return null;

    const $ = cheerio.load(response.data);
    let foundUrl = null;

    // Look for series/movie links in search results
    $('a[href*="/series/"], a[href*="/movie/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !foundUrl) {
        foundUrl = href;
        return false;
      }
    });

    if (foundUrl) {
      console.log(`Found via search: ${foundUrl}`);
      return foundUrl;
    }
    return null;
  } catch (error) {
    console.error('Search error:', error.message);
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
 * Extract full video quality label from filename using advanced regex
 * Captures complete technical specification strings like:
 * - WEB-DL 4K 2160p 10bit SDR
 * - WEB-DL 1080p Full HD
 * - BluRay 720p x265
 * - HDRip 480p x264
 * 
 * @param {string} filename - The video filename to parse
 * @returns {string} Full quality label or generic fallback
 */
function extractQualityLabel(filename) {
  if (!filename) return 'Unknown';

  const name = filename.toLowerCase();
  let qualityParts = [];

  // Extract source type (WEB-DL, BluRay, HDRip, etc.)
  const sourcePatterns = [
    /\b(web[\s.-]*dl|web[\s.-]*rip|web[\s.-]*hd|web[\s.-]*hdtv)\b/i,
    /\b(bluray|blu[\s.-]*ray|bd[\s.-]*rip|br[\s.-]*rip)\b/i,
    /\b(hd[\s.-]*rip|hdtv|dsr[\s.-]*rip|dv[\s.-]*rip)\b/i,
    /\b(dvd[\s.-]*rip|dvd[\s.-]*r|dvd9|dvd5)\b/i,
    /\b(cam[\s.-]*rip|cam|hdcam|ts[\s.-]*rip|telesync|tc|workprint)\b/i
  ];

  for (const pattern of sourcePatterns) {
    const match = filename.match(pattern);
    if (match) {
      // Normalize the source name
      let source = match[1].toLowerCase();
      source = source.replace(/[\s.-]+/g, '-').toUpperCase();
      // Special formatting
      if (source === 'WEB-DL') qualityParts.push('WEB-DL');
      else if (source === 'WEB-RIP') qualityParts.push('WEB-Rip');
      else if (source === 'BLU-RAY' || source === 'BD-RIP' || source === 'BR-RIP' || source === 'BLURAY') qualityParts.push('BluRay');
      else if (source === 'HD-RIP' || source === 'HDTV') qualityParts.push('HDRip');
      else if (source === 'DVD-RIP' || source === 'DVD-R' || source === 'DVD9' || source === 'DVD5') qualityParts.push('DVDRip');
      else if (['CAMRIP', 'CAM', 'HDCAM', 'TS-RIP', 'TELESYNC', 'TC', 'WORKPRINT'].includes(source)) qualityParts.push('CAM');
      else qualityParts.push(source);
      break;
    }
  }

  // Extract resolution (2160p, 1080p, 720p, 480p, etc.)
  const resolutionMatch = filename.match(/\b((?:2160|1080|720|480|360|240)[pi]?)\b/i);
  if (resolutionMatch) {
    let res = resolutionMatch[1].toLowerCase();
    // Normalize to standard format
    if (res.includes('2160')) qualityParts.push('2160p');
    else if (res.includes('1080')) qualityParts.push('1080p');
    else if (res.includes('720')) qualityParts.push('720p');
    else if (res.includes('480')) qualityParts.push('480p');
    else if (res.includes('360')) qualityParts.push('360p');
    else if (res.includes('240')) qualityParts.push('240p');
  }

  // Check for 4K/UHD tag (separate from resolution)
  if (/\b(4k|uhd)\b/i.test(filename) && !qualityParts.some(p => p.includes('2160'))) {
    // Add 4K indicator if not already captured via 2160p
    const has4kRes = qualityParts.some(p => p === '2160p');
    if (!has4kRes) {
      // Find position to insert 4K after source
      const sourceIdx = qualityParts.findIndex(p => ['WEB-DL', 'WEB-Rip', 'BluRay', 'HDRip', 'DVDRip', 'CAM'].includes(p));
      if (sourceIdx >= 0) {
        qualityParts.splice(sourceIdx + 1, 0, '4K');
      } else {
        qualityParts.unshift('4K');
      }
    }
  }

  // Extract bit depth (8bit, 10bit, 12bit, HDR, etc.)
  const bitDepthMatch = filename.match(/\b((?:8|10|12)[\s.-]*bit)\b/i);
  if (bitDepthMatch) {
    qualityParts.push(bitDepthMatch[1].replace(/[\s.-]/g, ''));
  }

  // Check for HDR variants
  const hdrPatterns = [
    /\b(hdr10[\s.-]*plus|hdr10\+|hdr10)\b/i,
    /\b(dolby[\s.-]*vision|dolby[\s.-]*iq|dv)\b/i,
    /\b(hdr)\b/i
  ];
  for (const pattern of hdrPatterns) {
    const match = filename.match(pattern);
    if (match) {
      let hdr = match[1] || match[0];
      hdr = hdr.replace(/[\s.-]+/g, '').toUpperCase();
      if (hdr === 'HDR10PLUS' || hdr === 'HDR10+') hdr = 'HDR10+';
      else if (hdr === 'DOLBYVISION' || hdr === 'DOLBYIQ' || hdr === 'DV') hdr = 'Dolby Vision';
      qualityParts.push(hdr);
      break; // Only take first HDR match
    }
  }

  // Check for SDR (when explicitly mentioned, often with 4K)
  if (/\b(sdr)\b/i.test(filename)) {
    qualityParts.push('SDR');
  }

  // Extract codec (x264, x265, HEVC, AVC, VP9, AV1, etc.)
  const codecPatterns = [
    /\b(x[\s.-]*265|h[\s.-]*265|hevc)\b/i,
    /\b(x[\s.-]*264|h[\s.-]*264|avc)\b/i,
    /\b(vp9|vp8)\b/i,
    /\b(av1)\b/i,
    /\b(mpeg[\s.-]*(?:2|4)|divx|xvid)\b/i
  ];
  for (const pattern of codecPatterns) {
    const match = filename.match(pattern);
    if (match) {
      let codec = match[1] || match[0];
      codec = codec.replace(/[\s.-]+/g, '');
      if (codec.toLowerCase() === 'x265' || codec.toLowerCase() === 'h265' || codec.toLowerCase() === 'hevc') {
        qualityParts.push('x265');
      } else if (codec.toLowerCase() === 'x264' || codec.toLowerCase() === 'h264' || codec.toLowerCase() === 'avc') {
        qualityParts.push('x264');
      } else {
        qualityParts.push(codec.toUpperCase());
      }
      break;
    }
  }

  // Check for Full HD tag
  if (/\b(full[\s.-]*hd|fhd)\b/i.test(filename) && !qualityParts.some(p => p.includes('Full HD'))) {
    qualityParts.push('Full HD');
  }

  // If we have at least resolution, return the combined label
  if (qualityParts.length > 0) {
    return qualityParts.join(' ');
  }

  // Fallback: try to detect just resolution number
  const simpleResMatch = filename.match(/\b(2160|1080|720|480|360|240)p?\b/i);
  if (simpleResMatch) {
    const res = simpleResMatch[1];
    if (res === '2160') return '4K';
    if (res === '1080') return 'Full HD';
    if (res === '720') return 'HD';
    return res + 'p';
  }

  // Final fallback
  return 'Unknown';
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
        // Extract full quality label from the video URL/filename
        const quality = extractQualityLabel(videoUrl);
        // Check if the content is dubbed based on episode text and video URL
        const dubbedLabel = isDubbed(epText + ' ' + videoUrl) ? ' • دوبله' : '';
        streams.push({
          name: `Stremio.IR\n${quality} ${dubbedLabel}`,
          title: `S${targetSeason}E${targetEpisode} - ${quality}`,
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

        // Extract full quality label from the video URL/filename
        const quality = extractQualityLabel(videoUrl);
        // Check if the content is dubbed based on text and video URL
        const dubbedLabel = isDubbed(text + ' ' + videoUrl) ? ' • دوبله' : '';
        streams.push({
          name: `\n${quality} •${dubbedLabel}`,
          title: `${quality}`,
          url: videoUrl
        });
      }
    });
  });

  $('iframe[src]').each((_, iframe) => {
    const src = $(iframe).attr('src');
    if (src && (src.includes('.mp4') || src.includes('.m3u8'))) {
      streams.push({
        name: `Stremio.IR\nStream`,
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

  // Step 1: Try to construct URL from title (fetched from Stremio metadata)
  let contentUrl = await constructContentUrl(type, imdbId);

  // Step 2: If URL construction failed or page not found, try search fallback
  if (!contentUrl) {
    console.log('URL construction failed, trying search fallback...');
    contentUrl = await searchSite(imdbId);
  }

  if (!contentUrl) {
    console.log('No content found for this IMDB ID');
    return [];
  }

  // Step 3: Fetch the content page
  let $ = await fetchPage(contentUrl);

  // Step 4: If page fetch failed (404), try search as fallback
  if (!$) {
    console.log('Direct page fetch failed, trying search fallback...');
    const searchUrl = await searchSite(imdbId);
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
  console.log('Stremio.IR Stremio Addon (Iranian Source)');
  console.log('===========================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
  console.log(`Install: stremio://localhost:${PORT}/manifest.json`);
  console.log('===========================================\n');
}
