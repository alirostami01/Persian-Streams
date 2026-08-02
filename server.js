/**
 * F2My.top Stremio Addon
 * 
 * This addon scrapes streaming links from https://www.f2my.top for movies and TV series.
 * It converts content titles to URL slugs, fetches the corresponding pages,
 * extracts video sources with quality labels, and returns them in Stremio format.
 * 
 * Architecture:
 * - Express server handles HTTP requests from Stremio
 * - Axios for making HTTP requests to f2my.top
 * - Cheerio for HTML parsing
 * - Fallback search mechanism if direct slug lookup fails
 */

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { addonBuilder, serveHTTP, getRouter } = require('stremio-addon-sdk');

// Configuration
const PORT = process.env.PORT || 7000;
const BASE_URL = 'https://www.f2my.top';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Axios instance with default headers for scraping
const scraper = axios.create({
    baseURL: BASE_URL,
    headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    },
    timeout: 15000,
    maxRedirects: 5
});

/**
 * Convert a title to a URL-friendly slug
 * - Lowercase
 * - Replace spaces with hyphens
 * - Remove special characters
 * - Remove multiple consecutive hyphens
 * 
 * @param {string} title - The content title
 * @returns {string} - URL slug
 */
function createSlug(title) {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')           // Remove special characters
        .replace(/\s+/g, '-')               // Replace spaces with hyphens
        .replace(/--+/g, '-')               // Replace multiple hyphens with single
        .replace(/^-+|-+$/g, '');           // Remove leading/trailing hyphens
}

/**
 * Extract title from metadata or use fallback
 * For IMDB IDs, we might need to fetch metadata first
 * 
 * @param {string} imdbId - IMDB ID (e.g., tt1234567)
 * @param {object} meta - Optional metadata object
 * @returns {Promise<string>} - Content title
 */
async function getContentTitle(imdbId, meta = null) {
    // If metadata is provided, use its title
    if (meta && meta.name) {
        return meta.name;
    }
    
    // Fallback: Use IMDB ID as search term
    // In production, you might want to fetch from TMDB or IMDB API
    return imdbId;
}

/**
 * Fetch and parse a page from f2my.top
 * 
 * @param {string} url - Full URL to fetch
 * @returns {Promise<{html: string, $: CheerioAPI}|null>} - Parsed HTML or null on failure
 */
async function fetchPage(url) {
    try {
        const response = await scraper.get(url);
        if (response.status !== 200) {
            console.log(`Failed to fetch ${url}: Status ${response.status}`);
            return null;
        }
        
        const html = response.data;
        const $ = cheerio.load(html);
        return { html, $ };
    } catch (error) {
        console.error(`Error fetching ${url}:`, error.message);
        return null;
    }
}

/**
 * Search f2my.top for content matching the title
 * Used as fallback when direct slug lookup fails
 * 
 * @param {string} query - Search query (title)
 * @returns {Promise<string|null>} - URL of first matching result or null
 */
async function searchContent(query) {
    try {
        const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
        console.log(`Searching for: ${query} at ${searchUrl}`);
        
        const result = await fetchPage(searchUrl);
        if (!result) return null;
        
        const { $ } = result;
        
        // Look for search results - typically article links or post links
        // Common selectors for WordPress-based sites
        let resultUrl = null;
        
        // Try various common selectors for search results
        const selectors = [
            '.search-result a',
            '.post-title a',
            '.entry-title a',
            'article a',
            '.film-item a',
            '.movie-item a',
            'a[href*="/movie/"]',
            'a[href*="/series/"]'
        ];
        
        for (const selector of selectors) {
            const link = $(selector).first();
            if (link.length > 0) {
                resultUrl = link.attr('href');
                if (resultUrl) {
                    console.log(`Found search result: ${resultUrl}`);
                    break;
                }
            }
        }
        
        return resultUrl;
    } catch (error) {
        console.error('Search failed:', error.message);
        return null;
    }
}

