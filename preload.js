const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Playlist operations
  loadPlaylist: (url) => ipcRenderer.invoke('playlist:load', url),
  getPlaylists: () => ipcRenderer.invoke('playlist:getAll'),
  addPlaylist: (url, name, type, xtreamData) => ipcRenderer.invoke('playlist:add', url, name, type, xtreamData),
  removePlaylist: (id) => ipcRenderer.invoke('playlist:remove', id),
  setActivePlaylist: (id) => ipcRenderer.invoke('playlist:setActive', id),
  getActivePlaylistId: () => ipcRenderer.invoke('playlist:getActiveId'),

  // Favorites
  getFavorites: () => ipcRenderer.invoke('favorites:get'),
  toggleFavorite: (channelId) => ipcRenderer.invoke('favorites:toggle', channelId),

  // History
  getHistory: () => ipcRenderer.invoke('history:get'),
  addToHistory: (entry) => ipcRenderer.invoke('history:add', entry),

  // Parse M3U text (fetched from renderer)
  parsePlaylist: (text) => ipcRenderer.invoke('playlist:parse', text),

  // Xtream Codes
  loadXtream: (server, username, password) => ipcRenderer.invoke('xtream:load', server, username, password),

  // EPG
  loadEpg: (url) => ipcRenderer.invoke('epg:load', url),
  parseEpg: (xmlText) => ipcRenderer.invoke('epg:parse', xmlText),

  // Playback positions (resume VOD/Series)
  savePlaybackPosition: (channelId, position, duration) => ipcRenderer.invoke('playback:save', channelId, position, duration),
  getPlaybackPosition: (channelId) => ipcRenderer.invoke('playback:get', channelId),

  // Last watched channel
  getLastWatched: () => ipcRenderer.invoke('lastWatched:get'),
  setLastWatched: (channel) => ipcRenderer.invoke('lastWatched:set', channel),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  // App lifecycle
  appReady: () => ipcRenderer.send('app:ready')
});
