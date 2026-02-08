window.M3U = window.M3U || {};

M3U.Toast = class {
  constructor() {
    this.container = document.getElementById('toast-container');
  }

  show(message, type = 'info', duration = 3000) {
    const toast = M3U.dom.el('div', { className: `toast toast-${type}` }, [message]);
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-exit');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  }

  success(message) {
    this.show(message, 'success');
  }
  error(message) {
    this.show(message, 'error');
  }
  info(message) {
    this.show(message, 'info');
  }
};
