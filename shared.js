'use strict';
/* ════════════════════════════════════════════════════════════════
   SIM RACING NG — shared.js  v4
   Roles: member | verified_racer | marketer | admin
   Storage: localStorage (browser) — images stored as base64 data URLs
   First user to sign up → auto admin
   ════════════════════════════════════════════════════════════════ */

/* ── THEME (no flash) ── */
(function(){
  document.documentElement.setAttribute('data-theme', localStorage.getItem('srn_theme') || 'dark');
})();

function getTheme(){ return localStorage.getItem('srn_theme') || 'dark'; }
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('themeBtn');
  if(btn) btn.innerHTML = t === 'dark'
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}
function toggleTheme(){
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem('srn_theme', next);
  applyTheme(next);
}

/* ── ROLES ── */
const ROLES = {
  member:         { label:'Member',         color:'#6080a0', icon:'👤' },
  verified_racer: { label:'Verified Racer', color:'#00e06b', icon:'🏎️' },
  marketer:       { label:'Marketer',       color:'#ffb800', icon:'🛍️' },
  admin:          { label:'Admin',          color:'#ff3b5c', icon:'💪' },
};
function roleInfo(r){ return ROLES[r] || ROLES.member; }
function isAdmin(s){ return s?.role === 'admin'; }
function canAddProduct(s){ return s && ['admin','marketer'].includes(s.role); }

/* ── STORAGE ── */
function getUsers()    { return JSON.parse(localStorage.getItem('srn_users')    || '[]'); }
function saveUsers(u)  { localStorage.setItem('srn_users',    JSON.stringify(u)); }
function getNews()     { return JSON.parse(localStorage.getItem('srn_news')     || '[]'); }
function saveNews(n)   { localStorage.setItem('srn_news',     JSON.stringify(n)); }
function getNewsletter(){ return JSON.parse(localStorage.getItem('srn_newsletter') || '[]'); }
function saveNewsletter(n){ localStorage.setItem('srn_newsletter', JSON.stringify(n)); }
function getActivity() { return JSON.parse(localStorage.getItem('srn_activity') || '[]'); }
function pushActivity(entry){
  const list = getActivity();
  list.unshift({...entry, ts: Date.now()});
  localStorage.setItem('srn_activity', JSON.stringify(list.slice(0, 60)));
}

/* Merch: published + pending queues */
function getMerch()    { return JSON.parse(localStorage.getItem('srn_merch')    || 'null') || _defaultMerch(); }
function getPending()  { return JSON.parse(localStorage.getItem('srn_pending')  || '[]'); }
function saveMerch(m)  { localStorage.setItem('srn_merch',   JSON.stringify(m)); }
function savePending(p){ localStorage.setItem('srn_pending', JSON.stringify(p)); }

function _defaultMerch(){
  const def = [
    {id:1,name:'Classic Logo Tee',  cat:'clothing',    price:12000,badge:'new',    desc:'100% cotton. SRN logo front, "NG" back. Available in black and white.',sizes:['S','M','L','XL','XXL'],image:null},
    {id:2,name:'Zip-Up Hoodie',     cat:'clothing',    price:22000,badge:'new',    desc:'Heavyweight fleece. Embroidered logo. Front zip, kangaroo pockets.',   sizes:['S','M','L','XL'],      image:null},
    {id:3,name:'Racing Jersey',     cat:'clothing',    price:18500,badge:'',       desc:'Breathable performance fabric. Sublimated print. Number customisation.',sizes:['S','M','L','XL','XXL'],image:null},
    {id:4,name:'Racing Snapback',   cat:'headwear',    price:9500, badge:'',       desc:'Flat-brim snapback. Embroidered logo. One size fits most.',              sizes:[],                      image:null},
    {id:5,name:'Dad Cap — NG',      cat:'headwear',    price:8000, badge:'',       desc:'Washed cotton, curved brim, adjustable strap.',                          sizes:[],                      image:null},
    {id:6,name:'Desk Mat — NG',     cat:'accessories', price:8000, badge:'',       desc:'900×400mm extended mat. Non-slip rubber base.',                          sizes:[],                      image:null},
    {id:7,name:'Sticker Pack',      cat:'accessories', price:2500, badge:'',       desc:'8 die-cut vinyl stickers. Waterproof.',                                  sizes:[],                      image:null},
    {id:8,name:'Neck Gaiter',       cat:'accessories', price:5000, badge:'limited',desc:'Stretch polyester. All-over print. Face cover or headband.',              sizes:[],                      image:null},
  ];
  localStorage.setItem('srn_merch', JSON.stringify(def));
  return def;
}

/* ── SESSION ── */
function getSession(){ return JSON.parse(sessionStorage.getItem('srn_session') || 'null'); }
function setSession(u){ sessionStorage.setItem('srn_session', JSON.stringify(u)); }
function clearSession(){ sessionStorage.removeItem('srn_session'); }

