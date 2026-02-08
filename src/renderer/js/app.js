window.M3U = window.M3U || {};

(async function init() {
  const playlistService = new M3U.PlaylistService();
  const favoritesService = new M3U.FavoritesService();
  const historyService = new M3U.HistoryService();
  const epgService = new M3U.EpgService();
  const toast = new M3U.Toast();

  const sidebar = new M3U.Sidebar(document.getElementById('sidebar'), {
    favoritesService, historyService
  });
  sidebar.initStaticItems();

  const channelGrid = new M3U.ChannelGrid(document.getElementById('content'), {
    playlistService, favoritesService, historyService, epgService
  });

  const playerPanel = new M3U.PlayerPanel(document.getElementById('player-panel'), {
    epgService
  });

  const searchBar = new M3U.SearchBar(document.getElementById('search-input'));
  const modalManager = new M3U.ModalManager({ playlistService, toast });

  // Loading overlay
  const loadingOverlay = document.getElementById('loading-overlay');
  M3U.dom.on('loading-start', (e) => {
    loadingOverlay.querySelector('.loading-text').textContent = e.detail.text || 'Loading...';
    loadingOverlay.classList.remove('hidden');
  });
  M3U.dom.on('loading-end', () => {
    loadingOverlay.classList.add('hidden');
  });

  // Sidebar content type tabs (Live / Films / Series)
  const tabBtns = document.querySelectorAll('#sidebar-tabs .sidebar-tab');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sidebar.setContentType(btn.dataset.type);
    });
  });

  // Header buttons
  document.getElementById('btn-add-playlist').addEventListener('click', () => {
    modalManager.showAddPlaylist();
  });
  document.getElementById('btn-manage-playlists').addEventListener('click', () => {
    modalManager.showManagePlaylists();
  });
  document.getElementById('btn-view-grid').addEventListener('click', () => {
    channelGrid.setViewMode('grid');
    document.getElementById('btn-view-grid').classList.add('active');
    document.getElementById('btn-view-list').classList.remove('active');
  });
  document.getElementById('btn-view-list').addEventListener('click', () => {
    channelGrid.setViewMode('list');
    document.getElementById('btn-view-list').classList.add('active');
    document.getElementById('btn-view-grid').classList.remove('active');
  });

  // Channel play
  M3U.dom.on('channel-play', async (e) => {
    const { channel } = e.detail;
    playerPanel.play(channel);
    await historyService.record(channel);
  });

  // Series select - load episodes modal
  M3U.dom.on('series-select', async (e) => {
    const { series } = e.detail;
    const creds = playlistService.xtreamCredentials;
    if (!creds) {
      toast.error('Series require Xtream connection');
      return;
    }
    try {
      M3U.dom.dispatch('loading-start', { text: 'Loading episodes...' });
      const info = await M3U.XtreamClient.getSeriesInfo(creds.server, creds.username, creds.password, series.seriesId);
      if (info && info.episodes) {
        modalManager.showSeriesEpisodes(series, info, creds);
      } else {
        toast.error('No episodes found');
      }
    } catch (err) {
      toast.error(`Failed to load series: ${err.message}`);
    } finally {
      M3U.dom.dispatch('loading-end');
    }
  });

  // EPG auto-load
  M3U.dom.on('playlist-loaded', async (e) => {
    const { epgUrl } = e.detail;
    if (epgUrl) {
      try { await epgService.load(epgUrl); }
      catch (err) { console.warn('EPG load failed:', err.message); }
    }
  });

  // Load saved data
  await favoritesService.load();
  await historyService.load();

  // Load active playlist
  const playlists = await playlistService.getSavedPlaylists();
  const activeId = await playlistService.getActiveId();
  const activePlaylist = playlists.find(p => p.id === activeId);

  if (activePlaylist) {
    try {
      M3U.dom.dispatch('loading-start', { text: 'Loading playlist...' });
      if (activePlaylist.type === 'xtream' && activePlaylist.xtream) {
        await playlistService.loadFromXtream(
          activePlaylist.xtream.server,
          activePlaylist.xtream.username,
          activePlaylist.xtream.password
        );
      } else {
        await playlistService.loadFromUrl(activePlaylist.url);
      }
      document.getElementById('header-playlist-name').textContent = activePlaylist.name;
    } catch (err) {
      toast.error(`Failed to load playlist: ${err.message}`);
    } finally {
      M3U.dom.dispatch('loading-end');
    }
  } else if (playlists.length === 0) {
    modalManager.showAddPlaylist();
  }

  // Restore last watched channel after playlist loads
  if (activePlaylist) {
    try {
      const lastWatched = await window.electronAPI.getLastWatched();
      if (lastWatched && lastWatched.url) {
        // Small delay to let playlist finish loading
        setTimeout(() => {
          playerPanel.play(lastWatched);
        }, 500);
      }
    } catch {}
  }

  // Signal main process that app is ready (closes splash screen)
  window.electronAPI.appReady();
})();
