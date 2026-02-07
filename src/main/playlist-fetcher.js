const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);

function getNet() {
  // electron.net is only available after app.whenReady()
  // so we lazy-require it at call time
  return require('electron').net;
}

function request(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const net = getNet();

    const req = net.request({
      url,
      method: 'GET',
      redirect: 'follow',
      useSessionCookies: true
    });

    req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    req.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    req.setHeader('Accept-Language', 'en-US,en;q=0.9');

    const timer = setTimeout(() => {
      req.abort();
      reject(new Error('Request timed out'));
    }, timeoutMs);

    const chunks = [];
    let headers = {};
    let statusCode = 0;

    req.on('response', (response) => {
      statusCode = response.statusCode;
      headers = response.headers;

      response.on('data', (chunk) => {
        chunks.push(chunk);
      });

      response.on('end', () => {
        clearTimeout(timer);
        const buffer = Buffer.concat(chunks);
        resolve({ buffer, headers, statusCode });
      });

      response.on('error', (err) => {
        clearTimeout(timer);
        if (chunks.length > 0) {
          resolve({ buffer: Buffer.concat(chunks), headers, statusCode });
        } else {
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    req.end();
  });
}

async function fetchPlaylist(url) {
  // Try with electron.net first (Chromium network stack, bypasses Cloudflare)
  let buffer, statusCode;
  try {
    const result = await request(url, 30000);
    buffer = result.buffer;
    statusCode = result.statusCode;
  } catch (err) {
    throw new Error(`Connection failed: ${err.message}`);
  }

  // If we got a non-standard error code (like 884) with no useful body,
  // try alternative DNS hosts if it's an Xtream-style URL
  if (buffer.length === 0 || (statusCode >= 400 && buffer.length < 50)) {
    // Try replacing the host with alternative DNS entries
    const altHosts = tryAlternativeHosts(url);
    for (const altUrl of altHosts) {
      try {
        const result = await request(altUrl, 30000);
        if (result.buffer.length > 100) {
          buffer = result.buffer;
          statusCode = result.statusCode;
          break;
        }
      } catch (_) {
        // Continue to next alternative
      }
    }
  }

  if (buffer.length === 0) {
    throw new Error(`Server returned HTTP ${statusCode} with empty response. Try a different DNS/server URL from your provider.`);
  }

  let text = buffer.toString('utf-8');

  // Detect gzip magic bytes (some servers send gzipped without headers)
  if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    const decompressed = await gunzip(buffer);
    text = decompressed.toString('utf-8');
  }

  return text;
}

function tryAlternativeHosts(url) {
  // For Xtream-style URLs, try common alternative prefixes
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const alternatives = [];

    // Common IPTV DNS patterns - try http explicitly
    const parts = host.split('.');
    if (parts.length >= 2) {
      const domain = parts.slice(-2).join('.');
      const possiblePrefixes = ['cf.', 'pro.', 'cf.hi-', 'hi-'];
      for (const prefix of possiblePrefixes) {
        const altHost = prefix + domain;
        if (altHost !== host) {
          const altUrl = new URL(url);
          altUrl.hostname = altHost;
          altUrl.protocol = 'http:'; // Force HTTP as many IPTV servers require it
          alternatives.push(altUrl.href);
        }
      }
    }
    return alternatives;
  } catch (_) {
    return [];
  }
}

async function fetchEpg(url) {
  const { buffer, headers } = await request(url, 90000);

  const contentType = Array.isArray(headers['content-type'])
    ? headers['content-type'][0]
    : (headers['content-type'] || '');

  const isGzipped = url.endsWith('.gz') ||
    contentType.includes('gzip') ||
    (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b);

  if (isGzipped) {
    const decompressed = await gunzip(buffer);
    return decompressed.toString('utf-8');
  }

  return buffer.toString('utf-8');
}

module.exports = { fetchPlaylist, fetchEpg };
