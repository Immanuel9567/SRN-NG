'use strict';

/* ── NAV TOGGLE ── */
function toggleMenu() {
  const nav = document.getElementById('navLinks');
  if (nav) nav.classList.toggle('active');
}
document.addEventListener('click', e => {
  const nav = document.getElementById('navLinks');
  const ham = document.querySelector('.hamburger');
  if (nav && ham && nav.classList.contains('active') && !nav.contains(e.target) && !ham.contains(e.target)) {
    nav.classList.remove('active');
  }
});

/* ── ADMIN LINK VISIBILITY ── */
document.addEventListener('DOMContentLoaded', () => {
  const session = getSession();
  const link = document.getElementById('adminNavLink');
  if (link && session) link.style.display = '';
});

/* ── AUTH HELPERS (shared with admin.js) ── */
function getAdmins() {
  return JSON.parse(localStorage.getItem('srn_admins') || '[]');
}
function getSession() {
  return JSON.parse(sessionStorage.getItem('srn_session') || 'null');
}
function setSession(user) {
  sessionStorage.setItem('srn_session', JSON.stringify(user));
}
function clearSession() {
  sessionStorage.removeItem('srn_session');
}

/* ── MERCH DATA (shared store) ── */
const DEFAULT_MERCH = [
  { id: 1, name: 'Classic Logo Tee', category: 'clothing', price: 12000, badge: 'new', desc: '100% cotton. SIM Racing NG logo front, "NG" back. Available in black and white.', sizes: ['S','M','L','XL','XXL'], image: null },
  { id: 2, name: 'Zip-Up Hoodie',    category: 'clothing', price: 22000, badge: 'new', desc: 'Heavyweight fleece. Embroidered logo. Front zip, kangaroo pockets.', sizes: ['S','M','L','XL'], image: null },
  { id: 3, name: 'Racing Jersey',    category: 'clothing', price: 18500, badge: '', desc: 'Breathable performance fabric. Sublimated print. Number customisation available.', sizes: ['S','M','L','XL','XXL'], image: null },
  { id: 4, name: 'Racing Snapback',  category: 'headwear', price: 9500,  badge: '', desc: 'Flat-brim snapback. Embroidered logo. One size fits most.', sizes: [], image: null },
  { id: 5, name: 'Dad Cap — NG Edition', category: 'headwear', price: 8000, badge: '', desc: 'Washed cotton, curved brim, adjustable strap.', sizes: [], image: null },
  { id: 6, name: 'Desk Mat — NG Edition', category: 'accessories', price: 8000, badge: '', desc: '900×400mm extended mat. Non-slip rubber base.', sizes: [], image: null },
  { id: 7, name: 'Sticker Pack',    category: 'accessories', price: 2500, badge: '', desc: '8 die-cut vinyl stickers. Waterproof.', sizes: [], image: null },
  { id: 8, name: 'Neck Gaiter',     category: 'accessories', price: 5000, badge: 'limited', desc: 'Stretch polyester. All-over print.', sizes: [], image: null },
];

function getMerch() {
  const stored = localStorage.getItem('srn_merch');
  if (stored) return JSON.parse(stored);
  localStorage.setItem('srn_merch', JSON.stringify(DEFAULT_MERCH));
  return DEFAULT_MERCH;
}

function fmtPrice(n) {
  return '₦' + Number(n).toLocaleString();
}

function buildMerchCard(item, isPreview = false) {
  const thumb = item.image
    ? `<img src="${item.image}" alt="${item.name}" />`
    : `<div class="merch-icon">${categoryEmoji(item.category)}</div>`;
  const badge = item.badge
    ? `<span class="merch-tag merch-tag--${item.badge}">${item.badge === 'new' ? 'New' : 'Limited'}</span>` : '';

  if (isPreview) {
    return `<div class="merch-card">
      <div class="merch-thumb">${thumb}${badge}</div>
      <div class="merch-body">
        <h3 class="merch-name">${item.name}</h3>
        <div class="merch-foot">
          <span class="merch-price">${fmtPrice(item.price)}</span>
          <button class="merch-add" onclick="cartFeedback(this)">+ Cart</button>
        </div>
      </div>
    </div>`;
  }

  const sizes = item.sizes && item.sizes.length
    ? `<div class="merch-sizes">${item.sizes.map((s,i) => `<span class="size-chip${i===0?' active':''}" onclick="selectSize(this)">${s}</span>`).join('')}</div>` : '';

  return `<div class="merch-card merch-card--lg" data-category="${item.category}">
    <div class="merch-thumb merch-thumb--lg">${thumb}${badge}</div>
    <div class="merch-body">
      <h3 class="merch-name">${item.name}</h3>
      <p class="merch-desc">${item.desc || ''}</p>
      ${sizes}
      <div class="merch-foot${!sizes ? ' merch-foot--no-sizes' : ''}">
        <span class="merch-price">${fmtPrice(item.price)}</span>
        <button class="merch-add-lg" onclick="cartFeedback(this)">Add to Cart</button>
      </div>
    </div>
  </div>`;
}

function categoryEmoji(cat) {
  const map = { clothing: '👕', headwear: '🧢', accessories: '🖱️' };
  return map[cat] || '📦';
}

function cartFeedback(btn) {
  const orig = btn.textContent;
  btn.textContent = '✓ Added';
  btn.style.background = 'var(--green)';
  setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1800);
}

function selectSize(el) {
  el.closest('.merch-sizes').querySelectorAll('.size-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

/* ── RENDER HOMEPAGE MERCH PREVIEW ── */
function renderHomeMerch() {
  const grid = document.getElementById('homeMerchGrid');
  if (!grid) return;
  const items = getMerch().slice(0, 3);
  grid.innerHTML = items.map(i => buildMerchCard(i, true)).join('') +
    `<div class="merch-card merch-card--cta">
      <a href="merch.html" class="merch-see-all">
        <span>See all<br>products</span>
        <div class="merch-arrow">→</div>
      </a>
    </div>`;
}

/* ── RENDER MERCH PAGE ── */
function renderMerchPage() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  const items = getMerch();
  grid.innerHTML = items.map(i => buildMerchCard(i, false)).join('');
  updateFilterCount(items.length);
  initFilterTabs();
}

function initFilterTabs() {
  const tabs = document.querySelectorAll('.filter-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const filter = this.dataset.filter;
      const cards = document.querySelectorAll('[data-category]');
      let visible = 0;
      cards.forEach(card => {
        const match = filter === 'all' || card.dataset.category === filter;
        card.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      updateFilterCount(visible);
    });
  });
}

function updateFilterCount(n) {
  const el = document.getElementById('filterCount');
  if (el) el.textContent = n + (n === 1 ? ' product' : ' products');
}

/* ── SOCIALS MODAL ── */
function openSocials() {
  const m = document.getElementById('socialsModal');
  if (m) m.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeSocials() {
  const m = document.getElementById('socialsModal');
  if (m) m.style.display = 'none';
  document.body.style.overflow = '';
}
function closeSocialsOutside(e) {
  if (e.target === document.getElementById('socialsModal')) closeSocials();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSocials(); });

/* ── NOTIFY FORM ── */
function handleNotify(e) {
  e.preventDefault();
  const input = e.target.querySelector('input[type="email"]');
  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) { btn.textContent = "You're on the list!"; btn.disabled = true; btn.style.opacity = '0.7'; }
  if (input) input.value = '';
}

/* ── BOOT ── */
document.addEventListener('DOMContentLoaded', () => {
  renderHomeMerch();
  renderMerchPage();
});
