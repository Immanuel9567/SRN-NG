'use strict';

/* ════════════════════════════════════════════════════
   SIM RACING NG — admin.js
   LocalStorage-backed admin panel.
   No server required. Admins created here persist
   in localStorage until cleared.
   ════════════════════════════════════════════════════ */

/* ── STORAGE HELPERS ── */
function getAdmins() { return JSON.parse(localStorage.getItem('srn_admins') || '[]'); }
function saveAdmins(a) { localStorage.setItem('srn_admins', JSON.stringify(a)); }
function getMembers() { return JSON.parse(localStorage.getItem('srn_members') || '[]'); }
function saveMembers(m) { localStorage.setItem('srn_members', JSON.stringify(m)); }
function getMerch() {
  const stored = localStorage.getItem('srn_merch');
  if (stored) return JSON.parse(stored);
  const DEF = [
    { id: 1, name: 'Classic Logo Tee', category: 'clothing', price: 12000, badge: 'new', desc: '100% cotton. SIM Racing NG logo front, "NG" back.', sizes: ['S','M','L','XL','XXL'], image: null },
    { id: 2, name: 'Zip-Up Hoodie',    category: 'clothing', price: 22000, badge: 'new', desc: 'Heavyweight fleece. Embroidered logo.', sizes: ['S','M','L','XL'], image: null },
    { id: 3, name: 'Racing Jersey',    category: 'clothing', price: 18500, badge: '', desc: 'Breathable performance fabric.', sizes: ['S','M','L','XL','XXL'], image: null },
    { id: 4, name: 'Racing Snapback',  category: 'headwear', price: 9500,  badge: '', desc: 'Flat-brim snapback. Embroidered logo.', sizes: [], image: null },
    { id: 5, name: 'Dad Cap — NG Edition', category: 'headwear', price: 8000, badge: '', desc: 'Washed cotton, curved brim.', sizes: [], image: null },
    { id: 6, name: 'Desk Mat — NG Edition', category: 'accessories', price: 8000, badge: '', desc: '900×400mm extended mat.', sizes: [], image: null },
    { id: 7, name: 'Sticker Pack',    category: 'accessories', price: 2500, badge: '', desc: '8 die-cut vinyl stickers.', sizes: [], image: null },
    { id: 8, name: 'Neck Gaiter',     category: 'accessories', price: 5000, badge: 'limited', desc: 'Stretch polyester. All-over print.', sizes: [], image: null },
  ];
  localStorage.setItem('srn_merch', JSON.stringify(DEF));
  return DEF;
}
function saveMerch(m) { localStorage.setItem('srn_merch', JSON.stringify(m)); }
function getSession() { return JSON.parse(sessionStorage.getItem('srn_session') || 'null'); }
function setSession(u) { sessionStorage.setItem('srn_session', JSON.stringify(u)); }
function clearSession() { sessionStorage.removeItem('srn_session'); }

/* ── ONLINE TRACKING (session-level simulation) ── */
function getOnlineUsers() { return JSON.parse(sessionStorage.getItem('srn_online') || '[]'); }
function setOnline(username) {
  const list = getOnlineUsers();
  if (!list.includes(username)) list.push(username);
  sessionStorage.setItem('srn_online', JSON.stringify(list));
}
function setOffline(username) {
  const list = getOnlineUsers().filter(u => u !== username);
  sessionStorage.setItem('srn_online', JSON.stringify(list));
}
function isOnline(username) { return getOnlineUsers().includes(username); }

/* ── STATE ── */
let currentSession = null;
let editingProductId = null;
let uploadedImageData = null;
let confirmCallback = null;
let currentUserTab = 'admins';

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  // Seed a default admin if none exist
  if (!getAdmins().length) {
    saveAdmins([{ id: 1, name: 'Admin', username: 'admin', password: 'admin123', createdAt: new Date().toISOString() }]);
  }
  currentSession = getSession();
  if (currentSession) {
    setOnline(currentSession.username);
    showAdminContent();
  } else {
    document.getElementById('adminLoginGate').style.display = 'flex';
  }
});

