// General Application JavaScript for SIM Racing Nigeria

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initActivePageLinks();
  initReveal();
  initToTop();
  initEgg();
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
