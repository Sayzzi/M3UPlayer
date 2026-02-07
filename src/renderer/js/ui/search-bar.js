window.M3U = window.M3U || {};

M3U.SearchBar = class {
  constructor(inputEl) {
    this.input = inputEl;
    this.debounceTimer = null;

    this.input.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        M3U.dom.dispatch('search-changed', { query: this.input.value.trim() });
      }, 300);
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.input.value = '';
        M3U.dom.dispatch('search-changed', { query: '' });
        this.input.blur();
      }
    });
  }

  clear() {
    this.input.value = '';
    M3U.dom.dispatch('search-changed', { query: '' });
  }
};
