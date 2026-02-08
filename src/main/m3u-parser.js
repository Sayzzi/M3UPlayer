// Patterns to detect VOD content
const VOD_URL_PATTERNS = [
  /\/movie\//i,
  /\/movies\//i,
  /\/vod\//i,
  /\/film\//i,
  /\.mp4(\?|$)/i,
  /\.mkv(\?|$)/i,
  /\.avi(\?|$)/i
];

const VOD_GROUP_PATTERNS = [
  /^vod\b/i,
  /^movie/i,
  /^film/i,
  /\bvod$/i,
  /\bmovies?$/i,
  /\bfilms?$/i,
  /^\|.*vod/i,
  /^\|.*movie/i
];

// Patterns to detect Series content
const SERIES_URL_PATTERNS = [/\/series\//i, /\/show\//i, /\/tv[_-]?shows?\//i];

const SERIES_GROUP_PATTERNS = [
  /^series\b/i,
  /\bseries$/i,
  /^tv[_-]?shows?/i,
  /\btv[_-]?shows?$/i,
  /^\|.*series/i
];

function detectContentType(url, group) {
  // Check URL patterns first (more reliable)
  for (const pattern of SERIES_URL_PATTERNS) {
    if (pattern.test(url)) {
      return 'series';
    }
  }
  for (const pattern of VOD_URL_PATTERNS) {
    if (pattern.test(url)) {
      return 'vod';
    }
  }

  // Fall back to group name patterns
  for (const pattern of SERIES_GROUP_PATTERNS) {
    if (pattern.test(group)) {
      return 'series';
    }
  }
  for (const pattern of VOD_GROUP_PATTERNS) {
    if (pattern.test(group)) {
      return 'vod';
    }
  }

  return 'live';
}

function parseM3U(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  if (!lines[0] || !lines[0].trim().startsWith('#EXTM3U')) {
    throw new Error('Invalid M3U file: missing #EXTM3U header');
  }

  // Extract EPG URL from header line
  let epgUrl = null;
  const headerLine = lines[0];
  const epgMatch = headerLine.match(/(?:url-tvg|x-tvg-url|tvg-url)="([^"]*)"/i);
  if (epgMatch) {
    epgUrl = epgMatch[1];
  }

  const channels = [];
  const vods = [];
  const series = [];
  const liveGroupSet = new Set();
  const vodGroupSet = new Set();
  const seriesGroupSet = new Set();
  let currentAttrs = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      currentAttrs = parseExtInf(line);
    } else if (line && !line.startsWith('#') && currentAttrs) {
      const group = currentAttrs.group || 'Non classé';
      const contentType = detectContentType(line, group);

      const item = {
        id: generateId(currentAttrs.tvgId, line),
        tvgId: currentAttrs.tvgId,
        tvgName: currentAttrs.tvgName,
        name: currentAttrs.name,
        logo: currentAttrs.logo,
        group: group,
        url: line,
        type: contentType
      };

      if (contentType === 'vod') {
        vods.push(item);
        vodGroupSet.add(group);
      } else if (contentType === 'series') {
        series.push(item);
        seriesGroupSet.add(group);
      } else {
        channels.push(item);
        liveGroupSet.add(group);
      }

      currentAttrs = null;
    } else if (line === '' || line.startsWith('#')) {
      // Skip empty lines and other comments, but don't reset currentAttrs
      // unless it's a non-EXTINF directive
      if (line.startsWith('#') && !line.startsWith('#EXTINF')) {
        // Keep currentAttrs for the next URL line
      }
    }
  }

  const groups = Array.from(liveGroupSet).sort((a, b) => a.localeCompare(b));
  const vodGroups = Array.from(vodGroupSet).sort((a, b) => a.localeCompare(b));
  const seriesGroups = Array.from(seriesGroupSet).sort((a, b) => a.localeCompare(b));

  return { epgUrl, channels, groups, vods, vodGroups, series, seriesGroups };
}

function parseExtInf(line) {
  const attrs = {};

  // Extract key="value" attributes
  const attrRegex = /([a-zA-Z_-]+)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(line)) !== null) {
    const key = match[1].toLowerCase().replace(/_/g, '-');
    attrs[key] = match[2];
  }

  // Extract display name (after the last comma)
  const commaIndex = line.lastIndexOf(',');
  const name = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : '';

  return {
    tvgId: attrs['tvg-id'] || '',
    tvgName: attrs['tvg-name'] || '',
    name: name || attrs['tvg-name'] || 'Unknown',
    logo: attrs['tvg-logo'] || '',
    group: attrs['group-title'] || ''
  };
}

function generateId(tvgId, url) {
  const str = (tvgId || '') + '|' + url;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'ch_' + Math.abs(hash).toString(36);
}

module.exports = { parseM3U };
