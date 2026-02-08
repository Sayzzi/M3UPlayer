const https = require('https');
const zlib = require('zlib');

const API_URL = 'api.opensubtitles.com';
const USER_AGENT = 'M3UPlayer v1.2.0';

// Free tier API key for OpenSubtitles REST API
// Users can provide their own key in settings for higher limits
let apiKey = null;

function setApiKey(key) {
  apiKey = key;
}

/**
 * Search for subtitles on OpenSubtitles
 * @param {string} query - Movie/series name to search
 * @param {string} language - Language code (e.g., 'fr', 'en', 'es')
 * @param {string} [type] - 'movie' or 'episode'
 * @returns {Promise<Array>} - List of subtitle results
 */
async function searchSubtitles(query, language = 'fr', type = null) {
  // Clean the query - remove year, quality tags, etc.
  const cleanQuery = cleanTitle(query);

  const params = new URLSearchParams({
    query: cleanQuery,
    languages: language
  });

  if (type === 'movie' || type === 'vod') {
    params.append('type', 'movie');
  } else if (type === 'series' || type === 'episode') {
    params.append('type', 'episode');
  }

  const options = {
    hostname: API_URL,
    path: `/api/v1/subtitles?${params.toString()}`,
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json'
    }
  };

  // Add API key if available
  if (apiKey) {
    options.headers['Api-Key'] = apiKey;
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && Array.isArray(json.data)) {
            const results = json.data.map((item) => ({
              id: item.id,
              fileId: item.attributes?.files?.[0]?.file_id,
              fileName: item.attributes?.files?.[0]?.file_name || item.attributes?.release,
              language: item.attributes?.language,
              downloadCount: item.attributes?.download_count,
              rating: item.attributes?.ratings,
              release: item.attributes?.release,
              movieName: item.attributes?.feature_details?.movie_name || item.attributes?.feature_details?.title
            }));
            resolve(results);
          } else {
            resolve([]);
          }
        } catch {
          reject(new Error('Failed to parse OpenSubtitles response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('OpenSubtitles request timeout'));
    });
    req.end();
  });
}

/**
 * Get download link for a subtitle file
 * @param {number} fileId - The file ID from search results
 * @returns {Promise<string>} - Download URL for the subtitle
 */
async function getDownloadLink(fileId) {
  const options = {
    hostname: API_URL,
    path: '/api/v1/download',
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json'
    }
  };

  if (apiKey) {
    options.headers['Api-Key'] = apiKey;
  }

  const body = JSON.stringify({ file_id: fileId });

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.link) {
            resolve(json.link);
          } else {
            reject(new Error(json.message || 'No download link available'));
          }
        } catch {
          reject(new Error('Failed to parse download response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Download request timeout'));
    });
    req.write(body);
    req.end();
  });
}

/**
 * Download subtitle content from URL
 * @param {string} url - URL to download from
 * @returns {Promise<string>} - Subtitle content (SRT format)
 */
async function downloadSubtitle(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : require('http');

    protocol
      .get(url, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          downloadSubtitle(res.headers.location).then(resolve).catch(reject);
          return;
        }

        const chunks = [];
        const isGzipped =
          res.headers['content-encoding'] === 'gzip' || url.endsWith('.gz');

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);

          if (isGzipped) {
            zlib.gunzip(buffer, (err, decoded) => {
              if (err) {
                // Maybe it's not actually gzipped
                resolve(buffer.toString('utf-8'));
              } else {
                resolve(decoded.toString('utf-8'));
              }
            });
          } else {
            resolve(buffer.toString('utf-8'));
          }
        });
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

/**
 * Clean title for search - remove year, quality, etc.
 */
function cleanTitle(title) {
  return (
    title
      // Remove common prefixes
      .replace(/^(FR|EN|VF|VOSTFR|VO|4K|HD|UHD|FHD)\s*[-:]?\s*/gi, '')
      // Remove year in parentheses or brackets
      .replace(/[([{]\d{4}[)\]}]/g, '')
      // Remove quality tags
      .replace(
        /\b(2160p|1080p|720p|480p|HDRip|BRRip|BluRay|WEB-DL|HDTV|DVDRip|4K|UHD|HD|FHD)\b/gi,
        ''
      )
      // Remove codec info
      .replace(/\b(x264|x265|HEVC|H\.?264|H\.?265|AAC|AC3|DTS)\b/gi, '')
      // Remove file extension
      .replace(/\.(mkv|mp4|avi|mov|wmv)$/i, '')
      // Remove multiple spaces
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Search and download subtitle in one go
 * @param {string} query - Movie/series name
 * @param {string} language - Language code
 * @param {string} [type] - Content type
 * @returns {Promise<{content: string, fileName: string}>}
 */
async function fetchSubtitle(query, language = 'fr', type = null) {
  const results = await searchSubtitles(query, language, type);

  if (results.length === 0) {
    throw new Error('No subtitles found');
  }

  // Get the first result with a file ID
  const subtitle = results.find((r) => r.fileId);
  if (!subtitle) {
    throw new Error('No downloadable subtitle found');
  }

  const downloadUrl = await getDownloadLink(subtitle.fileId);
  const content = await downloadSubtitle(downloadUrl);

  return {
    content,
    fileName: subtitle.fileName || `${query}.srt`,
    language: subtitle.language
  };
}

module.exports = {
  searchSubtitles,
  getDownloadLink,
  downloadSubtitle,
  fetchSubtitle,
  setApiKey,
  cleanTitle
};
