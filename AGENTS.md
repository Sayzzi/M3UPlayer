# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

M3U Player is an Electron-based IPTV player supporting M3U playlists and Xtream Codes API. Built with vanilla HTML/CSS/JS (no frontend framework), hls.js for streaming, and electron-conf for storage.

## Commands

```bash
npm install       # Install dependencies (copies hls.js to vendor/)
npm start         # Run the application in development
npm run build     # Build Windows installer (NSIS) to dist/
npm run build:dir # Build unpacked app to dist/
npm run lint      # Run ESLint
npm run lint:fix  # Run ESLint with auto-fix
npm run format    # Format code with Prettier
```

## Architecture

### Process Model (Electron IPC)

```
Main Process                    Renderer Process
(main.js)                       (src/renderer/)
    │                                │
    ├── src/main/                    │
    │   ├── ipc-handlers.js ◄────────┼──── preload.js (contextBridge)
    │   ├── store.js                 │          │
    │   ├── m3u-parser.js            │          ▼
    │   ├── epg-parser.js            │     window.electronAPI.*
    │   ├── playlist-fetcher.js      │
    │   └── xtream-client.js         │
```

- **preload.js**: Exposes `window.electronAPI` via contextBridge; all main process communication goes through defined IPC channels
- **ipc-handlers.js**: Central IPC handler registry; add new handlers here
- **store.js**: Persistent storage using electron-conf; manages playlists, favorites, history, settings

### Renderer Architecture

All renderer JS attaches to global `M3U` namespace (`window.M3U = window.M3U || {}`).

- **Services** (`src/renderer/js/services/`): Data layer wrapping `window.electronAPI` calls
  - PlaylistService, FavoritesService, HistoryService, EpgService
- **UI Components** (`src/renderer/js/ui/`): DOM manipulation, event dispatch via `M3U.dom.dispatch()`
  - Sidebar, ChannelGrid, PlayerPanel, ModalManager, SearchBar, Toast
- **Utils** (`src/renderer/js/utils/`): DOM helpers, formatters

Custom events flow through `M3U.dom.dispatch()` / `M3U.dom.on()` for component communication.

### Data Flow: Playlist Loading

1. User adds URL → `PlaylistService.loadFromUrl()` or `loadFromXtream()`
2. Renderer fetches M3U text (bypasses CORS via browser fetch)
3. Calls `window.electronAPI.parsePlaylist()` → main process `m3u-parser.js`
4. Returns `{ epgUrl, channels, groups }` → Sidebar/ChannelGrid update

### Xtream Codes Support

- Login and stream fetching in `src/main/xtream-client.js`
- Streams normalized to same channel format as M3U
- Credentials stored in playlist entry for re-authentication

### Security Model

- `contextIsolation: true`, `nodeIntegration: false`
- All Node.js access restricted to main process
- Renderer communicates only through whitelisted IPC methods in preload.js