/**
 * Extract video sources from a movie or series page
 * 
 * The page structure typically contains:
 * - Server selection (dropdowns or tabs)
 * - Episode selection (for series)
 * - Video player embeds or direct links
 * 
 * @param {CheerioAPI} $ - Cheerio instance with loaded HTML
 * @param {number|null} season - Season number (for series)
 * @param {number|null} episode - Episode number (for series)
 * @param {string} type - 'movie' or 'series'
 * @returns {Array} - Array of stream objects
 */
function extractVideoSources($, season = null, episode = null, type = 'movie') {
    const streams = [];
    
    console.log(`Extracting sources for ${type}, season: ${season}, episode: ${episode}`);
    
    // Strategy 1: Look for embedded video players (iframe, script tags with sources)
    $('iframe').each((_, iframe) => {
        const src = $(iframe).attr('src');
        if (src && (src.includes('.mp4') || src.includes('.m3u8') || src.includes('embed'))) {
            const quality = detectQuality(src, $(iframe));
            streams.push({
                name: `F2My.top\n${quality}`,
                title: `${quality} Stream`,
                url: makeAbsoluteUrl(src)
            });
        }
    });
    
    // Strategy 2: Look for data attributes containing video URLs
    $('[data-video], [data-src], [data-url], [data-link]').each((_, el) => {
        const videoUrl = $(el).attr('data-video') || 
                        $(el).attr('data-src') || 
                        $(el).attr('data-url') || 
                        $(el).attr('data-link');
        
        if (videoUrl && (videoUrl.includes('.mp4') || videoUrl.includes('.m3u8') || videoUrl.startsWith('http'))) {
            const quality = detectQuality(videoUrl, $(el));
            streams.push({
                name: `F2My.top\n${quality}`,
                title: `${quality} Stream`,
                url: makeAbsoluteUrl(videoUrl)
            });
        }
    });
    
    // Strategy 3: Look for source tags within video elements
    $('video source').each((_, source) => {
        const src = $(source).attr('src');
        if (src) {
            const quality = detectQuality(src, $(source));
            streams.push({
                name: `F2My.top\n${quality}`,
                title: `${quality} Stream`,
                url: makeAbsoluteUrl(src)
            });
        }
    });
    
    // Strategy 4: Look for server/episode selection dropdowns (series specific)
    if (type === 'series' && season !== null && episode !== null) {
        // Look for season dropdown
        const seasonSelect = $('select[data-season], select[name="season"], #season-select');
        
        if (seasonSelect.length > 0) {
            console.log('Found season dropdown, looking for episodes...');
            
            // Look for episode container that corresponds to the selected season
            // Sites often have data attributes linking episodes to seasons
            $(`[data-season="${season}"], .season-${season}, #season-${season}`).find('a, option').each((_, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                
                // Check if this episode matches our target
                if (text.includes(`Episode ${episode}`) || text.includes(`EP ${episode}`) || text.match(/\b${episode}\b/)) {
                    if (href && (href.includes('.mp4') || href.includes('.m3u8'))) {
                        const quality = detectQuality(href, $(el));
                        streams.push({
                            name: `F2My.top\n${quality}`,
                            title: `S${season}E${episode} - ${quality}`,
                            url: makeAbsoluteUrl(href)
                        });
                    }
                }
            });
        }
        
        // Alternative: Look for episode links directly
        $(`a[href*="episode-${episode}"], a[href*="ep${episode}"], .episode-${episode}`).each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
                // Could be a link to episode page or direct video
                if (href.includes('.mp4') || href.includes('.m3u8')) {
                    const quality = detectQuality(href, $(el));
                    streams.push({
                        name: `F2My.top\n${quality}`,
                        title: `S${season}E${episode} - ${quality}`,
                        url: makeAbsoluteUrl(href)
                    });
                }
            }
        });
    }
    
    // Strategy 5: Parse inline scripts for video URLs (common in modern sites)
    $('script').each((_, script) => {
        const content = $(script).html();
        if (!content) return;
        
        // Look for common video URL patterns in JavaScript
        const urlPatterns = [
            /['"](https?:\/\/[^"']+?\.(?:mp4|m3u8|mkv|avi))['"]/gi,
            /file:\s*['"](https?:\/\/[^"']+?)['"]/gi,
            /src:\s*['"](https?:\/\/[^"']+?)['"]/gi,
            /url:\s*['"](https?:\/\/[^"']+?)['"]/gi
        ];
        
        for (const pattern of urlPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const videoUrl = match[1];
                if (videoUrl && !streams.find(s => s.url === videoUrl)) {
                    const quality = detectQuality(videoUrl);
                    streams.push({
                        name: `F2My.top\n${quality}`,
                        title: `${quality} Stream`,
                        url: makeAbsoluteUrl(videoUrl)
                    });
                }
            }
        }
    });
    
    // Strategy 6: Look for button/link elements that might contain video sources
    $('.play-btn, .watch-btn, .stream-link, .video-link, a.button').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        
        if (href && (href.includes('http') || href.includes('.mp4') || href.includes('.m3u8'))) {
            // Extract quality from text if available
            let quality = detectQuality(href, $(el), text);
            streams.push({
                name: `F2My.top\n${quality}`,
                title: text || `${quality} Stream`,
                url: makeAbsoluteUrl(href)
            });
        }
    });
    
    // Deduplicate streams by URL
    const uniqueStreams = [];
    const seenUrls = new Set();
    for (const stream of streams) {
        if (!seenUrls.has(stream.url)) {
            seenUrls.add(stream.url);
            uniqueStreams.push(stream);
        }
    }
    
    return uniqueStreams;
}

