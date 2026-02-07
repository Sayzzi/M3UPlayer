window.M3U = window.M3U || {};

M3U.XtreamClient = {
  _buildBaseUrl(server, username, password) {
    let s = this._normalizeServer(server);
    return `${s}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  },

  _normalizeServer(server) {
    let s = server.trim();
    if (!s.startsWith('http://') && !s.startsWith('https://')) {
      s = 'http://' + s;
    }
    return s.replace(/\/+$/, '');
  },

  async _fetchJson(url) {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  },

  async login(server, username, password) {
    const base = this._buildBaseUrl(server, username, password);
    const data = await this._fetchJson(base);

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

    return { userInfo: data.user_info, serverInfo: data.server_info };
  },

  async getSeriesInfo(server, username, password, seriesId) {
    const base = this._buildBaseUrl(server, username, password);
    return await this._fetchJson(`${base}&action=get_series_info&series_id=${seriesId}`);
  },

  async loadAll(server, username, password) {
    const loginData = await this.login(server, username, password);
    const s = this._normalizeServer(server);
    const base = this._buildBaseUrl(server, username, password);

    // Fetch all categories and streams in parallel
    const [
      liveCategories, liveStreams,
      vodCategories, vodStreams,
      seriesCategories, seriesList
    ] = await Promise.all([
      this._fetchJson(`${base}&action=get_live_categories`).catch(() => []),
      this._fetchJson(`${base}&action=get_live_streams`).catch(() => []),
      this._fetchJson(`${base}&action=get_vod_categories`).catch(() => []),
      this._fetchJson(`${base}&action=get_vod_streams`).catch(() => []),
      this._fetchJson(`${base}&action=get_series_categories`).catch(() => []),
      this._fetchJson(`${base}&action=get_series`).catch(() => [])
    ]);

    const toArray = d => Array.isArray(d) ? d : [];

    // Build category maps
    const liveCatMap = {};
    for (const cat of toArray(liveCategories)) liveCatMap[cat.category_id] = cat.category_name || 'Unknown';
    const vodCatMap = {};
    for (const cat of toArray(vodCategories)) vodCatMap[cat.category_id] = cat.category_name || 'Unknown';
    const seriesCatMap = {};
    for (const cat of toArray(seriesCategories)) seriesCatMap[cat.category_id] = cat.category_name || 'Unknown';

    // Build live channels
    const channels = [];
    const liveGroupSet = new Set();
    for (const stream of toArray(liveStreams)) {
      const group = liveCatMap[stream.category_id] || 'Uncategorized';
      liveGroupSet.add(group);
      channels.push({
        id: 'xt_' + stream.stream_id,
        tvgId: stream.epg_channel_id || '',
        tvgName: stream.name || '',
        name: stream.name || 'Unknown',
        logo: stream.stream_icon || '',
        group: group,
        url: `${s}/live/${username}/${password}/${stream.stream_id}.m3u8`,
        type: 'live'
      });
    }

    // Build VOD items
    const vods = [];
    const vodGroupSet = new Set();
    for (const vod of toArray(vodStreams)) {
      const group = vodCatMap[vod.category_id] || 'Uncategorized';
      vodGroupSet.add(group);
      const ext = vod.container_extension || 'mp4';
      vods.push({
        id: 'vod_' + vod.stream_id,
        name: vod.name || 'Unknown',
        logo: vod.stream_icon || '',
        group: group,
        url: `${s}/movie/${username}/${password}/${vod.stream_id}.${ext}`,
        type: 'vod',
        rating: vod.rating || '',
        added: vod.added || null
      });
    }

    // Build series items
    const series = [];
    const seriesGroupSet = new Set();
    for (const sr of toArray(seriesList)) {
      const group = seriesCatMap[sr.category_id] || 'Uncategorized';
      seriesGroupSet.add(group);
      series.push({
        id: 'sr_' + sr.series_id,
        seriesId: sr.series_id,
        name: sr.name || 'Unknown',
        logo: sr.cover || '',
        group: group,
        type: 'series',
        rating: sr.rating || '',
        plot: sr.plot || ''
      });
    }

    // EPG URL - use the same server the user entered (more reliable than serverInfo.url which may lack port)
    const epgUrl = `${s}/xmltv.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

    return {
      epgUrl,
      channels,
      groups: Array.from(liveGroupSet).sort((a, b) => a.localeCompare(b)),
      vods,
      vodGroups: Array.from(vodGroupSet).sort((a, b) => a.localeCompare(b)),
      series,
      seriesGroups: Array.from(seriesGroupSet).sort((a, b) => a.localeCompare(b)),
      xtreamCredentials: { server, username, password },
      userInfo: {
        status: loginData.userInfo.status,
        expDate: loginData.userInfo.exp_date,
        activeCons: loginData.userInfo.active_cons,
        maxCons: loginData.userInfo.max_connections
      }
    };
  }
};
