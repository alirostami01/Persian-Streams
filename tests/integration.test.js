const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

process.env.BASE_URL = process.env.BASE_URL || 'https://f2my.top';
const addon = require('../addon.js');
const { getStreams, client } = addon;

describe('Integration Tests', () => {
  it('Akira full flow: tt0094625 -> 3+ streams via mocked network', async () => {
    const html = fs.readFileSync(path.join(__dirname, 'akira.fixture.html'), 'utf8');
    const originalGet = client.get;
    // Mock quick-search and fetchPage via client.get
    client.get = async (url) => {
      if (url.includes('quick-search')) {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: [{ imdb_id: 'tt0094625', url: '/7092/akira-1988/' }],
          request: {}
        };
      }
      // Fetch page
      if (url.includes('7092/akira-1988')) {
        return {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
          data: html,
          request: { res: { responseUrl: 'https://f2my.top/7092/akira-1988/' } }
        };
      }
      throw new Error('unexpected url ' + url);
    };

    const streams = await getStreams('movie', 'tt0094625');
    console.log('Akira integration streams', streams);
    assert.ok(streams.length >= 3, `expected >=3 streams, got ${streams.length}`);
    const combined = streams.map(s => s.url + ' ' + s.title + ' ' + s.name).join(' ').toLowerCase();
    assert.ok(combined.includes('1080'), '1080p missing');
    assert.ok(combined.includes('720'), '720p missing');
    assert.ok(combined.includes('480'), '480p missing');

    client.get = originalGet;
  });

  it('Movie not found returns empty streams without crash', async () => {
    const originalGet = client.get;
    client.get = async (url) => {
      if (url.includes('quick-search')) {
        return { status: 200, headers: { 'content-type': 'application/json' }, data: [], request: {} };
      }
      throw new Error('should not fetch page');
    };
    const streams = await getStreams('movie', 'tt0000000');
    assert.deepEqual(streams, []);
    client.get = originalGet;
  });

  it('Series S01E01 extraction', async () => {
    const html = fs.readFileSync(path.join(__dirname, 'series.fixture.html'), 'utf8');
    const originalGet = client.get;
    client.get = async (url) => {
      if (url.includes('quick-search')) {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: [{ imdb_id: 'tt1234567', url: '/series/test-series/' }],
          request: {}
        };
      }
      if (url.includes('/series/test-series')) {
        return {
          status: 200,
          headers: { 'content-type': 'text/html' },
          data: html,
          request: { res: { responseUrl: 'https://f2my.top/series/test-series/' } }
        };
      }
      throw new Error('unexpected ' + url);
    };
    const streams = await getStreams('series', 'tt1234567', 1, 1);
    console.log('series S01E01 streams', streams);
    assert.ok(streams.length >= 1, `expected >=1 got ${streams.length}`);
    assert.ok(streams[0].url.includes('S01E01') || streams[0].url.includes('1080'), 'url should contain episode');
    assert.ok(streams[0].title.includes('S1E1') || streams[0].title.includes('1080'));

    // Test S02E01
    const streams2 = await getStreams('series', 'tt1234567', 2, 1);
    assert.ok(streams2.length >= 1);

    client.get = originalGet;
  });

  it('Series not found episode returns empty', async () => {
    const html = fs.readFileSync(path.join(__dirname, 'series.fixture.html'), 'utf8');
    const originalGet = client.get;
    client.get = async (url) => {
      if (url.includes('quick-search')) {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: [{ imdb_id: 'tt1234567', url: '/series/test-series/' }],
          request: {}
        };
      }
      return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        data: html,
        request: { res: { responseUrl: 'https://f2my.top/series/test-series/' } }
      };
    };
    const streams = await getStreams('series', 'tt1234567', 9, 99);
    assert.deepEqual(streams, [], 'nonexistent episode should return []');
    client.get = originalGet;
  });

  it('Fetch page failure (403) returns empty streams', async () => {
    const originalGet = client.get;
    client.get = async (url) => {
      if (url.includes('quick-search')) {
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: [{ imdb_id: 'tt0094625', url: '/7092/akira-1988/' }],
          request: {}
        };
      }
      // Simulate Cloudflare 403
      return {
        status: 403,
        headers: { 'content-type': 'text/html' },
        data: '<html><body>Attention Required! Cloudflare</body></html>',
        request: { res: { responseUrl: 'https://f2my.top/7092/akira-1988/' } }
      };
    };
    const streams = await getStreams('movie', 'tt0094625');
    assert.deepEqual(streams, [], '403 should result in empty streams but not throw');
    client.get = originalGet;
  });

  it('Handles quick-search non-200', async () => {
    const originalGet = client.get;
    client.get = async () => ({
      status: 500,
      headers: { 'content-type': 'application/json' },
      data: [],
      request: {}
    });
    const streams = await getStreams('movie', 'tt0094625');
    assert.deepEqual(streams, []);
    client.get = originalGet;
  });
});
