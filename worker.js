import addonModule from './addon.js';

// addon.js reads BASE_URL when it is initialized. Wrangler bundles the
// CommonJS module into the Worker, so use a normal static import instead of
// createRequire(import.meta.url), which has no usable file URL in Workers.

const { manifest, get, getStreams, getStreamsWithCache, getMeta, setBaseUrl, getBaseUrl, setPublicUrl } = addonModule;

function debugLog(scope, message, data) {
  if (data !== undefined) {
    console.log(`[${scope}] ${message}`, data);
  } else {
    console.log(`[${scope}] ${message}`);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  const cacheHeaders = status === 200
    ? { 'cache-control': 'public, max-age=14400, s-maxage=86400' }
    : { 'cache-control': 'no-store' };

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      ...cacheHeaders,
      ...extraHeaders,
    },
  });
}

const SVG_THUMBNAIL_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="439" viewBox="0 0 780 439" fill="none">
  <rect width="780" height="439" fill="#1b1c24"/>
  <rect width="780" height="439" fill="url(#grad)" opacity="0.45"/>
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="780" y2="439" gradientUnits="userSpaceOnUse">
      <stop stop-color="#4e3a9c"/>
      <stop offset="1" stop-color="#0e0e14"/>
    </linearGradient>
  </defs>
  <circle cx="390" cy="219" r="42" fill="#262734" opacity="0.85"/>
  <path d="M382 201L404 219L382 237V201Z" fill="#a0a0b6"/>
