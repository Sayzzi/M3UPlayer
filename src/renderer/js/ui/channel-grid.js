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
    this.sortMode = 'default'; // 'default', 'az', 'za', 'recent'

    // Virtual scrolling state
    this.allItems = [];
    this._virtualEnabled = false;
    this._itemHeight = 0;
    this._itemWidth = 0;
    this._itemsPerRow = 1;
    this._visibleCount = 0;
    this._bufferSize = 10; // Extra rows to render above/below viewport
    this._renderedRange = { start: 0, end: 0 };
    this._resizeObserver = null;
    this._scrollRaf = null;

    // Track broken image domains to avoid repeated failed requests
    this._brokenDomains = new Set();

    this.scrollEl.addEventListener('scroll', () => this._onVirtualScroll(), { passive: true });

    // Setup resize observer for responsive virtualization
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this.gridContainer);

    M3U.dom.on('category-selected', (e) => this.onCategorySelected(e.detail));
    M3U.dom.on('search-changed', (e) => this.onSearchChanged(e.detail));
    M3U.dom.on('content-type-changed', (e) => this.onContentTypeChanged(e.detail));
    M3U.dom.on('playlist-loaded', () => this.refresh());
    M3U.dom.on('favorites-changed', () => this.refresh());
    M3U.dom.on('epg-loaded', () => this.refresh());

    this._setupKeyboardNav();
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

  setSortMode(mode) {
    this.sortMode = mode;
    this.refresh();
  }

  _sortItems(items) {
    if (this.sortMode === 'default' || this.currentCategory === '__recent__') {
      return items;
    }
    const sorted = [...items];
    switch (this.sortMode) {
      case 'az':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'za':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'recent': {
        const history = this.historyService.getAll();
        const historyMap = new Map(history.map((h, i) => [h.channelId, i]));
        sorted.sort((a, b) => {
          const aIdx = historyMap.has(a.id) ? historyMap.get(a.id) : Infinity;
          const bIdx = historyMap.has(b.id) ? historyMap.get(b.id) : Infinity;
          return aIdx - bIdx;
        });
        break;
      }
    }
    return sorted;
  }

  setPlaying(channelId) {
    this.playingChannelId = channelId;
    this.el.querySelectorAll('.channel-card, .channel-row').forEach((card) => {
      card.classList.toggle('playing', card.dataset.channelId === channelId);
    });
  }

  refresh() {
    let items;
    let title;

    if (this.currentCategory === '__favorites__') {
      items = this.playlistService.filterChannels(
        this.searchQuery,
        null,
        this.favoritesService.getIds()
      );
      title = 'Favorites';
    } else if (this.currentCategory === '__recent__') {
      const history = this.historyService.getAll();
      items = history.map((h) => {
        const ch = this.playlistService.getChannels().find((c) => c.id === h.channelId);
        return (
          ch || {
            id: h.channelId,
            name: h.channelName,
            logo: h.logo,
            group: h.group,
            url: h.url,
            tvgId: '',
            tvgName: '',
            type: 'live'
          }
        );
      });
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        items = items.filter((ch) => ch.name.toLowerCase().includes(q));
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
        this.playlistService.getVods(),
        this.searchQuery,
        this.currentCategory
      );
      title = this.currentCategory === 'all' ? 'Films' : this.currentCategory;
    } else if (this.contentType === 'series') {
      items = this.playlistService.filterItems(
        this.playlistService.getSeries(),
        this.searchQuery,
        this.currentCategory
      );
      title = this.currentCategory === 'all' ? 'Series' : this.currentCategory;
    }

    this.titleEl.textContent = title;
    const label =
      this.contentType === 'vod' ? 'films' : this.contentType === 'series' ? 'series' : 'channels';
    this.countEl.textContent = `${items.length} ${label}`;
    this._render(this._sortItems(items));
  }

  _render(items) {
    M3U.dom.clear(this.gridContainer);
    this.scrollEl.scrollTop = 0;
    this.allItems = items;
    this._renderedRange = { start: 0, end: 0 };

    // Reset virtual scroll styles
    this.gridContainer.style.height = '';
    this.gridContainer.style.minHeight = '';
    this.gridContainer.style.paddingTop = '';
    this.gridContainer.style.paddingBottom = '';
    this.gridContainer.style.boxSizing = '';
    this.gridContainer.style.position = '';
    this.gridContainer.style.top = '';
    this.gridContainer.style.left = '';
    this.gridContainer.style.right = '';

    // Remove existing spacer
    const existingSpacer = this.scrollEl.querySelector('.virtual-scroll-spacer');
    if (existingSpacer) {
      existingSpacer.remove();
    }

    if (items.length === 0) {
      this.gridContainer.className = '';
      this._virtualEnabled = false;
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

    // Enable virtual scrolling for large lists (500+ items)
    this._virtualEnabled = items.length > 500;

    if (this._virtualEnabled) {
      this._initVirtualScroll();
    } else {
      // For smaller lists, render all items directly
      const fragment = document.createDocumentFragment();
      for (const item of items) {
        fragment.appendChild(
          this.viewMode === 'grid' ? this._createCard(item) : this._createRow(item)
        );
      }
      this.gridContainer.appendChild(fragment);
    }
  }

  _initVirtualScroll() {
    // Calculate item dimensions
    this._measureItemSize();
    this._calculateLayout();
    this._updateVirtualScroll();
  }

  _measureItemSize() {
    // Create a temporary item to measure
    const tempItem =
      this.viewMode === 'grid'
        ? this._createCard(this.allItems[0])
        : this._createRow(this.allItems[0]);
    tempItem.style.visibility = 'hidden';
    tempItem.style.position = 'absolute';
    this.gridContainer.appendChild(tempItem);

    const rect = tempItem.getBoundingClientRect();
    // Get the gap from CSS (poster-grid uses 14px, regular grid uses 10px)
    const isPoster = this.contentType === 'vod' || this.contentType === 'series';
    const gap = this.viewMode === 'grid' ? (isPoster ? 14 : 10) : 2;
    this._itemHeight = rect.height + gap;
    this._itemWidth = rect.width + gap;

    tempItem.remove();
  }

  _calculateLayout() {
    const containerWidth = this.gridContainer.clientWidth;
    if (this.viewMode === 'grid' && this._itemWidth > 0) {
      this._itemsPerRow = Math.max(1, Math.floor(containerWidth / this._itemWidth));
    } else {
      this._itemsPerRow = 1;
    }

    const viewportHeight = this.scrollEl.clientHeight;
    const rowsVisible = Math.ceil(viewportHeight / this._itemHeight) + 1;
    this._visibleCount = rowsVisible * this._itemsPerRow;
  }

  _updateVirtualScroll() {
    if (!this._virtualEnabled || this._itemHeight === 0) {
      return;
    }

    const scrollTop = this.scrollEl.scrollTop;
    const totalRows = Math.ceil(this.allItems.length / this._itemsPerRow);
    const totalHeight = totalRows * this._itemHeight;

    // Calculate visible range
    const startRow = Math.max(0, Math.floor(scrollTop / this._itemHeight) - this._bufferSize);
    const endRow = Math.min(
      totalRows,
      Math.ceil((scrollTop + this.scrollEl.clientHeight) / this._itemHeight) + this._bufferSize
    );

    const startIdx = startRow * this._itemsPerRow;
    const endIdx = Math.min(endRow * this._itemsPerRow, this.allItems.length);

    // Only re-render if range changed significantly
    if (startIdx === this._renderedRange.start && endIdx === this._renderedRange.end) {
      return;
    }

    this._renderedRange = { start: startIdx, end: endIdx };

    // Calculate spacer heights
    const topSpacerHeight = startRow * this._itemHeight;
    const bottomSpacerHeight = Math.max(0, totalHeight - (endRow * this._itemHeight));

    // Build the content with spacers
    M3U.dom.clear(this.gridContainer);
    const fragment = document.createDocumentFragment();

    // Top spacer - takes full grid width
    if (topSpacerHeight > 0) {
      const topSpacer = document.createElement('div');
      topSpacer.className = 'virtual-spacer-top';
      topSpacer.style.height = `${topSpacerHeight}px`;
      topSpacer.style.gridColumn = '1 / -1'; // Span all columns
      fragment.appendChild(topSpacer);
    }

    // Render visible items
    for (let i = startIdx; i < endIdx; i++) {
      const item = this.allItems[i];
      if (item) {
        fragment.appendChild(
          this.viewMode === 'grid' ? this._createCard(item) : this._createRow(item)
        );
      }
    }

    // Bottom spacer - takes full grid width
    if (bottomSpacerHeight > 0) {
      const bottomSpacer = document.createElement('div');
      bottomSpacer.className = 'virtual-spacer-bottom';
      bottomSpacer.style.height = `${bottomSpacerHeight}px`;
      bottomSpacer.style.gridColumn = '1 / -1'; // Span all columns
      fragment.appendChild(bottomSpacer);
    }

    this.gridContainer.appendChild(fragment);
  }

  _onVirtualScroll() {
    if (!this._virtualEnabled) {
      return;
    }
    if (this._scrollRaf) {
      return;
    }
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = null;
      this._updateVirtualScroll();
    });
  }

  _onResize() {
    if (!this._virtualEnabled) {
      return;
    }
    this._calculateLayout();
    this._updateVirtualScroll();
  }

  _createCard(item) {
    const isFav = this.favoritesService.isFavorite(item.id);
    const isVod = item.type === 'vod';
    const isSeries = item.type === 'series';
    const epgNow = !isVod && !isSeries ? this.epgService.getCurrentProgram(item.tvgId) : null;

    const children = [];

    if (isVod || isSeries) {
      // Poster card
      children.push(this._createPoster(item));
      const infoChildren = [
        M3U.dom.el('div', { className: 'channel-name', textContent: item.name })
      ];
      if (item.rating) {
        infoChildren.push(
          M3U.dom.el('div', { className: 'card-rating', textContent: item.rating })
        );
      }
      children.push(M3U.dom.el('div', { className: 'card-info' }, infoChildren));
    } else {
      // Live channel card
      children.push(this._createFavBtn(item.id, isFav));
      children.push(this._createLogo(item));
      children.push(M3U.dom.el('div', { className: 'channel-name', textContent: item.name }));
      if (epgNow) {
        children.push(
          M3U.dom.el('div', { className: 'channel-epg-now', textContent: epgNow.title })
        );
      }
    }

    return M3U.dom.el(
      'div',
      {
        className:
          'channel-card' +
          (isVod || isSeries ? ' poster-card' : '') +
          (this.playingChannelId === item.id ? ' playing' : ''),
        dataset: { channelId: item.id },
        tabIndex: 0,
        onClick: () => this._onItemClick(item)
      },
      children
    );
  }

  _createRow(item) {
    const isFav = this.favoritesService.isFavorite(item.id);
    const isVod = item.type === 'vod';
    const isSeries = item.type === 'series';
    const epgNow = !isVod && !isSeries ? this.epgService.getCurrentProgram(item.tvgId) : null;

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

    return M3U.dom.el(
      'div',
      {
        className: 'channel-row' + (this.playingChannelId === item.id ? ' playing' : ''),
        dataset: { channelId: item.id },
        tabIndex: 0,
        onClick: () => this._onItemClick(item)
      },
      children
    );
  }

  _isLogoBroken(url) {
    try {
      const host = new URL(url).hostname;
      return this._brokenDomains.has(host);
    } catch {
      return false;
    }
  }

  _markLogoBroken(url) {
    try {
      const host = new URL(url).hostname;
      this._brokenDomains.add(host);
    } catch {
      // Invalid URL, skip marking
    }
  }

  _createPoster(item) {
    const wrap = M3U.dom.el('div', { className: 'poster-wrap' });
    const fallbackChar = item.name.charAt(0).toUpperCase();
    if (item.logo && !this._isLogoBroken(item.logo)) {
      const img = M3U.dom.el('img', { src: item.logo, loading: 'lazy' });
      img.onerror = () => {
        this._markLogoBroken(item.logo);
        img.remove();
        wrap.appendChild(
          M3U.dom.el('span', {
            className: 'channel-logo-fallback poster-fallback',
            textContent: fallbackChar
          })
        );
      };
      wrap.appendChild(img);
    } else {
      wrap.appendChild(
        M3U.dom.el('span', {
          className: 'channel-logo-fallback poster-fallback',
          textContent: fallbackChar
        })
      );
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
        wrap.appendChild(
          M3U.dom.el('span', {
            className: 'channel-logo-fallback',
            textContent: fallbackChar
          })
        );
      };
      wrap.appendChild(img);
    } else {
      wrap.appendChild(
        M3U.dom.el('span', {
          className: 'channel-logo-fallback',
          textContent: fallbackChar
        })
      );
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

  _setupKeyboardNav() {
    this.el.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        return;
      }

      const cards = Array.from(this.gridContainer.querySelectorAll('[data-channel-id]'));
      if (cards.length === 0) {
        return;
      }

      const activeCard = document.activeElement;
      const activeIdx = cards.indexOf(activeCard);

      if (activeIdx === -1 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        cards[0]?.focus();
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          if (this.viewMode === 'list' || activeIdx < cards.length - 1) {
            cards[activeIdx + 1]?.focus();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (activeIdx > 0) {
            cards[activeIdx - 1]?.focus();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (this.viewMode === 'grid') {
            const perRow = Math.max(1, Math.floor(this.gridContainer.clientWidth / 200));
            const nextIdx = Math.min(activeIdx + perRow, cards.length - 1);
            cards[nextIdx]?.focus();
          } else {
            cards[activeIdx + 1]?.focus();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (this.viewMode === 'grid') {
            const perRow = Math.max(1, Math.floor(this.gridContainer.clientWidth / 200));
            const prevIdx = Math.max(activeIdx - perRow, 0);
            cards[prevIdx]?.focus();
          } else if (activeIdx > 0) {
            cards[activeIdx - 1]?.focus();
          }
          break;
        case 'Enter':
          if (activeIdx >= 0) {
            e.preventDefault();
            const channelId = activeCard.dataset.channelId;
            const item = this.allItems.find((i) => i.id === channelId);
            if (item) {
              this._onItemClick(item);
            }
          }
          break;
      }
    });
  }
};
