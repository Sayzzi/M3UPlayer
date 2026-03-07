const https = require('https');
const http = require('http');
const zlib = require('zlib');

/* ── Title Cleaning ──────────────────────────────────────── */

function cleanTitle(title) {
  if (!title) return '';

  // Extract season/episode info before cleaning
  let season = null;
  let episode = null;
  const seMatch = title.match(/S(\d{1,2})\s*E(\d{1,3})/i);
  if (seMatch) {
    season = parseInt(seMatch[1], 10);
    episode = parseInt(seMatch[2], 10);
  }

  let cleaned = title;

  // Split on common delimiters and take the best part
  const parts = cleaned.split(/\s*[-|:]\s*/);
  if (parts.length > 1) {
    // Skip common prefix patterns (country codes, service names)
    const prefixPattern =
      /^(FR|EN|UK|US|DE|ES|IT|PT|AR|VF|VO|VOSTFR|MULTI|4K|UHD|FHD|HD|SD|NF|NETFLIX|PRIME|DISNEY|AMAZON|HBO|TOP)$/i;
    const bestParts = parts.filter((p) => !prefixPattern.test(p.trim()));
    if (bestParts.length > 0) {
      // Take the longest remaining part (likely the actual title)
      cleaned = bestParts.reduce((a, b) => (a.length >= b.length ? a : b));
    }
  }

  // Remove season/episode markers
  cleaned = cleaned.replace(/S\d{1,2}\s*E\d{1,3}/gi, '');
  cleaned = cleaned.replace(/saison\s*\d+/gi, '');
  cleaned = cleaned.replace(/episode\s*\d+/gi, '');

  // Remove year in parentheses/brackets
  cleaned = cleaned.replace(/[\[(]\d{4}[\])]/g, '');
  // Remove standalone year
  cleaned = cleaned.replace(/\b(19|20)\d{2}\b/g, '');

  // Remove country codes in parens
  cleaned = cleaned.replace(/[\[(](US|UK|FR|DE|ES|IT|CA|AU|NZ|JP|KR|CN|IN|BR|MX)[\])]/gi, '');

  // Remove quality/codec tags
  cleaned = cleaned.replace(
    /\b(2160p|1080p|720p|480p|4K|UHD|FHD|HD|SD|HDR|HDR10|DV|HEVC|H\.?265|H\.?264|x264|x265|AAC|AC3|DTS|TRUEHD|ATMOS|WEB-?DL|WEB-?RIP|BLU-?RAY|BLURAY|BDRIP|BRRIP|DVDRIP|HDTV|HDRIP|REMUX|PROPER|REPACK|EXTENDED|UNRATED|DIRECTORS\.?CUT)\b/gi,
    ''
  );

  // Remove language tags
  cleaned = cleaned.replace(
    /\b(MULTI|TRUEFRENCH|FRENCH|ENGLISH|VOSTFR|VF|VO|VOST|SUBBED|DUBBED)\b/gi,
    ''
  );

  // Remove file extensions
  cleaned = cleaned.replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm|mpg|mpeg|ts)$/i, '');

  // Remove extra whitespace and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Remove trailing dots, dashes, underscores
  cleaned = cleaned.replace(/[.\-_]+$/, '').trim();

  return { title: cleaned, season, episode };
}

/* ── IMDB ID Lookup via Cinemeta ─────────────────────────── */

