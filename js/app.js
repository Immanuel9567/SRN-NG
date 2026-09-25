// General Application JavaScript for SIM Racing Nigeria

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initActivePageLinks();
  initReveal();
  initToTop();
  initEgg();
  initPalette();
  // Signed-in state in the navbar. Loaded from js/api.js, which must come first.
  if (typeof SRN !== 'undefined') {
    SRN.renderAccountState().then((user) => initHeaderChrome(user));
  }
});

// Reveal-on-scroll. Elements are opted in only when IntersectionObserver exists,
// so content is never hidden for users (or test DOMs) without it.
function initReveal() {
  if (typeof IntersectionObserver !== 'function') return;
  const targets = document.querySelectorAll('main > section, main .card');
  if (!targets.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('srn-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  targets.forEach((el, i) => {
    el.classList.add('srn-reveal');
    // A small stagger inside each parent keeps grids from moving as one block.
    el.style.transitionDelay = `${(i % 4) * 60}ms`;
    io.observe(el);
  });
}

// Back-to-top pill, parked above the bottom navbar.
function initToTop() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'srn-to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '<iconify-icon icon="line-md:arrow-up" width="18" height="18"></iconify-icon>';
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(btn);
  window.addEventListener('scroll', () => {
    btn.classList.toggle('show', window.scrollY > 600);
  }, { passive: true });
}

