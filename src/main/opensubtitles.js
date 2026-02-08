const https = require('https');
const zlib = require('zlib');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Search for subtitles using Wyzie Subs API (free, open-source)
 * First searches OMDB for IMDB ID, then uses Wyzie
 */
async function searchSubtitles(query, language = 'fr', _type = null) {
  const cleanQuery = cleanTitle(query);
  console.log(`Searching subtitles for: "${cleanQuery}" in ${language}`);
  
  // Extract season/episode info for series
  const seMatch = cleanQuery.match(/S(\d{1,2})E(\d{1,2})/i);
  const season = seMatch ? parseInt(seMatch[1]) : null;
  const episode = seMatch ? parseInt(seMatch[2]) : null;
  const titleOnly = cleanQuery.replace(/S\d{1,2}E\d{1,2}/i, '').trim();
  
  // First, get IMDB ID from OMDB
  const imdbId = await searchImdbId(titleOnly, season ? 'series' : 'movie');
  if (!imdbId) {
    console.log('Could not find IMDB ID');
    return [];
  }
  console.log(`Found IMDB ID: ${imdbId}`);
  
  // Now use Wyzie Subs API
  return searchWyzieSubs(imdbId, language, season, episode);
}

/**
 * Search for IMDB ID using Cinemeta API (Stremio's free API)
 */
async function searchImdbId(title, type = 'movie') {
  return new Promise((resolve) => {
    const catalogType = type === 'series' ? 'series' : 'movie';
    const encodedTitle = encodeURIComponent(title);
    const path = `/catalog/${catalogType}/top/search=${encodedTitle}.json`;
    
    console.log(`Cinemeta: Searching for "${title}" (${catalogType})`);
    
    const req = https.request({
      hostname: 'v3-cinemeta.strem.io',
      path: path,
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.metas && json.metas.length > 0) {
            const result = json.metas[0];
            console.log(`Cinemeta: Found "${result.name}" (${result.imdb_id})`);
            resolve(result.imdb_id);
          } else {
            // Try the other type if first search fails
            if (type === 'series') {
              searchImdbIdFallback(title, 'movie').then(resolve);
            } else {
              searchImdbIdFallback(title, 'series').then(resolve);
            }
          }
        } catch {
          resolve(null);
        }
      });
    });
    
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * Fallback search with different type
 */
