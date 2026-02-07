window.M3U = window.M3U || {};

M3U.Sidebar = class {
  constructor(el, { favoritesService, historyService }) {
    this.el = el;
    this.favoritesService = favoritesService;
    this.historyService = historyService;
    this.activeCategory = 'all';
    this.activeContentType = 'live';
    this.groups = [];
    this.vodGroups = [];
    this.seriesGroups = [];
    this.channelCounts = {};
    this.vodCounts = {};
    this.seriesCounts = {};

    M3U.dom.on('playlist-loaded', (e) => this.onPlaylistLoaded(e.detail));
    M3U.dom.on('favorites-changed', () => this.updateBadges());
    M3U.dom.on('history-changed', () => this.updateBadges());
  }

  onPlaylistLoaded({ channels, groups, vods, vodGroups, series, seriesGroups }) {
    this.groups = groups || [];
    this.vodGroups = vodGroups || [];
    this.seriesGroups = seriesGroups || [];

    this.channelCounts = { all: (channels || []).length };
    for (const ch of (channels || [])) {
      this.channelCounts[ch.group] = (this.channelCounts[ch.group] || 0) + 1;
    }
    this.vodCounts = { all: (vods || []).length };
    for (const v of (vods || [])) {
      this.vodCounts[v.group] = (this.vodCounts[v.group] || 0) + 1;
    }
    this.seriesCounts = { all: (series || []).length };
    for (const s of (series || [])) {
      this.seriesCounts[s.group] = (this.seriesCounts[s.group] || 0) + 1;
    }

    this.render();
  }

  render() {
    const categoriesEl = this.el.querySelector('.sidebar-categories');
    M3U.dom.clear(categoriesEl);

    let currentGroups, currentCounts;
    if (this.activeContentType === 'vod') {
      currentGroups = this.vodGroups;
      currentCounts = this.vodCounts;
    } else if (this.activeContentType === 'series') {
      currentGroups = this.seriesGroups;
      currentCounts = this.seriesCounts;
    } else {
      currentGroups = this.groups;
      currentCounts = this.channelCounts;
    }

    for (const group of currentGroups) {
      categoriesEl.appendChild(this._createItem(group, M3U.icons.folder, currentCounts[group] || 0, group));
    }

    this.updateBadges();
    this.highlightActive();
  }

  _createItem(label, iconPath, count, category) {
    return M3U.dom.el('div', {
      className: 'sidebar-item' + (this.activeCategory === category ? ' active' : ''),
      dataset: { category },
      onClick: () => this.select(category)
    }, [
      M3U.dom.el('span', { innerHTML: M3U.dom.svgIcon(iconPath) }),
      M3U.dom.el('span', { className: 'sidebar-item-label', textContent: label }),
      M3U.dom.el('span', { className: 'badge', textContent: String(count) })
    ]);
  }

  select(category) {
    this.activeCategory = category;
    this.highlightActive();
    M3U.dom.dispatch('category-selected', { category });
  }

  setContentType(type) {
    this.activeContentType = type;
    this.activeCategory = 'all';
    this.render();
    M3U.dom.dispatch('content-type-changed', { type });
  }

  highlightActive() {
    this.el.querySelectorAll('.sidebar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.category === this.activeCategory);
    });
  }

  updateBadges() {
    const favBadge = this.el.querySelector('[data-category="__favorites__"] .badge');
    if (favBadge) favBadge.textContent = String(this.favoritesService.count());
    const histBadge = this.el.querySelector('[data-category="__recent__"] .badge');
    if (histBadge) histBadge.textContent = String(this.historyService.count());
    const allBadge = this.el.querySelector('[data-category="all"] .badge');
    if (allBadge) {
      const counts = this.activeContentType === 'vod' ? this.vodCounts
        : this.activeContentType === 'series' ? this.seriesCounts : this.channelCounts;
      allBadge.textContent = String(counts['all'] || 0);
    }
  }

  initStaticItems() {
    const section = this.el.querySelector('.sidebar-section');
    M3U.dom.clear(section);
    section.appendChild(this._createItem('All Channels', M3U.icons.tv, 0, 'all'));
    section.appendChild(this._createItem('Favorites', M3U.icons.starFilled, 0, '__favorites__'));
    section.appendChild(this._createItem('Recent', M3U.icons.clock, 0, '__recent__'));
  }
};
