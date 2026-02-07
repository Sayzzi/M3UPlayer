window.M3U = window.M3U || {};

M3U.Sidebar = class {
  constructor(el, { favoritesService, historyService }) {
    this.el = el;
    this.favoritesService = favoritesService;
    this.historyService = historyService;
    this.activeCategory = 'all';
    this.groups = [];
    this.channelCounts = {};

    M3U.dom.on('playlist-loaded', (e) => this.onPlaylistLoaded(e.detail));
    M3U.dom.on('favorites-changed', () => this.updateBadges());
    M3U.dom.on('history-changed', () => this.updateBadges());
  }

  onPlaylistLoaded({ channels, groups }) {
    this.groups = groups;
    this.channelCounts = {};
    this.channelCounts['all'] = channels.length;
    for (const ch of channels) {
      this.channelCounts[ch.group] = (this.channelCounts[ch.group] || 0) + 1;
    }
    this.render();
  }

  render() {
    const categoriesEl = this.el.querySelector('.sidebar-categories');
    M3U.dom.clear(categoriesEl);

    for (const group of this.groups) {
      const item = this.createItem(group, M3U.icons.folder, this.channelCounts[group] || 0, group);
      categoriesEl.appendChild(item);
    }

    this.updateBadges();
    this.highlightActive();
  }

  createItem(label, iconPath, count, category) {
    const item = M3U.dom.el('div', {
      className: 'sidebar-item' + (this.activeCategory === category ? ' active' : ''),
      dataset: { category },
      onClick: () => this.select(category)
    }, [
      M3U.dom.el('span', { innerHTML: M3U.dom.svgIcon(iconPath) }),
      M3U.dom.el('span', { className: 'sidebar-item-label', textContent: label }),
      M3U.dom.el('span', { className: 'badge', textContent: String(count) })
    ]);
    return item;
  }

  select(category) {
    this.activeCategory = category;
    this.highlightActive();
    M3U.dom.dispatch('category-selected', { category });
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
  }

  initStaticItems() {
    const section = this.el.querySelector('.sidebar-section');
    M3U.dom.clear(section);

    section.appendChild(this.createItem('All Channels', M3U.icons.tv, 0, 'all'));
    section.appendChild(this.createItem('Favorites', M3U.icons.starFilled, 0, '__favorites__'));
    section.appendChild(this.createItem('Recent', M3U.icons.clock, 0, '__recent__'));
  }
};
