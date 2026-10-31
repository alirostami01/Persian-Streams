require('dotenv').config();
const express = require('express');
const path = require('path');
const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./addon.js');

const PORT = process.env.PORT || 8000;
const app = express();

// Enable CORS for all routes (essential for Stremio Web)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const addonRouter = getRouter(addonInterface);

// Handle manifest for both /manifest.json and /streams/manifest.json
app.get(['/manifest.json', '/streams/manifest.json'], (req, res) => {
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  if (typeof addonInterface.setPublicUrl === 'function') {
    addonInterface.setPublicUrl(`${protocol}://${host}`);
  }
  const manifest = {
    ...addonInterface.manifest,
    logo: `${protocol}://${host}/assets/icons/logo.png`
  };
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(manifest));
});

// Mount router at both root and /streams
app.use('/streams', addonRouter);
app.use(addonRouter);

// Serve static assets for both paths
app.use(['/assets/icons', '/streams/assets/icons'], express.static(path.join(__dirname, 'assets', 'icons')));

// Poster and thumbnail proxy with long-term caching
const imageMemoryCache = new Map();
const MAX_IMAGE_CACHE_ENTRIES = 2000;

app.get(['/poster', '/streams/poster', '/thumb', '/streams/thumb'], async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url parameter');

  // Fix legacy/invalid episode thumbnail domain
  targetUrl = targetUrl.replace('episodes.images.metahub.space', 'episodes.metahub.space');

  let hash = 0;
  for (let i = 0; i < targetUrl.length; i++) {
    hash = ((hash << 5) - hash) + targetUrl.charCodeAt(i);
    hash |= 0;
  }
  const etag = `W/"thumb-${Math.abs(hash)}"`;

  if (req.headers['if-none-match'] === etag) {
    res.setHeader('ETag', etag);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(304).end();
  }

  if (imageMemoryCache.has(targetUrl)) {
    const cached = imageMemoryCache.get(targetUrl);
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    return res.send(cached.data);
  }

  try {
    const axios = require('axios');
    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    const buffer = Buffer.from(response.data);

    if (buffer.length <= 1024 * 1024) {
      if (imageMemoryCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
        const firstKey = imageMemoryCache.keys().next().value;
        imageMemoryCache.delete(firstKey);
      }
      imageMemoryCache.set(targetUrl, { contentType, data: buffer });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    res.send(buffer);
  } catch (err) {
    res.status(502).send('Error proxying image');
  }
});

app.get('/', (_, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(
    `<h1>${addonInterface.manifest.name}</h1>` +
    `<p>${addonInterface.manifest.description}</p>` +
    `<p>${addonInterface.manifest.author}</p>` +
    `<p>Install: <a href="stremio://localhost:${PORT}/manifest.json">stremio://localhost:${PORT}/manifest.json</a></p>`
  );
});

const server = app.listen(PORT, () => {
  console.log(`${addonInterface.manifest.name} running on port ${PORT}`);
  console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    process.exit(1);
  }
  console.error('Server error:', error);
  process.exit(1);
});
