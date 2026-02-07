window.M3U = window.M3U || {};

M3U.EpgService = class {
  constructor() {
    this.data = null;
    this.refreshInterval = null;
  }

  async load(url) {
    if (!url) return null;
    try {
      this.data = await window.electronAPI.loadEpg(url);
      this._url = url;
      this.startAutoRefresh();
      M3U.dom.dispatch('epg-loaded', { epgData: this.data });
      return this.data;
    } catch (err) {
      console.warn('EPG load failed:', err.message);
      return null;
    }
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(() => {
      if (this._url) this.load(this._url);
    }, 6 * 3600 * 1000); // 6 hours
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  getCurrentProgram(tvgId) {
    if (!this.data || !tvgId) return null;
    const progs = this.data.programmes[tvgId];
    if (!progs) return null;
    const now = Date.now();
    return progs.find(p => now >= p.start && now < p.stop) || null;
  }

  getNextProgram(tvgId) {
    if (!this.data || !tvgId) return null;
    const progs = this.data.programmes[tvgId];
    if (!progs) return null;
    const now = Date.now();
    return progs.find(p => p.start >= now) || null;
  }

  hasData() {
    return this.data !== null;
  }
};
