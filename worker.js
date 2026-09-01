import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import express from "express";
import { createRequire } from "node:module";

// The legacy addon module reads BASE_URL during module initialization.
// Mirror the Worker environment binding into process.env before loading it.
process.env.BASE_URL = env.BASE_URL;

const require = createRequire(import.meta.url);
const addonInterface = require("./addon.js");
const { getRouter } = require("stremio-addon-sdk");

const app = express();

// Stremio requires an absolute logo URL in the manifest.
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

// Serve files from the repository's ./assets directory through the Workers
// Static Assets binding. /assets/icons/logo.png maps to ./assets/icons/logo.png.
app.get("/streams/assets/*", async (_req, res) => {
  const assetPath = _req.path.replace(/^\/streams\/assets/, "") || "/";
  const assetRequest = new Request(`https://assets.local${assetPath}`, {
    method: "GET",
  });

  const assetResponse = await env.ASSETS.fetch(assetRequest);

  res.status(assetResponse.status);
  assetResponse.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await assetResponse.arrayBuffer()));
});

// The SDK returns an Express router. Mount it under /streams so public URLs
// become /streams/manifest.json and /streams/stream/...
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

// Internal port used by Cloudflare's Node.js HTTP bridge.
app.listen(8787);

export default httpServerHandler({ port: 8787 });
