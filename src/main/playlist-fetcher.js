const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);

async function fetchPlaylist(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'M3UPlayer/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchEpg(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'M3UPlayer/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const isGzipped = url.endsWith('.gz') ||
      response.headers.get('content-encoding') === 'gzip' ||
      response.headers.get('content-type')?.includes('gzip');

    if (isGzipped) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const decompressed = await gunzip(buffer);
      return decompressed.toString('utf-8');
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { fetchPlaylist, fetchEpg };
