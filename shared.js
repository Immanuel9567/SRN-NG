'use strict';
/* ════════════════════════════════════════════════════════════════
   SIM RACING NG — shared.js  v3
   Full account system. Roles: member | verified_racer | marketer | admin
   Loaded on every page before </body>.
   ════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   THEME  (runs immediately, before DOMContentLoaded, no flash)
   ───────────────────────────────────────────── */
(function(){
  const t = localStorage.getItem('srn_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();

function getTheme(){ return localStorage.getItem('srn_theme') || 'dark'; }
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('themeBtn');
  if(btn) btn.innerHTML = t === 'dark'
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}
function toggleTheme(){
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem('srn_theme', next);
  applyTheme(next);
}

/* ─────────────────────────────────────────────
   ROLE CONFIG
   ───────────────────────────────────────────── */
const ROLES = {
  member:         { label:'Member',         color:'#6080a0', icon:'👤' },
  verified_racer: { label:'Verified Racer', color:'#00e06b', icon:'🏎️' },
  marketer:       { label:'Marketer',       color:'#ffb800', icon:'🛍️' },
  admin:          { label:'Admin',          color:'#ff3b5c', icon:'💪' },
};
function roleInfo(r){ return ROLES[r] || ROLES.member; }
function canAddProduct(session){
  if(!session) return false;
  return ['admin','marketer'].includes(session.role);
}
function isAdmin(session){ return session?.role === 'admin'; }

/* ─────────────────────────────────────────────
   STORAGE HELPERS
   ───────────────────────────────────────────── */
function getUsers()   { return JSON.parse(localStorage.getItem('srn_users')  || '[]'); }
function saveUsers(u) { localStorage.setItem('srn_users', JSON.stringify(u)); }
function getMerch() {
  const s = localStorage.getItem('srn_merch');
  if(s) return JSON.parse(s);
  const def = [
    {id:1,name:'Classic Logo Tee',  category:'clothing',    price:12000,badge:'new',    desc:'100% cotton. SRN logo front, "NG" back. Available in black and white.',sizes:['S','M','L','XL','XXL'],image:null},
    {id:2,name:'Zip-Up Hoodie',     category:'clothing',    price:22000,badge:'new',    desc:'Heavyweight fleece. Embroidered logo. Front zip, kangaroo pockets.',   sizes:['S','M','L','XL'],      image:null},
    {id:3,name:'Racing Jersey',     category:'clothing',    price:18500,badge:'',       desc:'Breathable performance fabric. Sublimated print. Number customisation.',sizes:['S','M','L','XL','XXL'],image:null},
    {id:4,name:'Racing Snapback',   category:'headwear',    price:9500, badge:'',       desc:'Flat-brim snapback. Embroidered logo. One size fits most.',              sizes:[],                      image:null},
    {id:5,name:'Dad Cap — NG',      category:'headwear',    price:8000, badge:'',       desc:'Washed cotton, curved brim, adjustable strap. Low-profile embroidery.',  sizes:[],                      image:null},
    {id:6,name:'Desk Mat — NG',     category:'accessories', price:8000, badge:'',       desc:'900×400mm extended mat. Non-slip rubber base. Green-on-black design.',   sizes:[],                      image:null},
    {id:7,name:'Sticker Pack',      category:'accessories', price:2500, badge:'',       desc:'8 die-cut vinyl stickers. Waterproof. For your rig, helmet, or laptop.',  sizes:[],                      image:null},
    {id:8,name:'Neck Gaiter',       category:'accessories', price:5000, badge:'limited',desc:'Stretch polyester. All-over print. Face cover or headband.',              sizes:[],                      image:null},
  ];
  localStorage.setItem('srn_merch', JSON.stringify(def));
  return def;
}
function saveMerch(m){ localStorage.setItem('srn_merch', JSON.stringify(m)); }
function getActivity(){ return JSON.parse(localStorage.getItem('srn_activity') || '[]'); }
function pushActivity(entry){
  const list = getActivity();
  list.unshift({...entry, ts: Date.now()});
  localStorage.setItem('srn_activity', JSON.stringify(list.slice(0,50)));
}

/* ─────────────────────────────────────────────
   SEED DEFAULT ADMIN
   ───────────────────────────────────────────── */
(function(){
  const users = getUsers();
  if(!users.find(u=>u.role==='admin')){
    users.unshift({
      id:'admin_seed', displayName:'Admin', username:'admin',
      password:'admin123', role:'admin', bio:'Site administrator.',
      avatar:null, joinedAt:new Date().toISOString(), online:false
    });
    saveUsers(users);
  }
})();

/* ─────────────────────────────────────────────
   SESSION
   ───────────────────────────────────────────── */
function getSession(){ return JSON.parse(sessionStorage.getItem('srn_session') || 'null'); }
function setSession(u){ sessionStorage.setItem('srn_session', JSON.stringify(u)); }
function clearSession(){ sessionStorage.removeItem('srn_session'); }

/* ─────────────────────────────────────────────
   ONLINE TRACKING
   ───────────────────────────────────────────── */
function getOnline(){ return JSON.parse(sessionStorage.getItem('srn_online') || '[]'); }
function markOnline(uid){
  const l=getOnline(); if(!l.includes(uid)){l.push(uid);}
  sessionStorage.setItem('srn_online',JSON.stringify(l));
  const users=getUsers(); const u=users.find(x=>x.id===uid);
  if(u){u.online=true; saveUsers(users);}
}
function markOffline(uid){
  sessionStorage.setItem('srn_online',JSON.stringify(getOnline().filter(x=>x!==uid)));
  const users=getUsers(); const u=users.find(x=>x.id===uid);
  if(u){u.online=false; saveUsers(users);}
}
function isOnline(uid){ return getOnline().includes(uid); }

/* ─────────────────────────────────────────────
   UTILS
   ───────────────────────────────────────────── */
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtPrice(n){ return '₦'+Number(n).toLocaleString(); }
function catEmoji(c){ return {clothing:'👕',headwear:'🧢',accessories:'🖱️'}[c]||'📦'; }
function timeAgo(ts){
  const d=Date.now()-ts, m=Math.floor(d/60000), h=Math.floor(m/60), dy=Math.floor(h/24);
  if(dy>0) return dy+'d ago'; if(h>0) return h+'h ago'; if(m>0) return m+'m ago'; return 'just now';
}
function initials(name){ return String(name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
function avatarHTML(user, size=36){
  const sz=`width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;`;
  if(user.avatar) return `<img src="${user.avatar}" style="${sz}border:2px solid var(--border-card)" alt=""/>`;
  const ri=roleInfo(user.role);
  return `<div style="${sz}background:${ri.color}22;border:2px solid ${ri.color}44;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:${Math.round(size*0.38)}px;font-weight:700;color:${ri.color}">${initials(user.displayName||user.username)}</div>`;
}
function roleBadgeHTML(role){
  const ri=roleInfo(role);
  return `<span class="role-badge" style="--rb-color:${ri.color}">${ri.icon} ${ri.label}</span>`;
}

function toast(msg,type='ok'){
  let t=document.getElementById('srnToast');
  if(!t){t=document.createElement('div');t.id='srnToast';document.body.appendChild(t);}
  t.className='srn-toast srn-toast--'+type;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),3000);
}

/* ─────────────────────────────────────────────
   HEADER AUTH STATE
   ───────────────────────────────────────────── */
function updateHeaderAuth(){
  const session = getSession();
  const loginBtn   = document.getElementById('headerAuthBtn');
  const userChip   = document.getElementById('headerUserChip');
  const adminToggle= document.getElementById('adminToggle');

  if(session){
    if(loginBtn)  loginBtn.style.display='none';
    if(userChip){
      const u = getUsers().find(x=>x.id===session.id) || session;
      userChip.style.display='flex';
      userChip.innerHTML=`
        ${avatarHTML(u,28)}
        <span class="huc-name">${esc(u.displayName||u.username)}</span>
        ${roleBadgeHTML(u.role)}
        <button class="huc-arrow" onclick="openProfileModal()" title="Edit profile">⚙</button>
        <button class="huc-logout" onclick="doLogout()" title="Log out">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>`;
    }
    if(adminToggle) adminToggle.style.display = isAdmin(session) ? 'flex' : 'none';
  } else {
    if(loginBtn)  loginBtn.style.display='flex';
    if(userChip)  userChip.style.display='none';
    if(adminToggle) adminToggle.style.display='none';
  }
}

/* ─────────────────────────────────────────────
   AUTH MODAL (sign in / sign up tabs)
   ───────────────────────────────────────────── */
let _authTab = 'signin';

function openAuthModal(tab){
  _authTab = tab || 'signin';
  const m = document.getElementById('authModal');
  if(!m) return;
  m.classList.add('open');
  switchAuthTab(_authTab);
  document.body.style.overflow='hidden';
  setTimeout(()=>document.getElementById('authModal')?.querySelector('input')?.focus(),150);
}
function closeAuthModal(){
  document.getElementById('authModal')?.classList.remove('open');
  document.body.style.overflow='';
}
function switchAuthTab(tab){
  _authTab=tab;
  document.querySelectorAll('.auth-tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.getElementById('authPane_signin').style.display = tab==='signin'?'':'none';
  document.getElementById('authPane_signup').style.display = tab==='signup'?'':'none';
  document.getElementById('authErr_signin').style.display='none';
  document.getElementById('authErr_signup').style.display='none';
}

function doSignIn(){
  const username = document.getElementById('si_username').value.trim().toLowerCase();
  const password = document.getElementById('si_password').value;
  const err = document.getElementById('authErr_signin');
  err.style.display='none';
  if(!username||!password){err.textContent='Enter username and password.';err.style.display='block';return;}
  const user = getUsers().find(u=>u.username.toLowerCase()===username && u.password===password);
  if(!user){err.textContent='Invalid username or password.';err.style.display='block';return;}
  _loginSuccess(user);
}

function doSignUp(){
  const displayName= document.getElementById('su_displayName').value.trim();
  const username   = document.getElementById('su_username').value.trim().toLowerCase().replace(/\s+/g,'');
  const password   = document.getElementById('su_password').value;
  const password2  = document.getElementById('su_password2').value;
  const err = document.getElementById('authErr_signup');
  err.style.display='none';
  if(!displayName){err.textContent='Display name required.';err.style.display='block';return;}
  if(!username){err.textContent='Username required.';err.style.display='block';return;}
  if(!/^[a-z0-9_]+$/.test(username)){err.textContent='Username: lowercase letters, numbers, underscores only.';err.style.display='block';return;}
  if(password.length<6){err.textContent='Password must be at least 6 characters.';err.style.display='block';return;}
  if(password!==password2){err.textContent='Passwords do not match.';err.style.display='block';return;}
  const users = getUsers();
  if(users.find(u=>u.username.toLowerCase()===username)){err.textContent='Username already taken.';err.style.display='block';return;}
  const newUser = {
    id:'u_'+Date.now().toString(36), displayName, username, password,
    role:'member', bio:'', avatar:null, joinedAt:new Date().toISOString(), online:true
  };
  users.push(newUser);
  saveUsers(users);
  pushActivity({type:'join',text:`${displayName} joined SIM Racing NG`, userId:newUser.id});
  _loginSuccess(newUser);
}

function _loginSuccess(user){
  setSession({id:user.id, username:user.username, displayName:user.displayName, role:user.role});
  markOnline(user.id);
  closeAuthModal();
  updateHeaderAuth();
  renderHomeActivity?.();
  toast(`Welcome${user.role!=='member'?' back':''}, ${user.displayName||user.username}! 🏁`);
}

function doLogout(){
  const s = getSession();
  if(s) markOffline(s.id);
  clearSession();
  closeAdminPanel();
  closeProfileModal();
  updateHeaderAuth();
  toast('Logged out. See you on track!');
}

/* ─────────────────────────────────────────────
   PROFILE MODAL
   ───────────────────────────────────────────── */
let _profileImgData = null;

function openProfileModal(){
  const s = getSession();
  if(!s){ openAuthModal('signin'); return; }
  const user = getUsers().find(u=>u.id===s.id);
  if(!user) return;
  const m = document.getElementById('profileModal');
  if(!m) return;
  m.classList.add('open');
  document.body.style.overflow='hidden';
  _profileImgData = user.avatar || null;

  document.getElementById('prof_displayName').value = user.displayName||'';
  document.getElementById('prof_bio').value = user.bio||'';
  const prev = document.getElementById('prof_avatarPreview');
  if(prev){
    prev.src = user.avatar||''; prev.style.display = user.avatar?'block':'none';
  }
  const roleEl = document.getElementById('prof_roleDisplay');
  if(roleEl) roleEl.innerHTML = roleBadgeHTML(user.role);
  document.getElementById('prof_username').textContent = '@'+user.username;
  document.getElementById('prof_joined').textContent = 'Joined '+new Date(user.joinedAt).toLocaleDateString('en-NG',{month:'short',year:'numeric'});
}
function closeProfileModal(){
  document.getElementById('profileModal')?.classList.remove('open');
  document.body.style.overflow='';
}
function handleProfileAvatar(e){
  const file=e.target.files[0]; if(!file) return;
  if(file.size>3*1024*1024){toast('Image must be under 3MB','err');return;}
  const r=new FileReader();
  r.onload=ev=>{
    _profileImgData=ev.target.result;
    const prev=document.getElementById('prof_avatarPreview');
    if(prev){prev.src=_profileImgData;prev.style.display='block';}
  };
  r.readAsDataURL(file);
}
function saveProfile(){
  const s=getSession(); if(!s) return;
  const displayName=document.getElementById('prof_displayName').value.trim();
  const bio=document.getElementById('prof_bio').value.trim();
  if(!displayName){toast('Display name required.','err');return;}
  const users=getUsers();
  const idx=users.findIndex(u=>u.id===s.id);
  if(idx<0) return;
  users[idx].displayName=displayName;
  users[idx].bio=bio;
  if(_profileImgData) users[idx].avatar=_profileImgData;
  saveUsers(users);
  setSession({...s,displayName,role:users[idx].role});
  closeProfileModal();
  updateHeaderAuth();
  toast('Profile updated ✓');
}

/* ─────────────────────────────────────────────
   SOCIALS MODAL
   ───────────────────────────────────────────── */
function openSocials(){
  document.getElementById('socialsModal')?.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeSocials(){
  document.getElementById('socialsModal')?.classList.remove('open');
  document.body.style.overflow='';
}

/* ─────────────────────────────────────────────
   ADMIN SLIDE PANEL
   ───────────────────────────────────────────── */
let _apOpen=false, _apUserTab='all', _apConfirmCb=null;
let _editingProductId=null, _uploadedImage=null;

function toggleAdminPanel(){
  _apOpen=!_apOpen;
  document.getElementById('adminPanel')?.classList.toggle('open',_apOpen);
  document.getElementById('apOverlay')?.classList.toggle('open',_apOpen);
  if(_apOpen){ apRenderAll(); }
}
function closeAdminPanel(){
  _apOpen=false;
  document.getElementById('adminPanel')?.classList.remove('open');
  document.getElementById('apOverlay')?.classList.remove('open');
}
function apRenderAll(){
  apRenderProducts();
  apRenderUsers();
  apUpdateOnline();
}

/* ── AP tabs ── */
function apSwitchTab(tab,el){
  document.querySelectorAll('.ap-tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.ap-tab-pane').forEach(p=>p.style.display='none');
  el?.classList.add('active');
  const pane=document.getElementById('apTab_'+tab);
  if(pane) pane.style.display='';
}

/* ── AP products ── */
function apRenderProducts(){
  const grid=document.getElementById('apMerchGrid'); if(!grid) return;
  const items=getMerch();
  if(!items.length){grid.innerHTML='<div class="ap-empty">No products yet.</div>';return;}
  grid.innerHTML=items.map(item=>{
    const thumb=item.image?`<img src="${item.image}" style="width:100%;height:100%;object-fit:cover" alt=""/>`:`<span style="font-size:26px">${catEmoji(item.category)}</span>`;
    const badge=item.badge?`<span class="mini-badge mini-badge--${item.badge}">${item.badge==='new'?'New':'Ltd'}</span>`:'';
    return `<div class="ap-product-card">
      <div class="ap-product-thumb" style="position:relative">${thumb}${badge}</div>
      <div class="ap-product-info">
        <div class="ap-product-name">${esc(item.name)}</div>
        <div class="ap-product-price">${fmtPrice(item.price)}</div>
      </div>
      <div class="ap-product-actions">
        <button class="icon-btn" onclick="apOpenEditProduct(${item.id})">✏️</button>
        <button class="icon-btn danger" onclick="apConfirmDeleteProduct(${item.id},'${esc(item.name)}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function apOpenAddProduct(){
  _editingProductId=null; _uploadedImage=null;
  _apFillProductForm({},'Add Product');
  document.getElementById('apProductForm').style.display='';
  document.getElementById('apProductForm').scrollIntoView({behavior:'smooth'});
}
function apOpenEditProduct(id){
  const item=getMerch().find(p=>p.id===id); if(!item) return;
  _editingProductId=id; _uploadedImage=item.image||null;
  _apFillProductForm(item,'Edit Product');
  document.getElementById('apProductForm').style.display='';
  document.getElementById('apProductForm').scrollIntoView({behavior:'smooth'});
}
function _apFillProductForm(item,title){
  document.getElementById('apFormTitle').textContent=title;
  document.getElementById('apPName').value=item.name||'';
  document.getElementById('apPCategory').value=item.category||'clothing';
  document.getElementById('apPPrice').value=item.price||'';
  document.getElementById('apPBadge').value=item.badge||'';
  document.getElementById('apPDesc').value=item.desc||'';
  document.getElementById('apPSizes').value=(item.sizes||[]).join(', ');
  document.getElementById('apFormError').style.display='none';
  const prev=document.getElementById('apPImgPreview');
  if(item.image){prev.src=item.image;prev.style.display='block';}
  else{prev.style.display='none';prev.src='';}
}
function apCloseProductForm(){ document.getElementById('apProductForm').style.display='none'; }
function apHandleImage(e){
  const file=e.target.files[0]; if(!file) return;
  if(file.size>5*1024*1024){toast('Image must be under 5MB','err');return;}
  const r=new FileReader();
  r.onload=ev=>{
    _uploadedImage=ev.target.result;
    const prev=document.getElementById('apPImgPreview');
    prev.src=_uploadedImage; prev.style.display='block';
  };
  r.readAsDataURL(file);
}
function apSaveProduct(){
  const name=document.getElementById('apPName').value.trim();
  const price=parseFloat(document.getElementById('apPPrice').value);
  const errEl=document.getElementById('apFormError');
  errEl.style.display='none';
  if(!name){errEl.textContent='Name required.';errEl.style.display='block';return;}
  if(!price||price<=0){errEl.textContent='Valid price required.';errEl.style.display='block';return;}
  const sizes=document.getElementById('apPSizes').value.split(',').map(s=>s.trim()).filter(Boolean);
  const newItem={
    id:_editingProductId||Date.now(), name, price,
    category:document.getElementById('apPCategory').value,
    badge:document.getElementById('apPBadge').value,
    desc:document.getElementById('apPDesc').value.trim(),
    sizes, image:_uploadedImage
  };
  const items=getMerch();
  if(_editingProductId){const idx=items.findIndex(p=>p.id===_editingProductId);if(idx>-1)items[idx]=newItem;}
  else items.push(newItem);
  saveMerch(items);
  apCloseProductForm(); apRenderProducts();
  if(typeof renderMerchPage==='function') renderMerchPage();
  pushActivity({type:'product',text:`New product added: ${name}`});
  toast(_editingProductId?'Product updated.':'Product added.');
}
function apConfirmDeleteProduct(id,name){
  apOpenConfirm(`Delete "${name}"?`,'Removes it from the store.',()=>{
    saveMerch(getMerch().filter(p=>p.id!==id));
    apRenderProducts();
    if(typeof renderMerchPage==='function') renderMerchPage();
    toast('Product deleted.');
  });
}

/* ── AP users ── */
function apRenderUsers(){
  const body=document.getElementById('apUserBody'); if(!body) return;
  apUpdateOnline();
  const session=getSession();
  let users=getUsers();
  if(_apUserTab==='admins') users=users.filter(u=>u.role==='admin');
  else if(_apUserTab==='racers') users=users.filter(u=>u.role==='verified_racer');
  else if(_apUserTab==='marketers') users=users.filter(u=>u.role==='marketer');
  // else 'all'
  body.innerHTML=users.map(u=>{
    const online=isOnline(u.id);
    const self=session&&session.id===u.id;
    const ri=roleInfo(u.role);
    return `<div class="apu-row">
      ${avatarHTML(u,32)}
      <div class="apu-info">
        <div class="apu-name">${esc(u.displayName||u.username)}${self?' <span class="self-tag">you</span>':''}</div>
        <div class="apu-sub">@${esc(u.username)} · <span class="${online?'dot-online':'dot-offline'}">${online?'●':'○'}</span></div>
      </div>
      <div class="apu-actions">
        ${!self?`<select class="ap-role-sel" onchange="apSetRole('${u.id}',this.value,this)" title="Change role">
          ${Object.entries(ROLES).map(([k,v])=>`<option value="${k}"${u.role===k?' selected':''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
        <button class="icon-btn danger" onclick="apConfirmRemoveUser('${u.id}','${esc(u.displayName||u.username)}')">✕</button>`:''}
      </div>
    </div>`;
  }).join('')||'<div class="ap-empty">No users in this filter.</div>';
}
function apSwitchUserTab(tab,el){
  _apUserTab=tab;
  document.querySelectorAll('.ap-utab').forEach(b=>b.classList.remove('active'));
  el?.classList.add('active');
  apRenderUsers();
}
function apSetRole(userId,newRole,selectEl){
  const users=getUsers();
  const u=users.find(x=>x.id===userId);
  if(!u) return;
  const oldRole=u.role;
  u.role=newRole;
  saveUsers(users);
  apRenderUsers();
  pushActivity({type:'role',text:`${u.displayName||u.username} promoted to ${roleInfo(newRole).label}`});
  toast(`${u.displayName||u.username} is now a ${roleInfo(newRole).label}.`);
}
function apConfirmRemoveUser(id,name){
  apOpenConfirm(`Remove "${name}"?`,'Their account will be deleted.',()=>{
    saveUsers(getUsers().filter(u=>u.id!==id));
    apRenderUsers();
    toast('User removed.');
  });
}
function apUpdateOnline(){
  const online=getOnline().length;
  const badge=document.getElementById('apOnlineBadge');
  if(badge) badge.textContent=online+' online';
  const count=document.getElementById('apUserCount');
  if(count) count.textContent=getUsers().length+' users';
}

/* ── AP create admin ── */
function apShowCreateAdmin(){
  document.getElementById('apCreateAdminForm').style.display='';
  ['apCAName','apCAUsername','apCAPassword'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('apCAError').style.display='none';
}
function apCloseCreateAdmin(){ document.getElementById('apCreateAdminForm').style.display='none'; }
function apCreateAdmin(){
  const name=document.getElementById('apCAName').value.trim();
  const username=document.getElementById('apCAUsername').value.trim().toLowerCase().replace(/\s+/g,'');
  const password=document.getElementById('apCAPassword').value;
  const errEl=document.getElementById('apCAError');
  errEl.style.display='none';
  if(!username){errEl.textContent='Username required.';errEl.style.display='block';return;}
  if(!/^[a-z0-9_]+$/.test(username)){errEl.textContent='Lowercase, numbers, underscores only.';errEl.style.display='block';return;}
  if(password.length<6){errEl.textContent='Password min 6 chars.';errEl.style.display='block';return;}
  const users=getUsers();
  if(users.find(u=>u.username===username)){errEl.textContent='Username taken.';errEl.style.display='block';return;}
  const newAdmin={
    id:'adm_'+Date.now().toString(36), displayName:name||username, username, password,
    role:'admin', bio:'', avatar:null, joinedAt:new Date().toISOString(), online:false
  };
  users.push(newAdmin);
  saveUsers(users);
  apCloseCreateAdmin(); apRenderUsers();
  toast(`Admin "@${username}" created.`);
}

/* ── AP confirm ── */
function apOpenConfirm(title,desc,cb){
  _apConfirmCb=cb;
  document.getElementById('apConfirmTitle').textContent=title;
  document.getElementById('apConfirmDesc').textContent=desc;
  document.getElementById('apConfirmModal').classList.add('open');
}
function apCloseConfirm(){ document.getElementById('apConfirmModal').classList.remove('open'); _apConfirmCb=null; }
function apDoConfirm(){ _apConfirmCb?.(); apCloseConfirm(); }

/* ─────────────────────────────────────────────
   MEMBERS DIRECTORY (public toggle on homepage)
   ───────────────────────────────────────────── */
function renderMembersDirectory(){
  const grid=document.getElementById('membersGrid'); if(!grid) return;
  const users=getUsers().filter(u=>u.role!=='admin'||true); // show all
  const count=document.getElementById('membersDirCount');
  if(count) count.textContent=users.length+' members';
  grid.innerHTML=users.map(u=>{
    const online=isOnline(u.id);
    const ri=roleInfo(u.role);
    return `<div class="member-dir-card${online?' member-dir-card--online':''}">
      ${avatarHTML(u,44)}
      <div class="mdc-info">
        <div class="mdc-name">${esc(u.displayName||u.username)}</div>
        <div class="mdc-username">@${esc(u.username)}</div>
        ${roleBadgeHTML(u.role)}
      </div>
      <div class="mdc-status ${online?'dot-online':'dot-offline'}">${online?'●':'○'}</div>
    </div>`;
  }).join('')||'<div class="ap-empty" style="grid-column:1/-1">No members yet.</div>';
}

/* ─────────────────────────────────────────────
   ACTIVITY FEED
   ───────────────────────────────────────────── */
function renderHomeActivity(){
  const feed=document.getElementById('activityFeed'); if(!feed) return;
  const items=getActivity();
  if(!items.length){feed.innerHTML='<div class="feed-empty">No activity yet — be the first to join!</div>';return;}
  feed.innerHTML=items.slice(0,8).map(item=>{
    const icon={join:'👋',product:'🛍️',role:'⭐',cart:'🛒'}[item.type]||'📌';
    return `<div class="feed-item">
      <span class="feed-icon">${icon}</span>
      <span class="feed-text">${esc(item.text)}</span>
      <span class="feed-time">${timeAgo(item.ts)}</span>
    </div>`;
  }).join('');
}

/* ─────────────────────────────────────────────
   CART
   ───────────────────────────────────────────── */
function _cartKey(){
  const s=getSession(); return s?'srn_cart_'+s.id:'srn_cart_guest';
}
function getCart(){ return JSON.parse(localStorage.getItem(_cartKey())||'[]'); }
function saveCart(c){ localStorage.setItem(_cartKey(),JSON.stringify(c)); _updateCartBadges(); }
function addToCart(productId,size){
  const item=getMerch().find(p=>p.id===productId); if(!item) return;
  const cart=getCart();
  const key=productId+(size?'_'+size:'');
  const ex=cart.find(c=>c.key===key);
  if(ex) ex.qty++;
  else cart.push({key,id:productId,name:item.name,price:item.price,size:size||null,image:item.image,category:item.category,qty:1});
  saveCart(cart);
  toast('Added to cart ✓');
}
function removeFromCart(key){ saveCart(getCart().filter(c=>c.key!==key)); }
function updateCartQty(key,delta){
  const cart=getCart(); const item=cart.find(c=>c.key===key);
  if(!item) return; item.qty=Math.max(1,item.qty+delta); saveCart(cart);
}
function clearCart(){ saveCart([]); }
function _updateCartBadges(){
  const total=getCart().reduce((s,c)=>s+c.qty,0);
  ['cartBadge','cartFloatBadge'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.textContent=total;el.style.display=total?'flex':'none';}
  });
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
    list.innerHTML=''; if(footer)footer.style.display='none'; if(empty)empty.style.display='flex'; return;
  }
  if(empty)empty.style.display='none'; if(footer)footer.style.display='block';
  const subtotal=cart.reduce((s,c)=>s+(c.price*c.qty),0);
  const subtotalEl=document.getElementById('cartSubtotal');
  if(subtotalEl) subtotalEl.textContent='₦'+subtotal.toLocaleString();
  list.innerHTML=cart.map(item=>{
    const thumb=item.image
      ?`<img src="${item.image}" alt="${esc(item.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:6px"/>`
      :`<div style="font-size:26px;display:flex;align-items:center;justify-content:center;height:100%">${catEmoji(item.category)}</div>`;
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}
function checkoutCart(){ toast('Checkout coming soon — store not yet live 🚧'); }
function clearCartConfirm(){ if(confirm('Clear your entire cart?')){ clearCart(); renderCart(); } }

/* ─────────────────────────────────────────────
   INIT ON EVERY PAGE
   ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded',()=>{
  applyTheme(getTheme());

  // Theme
  document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);

  // Header auth
  updateHeaderAuth();

  // Auth button (sign in / sign up)
  document.getElementById('headerAuthBtn')?.addEventListener('click', ()=>openAuthModal('signin'));

  // Admin panel
  document.getElementById('adminToggle')?.addEventListener('click', toggleAdminPanel);
  document.getElementById('apOverlay')?.addEventListener('click', closeAdminPanel);

  // Auth modal tabs & forms
  document.querySelectorAll('.auth-tab-btn').forEach(b=>b.addEventListener('click',()=>switchAuthTab(b.dataset.tab)));
  document.getElementById('authModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('authModal'))closeAuthModal();});
  document.getElementById('si_submitBtn')?.addEventListener('click',doSignIn);
  document.getElementById('su_submitBtn')?.addEventListener('click',doSignUp);
  document.getElementById('si_password')?.addEventListener('keydown',e=>{if(e.key==='Enter')doSignIn();});
  document.getElementById('su_password2')?.addEventListener('keydown',e=>{if(e.key==='Enter')doSignUp();});

  // Profile modal
  document.getElementById('profileModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('profileModal'))closeProfileModal();});
  document.getElementById('prof_avatarInput')?.addEventListener('change',handleProfileAvatar);
  document.getElementById('prof_saveBtn')?.addEventListener('click',saveProfile);
  document.getElementById('prof_cancelBtn')?.addEventListener('click',closeProfileModal);

  // Socials modal
  document.getElementById('socialsModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('socialsModal'))closeSocials();});

  // AP confirm
  document.getElementById('apConfirmYes')?.addEventListener('click',apDoConfirm);
  document.getElementById('apConfirmNo')?.addEventListener('click',apCloseConfirm);
  document.getElementById('apConfirmModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('apConfirmModal'))apCloseConfirm();});

  // Cart
  document.getElementById('cartModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('cartModal'))closeCart();});
  _updateCartBadges();

  // ESC
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      closeAuthModal(); closeSocials(); closeAdminPanel();
      closeProfileModal(); closeCart();
      apCloseConfirm();
    }
  });

  // Mark session user online
  const s=getSession();
  if(s) markOnline(s.id);

  // Render dynamic sections
  renderMembersDirectory?.();
  renderHomeActivity?.();
  _updateCartBadges();
});
