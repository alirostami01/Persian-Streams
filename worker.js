import addonModule from './addon.js';

// addon.js reads BASE_URL when it is initialized. Wrangler bundles the
// CommonJS module into the Worker, so use a normal static import instead of
// createRequire(import.meta.url), which has no usable file URL in Workers.

const { manifest, get, getStreams, getMeta, setBaseUrl, getBaseUrl, setPublicUrl } = addonModule;

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

    const streams = deduplicateStreams(await getStreams(...args));

    const duration = Date.now() - start;
    debugLog('WORKER', `stream handler complete`, { imdb: args[1], streams: streams ? streams.length : 0, duration_ms: duration });

    // Ensure we never lose the reason for empty streams - logs already emitted in getStreams/quick-search/fetch
    if (!streams || streams.length === 0) {
      debugLog('WORKER', `returning empty streams`, { imdb: args[1], type: args[0] });
    }

    return json({ streams: streams || [] });
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
    // Inject BASE_URL from Worker env into addon module (e.g. film2med.top)
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

      // Fix legacy invalid episode thumbnail domain
      target = target.replace('episodes.images.metahub.space', 'episodes.metahub.space');

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

      try {
        const resp = await fetch(target, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          cf: {
            cacheEverything: true,
            cacheTtl: 2592000,
          },
        });

        if (!resp.ok) {
          return new Response('Error loading image', { status: resp.status });
        }

        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        const imageResponse = new Response(resp.body, {
          status: 200,
          headers: {
            'content-type': contentType,
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, HEAD, OPTIONS',
            'cache-control': 'public, max-age=31536000, immutable',
            'etag': etag,
          },
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
      } catch (e) {
        return new Response('Error loading image', { status: 502 });
      }
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
