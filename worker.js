import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import express from "express";
import { createRequire } from "node:module";

// The existing addon module reads BASE_URL during module initialization.
// Workers exposes environment bindings through `env`, so mirror the binding
// into process.env before loading the CommonJS addon module.
process.env.BASE_URL = env.BASE_URL;

const require = createRequire(import.meta.url);
const addonInterface = require("./addon.js");
const { getRouter } = require("stremio-addon-sdk");

const app = express();

// Stremio requires an absolute logo URL in the manifest. The existing addon
// uses a relative asset path, so rewrite it for the /streams deployment path.
app.get("/streams/manifest.json", (req, res) => {
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("host");

  const manifest = {
    ...addonInterface.manifest,
    logo: `${protocol}://${host}/streams/assets/icons/logo.png`,
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(manifest));
});

// Serve existing static assets through Workers Static Assets.
// The asset collection is configured at the repository's ./assets directory.
app.get("/streams/assets/*", async (req, res) => {
  const assetPath = req.path.replace(/^\/streams/, "") || "/";
  const assetRequest = new Request(`https://assets.local${assetPath}`, {
    method: req.method,
    headers: req.headers,
  });

  const assetResponse = await env.ASSETS.fetch(assetRequest);

  res.status(assetResponse.status);
  assetResponse.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await assetResponse.arrayBuffer()));
});

// The official Stremio SDK returns an Express router. Mounting it under
// /streams keeps the existing addon routes unchanged internally while making
// the public addon URL: /streams/manifest.json and /streams/stream/...
app.use("/streams", getRouter(addonInterface));

app.get("/streams", (_req, res) => {
  res.redirect("/streams/manifest.json");
});

app.get("/", (_req, res) => {
  res.status(200).json({
    name: "Persian Streams",
    status: "ok",
    manifest: "/streams/manifest.json",
  });
});

// Cloudflare Workers provides the Node.js HTTP server bridge used here.
// The port is an internal routing key, not a public listening port.
app.listen(8787);

export default httpServerHandler({ port: 8787 });
