window.M3U = window.M3U || {};

M3U.HistoryService = class {
  constructor() {
    this.history = [];
  }

  async load() {
    this.history = await window.electronAPI.getHistory();
    return this.history;
  }

  async record(channel) {
    this.history = await window.electronAPI.addToHistory({
      channelId: channel.id,
      channelName: channel.name,
      logo: channel.logo,
      group: channel.group,
      url: channel.url
    });
    M3U.dom.dispatch('history-changed', { history: this.history });
    return this.history;
  }

  getAll() {
    return this.history;
  }

  count() {
    return this.history.length;
  }
};
