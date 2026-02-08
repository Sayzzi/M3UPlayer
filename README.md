<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/Electron-33-47848f?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

<h1 align="center">M3U Player</h1>

<p align="center">
  <strong>A modern, lightweight IPTV player built with Electron.</strong><br>
  Load M3U playlists from any URL and stream live TV channels with a sleek dark interface.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/HLS-Streaming-e94560?style=flat-square" alt="HLS">
  <img src="https://img.shields.io/badge/EPG-Program%20Guide-e94560?style=flat-square" alt="EPG">
  <img src="https://img.shields.io/badge/Multi-Playlist-e94560?style=flat-square" alt="Multi-Playlist">
</p>

---

## Features

**Streaming**

- HLS (.m3u8) playback powered by [hls.js](https://github.com/video-dev/hls.js)
- Direct stream support (MP4, MPEG-TS, etc.)
- Auto error recovery and stream retry

**Channel Management**

- Load M3U/M3U8 playlists from remote URLs
- Channels organized by categories (group-title)
- Grid and list view modes
- Real-time search and filtering
- Channel logos with fallback initials

**Favorites & History**

- Star channels to add them to your favorites
- Automatically tracks your 50 most recently watched channels
- Persistent across sessions

**EPG (Electronic Program Guide)**

- XMLTV format support (auto-detected from `url-tvg` in playlist)
- Now/Next program display on channel cards and player
- Gzipped EPG support (.xml.gz)
- Auto-refresh every 6 hours

**Multi-Playlist**

- Save and manage multiple M3U playlist URLs
- Quick switch between playlists
- Auto-loads your last active playlist on startup

**Keyboard Shortcuts**

| Key      | Action                         |
| -------- | ------------------------------ |
| `Space`  | Play / Pause                   |
| `M`      | Mute / Unmute                  |
| `F`      | Toggle Fullscreen              |
| `Escape` | Exit Fullscreen / Close Player |

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Git](https://git-scm.com/)

### Setup

```bash
# Clone the repository
git clone https://github.com/Sayzzi/M3UPlayer.git
cd M3UPlayer

# Install dependencies
npm install

# Launch the application
npm start
```

> `hls.js` is automatically copied to the vendor folder during `npm install`.

---

## Usage

1. **Launch the app** with `npm start`
2. **Add a playlist** — on first launch, a dialog will prompt you to enter an M3U playlist URL
3. **Browse channels** — use the sidebar to navigate categories, favorites, or recent channels
4. **Search** — type in the search bar to filter channels in real-time
5. **Watch** — click any channel card to start streaming in the player panel
6. **Manage playlists** — use the folder icon in the header to add, switch, or remove playlists

---

## Project Structure

```
M3UPlayer/
├── main.js                  # Electron main process
├── preload.js               # IPC bridge (contextBridge)
├── package.json
│
├── src/main/                # Main process modules
│   ├── ipc-handlers.js      # IPC handler registry
│   ├── store.js             # Persistent storage (electron-conf)
│   ├── m3u-parser.js        # M3U playlist parser
│   ├── epg-parser.js        # XMLTV EPG parser
│   └── playlist-fetcher.js  # HTTP fetch with timeout
│
└── src/renderer/            # Renderer process (UI)
    ├── index.html           # Application shell
    ├── css/                 # Stylesheets (dark theme)
    ├── js/
    │   ├── app.js           # Bootstrap & coordination
    │   ├── ui/              # UI components (sidebar, grid, player, modals)
    │   ├── services/        # Data services (playlist, favorites, history, EPG)
    │   └── utils/           # DOM helpers & formatters
    └── vendor/              # Third-party libs (hls.js)
```

---

## Tech Stack

| Component | Technology                                                |
| --------- | --------------------------------------------------------- |
| Framework | [Electron](https://www.electronjs.org/)                   |
| Video     | [hls.js](https://github.com/video-dev/hls.js)             |
| Storage   | [electron-conf](https://github.com/nicedoc/electron-conf) |
| UI        | Vanilla HTML/CSS/JS                                       |
| Theme     | Custom dark theme with CSS variables                      |

---

## Security

- `contextIsolation: true` — renderer has no direct Node.js access
- `nodeIntegration: false` — browser context is sandboxed
- All IPC communication goes through `contextBridge` with explicit method exposure
- Content Security Policy (CSP) restricts script and resource origins

---

## License

MIT