async function searchImdbIdFallback(title, type) {
  return new Promise((resolve) => {
    const catalogType = type === 'series' ? 'series' : 'movie';
    const encodedTitle = encodeURIComponent(title);
    const path = `/catalog/${catalogType}/top/search=${encodedTitle}.json`;
    
    const req = https.request({
      hostname: 'v3-cinemeta.strem.io',
      path: path,
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.metas && json.metas.length > 0) {
            console.log(`Cinemeta (fallback): Found "${json.metas[0].name}"`);
            resolve(json.metas[0].imdb_id);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
    
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * Search Wyzie Subs API (free, no rate limits)
 * API: https://sub.wyzie.ru/search?id=IMDB_ID&language=LANG&season=S&episode=E
 */
async function searchWyzieSubs(imdbId, lang, season = null, episode = null) {
  return new Promise((resolve) => {
    // Build query params
    const params = new URLSearchParams({
      id: imdbId,
      language: lang
    });
    if (season !== null) {
      params.append('season', season);
    }
    if (episode !== null) {
      params.append('episode', episode);
    }
    
    const path = `/search?${params.toString()}`;
    console.log(`Wyzie API request: https://sub.wyzie.ru${path}`);
    
    const req = https.request({
      hostname: 'sub.wyzie.ru',
      path: path,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            console.log(`Wyzie API status: ${res.statusCode}`);
            resolve([]);
            return;
          }
          const json = JSON.parse(data);
          if (Array.isArray(json) && json.length > 0) {
            const results = json.slice(0, 10).map(item => ({
              id: item.id || item.SubDownloadLink,
              url: item.SubDownloadLink || item.url,
              fileName: item.SubFileName || item.fileName || `subtitle_${lang}.srt`,
              language: item.LanguageName || item.language || lang,
              source: 'wyzie'
            })).filter(r => r.url);
            console.log(`Found ${results.length} subtitles from Wyzie`);
            resolve(results);
          } else {
            console.log('No subtitles found in Wyzie response');
            resolve([]);
          }
        } catch (e) {
          console.log('Wyzie parse error:', e.message);
          resolve([]);
        }
      });
    });
    
    req.on('error', (e) => {
      console.log('Wyzie request error:', e.message);
      resolve([]);
    });
    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

/**
 * Download subtitle from various sources
 * @param {string} url - Download URL (relative or absolute)
 * @param {string} [source] - Source identifier (yify, opensubtitles, etc.)
 * @returns {Promise<string>} - Subtitle content (SRT format)
 */
async function downloadSubtitle(url, source = '') {
  let fullUrl;
  let hostname;
  let path;

  // Determine the full URL based on source
  if (url.startsWith('http')) {
    fullUrl = url;
    const parsed = new URL(url);
    hostname = parsed.hostname;
    path = parsed.pathname + parsed.search;
  } else if (url.startsWith('/subtitle/')) {
    // YIFY subtitle
    hostname = 'yifysubtitles.org';
    path = url;
    fullUrl = `https://${hostname}${path}`;
  } else if (url.startsWith('/en/subtitleserve/')) {
    // OpenSubtitles
    hostname = 'www.opensubtitles.org';
    path = url;
    fullUrl = `https://${hostname}${path}`;
  } else {
    // Default to subdl
    hostname = 'dl.subdl.com';
    path = url;
    fullUrl = `https://${hostname}${path}`;
  }

  console.log(`Downloading from: ${fullUrl}`);
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: 'GET',
      headers: { 
        'User-Agent': USER_AGENT,
        'Accept': '*/*'
      }
    };

    const req = https.request(options, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        let location = res.headers.location || res.headers['Location'];
        if (location) {
          // Handle relative redirects
          if (location.startsWith('/')) {
            location = `https://${hostname}${location}`;
          }
          console.log(`Redirecting to: ${location}`);
          downloadSubtitle(location, source).then(resolve).catch(reject);
        } else {
          // No location header, consume response and continue
          console.log('Redirect without location, trying to read response anyway');
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length > 0) {
              resolve(buffer.toString('utf-8'));
            } else {
              reject(new Error('Redirect without location and empty body'));
            }
          });
        }
        return;
      }

      // Also handle 200 OK from cloudflare-style challenges
      if (res.statusCode !== 200) {
        console.log(`Download status: ${res.statusCode}`);
        // Try to read the body anyway for error details
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          console.log('Response body:', body.substring(0, 200));
          reject(new Error(`Download failed with status ${res.statusCode}`));
        });
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        console.log(`Downloaded ${buffer.length} bytes`);
        
        // Try to extract from ZIP first
        const zipContent = extractSrtFromZip(buffer);
        if (zipContent) {
          resolve(zipContent);
          return;
        }
        
        // Try as plain text
        const text = buffer.toString('utf-8');
        
        // Check if it looks like SRT content
        if (text.includes('-->') || text.match(/^\d+\r?\n/)) {
          resolve(text);
          return;
        }
        
        // For YIFY, we need to get the actual download link from the page
        if (hostname === 'yifysubtitles.org' && text.includes('download-zip')) {
          const zipMatch = text.match(/href="(\/subtitle\/[^"]+\.zip)"/i);
          if (zipMatch) {
            downloadSubtitle(`https://yifysubtitles.org${zipMatch[1]}`, 'yify')
              .then(resolve)
              .catch(reject);
            return;
          }
        }
        
        // Return whatever we got
        resolve(text);
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Download timeout'));
    });
    req.end();
  });
}

/**
 * Extract SRT content from a ZIP buffer (simple implementation)
 * @param {Buffer} zipBuffer - ZIP file buffer
 * @returns {string|null} - SRT content or null
 */
function extractSrtFromZip(zipBuffer) {
  try {
    // Simple ZIP extraction - look for SRT file
    // ZIP local file header signature: 0x04034b50
    if (zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4b) {
      return null; // Not a ZIP file
    }

    // Use zlib to decompress if it's a simple deflate
    // For proper ZIP support, we'd need a library, but let's try a simple approach
    
    // Find the first file in the ZIP
    let offset = 0;
    while (offset < zipBuffer.length - 30) {
      // Check for local file header
      if (zipBuffer.readUInt32LE(offset) === 0x04034b50) {
        const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
        const compressedSize = zipBuffer.readUInt32LE(offset + 18);
        const uncompressedSize = zipBuffer.readUInt32LE(offset + 22);
        const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
        const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);
        
        const fileName = zipBuffer.toString('utf-8', offset + 30, offset + 30 + fileNameLength);
        const dataOffset = offset + 30 + fileNameLength + extraFieldLength;
        
        // Check if it's an SRT file
        if (fileName.toLowerCase().endsWith('.srt')) {
          const compressedData = zipBuffer.slice(dataOffset, dataOffset + compressedSize);
          
          if (compressionMethod === 0) {
            // Stored (no compression)
            return compressedData.toString('utf-8');
          } else if (compressionMethod === 8) {
            // Deflate
            try {
              const decompressed = zlib.inflateRawSync(compressedData);
              return decompressed.toString('utf-8');
            } catch {
              // Try inflate with header
              try {
                const decompressed = zlib.inflateSync(compressedData);
                return decompressed.toString('utf-8');
              } catch {
                return null;
              }
            }
          }
        }
        
        // Move to next file
        offset = dataOffset + compressedSize;
      } else {
        offset++;
      }
    }
    
    return null;
  } catch (e) {
    console.error('ZIP extraction error:', e);
    return null;
  }
}