/* ── AUTH ── */
function attemptLogin() {
  const username = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (!username || !password) { showLoginError('Please enter username and password.'); return; }

  const admins = getAdmins();
  const admin = admins.find(a => a.username.toLowerCase() === username && a.password === password);
  if (!admin) { showLoginError('Invalid username or password.'); return; }

  const session = { id: admin.id, name: admin.name, username: admin.username };
  setSession(session);
  setOnline(admin.username);
  currentSession = session;
  showAdminContent();
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg; el.style.display = 'block';
}

function adminLogout() {
  if (currentSession) setOffline(currentSession.username);
  clearSession();
  window.location.href = 'index.html';
}

function showAdminContent() {
  document.getElementById('adminLoginGate').style.display = 'none';
  document.getElementById('adminContent').style.display = 'block';
  document.getElementById('adminUserChip').textContent = currentSession.name || currentSession.username;
  renderMerchAdmin();
  renderMembersAdmin();
  updateMembersBadge();
}

// Enter key on login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('adminLoginGate')?.style.display !== 'none') {
    attemptLogin();
  }
});

/* ── TABS ── */
function switchTab(name, el) {
  document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById('tab-' + name);
  if (tab) tab.style.display = 'block';
  if (el) el.classList.add('active');
  if (name === 'members') renderMembersAdmin();
}

/* ── MERCH ADMIN ── */
function renderMerchAdmin() {
  const grid = document.getElementById('adminProductsGrid');
  if (!grid) return;
  const items = getMerch();
  if (!items.length) { grid.innerHTML = '<div style="color:var(--text-muted);font-size:14px;padding:2rem 0">No products yet. Add one above.</div>'; return; }
  grid.innerHTML = items.map(item => {
    const thumb = item.image
      ? `<img src="${item.image}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover" />`
      : `<span style="font-size:48px">${catEmoji(item.category)}</span>`;
    const badge = item.badge ? `<span class="merch-tag merch-tag--${item.badge}" style="position:absolute;top:8px;right:8px">${item.badge === 'new' ? 'New' : 'Limited'}</span>` : '';
    return `<div class="admin-product-card">
      <div class="admin-product-thumb" style="position:relative">${thumb}${badge}</div>
      <div class="admin-product-body">
        <div class="admin-product-name">${esc(item.name)}</div>
        <div class="admin-product-cat">${esc(item.category)}</div>
        <div class="admin-product-price">₦${Number(item.price).toLocaleString()}</div>
      </div>
      <div class="admin-product-actions">
        <button class="btn-edit-sm" onclick="openEditProductModal(${item.id})">✏️ Edit</button>
        <button class="btn-del-sm" onclick="confirmDeleteProduct(${item.id},'${esc(item.name)}')">🗑️ Delete</button>
      </div>
    </div>`;
  }).join('');
}

function openAddProductModal() {
  editingProductId = null;
  uploadedImageData = null;
  document.getElementById('productModalTitle').textContent = 'Add Product';
  document.getElementById('editProductId').value = '';
  document.getElementById('pName').value = '';
  document.getElementById('pCategory').value = 'clothing';
  document.getElementById('pPrice').value = '';
  document.getElementById('pBadge').value = '';
  document.getElementById('pDesc').value = '';
  document.getElementById('pSizes').value = '';
  document.getElementById('pImagePreview').style.display = 'none';
  document.getElementById('pImagePreview').src = '';
  document.getElementById('imgUploadArea').style.display = 'flex';
  document.getElementById('productFormError').style.display = 'none';
  document.getElementById('productModal').style.display = 'flex';
}

