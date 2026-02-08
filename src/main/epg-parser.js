function parseEpg(xmlText) {
  const channels = {};
  const programmes = {};

  // Parse channels
  const channelRegex = /<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g;
  let match;
  while ((match = channelRegex.exec(xmlText)) !== null) {
    const id = match[1];
    const block = match[2];
    const nameMatch = block.match(/<display-name[^>]*>([^<]*)<\/display-name>/);
    const iconMatch = block.match(/<icon\s+src="([^"]*)"/);
    channels[id] = {
      name: nameMatch ? nameMatch[1].trim() : id,
      icon: iconMatch ? iconMatch[1] : ''
    };
  }

  // Parse programmes - only keep within +/- 12 hours from now
  const now = Date.now();
  const windowStart = now - 12 * 3600 * 1000;
  const windowEnd = now + 12 * 3600 * 1000;

  const progRegex =
    /<programme\s+start="([^"]*)"\s+stop="([^"]*)"\s+channel="([^"]*)"[^>]*>([\s\S]*?)<\/programme>/g;
  while ((match = progRegex.exec(xmlText)) !== null) {
    const start = parseXmltvDate(match[1]);
    const stop = parseXmltvDate(match[2]);
    const channelId = match[3];
    const block = match[4];

    if (start > windowEnd || stop < windowStart) {
      continue;
    }

    const titleMatch = block.match(/<title[^>]*>([^<]*)<\/title>/);
    const descMatch = block.match(/<desc[^>]*>([^<]*)<\/desc>/);
    const catMatch = block.match(/<category[^>]*>([^<]*)<\/category>/);

    if (!programmes[channelId]) {
      programmes[channelId] = [];
    }

    programmes[channelId].push({
      start,
      stop,
      title: titleMatch ? titleMatch[1].trim() : '',
      desc: descMatch ? descMatch[1].trim() : '',
      category: catMatch ? catMatch[1].trim() : ''
    });
  }

  // Sort programmes by start time
  for (const channelId of Object.keys(programmes)) {
    programmes[channelId].sort((a, b) => a.start - b.start);
  }

  return { channels, programmes };
}

function parseXmltvDate(str) {
  // Format: YYYYMMDDHHmmss +ZZZZ
  const year = parseInt(str.substring(0, 4), 10);
  const month = parseInt(str.substring(4, 6), 10) - 1;
  const day = parseInt(str.substring(6, 8), 10);
  const hour = parseInt(str.substring(8, 10), 10);
  const minute = parseInt(str.substring(10, 12), 10);
  const second = parseInt(str.substring(12, 14), 10);

  const date = new Date(Date.UTC(year, month, day, hour, minute, second));

  // Apply timezone offset if present
  const tzMatch = str.match(/([+-])(\d{2})(\d{2})/);
  if (tzMatch) {
    const sign = tzMatch[1] === '+' ? -1 : 1;
    const tzHours = parseInt(tzMatch[2], 10);
    const tzMinutes = parseInt(tzMatch[3], 10);
    date.setUTCMinutes(date.getUTCMinutes() + sign * (tzHours * 60 + tzMinutes));
  }

  return date.getTime();
}

module.exports = { parseEpg };
