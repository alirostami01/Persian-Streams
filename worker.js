import addonModule from './addon.js';

// addon.js reads BASE_URL when it is initialized. Wrangler bundles the
// CommonJS module into the Worker, so use a normal static import instead of
// createRequire(import.meta.url), which has no usable file URL in Workers.

const { manifest, getStreams } = addonModule;

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

async function handleStream(streamRequest) {
  try {
    const args = parseStreamArgs(streamRequest);
    if (!args) return json({ streams: [] }, 400);

    const streams = await getStreams(...args);
    return json({ streams: streams || [] });
  } catch (error) {
    console.error('Worker stream handler error:', error);
    return json({ streams: [] }, 200);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

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
      return handleStream(streamRequest);
    }

    return json({ error: 'Not found' }, 404);
  },
};
