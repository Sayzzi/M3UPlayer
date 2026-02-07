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
  const groupSet = new Set();
  let currentAttrs = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      currentAttrs = parseExtInf(line);
    } else if (line && !line.startsWith('#') && currentAttrs) {
      const channel = {
        id: generateId(currentAttrs.tvgId, line),
        tvgId: currentAttrs.tvgId,
        tvgName: currentAttrs.tvgName,
        name: currentAttrs.name,
        logo: currentAttrs.logo,
        group: currentAttrs.group || 'Non classé',
        url: line,
        type: 'live'
      };
      channels.push(channel);
      groupSet.add(channel.group);
      currentAttrs = null;
    } else if (line === '' || line.startsWith('#')) {
      // Skip empty lines and other comments, but don't reset currentAttrs
      // unless it's a non-EXTINF directive
      if (line.startsWith('#') && !line.startsWith('#EXTINF')) {
        // Keep currentAttrs for the next URL line
      }
    }
  }

  const groups = Array.from(groupSet).sort((a, b) => a.localeCompare(b));

  return { epgUrl, channels, groups };
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
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'ch_' + Math.abs(hash).toString(36);
}

module.exports = { parseM3U };
