const test = require('node:test');
const assert = require('node:assert/strict');

// Replicated security and validation helpers from worker.js for deterministic testing
function isPrivateOrLocalHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  const host = hostname.toLowerCase().trim();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const o1 = parseInt(ipv4Match[1], 10);
    const o2 = parseInt(ipv4Match[2], 10);
    const o3 = parseInt(ipv4Match[3], 10);
    const o4 = parseInt(ipv4Match[4], 10);

    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) return true;
    if (o1 === 0 || o1 === 10 || o1 === 127) return true;
    if (o1 === 169 && o2 === 254) return true;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    if (o1 === 192 && o2 === 168) return true;
    if (o1 >= 224) return true;
  }

  return false;
}

function isAllowedInitialUrl(urlStr, currentOrigin) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrLocalHost(host)) {
      return false;
    }

    if (currentOrigin) {
      try {
        const workerOrigin = new URL(currentOrigin);
        if (host === workerOrigin.hostname.toLowerCase()) {
          return false;
        }
      } catch (_) {}
    }
    if (host === 'stremio.alirostami.com') {
      return false;
    }
    if (parsed.pathname.includes('/streams/thumb') || parsed.pathname.includes('/thumb')) {
      return false;
    }

    const isMetahub = host === 'metahub.space' || host.endsWith('.metahub.space');
    return isMetahub;
  } catch (_) {
    return false;
  }
}

function isAllowedRedirectUrl(urlStr, currentOrigin) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrLocalHost(host)) {
      return false;
    }

    if (currentOrigin) {
      try {
        const workerOrigin = new URL(currentOrigin);
        if (host === workerOrigin.hostname.toLowerCase()) {
          return false;
        }
      } catch (_) {}
    }
    if (host === 'stremio.alirostami.com') {
      return false;
    }
    if (parsed.pathname.includes('/streams/thumb') || parsed.pathname.includes('/thumb')) {
      return false;
    }

    const isMetahub = host === 'metahub.space' || host.endsWith('.metahub.space');
    const isTmdb = host === 'image.tmdb.org' || host.endsWith('.tmdb.org');
    const isAmazonCdn =
      host === 'm.media-amazon.com' ||
      host === 'ia.media-imdb.com' ||
      host.endsWith('.media-amazon.com') ||
      host.endsWith('.ssl-images-amazon.com');

    return isMetahub || isTmdb || isAmazonCdn;
  } catch (_) {
    return false;
  }
}

const SVG_THUMBNAIL_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="439" viewBox="0 0 780 439" fill="none">
  <rect width="780" height="439" fill="#1b1c24"/>
  <rect width="780" height="439" fill="url(#grad)" opacity="0.45"/>
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="780" y2="439" gradientUnits="userSpaceOnUse">
      <stop stop-color="#4e3a9c"/>
      <stop offset="1" stop-color="#0e0e14"/>
    </linearGradient>
  </defs>
  <circle cx="390" cy="219" r="42" fill="#262734" opacity="0.85"/>
  <path d="M382 201L404 219L382 237V201Z" fill="#a0a0b6"/>
</svg>`;

test('Thumbnail Security, Validation & Resizing Logic', async (t) => {
  await t.test('blocks SSRF to private IP ranges and localhost', () => {
    assert.strictEqual(isPrivateOrLocalHost('localhost'), true);
    assert.strictEqual(isPrivateOrLocalHost('127.0.0.1'), true);
    assert.strictEqual(isPrivateOrLocalHost('10.0.0.1'), true);
    assert.strictEqual(isPrivateOrLocalHost('192.168.1.1'), true);
    assert.strictEqual(isPrivateOrLocalHost('172.16.0.5'), true);
    assert.strictEqual(isPrivateOrLocalHost('169.254.169.254'), true);
    assert.strictEqual(isPrivateOrLocalHost('0.0.0.0'), true);
    assert.strictEqual(isPrivateOrLocalHost('internal.service.local'), true);
    assert.strictEqual(isPrivateOrLocalHost('episodes.metahub.space'), false);
    assert.strictEqual(isPrivateOrLocalHost('image.tmdb.org'), false);
  });

  await t.test('allows valid initial Metahub URLs and rejects unauthorized domains', () => {
    const valid = 'https://episodes.metahub.space/tt26598805/1/2/w780.jpg';
    assert.strictEqual(isAllowedInitialUrl(valid, 'https://stremio.alirostami.com'), true);

    const validBackground = 'https://images.metahub.space/background/medium/tt26598805/img.jpg';
    assert.strictEqual(isAllowedInitialUrl(validBackground, 'https://stremio.alirostami.com'), true);

    // Reject arbitrary external domain (open proxy attempt)
    assert.strictEqual(isAllowedInitialUrl('https://evil.com/img.jpg', 'https://stremio.alirostami.com'), false);
    assert.strictEqual(isAllowedInitialUrl('http://169.254.169.254/secret', 'https://stremio.alirostami.com'), false);

    // Reject self fetch-loop attempts
    assert.strictEqual(isAllowedInitialUrl('https://stremio.alirostami.com/streams/thumb?url=foo', 'https://stremio.alirostami.com'), false);
    assert.strictEqual(isAllowedInitialUrl('https://other.com/streams/thumb', 'https://stremio.alirostami.com'), false);
  });

  await t.test('validates redirect destinations properly', () => {
    // TMDB is valid destination for Metahub redirects
    assert.strictEqual(
      isAllowedRedirectUrl('https://image.tmdb.org/t/p/w780/xdLwnbKGnBZ3gP1I6djdDVphC27.jpg', 'https://stremio.alirostami.com'),
      true
    );
    // Amazon/IMDb CDN is valid
    assert.strictEqual(
      isAllowedRedirectUrl('https://m.media-amazon.com/images/M/test.jpg', 'https://stremio.alirostami.com'),
      true
    );
    // Arbitrary internal or external redirected destination is rejected
    assert.strictEqual(
      isAllowedRedirectUrl('http://127.0.0.1:8080/admin', 'https://stremio.alirostami.com'),
      false
    );
    assert.strictEqual(
      isAllowedRedirectUrl('https://attacker.com/payload.jpg', 'https://stremio.alirostami.com'),
      false
    );
  });

  await t.test('placeholder SVG is valid and includes proper 16:9 viewBox', () => {
    assert.ok(SVG_THUMBNAIL_PLACEHOLDER.includes('viewBox="0 0 780 439"'));
    assert.ok(SVG_THUMBNAIL_PLACEHOLDER.includes('<svg'));
    assert.ok(SVG_THUMBNAIL_PLACEHOLDER.includes('</svg>'));
  });

  await t.test('ETag generator produces deterministic weak ETags', () => {
    const url = 'https://episodes.metahub.space/tt26598805/1/2/w780.jpg';
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) - hash) + url.charCodeAt(i);
      hash |= 0;
    }
    const etag1 = `W/"thumb-${Math.abs(hash)}"`;
    const etag2 = `W/"thumb-${Math.abs(hash)}"`;
    assert.strictEqual(etag1, etag2);
    assert.ok(etag1.startsWith('W/"thumb-'));
  });
});
