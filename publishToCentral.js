const { publishToCentral } = require('stremio-addon-sdk');

const MANIFEST_URL = 'https://stremio.alirostami.com/streams/manifest.json';

async function main() {
  console.log(`Validating manifest: ${MANIFEST_URL}`);

  const response = await fetch(MANIFEST_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Manifest request failed: HTTP ${response.status}`);
  }

  const manifest = await response.json();

  for (const field of ['id', 'version', 'name', 'description', 'resources', 'types', 'catalogs']) {
    if (manifest[field] === undefined || manifest[field] === null) {
      throw new Error(`Manifest is missing required field: ${field}`);
    }
  }

  if (!Array.isArray(manifest.resources) || !manifest.resources.includes('stream')) {
    throw new Error('Manifest does not advertise the stream resource.');
  }

  console.log(`Manifest OK: ${manifest.name} ${manifest.version} (${manifest.id})`);
  console.log('Publishing addon to Stremio Central Catalog...');

  await publishToCentral(MANIFEST_URL);

  console.log('Addon published to Stremio Central Catalog successfully.');
}

main().catch((error) => {
  console.error(`Central Catalog publication failed: ${error.message}`);
  process.exit(1);
});
