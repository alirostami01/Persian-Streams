require('dotenv').config();
const express = require('express');
const path = require('path');
const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./addon.js');

const PORT = process.env.PORT || 8000;
const app = express();

app.get('/manifest.json', (req, res) => {
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  const manifest = {
    ...addonInterface.manifest,
    logo: `${protocol}://${host}/assets/icons/logo.png`
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(manifest));
});

app.use(getRouter(addonInterface));
app.use('/assets/icons', express.static(path.join(__dirname, 'assets', 'icons')));

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
