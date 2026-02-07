const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Playlist operations
  loadPlaylist: (url) => ipcRenderer.invoke('playlist:load', url),
  getPlaylists: () => ipcRenderer.invoke('playlist:getAll'),
  addPlaylist: (url, name) => ipcRenderer.invoke('playlist:add', url, name),
  removePlaylist: (id) => ipcRenderer.invoke('playlist:remove', id),
  setActivePlaylist: (id) => ipcRenderer.invoke('playlist:setActive', id),
  getActivePlaylistId: () => ipcRenderer.invoke('playlist:getActiveId'),

  // Favorites
  getFavorites: () => ipcRenderer.invoke('favorites:get'),
  toggleFavorite: (channelId) => ipcRenderer.invoke('favorites:toggle', channelId),

  // History
  getHistory: () => ipcRenderer.invoke('history:get'),
  addToHistory: (entry) => ipcRenderer.invoke('history:add', entry),

  // EPG
  loadEpg: (url) => ipcRenderer.invoke('epg:load', url),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings)
});
