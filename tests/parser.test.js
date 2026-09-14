const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Ensure BASE_URL is set before requiring addon
process.env.BASE_URL = process.env.BASE_URL || 'https://f2my.top';

const addon = require('../addon.js');
const { extractMovieStreams, extractSeriesStreams, detectQuality, fetchPage, resolveViaQuickSearch, client, getBaseUrl, setBaseUrl } = addon;

describe('Parser Tests', () => {
  it('Test 2: Akira HTML fixture must return at least 3 streams with 1080p,720p,480p', () => {
    const html = fs.readFileSync(path.join(__dirname, 'akira.fixture.html'), 'utf8');
    const $ = cheerio.load(html);
    const streams = extractMovieStreams($);
    console.log('Extracted streams:', JSON.stringify(streams, null, 2));
    assert.ok(Array.isArray(streams), 'streams should be array');
    assert.ok(streams.length >= 3, `expected at least 3 streams, got ${streams.length}`);
    const urls = streams.map(s => s.url).join(' ');
    const titles = streams.map(s => s.title).join(' ') + ' ' + streams.map(s => s.name).join(' ');
    const combined = (urls + ' ' + titles).toLowerCase();
    assert.ok(combined.includes('1080'), 'should contain 1080p');
    assert.ok(combined.includes('720'), 'should contain 720p');
    assert.ok(combined.includes('480'), 'should contain 480p');
    // Validate stream object format
    for (const s of streams) {
      assert.ok(s.url && typeof s.url === 'string' && s.url.startsWith('http'), `invalid url ${s.url}`);
      assert.ok(s.name && typeof s.name === 'string', 'missing name');
      assert.ok(s.title && typeof s.title === 'string', 'missing title');
    }
  });

  it('Test 3: Missing/null HTML must not crash', () => {
    assert.doesNotThrow(() => {
      const r1 = extractMovieStreams(null);
      assert.deepEqual(r1, [], 'null should return []');
    });
    assert.doesNotThrow(() => {
      const r2 = extractMovieStreams(undefined);
      assert.deepEqual(r2, [], 'undefined should return []');
    });
    assert.doesNotThrow(async () => {
      const r3 = await extractSeriesStreams(null, 1, 1);
      assert.deepEqual(r3, [], 'null series should return []');
    });
  });

  it('Test 4: Page with no download links should return [] without throwing', () => {
    const html = '<html><body><div class="content"><p>No links here</p></div></body></html>';
    const $ = cheerio.load(html);
    const streams = extractMovieStreams($);
    assert.deepEqual(streams, []);
    // Also test empty body
    const $2 = cheerio.load('<html></html>');
    const streams2 = extractMovieStreams($2);
    assert.deepEqual(streams2, []);
  });

  it('Test 5: onclick-based download URL extraction', () => {
    const html = `
      <html><body>
        <div class="download-list">
          <div class="d-flex">
            <a href="#" onclick="handleDownloadClick('https://example.com/movie.1080p.mkv')">Download</a>
          </div>
          <div class="d-flex">
            <a href="https://example.com/movie.720p.mkv" onclick="handleDownloadClick('https://example.com/movie.720p.mkv')">Download 720p</a>
          </div>
          <div class="d-flex">
            <a href="https://example.com/movie.480p.mkv">Direct 480p</a>
          </div>
        </div>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const streams = extractMovieStreams($);
    console.log('onclick streams', streams);
    assert.ok(streams.length >= 3, `expected at least 3, got ${streams.length}`);
    // Check that onclick URL was extracted correctly (not "#")
    const urls = streams.map(s => s.url);
    assert.ok(urls.includes('https://example.com/movie.1080p.mkv'), 'onclick URL 1080p not extracted');
    assert.ok(urls.includes('https://example.com/movie.720p.mkv'), 'onclick URL 720p not extracted');
    assert.ok(urls.includes('https://example.com/movie.480p.mkv'), 'direct href not extracted');
  });

  it('detectQuality should correctly identify 1080p,720p,480p', () => {
    assert.equal(detectQuality('https://example.com/Akira.1988.1080p.mkv', ''), '1080p');
    assert.equal(detectQuality('https://example.com/Akira.1988.720p.mkv', ''), '720p');
    assert.equal(detectQuality('https://example.com/Akira.1988.480p.mkv', ''), '480p');
    assert.equal(detectQuality('https://example.com/movie.4k.mkv', ''), '4K');
    assert.equal(detectQuality('https://example.com/movie.mkv', '1080p quality'), '1080p');
  });

  it('Test 1: quick-search mock - imdb tt0094625 resolves to /7092/akira-1988/', async () => {
    // Mock client.get
    const originalGet = client.get;
    const mockData = [
      { imdb_id: 'tt1234567', url: '/123/some-other-movie/', title: 'Other' },
      { imdb_id: 'tt0094625', url: '/7092/akira-1988/', title: 'Akira' },
      { imdb_id: 'tt9999999', url: '/999/test/', title: 'Test' }
    ];
    client.get = async (url) => {
      assert.ok(url.toLowerCase().includes('tt0094625'), 'qs url should contain imdb id');
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: mockData,
        request: {}
      };
    };
    const result = await resolveViaQuickSearch('tt0094625');
    assert.ok(result, 'result should not be null');
    assert.ok(result.includes('/7092/akira-1988/'), `resolved url should contain /7092/akira-1988/, got ${result}`);
    assert.ok(result.startsWith('http'), 'should be absolute url');
    // Test case-insensitive matching
    const result2 = await resolveViaQuickSearch('TT0094625');
    assert.ok(result2 && result2.includes('/7092/akira-1988/'));

    // Restore
    client.get = originalGet;
  });

  it('resolveViaQuickSearch handles absolute URL in response', async () => {
    const originalGet = client.get;
    client.get = async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: [{ imdb_id: 'tt0094625', url: 'https://www.f2my.top/7092/akira-1988/' }],
      request: {}
    });
    const result = await resolveViaQuickSearch('tt0094625');
    assert.equal(result, 'https://www.f2my.top/7092/akira-1988/');
    client.get = originalGet;
  });

  it('resolveViaQuickSearch handles BASE_URL correctly', async () => {
    const originalGet = client.get;
    const base = getBaseUrl();
    assert.ok(base, 'BASE_URL should be defined');
    // Test that relative url without leading slash is handled
    client.get = async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: [{ imdb_id: 'tt0094625', url: '7092/akira-1988/' }],
      request: {}
    });
    const result = await resolveViaQuickSearch('tt0094625');
    assert.ok(result.includes('7092/akira-1988/'), `got ${result}`);
    assert.ok(result.startsWith('http'));
    client.get = originalGet;
  });

  it('fetchPage handles null url gracefully', async () => {
    const result = await fetchPage(null);
    assert.equal(result, null);
    const result2 = await fetchPage('');
    assert.equal(result2, null);
  });

  it('fetchPage handles non-200 status', async () => {
    const originalGet = client.get;
    client.get = async () => ({
      status: 403,
      headers: { 'content-type': 'text/html' },
      data: '<html>Forbidden</html>',
      request: { res: { responseUrl: 'https://f2my.top/7092/akira-1988/' } }
    });
    const result = await fetchPage('https://f2my.top/7092/akira-1988/');
    assert.equal(result, null);
    client.get = originalGet;
  });

  it('getStreams handles null contentUrl gracefully', async () => {
    const originalResolve = addon.resolveViaQuickSearch;
    // Mock resolve to return null
    const originalClientGet = client.get;
    client.get = async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: [], // no match
      request: {}
    });
    const streams = await addon.getStreams('movie', 'tt0000000');
    assert.deepEqual(streams, [], 'should return empty array when not found');
    client.get = originalClientGet;
  });

  it('Stream object format validation', () => {
    const html = fs.readFileSync(path.join(__dirname, 'akira.fixture.html'), 'utf8');
    const $ = cheerio.load(html);
    const streams = extractMovieStreams($);
    for (const s of streams) {
      assert.ok(s.url && s.url.startsWith('http'), 'url must be valid http');
      assert.ok(typeof s.name === 'string' && s.name.length > 0, 'name must be non-empty string');
      assert.ok(typeof s.title === 'string', 'title must be string');
      // Ensure no empty url
      assert.notEqual(s.url, '');
    }
  });

  it('setBaseUrl updates client', () => {
    const original = getBaseUrl();
    setBaseUrl('https://www.f2my.top');
    assert.equal(getBaseUrl(), 'https://www.f2my.top');
    assert.equal(client.defaults.baseURL, 'https://www.f2my.top');
    // restore
    setBaseUrl(original);
  });
});
