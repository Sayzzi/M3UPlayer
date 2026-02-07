window.M3U = window.M3U || {};

M3U.PlaylistService = class {
  constructor() {
    this.currentPlaylist = null;
    this.channels = [];
    this.groups = [];
    this.epgUrl = null;
  }

  async loadFromUrl(url) {
    const result = await window.electronAPI.loadPlaylist(url);
    this.currentPlaylist = result;
    this.channels = result.channels;
    this.groups = result.groups;
    this.epgUrl = result.epgUrl;
    M3U.dom.dispatch('playlist-loaded', {
      channels: this.channels,
      groups: this.groups,
      epgUrl: this.epgUrl
    });
    return result;
  }

  async getSavedPlaylists() {
    return await window.electronAPI.getPlaylists();
  }

  async addPlaylist(url, name) {
    return await window.electronAPI.addPlaylist(url, name);
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

  filterChannels(query, group, favoriteIds = null) {
    let filtered = this.channels;

    if (group && group !== 'all') {
      filtered = filtered.filter(ch => ch.group === group);
    }

    if (favoriteIds) {
      filtered = filtered.filter(ch => favoriteIds.has(ch.id));
    }

    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(ch =>
        ch.name.toLowerCase().includes(q) ||
        ch.tvgName.toLowerCase().includes(q) ||
        ch.group.toLowerCase().includes(q)
      );
    }

    return filtered;
  }
};
