window.M3U = window.M3U || {};

M3U.EpgService = class {
  constructor() {
    this.data = null;
    this.refreshInterval = null;
    this._url = null;
  }

  async load(url) {
    if (!url) return null;
    try {
      // Fetch EPG XML from renderer (Chromium fetch) to bypass Cloudflare
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

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
    }, 6 * 3600 * 1000);
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
