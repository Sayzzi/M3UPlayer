const { Conf } = require('electron-conf');

const store = new Conf({
  defaults: {
    playlists: [],
    activePlaylistId: null,
    favorites: [],
    history: [],
    playbackPositions: {},
    lastWatched: null,
    epgCache: null,
    settings: {
      volume: 0.8,
      epgRefreshHours: 6,
      defaultView: 'grid',
      defaultSort: 'default'
    }
  }
});

const MAX_HISTORY = 50;

function getPlaylists() {
  return store.get('playlists') || [];
}

function addPlaylist(url, name, type = 'm3u', xtreamData = null) {
  const playlists = getPlaylists();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const entry = { id, name, url, type, addedAt: Date.now() };
  if (type === 'xtream' && xtreamData) {
    entry.xtream = {
      server: xtreamData.server,
      username: xtreamData.username,
      password: xtreamData.password
    };
  }
  playlists.push(entry);
  store.set('playlists', playlists);
  return entry;
}

function removePlaylist(id) {
  const playlists = getPlaylists().filter((p) => p.id !== id);
  store.set('playlists', playlists);
  const activeId = store.get('activePlaylistId');
  if (activeId === id) {
    store.set('activePlaylistId', null);
  }
  return playlists;
}

function getActivePlaylistId() {
  return store.get('activePlaylistId');
}

function setActivePlaylist(id) {
  store.set('activePlaylistId', id);
}

function getFavorites() {
  return store.get('favorites') || [];
}

function toggleFavorite(channelId) {
  const favorites = getFavorites();
  const index = favorites.indexOf(channelId);
  if (index === -1) {
    favorites.push(channelId);
  } else {
    favorites.splice(index, 1);
  }
  store.set('favorites', favorites);
  return { channelId, isFavorite: index === -1 };
}

function getHistory() {
  return store.get('history') || [];
}

function addToHistory(entry) {
  let history = getHistory();
  history = history.filter((h) => h.channelId !== entry.channelId);
  history.unshift({
    channelId: entry.channelId,
    channelName: entry.channelName,
    logo: entry.logo || '',
    group: entry.group || '',
    url: entry.url,
    watchedAt: Date.now()
  });
  if (history.length > MAX_HISTORY) {
    history = history.slice(0, MAX_HISTORY);
  }
  store.set('history', history);
  return history;
}

// Playback positions (VOD/Series resume)
function getPlaybackPositions() {
  return store.get('playbackPositions') || {};
}

function savePlaybackPosition(channelId, position, duration) {
  const positions = getPlaybackPositions();
  // Only save if progress > 1% and < 95% (not finished)
  const pct = duration > 0 ? position / duration : 0;
  if (pct > 0.01 && pct < 0.95) {
    positions[channelId] = { position, duration, savedAt: Date.now() };
  } else {
    // Remove if finished or not started
    delete positions[channelId];
  }
  // Keep max 200 entries, remove oldest
  const keys = Object.keys(positions);
  if (keys.length > 200) {
    const sorted = keys.sort((a, b) => (positions[a].savedAt || 0) - (positions[b].savedAt || 0));
    for (let i = 0; i < keys.length - 200; i++) {
      delete positions[sorted[i]];
    }
  }
  store.set('playbackPositions', positions);
}

function getPlaybackPosition(channelId) {
  const positions = getPlaybackPositions();
  return positions[channelId] || null;
}

// Last watched channel (restore on app launch)
function getLastWatched() {
  return store.get('lastWatched') || null;
}

function setLastWatched(channel) {
  store.set('lastWatched', channel);
}

function getSettings() {
  return (
    store.get('settings') || {
      volume: 0.8,
      epgRefreshHours: 6,
      defaultView: 'grid',
      defaultSort: 'default'
    }
  );
}

// EPG cache (persisted to disk)
function getEpgCache() {
  return store.get('epgCache') || null;
}

function setEpgCache(url, data) {
  store.set('epgCache', {
    url,
    data,
    timestamp: Date.now()
  });
}

function clearEpgCache() {
  store.set('epgCache', null);
}

function updateSettings(partial) {
  const settings = getSettings();
  Object.assign(settings, partial);
  store.set('settings', settings);
  return settings;
}

module.exports = {
  getPlaylists,
  addPlaylist,
  removePlaylist,
  getActivePlaylistId,
  setActivePlaylist,
  getFavorites,
  toggleFavorite,
  getHistory,
  addToHistory,
  getPlaybackPositions,
  savePlaybackPosition,
  getPlaybackPosition,
  getLastWatched,
  setLastWatched,
  getSettings,
  updateSettings,
  getEpgCache,
  setEpgCache,
  clearEpgCache
};
