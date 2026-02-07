window.M3U = window.M3U || {};

M3U.FavoritesService = class {
  constructor() {
    this.favorites = new Set();
  }

  async load() {
    const favs = await window.electronAPI.getFavorites();
    this.favorites = new Set(favs);
    return this.favorites;
  }

  async toggle(channelId) {
    const result = await window.electronAPI.toggleFavorite(channelId);
    if (result.isFavorite) {
      this.favorites.add(channelId);
    } else {
      this.favorites.delete(channelId);
    }
    M3U.dom.dispatch('favorites-changed', result);
    return result;
  }

  isFavorite(channelId) {
    return this.favorites.has(channelId);
  }

  getIds() {
    return this.favorites;
  }

  count() {
    return this.favorites.size;
  }
};