/* ── ONLINE ── */
function getOnline(){ return JSON.parse(sessionStorage.getItem('srn_online') || '[]'); }
function markOnline(uid){
  const l = getOnline(); if(!l.includes(uid)) l.push(uid);
  sessionStorage.setItem('srn_online', JSON.stringify(l));
}
function markOffline(uid){
  sessionStorage.setItem('srn_online', JSON.stringify(getOnline().filter(x=>x!==uid)));
}
function isOnline(uid){ return getOnline().includes(uid); }

/* ── UTILS ── */
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtPrice(n){ return '₦'+Number(n).toLocaleString(); }
function catEmoji(c){ return {clothing:'👕',headwear:'🧢',accessories:'🖱️'}[c]||'📦'; }
function timeAgo(ts){
  const d=Date.now()-ts,m=Math.floor(d/60000),h=Math.floor(m/60),dy=Math.floor(h/24);
  if(dy>0) return dy+'d ago'; if(h>0) return h+'h ago'; if(m>0) return m+'m ago'; return 'just now';
}
function initials(name){ return String(name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }

function avatarHTML(user, size=36){
  const sz = `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;`;
  if(user.avatar) return `<img src="${user.avatar}" style="${sz}border:2px solid var(--border-card)" alt=""/>`;
  const ri = roleInfo(user.role);
  return `<div style="${sz}background:${ri.color}22;border:2px solid ${ri.color}44;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:${Math.round(size*0.38)}px;font-weight:700;color:${ri.color}">${initials(user.displayName||user.username)}</div>`;
}
function roleBadgeHTML(role){
  const ri = roleInfo(role);
  return `<span class="role-badge" style="--rb-color:${ri.color}">${ri.icon} ${ri.label}</span>`;
}

function toast(msg, type='ok'){
  let t = document.getElementById('srnToast');
  if(!t){ t=document.createElement('div'); t.id='srnToast'; document.body.appendChild(t); }
  t.className = 'srn-toast srn-toast--'+type;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('show'), 3200);
}

/* ════════════════════════════════════════════════════════
   HEADER AUTH
   ════════════════════════════════════════════════════════ */
function updateHeaderAuth(){
  const s = getSession();
  const loginBtn    = document.getElementById('headerAuthBtn');
  const userChip    = document.getElementById('headerUserChip');
  const adminToggle = document.getElementById('adminToggle');

  if(s){
    const u = getUsers().find(x=>x.id===s.id) || s;
    if(loginBtn) loginBtn.style.display = 'none';
    if(userChip){
      userChip.style.display = 'flex';
      userChip.onclick = toggleUserPanel;
      userChip.title   = 'My Account';
      userChip.style.cursor = 'pointer';
      userChip.innerHTML = `${avatarHTML(u,26)}<span class="huc-name">${esc(u.displayName||u.username)}</span>${roleBadgeHTML(u.role)}<span class="huc-chevron">›</span>`;
    }
    if(adminToggle) adminToggle.style.display = isAdmin(s) ? 'flex' : 'none';
  } else {
    if(loginBtn)    loginBtn.style.display    = 'flex';
    if(userChip)  { userChip.style.display    = 'none'; userChip.onclick = null; }
    if(adminToggle) adminToggle.style.display = 'none';
  }
}

/* ════════════════════════════════════════════════════════
   AUTH MODAL
   ════════════════════════════════════════════════════════ */
let _authTab = 'signin';

