window.M3U = window.M3U || {};

M3U.fmt = {
  time(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  },

  truncate(str, maxLen = 40) {
    if (!str || str.length <= maxLen) return str;
    return str.substring(0, maxLen - 1) + '\u2026';
  },

  epgProgress(start, stop) {
    const now = Date.now();
    const total = stop - start;
    if (total <= 0) return 0;
    const elapsed = now - start;
    return Math.max(0, Math.min(100, (elapsed / total) * 100));
  }
};