function openEditProductModal(id) {
  const item = getMerch().find(p => p.id === id);
  if (!item) return;
  editingProductId = id;
  uploadedImageData = item.image || null;
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  document.getElementById('editProductId').value = id;
  document.getElementById('pName').value = item.name;
  document.getElementById('pCategory').value = item.category;
  document.getElementById('pPrice').value = item.price;
  document.getElementById('pBadge').value = item.badge || '';
  document.getElementById('pDesc').value = item.desc || '';
  document.getElementById('pSizes').value = (item.sizes || []).join(', ');
  if (item.image) {
    document.getElementById('pImagePreview').src = item.image;
    document.getElementById('pImagePreview').style.display = 'block';
    document.getElementById('imgUploadArea').style.display = 'none';
  } else {
    document.getElementById('pImagePreview').style.display = 'none';
    document.getElementById('imgUploadArea').style.display = 'flex';
  }
  document.getElementById('productFormError').style.display = 'none';
  document.getElementById('productModal').style.display = 'flex';
}

function closeProductModal() { document.getElementById('productModal').style.display = 'none'; }
function closeProductModalOutside(e) { if (e.target === document.getElementById('productModal')) closeProductModal(); }

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showProductError('Image must be under 5MB.'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    uploadedImageData = ev.target.result;
    const preview = document.getElementById('pImagePreview');
    preview.src = uploadedImageData;
    preview.style.display = 'block';
    document.getElementById('imgUploadArea').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function saveProduct() {
  const name = document.getElementById('pName').value.trim();
  const price = parseFloat(document.getElementById('pPrice').value);
  if (!name) { showProductError('Product name is required.'); return; }
  if (!price || price <= 0) { showProductError('Please enter a valid price.'); return; }

  const items = getMerch();
  const sizesRaw = document.getElementById('pSizes').value.trim();
  const sizes = sizesRaw ? sizesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  if (editingProductId) {
    const idx = items.findIndex(p => p.id === editingProductId);
    if (idx > -1) {
      items[idx] = {
        ...items[idx],
        name,
        category: document.getElementById('pCategory').value,
        price,
        badge: document.getElementById('pBadge').value,
        desc: document.getElementById('pDesc').value.trim(),
        sizes,
        image: uploadedImageData,
      };
    }
  } else {
    const newId = items.length ? Math.max(...items.map(p => p.id)) + 1 : 1;
    items.push({
      id: newId, name,
      category: document.getElementById('pCategory').value,
      price,
      badge: document.getElementById('pBadge').value,
      desc: document.getElementById('pDesc').value.trim(),
      sizes,
      image: uploadedImageData,
    });
  }

  saveMerch(items);
  closeProductModal();
  renderMerchAdmin();
  toast(editingProductId ? 'Product updated.' : 'Product added.');
}

function showProductError(msg) {
  const el = document.getElementById('productFormError');
  el.textContent = msg; el.style.display = 'block';
}

function confirmDeleteProduct(id, name) {
  document.getElementById('confirmTitle').textContent = `Delete "${name}"?`;
  document.getElementById('confirmDesc').textContent = 'This will remove it from the store permanently.';
  document.getElementById('confirmBtn').onclick = () => { deleteProduct(id); closeConfirm(); };
  document.getElementById('confirmModal').style.display = 'flex';
}

function deleteProduct(id) {
  const items = getMerch().filter(p => p.id !== id);
  saveMerch(items);
  renderMerchAdmin();
  toast('Product deleted.');
}

function closeConfirm() { document.getElementById('confirmModal').style.display = 'none'; }

/* ── MEMBERS ADMIN ── */
function renderMembersAdmin() {
  const list = document.getElementById('adminMembersList');
  if (!list) return;
  const members = getMembers();
  updateMembersBadge();
  if (!members.length) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:14px;padding:2rem 0">No registered members yet.</div>';
    return;
  }
  list.innerHTML = members.map(m => memberRowHTML(m)).join('');
}

function filterMembers(q) {
  const members = getMembers();
  const filtered = q ? members.filter(m =>
    m.name?.toLowerCase().includes(q.toLowerCase()) ||
    m.username?.toLowerCase().includes(q.toLowerCase())
  ) : members;
  const list = document.getElementById('adminMembersList');
  if (list) list.innerHTML = filtered.length
    ? filtered.map(m => memberRowHTML(m)).join('')
    : '<div style="color:var(--text-muted);font-size:14px;padding:1rem 0">No members match your search.</div>';
}

