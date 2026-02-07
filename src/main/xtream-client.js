const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);

function getNet() {
  return require('electron').net;
}

function apiRequest(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const net = getNet();
    const req = net.request({ url, method: 'GET', redirect: 'follow', useSessionCookies: true });

    req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    req.setHeader('Accept', 'application/json, */*');

    const timer = setTimeout(() => { req.abort(); reject(new Error('Request timed out')); }, timeoutMs);
    const chunks = [];

    req.on('response', (response) => {
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        clearTimeout(timer);
        const buffer = Buffer.concat(chunks);
        if (response.statusCode >= 400 && buffer.length === 0) {
          return reject(new Error(`HTTP ${response.statusCode}`));
        }
        resolve(buffer);
      });
      response.on('error', (err) => { clearTimeout(timer); reject(err); });
    });

    req.on('error', (err) => { clearTimeout(timer); reject(err); });
    req.end();
  });
}

async function fetchJson(url) {
  const buffer = await apiRequest(url);
  let text = buffer.toString('utf-8');
  // Some servers gzip without headers
  if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    const decompressed = await gunzip(buffer);
    text = decompressed.toString('utf-8');
  }
  return JSON.parse(text);
}

function buildBaseUrl(server, username, password) {
  // Normalize server: ensure http:// and no trailing slash
  let s = server.trim();
  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    s = 'http://' + s;
  }
  s = s.replace(/\/+$/, '');
  return `${s}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
}

async function xtreamLogin(server, username, password) {
  const base = buildBaseUrl(server, username, password);
  const data = await fetchJson(base);

  if (!data.user_info) {
    throw new Error('Invalid credentials or server response');
  }

  if (data.user_info.auth === 0) {
    throw new Error('Authentication failed: invalid username or password');
  }

  if (data.user_info.status === 'Disabled') {
    throw new Error('Account is disabled');
  }

  if (data.user_info.status === 'Expired') {
    throw new Error('Account has expired');
  }

  return {
    userInfo: data.user_info,
    serverInfo: data.server_info
  };
}

async function xtreamGetLiveCategories(server, username, password) {
  const base = buildBaseUrl(server, username, password);
  const data = await fetchJson(`${base}&action=get_live_categories`);
  return Array.isArray(data) ? data : [];
}

async function xtreamGetLiveStreams(server, username, password) {
  const base = buildBaseUrl(server, username, password);
  const data = await fetchJson(`${base}&action=get_live_streams`);
  return Array.isArray(data) ? data : [];
}

async function xtreamLoadAll(server, username, password) {
  // Login first to validate
  const loginData = await xtreamLogin(server, username, password);

  // Fetch categories and streams in parallel
  const [categories, streams] = await Promise.all([
    xtreamGetLiveCategories(server, username, password),
    xtreamGetLiveStreams(server, username, password)
  ]);

  // Build category map
  const catMap = {};
  for (const cat of categories) {
    catMap[cat.category_id] = cat.category_name || 'Unknown';
  }

  // Normalize server URL for stream building
  let s = server.trim();
  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    s = 'http://' + s;
  }
  s = s.replace(/\/+$/, '');

  // Build channels
  const channels = [];
  const groupSet = new Set();

  for (const stream of streams) {
    const group = catMap[stream.category_id] || 'Non classé';
    groupSet.add(group);

    const streamUrl = `${s}/${username}/${password}/${stream.stream_id}`;

    channels.push({
      id: 'xt_' + stream.stream_id,
      tvgId: stream.epg_channel_id || '',
      tvgName: stream.name || '',
      name: stream.name || 'Unknown',
      logo: stream.stream_icon || '',
      group: group,
      url: streamUrl
    });
  }

  const groups = Array.from(groupSet).sort((a, b) => a.localeCompare(b));

  // EPG URL from server info
  let epgUrl = null;
  if (loginData.serverInfo && loginData.serverInfo.url) {
    const epgServer = loginData.serverInfo.url;
    epgUrl = `${epgServer.startsWith('http') ? epgServer : 'http://' + epgServer}/xmltv.php?username=${username}&password=${password}`;
  }

  return {
    epgUrl,
    channels,
    groups,
    userInfo: {
      status: loginData.userInfo.status,
      expDate: loginData.userInfo.exp_date,
      activeCons: loginData.userInfo.active_cons,
      maxCons: loginData.userInfo.max_connections
    }
  };
}

module.exports = { xtreamLoadAll, xtreamLogin };
