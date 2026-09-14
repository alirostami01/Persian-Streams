import addonModule from './addon.js';

// addon.js reads BASE_URL when it is initialized. Wrangler bundles the
// CommonJS module into the Worker, so use a normal static import instead of
// createRequire(import.meta.url), which has no usable file URL in Workers.

const { manifest, getStreams, setBaseUrl, getBaseUrl } = addonModule;

function debugLog(scope, message, data) {
  if (data !== undefined) {
    console.log(`[${scope}] ${message}`, data);
  } else {
    console.log(`[${scope}] ${message}`);
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
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
  const match = pathname.match(/^\/streams\/stream\/(movie|series)\/(.+?)(?:\.json)?\/?$/);
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

async function handleStream(streamRequest, requestUrl) {
  const start = Date.now();
  try {
    const args = parseStreamArgs(streamRequest);
    if (!args) {
      debugLog('WORKER', `invalid stream args`, { streamRequest });
      return json({ streams: [] }, 400);
    }

    debugLog('WORKER', `stream request type=${args[0]} id=${args[1]} season=${args[2]} episode=${args[3]} url=${requestUrl}`);

    const streams = await getStreams(...args);

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

export default {
  async fetch(request, env) {
    // Inject BASE_URL from Worker env into addon module (handles both f2my.top and www.f2my.top)
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

    if (pathname === '/streams/manifest.json') {
      return json(withAbsoluteLogo(request));
    }

    if (pathname.startsWith('/streams/assets/')) {
      const assetPath = pathname.replace(/^\/streams\/assets/, '') || '/';
      const assetRequest = new Request(`https://assets.local${assetPath}`, request);
      return env.ASSETS.fetch(assetRequest);
    }

    const streamRequest = parseStreamRequest(pathname);
    if (streamRequest && request.method === 'GET') {
      return handleStream(streamRequest, request.url);
    }

    debugLog('WORKER', `404 not found`, { pathname });
    return json({ error: 'Not found' }, 404);
  },
};
