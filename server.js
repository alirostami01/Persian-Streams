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

const PORT = process.env.PORT || 7000;
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
    clean = clean.replace(/\s*-\s*Complete.*$/i, '');
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
                streams.push({
                    name: `F2My.top\n${quality} • Iranian Source`,
                    title: `S${targetSeason}E${targetEpisode} - ${quality}\nPersian Subtitles`,
                    url: videoUrl
                });
                console.log(`Added stream: ${quality}`);
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
                streams.push({
                    name: `F2My.top\n${quality} • Iranian Source`,
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
    console.log('F2My.top Stremio Addon (Iranian Source)');
    console.log('===========================================');
    console.log(`Server running on port ${PORT}`);
    console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
    console.log(`Install: stremio://localhost:${PORT}/manifest.json`);
    console.log('===========================================\n');
}