/**
 * Detect video quality from URL or element attributes/text
 * 
 * @param {string} url - Video URL
 * @param {CheerioAPI} $el - Optional Cheerio element
 * @param {string} text - Optional text content
 * @returns {string} - Quality label (e.g., "1080p", "720p")
 */
function detectQuality(url, $el = null, text = '') {
    // Check URL for quality indicators
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('4k') || urlLower.includes('2160p') || urlLower.includes('uhd')) {
        return '4K';
    }
    if (urlLower.includes('1080') || urlLower.includes('fhd')) {
        return '1080p';
    }
    if (urlLower.includes('720') || urlLower.includes('hd')) {
        return '720p';
    }
    if (urlLower.includes('480') || urlLower.includes('sd')) {
        return '480p';
    }
    if (urlLower.includes('360')) {
        return '360p';
    }
    
    // Check element attributes for quality data
    if ($el) {
        const dataQuality = $el.attr('data-quality') || $el.attr('quality');
        if (dataQuality) {
            return dataQuality.toUpperCase();
        }
        
        const labelText = $el.text().trim() || text;
        if (labelText.toLowerCase().includes('1080')) return '1080p';
        if (labelText.toLowerCase().includes('720')) return '720p';
        if (labelText.toLowerCase().includes('4k')) return '4K';
    }
    
    // Default based on file extension
    if (urlLower.includes('.m3u8')) {
        return 'HLS';
    }
    
    // Default quality
    return 'Default';
}

/**
 * Convert relative URLs to absolute URLs
 * 
 * @param {string} url - URL to convert
 * @returns {string} - Absolute URL
 */
function makeAbsoluteUrl(url) {
    if (!url) return '';
    
    // Already absolute
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    
    // Protocol-relative
    if (url.startsWith('//')) {
        return 'https:' + url;
    }
    
    // Root-relative
    if (url.startsWith('/')) {
        return BASE_URL + url;
    }
    
    // Relative path
    return BASE_URL + '/' + url;
}

