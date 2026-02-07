window.M3U = window.M3U || {};

M3U.PlayerPanel = class {
  constructor(el, { epgService }) {
    this.el = el;
    this.epgService = epgService;
    this.video = el.querySelector('video');
    this.hls = null;
    this.currentChannel = null;
    this.epgInterval = null;

    this.channelNameEl = el.querySelector('.player-channel-name');
    this.errorOverlay = el.querySelector('.player-error-overlay');
    this.epgBar = el.querySelector('.player-epg-bar');
    this.controlsEl = el.querySelector('.player-controls');
    this.channelInfoEl = el.querySelector('.player-channel-info');

    this.setupControls();
    this.setupKeyboard();
  }

  setupControls() {
    this.playPauseBtn = this.controlsEl.querySelector('.ctrl-play-pause');
    this.muteBtn = this.controlsEl.querySelector('.ctrl-mute');
    this.volumeSlider = this.controlsEl.querySelector('.volume-slider');
    this.fullscreenBtn = this.controlsEl.querySelector('.ctrl-fullscreen');
    const closeBtn = this.el.querySelector('.player-close-btn');

    this.playPauseBtn?.addEventListener('click', () => this.togglePlayPause());
    this.muteBtn?.addEventListener('click', () => this.toggleMute());
    this.volumeSlider?.addEventListener('input', (e) => {
      this.video.volume = parseFloat(e.target.value);
      this.video.muted = false;
      this.updateVolumeIcon();
    });
    this.fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
    closeBtn?.addEventListener('click', () => this.close());

    // Sync initial volume
    window.electronAPI.getSettings().then(s => {
      this.video.volume = s.volume || 0.8;
      if (this.volumeSlider) this.volumeSlider.value = this.video.volume;
    });
  }

  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (!this.currentChannel) return;
      if (e.target.tagName === 'INPUT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.togglePlayPause();
          break;
        case 'm':
        case 'M':
          this.toggleMute();
          break;
        case 'f':
        case 'F':
          this.toggleFullscreen();
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

  play(channel) {
    this.stop();
    this.currentChannel = channel;
    this.channelNameEl.textContent = channel.name;
    this.hideError();
    this.el.classList.remove('hidden');
    document.querySelector('.app-container').classList.add('player-open');

    const url = channel.url;
    const isHls = url.includes('.m3u8') || url.includes('m3u8');

    if (isHls && Hls.isSupported()) {
      this.hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        enableWorker: true
      });
      this.hls.loadSource(url);
      this.hls.attachMedia(this.video);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.video.play().catch(() => {});
      });
      this.hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setTimeout(() => {
                if (this.hls) this.hls.startLoad();
              }, 3000);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              if (this.hls) this.hls.recoverMediaError();
              break;
            default:
              this.showError('Stream unavailable. Please try another channel.');
              break;
          }
        }
      });

      // Timeout if no manifest parsed
      this._manifestTimeout = setTimeout(() => {
        if (this.hls && !this.video.readyState) {
          this.showError('Stream timed out. The channel may be offline.');
        }
      }, 15000);
    } else {
      this.video.src = url;
      this.video.play().catch(() => {
        this.showError('Unable to play this stream.');
      });
    }

    this.updateChannelInfo(channel);
    this.updateEpg();
    this.startEpgRefresh();
    this.updatePlayPauseIcon();
  }

  stop() {
    if (this._manifestTimeout) {
      clearTimeout(this._manifestTimeout);
      this._manifestTimeout = null;
    }
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.video.removeAttribute('src');
    this.video.load();
    this.stopEpgRefresh();
  }

  close() {
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
    const container = this.el.querySelector('.player-video-container');
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen().catch(() => {});
    }
  }

  updatePlayPauseIcon() {
    if (!this.playPauseBtn) return;
    this.playPauseBtn.innerHTML = M3U.dom.svgIcon(
      this.video.paused ? M3U.icons.play : M3U.icons.pause
    );
  }

  updateVolumeIcon() {
    if (!this.muteBtn) return;
    this.muteBtn.innerHTML = M3U.dom.svgIcon(
      this.video.muted ? M3U.icons.volumeX : M3U.icons.volume2
    );
    // Save volume
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
        logoWrap.appendChild(M3U.dom.el('span', {
          className: 'channel-logo-fallback',
          textContent: ch.name.charAt(0).toUpperCase()
        }));
      };
      logoWrap.appendChild(img);
    } else {
      logoWrap.appendChild(M3U.dom.el('span', {
        className: 'channel-logo-fallback',
        textContent: ch.name.charAt(0).toUpperCase()
      }));
    }

    this.channelInfoEl.querySelector('.name').textContent = ch.name;
    this.channelInfoEl.querySelector('.group').textContent = ch.group;
  }

  updateEpg() {
    if (!this.currentChannel) return;
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
};
