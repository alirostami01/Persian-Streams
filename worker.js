import { env } from 'cloudflare:workers';
import { createRequire } from 'node:module';

// addon.js reads BASE_URL when it is initialized. Mirror the Worker
// binding before loading the CommonJS addon module.
process.env.BASE_URL = env.BASE_URL;

const require = createRequire(import.meta.url);
const { manifest, getStreams } = require('./addon.js');

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
  return { type: match[1], id: decodeURIComponent(match[2]) };
}

async function handleStream(request, streamRequest) {
  try {
    const result = await getStreams(streamRequest.type, ...(() => {
      const { type, id } = streamRequest;
      if (type !== 'series') return [id, null, null];
      const parts = id.split(':');
      return [parts[0], parts[1] ? parseInt(parts[1], 10) : null, parts[2] ? parseInt(parts[2], 10) : null];
    })());

    return json({ streams: result || [] });
  } catch (error) {
    console.error('Worker stream handler error:', error);
    return json({ streams: [] }, 200);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/' || pathname === '/streams' || pathname === '/streams/') {
      if (pathname === '/') {
        return json({
          name: manifest.name,
          status: 'ok',
          manifest: '/streams/manifest.json',
        });
      }
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
      return handleStream(request, streamRequest);
    }

    return json({ error: 'Not found' }, 404);
  },
};
