window.M3U = window.M3U || {};

M3U.ChannelGrid = class {
  constructor(el, { playlistService, favoritesService, historyService, epgService }) {
    this.el = el;
    this.scrollEl = el.querySelector('.channel-scroll');
    this.titleEl = el.querySelector('.content-title');
    this.countEl = el.querySelector('.content-count');
    this.gridContainer = el.querySelector('.channel-grid');
    this.playlistService = playlistService;
    this.favoritesService = favoritesService;
    this.historyService = historyService;
    this.epgService = epgService;
    this.viewMode = 'grid';
    this.currentCategory = 'all';
    this.searchQuery = '';
    this.playingChannelId = null;

    M3U.dom.on('category-selected', (e) => this.onCategorySelected(e.detail));
    M3U.dom.on('search-changed', (e) => this.onSearchChanged(e.detail));
    M3U.dom.on('playlist-loaded', () => this.refresh());
    M3U.dom.on('favorites-changed', () => this.refresh());
    M3U.dom.on('epg-loaded', () => this.refresh());
  }

  onCategorySelected({ category }) {
    this.currentCategory = category;
    this.refresh();
  }

  onSearchChanged({ query }) {
    this.searchQuery = query;
    this.refresh();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.refresh();
  }

  setPlaying(channelId) {
    this.playingChannelId = channelId;
    this.el.querySelectorAll('.channel-card, .channel-row').forEach(card => {
      card.classList.toggle('playing', card.dataset.channelId === channelId);
    });
  }

  refresh() {
    let channels;
    let title;

    if (this.currentCategory === '__favorites__') {
      channels = this.playlistService.filterChannels(
        this.searchQuery, null, this.favoritesService.getIds()
      );
      title = 'Favorites';
    } else if (this.currentCategory === '__recent__') {
      const history = this.historyService.getAll();
      channels = history.map(h => {
        const ch = this.playlistService.getChannels().find(c => c.id === h.channelId);
        return ch || { id: h.channelId, name: h.channelName, logo: h.logo, group: h.group, url: h.url, tvgId: '', tvgName: '' };
      });
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        channels = channels.filter(ch => ch.name.toLowerCase().includes(q));
      }
      title = 'Recently Watched';
    } else if (this.currentCategory === 'all') {
      channels = this.playlistService.filterChannels(this.searchQuery);
      title = 'All Channels';
    } else {
      channels = this.playlistService.filterChannels(this.searchQuery, this.currentCategory);
      title = this.currentCategory;
    }

    this.titleEl.textContent = title;
    this.countEl.textContent = `${channels.length} channels`;
    this.renderChannels(channels);
  }

  renderChannels(channels) {
    M3U.dom.clear(this.gridContainer);

    if (channels.length === 0) {
      this.gridContainer.className = '';
      this.gridContainer.appendChild(
        M3U.dom.el('div', { className: 'empty-state' }, [
          M3U.dom.el('span', { innerHTML: M3U.dom.svgIcon(M3U.icons.tv, 64) }),
          M3U.dom.el('h3', { textContent: 'No channels found' }),
          M3U.dom.el('p', { textContent: 'Try a different search or category.' })
        ])
      );
      return;
    }

    this.gridContainer.className = this.viewMode === 'grid' ? 'channel-grid' : 'channel-list';

    for (const ch of channels) {
      const card = this.viewMode === 'grid' ? this.createCard(ch) : this.createRow(ch);
      this.gridContainer.appendChild(card);
    }
  }

  createCard(ch) {
    const isFav = this.favoritesService.isFavorite(ch.id);
    const epgNow = this.epgService.getCurrentProgram(ch.tvgId);

    const card = M3U.dom.el('div', {
      className: 'channel-card' + (this.playingChannelId === ch.id ? ' playing' : ''),
      dataset: { channelId: ch.id },
      onClick: () => this.playChannel(ch)
    }, [
      this.createFavBtn(ch.id, isFav),
      this.createLogo(ch, 64),
      M3U.dom.el('div', { className: 'channel-name', textContent: ch.name }),
      M3U.dom.el('div', {
        className: 'channel-epg-now',
        textContent: epgNow ? `Now: ${epgNow.title}` : ''
      })
    ]);

    return card;
  }

  createRow(ch) {
    const isFav = this.favoritesService.isFavorite(ch.id);
    const epgNow = this.epgService.getCurrentProgram(ch.tvgId);

    const row = M3U.dom.el('div', {
      className: 'channel-row' + (this.playingChannelId === ch.id ? ' playing' : ''),
      dataset: { channelId: ch.id },
      onClick: () => this.playChannel(ch)
    }, [
      this.createLogo(ch, 36),
      M3U.dom.el('div', { className: 'channel-name', textContent: ch.name }),
      M3U.dom.el('span', { className: 'channel-group-badge', textContent: ch.group }),
      M3U.dom.el('div', {
        className: 'channel-epg-now',
        textContent: epgNow ? epgNow.title : ''
      }),
      this.createFavBtn(ch.id, isFav)
    ]);

    return row;
  }

  createLogo(ch, size) {
    const wrap = M3U.dom.el('div', { className: 'channel-logo-wrap' });
    if (ch.logo) {
      const img = M3U.dom.el('img', { src: ch.logo, loading: 'lazy' });
      img.onerror = () => {
        img.remove();
        wrap.appendChild(M3U.dom.el('span', {
          className: 'channel-logo-fallback',
          textContent: ch.name.charAt(0).toUpperCase()
        }));
      };
      wrap.appendChild(img);
    } else {
      wrap.appendChild(M3U.dom.el('span', {
        className: 'channel-logo-fallback',
        textContent: ch.name.charAt(0).toUpperCase()
      }));
    }
    return wrap;
  }

  createFavBtn(channelId, isFav) {
    const btn = M3U.dom.el('button', {
      className: 'channel-fav-btn' + (isFav ? ' is-fav' : ''),
      innerHTML: M3U.dom.svgIcon(isFav ? M3U.icons.starFilled : M3U.icons.star, 16),
      onClick: (e) => {
        e.stopPropagation();
        this.favoritesService.toggle(channelId);
      }
    });
    return btn;
  }

  playChannel(ch) {
    this.setPlaying(ch.id);
    M3U.dom.dispatch('channel-play', { channel: ch });
  }
};
