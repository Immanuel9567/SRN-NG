// Local stand-in for the Iconify web component (icones.js.org names).
// Tests and the sandbox cannot load code.iconify.design, so the glyphs live here.
// Same tag and `icon` attribute as https://iconify.design/docs/iconify-icon/

const SRN_ICONIFY = {
  'line-md:sunny':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  'line-md:moon':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  'mdi:monitor':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  'mdi:gamepad-variant':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="10" rx="3"/><path d="M8 12h.01M16 10v4M14 12h4"/></svg>',
  'line-md:account':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 19c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg>',
  'line-md:calendar':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  'line-md:document':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 3h8l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15 3v5h5M9 13h6M9 17h4"/></svg>',
  'line-md:map-marker':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/></svg>',
  'line-md:close':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

class IconifyIconEl extends HTMLElement {
  connectedCallback() { this.render(); }
  static get observedAttributes() { return ['icon', 'width', 'height']; }
  attributeChangedCallback() { this.render(); }
  render() {
    const name = this.getAttribute('icon') || '';
    const w = this.getAttribute('width') || '1em';
    const h = this.getAttribute('height') || w;
    const svg = SRN_ICONIFY[name] || SRN_ICONIFY['line-md:close'];
    this.innerHTML = svg;
    const el = this.querySelector('svg');
    if (el) {
      el.setAttribute('width', w);
      el.setAttribute('height', h);
      el.setAttribute('aria-hidden', 'true');
    }
  }
}

if (!customElements.get('iconify-icon')) {
  customElements.define('iconify-icon', IconifyIconEl);
}