/**
 * Clean title for search - extract only the real movie/series name
 * Examples:
 *   "4K-NF - Better Call Saul (US) - NF - Better Call Saul (US) (4K) - S05E01" -> "Better Call Saul S05E01"
 *   "FR - Fight Club (1999)" -> "Fight Club"
 *   "4K-TOP - Ballerina (2025)" -> "Ballerina"
 */
function cleanTitle(title) {
  let clean = title;
  
  // Extract season/episode info first (S01E01, S01 E01, Season 1 Episode 1, etc.)
  let seasonEpisode = '';
  const seMatch = clean.match(/S(\d{1,2})\s*E(\d{1,2})/i);
  if (seMatch) {
    seasonEpisode = ` S${seMatch[1].padStart(2, '0')}E${seMatch[2].padStart(2, '0')}`;
  }
  
  // Remove everything after " - " patterns that repeat or contain quality/platform info
  // Split by common separators
  const parts = clean.split(/\s+-\s+/);
  
  // Find the best part (usually the actual title)
  let bestPart = '';
  for (const part of parts) {
    // Skip parts that are just prefixes/quality tags
    if (/^(FR|EN|VF|VOSTFR|VO|4K|HD|UHD|FHD|NF|TOP|MULTI|MULTi)$/i.test(part.trim())) {
      continue;
    }
    // Skip parts that contain quality in parentheses like "(4K)"
    if (/^[^a-z]*\(?4K\)?[^a-z]*$/i.test(part.trim())) {
      continue;
    }
    // Skip if it's a duplicate of what we already have
    if (bestPart && part.toLowerCase().includes(bestPart.toLowerCase().substring(0, 10))) {
      continue;
    }
    // This looks like a real title
    if (part.length > bestPart.length || !bestPart) {
      bestPart = part;
    }
  }
  
  clean = bestPart || parts[0] || title;
  
  // Now clean the selected part
  clean = clean
    // Remove leading prefixes (4K-, FR-, NF-, etc.)
    .replace(/^(4K|FR|EN|VF|VOSTFR|VO|HD|UHD|FHD|NF|TOP|MULTI)\s*[-:]\s*/gi, '')
    // Remove year in parentheses/brackets
    .replace(/\s*[([{]\d{4}[)\]}]\s*/g, ' ')
    // Remove country codes in parentheses like (US), (UK), (FR)
    .replace(/\s*\([A-Z]{2,3}\)\s*/g, ' ')
    // Remove quality tags
    .replace(/\b(2160p|1080p|720p|480p|HDRip|BRRip|BluRay|WEB-DL|HDTV|DVDRip|4K|UHD|HD|FHD|WEBRip|AMZN|NF)\b/gi, '')
    // Remove codec info
    .replace(/\b(x264|x265|HEVC|H\.?264|H\.?265|AAC|AC3|DTS|ATMOS|TrueHD)\b/gi, '')
    // Remove season/episode (we'll add it back cleaned)
    .replace(/\s*S\d{1,2}\s*E?\d{0,2}\s*/gi, '')
    // Remove "Season X Episode Y" format
    .replace(/\s*Season\s*\d+\s*(Episode\s*\d+)?\s*/gi, '')
    // Remove file extension
    .replace(/\.(mkv|mp4|avi|mov|wmv|srt)$/i, '')
    // Remove brackets with any remaining content
    .replace(/\s*[([{][^)\]}]*[)\]}]\s*/g, ' ')
    // Remove multiple spaces and dashes
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*$/, '')
    .trim();
  
  // Add back the season/episode info
  clean = clean + seasonEpisode;
  
  console.log(`Cleaned title: "${title}" -> "${clean}"`);
  
  return clean;
}

/**
 * Search and download subtitle in one go
 * @param {string} query - Movie/series name
 * @param {string} language - Language code
 * @param {string} [type] - Content type
 * @returns {Promise<{content: string, fileName: string}>}
 */
async function fetchSubtitle(query, language = 'fr', type = null) {
  console.log(`Searching subtitles for: "${query}" (${language})`);
  
  const results = await searchSubtitles(query, language, type);
  console.log(`Found ${results.length} results`);

  if (results.length === 0) {
    throw new Error('No subtitles found');
  }

  // Try each result until one works
  let lastError = null;
  for (const subtitle of results) {
    try {
      const downloadUrl = subtitle.url;
      
      if (!downloadUrl) {
        continue;
      }
      
      console.log(`Downloading: ${subtitle.fileName}`);
      const content = await downloadSubtitle(downloadUrl, subtitle.source);

      if (content && content.length >= 50) {
        return {
          content,
          fileName: subtitle.fileName || `${query}.srt`,
          language: subtitle.language
        };
      }
    } catch (e) {
      console.log(`Download failed: ${e.message}`);
      lastError = e;
    }
  }

  throw lastError || new Error('Failed to download any subtitle');
}

module.exports = {
  searchSubtitles,
  downloadSubtitle,
  fetchSubtitle,
  cleanTitle
};