</svg>`;

// Controlled Cloudflare Image Resizing settings for episode thumbnails.
// Parameters are strictly controlled by the worker to prevent arbitrary resource consumption.
const THUMB_RESIZE_OPTIONS = {
  width: 320,
  fit: 'scale-down',
  format: 'jpeg',
  quality: 40,
};

function isPrivateOrLocalHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  const host = hostname.toLowerCase().trim();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  // IPv4 Private & Link-local ranges:
  // 10.0.0.0/8
  // 127.0.0.0/8
  // 169.254.0.0/16
  // 172.16.0.0/12
  // 192.168.0.0/16
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const o1 = parseInt(ipv4Match[1], 10);
    const o2 = parseInt(ipv4Match[2], 10);
    const o3 = parseInt(ipv4Match[3], 10);
    const o4 = parseInt(ipv4Match[4], 10);

    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) return true;
    if (o1 === 0 || o1 === 10 || o1 === 127) return true;
    if (o1 === 169 && o2 === 254) return true;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    if (o1 === 192 && o2 === 168) return true;
    if (o1 >= 224) return true;
  }

  return false;
}

function isAllowedInitialUrl(urlStr, currentOrigin) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrLocalHost(host)) {
      return false;
    }

    // Prevent fetch loop with worker's own origin
    if (currentOrigin) {
      try {
        const workerOrigin = new URL(currentOrigin);
        if (host === workerOrigin.hostname.toLowerCase()) {
          return false;
        }
      } catch (_) {}
    }
    if (host === 'stremio.alirostami.com') {
      return false;
    }
    if (parsed.pathname.includes('/streams/thumb') || parsed.pathname.includes('/thumb')) {
      return false;
    }

    // Initial URLs must strictly belong to trusted Metahub domains
    const isMetahub = host === 'metahub.space' || host.endsWith('.metahub.space');
    return isMetahub;
  } catch (_) {
    return false;
  }
}

function isAllowedRedirectUrl(urlStr, currentOrigin) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrLocalHost(host)) {
      return false;
    }

    if (currentOrigin) {
      try {
        const workerOrigin = new URL(currentOrigin);
        if (host === workerOrigin.hostname.toLowerCase()) {
          return false;
        }
      } catch (_) {}
    }
    if (host === 'stremio.alirostami.com') {
      return false;
    }
    if (parsed.pathname.includes('/streams/thumb') || parsed.pathname.includes('/thumb')) {
      return false;
    }

    // Allowed upstream redirect destinations for metadata images
    const isMetahub = host === 'metahub.space' || host.endsWith('.metahub.space');
    const isTmdb = host === 'image.tmdb.org' || host.endsWith('.tmdb.org');
    const isAmazonCdn =
      host === 'm.media-amazon.com' ||
      host === 'ia.media-imdb.com' ||
      host.endsWith('.media-amazon.com') ||
      host.endsWith('.ssl-images-amazon.com');

    return isMetahub || isTmdb || isAmazonCdn;
  } catch (_) {
    return false;
  }
}

/**
 * Safely resolves upstream HTTP redirects (e.g., episodes.metahub.space -> image.tmdb.org)
 * validating each hop to prevent SSRF and redirect loops before requesting image resizing.
 */
async function resolveFinalImageUrl(initialUrl, currentOrigin, maxRedirects = 3) {
  let currentUrl = initialUrl;
  let redirectsCount = 0;

  while (redirectsCount < maxRedirects) {
    let headResp = null;
    try {
      headResp = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        cf: {
          cacheEverything: true,
          cacheTtl: 2592000,
        },
      });
    } catch (_) {
      break;
    }

    if (headResp && [301, 302, 307, 308].includes(headResp.status)) {
      const location = headResp.headers.get('location');
      if (!location) break;

      let nextUrl;
      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch (_) {
        break;
      }

      if (!isAllowedRedirectUrl(nextUrl, currentOrigin)) {
        debugLog('THUMB', 'Blocked unsafe redirect destination', { from: currentUrl, to: nextUrl });
        return null;
      }

      currentUrl = nextUrl;
      redirectsCount++;
    } else {
      break;
    }
  }

  return currentUrl;
}

/**
 * Fetches and compresses the image using Cloudflare Image Resizing (cf.image),
 * gracefully falling back to raw fetch if resizing is unsupported or fails.
 */
async function fetchOptimizedImage(targetUrl, currentOrigin) {
  const startTime = Date.now();
  const resolvedUrl = await resolveFinalImageUrl(targetUrl, currentOrigin);
  if (!resolvedUrl) {
    return { ok: false, status: 400, reason: 'Disallowed or invalid redirect target' };
  }

  // Attempt 1: Fetch with cf.image transformations
  try {
    const resizedResp = await fetch(resolvedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cf: {
        image: THUMB_RESIZE_OPTIONS,
        cacheEverything: true,
        cacheTtl: 2592000,
      },
    });

    const contentType = resizedResp.headers.get('content-type') || '';
    const cfResized = resizedResp.headers.get('cf-resized');

    if (resizedResp.ok && contentType.startsWith('image/')) {
      const imageBuffer = await resizedResp.arrayBuffer();
      const durationMs = Date.now() - startTime;
      return {
        ok: true,
        status: 200,
        buffer: imageBuffer,
        contentType: contentType,
        bytes: imageBuffer.byteLength,
        resized: !!cfResized || contentType.includes('jpeg'),
        cfResizedHeader: cfResized || 'none',
        durationMs,
        resolvedUrl,
      };
    }

    debugLog('THUMB', 'cf.image fetch non-ok, falling back to passthrough', {
      status: resizedResp.status,
      cfResized,
      contentType,
    });
  } catch (err) {
    debugLog('THUMB', 'cf.image fetch error, falling back to passthrough', { error: err.message });
  }

  // Attempt 2: Fallback to direct raw image fetch if cf.image failed or is unavailable
  try {
    const rawResp = await fetch(resolvedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 2592000,
      },
    });

    const contentType = rawResp.headers.get('content-type') || '';
    if (rawResp.ok && contentType.startsWith('image/')) {
      const rawBuffer = await rawResp.arrayBuffer();
      const durationMs = Date.now() - startTime;
      return {
        ok: true,
        status: 200,
        buffer: rawBuffer,
        contentType: contentType,
        bytes: rawBuffer.byteLength,
        resized: false,
        cfResizedHeader: 'passthrough',
        durationMs,
        resolvedUrl,
      };
    }

    return {
      ok: false,
      status: rawResp.status,
      contentType,
      reason: 'Upstream returned non-image or error status',
      durationMs: Date.now() - startTime,
    };
  } catch (rawErr) {
    return {
      ok: false,
      status: 502,
      reason: rawErr.message,
      durationMs: Date.now() - startTime,
    };
  }
}

function withAbsoluteLogo(request) {
  const url = new URL(request.url);
  return {
    ...manifest,
    logo: `${url.origin}/streams/assets/icons/logo.png`,
  };
}

function parseStreamRequest(pathname) {
  const match = pathname.match(/^(?:\/streams)?\/stream\/(movie|series)\/(.+?)(?:\.json)?\/?$/);
  if (!match) return null;

  try {
    return {
      type: match[1],
      id: decodeURIComponent(match[2]),
    };
  } catch (_) {
    return null;
  }
}

function parseCatalogRequest(pathname) {
  const match = pathname.match(/^(?:\/streams)?\/catalog\/(movie|series)\/([^/]+?)(?:\/([^/]+?))?(?:\.json)?\/?$/);
  if (!match) return null;

  try {
    return {
      type: match[1],
      id: decodeURIComponent(match[2]),
      extraPath: match[3] ? decodeURIComponent(match[3]) : null,
    };
  } catch (_) {
    return null;
  }
}

function parseMetaRequest(pathname) {
  const match = pathname.match(/^(?:\/streams)?\/meta\/(movie|series)\/([^/]+?)(?:\.json)?\/?$/);
  if (!match) return null;

  try {
    return {
      type: match[1],
      id: decodeURIComponent(match[2]),
    };
  } catch (_) {
    return null;
  }
}

function parseStreamArgs(streamRequest) {
  const { type, id } = streamRequest;

  if (type !== 'series') {
    return [type, id, null, null];
  }

  const parts = id.split(':');
  const imdbId = parts[0];
  const season = parts[1] ? parseInt(parts[1], 10) : null;
  const episode = parts[2] ? parseInt(parts[2], 10) : null;

  if (!imdbId || !Number.isInteger(season) || !Number.isInteger(episode)) {
    return null;
  }

  return [type, imdbId, season, episode];
}

function deduplicateStreams(streams) {
  if (!Array.isArray(streams)) return [];

  const seen = new Set();
  const unique = streams.filter(stream => {
    if (!stream) return false;

    // Allow externalUrl streams (such as donation items)
    if (typeof stream.externalUrl === 'string' && stream.externalUrl.startsWith('http')) {
      return true;
    }

    if (typeof stream.url !== 'string' || !stream.url.startsWith('http')) {
      return false;
    }

    let key = stream.url.trim();
    try {
      const parsed = new URL(key);
      // Download URLs can contain temporary/signing query parameters.
      // The pathname identifies the physical video file.
      parsed.hash = '';
      parsed.search = '';
      parsed.hostname = parsed.hostname.toLowerCase();
      key = parsed.toString().replace(/\/$/, '');
    } catch (_) {
      key = key.split('#')[0].split('?')[0].replace(/\/$/, '');
    }

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length !== streams.length) {
    debugLog('WORKER', `deduplicated streams`, {
      original: streams.length,
      unique: unique.length,
      removed: streams.length - unique.length,
    });
  }

  return unique;
}

async function handleStream(streamRequest, requestUrl) {
  const start = Date.now();
  try {
    const args = parseStreamArgs(streamRequest);
    if (!args) {
      debugLog('WORKER', `invalid stream args`, { streamRequest });
      return json({ streams: [] }, 400);
    }

    debugLog('WORKER', `stream request type=${args[0]} id=${args[1]} season=${args[2]} episode=${args[3]} url=${requestUrl}`);

    const streamResult = typeof getStreamsWithCache === 'function'
      ? await getStreamsWithCache(...args)
      : { streams: await getStreams(...args), cacheMaxAge: 21600, staleRevalidate: 86400 };

    const streams = deduplicateStreams(streamResult.streams || []);
    const maxAge = streamResult.cacheMaxAge || 21600;
    const sMaxAge = streamResult.staleRevalidate || 86400;

    const duration = Date.now() - start;
    debugLog('WORKER', `stream handler complete`, { imdb: args[1], streams: streams ? streams.length : 0, duration_ms: duration });

    // Ensure we never lose the reason for empty streams - logs already emitted in getStreams/quick-search/fetch
    if (!streams || streams.length === 0) {
      debugLog('WORKER', `returning empty streams`, { imdb: args[1], type: args[0] });
      return json({ streams: [] }, 200, {
        'cache-control': 'public, max-age=300, s-maxage=600'
      });
    }

    return json({ streams: streams || [] }, 200, {
      'cache-control': `public, max-age=${maxAge}, s-maxage=${sMaxAge}`
    });
  } catch (error) {
    console.error('[WORKER] stream handler error:', error.message, { stack: error.stack && error.stack.slice(0, 800) });
    debugLog('WORKER', `returning empty streams due to handler error`, { error: error.message });
    return json({ streams: [] }, 200);
  }
}

async function handleMeta(metaRequest, origin) {
  const { type, id } = metaRequest;
  try {
    debugLog('WORKER', `meta request type=${type} id=${id} origin=${origin}`);
    const metaResp = await getMeta(type, id, origin);
    return json(metaResp || { meta: null }, 200, {
      'cache-control': 'public, max-age=86400, s-maxage=86400',
    });
  } catch (error) {
    console.error('[WORKER] meta handler error:', error.message);
    return json({ meta: null }, 200);
  }
}

export default {
  async fetch(request, env, ctx) {
    // Inject BASE_URL from Worker env into addon module (e.g. film2med-proxy.vercel.app)
    try {
      const envBase = env && (env.BASE_URL || env.base_url);
      if (envBase) {
        // Update runtime BASE_URL for subsequent requests
        if (typeof setBaseUrl === 'function') {
          setBaseUrl(envBase);
        }
        // Also set on process.env for any direct reads
        try {
          if (typeof process !== 'undefined' && process.env) {
            process.env.BASE_URL = envBase;
          }
        } catch (_) {}
        try {
          if (typeof globalThis !== 'undefined') {
            globalThis.BASE_URL = envBase;
          }
        } catch (_) {}
      } else {
        // Log current BASE_URL for diagnostics
        const current = typeof getBaseUrl === 'function' ? getBaseUrl() : 'unknown';
        debugLog('WORKER', `no env.BASE_URL, using current`, { baseUrl: current });
      }
    } catch (e) {
      console.error('[WORKER] BASE_URL injection failed', e.message);
    }

    const url = new URL(request.url);
    const { pathname } = url;

    if (typeof setPublicUrl === 'function') {
      setPublicUrl(url.origin);
    }

    debugLog('WORKER', `incoming ${request.method} ${pathname}`);

    if (pathname === '/') {
      return json({
        name: manifest.name,
        status: 'ok',
        manifest: '/streams/manifest.json',
      });
    }

    if (pathname === '/streams' || pathname === '/streams/') {
      return Response.redirect(`${url.origin}/streams/manifest.json`, 302);
    }

    if (pathname === '/streams/manifest.json' || pathname === '/manifest.json') {
      return json(withAbsoluteLogo(request));
    }

    if (pathname.startsWith('/streams/assets/') || pathname.startsWith('/assets/')) {
      const assetPath = pathname.replace(/^\/(?:streams\/)?assets/, '') || '/';
      const assetRequest = new Request(`https://assets.local${assetPath}`, request);
      return env.ASSETS.fetch(assetRequest);
    }

    if (pathname === '/streams/poster' || pathname === '/poster' || pathname === '/streams/thumb' || pathname === '/thumb') {
      let target = url.searchParams.get('url');
      if (!target) return new Response('Missing url parameter', { status: 400 });

      let fallback = url.searchParams.get('fallback');

      // Normalize legacy episode thumbnail domains
      target = target.replace('episodes.images.metahub.space', 'episodes.metahub.space');
      if (fallback) {
        fallback = fallback.replace('episodes.images.metahub.space', 'episodes.metahub.space');
      }

      // Security check: validate input URL to prevent open proxy and SSRF
      if (!isAllowedInitialUrl(target, url.origin)) {
        debugLog('THUMB', 'Blocked disallowed target URL', { target });
        return new Response('Forbidden: disallowed image domain or destination', { status: 403 });
      }

      if (fallback && !isAllowedInitialUrl(fallback, url.origin)) {
        debugLog('THUMB', 'Ignored disallowed fallback URL', { fallback });
        fallback = null;
      }

      // Generate ETag for conditional requests and client caching
      let hash = 0;
      for (let i = 0; i < target.length; i++) {
        hash = ((hash << 5) - hash) + target.charCodeAt(i);
        hash |= 0;
      }
      const etag = `W/"thumb-${Math.abs(hash)}"`;

      // Check conditional request (If-None-Match)
      const ifNoneMatch = request.headers.get('if-none-match');
      if (ifNoneMatch && ifNoneMatch === etag) {
        return new Response(null, {
          status: 304,
          headers: {
            'etag': etag,
            'access-control-allow-origin': '*',
            'cache-control': 'public, max-age=31536000, immutable',
          },
        });
      }

      // Check Cloudflare Edge Cache
      const cache = typeof caches !== 'undefined' && caches.default;
      if (cache && request.method === 'GET') {
        try {
          const cached = await cache.match(request);
          if (cached) {
            return cached;
          }
        } catch (_) {}
      }

      // Attempt to fetch and optimize primary image
      let primaryResult = null;
      try {
        primaryResult = await fetchOptimizedImage(target, url.origin);
      } catch (err) {
        debugLog('THUMB', 'primary image fetch exception', { error: err.message });
      }

      let chosenResult = null;
      let usedSource = 'none';

      if (primaryResult && primaryResult.ok) {
        chosenResult = primaryResult;
        usedSource = 'primary';
      } else if (fallback) {
        // Fallback image optimization
        try {
          const fallbackResult = await fetchOptimizedImage(fallback, url.origin);
          if (fallbackResult && fallbackResult.ok) {
            chosenResult = fallbackResult;
            usedSource = 'fallback';
          }
        } catch (fbErr) {
          debugLog('THUMB', 'fallback image fetch exception', { error: fbErr.message });
        }
      }

      if (chosenResult && chosenResult.ok) {
        const imageResponse = new Response(chosenResult.buffer, {
          status: 200,
          headers: {
            'content-type': chosenResult.contentType,
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, HEAD, OPTIONS',
            'cache-control': 'public, max-age=31536000, immutable',
            'etag': etag,
            'x-thumbnail-source': usedSource,
          },
        });

        debugLog('THUMB', 'thumbnail delivered successfully', {
          source: usedSource,
          status: chosenResult.status,
          contentType: chosenResult.contentType,
          bytes: chosenResult.bytes,
          resized: chosenResult.resized,
          cfResized: chosenResult.cfResizedHeader,
          durationMs: chosenResult.durationMs,
        });

        if (cache) {
          try {
            if (ctx && typeof ctx.waitUntil === 'function') {
              ctx.waitUntil(cache.put(request, imageResponse.clone()));
            } else {
              await cache.put(request, imageResponse.clone());
            }
          } catch (_) {}
        }

        return imageResponse;
      }

      debugLog('THUMB', 'thumbnail sources failed, serving SVG placeholder', {
        target,
        fallback,
        primaryReason: primaryResult ? primaryResult.reason : 'unknown',
      });

      // If image failed, return SVG placeholder with 200 OK so Stremio client never shows broken image
      return new Response(SVG_THUMBNAIL_PLACEHOLDER, {
        status: 200,
        headers: {
          'content-type': 'image/svg+xml',
          'access-control-allow-origin': '*',
          'cache-control': 'public, max-age=3600',
          'x-thumbnail-source': 'placeholder',
        },
      });
    }

    const metaRequest = parseMetaRequest(pathname);
    if (metaRequest && request.method === 'GET') {
      return handleMeta(metaRequest, url.origin);
    }

    const streamRequest = parseStreamRequest(pathname);
    if (streamRequest && request.method === 'GET') {
      return handleStream(streamRequest, request.url);
    }

    const catalogRequest = parseCatalogRequest(pathname);
    if (catalogRequest && request.method === 'GET') {
      try {
        const extra = {};
        if (catalogRequest.extraPath) {
          const sp = new URLSearchParams(catalogRequest.extraPath);
          for (const [k, v] of sp.entries()) {
            extra[k] = v;
          }
        }
        for (const [k, v] of url.searchParams.entries()) {
          extra[k] = v;
        }

        const resp = await get('catalog', catalogRequest.type, catalogRequest.id, extra);
        return json(resp || { metas: [] }, 200, {
          'cache-control': 'public, max-age=300, s-maxage=600',
        });
      } catch (e) {
        debugLog('WORKER', `catalog error: ${e.message}`);
        return json({ metas: [] });
      }
    }

    debugLog('WORKER', `404 not found`, { pathname });
    return json({ error: 'Not found' }, 404);
  },
};
