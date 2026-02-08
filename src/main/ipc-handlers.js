const { ipcMain } = require('electron');
const store = require('./store');
const { parseM3U } = require('./m3u-parser');
const { parseEpg } = require('./epg-parser');
const { fetchPlaylist, fetchEpg } = require('./playlist-fetcher');
const { xtreamLoadAll } = require('./xtream-client');

function registerIpcHandlers() {
  // Playlist operations
  ipcMain.handle('playlist:load', async (_event, url) => {
    const text = await fetchPlaylist(url);
    return parseM3U(text);
  });

  // Parse M3U text (fetched from renderer)
  ipcMain.handle('playlist:parse', (_event, text) => {
    return parseM3U(text);
  });

  // Xtream Codes login (via main process)
  ipcMain.handle('xtream:load', async (_event, server, username, password) => {
    return await xtreamLoadAll(server, username, password);
  });

  ipcMain.handle('playlist:getAll', () => {
    return store.getPlaylists();
  });

  ipcMain.handle('playlist:add', (_event, url, name, type, xtreamData) => {
    return store.addPlaylist(url, name, type || 'm3u', xtreamData || null);
  });

  ipcMain.handle('playlist:remove', (_event, id) => {
    return store.removePlaylist(id);
  });

  ipcMain.handle('playlist:setActive', (_event, id) => {
    store.setActivePlaylist(id);
    return true;
  });

  ipcMain.handle('playlist:getActiveId', () => {
    return store.getActivePlaylistId();
  });

  // Favorites
  ipcMain.handle('favorites:get', () => {
    return store.getFavorites();
  });

  ipcMain.handle('favorites:toggle', (_event, channelId) => {
    return store.toggleFavorite(channelId);
  });

  // History
  ipcMain.handle('history:get', () => {
    return store.getHistory();
  });

  ipcMain.handle('history:add', (_event, entry) => {
    return store.addToHistory(entry);
  });

  // EPG cache (persisted to disk)
  ipcMain.handle('epg:getCache', () => {
    return store.getEpgCache();
  });

  ipcMain.handle('epg:setCache', (_event, url, data) => {
    store.setEpgCache(url, data);
    return true;
  });

  // EPG (legacy - via main process fetch)
  ipcMain.handle('epg:load', async (_event, url) => {
    const settings = store.getSettings();
    const cacheHours = settings.epgRefreshHours || 6;
    const cached = store.getEpgCache();
    if (cached && cached.url === url && Date.now() - cached.timestamp < cacheHours * 3600 * 1000) {
      return cached.data;
    }
    const xml = await fetchEpg(url);
    const data = parseEpg(xml);
    store.setEpgCache(url, data);
    return data;
  });

  // EPG parse (XML fetched from renderer to bypass Cloudflare)
  ipcMain.handle('epg:parse', (_event, xmlText) => {
    const data = parseEpg(xmlText);
    return data;
  });

  // Playback positions (resume VOD/Series)
  ipcMain.handle('playback:save', (_event, channelId, position, duration) => {
    store.savePlaybackPosition(channelId, position, duration);
    return true;
  });

  ipcMain.handle('playback:get', (_event, channelId) => {
    return store.getPlaybackPosition(channelId);
  });

  // Last watched channel
  ipcMain.handle('lastWatched:get', () => {
    return store.getLastWatched();
  });

  ipcMain.handle('lastWatched:set', (_event, channel) => {
    store.setLastWatched(channel);
    return true;
  });

  // Settings
  ipcMain.handle('settings:get', () => {
    return store.getSettings();
  });

  ipcMain.handle('settings:update', (_event, settings) => {
    return store.updateSettings(settings);
  });
}

module.exports = { registerIpcHandlers };
