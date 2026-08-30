// Theme handling: light, dark, or match the device.
// The choice lives in localStorage as srn-theme and is applied as data-theme on <html>.
// "auto" resolves the device preference here rather than in CSS, so the stylesheet only
// ever has to define two states.

(function () {
  const KEY = 'srn-theme';
  const MODES = ['light', 'dark', 'auto'];
  // matchMedia is missing in some environments (jsdom, very old browsers).
  // Without it "auto" simply resolves to dark rather than throwing.
  const media = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;

  function stored() {
    try {
      const v = localStorage.getItem(KEY);
      return MODES.includes(v) ? v : 'auto';
    } catch {
      return 'auto';
    }
  }

  function resolve(mode) {
    if (mode === 'auto') return media && media.matches ? 'light' : 'dark';
    return mode;
  }

  function apply(mode) {
    document.documentElement.setAttribute('data-theme', resolve(mode));
    document.querySelectorAll('.theme-switch button').forEach((btn) => {
      const active = btn.dataset.theme === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function set(mode) {
    if (!MODES.includes(mode)) mode = 'auto';
    try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
    apply(mode);
  }

  function init() {
    document.querySelectorAll('.theme-switch button').forEach((btn) => {
      btn.addEventListener('click', () => set(btn.dataset.theme));
    });
    apply(stored());
  }

  // Follow the OS while the user is on "auto".
  const onChange = () => { if (stored() === 'auto') apply('auto'); };
  if (media && media.addEventListener) media.addEventListener('change', onChange);
  else if (media && media.addListener) media.addListener(onChange);

  window.SRNTheme = { get: stored, set, resolve };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
