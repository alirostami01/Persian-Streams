/**
 * Minimal Stremio addon builder used by both Node.js and Cloudflare Workers.
 *
 * This intentionally replaces the official SDK's builder dependency inside
 * addon.js. The official SDK bundles Express and body-parser dependencies,
 * which are unnecessary in Workers and can break the Worker bundle.
 * Node's server.js still uses the official SDK's getRouter to serve the
 * resulting addon interface.
 */

class AddonBuilder {
  constructor(manifest) {
    this.manifest = manifest;
    this.handlers = new Map();
  }

  defineStreamHandler(handler) {
    this.handlers.set('stream', handler);
    return this;
  }

  defineMetaHandler(handler) {
    this.handlers.set('meta', handler);
    return this;
  }

  defineCatalogHandler(handler) {
    this.handlers.set('catalog', handler);
    return this;
  }

  defineSubtitlesHandler(handler) {
    this.handlers.set('subtitles', handler);
    return this;
  }

  getInterface() {
    const handlers = this.handlers;
    const manifest = this.manifest;

    return Object.freeze({
      manifest,
      get: async (resource, type, id, extra, config) => {
        let r = resource, t = type, i = id, e = extra, c = config;
        if (typeof resource === 'object' && resource !== null) {
          r = resource.resource;
          t = resource.type;
          i = resource.id;
          e = resource.extra;
          c = resource.config;
        }
        const handler = handlers.get(r);
        if (!handler) return {};
        return handler({ type: t, id: i, extra: e, config: c });
      },
    });
  }
}

function addonBuilder(manifest) {
  return new AddonBuilder(manifest);
}

module.exports = { addonBuilder };
