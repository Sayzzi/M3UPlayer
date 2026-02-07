window.M3U = window.M3U || {};

M3U.ModalManager = class {
  constructor({ playlistService, toast }) {
    this.playlistService = playlistService;
    this.toast = toast;
    this.currentModal = null;
  }

  close() {
    if (this.currentModal) {
      this.currentModal.remove();
      this.currentModal = null;
    }
  }

  _createBackdrop(content) {
    const backdrop = M3U.dom.el('div', {
      className: 'modal-backdrop',
      onClick: (e) => { if (e.target === backdrop) this.close(); }
    }, [content]);
    document.body.appendChild(backdrop);
    this.currentModal = backdrop;
    return backdrop;
  }

  showAddPlaylist() {
    const urlInput = M3U.dom.el('input', {
      className: 'form-input',
      type: 'url',
      placeholder: 'https://example.com/playlist.m3u'
    });
    const nameInput = M3U.dom.el('input', {
      className: 'form-input',
      type: 'text',
      placeholder: 'My IPTV Playlist'
    });

    const modal = M3U.dom.el('div', { className: 'modal' }, [
      M3U.dom.el('div', { className: 'modal-header' }, [
        M3U.dom.el('h3', { className: 'modal-title', textContent: 'Add Playlist' }),
        M3U.dom.el('button', {
          className: 'modal-close-btn',
          innerHTML: M3U.dom.svgIcon(M3U.icons.x),
          onClick: () => this.close()
        })
      ]),
      M3U.dom.el('div', { className: 'modal-body' }, [
        M3U.dom.el('div', { className: 'form-group' }, [
          M3U.dom.el('label', { className: 'form-label', textContent: 'Playlist URL' }),
          urlInput
        ]),
        M3U.dom.el('div', { className: 'form-group' }, [
          M3U.dom.el('label', { className: 'form-label', textContent: 'Name (optional)' }),
          nameInput
        ])
      ]),
      M3U.dom.el('div', { className: 'modal-footer' }, [
        M3U.dom.el('button', {
          className: 'btn',
          textContent: 'Cancel',
          onClick: () => this.close()
        }),
        M3U.dom.el('button', {
          className: 'btn btn-accent',
          textContent: 'Add & Load',
          onClick: async () => {
            const url = urlInput.value.trim();
            if (!url) return;
            const name = nameInput.value.trim() || url.split('/').pop() || 'Playlist';
            try {
              this.close();
              M3U.dom.dispatch('loading-start', { text: 'Loading playlist...' });
              const entry = await this.playlistService.addPlaylist(url, name);
              await this.playlistService.setActive(entry.id);
              await this.playlistService.loadFromUrl(url);
              this.toast.success(`Playlist "${name}" loaded`);
            } catch (err) {
              this.toast.error(`Failed to load: ${err.message}`);
            } finally {
              M3U.dom.dispatch('loading-end');
            }
          }
        })
      ])
    ]);

    this._createBackdrop(modal);
    urlInput.focus();
  }

  async showManagePlaylists() {
    const playlists = await this.playlistService.getSavedPlaylists();
    const activeId = await this.playlistService.getActiveId();

    const listEl = M3U.dom.el('div', { className: 'playlist-list' });

    if (playlists.length === 0) {
      listEl.appendChild(M3U.dom.el('p', {
        style: { color: 'var(--text-muted)', textAlign: 'center', padding: '20px' },
        textContent: 'No saved playlists. Add one to get started.'
      }));
    }

    for (const pl of playlists) {
      const item = M3U.dom.el('div', {
        className: 'playlist-item' + (pl.id === activeId ? ' active' : '')
      }, [
        M3U.dom.el('div', { className: 'playlist-item-info' }, [
          M3U.dom.el('div', { className: 'playlist-item-name', textContent: pl.name }),
          M3U.dom.el('div', { className: 'playlist-item-url', textContent: pl.url })
        ]),
        M3U.dom.el('div', { className: 'playlist-item-actions' }, [
          M3U.dom.el('button', {
            className: 'btn',
            textContent: 'Load',
            onClick: async () => {
              try {
                this.close();
                M3U.dom.dispatch('loading-start', { text: 'Loading playlist...' });
                await this.playlistService.setActive(pl.id);
                await this.playlistService.loadFromUrl(pl.url);
                this.toast.success(`Loaded "${pl.name}"`);
              } catch (err) {
                this.toast.error(`Failed: ${err.message}`);
              } finally {
                M3U.dom.dispatch('loading-end');
              }
            }
          }),
          M3U.dom.el('button', {
            className: 'btn-icon',
            innerHTML: M3U.dom.svgIcon(M3U.icons.trash, 16),
            onClick: async () => {
              await this.playlistService.removePlaylist(pl.id);
              this.close();
              this.showManagePlaylists();
              this.toast.info('Playlist removed');
            }
          })
        ])
      ]);
      listEl.appendChild(item);
    }

    const modal = M3U.dom.el('div', { className: 'modal' }, [
      M3U.dom.el('div', { className: 'modal-header' }, [
        M3U.dom.el('h3', { className: 'modal-title', textContent: 'Manage Playlists' }),
        M3U.dom.el('button', {
          className: 'modal-close-btn',
          innerHTML: M3U.dom.svgIcon(M3U.icons.x),
          onClick: () => this.close()
        })
      ]),
      M3U.dom.el('div', { className: 'modal-body' }, [listEl]),
      M3U.dom.el('div', { className: 'modal-footer' }, [
        M3U.dom.el('button', {
          className: 'btn btn-accent',
          innerHTML: M3U.dom.svgIcon(M3U.icons.plus, 16) + ' Add Playlist',
          onClick: () => {
            this.close();
            this.showAddPlaylist();
          }
        })
      ])
    ]);

    this._createBackdrop(modal);
  }
};
