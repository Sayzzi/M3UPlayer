window.M3U = window.M3U || {};

M3U.SettingsModal = class {
  constructor({ modalManager, toast }) {
    this.modalManager = modalManager;
    this.toast = toast;
  }

  async show() {
    const settings = await window.electronAPI.getSettings();

    const volumeSlider = M3U.dom.el('input', {
      type: 'range',
      min: '0',
      max: '1',
      step: '0.05',
      value: settings.volume || 0.8,
      className: 'form-range'
    });

    const volumeValue = M3U.dom.el('span', {
      className: 'range-value',
      textContent: `${Math.round((settings.volume || 0.8) * 100)}%`
    });

    volumeSlider.addEventListener('input', (e) => {
      volumeValue.textContent = `${Math.round(e.target.value * 100)}%`;
    });

    const epgRefreshSelect = M3U.dom.el('select', {
      className: 'form-select'
    });
    const refreshOptions = [
      { value: 3, label: '3 hours' },
      { value: 6, label: '6 hours (default)' },
      { value: 12, label: '12 hours' },
      { value: 24, label: '24 hours' },
      { value: 72, label: '3 days' }
    ];
    refreshOptions.forEach((opt) => {
      const optEl = M3U.dom.el('option', {
        value: opt.value,
        textContent: opt.label
      });
      if (opt.value === (settings.epgRefreshHours || 6)) {
        optEl.selected = true;
      }
      epgRefreshSelect.appendChild(optEl);
    });

    const defaultViewSelect = M3U.dom.el('select', {
      className: 'form-select'
    });
    const viewOptions = [
      { value: 'grid', label: 'Grid (default)' },
      { value: 'list', label: 'List' }
    ];
    viewOptions.forEach((opt) => {
      const optEl = M3U.dom.el('option', {
        value: opt.value,
        textContent: opt.label
      });
      if (opt.value === (settings.defaultView || 'grid')) {
        optEl.selected = true;
      }
      defaultViewSelect.appendChild(optEl);
    });

    const defaultSortSelect = M3U.dom.el('select', {
      className: 'form-select'
    });
    const sortOptions = [
      { value: 'default', label: 'Default order' },
      { value: 'az', label: 'A → Z' },
      { value: 'za', label: 'Z → A' },
      { value: 'recent', label: 'Recently watched' }
    ];
    sortOptions.forEach((opt) => {
      const optEl = M3U.dom.el('option', {
        value: opt.value,
        textContent: opt.label
      });
      if (opt.value === (settings.defaultSort || 'default')) {
        optEl.selected = true;
      }
      defaultSortSelect.appendChild(optEl);
    });

    const modal = M3U.dom.el('div', { className: 'modal', style: { maxWidth: '500px' } }, [
      M3U.dom.el('div', { className: 'modal-header' }, [
        M3U.dom.el('h3', { className: 'modal-title', textContent: 'Settings' }),
        M3U.dom.el('button', {
          className: 'modal-close-btn',
          innerHTML: M3U.dom.svgIcon(M3U.icons.x),
          onClick: () => this.modalManager.close()
        })
      ]),
      M3U.dom.el('div', { className: 'modal-body' }, [
        M3U.dom.el('div', { className: 'form-group' }, [
          M3U.dom.el('label', { className: 'form-label', textContent: 'Volume' }),
          M3U.dom.el('div', { className: 'range-wrapper' }, [volumeSlider, volumeValue])
        ]),
        M3U.dom.el('div', { className: 'form-group' }, [
          M3U.dom.el('label', { className: 'form-label', textContent: 'EPG Cache Duration' }),
          epgRefreshSelect
        ]),
        M3U.dom.el('div', { className: 'form-group' }, [
          M3U.dom.el('label', { className: 'form-label', textContent: 'Default View Mode' }),
          defaultViewSelect
        ]),
        M3U.dom.el('div', { className: 'form-group' }, [
          M3U.dom.el('label', { className: 'form-label', textContent: 'Default Sort' }),
          defaultSortSelect
        ])
      ]),
      M3U.dom.el('div', { className: 'modal-footer' }, [
        M3U.dom.el('button', {
          className: 'btn',
          textContent: 'Cancel',
          onClick: () => this.modalManager.close()
        }),
        M3U.dom.el('button', {
          className: 'btn btn-accent',
          textContent: 'Save Settings',
          onClick: async () => {
            const newSettings = {
              volume: parseFloat(volumeSlider.value),
              epgRefreshHours: parseInt(epgRefreshSelect.value, 10),
              defaultView: defaultViewSelect.value,
              defaultSort: defaultSortSelect.value
            };
            try {
              await window.electronAPI.updateSettings(newSettings);
              this.toast.success('Settings saved');
              this.modalManager.close();
            } catch (err) {
              this.toast.error(`Failed to save: ${err.message}`);
            }
          }
        })
      ])
    ]);

    this.modalManager._createBackdrop(modal);
  }
};
