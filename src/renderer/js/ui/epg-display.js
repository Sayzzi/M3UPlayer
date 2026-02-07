window.M3U = window.M3U || {};

// EPG display is integrated into channel-grid and player-panel.
// This module is a placeholder for potential standalone EPG views.
M3U.EpgDisplay = class {
  constructor(epgService) {
    this.epgService = epgService;
  }
};