// Easter egg: typing "srn" anywhere drops a podium of checkered confetti.
function initEgg() {
  let buffer = '';
  document.addEventListener('keydown', (e) => {
    if (e.key && e.key.length === 1) buffer = (buffer + e.key.toLowerCase()).slice(-3);
    if (buffer !== 'srn') return;
    buffer = '';
    const colors = ['#00E676', '#22D3EE', '#FF6B1A', '#F471B5', '#FFFFFF'];
    for (let i = 0; i < 36; i++) {
      const bit = document.createElement('div');
      bit.className = 'srn-confetti';
      bit.style.left = `${Math.random() * 100}vw`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${Math.random() * 0.6}s`;
      bit.style.animationDuration = `${2 + Math.random() * 1.4}s`;
      if (i % 3 === 0) bit.style.borderRadius = '50%';
      document.body.appendChild(bit);
      setTimeout(() => bit.remove(), 4200);
    }
    if (typeof SRN !== 'undefined') SRN.toast('PODIUM MODE. See you on track.', 'success');
  });
}

// Initialize Navbar Scroll & Mobile Menu Toggle
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  const mobileToggle = document.querySelector('.mobile-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');

  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 60) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
      const isOpened = mobileMenu.classList.contains('open');
      mobileToggle.setAttribute('aria-expanded', isOpened);
      mobileToggle.innerHTML = isOpened ? `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      ` : `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      `;
    });
  }
}

// Highlight Active Nav Link based on Current Location
function initActivePageLinks() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// Helper to get URL query parameter
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

async function initHeaderChrome(user) {
  document.querySelectorAll('[data-admin-entry]').forEach((el) => {
    el.hidden = !(user && user.role === 'admin');
  });
  const bells = document.querySelectorAll('[data-notify-open]');
  if (!bells.length) return;
  if (!user) {
    bells.forEach((b) => { b.hidden = true; });
    return;
  }
  bells.forEach((b) => { b.hidden = false; });
  let data = { notifications: [], unread: 0 };
  try { data = await SRN.notifications(); } catch { /* static build */ }
  document.querySelectorAll('[data-notify-count]').forEach((dot) => {
    if (data.unread) {
      dot.hidden = false;
      dot.textContent = data.unread > 9 ? '9+' : String(data.unread);
    } else {
      dot.hidden = true;
      dot.textContent = '';
    }
  });
  bells.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openNotifyPanel(data);
    });
  });
}

function openNotifyPanel(data) {
  let panel = document.getElementById('srn-notify-panel');
  if (panel) { panel.remove(); return; }
  panel = document.createElement('div');
  panel.id = 'srn-notify-panel';
  panel.className = 'notify-panel';
  const esc = SRN.esc;
  const items = (data.notifications || []).slice(0, 12);
  panel.innerHTML = `
    <div class="notify-panel-head">Notifications</div>
    <div class="notify-panel-list">
      ${items.length ? items.map((n) => `
        <a class="notify-item${n.read ? '' : ' unread'}" href="${esc(n.href || '#')}" data-note-id="${esc(n.id)}">
          <span>${esc(n.text)}</span>
          <time>${esc((n.createdAt || '').slice(0, 10))}</time>
        </a>`).join('') : '<p class="notify-empty">Nothing yet.</p>'}
    </div>`;
  document.querySelector('.sticky-subhead')?.appendChild(panel);
  panel.querySelectorAll('[data-note-id]').forEach((a) => {
    a.addEventListener('click', () => { SRN.markNotification(a.dataset.noteId).catch(() => {}); });
  });
  const close = (ev) => {
    if (panel.contains(ev.target) || ev.target.closest('[data-notify-open]')) return;
    panel.remove();
    document.removeEventListener('click', close);
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function openSettingsPanel(user) {
  let panel = document.getElementById('srn-settings-panel');
  if (panel) { panel.remove(); return; }
  panel = document.createElement('div');
  panel.id = 'srn-settings-panel';
  panel.className = 'settings-panel';
  const esc = SRN.esc;
  const avatar = esc(user.avatar || 'media/placeholder.png');
  panel.innerHTML = `
    <div class="settings-head">
      <img class="nav-avatar" src="${avatar}" alt="">
      <div>
        <strong>${esc(user.username)}</strong>
        <span>${esc(user.role)}</span>
      </div>
    </div>
    <label class="settings-photo">Change photo
      <input type="file" accept="image/png,image/jpeg,image/webp" data-settings-photo>
    </label>
    <a href="account.html">Account settings</a>
    ${user.memberId ? `<a href="member-profile.html?id=${esc(user.memberId)}">Public profile</a>` : ''}
    ${user.role === 'admin' ? '<a href="admin.html">Admin panel</a>' : ''}
    <button type="button" data-logout>Sign out</button>`;
  document.body.appendChild(panel);
  panel.querySelector('[data-logout]').addEventListener('click', async () => {
    await SRN.logout();
    SRN.toast('Signed out.', 'info');
    setTimeout(() => location.reload(), 400);
  });
  panel.querySelector('[data-settings-photo]').addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    try {
      const out = await SRN.updateProfile({ photo: dataUrl });
      panel.querySelector('.nav-avatar').src = out.member.avatar;
      document.querySelectorAll('.nav-avatar').forEach((img) => { img.src = out.member.avatar; });
      SRN.toast('Photo saved.', 'success');
    } catch (err) {
      SRN.toast(err.message, 'error');
    }
  });
  const close = (ev) => {
    if (panel.contains(ev.target) || ev.target.closest('[data-settings-open]')) return;
    panel.remove();
    document.removeEventListener('click', close);
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

// ---- search palette (Ctrl+K or /) -----------------------------------------
// One overlay for the whole site: static pages plus live news, members, rigs,
// merch and games. Data is fetched on first open and cached. Everything is
// escaped through SRN.esc because every collection holds user-authored text.

const SRN_PALETTE_PAGES = [
  { label: 'Home', href: 'index.html', group: 'Pages' },
  { label: 'Gallery', href: 'gallery.html', group: 'Pages' },
  { label: 'Activities', href: 'activities.html', group: 'Pages' },
  { label: 'News', href: 'news.html', group: 'Pages' },
  { label: 'Members', href: 'members.html', group: 'Pages' },
  { label: 'Sim Rigs', href: 'sim-rigs.html', group: 'Pages' },
  { label: 'Media', href: 'media.html', group: 'Pages' },
  { label: 'Shop', href: 'shop.html', group: 'Pages' },
  { label: 'About', href: 'about.html', group: 'Pages' },
  { label: 'Contact', href: 'contact.html', group: 'Pages' },
  { label: 'My Account', href: 'account.html', group: 'Pages' },
];

function initPalette() {
  let paletteData = null;
  let overlay = null;
  let input = null;
  let list = null;
  let activeIndex = 0;
  let visible = [];

  async function loadData() {
    if (paletteData) return paletteData;
    const entries = [...SRN_PALETTE_PAGES];
    const safe = (p, map) => p.catch(() => []).then((rows) => rows.forEach((r) => entries.push(map(r))));
    await Promise.all([
      safe(SRN.news().then((d) => d.articles || []), (a) => ({
        label: a.title, sub: a.tag || 'News', href: `news-article.html?slug=${encodeURIComponent(a.slug)}`, group: 'News' })),
      safe(SRN.members().then((d) => d.members || []), (m) => ({
        label: m.name, sub: [m.rank, m.city].filter(Boolean).join(' · ') || 'Member', href: `member-profile.html?id=${encodeURIComponent(m.id)}`, group: 'Members' })),
      safe(SRN.rigs().then((d) => d.rigs || []), (r) => ({
        label: r.name, sub: [r.owner, r.city].filter(Boolean).join(' · ') || 'Rig', href: 'sim-rigs.html', group: 'Rigs' })),
      safe(SRN.merch().then((d) => d.merch || []), (i) => ({
        label: i.name, sub: i.category || 'Shop', href: 'shop.html', group: 'Shop' })),
      safe(SRN.games().then((d) => d.games || []), (g) => ({
        label: g.name, sub: g.genre || 'Game', href: 'activities.html', group: 'Games' })),
    ]);
    paletteData = entries;
    return entries;
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'srn-palette-overlay';
    overlay.innerHTML = `
      <div class="srn-palette" role="dialog" aria-modal="true" aria-label="Search the site">
        <div class="srn-palette-head">
          <iconify-icon icon="mdi:magnify" width="18" height="18"></iconify-icon>
          <input type="text" class="srn-palette-input" placeholder="Search news, members, rigs, shop..." aria-label="Search query" />
          <kbd>ESC</kbd>
        </div>
        <div class="srn-palette-list"></div>
      </div>`;
    document.body.appendChild(overlay);
    input = overlay.querySelector('input');
    list = overlay.querySelector('.srn-palette-list');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (visible[activeIndex]) go(visible[activeIndex]); }
    });
  }

  function render(query) {
    const q = (query || '').trim().toLowerCase();
    const all = paletteData || [];
    const scored = [];
    for (const entry of all) {
      const hay = `${entry.label} ${entry.sub || ''}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      scored.push({ entry, rank: entry.label.toLowerCase().startsWith(q) ? 0 : 1 });
    }
    scored.sort((a, b) => a.rank - b.rank);
    const groups = new Map();
    for (const { entry } of scored) {
      if (!groups.has(entry.group)) groups.set(entry.group, []);
      groups.get(entry.group).push(entry);
    }
    visible = [];
    const esc = SRN.esc;
    // Highlight the matched slice. The pieces are escaped individually, so the
    // mark tag is the only markup that ever reaches innerHTML unescaped.
    const mark = (text) => {
      if (!q) return esc(text);
      const i = text.toLowerCase().indexOf(q);
      if (i === -1) return esc(text);
      return `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
    };
    let html = '';
    for (const [group, items] of groups) {
      html += `<div class="srn-palette-group">${esc(group)}</div>`;
      for (const entry of items.slice(0, 6)) {
        const idx = visible.length;
        html += `
          <button type="button" class="srn-palette-item${idx === activeIndex ? ' active' : ''}" data-idx="${idx}">
            <span class="srn-palette-label">${mark(entry.label)}</span>
            <span class="srn-palette-sub">${esc(entry.sub || '')}</span>
          </button>`;
        visible.push(entry);
      }
    }
    list.innerHTML = html || '<p class="srn-palette-empty">Nothing matches. Try a driver, track or game.</p>';
    list.querySelectorAll('[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => go(visible[Number(btn.dataset.idx)]));
      btn.addEventListener('mousemove', () => {
        const idx = Number(btn.dataset.idx);
        if (idx !== activeIndex) { activeIndex = idx; paint(); }
      });
    });
    activeIndex = 0;
    paint();
  }

  function paint() {
    list.querySelectorAll('.srn-palette-item').forEach((el) => {
      el.classList.toggle('active', Number(el.dataset.idx) === activeIndex);
    });
    const current = list.querySelector('.srn-palette-item.active');
    if (current) current.scrollIntoView({ block: 'nearest' });
  }

  function move(delta) {
    if (!visible.length) return;
    activeIndex = (activeIndex + delta + visible.length) % visible.length;
    paint();
  }

  function go(entry) {
    close();
    if (entry && entry.href) window.location.href = entry.href;
  }

  function open() {
    if (overlay) { input.focus(); return; }
    build();
    render('');
    overlay.classList.add('open');
    input.focus();
    loadData().then(() => { if (overlay) render(input.value); });
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
  }

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open();
      return;
    }
    if (e.key === '/' && !typing) {
      e.preventDefault();
      open();
      return;
    }
    if (e.key === 'Escape') close();
  });

  document.querySelectorAll('[data-palette-open]').forEach((btn) => {
    btn.addEventListener('click', open);
  });
}

// ---- liquid nav: icons, sliding pill, mouse glare ---------------------------
// The reference is Transsion Hub's floating glass nav: a spring-eased pill that
// glides behind the hovered/active link and a light cone that follows the
// pointer. Same behaviour here, wrapped in SRN's dark glass and green accents.

const SRN_NAV_ICONS = {
  'index.html': 'line-md:home',
  'gallery.html': 'line-md:image',
  'activities.html': 'mdi:gamepad-variant',
  'news.html': 'line-md:document',
  'members.html': 'line-md:account',
  'sim-rigs.html': 'mdi:steering',
  'media.html': 'line-md:play',
  'shop.html': 'line-md:cart',
  'about.html': 'line-md:information',
};

const SRN_NAV_PILL_TRANSITION =
  'transform 0.5s cubic-bezier(0.34, 1.2, 0.64, 1), width 0.5s cubic-bezier(0.34, 1.2, 0.64, 1)';

function initNavIcons(scope) {
  scope.querySelectorAll('.nav-link, .mobile-nav-link').forEach((link) => {
    if (link.querySelector('iconify-icon')) return;
    const name = SRN_NAV_ICONS[link.getAttribute('href')];
    if (!name) return;
    const icon = document.createElement('iconify-icon');
    icon.setAttribute('icon', name);
    icon.setAttribute('width', '15');
    icon.setAttribute('height', '15');
    link.insertBefore(icon, link.firstChild);
  });
}

function initNavLiquid() {
  const links = document.querySelector('.navbar-links');
  const navbar = document.querySelector('.navbar');
  if (!links || !navbar) return;

  // Sliding pill.
  const pill = document.createElement('span');
  pill.className = 'srn-nav-pill';
  links.insertBefore(pill, links.firstChild);

  function position(target, animate) {
    if (!target) return;
    pill.style.transition = animate ? SRN_NAV_PILL_TRANSITION : 'none';
    pill.style.width = `${target.offsetWidth}px`;
    pill.style.transform = `translateX(${target.offsetLeft}px)`;
    if (!animate) void pill.offsetWidth; // reflow so the next move springs
  }

  const active = () => links.querySelector('.nav-link.active');
  // The pill only moves when a link is clicked, never on hover.
  links.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => position(link, true));
  });

  const settle = () => position(active(), false);
  settle();
  window.addEventListener('resize', settle);
  window.addEventListener('load', settle);

  // Mouse-following glare across the whole pill.
  const glare = document.createElement('span');
  glare.className = 'srn-nav-glare';
  navbar.appendChild(glare);
  navbar.addEventListener('mousemove', (e) => {
    const rect = navbar.getBoundingClientRect();
    glare.style.setProperty('--x', `${e.clientX - rect.left}px`);
    glare.style.setProperty('--y', `${e.clientY - rect.top}px`);
  });
}

// Decorate the desktop bar, the mobile drawer, then layer the liquid effects.
(function () {
  const boot = () => {
    document.querySelectorAll('.navbar-links, .mobile-menu').forEach(initNavIcons);
    initNavLiquid();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
