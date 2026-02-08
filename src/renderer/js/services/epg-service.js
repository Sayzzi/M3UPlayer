window.M3U = window.M3U || {};

M3U.EpgService = class {
  constructor() {
    this.data = null;
    this.refreshInterval = null;
    this._url = null;
    this._refreshHours = 6;
  }

  async init() {
    // Load settings and restore cached EPG
    try {
      const settings = await window.electronAPI.getSettings();
      this._refreshHours = settings.epgRefreshHours || 6;

      const cached = await window.electronAPI.getEpgCache();
      if (cached && cached.data) {
        const ageHours = (Date.now() - cached.timestamp) / (3600 * 1000);
        if (ageHours < this._refreshHours) {
          this.data = cached.data;
          this._url = cached.url;
          M3U.dom.dispatch('epg-loaded', { epgData: this.data });
        }
      }
    } catch {
      // Ignore cache load errors
    }
  }

  async load(url, forceRefresh = false) {
    if (!url) {
      return null;
    }

    // Check disk cache first (unless force refresh)
    if (!forceRefresh) {
      try {
        const cached = await window.electronAPI.getEpgCache();
        if (cached && cached.url === url) {
          const ageHours = (Date.now() - cached.timestamp) / (3600 * 1000);
          if (ageHours < this._refreshHours) {
            this.data = cached.data;
            this._url = url;
            this.startAutoRefresh();
            M3U.dom.dispatch('epg-loaded', { epgData: this.data });
            return this.data;
          }
        }
      } catch {
        // Continue to fetch
      }
    }

    try {
      // Fetch EPG XML from renderer (Chromium fetch) to bypass Cloudflare
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      let xmlText;
      // Check if response is gzipped (some EPG servers gzip without proper headers)
      const buffer = await resp.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        // Gzipped - decompress using DecompressionStream
        const ds = new DecompressionStream('gzip');
        const decompressedStream = new Blob([buffer]).stream().pipeThrough(ds);
        const decompressedBlob = await new Response(decompressedStream).blob();
        xmlText = await decompressedBlob.text();
      } else {
        xmlText = new TextDecoder('utf-8').decode(bytes);
      }

      // Parse in main process
      this.data = await window.electronAPI.parseEpg(xmlText);
      this._url = url;

      // Save to disk cache
      await window.electronAPI.setEpgCache(url, this.data);

      this.startAutoRefresh();
      M3U.dom.dispatch('epg-loaded', { epgData: this.data });
      return this.data;
    } catch (err) {
      console.warn('EPG load failed:', err.message);
      return null;
    }
  }

  setRefreshHours(hours) {
    this._refreshHours = hours;
    this.startAutoRefresh();
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(
      () => {
        if (this._url) {
          this.load(this._url, true);
        }
      },
      this._refreshHours * 3600 * 1000
    );
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  getCurrentProgram(tvgId) {
    if (!this.data || !tvgId) {
      return null;
    }
    const progs = this.data.programmes[tvgId];
    if (!progs) {
      return null;
    }
    const now = Date.now();
    return progs.find((p) => now >= p.start && now < p.stop) || null;
  }

  getNextProgram(tvgId) {
    if (!this.data || !tvgId) {
      return null;
    }
    const progs = this.data.programmes[tvgId];
    if (!progs) {
      return null;
    }
    const now = Date.now();
    return progs.find((p) => p.start >= now) || null;
  }

  hasData() {
    return this.data !== null;
  }
};
