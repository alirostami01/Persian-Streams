const { test, describe } = require('node:test');
const assert = require('node:assert');
const addon = require('../addon.js');

describe('Addon Manifest', () => {
  test('manifest includes catalog, stream, and meta resources', () => {
    assert.ok(addon.manifest.resources.includes('stream'));
    assert.ok(addon.manifest.resources.includes('catalog'));
    assert.ok(addon.manifest.resources.includes('meta'));
  });

  test('manifest defines movie and series catalogs with specified names', () => {
    assert.strictEqual(addon.manifest.catalogs.length, 2);

    const movieCatalog = addon.manifest.catalogs.find(c => c.type === 'movie');
    assert.ok(movieCatalog);
    assert.strictEqual(movieCatalog.id, 'persian-streams-movies');
    assert.strictEqual(movieCatalog.name, 'Persian Streams');

    const seriesCatalog = addon.manifest.catalogs.find(c => c.type === 'series');
    assert.ok(seriesCatalog);
    assert.strictEqual(seriesCatalog.id, 'persian-streams-series');
    assert.strictEqual(seriesCatalog.name, 'Persian Streams');
  });

  test('catalogs have search and skip extra options', () => {
    for (const catalog of addon.manifest.catalogs) {
      const extraNames = catalog.extra.map(e => e.name);
      assert.ok(extraNames.includes('search'));
      assert.ok(extraNames.includes('skip'));
    }
  });
});

describe('Text & HTML Cleaning', () => {
  test('decodeHtmlEntities decodes numeric and named HTML entities', () => {
    const raw = 'Now You See Me: Now You Don&#8217;t &#8211; Part &amp; &quot;2&quot;';
    const decoded = addon.decodeHtmlEntities(raw);
    assert.strictEqual(decoded, "Now You See Me: Now You Don't – Part & \"2\"");
  });

  test('cleanText removes HTML tags and decodes entities', () => {
    const raw = '<em>Akhanda 2</em> &#8211; Thaandavam';
    const cleaned = addon.cleanText(raw);
    assert.strictEqual(cleaned, 'Akhanda 2 – Thaandavam');
  });
});

describe('Catalog Meta Transformer', () => {
  test('toCatalogMeta transforms movie item properly', () => {
    const rawItem = {
      _kind: 'post',
      imdb_id: 'tt1234567',
      title: 'Sample Movie &#8211; 2024',
      title_fa: 'فیلم نمونه',
      type: 'post',
      url: '/123/download-film-sample-2024/',
      image: '/wp-content/uploads/2024/01/sample.jpg',
      year: 2024,
      rating: 8.5,
      is_dubbled: true,
      is_hardsub: false
    };

    const meta = addon.toCatalogMeta(rawItem, 'movie');
    assert.ok(meta);
    assert.strictEqual(meta.id, 'tt1234567');
    assert.strictEqual(
      meta.poster,
      'https://stremio.alirostami.com/streams/thumb?url=https%3A%2F%2Fimages.metahub.space%2Fposter%2Fmedium%2Ftt1234567%2Fimg.jpg'
    );
    assert.ok(meta.description.includes('🎙️ دوبله فارسی'));
    assert.ok(meta.description.includes('⭐ امتیاز: 8.5/10'));
  });

  test('toCatalogMeta filters out non-matching types', () => {
    const seriesItem = {
      _kind: 'post',
      imdb_id: 'tt9999999',
      title: 'Sample Series',
      url: '/series/sample-series/',
      type: 'series'
    };

    assert.strictEqual(addon.toCatalogMeta(seriesItem, 'movie'), null);
    const seriesMeta = addon.toCatalogMeta(seriesItem, 'series');
    assert.ok(seriesMeta);
    assert.strictEqual(seriesMeta.type, 'series');
  });

  test('toCatalogMeta filters out items without IMDb ID', () => {
    const itemWithoutImdb = {
      _kind: 'post',
      title: 'No IMDb Item',
      url: '/123/movie/'
    };
    assert.strictEqual(addon.toCatalogMeta(itemWithoutImdb), null);
  });
});

describe('Addon Interface & Router', () => {
  test('addon exports get and manifest functions/objects', () => {
    assert.strictEqual(typeof addon.get, 'function');
    assert.strictEqual(typeof addon.manifest, 'object');
  });

  test('catalog request returns metas array with pagination structure', async () => {
    const resp = await addon.get('catalog', 'movie', 'persian-streams-movies', { skip: 0 });
    assert.ok(resp);
    assert.ok(Array.isArray(resp.metas));
  });

  test('proxyImageUrl rewrites external URLs with URL encoding and prevents double proxying', () => {
    const raw = 'https://episodes.images.metahub.space/tt1355644/1/1/w500.jpg';
    const proxied = addon.proxyImageUrl(raw, 'https://stremio.alirostami.com');
    assert.strictEqual(
      proxied,
      'https://stremio.alirostami.com/streams/thumb?url=https%3A%2F%2Fepisodes.images.metahub.space%2Ftt1355644%2F1%2F1%2Fw500.jpg'
    );

    // Double proxy prevention
    const doubleProxied = addon.proxyImageUrl(proxied, 'https://stremio.alirostami.com');
    assert.strictEqual(doubleProxied, proxied);

    // Non-URL pass-through
    assert.strictEqual(addon.proxyImageUrl(''), '');
    assert.strictEqual(addon.proxyImageUrl(null), null);
  });

  test('getMeta handles invalid or non-tt IDs gracefully', async () => {
    const resp1 = await addon.getMeta('series', '');
    assert.deepStrictEqual(resp1, { meta: null });

    const resp2 = await addon.getMeta('series', 'invalid123');
    assert.deepStrictEqual(resp2, { meta: null });
  });
});

describe('Season Number Detection', () => {
  test('extractSeasonNumber parses all Persian ordinal numbers correctly', () => {
    assert.strictEqual(addon.extractSeasonNumber('فصل اولبه اتمام رسیده'), 1);
    assert.strictEqual(addon.extractSeasonNumber('فصل دومبه اتمام رسیده'), 2);
    assert.strictEqual(addon.extractSeasonNumber('فصل دهمبه اتمام رسیده'), 10);
    assert.strictEqual(addon.extractSeasonNumber('فصل یازدهمبه اتمام رسیده'), 11);
    assert.strictEqual(addon.extractSeasonNumber('فصل دوازدهمبه اتمام رسیده'), 12);
    assert.strictEqual(addon.extractSeasonNumber('فصل سیزدهمبه اتمام رسیده'), 13);
    assert.strictEqual(addon.extractSeasonNumber('فصل بیستم'), 20);
  });

  test('extractSeasonNumber parses Persian and English digits correctly', () => {
    assert.strictEqual(addon.extractSeasonNumber('فصل ۱۲'), 12);
    assert.strictEqual(addon.extractSeasonNumber('فصل 11'), 11);
    assert.strictEqual(addon.extractSeasonNumber('Season 03'), 3);
    assert.strictEqual(addon.extractSeasonNumber('S02'), 2);
  });
});

