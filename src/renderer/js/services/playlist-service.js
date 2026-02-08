window.M3U = window.M3U || {};

M3U.PlaylistService = class {
  constructor() {
    this.currentPlaylist = null;
    this.channels = [];
    this.groups = [];
    this.vods = [];
    this.vodGroups = [];
    this.series = [];
    this.seriesGroups = [];
    this.epgUrl = null;
    this.xtreamCredentials = null;
  }

  async loadFromUrl(url) {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.9' }
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const text = await resp.text();
    const result = await window.electronAPI.parsePlaylist(text);
    this._applyResult(result);
    return result;
  }

  async loadFromXtream(server, username, password) {
    const result = await M3U.XtreamClient.loadAll(server, username, password);
    this._applyResult(result);
    return result;
  }

  _applyResult(result) {
    this.currentPlaylist = result;
    this.channels = result.channels || [];
    this.groups = result.groups || [];
    this.vods = result.vods || [];
    this.vodGroups = result.vodGroups || [];
    this.series = result.series || [];
    this.seriesGroups = result.seriesGroups || [];
    this.epgUrl = result.epgUrl || null;
    this.xtreamCredentials = result.xtreamCredentials || null;
    M3U.dom.dispatch('playlist-loaded', {
      channels: this.channels,
      groups: this.groups,
      vods: this.vods,
      vodGroups: this.vodGroups,
      series: this.series,
      seriesGroups: this.seriesGroups,
      epgUrl: this.epgUrl
    });
  }

  async getSavedPlaylists() {
    return await window.electronAPI.getPlaylists();
  }

  async addPlaylist(url, name, type, xtreamData) {
    return await window.electronAPI.addPlaylist(url, name, type, xtreamData);
  }

  async removePlaylist(id) {
    return await window.electronAPI.removePlaylist(id);
  }

  async setActive(id) {
    return await window.electronAPI.setActivePlaylist(id);
  }

  async getActiveId() {
    return await window.electronAPI.getActivePlaylistId();
  }

  getChannels() {
    return this.channels;
  }
  getGroups() {
    return this.groups;
  }
  getVods() {
    return this.vods;
  }
  getVodGroups() {
    return this.vodGroups;
  }
  getSeries() {
    return this.series;
  }
  getSeriesGroups() {
    return this.seriesGroups;
  }

  filterItems(items, query, group) {
    let filtered = items;
    if (group && group !== 'all') {
      filtered = filtered.filter((item) => item.group === group);
    }
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter((item) => item.name.toLowerCase().includes(q));
    }
    return filtered;
  }

  filterChannels(query, group, favoriteIds = null) {
    let filtered = this.channels;
    if (group && group !== 'all') {
      filtered = filtered.filter((ch) => ch.group === group);
    }
    if (favoriteIds) {
      filtered = filtered.filter((ch) => favoriteIds.has(ch.id));
    }
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (ch) =>
          ch.name.toLowerCase().includes(q) ||
          ch.tvgName.toLowerCase().includes(q) ||
          ch.group.toLowerCase().includes(q)
      );
    }
    return filtered;
  }
};