/**
 * Main stream handler - processes Stremio stream requests
 * 
 * @param {string} type - 'movie' or 'series'
 * @param {string} imdbId - IMDB ID
 * @param {number|null} season - Season number (series only)
 * @param {number|null} episode - Episode number (series only)
 * @returns {Promise<Array>} - Array of stream objects
 */
async function getStreams(type, imdbId, season = null, episode = null) {
    console.log(`\n=== Stream Request ===`);
    console.log(`Type: ${type}, IMDB: ${imdbId}, Season: ${season}, Episode: ${episode}`);
    
    // Get content title (in real implementation, fetch from metadata API)
    // For now, we'll use a placeholder since we don't have the actual title
    // The caller should provide the title via meta or args
    let title = imdbId; // Fallback to IMDB ID
    
    // Create slug from title
    const slug = createSlug(title);
    console.log(`Generated slug: ${slug}`);
    
    // Construct URL based on type
    const contentUrl = `${BASE_URL}/${type}/${slug}/`;
    console.log(`Attempting to fetch: ${contentUrl}`);
    
    // Try direct URL first
    let result = await fetchPage(contentUrl);
    
    // Fallback: Search if direct URL fails (404 or no content)
    if (!result) {
        console.log('Direct URL failed, attempting search...');
        const searchResultUrl = await searchContent(title);
        
        if (searchResultUrl) {
            console.log(`Search returned: ${searchResultUrl}`);
            result = await fetchPage(searchResultUrl);
        }
    }
    
    if (!result) {
        console.log('No content found for this title');
        return [];
    }
    
    const { $ } = result;
    
    // Extract video sources
    const streams = extractVideoSources($, season, episode, type);
    
    console.log(`Found ${streams.length} stream(s)`);
    return streams;
}

// Initialize Stremio addon builder
const builder = new addonBuilder({
    id: 'org.f2my.stremio',
    name: 'F2My.top',
    description: 'Unofficial streams from f2my.top - Movies and TV Series',
    version: '1.0.0',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'], // IMDB ID prefix
    catalogs: [], // No catalogs, only stream provider
    behaviorHints: {
        configurable: false,
        configurationRequired: false
    }
});

// Define the stream resource handler
builder.defineStreamHandler((args) => {
    const { type, id } = args;
    
    // Parse IMDB ID from the request
    // Format: tt1234567:season:episode for series, tt1234567 for movies
    let imdbId = id;
    let season = null;
    let episode = null;
    
    if (type === 'series') {
        // Series format: tt1234567:1:5 (IMDB:season:episode)
        const parts = id.split(':');
        imdbId = parts[0];
        season = parseInt(parts[1], 10);
        episode = parseInt(parts[2], 10);
        
        console.log(`Series request: ${imdbId}, S${season}E${episode}`);
    } else {
        console.log(`Movie request: ${imdbId}`);
    }
    
    // Get streams (note: in production, you'd fetch metadata to get the actual title)
    return getStreams(type, imdbId, season, episode)
        .then(streams => {
            return { streams };
        })
        .catch(error => {
            console.error('Error in stream handler:', error);
            return { streams: [] };
        });
});

// Create Express app and use SDK's getRouter
const addonInterface = builder.getInterface();
const router = getRouter(addonInterface);

// Create Express app
const app = require('express')();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount the addon router
app.use(router);

// Start server
app.listen(PORT, () => {
    console.log(`\n===========================================`);
    console.log(`F2My.top Stremio Addon`);
    console.log(`===========================================`);
    console.log(`Server running on port ${PORT}`);
    console.log(`Manifest URL: http://localhost:${PORT}/manifest.json`);
    console.log(`Install in Stremio: stremio://localhost:${PORT}/manifest.json`);
    console.log(`\nEndpoints:`);
    console.log(`  GET /manifest.json - Addon manifest`);
    console.log(`  GET /stream/{type}/{id}.json - Stream requests`);
    console.log(`  GET /health - Health check`);
    console.log(`===========================================\n`);
});

module.exports = { createSlug, extractVideoSources, detectQuality, searchContent };