function httpGet(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { timeout }, (res) => {
      // Handle redirects
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        return httpGet(res.headers.location, timeout).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function searchImdbId(title, type = 'movie') {
  const encoded = encodeURIComponent(title);

  // Try the specified type first
  const types = type === 'series' ? ['series', 'movie'] : ['movie', 'series'];

  for (const t of types) {
    try {
      const url = `https://v3-cinemeta.strem.io/catalog/${t}/top/search=${encoded}.json`;
      const buf = await httpGet(url);
      const json = JSON.parse(buf.toString());
      if (json.metas && json.metas.length > 0) {
        return { imdbId: json.metas[0].imdb_id, type: t };
      }
    } catch {
      // Try next type
    }
  }
  return null;
}

/* ── Wyzie Subs Search ───────────────────────────────────── */

async function searchWyzieSubs(imdbId, lang = 'fr', season, episode) {
  let url = `https://sub.wyzie.ru/search?id=${imdbId}&language=${lang}`;
  if (season != null) url += `&season=${season}`;
  if (episode != null) url += `&episode=${episode}`;

  const buf = await httpGet(url, 15000);
  const results = JSON.parse(buf.toString());

  if (!Array.isArray(results) || results.length === 0) {
    return [];
  }

  return results.slice(0, 10).map((r) => ({
    id: r.id || r.SubHash || String(Math.random()),
    url: r.url || r.SubDownloadLink,
    fileName: r.fileName || r.SubFileName || 'subtitle.srt',
    language: r.language || r.LanguageName || lang,
    source: 'wyzie'
  }));
}

/* ── Subtitle Search Orchestrator ────────────────────────── */

async function searchSubtitles(query, language = 'fr', type = 'movie') {
  const { title, season, episode } = cleanTitle(query);
  if (!title) return [];

  console.log(`[Subtitles] Searching for: "${title}" (${type}, ${language})`);

  // Step 1: Get IMDB ID
  const result = await searchImdbId(title, type === 'series' ? 'series' : 'movie');
  if (!result) {
    console.log('[Subtitles] No IMDB ID found');
    return [];
  }

  console.log(`[Subtitles] Found IMDB: ${result.imdbId} (${result.type})`);

  // Step 2: Search Wyzie Subs
  const subs = await searchWyzieSubs(result.imdbId, language, season, episode);
  console.log(`[Subtitles] Found ${subs.length} subtitle(s)`);
  return subs;
}

/* ── ZIP Extraction ──────────────────────────────────────── */

function extractSrtFromZip(buffer) {
  // Check ZIP magic bytes
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return null;
  }

  let offset = 0;
  while (offset < buffer.length - 30) {
    // Local file header signature
    if (
      buffer[offset] !== 0x50 ||
      buffer[offset + 1] !== 0x4b ||
      buffer[offset + 2] !== 0x03 ||
      buffer[offset + 3] !== 0x04
    ) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const fileName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLength);
    const dataStart = offset + 30 + fileNameLength + extraFieldLength;

    if (/\.srt$/i.test(fileName)) {
      const compressedData = buffer.slice(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) {
        // Stored
        return compressedData.toString('utf8');
      } else if (compressionMethod === 8) {
        // Deflate
        const decompressed = zlib.inflateRawSync(compressedData);
        return decompressed.toString('utf8');
      }
    }

    offset = dataStart + compressedSize;
  }

  return null;
}

/* ── Download Subtitle ───────────────────────────────────── */

async function downloadSubtitle(url) {
  const buf = await httpGet(url, 30000);

  // Check if it's a ZIP
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const srt = extractSrtFromZip(buf);
    if (srt) return srt;
  }

  return buf.toString('utf8');
}

/* ── Fetch Subtitle (Search + Download) ──────────────────── */

async function fetchSubtitle(query, language = 'fr', type = 'movie') {
  const results = await searchSubtitles(query, language, type);
  if (results.length === 0) {
    return null;
  }

  // Try each result until one succeeds
  for (const sub of results) {
    if (!sub.url) continue;
    try {
      const content = await downloadSubtitle(sub.url);
      if (content && content.length > 50) {
        console.log(`[Subtitles] Downloaded: ${sub.fileName}`);
        return {
          content,
          fileName: sub.fileName,
          language: sub.language
        };
      }
    } catch (err) {
      console.warn(`[Subtitles] Download failed for ${sub.fileName}:`, err.message);
    }
  }

  return null;
}

module.exports = { searchSubtitles, downloadSubtitle, fetchSubtitle, cleanTitle };