function memberRowHTML(m) {
  const online = isOnline(m.username);
  const initials = (m.name || m.username || '?')[0].toUpperCase();
  const avatarContent = m.avatar
    ? `<img src="${m.avatar}" alt="${esc(m.name)}" />`
    : initials;
  return `<div class="member-row">
    <div class="member-avatar">${avatarContent}</div>
    <div class="member-info">
      <div class="member-name">${esc(m.name || m.username)}</div>
      <div class="member-username">@${esc(m.username)}</div>
    </div>
    <div class="member-joined">${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : ''}</div>
    <div class="member-status ${online ? 'status-online' : 'status-offline'}">
      <span class="status-dot"></span>${online ? 'Online' : 'Offline'}
    </div>
    <span class="member-role-badge role-member">Member</span>
    <button class="btn-icon danger" title="Remove member" onclick="confirmRemoveMember('${esc(m.id)}','${esc(m.name||m.username)}')">🗑️</button>
  </div>`;
}

function confirmRemoveMember(id, name) {
  document.getElementById('confirmTitle').textContent = `Remove "${name}"?`;
  document.getElementById('confirmDesc').textContent = 'This will delete their account.';
  document.getElementById('confirmBtn').onclick = () => { removeMember(id); closeConfirm(); };
  document.getElementById('confirmModal').style.display = 'flex';
}

function removeMember(id) {
  saveMembers(getMembers().filter(m => m.id !== id));
  renderMembersAdmin();
  renderUsersPopup();
  toast('Member removed.');
}

function updateMembersBadge() {
  const badge = document.getElementById('membersBadge');
  if (badge) badge.textContent = getMembers().length;
}

/* ── USERS POPUP ── */
function toggleUsersPopup() {
  const overlay = document.getElementById('usersPopupOverlay');
  const isOpen = overlay.style.display === 'flex';
  overlay.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) { renderUsersPopup(); updateOnlineCount(); }
}
function closeUsersPopupOutside(e) { if (e.target === document.getElementById('usersPopupOverlay')) toggleUsersPopup(); }

