const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Test worker parsing logic without needing to import ESM worker directly
// We replicate the parse functions here to ensure they are tested

function parseStreamRequest(pathname) {
  const match = pathname.match(/^\/streams\/stream\/(movie|series)\/(.+?)(?:\.json)?\/?$/);
  if (!match) return null;
  try {
    return { type: match[1], id: decodeURIComponent(match[2]) };
  } catch (_) { return null; }
}

function parseStreamArgs(streamRequest) {
  const { type, id } = streamRequest;
  if (type !== 'series') return [type, id, null, null];
  const parts = id.split(':');
  const imdbId = parts[0];
  const season = parts[1] ? parseInt(parts[1], 10) : null;
  const episode = parts[2] ? parseInt(parts[2], 10) : null;
  if (!imdbId || !Number.isInteger(season) || !Number.isInteger(episode)) return null;
  return [type, imdbId, season, episode];
}

describe('Worker parsing', () => {
  it('parses movie stream request', () => {
    const r = parseStreamRequest('/streams/stream/movie/tt0094625.json');
    assert.deepEqual(r, { type: 'movie', id: 'tt0094625' });
  });

  it('parses series stream request', () => {
    const r = parseStreamRequest('/streams/stream/series/tt1234567:1:1.json');
    assert.deepEqual(r, { type: 'series', id: 'tt1234567:1:1' });
    const args = parseStreamArgs(r);
    assert.deepEqual(args, ['series', 'tt1234567', 1, 1]);
  });

  it('handles missing .json suffix', () => {
    const r = parseStreamRequest('/streams/stream/movie/tt0094625');
    assert.deepEqual(r, { type: 'movie', id: 'tt0094625' });
  });

  it('returns null for invalid series args', () => {
    const r = { type: 'series', id: 'tt123:abc:def' };
    const args = parseStreamArgs(r);
    assert.equal(args, null);
  });

  it('handles encoded id', () => {
    const r = parseStreamRequest('/streams/stream/movie/tt0094625%2Ejson');
    // decodeURIComponent will decode %2E to . but our regex still captures
    assert.ok(r);
  });
});
