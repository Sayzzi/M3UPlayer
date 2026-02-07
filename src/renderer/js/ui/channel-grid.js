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
    this.contentType = 'live';
    this.searchQuery = '';
    this.playingChannelId = null;

    // Virtualization
    this.allItems = [];
    this.BATCH_SIZE = 80;
    this.renderedCount = 0;
    this.isLoadingMore = false;

    // Track broken image domains to avoid repeated failed requests
    this._brokenDomains = new Set();

    this.scrollEl.addEventListener('scroll', () => this._onScroll());

    M3U.dom.on('category-selected', (e) => this.onCategorySelected(e.detail));
    M3U.dom.on('search-changed', (e) => this.onSearchChanged(e.detail));
    M3U.dom.on('content-type-changed', (e) => this.onContentTypeChanged(e.detail));
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

  onContentTypeChanged({ type }) {
    this.contentType = type;
    this.currentCategory = 'all';
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
    let items;
    let title;

    if (this.currentCategory === '__favorites__') {
      items = this.playlistService.filterChannels(
        this.searchQuery, null, this.favoritesService.getIds()
      );
      title = 'Favorites';
    } else if (this.currentCategory === '__recent__') {
      const history = this.historyService.getAll();
      items = history.map(h => {
        const ch = this.playlistService.getChannels().find(c => c.id === h.channelId);
        return ch || { id: h.channelId, name: h.channelName, logo: h.logo, group: h.group, url: h.url, tvgId: '', tvgName: '', type: 'live' };
      });
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        items = items.filter(ch => ch.name.toLowerCase().includes(q));
      }
      title = 'Recently Watched';
    } else if (this.contentType === 'live') {
      if (this.currentCategory === 'all') {
        items = this.playlistService.filterChannels(this.searchQuery);
        title = 'Live TV';
      } else {
        items = this.playlistService.filterChannels(this.searchQuery, this.currentCategory);
        title = this.currentCategory;
      }
    } else if (this.contentType === 'vod') {
      items = this.playlistService.filterItems(
        this.playlistService.getVods(), this.searchQuery, this.currentCategory
      );
      title = this.currentCategory === 'all' ? 'Films' : this.currentCategory;
    } else if (this.contentType === 'series') {
      items = this.playlistService.filterItems(
        this.playlistService.getSeries(), this.searchQuery, this.currentCategory
      );
      title = this.currentCategory === 'all' ? 'Series' : this.currentCategory;
    }

    this.titleEl.textContent = title;
    const label = this.contentType === 'vod' ? 'films' : this.contentType === 'series' ? 'series' : 'channels';
    this.countEl.textContent = `${items.length} ${label}`;
    this._render(items);
  }

  _render(items) {
    M3U.dom.clear(this.gridContainer);
    this.scrollEl.scrollTop = 0;
    this.allItems = items;
    this.renderedCount = 0;

    if (items.length === 0) {
      this.gridContainer.className = '';
      this.gridContainer.appendChild(
        M3U.dom.el('div', { className: 'empty-state' }, [
          M3U.dom.el('span', { innerHTML: M3U.dom.svgIcon(M3U.icons.tv, 56) }),
          M3U.dom.el('h3', { textContent: 'No content found' }),
          M3U.dom.el('p', { textContent: 'Try a different search or category.' })
        ])
      );
      return;
    }

    const isPoster = this.contentType === 'vod' || this.contentType === 'series';
    if (this.viewMode === 'grid') {
      this.gridContainer.className = isPoster ? 'channel-grid poster-grid' : 'channel-grid';
    } else {
      this.gridContainer.className = 'channel-list';
    }
    this._renderBatch();
  }

  _renderBatch() {
    if (this.renderedCount >= this.allItems.length) return;
    const fragment = document.createDocumentFragment();
    const end = Math.min(this.renderedCount + this.BATCH_SIZE, this.allItems.length);
    for (let i = this.renderedCount; i < end; i++) {
      const item = this.allItems[i];
      fragment.appendChild(this.viewMode === 'grid' ? this._createCard(item) : this._createRow(item));
    }
    this.gridContainer.appendChild(fragment);
    this.renderedCount = end;
  }

  _onScroll() {
    if (this.isLoadingMore || this.renderedCount >= this.allItems.length) return;
    const { scrollTop, scrollHeight, clientHeight } = this.scrollEl;
    if (scrollTop + clientHeight >= scrollHeight - 600) {
      this.isLoadingMore = true;
      requestAnimationFrame(() => {
        this._renderBatch();
        this.isLoadingMore = false;
      });
    }
  }

  _createCard(item) {
    const isFav = this.favoritesService.isFavorite(item.id);
    const isVod = item.type === 'vod';
    const isSeries = item.type === 'series';
    const epgNow = (!isVod && !isSeries) ? this.epgService.getCurrentProgram(item.tvgId) : null;

    const children = [];

    if (isVod || isSeries) {
      // Poster card
      children.push(this._createPoster(item));
      const infoChildren = [
        M3U.dom.el('div', { className: 'channel-name', textContent: item.name })
      ];
      if (item.rating) {
        infoChildren.push(M3U.dom.el('div', { className: 'card-rating', textContent: item.rating }));
      }
      children.push(M3U.dom.el('div', { className: 'card-info' }, infoChildren));
    } else {
      // Live channel card
      children.push(this._createFavBtn(item.id, isFav));
      children.push(this._createLogo(item));
      children.push(M3U.dom.el('div', { className: 'channel-name', textContent: item.name }));
      if (epgNow) {
        children.push(M3U.dom.el('div', { className: 'channel-epg-now', textContent: epgNow.title }));
      }
    }

    return M3U.dom.el('div', {
      className: 'channel-card' + (isVod || isSeries ? ' poster-card' : '') +
        (this.playingChannelId === item.id ? ' playing' : ''),
      dataset: { channelId: item.id },
      onClick: () => this._onItemClick(item)
    }, children);
  }

  _createRow(item) {
    const isFav = this.favoritesService.isFavorite(item.id);
    const isVod = item.type === 'vod';
    const isSeries = item.type === 'series';
    const epgNow = (!isVod && !isSeries) ? this.epgService.getCurrentProgram(item.tvgId) : null;

    const children = [
      this._createLogo(item, 36),
      M3U.dom.el('div', { className: 'channel-name', textContent: item.name }),
      M3U.dom.el('span', { className: 'channel-group-badge', textContent: item.group })
    ];
    if (epgNow) {
      children.push(M3U.dom.el('div', { className: 'channel-epg-now', textContent: epgNow.title }));
    }
    if (item.rating) {
      children.push(M3U.dom.el('span', { className: 'card-rating', textContent: item.rating }));
    }
    if (!isSeries) {
      children.push(this._createFavBtn(item.id, isFav));
    }

    return M3U.dom.el('div', {
      className: 'channel-row' + (this.playingChannelId === item.id ? ' playing' : ''),
      dataset: { channelId: item.id },
      onClick: () => this._onItemClick(item)
    }, children);
  }

  _isLogoBroken(url) {
    try {
      const host = new URL(url).hostname;
      return this._brokenDomains.has(host);
    } catch { return false; }
  }

  _markLogoBroken(url) {
    try {
      const host = new URL(url).hostname;
      this._brokenDomains.add(host);
    } catch {}
  }

  _createPoster(item) {
    const wrap = M3U.dom.el('div', { className: 'poster-wrap' });
    const fallbackChar = item.name.charAt(0).toUpperCase();
    if (item.logo && !this._isLogoBroken(item.logo)) {
      const img = M3U.dom.el('img', { src: item.logo, loading: 'lazy' });
      img.onerror = () => {
        this._markLogoBroken(item.logo);
        img.remove();
        wrap.appendChild(M3U.dom.el('span', {
          className: 'channel-logo-fallback poster-fallback',
          textContent: fallbackChar
        }));
      };
      wrap.appendChild(img);
    } else {
      wrap.appendChild(M3U.dom.el('span', {
        className: 'channel-logo-fallback poster-fallback',
        textContent: fallbackChar
      }));
    }
    return wrap;
  }

  _createLogo(item) {
    const wrap = M3U.dom.el('div', { className: 'channel-logo-wrap' });
    const fallbackChar = item.name.charAt(0).toUpperCase();
    if (item.logo && !this._isLogoBroken(item.logo)) {
      const img = M3U.dom.el('img', { src: item.logo, loading: 'lazy' });
      img.onerror = () => {
        this._markLogoBroken(item.logo);
        img.remove();
        wrap.appendChild(M3U.dom.el('span', {
          className: 'channel-logo-fallback',
          textContent: fallbackChar
        }));
      };
      wrap.appendChild(img);
    } else {
      wrap.appendChild(M3U.dom.el('span', {
        className: 'channel-logo-fallback',
        textContent: fallbackChar
      }));
    }
    return wrap;
  }

  _createFavBtn(channelId, isFav) {
    return M3U.dom.el('button', {
      className: 'channel-fav-btn' + (isFav ? ' is-fav' : ''),
      innerHTML: M3U.dom.svgIcon(isFav ? M3U.icons.starFilled : M3U.icons.star, 16),
      onClick: (e) => {
        e.stopPropagation();
        this.favoritesService.toggle(channelId);
      }
    });
  }

  _onItemClick(item) {
    if (item.type === 'series') {
      M3U.dom.dispatch('series-select', { series: item });
    } else {
      this.setPlaying(item.id);
      M3U.dom.dispatch('channel-play', { channel: item });
    }
  }
};
