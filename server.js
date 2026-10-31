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

// Poster proxy for restricted environments
app.get(['/poster', '/streams/poster'], async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url parameter');
  try {
    const axios = require('axios');
    const response = await axios.get(targetUrl, {
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    response.data.pipe(res);
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
