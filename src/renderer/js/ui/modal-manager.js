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
    const backdrop = M3U.dom.el(
      'div',
      {
        className: 'modal-backdrop',
        onClick: (e) => {
          if (e.target === backdrop) {
            this.close();
          }
        }
      },
      [content]
    );
    document.body.appendChild(backdrop);
    this.currentModal = backdrop;
    return backdrop;
  }

  showAddPlaylist() {
    // --- Tab buttons ---
    const tabM3U = M3U.dom.el('button', {
      className: 'tab-btn active',
      textContent: 'M3U URL',
      onClick: () => switchTab('m3u')
    });
    const tabXtream = M3U.dom.el('button', {
      className: 'tab-btn',
      textContent: 'Xtream Login',
      onClick: () => switchTab('xtream')
    });
    const tabBar = M3U.dom.el('div', { className: 'tab-bar' }, [tabM3U, tabXtream]);

    // --- M3U Tab ---
    const urlInput = M3U.dom.el('input', {
      className: 'form-input',
      type: 'url',
      placeholder: 'http://example.com/playlist.m3u'
    });
    const nameInputM3U = M3U.dom.el('input', {
      className: 'form-input',
      type: 'text',
      placeholder: 'My IPTV Playlist'
    });
    const m3uPanel = M3U.dom.el('div', { className: 'tab-panel' }, [
      M3U.dom.el('div', { className: 'form-group' }, [
        M3U.dom.el('label', { className: 'form-label', textContent: 'Playlist URL' }),
        urlInput
      ]),
      M3U.dom.el('div', { className: 'form-group' }, [
        M3U.dom.el('label', { className: 'form-label', textContent: 'Name (optional)' }),
        nameInputM3U
      ])
    ]);

    // --- Xtream Tab ---
    const serverInput = M3U.dom.el('input', {
      className: 'form-input',
      type: 'text',
      placeholder: 'http://server.com or server.com:port'
    });
    const userInput = M3U.dom.el('input', {
      className: 'form-input',
      type: 'text',
      placeholder: 'Username'
    });
    const passInput = M3U.dom.el('input', {
      className: 'form-input',
      type: 'text',
      placeholder: 'Password'
    });
    const nameInputXt = M3U.dom.el('input', {
      className: 'form-input',
      type: 'text',
      placeholder: 'My IPTV (optional)'
    });
    const xtreamPanel = M3U.dom.el('div', { className: 'tab-panel hidden' }, [
      M3U.dom.el('div', { className: 'form-group' }, [
        M3U.dom.el('label', { className: 'form-label', textContent: 'Server (DNS)' }),
        serverInput
      ]),
      M3U.dom.el('div', { className: 'form-group' }, [
        M3U.dom.el('label', { className: 'form-label', textContent: 'Username' }),
        userInput
      ]),
      M3U.dom.el('div', { className: 'form-group' }, [
        M3U.dom.el('label', { className: 'form-label', textContent: 'Password' }),
        passInput
      ]),
      M3U.dom.el('div', { className: 'form-group' }, [
        M3U.dom.el('label', { className: 'form-label', textContent: 'Name (optional)' }),
        nameInputXt
      ])
    ]);

    let activeTab = 'm3u';
    function switchTab(tab) {
      activeTab = tab;
      tabM3U.classList.toggle('active', tab === 'm3u');
      tabXtream.classList.toggle('active', tab === 'xtream');
      m3uPanel.classList.toggle('hidden', tab !== 'm3u');
      xtreamPanel.classList.toggle('hidden', tab !== 'xtream');
    }

    const modal = M3U.dom.el('div', { className: 'modal' }, [
      M3U.dom.el('div', { className: 'modal-header' }, [
        M3U.dom.el('h3', { className: 'modal-title', textContent: 'Add Playlist' }),
        M3U.dom.el('button', {
          className: 'modal-close-btn',
          innerHTML: M3U.dom.svgIcon(M3U.icons.x),
          onClick: () => this.close()
        })
      ]),
      tabBar,
      M3U.dom.el('div', { className: 'modal-body' }, [m3uPanel, xtreamPanel]),
      M3U.dom.el('div', { className: 'modal-footer' }, [
        M3U.dom.el('button', {
          className: 'btn',
          textContent: 'Cancel',
          onClick: () => this.close()
        }),
        M3U.dom.el('button', {
          className: 'btn btn-accent',
          textContent: 'Add & Load',
          onClick: () => {
            if (activeTab === 'm3u') {
              this._addM3U(urlInput.value.trim(), nameInputM3U.value.trim());
            } else {
              this._addXtream(
                serverInput.value.trim(),
                userInput.value.trim(),
                passInput.value.trim(),
                nameInputXt.value.trim()
              );
            }
          }
        })
      ])
    ]);

    this._createBackdrop(modal);
    urlInput.focus();
  }

  async _addM3U(url, name) {
    if (!url) {
      return;
    }
    name = name || url.split('/').pop() || 'Playlist';
    try {
      this.close();
      M3U.dom.dispatch('loading-start', { text: 'Loading playlist...' });
      const entry = await this.playlistService.addPlaylist(url, name, 'm3u');
      await this.playlistService.setActive(entry.id);
      await this.playlistService.loadFromUrl(url);
      document.getElementById('header-playlist-name').textContent = name;
      this.toast.success(`Playlist "${name}" loaded`);
    } catch (err) {
      this.toast.error(`Failed to load: ${err.message}`);
    } finally {
      M3U.dom.dispatch('loading-end');
    }
  }

  async _addXtream(server, username, password, name) {
    if (!server || !username || !password) {
      this.toast.error('Please fill in server, username and password');
      return;
    }
    name = name || `${username}@${server.replace(/https?:\/\//, '').split('/')[0]}`;
    try {
      this.close();
      M3U.dom.dispatch('loading-start', { text: 'Connecting to Xtream server...' });
      const entry = await this.playlistService.addPlaylist(server, name, 'xtream', {
        server,
        username,
        password
      });
      await this.playlistService.setActive(entry.id);
      await this.playlistService.loadFromXtream(server, username, password);
      document.getElementById('header-playlist-name').textContent = name;
      this.toast.success(`Xtream "${name}" loaded`);
    } catch (err) {
      this.toast.error(`Xtream failed: ${err.message}`);
    } finally {
      M3U.dom.dispatch('loading-end');
    }
  }

  async showManagePlaylists() {
    const playlists = await this.playlistService.getSavedPlaylists();
    const activeId = await this.playlistService.getActiveId();

    const listEl = M3U.dom.el('div', { className: 'playlist-list' });

    if (playlists.length === 0) {
      listEl.appendChild(
        M3U.dom.el('p', {
          style: { color: 'var(--text-muted)', textAlign: 'center', padding: '20px' },
          textContent: 'No saved playlists. Add one to get started.'
        })
      );
    }

    for (const pl of playlists) {
      const typeLabel = pl.type === 'xtream' ? 'Xtream' : 'M3U';
      const subtitle =
        pl.type === 'xtream' && pl.xtream
          ? `${pl.xtream.username}@${pl.xtream.server.replace(/https?:\/\//, '')}`
          : pl.url;

      const item = M3U.dom.el(
        'div',
        {
          className: 'playlist-item' + (pl.id === activeId ? ' active' : '')
        },
        [
          M3U.dom.el('div', { className: 'playlist-item-info' }, [
            M3U.dom.el('div', { className: 'playlist-item-name' }, [
              pl.name + ' ',
              M3U.dom.el('span', {
                className: 'badge',
                textContent: typeLabel,
                style: { marginLeft: '6px', fontSize: '10px' }
              })
            ]),
            M3U.dom.el('div', { className: 'playlist-item-url', textContent: subtitle })
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
                  if (pl.type === 'xtream' && pl.xtream) {
                    await this.playlistService.loadFromXtream(
                      pl.xtream.server,
                      pl.xtream.username,
                      pl.xtream.password
                    );
                  } else {
                    await this.playlistService.loadFromUrl(pl.url);
                  }
                  document.getElementById('header-playlist-name').textContent = pl.name;
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
        ]
      );
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

  showSeriesEpisodes(series, info, creds) {
    const s = M3U.XtreamClient._normalizeServer(creds.server);
    const seasons = Object.keys(info.episodes).sort((a, b) => Number(a) - Number(b));

    const listEl = M3U.dom.el('div', { className: 'playlist-list' });

    for (const seasonNum of seasons) {
      const episodes = info.episodes[seasonNum];
      listEl.appendChild(
        M3U.dom.el('div', {
          className: 'form-label',
          style: { marginTop: '12px', marginBottom: '8px' },
          textContent: `Season ${seasonNum}`
        })
      );

      for (const ep of episodes) {
        const ext = ep.container_extension || 'mp4';
        const epUrl = `${s}/series/${creds.username}/${creds.password}/${ep.id}.${ext}`;
        const epName = ep.title || `Episode ${ep.episode_num}`;

        const item = M3U.dom.el(
          'div',
          {
            className: 'playlist-item',
            style: { cursor: 'pointer' },
            onClick: () => {
              this.close();
              M3U.dom.dispatch('channel-play', {
                channel: {
                  id: 'ep_' + ep.id,
                  name: `${series.name} - ${epName}`,
                  logo: series.logo || '',
                  group: series.group || '',
                  url: epUrl,
                  tvgId: '',
                  tvgName: '',
                  type: 'vod'
                }
              });
            }
          },
          [
            M3U.dom.el(
              'div',
              { className: 'playlist-item-info' },
              [
                M3U.dom.el('div', { className: 'playlist-item-name', textContent: epName }),
                ep.info && ep.info.duration
                  ? M3U.dom.el('div', {
                      className: 'playlist-item-url',
                      textContent: ep.info.duration
                    })
                  : null
              ].filter(Boolean)
            )
          ]
        );
        listEl.appendChild(item);
      }
    }

    const modal = M3U.dom.el('div', { className: 'modal', style: { maxWidth: '540px' } }, [
      M3U.dom.el('div', { className: 'modal-header' }, [
        M3U.dom.el('h3', { className: 'modal-title', textContent: series.name }),
        M3U.dom.el('button', {
          className: 'modal-close-btn',
          innerHTML: M3U.dom.svgIcon(M3U.icons.x),
          onClick: () => this.close()
        })
      ]),
      M3U.dom.el('div', { className: 'modal-body', style: { maxHeight: '60vh' } }, [listEl])
    ]);

    this._createBackdrop(modal);
  }
};
