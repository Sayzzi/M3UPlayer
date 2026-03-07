window.M3U = window.M3U || {};

M3U.PlayerPanel = class {
  constructor(el, { epgService }) {
    this.el = el;
    this.epgService = epgService;
    this.video = el.querySelector('video');
    this.hls = null;
    this.currentChannel = null;
    this.epgInterval = null;
    this._seekRaf = null;
    this._isSeeking = false;

    this.channelNameEl = el.querySelector('.player-channel-name');
    this.errorOverlay = el.querySelector('.player-error-overlay');
    this.epgBar = el.querySelector('.player-epg-bar');
    this.channelInfoEl = el.querySelector('.player-channel-info');

    // Video container (fullscreen target)
    this.videoContainer = el.querySelector('.player-video-container');
    this.controlsOverlay = el.querySelector('.player-controls-overlay');
    this.controlsEl = el.querySelector('.player-controls');
    this.fsChannelName = el.querySelector('.fs-channel-name');

    // Seek bar elements
    this.seekWrap = el.querySelector('#player-seek');
    this.seekSlider = el.querySelector('.seek-slider');
    this.seekCurrent = el.querySelector('.seek-time-current');
    this.seekTotal = el.querySelector('.seek-time-total');

    // Rewind / Forward buttons
    this.rewindBtn = el.querySelector('.ctrl-rewind');
    this.forwardBtn = el.querySelector('.ctrl-forward');

    // Fullscreen auto-hide state
    this._fsHideTimer = null;
    this._fsControlsVisible = false;

    // Playback position save interval
    this._savePositionInterval = null;

    this.setupControls();
    this.setupSeek();
    this.setupKeyboard();
    this.setupFullscreen();
    this.setupSubtitles();
  }

  setupControls() {
    this.playPauseBtn = this.controlsEl.querySelector('.ctrl-play-pause');
    this.muteBtn = this.controlsEl.querySelector('.ctrl-mute');
    this.volumeSlider = this.controlsEl.querySelector('.volume-slider');
    this.fullscreenBtn = this.controlsEl.querySelector('.ctrl-fullscreen');
    this.pipBtn = this.controlsEl.querySelector('.ctrl-pip');
    this.subtitlesBtn = this.controlsEl.querySelector('.ctrl-subtitles');
    const closeBtn = this.el.querySelector('.player-close-btn');

    this.playPauseBtn?.addEventListener('click', () => this.togglePlayPause());
    this.muteBtn?.addEventListener('click', () => this.toggleMute());
    this.volumeSlider?.addEventListener('input', (e) => {
      this.video.volume = parseFloat(e.target.value);
      this.video.muted = false;
      this.updateVolumeIcon();
    });
    this.fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
    this.pipBtn?.addEventListener('click', () => this.togglePip());
    this.subtitlesBtn?.addEventListener('click', () => this.showSubtitlesMenu());
    closeBtn?.addEventListener('click', () => this.close());

    this.video.addEventListener('play', () => this.updatePlayPauseIcon());
    this.video.addEventListener('pause', () => this.updatePlayPauseIcon());

    // PiP events
    this.video.addEventListener('enterpictureinpicture', () => {
      this.pipBtn?.classList.add('active');
    });
    this.video.addEventListener('leavepictureinpicture', () => {
      this.pipBtn?.classList.remove('active');
    });

    // Hide PiP button if not supported
    if (!document.pictureInPictureEnabled) {
      this.pipBtn?.classList.add('hidden');
    }

    // Sync initial volume
    window.electronAPI.getSettings().then((s) => {
      this.video.volume = s.volume || 0.8;
      if (this.volumeSlider) {
        this.volumeSlider.value = this.video.volume;
      }
    });
  }

  /* ── Fullscreen ─────────────────────────────────────── */

  setupFullscreen() {
    // Double-click video to toggle fullscreen
    this.videoContainer.addEventListener('dblclick', (e) => {
      if (e.target.closest('.fs-bottom')) {
        return;
      }
      this.toggleFullscreen();
    });

    // Single click to toggle play/pause (only in fullscreen)
    this.videoContainer.addEventListener('click', (e) => {
      if (e.target.closest('.fs-bottom')) {
        return;
      }
      if (e.target.closest('.player-error-overlay')) {
        return;
      }
      if (document.fullscreenElement) {
        this.togglePlayPause();
        this._showFsControls();
      }
    });

    // Mouse move in fullscreen → show controls
    this.videoContainer.addEventListener('mousemove', () => {
      if (document.fullscreenElement) {
        this._showFsControls();
      }
    });

    // Keep controls visible when hovering over them
    const fsBottom = this.controlsOverlay?.querySelector('.fs-bottom');
    if (fsBottom) {
      fsBottom.addEventListener('mouseenter', () => {
        if (document.fullscreenElement) {
          this._clearFsHideTimer();
        }
      });
      fsBottom.addEventListener('mouseleave', () => {
        if (document.fullscreenElement) {
          this._scheduleFsHide();
        }
      });
    }

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        this._showFsControls();
      } else {
        this._clearFsHideTimer();
        this.videoContainer.classList.remove('controls-visible');
      }
    });
  }

  _showFsControls() {
    this.videoContainer.classList.add('controls-visible');
    this._fsControlsVisible = true;
    this._clearFsHideTimer();
    this._scheduleFsHide();
  }

  _hideFsControls() {
    if (this._isSeeking) {
      return;
    }
    if (this.video.paused) {
      return;
    } // Keep visible when paused
    this.videoContainer.classList.remove('controls-visible');
    this._fsControlsVisible = false;
  }

  _scheduleFsHide() {
    this._clearFsHideTimer();
    this._fsHideTimer = setTimeout(() => this._hideFsControls(), 3000);
  }

  _clearFsHideTimer() {
    if (this._fsHideTimer) {
      clearTimeout(this._fsHideTimer);
      this._fsHideTimer = null;
    }
  }

  /* ── Seek bar ─────────────────────────────────────────── */

  setupSeek() {
    if (!this.seekSlider) {
      return;
    }

    this.seekSlider.addEventListener('input', () => {
      this._isSeeking = true;
      const t = (parseFloat(this.seekSlider.value) / 100) * (this.video.duration || 0);
      this.seekCurrent.textContent = this._fmtTime(t);
    });

    this.seekSlider.addEventListener('change', () => {
      const pct = parseFloat(this.seekSlider.value) / 100;
      const dur = this.video.duration || 0;
      if (dur && isFinite(dur)) {
        this.video.currentTime = pct * dur;
      }
      this._isSeeking = false;
    });

    this.rewindBtn?.addEventListener('click', () => {
      if (this.video.duration && isFinite(this.video.duration)) {
        this.video.currentTime = Math.max(0, this.video.currentTime - 10);
      }
    });
    this.forwardBtn?.addEventListener('click', () => {
      if (this.video.duration && isFinite(this.video.duration)) {
        this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 10);
      }
    });
  }

  _showSeek(isVod) {
    if (isVod) {
      this.seekWrap?.classList.remove('hidden');
      this.rewindBtn?.classList.remove('hidden');
      this.forwardBtn?.classList.remove('hidden');
      this.epgBar?.classList.add('hidden');
      this._startSeekUpdate();
    } else {
      this.seekWrap?.classList.add('hidden');
      this.rewindBtn?.classList.add('hidden');
      this.forwardBtn?.classList.add('hidden');
      this.epgBar?.classList.remove('hidden');
      this._stopSeekUpdate();
    }
  }

  _startSeekUpdate() {
    this._stopSeekUpdate();
    const update = () => {
      if (!this._isSeeking && this.video.duration && isFinite(this.video.duration)) {
        const pct = (this.video.currentTime / this.video.duration) * 100;
        this.seekSlider.value = pct;
        this.seekCurrent.textContent = this._fmtTime(this.video.currentTime);
        this.seekTotal.textContent = this._fmtTime(this.video.duration);
      }
      this._seekRaf = requestAnimationFrame(update);
    };
    this._seekRaf = requestAnimationFrame(update);
  }

  _stopSeekUpdate() {
    if (this._seekRaf) {
      cancelAnimationFrame(this._seekRaf);
      this._seekRaf = null;
    }
  }

  _fmtTime(sec) {
    if (!sec || !isFinite(sec)) {
      return '0:00';
    }
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /* ── Keyboard ─────────────────────────────────────────── */

  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (!this.currentChannel) {
        return;
      }
      if (e.target.tagName === 'INPUT') {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.togglePlayPause();
          if (document.fullscreenElement) {
            this._showFsControls();
          }
          break;
        case 'm':
        case 'M':
          this.toggleMute();
          if (document.fullscreenElement) {
            this._showFsControls();
          }
          break;
        case 'f':
        case 'F':
          this.toggleFullscreen();
          break;
        case 'p':
        case 'P':
          this.togglePip();
          break;
        case 'c':
        case 'C':
          this.toggleSubtitles();
          if (document.fullscreenElement) {
            this._showFsControls();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (this.video.duration && isFinite(this.video.duration)) {
            this.video.currentTime = Math.max(0, this.video.currentTime - 10);
          }
          if (document.fullscreenElement) {
            this._showFsControls();
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (this.video.duration && isFinite(this.video.duration)) {
            this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 10);
          }
          if (document.fullscreenElement) {
            this._showFsControls();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.video.volume = Math.min(1, this.video.volume + 0.05);
          this.video.muted = false;
          if (this.volumeSlider) {
            this.volumeSlider.value = this.video.volume;
          }
          this.updateVolumeIcon();
          if (document.fullscreenElement) {
            this._showFsControls();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.video.volume = Math.max(0, this.video.volume - 0.05);
          if (this.volumeSlider) {
            this.volumeSlider.value = this.video.volume;
          }
          this.updateVolumeIcon();
          if (document.fullscreenElement) {
            this._showFsControls();
          }
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            this.close();
          }
          break;
      }
    });
  }

  /* ── Position Save / Restore ─────────────────────────── */

  _saveCurrentPosition() {
    if (!this.currentChannel) {
      return;
    }
    if (this.currentChannel.type === 'live') {
      return;
    }
    const dur = this.video.duration;
    const pos = this.video.currentTime;
    if (!dur || !isFinite(dur) || dur < 1) {
      return;
    }
    window.electronAPI.savePlaybackPosition(this.currentChannel.url, pos, dur);
  }

  _startPositionSave(isVod) {
    this._stopPositionSave();
    if (!isVod) {
      return;
    }
    // Save every 10 seconds
    this._savePositionInterval = setInterval(() => this._saveCurrentPosition(), 10000);
  }

  _stopPositionSave() {
    if (this._savePositionInterval) {
      clearInterval(this._savePositionInterval);
      this._savePositionInterval = null;
    }
  }

  async _restorePosition(channel) {
    try {
      const saved = await window.electronAPI.getPlaybackPosition(channel.url);
      if (saved && saved.position > 5) {
        // Wait for video to be ready enough to seek
        const onCanPlay = () => {
          this.video.removeEventListener('canplay', onCanPlay);
          this.video.currentTime = saved.position;
        };
        this.video.addEventListener('canplay', onCanPlay);
      }
    } catch {
      // Position restore is non-critical
    }
  }

  _saveLastWatched(channel) {
    const data = {
      name: channel.name,
      url: channel.url,
      type: channel.type || 'live',
      logo: channel.logo || '',
      group: channel.group || '',
      tvgId: channel.tvgId || '',
      channelId: channel.channelId || ''
    };
    window.electronAPI.setLastWatched(data);
  }

  /* ── Playback ─────────────────────────────────────────── */

  play(channel) {
    this.stop();
    this.currentChannel = channel;
    this.channelNameEl.textContent = channel.name;
    this.hideError();
    this.el.classList.remove('hidden');
    document.querySelector('.app-container').classList.add('player-open');

    // Update fullscreen channel name overlay
    if (this.fsChannelName) {
      this.fsChannelName.textContent = channel.name;
    }

    const url = channel.url;
    const isLive = channel.type === 'live';
    const isHlsUrl = url.includes('.m3u8');
    const isDirectFile = /\.(mp4|mkv|avi|mov|wmv|flv|webm|mpg|mpeg)(\?|$)/i.test(url);
    const isVod = !isLive;

    this._showSeek(isVod);

    if (this.seekSlider) {
      this.seekSlider.value = 0;
      this.seekCurrent.textContent = '0:00';
      this.seekTotal.textContent = '0:00';
    }

    const useHls = Hls.isSupported() && (isHlsUrl || isLive || !isDirectFile);

    if (useHls) {
      this._playWithHls(url, isDirectFile);
    } else {
      this._playDirect(url);
    }

    // Restore saved position for VOD/Series
    if (isVod) {
      this._restorePosition(channel);
    }

    // Save position periodically for VOD/Series
    this._startPositionSave(isVod);

    // Save as last watched channel
    this._saveLastWatched(channel);

    this.updateChannelInfo(channel);
    this.updateEpg();
    this.startEpgRefresh();
    this.updatePlayPauseIcon();
  }

  _playWithHls(url, canFallbackDirect) {
    this.hls = new Hls({
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      enableWorker: true
    });
    this.hls.loadSource(url);
    this.hls.attachMedia(this.video);
    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      this.video.play().catch(() => {});
      // Detect embedded subtitle tracks
      if (this.hls.subtitleTracks && this.hls.subtitleTracks.length > 0) {
        this.subtitlesBtn?.classList.add('has-tracks');
      }
    });
    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (!this._hlsRetried) {
              this._hlsRetried = true;
              setTimeout(() => {
                if (this.hls) {
                  this.hls.startLoad();
                }
              }, 2000);
            } else if (canFallbackDirect) {
              this._fallbackDirect(url);
            } else {
              this.showError('Stream unavailable. Check your connection.');
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            if (this.hls) {
              this.hls.recoverMediaError();
            }
            break;
          default:
            if (canFallbackDirect) {
              this._fallbackDirect(url);
            } else {
              this.showError('Stream unavailable. Please try another channel.');
            }
            break;
        }
      }
    });

    this._hlsRetried = false;
    this._manifestTimeout = setTimeout(() => {
      if (this.hls && !this.video.readyState) {
        this._fallbackDirect(url);
      }
    }, 12000);
  }

  _playDirect(url) {
    this.video.src = url;
    this.video.play().catch(() => {
      this.showError('Unable to play this stream.');
    });
  }

  _fallbackDirect(url) {
    if (this._manifestTimeout) {
      clearTimeout(this._manifestTimeout);
      this._manifestTimeout = null;
    }
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.video.src = url;
    this.video.play().catch(() => {
      this.showError('Unable to play this stream.');
    });
  }

  stop() {
    // Save position before stopping
    this._saveCurrentPosition();
    this._stopPositionSave();
    this._clearSubtitles();
    this._closeSubtitleMenu();

    if (this._manifestTimeout) {
      clearTimeout(this._manifestTimeout);
      this._manifestTimeout = null;
    }
    this._stopSeekUpdate();
    this._clearFsHideTimer();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.video.removeAttribute('src');
    this.video.load();
    this.stopEpgRefresh();
  }

  close() {
    if (document.fullscreenElement) {
      document
        .exitFullscreen()
        .then(() => this._doClose())
        .catch(() => this._doClose());
    } else {
      this._doClose();
    }
  }

  _doClose() {
    this.stop();
    this.currentChannel = null;
    this.el.classList.add('hidden');
    document.querySelector('.app-container').classList.remove('player-open');
    M3U.dom.dispatch('player-closed');
  }

  togglePlayPause() {
    if (this.video.paused) {
      this.video.play().catch(() => {});
    } else {
      this.video.pause();
    }
    this.updatePlayPauseIcon();
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    this.updateVolumeIcon();
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.videoContainer.requestFullscreen().catch(() => {});
    }
  }

  async togglePip() {
    if (!document.pictureInPictureEnabled) {
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (this.video.readyState >= 2) {
        await this.video.requestPictureInPicture();
      }
    } catch {
      // PiP failed, ignore
    }
  }

  updatePlayPauseIcon() {
    if (!this.playPauseBtn) {
      return;
    }
    this.playPauseBtn.innerHTML = M3U.dom.svgIcon(
      this.video.paused ? M3U.icons.play : M3U.icons.pause
    );
  }

  updateVolumeIcon() {
    if (!this.muteBtn) {
      return;
    }
    this.muteBtn.innerHTML = M3U.dom.svgIcon(
      this.video.muted ? M3U.icons.volumeX : M3U.icons.volume2
    );
    window.electronAPI.updateSettings({ volume: this.video.volume });
  }

  showError(msg) {
    this.errorOverlay.classList.remove('hidden');
    this.errorOverlay.querySelector('.error-text').textContent = msg;
  }

  hideError() {
    this.errorOverlay.classList.add('hidden');
  }

  updateChannelInfo(ch) {
    const logoWrap = this.channelInfoEl.querySelector('.channel-logo-wrap');
    M3U.dom.clear(logoWrap);
    if (ch.logo) {
      const img = M3U.dom.el('img', { src: ch.logo });
      img.onerror = () => {
        img.remove();
        logoWrap.appendChild(
          M3U.dom.el('span', {
            className: 'channel-logo-fallback',
            textContent: ch.name.charAt(0).toUpperCase()
          })
        );
      };
      logoWrap.appendChild(img);
    } else {
      logoWrap.appendChild(
        M3U.dom.el('span', {
          className: 'channel-logo-fallback',
          textContent: ch.name.charAt(0).toUpperCase()
        })
      );
    }

    this.channelInfoEl.querySelector('.name').textContent = ch.name;
    this.channelInfoEl.querySelector('.group').textContent = ch.group;
  }

  updateEpg() {
    if (!this.currentChannel) {
      return;
    }
    const now = this.epgService.getCurrentProgram(this.currentChannel.tvgId);
    const next = this.epgService.getNextProgram(this.currentChannel.tvgId);

    const nowEl = this.epgBar.querySelector('.player-epg-now');
    const nextEl = this.epgBar.querySelector('.player-epg-next');
    const progressEl = this.epgBar.querySelector('.epg-progress-fill');

    if (now) {
      nowEl.querySelector('.epg-title').textContent = now.title;
      nowEl.querySelector('.epg-time').textContent =
        `${M3U.fmt.time(now.start)} - ${M3U.fmt.time(now.stop)}`;
      if (progressEl) {
        progressEl.style.width = `${M3U.fmt.epgProgress(now.start, now.stop)}%`;
      }
      nowEl.classList.remove('hidden');
    } else {
      nowEl.classList.add('hidden');
    }

    if (next) {
      nextEl.querySelector('.epg-title').textContent = next.title;
      nextEl.querySelector('.epg-time').textContent = M3U.fmt.time(next.start);
      nextEl.classList.remove('hidden');
    } else {
      nextEl.classList.add('hidden');
    }
  }

  startEpgRefresh() {
    this.stopEpgRefresh();
    this.epgInterval = setInterval(() => this.updateEpg(), 60000);
  }

  stopEpgRefresh() {
    if (this.epgInterval) {
      clearInterval(this.epgInterval);
      this.epgInterval = null;
    }
  }

  /* ── Subtitles ─────────────────────────────────────────── */

  setupSubtitles() {
    this.subtitleFileInput = document.getElementById('subtitle-file-input');
    this._subtitlesEnabled = false;
    this._subtitleMenu = null;

    this._onSubtitleMenuClickOutside = (e) => {
      if (
        this._subtitleMenu &&
        !this._subtitleMenu.contains(e.target) &&
        e.target !== this.subtitlesBtn &&
        !this.subtitlesBtn?.contains(e.target)
      ) {
        this._closeSubtitleMenu();
      }
    };

    this.subtitleFileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.loadSubtitleFile(file);
      }
      e.target.value = '';
    });
  }

  showSubtitlesMenu() {
    if (this._subtitleMenu) {
      this._closeSubtitleMenu();
      return;
    }

    const menu = document.createElement('div');
    menu.className = 'subtitle-menu';

    // Header
    const header = document.createElement('div');
    header.className = 'subtitle-menu-header';
    header.textContent = 'Subtitles';
    menu.appendChild(header);

    // "Off" option
    const offItem = document.createElement('div');
    offItem.className = 'subtitle-menu-item' + (!this._subtitlesEnabled ? ' active' : '');
    offItem.textContent = 'Off';
    offItem.addEventListener('click', () => {
      this.disableSubtitles();
      this._closeSubtitleMenu();
    });
    menu.appendChild(offItem);

    // Existing tracks
    const tracks = this._getSubtitleTracks();
    tracks.forEach((track, i) => {
      const item = document.createElement('div');
      item.className = 'subtitle-menu-item' + (track.mode === 'showing' ? ' active' : '');
      item.textContent = track.label || track.language || `Track ${i + 1}`;
      item.addEventListener('click', () => {
        this.selectSubtitleTrack(i);
        this._closeSubtitleMenu();
      });
      menu.appendChild(item);
    });

    // Auto-search options (VOD/Series only)
    const isVod = this.currentChannel && this.currentChannel.type !== 'live';
    if (isVod) {
      const sep1 = document.createElement('div');
      sep1.className = 'subtitle-menu-sep';
      menu.appendChild(sep1);

      const searchFr = document.createElement('div');
      searchFr.className = 'subtitle-menu-item subtitle-search';
      searchFr.textContent = '\uD83D\uDD0D Rechercher (Fran\u00e7ais)';
      searchFr.addEventListener('click', () => {
        this._closeSubtitleMenu();
        this.searchAndLoadSubtitles('fr');
      });
      menu.appendChild(searchFr);

      const searchEn = document.createElement('div');
      searchEn.className = 'subtitle-menu-item subtitle-search';
      searchEn.textContent = '\uD83D\uDD0D Search (English)';
      searchEn.addEventListener('click', () => {
        this._closeSubtitleMenu();
        this.searchAndLoadSubtitles('en');
      });
      menu.appendChild(searchEn);
    }

    // Load file option
    const sep2 = document.createElement('div');
    sep2.className = 'subtitle-menu-sep';
    menu.appendChild(sep2);

    const loadItem = document.createElement('div');
    loadItem.className = 'subtitle-menu-item subtitle-load';
    loadItem.textContent = 'Load subtitle file...';
    loadItem.addEventListener('click', () => {
      this._closeSubtitleMenu();
      this.subtitleFileInput?.click();
    });
    menu.appendChild(loadItem);

    this.videoContainer.appendChild(menu);
    this._subtitleMenu = menu;

    setTimeout(() => {
      document.addEventListener('click', this._onSubtitleMenuClickOutside);
    }, 0);
  }

  _closeSubtitleMenu() {
    if (this._subtitleMenu) {
      this._subtitleMenu.remove();
      this._subtitleMenu = null;
    }
    document.removeEventListener('click', this._onSubtitleMenuClickOutside);
  }

  _getSubtitleTracks() {
    const tracks = [];
    for (let i = 0; i < this.video.textTracks.length; i++) {
      const t = this.video.textTracks[i];
      if (t.kind === 'subtitles' || t.kind === 'captions') {
        tracks.push(t);
      }
    }
    return tracks;
  }

  selectSubtitleTrack(index) {
    const tracks = this._getSubtitleTracks();
    tracks.forEach((t, i) => {
      t.mode = i === index ? 'showing' : 'hidden';
    });
    this._subtitlesEnabled = true;
    this.subtitlesBtn?.classList.add('active');
  }

  disableSubtitles() {
    const tracks = this._getSubtitleTracks();
    tracks.forEach((t) => {
      t.mode = 'hidden';
    });
    this._subtitlesEnabled = false;
    this.subtitlesBtn?.classList.remove('active');
  }

  toggleSubtitles() {
    const tracks = this._getSubtitleTracks();
    if (tracks.length === 0) {
      this.subtitleFileInput?.click();
      return;
    }
    if (this._subtitlesEnabled) {
      this.disableSubtitles();
      M3U.toast?.show('Subtitles off', 'info');
    } else {
      this.selectSubtitleTrack(tracks.length - 1);
      const label = tracks[tracks.length - 1].label || 'Subtitles';
      M3U.toast?.show(`${label} enabled`, 'info');
    }
  }

  loadSubtitleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let content = e.target.result;
        const isSrt = file.name.toLowerCase().endsWith('.srt');
        if (isSrt) {
          content = this._srtToVtt(content);
        } else if (!content.trim().startsWith('WEBVTT')) {
          // Try converting as SRT anyway
          content = this._srtToVtt(content);
        }
        this._addSubtitleTrack(content, file.name);
        M3U.toast?.show(`Loaded: ${file.name}`, 'success');
      } catch {
        M3U.toast?.show('Failed to load subtitle file', 'error');
      }
    };
    reader.readAsText(file);
  }

  _srtToVtt(srt) {
    let vtt = 'WEBVTT\n\n';
    const blocks = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;

      // Find the timestamp line
      let tsIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          tsIdx = i;
          break;
        }
      }
      if (tsIdx === -1) continue;

      // Convert commas to dots in timestamps
      const timestamp = lines[tsIdx].replace(/,/g, '.');
      const text = lines.slice(tsIdx + 1).join('\n');
      if (text.trim()) {
        vtt += `${timestamp}\n${text}\n\n`;
      }
    }
    return vtt;
  }

  _addSubtitleTrack(vttContent, label) {
    const blob = new Blob([vttContent], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = label || 'Subtitles';
    track.srclang = 'und';
    track.src = url;
    track.dataset.loaded = 'true';
    this.video.appendChild(track);

    // Enable this track
    const tracks = this._getSubtitleTracks();
    this.selectSubtitleTrack(tracks.length - 1);
  }

  _clearSubtitles() {
    // Remove all loaded tracks
    const loadedTracks = this.video.querySelectorAll('track[data-loaded]');
    loadedTracks.forEach((t) => {
      if (t.src && t.src.startsWith('blob:')) {
        URL.revokeObjectURL(t.src);
      }
      t.remove();
    });
    this._subtitlesEnabled = false;
    this.subtitlesBtn?.classList.remove('active');
    this.subtitlesBtn?.classList.remove('has-tracks');
  }

  async searchAndLoadSubtitles(language) {
    if (!this.currentChannel) return;

    const langLabel = language === 'fr' ? 'fran\u00e7ais' : 'English';
    M3U.toast?.show(`Searching subtitles (${langLabel})...`, 'info');

    try {
      const result = await window.electronAPI.fetchSubtitle(
        this.currentChannel.name,
        language,
        this.currentChannel.type || 'movie'
      );

      if (!result || !result.content) {
        M3U.toast?.show('No subtitles found', 'warning');
        return;
      }

      const vtt = this._srtToVtt(result.content);
      this._addSubtitleTrack(vtt, `${result.fileName || langLabel}`);
      M3U.toast?.show(`Subtitles loaded (${langLabel})`, 'success');
    } catch {
      M3U.toast?.show('Subtitle search failed', 'error');
    }
  }
};