function switchUserTab(name, el) {
  currentUserTab = name;
  document.querySelectorAll('.popup-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  renderUsersPopup();
}

function renderUsersPopup() {
  const body = document.getElementById('usersPopupContent');
  if (!body) return;
  updateOnlineCount();

  if (currentUserTab === 'admins') {
    const admins = getAdmins();
    body.innerHTML = admins.map(a => {
      const online = isOnline(a.username);
      const initials = (a.name || a.username || '?')[0].toUpperCase();
      const isSelf = currentSession && currentSession.id === a.id;
      return `<div class="popup-user-row">
        <div class="member-avatar" style="width:34px;height:34px;font-size:14px">${initials}</div>
        <div class="popup-user-info">
          <div class="popup-user-name">${esc(a.name || a.username)} ${isSelf ? '<span style="font-size:10px;color:var(--text-muted)">(you)</span>' : ''}</div>
          <div class="popup-user-sub">@${esc(a.username)} · <span class="${online ? 'status-online' : 'status-offline'}" style="font-size:10px;font-weight:600">${online ? '● Online' : '○ Offline'}</span></div>
        </div>
        <div class="popup-user-actions">
          ${!isSelf ? `<button class="btn-icon danger" title="Remove admin" onclick="confirmRemoveAdmin(${a.id},'${esc(a.name||a.username)}')">🗑️</button>` : ''}
        </div>
      </div>`;
    }).join('') || '<div style="color:var(--text-muted);font-size:13px">No admins yet.</div>';
  } else {
    const members = getMembers();
    body.innerHTML = members.map(m => {
      const online = isOnline(m.username);
      const initials = (m.name || m.username || '?')[0].toUpperCase();
      return `<div class="popup-user-row">
        <div class="member-avatar" style="width:34px;height:34px;font-size:14px">${m.avatar ? `<img src="${m.avatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials}</div>
        <div class="popup-user-info">
          <div class="popup-user-name">${esc(m.name || m.username)}</div>
          <div class="popup-user-sub">@${esc(m.username)} · <span class="${online ? 'status-online' : 'status-offline'}" style="font-size:10px;font-weight:600">${online ? '● Online' : '○ Offline'}</span></div>
        </div>
        <div class="popup-user-actions">
          <button class="btn-icon danger" onclick="confirmRemoveMember('${esc(m.id)}','${esc(m.name||m.username)}')">🗑️</button>
        </div>
      </div>`;
    }).join('') || '<div style="color:var(--text-muted);font-size:13px">No members yet.</div>';
  }
}

function updateOnlineCount() {
  const allUsers = [...getAdmins().map(a => a.username), ...getMembers().map(m => m.username)];
  const onlineList = getOnlineUsers();
  const count = allUsers.filter(u => onlineList.includes(u)).length;
  const badge = document.getElementById('onlineCountBadge');
  if (badge) badge.textContent = count + ' online';
}

function confirmRemoveAdmin(id, name) {
  if (currentSession && currentSession.id === id) { toast('You cannot delete your own account.'); return; }
  document.getElementById('confirmTitle').textContent = `Remove admin "${name}"?`;
  document.getElementById('confirmDesc').textContent = 'They will lose admin access immediately.';
  document.getElementById('confirmBtn').onclick = () => {
    saveAdmins(getAdmins().filter(a => a.id !== id));
    renderUsersPopup(); closeConfirm(); toast('Admin removed.');
  };
  document.getElementById('confirmModal').style.display = 'flex';
}

/* ── CREATE ADMIN / REGISTER ── */
function showRegisterModal() {
  document.getElementById('regName').value = '';
  document.getElementById('regUsername').value = '';
  document.getElementById('regPassword').value = '';
  document.getElementById('regError').style.display = 'none';
  document.getElementById('registerModal').style.display = 'flex';
  // close users popup if open
  const up = document.getElementById('usersPopupOverlay');
  if (up) up.style.display = 'none';
  // close login gate warning if present
}
function closeRegisterModal() { document.getElementById('registerModal').style.display = 'none'; }
function closeRegisterOutside(e) { if (e.target === document.getElementById('registerModal')) closeRegisterModal(); }

function createAdmin() {
  const name = document.getElementById('regName').value.trim();
  const username = document.getElementById('regUsername').value.trim().toLowerCase().replace(/\s+/g,'');
  const password = document.getElementById('regPassword').value;
  const errEl = document.getElementById('regError');
  errEl.style.display = 'none';

  if (!username) { showRegErr('Username is required.'); return; }
  if (!/^[a-z0-9_]+$/.test(username)) { showRegErr('Username: lowercase letters, numbers, underscores only.'); return; }
  if (password.length < 6) { showRegErr('Password must be at least 6 characters.'); return; }

  const admins = getAdmins();
  if (admins.find(a => a.username === username)) { showRegErr('Username already taken.'); return; }

  const newAdmin = { id: Date.now(), name: name || username, username, password, createdAt: new Date().toISOString() };
  admins.push(newAdmin);
  saveAdmins(admins);
  closeRegisterModal();
  renderUsersPopup();
  toast(`Admin "@${username}" created.`);
}

function showRegErr(msg) {
  const el = document.getElementById('regError');
  el.textContent = msg; el.style.display = 'block';
}

/* ── TOAST ── */
function toast(msg) {
  let t = document.getElementById('adminToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'adminToast';
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:rgba(10,31,58,0.95);border:1px solid rgba(0,224,107,0.3);color:#f2f6fb;font-size:13px;padding:10px 18px;border-radius:10px;z-index:9999;opacity:0;transition:opacity 0.2s;backdrop-filter:blur(12px);max-width:280px;box-shadow:0 8px 32px rgba(0,0,0,0.5)';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

/* ── UTILS ── */
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function catEmoji(cat) {
  const map = { clothing:'👕', headwear:'🧢', accessories:'🖱️' };
  return map[cat] || '📦';
}