function openAuthModal(tab){
  _authTab = tab || 'signin';
  document.getElementById('authModal')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  switchAuthTab(_authTab);
  setTimeout(()=>document.getElementById('authModal')?.querySelector('input')?.focus(), 120);
}
function closeAuthModal(){
  document.getElementById('authModal')?.classList.remove('open');
  document.body.style.overflow = '';
}
function switchAuthTab(tab){
  _authTab = tab;
  document.querySelectorAll('.auth-tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  document.getElementById('authPane_signin').style.display  = tab==='signin'  ? '' : 'none';
  document.getElementById('authPane_signup').style.display  = tab==='signup'  ? '' : 'none';
  document.getElementById('authErr_signin').style.display   = 'none';
  document.getElementById('authErr_signup').style.display   = 'none';
}

function doSignIn(){
  const username = document.getElementById('si_username').value.trim().toLowerCase();
  const password = document.getElementById('si_password').value;
  const err = document.getElementById('authErr_signin');
  err.style.display = 'none';
  if(!username||!password){ err.textContent='Enter username and password.'; err.style.display='block'; return; }
  const user = getUsers().find(u=>u.username.toLowerCase()===username && u.password===password);
  if(!user){ err.textContent='Invalid username or password.'; err.style.display='block'; return; }
  _loginSuccess(user);
}

function doSignUp(){
  const displayName = document.getElementById('su_displayName').value.trim();
  const username    = document.getElementById('su_username').value.trim().toLowerCase().replace(/\s+/g,'');
  const password    = document.getElementById('su_password').value;
  const password2   = document.getElementById('su_password2').value;
  const err = document.getElementById('authErr_signup');
  err.style.display = 'none';
  if(!displayName){ err.textContent='Display name required.'; err.style.display='block'; return; }
  if(!username){ err.textContent='Username required.'; err.style.display='block'; return; }
  if(!/^[a-z0-9_]+$/.test(username)){ err.textContent='Username: lowercase, numbers, underscores only.'; err.style.display='block'; return; }
  if(password.length<6){ err.textContent='Password must be at least 6 characters.'; err.style.display='block'; return; }
  if(password!==password2){ err.textContent='Passwords do not match.'; err.style.display='block'; return; }
  const users = getUsers();
  if(users.find(u=>u.username.toLowerCase()===username)){ err.textContent='Username already taken.'; err.style.display='block'; return; }
  // First account ever = admin
  const isFirst = users.length === 0;
  const newUser = {
    id:'u_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
    displayName, username, password,
    role: isFirst ? 'admin' : 'member',
    bio:'', avatar:null, joinedAt:new Date().toISOString()
  };
  users.push(newUser);
  saveUsers(users);
  pushActivity({type:'join', text:`${displayName} joined SIM Racing NG`});
  if(isFirst) pushActivity({type:'role', text:`${displayName} is the first admin`});
  _loginSuccess(newUser);
}

function _loginSuccess(user){
  setSession({id:user.id, username:user.username, displayName:user.displayName, role:user.role});
  markOnline(user.id);
  closeAuthModal();
  updateHeaderAuth();
  typeof renderHomeActivity === 'function' && renderHomeActivity();
  toast(`Welcome${user.role==='admin'?' 💪':''}, ${user.displayName||user.username}!`);
}

function doLogout(){
  const s = getSession();
  if(s) markOffline(s.id);
  clearSession();
  closeAdminPanel();
  closeUserPanel();
  updateHeaderAuth();
  toast('Logged out. See you on track!');
}

/* ════════════════════════════════════════════════════════
   SOCIALS
   ════════════════════════════════════════════════════════ */
function openSocials(){
  document.getElementById('socialsModal')?.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeSocials(){
  document.getElementById('socialsModal')?.classList.remove('open');
  document.body.style.overflow='';
}

/* ════════════════════════════════════════════════════════
   USER SIDE PANEL (right, for all logged-in users)
   ════════════════════════════════════════════════════════ */
let _upOpen = false;
let _upAvatarData = null;

function toggleUserPanel(){ _upOpen ? closeUserPanel() : openUserPanel(); }
function openUserPanel(){
  _upOpen = true;
  document.getElementById('userPanel')?.classList.add('open');
  document.getElementById('upOverlay')?.classList.add('open');
  _renderUserPanel();
}
function closeUserPanel(){
  _upOpen = false;
  document.getElementById('userPanel')?.classList.remove('open');
  document.getElementById('upOverlay')?.classList.remove('open');
}

function _renderUserPanel(){
  const s = getSession(); if(!s) return;
  const users = getUsers();
  const u = users.find(x=>x.id===s.id) || s;
  _upAvatarData = u.avatar || null;

  // Avatar
  const avEl = document.getElementById('upAvatarDisplay');
  if(avEl) avEl.innerHTML = avatarHTML(u, 56);

  setText('upNameDisplay',    u.displayName || u.username);
  setText('upUsernameDisplay','@'+u.username);
  const roleEl = document.getElementById('upRoleDisplay');
  if(roleEl) roleEl.innerHTML = roleBadgeHTML(u.role);
  setText('upJoinedDisplay',  'Member since '+new Date(u.joinedAt).toLocaleDateString('en-NG',{month:'short',year:'numeric'}));

  // Stats — member count only for logged-in users
  const statsEl = document.getElementById('upStatsRow');
  if(statsEl){
    statsEl.innerHTML = `
      <div class="up-stat"><span class="up-stat-val">${users.length}</span><span class="up-stat-lbl">Members</span></div>
      <div class="up-stat-div"></div>
      <div class="up-stat"><span class="up-stat-val" style="color:var(--green)">${getOnline().length}</span><span class="up-stat-lbl">Online</span></div>`;
  }

  // Cart count
  const cartCount = getCart().reduce((s,c)=>s+c.qty, 0);
  const cartBtn = document.getElementById('upCartShortcut');
  if(cartBtn) cartBtn.innerHTML = `🛒 My Cart${cartCount>0?` <span class="up-cart-badge">${cartCount}</span>`:''}`;

  // Edit fields
  const dn = document.getElementById('upEditDisplayName'); if(dn) dn.value = u.displayName||'';
  const bio= document.getElementById('upEditBio');         if(bio)bio.value = u.bio||'';

  // Change pass form reset
  const cpf = document.getElementById('upChangePassForm');
  if(cpf) cpf.style.display='none';
  ['upOldPass','upNewPass','upNewPass2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const cpe = document.getElementById('upPassErr'); if(cpe) cpe.style.display='none';
}

function upSaveProfile(){
  const s = getSession(); if(!s) return;
  const dn = document.getElementById('upEditDisplayName')?.value.trim();
  const bio= document.getElementById('upEditBio')?.value.trim();
  if(!dn){ toast('Display name required.','err'); return; }
  const users = getUsers();
  const idx = users.findIndex(u=>u.id===s.id); if(idx<0) return;
  users[idx].displayName = dn;
  users[idx].bio = bio||'';
  if(_upAvatarData) users[idx].avatar = _upAvatarData;
  saveUsers(users);
  setSession({...s, displayName:dn, role:users[idx].role});
  _renderUserPanel();
  updateHeaderAuth();
  toast('Profile saved ✓');
}

function upHandleAvatar(e){
  const file = e.target.files[0]; if(!file) return;
  if(file.size>3*1024*1024){ toast('Image must be under 3MB','err'); return; }
  const r = new FileReader();
  r.onload = ev => {
    _upAvatarData = ev.target.result;
    const avEl = document.getElementById('upAvatarDisplay');
    if(avEl) avEl.innerHTML = `<img src="${_upAvatarData}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid var(--border-card)"/>`;
  };
  r.readAsDataURL(file);
}

function upToggleChangePass(){
  const f = document.getElementById('upChangePassForm');
  if(f) f.style.display = f.style.display==='none' ? '' : 'none';
}

function upSavePassword(){
  const s = getSession(); if(!s) return;
  const oldP = document.getElementById('upOldPass')?.value;
  const newP = document.getElementById('upNewPass')?.value;
  const newP2= document.getElementById('upNewPass2')?.value;
  const err  = document.getElementById('upPassErr');
  err.style.display='none';
  if(!oldP||!newP){ err.textContent='Fill in all fields.'; err.style.display='block'; return; }
  if(newP.length<6){ err.textContent='New password min 6 characters.'; err.style.display='block'; return; }
  if(newP!==newP2){ err.textContent='Passwords do not match.'; err.style.display='block'; return; }
  const users = getUsers();
  const u = users.find(x=>x.id===s.id);
  if(!u||u.password!==oldP){ err.textContent='Current password incorrect.'; err.style.display='block'; return; }
  u.password = newP;
  saveUsers(users);
  upToggleChangePass();
  toast('Password updated ✓');
}

function upDeleteAccount(){
  if(!confirm('Delete your account permanently? This cannot be undone.')) return;
  const s = getSession(); if(!s) return;
  saveUsers(getUsers().filter(u=>u.id!==s.id));
  doLogout();
  toast('Account deleted.');
}

/* ════════════════════════════════════════════════════════
   ADMIN PANEL (right, admins only)
   ════════════════════════════════════════════════════════ */
let _apOpen=false, _apUserTab='all', _apConfirmCb=null;
let _apEditId=null, _apImg=null;

function toggleAdminPanel(){ _apOpen ? closeAdminPanel() : openAdminPanel(); }
function openAdminPanel(){
  _apOpen=true;
  document.getElementById('adminPanel')?.classList.add('open');
  document.getElementById('apOverlay')?.classList.add('open');
  _apRenderAll();
}
function closeAdminPanel(){
  _apOpen=false;
  document.getElementById('adminPanel')?.classList.remove('open');
  document.getElementById('apOverlay')?.classList.remove('open');
}

function _apRenderAll(){ apRenderUsers(); apUpdateOnlineBadge(); }

function apSwitchTab(tab, el){
  document.querySelectorAll('.ap-tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.ap-tab-pane').forEach(p=>p.style.display='none');
  el?.classList.add('active');
  const pane = document.getElementById('apTab_'+tab);
  if(pane) pane.style.display='';
}

/* ── AP Users ── */
function apRenderUsers(){
  const body = document.getElementById('apUserBody'); if(!body) return;
  apUpdateOnlineBadge();
  const s = getSession();
  let users = getUsers();
  if(_apUserTab==='admins')    users = users.filter(u=>u.role==='admin');
  if(_apUserTab==='racers')    users = users.filter(u=>u.role==='verified_racer');
  if(_apUserTab==='marketers') users = users.filter(u=>u.role==='marketer');

  body.innerHTML = users.map(u=>{
    const self = s && s.id===u.id;
    const online = isOnline(u.id);
    return `<div class="apu-row">
      ${avatarHTML(u, 30)}
      <div class="apu-info">
        <div class="apu-name">${esc(u.displayName||u.username)}${self?'<span class="self-tag">you</span>':''}</div>
        <div class="apu-sub">@${esc(u.username)} <span class="${online?'dot-online':'dot-offline'}">${online?'●':'○'}</span></div>
      </div>
      <div class="apu-actions">
        ${!self?`<select class="ap-role-sel" onchange="apSetRole('${u.id}',this.value,this)">
          ${Object.entries(ROLES).map(([k,v])=>`<option value="${k}"${u.role===k?' selected':''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
        <button class="icon-btn danger" onclick="apRemoveUser('${u.id}','${esc(u.displayName||u.username)}')">✕</button>`:''}
      </div>
    </div>`;
  }).join('') || '<div class="ap-empty">No users in this filter.</div>';
}

function apSwitchUserTab(tab, el){
  _apUserTab = tab;
  document.querySelectorAll('.ap-utab').forEach(b=>b.classList.remove('active'));
  el?.classList.add('active');
  apRenderUsers();
}

function apSetRole(userId, newRole){
  const users = getUsers();
  const u = users.find(x=>x.id===userId); if(!u) return;
  u.role = newRole;
  saveUsers(users);
  apRenderUsers();
  pushActivity({type:'role', text:`${u.displayName||u.username} promoted to ${roleInfo(newRole).label}`});
  toast(`${u.displayName||u.username} → ${roleInfo(newRole).label}`);
}

function apRemoveUser(id, name){
  apOpenConfirm(`Remove "${name}"?`, 'Their account will be deleted.', ()=>{
    saveUsers(getUsers().filter(u=>u.id!==id));
    apRenderUsers();
    toast('User removed.');
  });
}

function apUpdateOnlineBadge(){
  const cnt = getOnline().length;
  setText('apOnlineBadge', cnt+' online');
  setText('apUserCount', getUsers().length+' users');
}

/* ── AP Create Admin ── */
function apShowCreateAdmin(){
  const f = document.getElementById('apCreateAdminForm');
  if(f){ f.style.display=''; ['apCAName','apCAUsername','apCAPassword'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';}); }
  document.getElementById('apCAError').style.display='none';
}
function apCloseCreateAdmin(){ document.getElementById('apCreateAdminForm').style.display='none'; }
function apCreateAdmin(){
  const name     = document.getElementById('apCAName').value.trim();
  const username = document.getElementById('apCAUsername').value.trim().toLowerCase().replace(/\s+/g,'');
  const password = document.getElementById('apCAPassword').value;
  const err = document.getElementById('apCAError');
  err.style.display='none';
  if(!username){ err.textContent='Username required.'; err.style.display='block'; return; }
  if(!/^[a-z0-9_]+$/.test(username)){ err.textContent='Lowercase, numbers, underscores only.'; err.style.display='block'; return; }
  if(password.length<6){ err.textContent='Password min 6 characters.'; err.style.display='block'; return; }
  const users = getUsers();
  if(users.find(u=>u.username===username)){ err.textContent='Username taken.'; err.style.display='block'; return; }
  users.push({id:'adm_'+Date.now().toString(36), displayName:name||username, username, password, role:'admin', bio:'', avatar:null, joinedAt:new Date().toISOString()});
  saveUsers(users);
  apCloseCreateAdmin();
  apRenderUsers();
  toast(`Admin "@${username}" created.`);
}

/* ── AP Confirm ── */
function apOpenConfirm(title, desc, cb){
  _apConfirmCb = cb;
  setText('apConfirmTitle', title);
  setText('apConfirmDesc',  desc);
  document.getElementById('apConfirmModal')?.classList.add('open');
}
function apCloseConfirm(){ document.getElementById('apConfirmModal')?.classList.remove('open'); _apConfirmCb=null; }
function apDoConfirm(){ _apConfirmCb?.(); apCloseConfirm(); }

/* ════════════════════════════════════════════════════════
   PENDING PRODUCTS (submit → admin reviews on merch page)
   ════════════════════════════════════════════════════════ */
let _pendingImg = null;

function openAddProductModal(){
  _pendingImg = null;
  _apEditId   = null;
  const m = document.getElementById('addProductModal');
  if(!m) return;
  m.classList.add('open');
  document.body.style.overflow='hidden';
  document.getElementById('prodFormTitle').textContent = 'Submit Product';
  ['prodName','prodDesc','prodSizes','prodPrice'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('prodCategory').value='clothing';
  document.getElementById('prodBadge').value='';
  document.getElementById('prodImgPreview').style.display='none';
  document.getElementById('prodFormError').style.display='none';
}
function closeAddProductModal(){
  document.getElementById('addProductModal')?.classList.remove('open');
  document.body.style.overflow='';
}
function prodHandleImg(e){
  const file = e.target.files[0]; if(!file) return;
  if(file.size>5*1024*1024){ toast('Image must be under 5MB','err'); return; }
  const r = new FileReader();
  r.onload = ev => {
    _pendingImg = ev.target.result;
    const prev = document.getElementById('prodImgPreview');
    if(prev){ prev.src=_pendingImg; prev.style.display='block'; }
  };
  r.readAsDataURL(file);
}
function prodSubmit(){
  const s = getSession(); if(!s){ toast('Sign in first.','err'); return; }
  const name  = document.getElementById('prodName')?.value.trim();
  const price = parseFloat(document.getElementById('prodPrice')?.value);
  const err   = document.getElementById('prodFormError');
  err.style.display='none';
  if(!name){ err.textContent='Product name required.'; err.style.display='block'; return; }
  if(!price||price<=0){ err.textContent='Valid price required.'; err.style.display='block'; return; }
  const sizes = document.getElementById('prodSizes')?.value.split(',').map(s=>s.trim()).filter(Boolean)||[];
  if(isAdmin(s)){
    // Admin → publish directly
    const items = getMerch();
    items.push({id:Date.now(), name, price, cat:document.getElementById('prodCategory').value, badge:document.getElementById('prodBadge').value, desc:document.getElementById('prodDesc')?.value.trim()||'', sizes, image:_pendingImg});
    saveMerch(items);
    pushActivity({type:'product', text:`New product published: ${name}`});
    toast('Product published ✓');
  } else {
    // Non-admin → pending queue
    const pending = getPending();
    pending.push({id:Date.now(), name, price, cat:document.getElementById('prodCategory').value, badge:document.getElementById('prodBadge').value, desc:document.getElementById('prodDesc')?.value.trim()||'', sizes, image:_pendingImg, submittedBy:s.id, submittedByName:s.displayName||s.username, submittedAt:Date.now()});
    savePending(pending);
    toast('Product submitted for admin review 📋');
  }
  closeAddProductModal();
  typeof renderMerchPage==='function' && renderMerchPage();
  typeof renderPendingBadge==='function' && renderPendingBadge();
}

/* ════════════════════════════════════════════════════════
   NEWS / COMMUNITY SECTION
   ════════════════════════════════════════════════════════ */
function renderNewsFeed(){
  const feed = document.getElementById('newsFeed'); if(!feed) return;
  const items = getNews().slice(0, 6);
  if(!items.length){
    feed.innerHTML='<div class="news-empty">No news yet — check back soon!</div>'; return;
  }
  feed.innerHTML = items.map(n=>`
    <div class="news-card">
      ${n.image?`<div class="news-card-img"><img src="${n.image}" alt="${esc(n.title)}"/></div>`:''}
      <div class="news-card-body">
        <div class="news-card-meta">
          <span class="news-tag">${esc(n.tag||'News')}</span>
          <span class="news-date">${timeAgo(n.ts)}</span>
        </div>
        <h3 class="news-card-title">${esc(n.title)}</h3>
        <p class="news-card-excerpt">${esc(n.excerpt||'')}</p>
        ${n.body?`<button class="news-read-more" onclick="openNewsModal(${n.id})">Read more →</button>`:''}
      </div>
    </div>`).join('');
}

function openNewsModal(id){
  const n = getNews().find(x=>x.id===id); if(!n) return;
  setText('newsModalTitle', n.title);
  const body = document.getElementById('newsModalBody');
  if(body) body.innerHTML = `
    ${n.image?`<img src="${n.image}" alt="${esc(n.title)}" style="width:100%;border-radius:10px;margin-bottom:1rem;max-height:240px;object-fit:cover"/>` :''}
    <div class="news-meta-row"><span class="news-tag">${esc(n.tag||'News')}</span><span class="news-date">${timeAgo(n.ts)}</span></div>
    <p style="font-size:14px;line-height:1.75;color:var(--text-secondary);margin-top:1rem;white-space:pre-wrap">${esc(n.body||n.excerpt||'')}</p>`;
  document.getElementById('newsModal')?.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeNewsModal(){
  document.getElementById('newsModal')?.classList.remove('open');
  document.body.style.overflow='';
}

/* Admin: post news */
function openPostNewsModal(){
  const m = document.getElementById('postNewsModal'); if(!m) return;
  m.classList.add('open');
  document.body.style.overflow='hidden';
  ['newsPostTitle','newsPostExcerpt','newsPostBody','newsPostTag'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('newsPostImgPreview').style.display='none';
  document.getElementById('newsPostError').style.display='none';
  _newsPostImg = null;
}
function closePostNewsModal(){
  document.getElementById('postNewsModal')?.classList.remove('open');
  document.body.style.overflow='';
}
let _newsPostImg = null;
function newsPostHandleImg(e){
  const file = e.target.files[0]; if(!file) return;
  if(file.size>5*1024*1024){ toast('Image must be under 5MB','err'); return; }
  const r = new FileReader(); r.onload=ev=>{
    _newsPostImg=ev.target.result;
    const p=document.getElementById('newsPostImgPreview');
    if(p){p.src=_newsPostImg;p.style.display='block';}
  }; r.readAsDataURL(file);
}
function newsPostSubmit(){
  const title   = document.getElementById('newsPostTitle')?.value.trim();
  const excerpt = document.getElementById('newsPostExcerpt')?.value.trim();
  const body    = document.getElementById('newsPostBody')?.value.trim();
  const tag     = document.getElementById('newsPostTag')?.value.trim()||'News';
  const err     = document.getElementById('newsPostError');
  err.style.display='none';
  if(!title){ err.textContent='Title required.'; err.style.display='block'; return; }
  if(!excerpt){ err.textContent='Excerpt required.'; err.style.display='block'; return; }
  const news = getNews();
  news.unshift({id:Date.now(), title, excerpt, body, tag, image:_newsPostImg, ts:Date.now()});
  saveNews(news);
  closePostNewsModal();
  renderNewsFeed?.();
  toast('News post published ✓');
}
function apDeleteNews(id){
  apOpenConfirm('Delete this news post?','This cannot be undone.',()=>{
    saveNews(getNews().filter(n=>n.id!==id));
    typeof renderNewsFeed==='function' && renderNewsFeed();
    toast('News post deleted.');
  });
}

/* ════════════════════════════════════════════════════════
   NEWSLETTER
   ════════════════════════════════════════════════════════ */
function handleNewsletterSignup(e){
  e.preventDefault();
  const input = e.target.querySelector('input[type=email]');
  const btn   = e.target.querySelector('button[type=submit]');
  const email = input?.value.trim();
  if(!email) return;
  const list = getNewsletter();
  if(list.includes(email)){
    toast('You\'re already subscribed!','ok');
    return;
  }
  list.push(email);
  saveNewsletter(list);
  if(btn){ btn.textContent="You're in! 🏁"; btn.disabled=true; btn.style.opacity='0.7'; }
  if(input) input.value='';
  toast('Subscribed to the newsletter ✓');
}

/* ════════════════════════════════════════════════════════
   MEMBERS DIRECTORY
   ════════════════════════════════════════════════════════ */
function renderMembersDirectory(){
  const grid = document.getElementById('membersGrid'); if(!grid) return;
  const users = getUsers();
  setText('membersDirCount', users.length+' members');
  grid.innerHTML = users.map(u=>{
    const online = isOnline(u.id);
    return `<div class="member-dir-card${online?' member-dir-card--online':''}">
      ${avatarHTML(u, 40)}
      <div class="mdc-info">
        <div class="mdc-name">${esc(u.displayName||u.username)}</div>
        <div class="mdc-username">@${esc(u.username)}</div>
        ${roleBadgeHTML(u.role)}
      </div>
      <div class="mdc-online ${online?'dot-online':'dot-offline'}">${online?'●':'○'}</div>
    </div>`;
  }).join('') || '<div class="ap-empty" style="grid-column:1/-1">No members yet. Be the first!</div>';
}

/* ════════════════════════════════════════════════════════
   ACTIVITY FEED
   ════════════════════════════════════════════════════════ */
function renderHomeActivity(){
  const feed = document.getElementById('activityFeed'); if(!feed) return;
  const items = getActivity();
  if(!items.length){ feed.innerHTML='<div class="feed-empty">No activity yet — be the first to join!</div>'; return; }
  feed.innerHTML = items.slice(0,8).map(item=>{
    const icon={join:'👋',product:'🛍️',role:'⭐',news:'📰'}[item.type]||'📌';
    return `<div class="feed-item"><span class="feed-icon">${icon}</span><span class="feed-text">${esc(item.text)}</span><span class="feed-time">${timeAgo(item.ts)}</span></div>`;
  }).join('');
}

/* ════════════════════════════════════════════════════════
   CART
   ════════════════════════════════════════════════════════ */
function _cartKey(){ const s=getSession(); return s?'srn_cart_'+s.id:'srn_cart_guest'; }
function getCart(){ return JSON.parse(localStorage.getItem(_cartKey())||'[]'); }
function saveCart(c){ localStorage.setItem(_cartKey(),JSON.stringify(c)); _updateCartBadge(); }
function addToCart(productId, size){
  const item = getMerch().find(p=>p.id===productId); if(!item) return;
  const cart = getCart();
  const key  = productId+(size?'_'+size:'');
  const ex   = cart.find(c=>c.key===key);
  if(ex) ex.qty++;
  else cart.push({key, id:productId, name:item.name, price:item.price, size:size||null, image:item.image, cat:item.cat, qty:1});
  saveCart(cart);
  toast('Added to cart ✓');
}
function removeFromCart(key){ saveCart(getCart().filter(c=>c.key!==key)); }
function updateCartQty(key, delta){
  const cart=getCart(); const item=cart.find(c=>c.key===key);
  if(!item) return; item.qty=Math.max(1,item.qty+delta); saveCart(cart);
}
function clearCart(){ saveCart([]); }
function _updateCartBadge(){
  const total = getCart().reduce((s,c)=>s+c.qty, 0);
  // Only one floating button — cartFloatBadge
  const fb = document.getElementById('cartFloatBadge');
  if(fb){ fb.textContent=total; fb.style.display=total?'flex':'none'; }
  // Also update user panel shortcut if open
  const cartBtn = document.getElementById('upCartShortcut');
  if(cartBtn) cartBtn.innerHTML = `🛒 My Cart${total>0?` <span class="up-cart-badge">${total}</span>`:''}`;
}
function openCart(){ document.getElementById('cartModal')?.classList.add('open'); renderCart(); }
function closeCart(){ document.getElementById('cartModal')?.classList.remove('open'); }
function renderCart(){
  const cart=getCart();
  const list=document.getElementById('cartItemsList');
  const footer=document.getElementById('cartFooter');
  const empty=document.getElementById('cartEmpty');
  const badge=document.getElementById('cartCountBadge');
  const total=cart.reduce((s,c)=>s+c.qty,0);
  if(badge) badge.textContent=total+(total===1?' item':' items');
  if(!list) return;
  if(!cart.length){
    list.innerHTML='';
    if(footer) footer.style.display='none';
    if(empty)  empty.style.display='flex';
    return;
  }
  if(empty)  empty.style.display='none';
  if(footer) footer.style.display='block';
  const subtotal=cart.reduce((s,c)=>s+(c.price*c.qty),0);
  setText('cartSubtotal','₦'+subtotal.toLocaleString());
  list.innerHTML=cart.map(item=>{
    const thumb=item.image
      ?`<img src="${item.image}" alt="${esc(item.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:6px"/>`
      :`<div style="font-size:24px;display:flex;align-items:center;justify-content:center;height:100%">${catEmoji(item.cat)}</div>`;
    return `<div class="cart-item">
      <div class="cart-item-thumb">${thumb}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${esc(item.name)}</div>
        ${item.size?`<div class="cart-item-size">Size: ${esc(item.size)}</div>`:''}
        <div class="cart-item-price">₦${(item.price*item.qty).toLocaleString()}</div>
      </div>
      <div class="cart-item-controls">
        <div class="qty-control">
          <button class="qty-btn" onclick="updateCartQty('${esc(item.key)}',-1);renderCart()">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" onclick="updateCartQty('${esc(item.key)}',1);renderCart()">+</button>
        </div>
        <button class="cart-remove-btn" onclick="removeFromCart('${esc(item.key)}');renderCart()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}
function checkoutCart(){ toast('Checkout coming soon — store not yet live 🚧'); }
function clearCartConfirm(){ if(confirm('Clear your entire cart?')){ clearCart(); renderCart(); } }

/* ════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════ */
function setText(id, val){ const el=document.getElementById(id); if(el) el.textContent=val; }

/* ════════════════════════════════════════════════════════
   INIT — runs on every page
   ════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', ()=>{
  applyTheme(getTheme());
  document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);

  updateHeaderAuth();
  document.getElementById('headerAuthBtn')?.addEventListener('click', ()=>openAuthModal('signin'));
  document.getElementById('adminToggle')?.addEventListener('click', toggleAdminPanel);
  document.getElementById('apOverlay')?.addEventListener('click', closeAdminPanel);

  // Auth
  document.querySelectorAll('.auth-tab-btn').forEach(b=>b.addEventListener('click',()=>switchAuthTab(b.dataset.tab)));
  document.getElementById('authModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('authModal'))closeAuthModal();});
  document.getElementById('si_submitBtn')?.addEventListener('click', doSignIn);
  document.getElementById('su_submitBtn')?.addEventListener('click', doSignUp);
  document.getElementById('si_password')?.addEventListener('keydown',e=>{if(e.key==='Enter')doSignIn();});
  document.getElementById('su_password2')?.addEventListener('keydown',e=>{if(e.key==='Enter')doSignUp();});

  // User panel
  document.getElementById('upOverlay')?.addEventListener('click', closeUserPanel);
  document.getElementById('upAvatarInput')?.addEventListener('change', upHandleAvatar);
  document.getElementById('upSaveProfileBtn')?.addEventListener('click', upSaveProfile);
  document.getElementById('upChangePassToggle')?.addEventListener('click', upToggleChangePass);
  document.getElementById('upSavePassBtn')?.addEventListener('click', upSavePassword);
  document.getElementById('upDeleteBtn')?.addEventListener('click', upDeleteAccount);
  document.getElementById('upCartShortcut')?.addEventListener('click', ()=>{ closeUserPanel(); setTimeout(openCart,200); });
  document.getElementById('upLogoutBtn')?.addEventListener('click', doLogout);

  // Socials
  document.getElementById('socialsModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('socialsModal'))closeSocials();});

  // Admin confirm
  document.getElementById('apConfirmYes')?.addEventListener('click', apDoConfirm);
  document.getElementById('apConfirmNo')?.addEventListener('click',  apCloseConfirm);
  document.getElementById('apConfirmModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('apConfirmModal'))apCloseConfirm();});

  // Add product modal
  document.getElementById('addProductModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('addProductModal'))closeAddProductModal();});
  document.getElementById('prodImgInput')?.addEventListener('change', prodHandleImg);

  // News modal
  document.getElementById('newsModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('newsModal'))closeNewsModal();});

  // Post news modal
  document.getElementById('postNewsModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('postNewsModal'))closePostNewsModal();});
  document.getElementById('newsPostImgInput')?.addEventListener('change', newsPostHandleImg);

  // Cart
  document.getElementById('cartModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('cartModal'))closeCart();});
  _updateCartBadge();

  // ESC
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      closeAuthModal(); closeSocials(); closeAdminPanel(); closeUserPanel();
      closeCart(); closeAddProductModal(); closeNewsModal(); closePostNewsModal();
      apCloseConfirm();
    }
  });

  const s = getSession();
  if(s) markOnline(s.id);

  typeof renderHomeActivity    === 'function' && renderHomeActivity();
  typeof renderMembersDirectory=== 'function' && renderMembersDirectory();
  typeof renderNewsFeed        === 'function' && renderNewsFeed();
  typeof renderPendingBadge    === 'function' && renderPendingBadge();
  _updateCartBadge();
});
