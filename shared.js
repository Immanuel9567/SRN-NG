'use strict';
/* ════════════════════════════════════════════════════════════════
   SIM RACING NG — shared.js  v5
   Universal backend: Supabase (cross-device) with localStorage fallback
   Roles: member | verified_racer | marketer | admin
   First user to sign up → auto admin
   ════════════════════════════════════════════════════════════════

   ── SETUP ─────────────────────────────────────────────────────
   1. Go to https://supabase.com → New project (free tier)
   2. Run this SQL in the Supabase SQL editor:

      CREATE TABLE srn_users (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz DEFAULT now()
      );
      CREATE TABLE srn_data (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz DEFAULT now()
      );
      ALTER TABLE srn_users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE srn_data  ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "public_read_users"  ON srn_users FOR SELECT USING (true);
      CREATE POLICY "public_write_users" ON srn_users FOR ALL    USING (true);
      CREATE POLICY "public_read_data"   ON srn_data  FOR SELECT USING (true);
      CREATE POLICY "public_write_data"  ON srn_data  FOR ALL    USING (true);

   3. Paste your project URL and anon key below.
   ──────────────────────────────────────────────────────────── */

const SRN_CONFIG = {
  supabaseUrl:  'https://ubksukwbckpoilocdsno.supabase.co',   // e.g. https://xyzabcde.supabase.co
  supabaseKey:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVia3N1a3diY2twb2lsb2Nkc25vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjYxODYsImV4cCI6MjA5Mzg0MjE4Nn0.ftJUIa3aXrTvq1w---k6DDSvLMwyMjq9f1lrjjD3nlU',
  useSupabase:  false, // ← set true after completing setup above
};

/* ── SUPABASE HELPERS ── */
const _sb = {
  url: SRN_CONFIG.supabaseUrl,
  key: SRN_CONFIG.supabaseKey,

  async _req(path, method='GET', body=null){
    const opts = {
      method,
      headers: {
        'apikey': this.key,
        'Authorization': 'Bearer '+this.key,
        'Content-Type': 'application/json',
        'Prefer': method==='POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal'
      }
    };
    if(body) opts.body = JSON.stringify(body);
    const r = await fetch(this.url+'/rest/v1/'+path, opts);
    if(!r.ok){ const t=await r.text(); throw new Error(t); }
    try { return await r.json(); } catch { return null; }
  },

  /* users table ──────────────────────── */
  async getUsers(){
    const rows = await this._req('srn_users?select=data&order=data->joinedAt');
    return (rows||[]).map(r=>r.data);
  },
  async saveUser(user){
    await this._req('srn_users', 'POST', {id: user.id, data: user, updated_at: new Date().toISOString()});
  },
  async saveUsers(users){
    // upsert all — fine for small user counts
    for(const u of users) await this.saveUser(u);
  },
  async deleteUser(id){
    await this._req('srn_users?id=eq.'+encodeURIComponent(id), 'DELETE');
  },

  /* generic key-value data table ────── */
  async getData(key){
    const rows = await this._req('srn_data?key=eq.'+encodeURIComponent(key)+'&select=value');
    if(!rows||!rows.length) return null;
    return rows[0].value;
  },
  async setData(key, value){
    await this._req('srn_data', 'POST', {key, value, updated_at: new Date().toISOString()});
  },
  async getUpdatedAt(key){
    const rows = await this._req('srn_data?key=eq.'+encodeURIComponent(key)+'&select=updated_at');
    if(!rows||!rows.length) return null;
    return rows[0].updated_at;
  }
};

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

/* ════════════════════════════════════════════════════════
   STORAGE LAYER — Supabase if configured, else localStorage
   ════════════════════════════════════════════════════════ */
const USE_SB = SRN_CONFIG.useSupabase && SRN_CONFIG.supabaseUrl !== 'YOUR_SUPABASE_URL';

/* Local fallback helpers */
function _lsGet(key, def){ try{ return JSON.parse(localStorage.getItem(key)) ?? def; } catch{ return def; } }
function _lsSet(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

/* ── Users ── */
async function getUsers(){
  if(USE_SB){ try{ return await _sb.getUsers(); } catch(e){ console.warn('SB getUsers',e); } }
  return _lsGet('srn_users', []);
}
async function saveUsers(users){
  if(USE_SB){ try{ await _sb.saveUsers(users); } catch(e){ console.warn('SB saveUsers',e); } }
  _lsSet('srn_users', users);
}
async function deleteUserById(id){
  if(USE_SB){ try{ await _sb.deleteUser(id); } catch(e){ console.warn('SB deleteUser',e); } }
  _lsSet('srn_users', _lsGet('srn_users',[]).filter(u=>u.id!==id));
}

/* ── Generic data (merch, news, newsletter, activity, pending, categories) ── */
async function _getData(key, def){
  if(USE_SB){ try{ const v=await _sb.getData(key); if(v!==null) return v; } catch(e){ console.warn('SB getData',key,e); } }
  return _lsGet(key, def);
}
async function _setData(key, val){
  if(USE_SB){ try{ await _sb.setData(key, val); } catch(e){ console.warn('SB setData',key,e); } }
  _lsSet(key, val);
}

/* ── Typed accessors ── */
async function getNews()       { return _getData('srn_news',       []); }
async function saveNews(n)     { return _setData('srn_news',       n);  }
async function getNewsletter() { return _getData('srn_newsletter',  []); }
async function saveNewsletter(n){ return _setData('srn_newsletter', n); }
async function getActivity()   { return _getData('srn_activity',   []); }
async function getPending()    { return _getData('srn_pending',     []); }
async function savePending(p)  { return _setData('srn_pending',     p); }
async function getCategories(){
  const saved = await _getData('srn_categories', null);
  if(saved && saved.length) return saved;
  return ['clothing','headwear','accessories'];
}
async function saveCategories(cats){ return _setData('srn_categories', cats); }

async function pushActivity(entry){
  const list = await getActivity();
  list.unshift({...entry, ts: Date.now()});
  await _setData('srn_activity', list.slice(0, 60));
}

/* ── Merch ── */
async function getMerch(){
  const stored = await _getData('srn_merch', null);
  if(stored && stored.length) return stored;
  const def = _defaultMerch();
  await _setData('srn_merch', def);
  return def;
}
async function saveMerch(m){ return _setData('srn_merch', m); }

function _defaultMerch(){
  return [
    {id:1,name:'Classic Logo Tee',  cat:'clothing',    price:12000,badge:'new',    desc:'100% cotton. SRN logo front, "NG" back. Available in black and white.',sizes:['S','M','L','XL','XXL'],image:null},
    {id:2,name:'Zip-Up Hoodie',     cat:'clothing',    price:22000,badge:'new',    desc:'Heavyweight fleece. Embroidered logo. Front zip, kangaroo pockets.',   sizes:['S','M','L','XL'],      image:null},
    {id:3,name:'Racing Jersey',     cat:'clothing',    price:18500,badge:'',       desc:'Breathable performance fabric. Sublimated print. Number customisation.',sizes:['S','M','L','XL','XXL'],image:null},
    {id:4,name:'Racing Snapback',   cat:'headwear',    price:9500, badge:'',       desc:'Flat-brim snapback. Embroidered logo. One size fits most.',              sizes:[],                      image:null},
    {id:5,name:'Dad Cap — NG',      cat:'headwear',    price:8000, badge:'',       desc:'Washed cotton, curved brim, adjustable strap.',                          sizes:[],                      image:null},
    {id:6,name:'Desk Mat — NG',     cat:'accessories', price:8000, badge:'',       desc:'900×400mm extended mat. Non-slip rubber base.',                          sizes:[],                      image:null},
    {id:7,name:'Sticker Pack',      cat:'accessories', price:2500, badge:'',       desc:'8 die-cut vinyl stickers. Waterproof.',                                  sizes:[],                      image:null},
    {id:8,name:'Neck Gaiter',       cat:'accessories', price:5000, badge:'limited',desc:'Stretch polyester. All-over print. Face cover or headband.',              sizes:[],                      image:null},
  ];
}

/* ── Session (always local — per-device session is correct) ── */
function getSession(){ return JSON.parse(sessionStorage.getItem('srn_session') || 'null'); }
function setSession(u){ sessionStorage.setItem('srn_session', JSON.stringify(u)); }
function clearSession(){ sessionStorage.removeItem('srn_session'); }

/* ── Online (session-local approximation) ── */
function getOnline(){ return JSON.parse(sessionStorage.getItem('srn_online') || '[]'); }
function markOnline(uid){ const l=getOnline(); if(!l.includes(uid)) l.push(uid); sessionStorage.setItem('srn_online',JSON.stringify(l)); }
function markOffline(uid){ sessionStorage.setItem('srn_online',JSON.stringify(getOnline().filter(x=>x!==uid))); }
function isOnline(uid){ return getOnline().includes(uid); }

/* ── Utils ── */
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtPrice(n){ return '₦'+Number(n).toLocaleString(); }
function catEmoji(c){ const map={clothing:'👕',headwear:'🧢',accessories:'🖱️'}; return map[c]||'📦'; }
function timeAgo(ts){
  const d=Date.now()-ts,m=Math.floor(d/60000),h=Math.floor(m/60),dy=Math.floor(h/24);
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
function setText(id,val){ const el=document.getElementById(id); if(el) el.textContent=val; }

function toast(msg, type='ok'){
  let t=document.getElementById('srnToast');
  if(!t){ t=document.createElement('div'); t.id='srnToast'; document.body.appendChild(t); }
  t.className='srn-toast srn-toast--'+type;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'), 3200);
}

/* ════════════════════════════════════════════════════════
   AUTO-REFRESH  — silent background polling (30s)
   ════════════════════════════════════════════════════════ */
let _lastMerchTs = null;
let _lastNewsTs  = null;
let _refreshInterval = null;

async function _silentRefresh(){
  if(!USE_SB) return; // only meaningful with Supabase
  try {
    // Check if merch data was updated remotely
    const mt = await _sb.getUpdatedAt('srn_merch');
    if(mt && mt !== _lastMerchTs){
      if(_lastMerchTs !== null){
        // Remote change — re-render without interrupting user
        typeof renderMerchPage === 'function' && await renderMerchPage();
        typeof renderHomeMerchPreview === 'function' && await renderHomeMerchPreview();
        toast('Store updated ✓', 'ok');
      }
      _lastMerchTs = mt;
    }
    const nt = await _sb.getUpdatedAt('srn_news');
    if(nt && nt !== _lastNewsTs){
      if(_lastNewsTs !== null){
        typeof renderNewsFeed === 'function' && await renderNewsFeed();
        toast('New content available ✓', 'ok');
      }
      _lastNewsTs = nt;
    }
  } catch(e){ /* silent — don't bother user */ }
}

function startAutoRefresh(){
  if(_refreshInterval) return;
  _refreshInterval = setInterval(_silentRefresh, 30000);
  _silentRefresh(); // seed timestamps on load
}

/* ════════════════════════════════════════════════════════
   HEADER AUTH
   ════════════════════════════════════════════════════════ */
async function updateHeaderAuth(){
  const s=getSession();
  const loginBtn   =document.getElementById('headerAuthBtn');
  const userChip   =document.getElementById('headerUserChip');
  const adminToggle=document.getElementById('adminToggle');
  const postNewsBtn=document.getElementById('postNewsBtn');

  if(s){
    const users=await getUsers();
    const u=users.find(x=>x.id===s.id)||s;
    if(loginBtn) loginBtn.style.display='none';
    if(userChip){
      userChip.style.display='flex';
      userChip.onclick=toggleUserPanel;
      userChip.title='My Account';
      userChip.style.cursor='pointer';
      userChip.innerHTML=`${avatarHTML(u,26)}<span class="huc-name">${esc(u.displayName||u.username)}</span>${roleBadgeHTML(u.role)}<span class="huc-chevron">›</span>`;
    }
    if(adminToggle) adminToggle.style.display=isAdmin(s)?'flex':'none';
    if(postNewsBtn) postNewsBtn.style.display=isAdmin(s)?'':'none';
  } else {
    if(loginBtn)    loginBtn.style.display='flex';
    if(userChip){   userChip.style.display='none'; userChip.onclick=null; }
    if(adminToggle) adminToggle.style.display='none';
    if(postNewsBtn) postNewsBtn.style.display='none';
  }
}

/* ════════════════════════════════════════════════════════
   AUTH MODAL
   ════════════════════════════════════════════════════════ */
let _authTab='signin';
function openAuthModal(tab){ _authTab=tab||'signin'; document.getElementById('authModal')?.classList.add('open'); document.body.style.overflow='hidden'; switchAuthTab(_authTab); setTimeout(()=>document.getElementById('authModal')?.querySelector('input')?.focus(),120); }
function closeAuthModal(){ document.getElementById('authModal')?.classList.remove('open'); document.body.style.overflow=''; }
function switchAuthTab(tab){
  _authTab=tab;
  document.querySelectorAll('.auth-tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.getElementById('authPane_signin').style.display=tab==='signin'?'':'none';
  document.getElementById('authPane_signup').style.display=tab==='signup'?'':'none';
  ['authErr_signin','authErr_signup'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
}

async function doSignIn(){
  const username=document.getElementById('si_username').value.trim().toLowerCase();
  const password=document.getElementById('si_password').value;
  const err=document.getElementById('authErr_signin');
  err.style.display='none';
  if(!username||!password){ err.textContent='Enter username and password.'; err.style.display='block'; return; }
  const btn=document.getElementById('si_submitBtn');
  if(btn){ btn.textContent='Signing in…'; btn.disabled=true; }
  try {
    const users=await getUsers();
    const user=users.find(u=>u.username.toLowerCase()===username&&u.password===password);
    if(!user){ err.textContent='Invalid username or password.'; err.style.display='block'; if(btn){btn.textContent='Sign In →';btn.disabled=false;} return; }
    _loginSuccess(user);
  } catch(e){
    err.textContent='Connection error — try again.'; err.style.display='block';
  }
  if(btn){btn.textContent='Sign In →';btn.disabled=false;}
}

async function doSignUp(){
  const displayName=document.getElementById('su_displayName').value.trim();
  const username   =document.getElementById('su_username').value.trim().toLowerCase().replace(/\s+/g,'');
  const password   =document.getElementById('su_password').value;
  const password2  =document.getElementById('su_password2').value;
  const err=document.getElementById('authErr_signup');
  err.style.display='none';
  if(!displayName){ err.textContent='Display name required.'; err.style.display='block'; return; }
  if(!username){ err.textContent='Username required.'; err.style.display='block'; return; }
  if(!/^[a-z0-9_]+$/.test(username)){ err.textContent='Username: lowercase, numbers, underscores only.'; err.style.display='block'; return; }
  if(password.length<6){ err.textContent='Password must be at least 6 characters.'; err.style.display='block'; return; }
  if(password!==password2){ err.textContent='Passwords do not match.'; err.style.display='block'; return; }
  const btn=document.getElementById('su_submitBtn');
  if(btn){ btn.textContent='Creating…'; btn.disabled=true; }
  try {
    const users=await getUsers();
    if(users.find(u=>u.username.toLowerCase()===username)){ err.textContent='Username already taken.'; err.style.display='block'; if(btn){btn.textContent='Create Account →';btn.disabled=false;} return; }
    const isFirst=users.length===0;
    const newUser={
      id:'u_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
      displayName,username,password,
      role:isFirst?'admin':'member',
      bio:'',avatar:null,joinedAt:new Date().toISOString()
    };
    users.push(newUser);
    await saveUsers(users);
    await pushActivity({type:'join',text:`${displayName} joined SIM Racing NG`});
    if(isFirst) await pushActivity({type:'role',text:`${displayName} is the first admin`});
    _loginSuccess(newUser);
  } catch(e){
    err.textContent='Connection error — try again.'; err.style.display='block';
  }
  if(btn){btn.textContent='Create Account →';btn.disabled=false;}
}

function _loginSuccess(user){
  setSession({id:user.id,username:user.username,displayName:user.displayName,role:user.role});
  markOnline(user.id);
  closeAuthModal();
  updateHeaderAuth();
  typeof renderHomeActivity==='function' && renderHomeActivity();
  toast(`Welcome${user.role==='admin'?' 💪':''}, ${user.displayName||user.username}!`);
}

async function doLogout(){
  const s=getSession();
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
function openSocials(){ document.getElementById('socialsModal')?.classList.add('open'); document.body.style.overflow='hidden'; }
function closeSocials(){ document.getElementById('socialsModal')?.classList.remove('open'); document.body.style.overflow=''; }

/* ════════════════════════════════════════════════════════
   USER SIDE PANEL
   ════════════════════════════════════════════════════════ */
let _upOpen=false, _upAvatarData=null;
function toggleUserPanel(){ _upOpen?closeUserPanel():openUserPanel(); }
async function openUserPanel(){
  _upOpen=true;
  document.getElementById('userPanel')?.classList.add('open');
  document.getElementById('upOverlay')?.classList.add('open');
  await _renderUserPanel();
}
function closeUserPanel(){
  _upOpen=false;
  document.getElementById('userPanel')?.classList.remove('open');
  document.getElementById('upOverlay')?.classList.remove('open');
}

async function _renderUserPanel(){
  const s=getSession(); if(!s) return;
  const users=await getUsers();
  const u=users.find(x=>x.id===s.id)||s;
  _upAvatarData=u.avatar||null;
  const avEl=document.getElementById('upAvatarDisplay');
  if(avEl) avEl.innerHTML=avatarHTML(u,56);
  setText('upNameDisplay',    u.displayName||u.username);
  setText('upUsernameDisplay','@'+u.username);
  const roleEl=document.getElementById('upRoleDisplay');
  if(roleEl) roleEl.innerHTML=roleBadgeHTML(u.role);
  setText('upJoinedDisplay','Member since '+new Date(u.joinedAt).toLocaleDateString('en-NG',{month:'short',year:'numeric'}));
  // No member count — removed by request
  const statsEl=document.getElementById('upStatsRow');
  if(statsEl) statsEl.innerHTML='';
  const cartCount=getCart().reduce((s,c)=>s+c.qty,0);
  const cartBtn=document.getElementById('upCartShortcut');
  if(cartBtn) cartBtn.innerHTML=`🛒 My Cart${cartCount>0?` <span class="up-cart-badge">${cartCount}</span>`:''}`;
  const dn=document.getElementById('upEditDisplayName'); if(dn) dn.value=u.displayName||'';
  const bio=document.getElementById('upEditBio');        if(bio) bio.value=u.bio||'';
  const cpf=document.getElementById('upChangePassForm'); if(cpf) cpf.style.display='none';
  ['upOldPass','upNewPass','upNewPass2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const cpe=document.getElementById('upPassErr'); if(cpe) cpe.style.display='none';
  // Danger zone collapsed by default
  const dz=document.getElementById('upDangerContent'); if(dz) dz.style.display='none';
  const dt=document.getElementById('upDangerToggle');
  if(dt){ dt.textContent='▸ Danger Zone'; dt.classList.remove('dz-open'); }
}

function upToggleDangerZone(){
  const dz=document.getElementById('upDangerContent');
  const dt=document.getElementById('upDangerToggle');
  if(!dz||!dt) return;
  const open=dz.style.display!=='none';
  dz.style.display=open?'none':'';
  dt.textContent=open?'▸ Danger Zone':'▾ Danger Zone';
  dt.classList.toggle('dz-open',!open);
}

async function upSaveProfile(){
  const s=getSession(); if(!s) return;
  const dn=document.getElementById('upEditDisplayName')?.value.trim();
  const bio=document.getElementById('upEditBio')?.value.trim();
  if(!dn){ toast('Display name required.','err'); return; }
  const users=await getUsers();
  const idx=users.findIndex(u=>u.id===s.id); if(idx<0) return;
  users[idx].displayName=dn; users[idx].bio=bio||'';
  if(_upAvatarData) users[idx].avatar=_upAvatarData;
  await saveUsers(users);
  setSession({...s,displayName:dn,role:users[idx].role});
  await _renderUserPanel();
  updateHeaderAuth();
  toast('Profile saved ✓');
}

function upHandleAvatar(e){
  const file=e.target.files[0]; if(!file) return;
  if(file.size>3*1024*1024){ toast('Image must be under 3MB','err'); return; }
  const r=new FileReader(); r.onload=ev=>{
    _upAvatarData=ev.target.result;
    const avEl=document.getElementById('upAvatarDisplay');
    if(avEl) avEl.innerHTML=`<img src="${_upAvatarData}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid var(--border-card)"/>`;
  }; r.readAsDataURL(file);
}

function upToggleChangePass(){
  const f=document.getElementById('upChangePassForm');
  if(f) f.style.display=f.style.display==='none'?'':'none';
}

async function upSavePassword(){
  const s=getSession(); if(!s) return;
  const oldP=document.getElementById('upOldPass')?.value;
  const newP=document.getElementById('upNewPass')?.value;
  const newP2=document.getElementById('upNewPass2')?.value;
  const err=document.getElementById('upPassErr');
  err.style.display='none';
  if(!oldP||!newP){ err.textContent='Fill in all fields.'; err.style.display='block'; return; }
  if(newP.length<6){ err.textContent='New password min 6 characters.'; err.style.display='block'; return; }
  if(newP!==newP2){ err.textContent='Passwords do not match.'; err.style.display='block'; return; }
  const users=await getUsers();
  const u=users.find(x=>x.id===s.id);
  if(!u||u.password!==oldP){ err.textContent='Current password incorrect.'; err.style.display='block'; return; }
  u.password=newP;
  await saveUsers(users);
  upToggleChangePass();
  toast('Password updated ✓');
}

async function upDeleteAccount(){
  const s=getSession(); if(!s) return;
  if(!confirm('Delete your account permanently? This cannot be undone.')) return;
  await deleteUserById(s.id);
  doLogout();
  toast('Account deleted.');
}

/* ════════════════════════════════════════════════════════
   ADMIN PANEL
   ════════════════════════════════════════════════════════ */
let _apOpen=false, _apUserTab='all', _apConfirmCb=null;
let _apEditId=null;

function toggleAdminPanel(){ _apOpen?closeAdminPanel():openAdminPanel(); }
async function openAdminPanel(){
  _apOpen=true;
  document.getElementById('adminPanel')?.classList.add('open');
  document.getElementById('apOverlay')?.classList.add('open');
  await _apRenderAll();
}
function closeAdminPanel(){
  _apOpen=false;
  document.getElementById('adminPanel')?.classList.remove('open');
  document.getElementById('apOverlay')?.classList.remove('open');
}
async function _apRenderAll(){ await apRenderUsers(); apUpdateOnlineBadge(); await apRenderNewsList(); await apRenderMembersList(); }

function apSwitchTab(tab, el){
  document.querySelectorAll('.ap-tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.ap-tab-pane').forEach(p=>p.style.display='none');
  el?.classList.add('active');
  const pane=document.getElementById('apTab_'+tab);
  if(pane) pane.style.display='';
  if(tab==='members') apRenderMembersList();
}

async function apRenderUsers(){
  const body=document.getElementById('apUserBody'); if(!body) return;
  apUpdateOnlineBadge();
  const s=getSession();
  let users=await getUsers();
  if(_apUserTab==='admins')    users=users.filter(u=>u.role==='admin');
  if(_apUserTab==='racers')    users=users.filter(u=>u.role==='verified_racer');
  if(_apUserTab==='marketers') users=users.filter(u=>u.role==='marketer');
  body.innerHTML=users.map(u=>{
    const self=s&&s.id===u.id;
    const online=isOnline(u.id);
    return `<div class="apu-row">
      ${avatarHTML(u,30)}
      <div class="apu-info">
        <div class="apu-name">${esc(u.displayName||u.username)}${self?'<span class="self-tag">you</span>':''}</div>
        <div class="apu-sub">@${esc(u.username)} <span class="${online?'dot-online':'dot-offline'}">${online?'●':'○'}</span></div>
      </div>
      <div class="apu-actions">
        ${!self?`<select class="ap-role-sel" onchange="apSetRole('${u.id}',this.value)">
          ${Object.entries(ROLES).map(([k,v])=>`<option value="${k}"${u.role===k?' selected':''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
        <button class="icon-btn danger" onclick="apRemoveUser('${u.id}','${esc(u.displayName||u.username)}')">✕</button>`:''}
      </div>
    </div>`;
  }).join('')||'<div class="ap-empty">No users in this filter.</div>';
}

async function apRenderMembersList(){
  const grid=document.getElementById('apMembersGrid'); if(!grid) return;
  const users=await getUsers();
  setText('apMemberCount', users.length+' members');
  grid.innerHTML=users.map(u=>{
    const online=isOnline(u.id);
    return `<div class="member-dir-card${online?' member-dir-card--online':''}">
      ${avatarHTML(u,40)}
      <div class="mdc-info">
        <div class="mdc-name">${esc(u.displayName||u.username)}</div>
        <div class="mdc-username">@${esc(u.username)}</div>
        ${roleBadgeHTML(u.role)}
      </div>
      <div class="mdc-online ${online?'dot-online':'dot-offline'}">${online?'●':'○'}</div>
    </div>`;
  }).join('')||'<div class="ap-empty" style="grid-column:1/-1">No members yet.</div>';
}

function apSwitchUserTab(tab, el){
  _apUserTab=tab;
  document.querySelectorAll('.ap-utab').forEach(b=>b.classList.remove('active'));
  el?.classList.add('active');
  apRenderUsers();
}

async function apSetRole(userId, newRole){
  const users=await getUsers();
  const u=users.find(x=>x.id===userId); if(!u) return;
  u.role=newRole;
  await saveUsers(users);
  apRenderUsers();
  await pushActivity({type:'role',text:`${u.displayName||u.username} promoted to ${roleInfo(newRole).label}`});
  toast(`${u.displayName||u.username} → ${roleInfo(newRole).label}`);
}

async function apRemoveUser(id, name){
  apOpenConfirm(`Remove "${name}"?`,'Their account will be deleted.',async()=>{
    await deleteUserById(id);
    apRenderUsers();
    toast('User removed.');
  });
}

function apUpdateOnlineBadge(){
  const cnt=getOnline().length;
  setText('apOnlineBadge',cnt+' online');
  getUsers().then(u=>setText('apUserCount',u.length+' users'));
}

async function apRenderNewsList(){
  const list=document.getElementById('apNewsList'); if(!list) return;
  const news=await getNews();
  if(!news.length){ list.innerHTML='<div class="ap-empty">No news yet.</div>'; return; }
  list.innerHTML=news.map(n=>`<div class="ap-news-row">
    <div class="ap-news-info">
      <div class="ap-news-title">${esc(n.title)}</div>
      <div class="ap-news-meta">${esc(n.tag||'News')} · ${timeAgo(n.ts)}</div>
    </div>
    <button class="icon-btn danger btn-sm" onclick="apDeleteNews(${n.id})">✕</button>
  </div>`).join('');
}

function apShowCreateAdmin(){
  const f=document.getElementById('apCreateAdminForm');
  if(f){ f.style.display=''; ['apCAName','apCAUsername','apCAPassword'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';}); }
  document.getElementById('apCAError').style.display='none';
}
function apCloseCreateAdmin(){ document.getElementById('apCreateAdminForm').style.display='none'; }
async function apCreateAdmin(){
  const name    =document.getElementById('apCAName').value.trim();
  const username=document.getElementById('apCAUsername').value.trim().toLowerCase().replace(/\s+/g,'');
  const password=document.getElementById('apCAPassword').value;
  const err=document.getElementById('apCAError');
  err.style.display='none';
  if(!username){ err.textContent='Username required.'; err.style.display='block'; return; }
  if(!/^[a-z0-9_]+$/.test(username)){ err.textContent='Lowercase, numbers, underscores only.'; err.style.display='block'; return; }
  if(password.length<6){ err.textContent='Password min 6 characters.'; err.style.display='block'; return; }
  const users=await getUsers();
  if(users.find(u=>u.username===username)){ err.textContent='Username taken.'; err.style.display='block'; return; }
  users.push({id:'adm_'+Date.now().toString(36),displayName:name||username,username,password,role:'admin',bio:'',avatar:null,joinedAt:new Date().toISOString()});
  await saveUsers(users);
  apCloseCreateAdmin();
  apRenderUsers();
  toast(`Admin "@${username}" created.`);
}

function apOpenConfirm(title,desc,cb){ _apConfirmCb=cb; setText('apConfirmTitle',title); setText('apConfirmDesc',desc); document.getElementById('apConfirmModal')?.classList.add('open'); }
function apCloseConfirm(){ document.getElementById('apConfirmModal')?.classList.remove('open'); _apConfirmCb=null; }
function apDoConfirm(){ _apConfirmCb?.(); apCloseConfirm(); }

/* ════════════════════════════════════════════════════════
   CATEGORIES — editable by admin/marketer
   ════════════════════════════════════════════════════════ */
async function openCatModal(){
  const s=getSession(); if(!canAddProduct(s)) return;
  const cats=await getCategories();
  const list=document.getElementById('catList');
  if(list) list.innerHTML=cats.map((c,i)=>`<div class="cat-row" data-idx="${i}">
    <input type="text" class="minput cat-inp" value="${esc(c)}" style="flex:1"/>
    <button class="icon-btn danger btn-sm" onclick="removeCatRow(${i})">✕</button>
  </div>`).join('');
  document.getElementById('catModal')?.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeCatModal(){ document.getElementById('catModal')?.classList.remove('open'); document.body.style.overflow=''; }
function addCatRow(){
  const list=document.getElementById('catList'); if(!list) return;
  const div=document.createElement('div'); div.className='cat-row';
  div.innerHTML=`<input type="text" class="minput cat-inp" value="" placeholder="category name" style="flex:1"/><button class="icon-btn danger btn-sm" onclick="this.closest('.cat-row').remove()">✕</button>`;
  list.appendChild(div);
}
function removeCatRow(i){ document.querySelectorAll('#catList .cat-row')[i]?.remove(); }
async function saveCatModal(){
  const inputs=document.querySelectorAll('#catList .cat-inp');
  const cats=[...inputs].map(i=>i.value.trim().toLowerCase().replace(/\s+/g,'_')).filter(Boolean);
  if(!cats.length){ toast('Need at least one category.','err'); return; }
  await saveCategories(cats);
  closeCatModal();
  toast('Categories saved ✓');
  typeof renderMerchPage==='function' && renderMerchPage();
  _rebuildCatSelects();
}
async function _rebuildCatSelects(){
  const cats=await getCategories();
  document.querySelectorAll('#prodCategory, #filterTabsDynamic').forEach(el=>{
    if(el.id==='prodCategory'){
      el.innerHTML=cats.map(c=>`<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1).replace(/_/g,' ')}</option>`).join('');
    }
  });
  // Rebuild filter tabs dynamically on merch page
  const ft=document.getElementById('filterTabs');
  if(ft){
    ft.innerHTML=`<button class="filter-tab active" data-filter="all" onclick="applyFilter(this)">All</button>`
      +cats.map(c=>`<button class="filter-tab" data-filter="${esc(c)}" onclick="applyFilter(this)">${c.charAt(0).toUpperCase()+c.slice(1).replace(/_/g,' ')}</button>`).join('');
  }
}

/* ════════════════════════════════════════════════════════
   PRODUCT SUBMIT / EDIT
   ════════════════════════════════════════════════════════ */
let _pendingImg=null;

async function openAddProductModal(editId=null){
  const s=getSession();
  if(!s){ openAuthModal('signin'); return; }
  _apEditId=editId;
  _pendingImg=null;
  const m=document.getElementById('addProductModal'); if(!m) return;

  const cats=await getCategories();
  const catSel=document.getElementById('prodCategory');
  if(catSel) catSel.innerHTML=cats.map(c=>`<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1).replace(/_/g,' ')}</option>`).join('');

  if(editId!==null){
    const items=await getMerch();
    const item=items.find(i=>i.id===editId);
    if(item){
      document.getElementById('prodFormTitle').textContent='Edit Product';
      document.getElementById('prodName').value=item.name||'';
      document.getElementById('prodDesc').value=item.desc||'';
      document.getElementById('prodSizes').value=(item.sizes||[]).join(', ');
      document.getElementById('prodPrice').value=item.price||'';
      if(catSel) catSel.value=item.cat||cats[0];
      document.getElementById('prodBadge').value=item.badge||'';
      if(item.image){ _pendingImg=item.image; const prev=document.getElementById('prodImgPreview'); if(prev){prev.src=item.image;prev.style.display='block';} }
      else { document.getElementById('prodImgPreview').style.display='none'; }
      const submitBtn=document.querySelector('#addProductModal .prod-submit-btn');
      if(submitBtn) submitBtn.textContent='Save Changes';
    }
  } else {
    document.getElementById('prodFormTitle').textContent='Submit Product';
    ['prodName','prodDesc','prodSizes','prodPrice'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    if(catSel) catSel.value=cats[0]||'clothing';
    document.getElementById('prodBadge').value='';
    document.getElementById('prodImgPreview').style.display='none';
    const submitBtn=document.querySelector('#addProductModal .prod-submit-btn');
    if(submitBtn) submitBtn.textContent=isAdmin(s)?'Publish Now':'Submit for Review';
  }
  const noteEl=document.getElementById('prodSubmitNote');
  if(noteEl&&editId===null){
    noteEl.textContent=isAdmin(s)?'✓ As admin, your product will be published immediately.':'📋 Your product will be sent to admins for review before publishing.';
    noteEl.className=isAdmin(s)?'prod-submit-note prod-note-admin':'prod-submit-note prod-note-pending';
    noteEl.style.display='';
  } else if(noteEl){ noteEl.style.display='none'; }
  document.getElementById('prodFormError').style.display='none';
  m.classList.add('open');
  document.body.style.overflow='hidden';
}

function closeAddProductModal(){ document.getElementById('addProductModal')?.classList.remove('open'); document.body.style.overflow=''; _apEditId=null; }

function prodHandleImg(e){
  const file=e.target.files[0]; if(!file) return;
  if(file.size>5*1024*1024){ toast('Image must be under 5MB','err'); return; }
  const r=new FileReader(); r.onload=ev=>{
    _pendingImg=ev.target.result;
    const prev=document.getElementById('prodImgPreview');
    if(prev){prev.src=_pendingImg;prev.style.display='block';}
  }; r.readAsDataURL(file);
}

async function prodSubmit(){
  const s=getSession(); if(!s){ toast('Sign in first.','err'); return; }
  const name =document.getElementById('prodName')?.value.trim();
  const price=parseFloat(document.getElementById('prodPrice')?.value);
  const err  =document.getElementById('prodFormError');
  err.style.display='none';
  if(!name){ err.textContent='Product name required.'; err.style.display='block'; return; }
  if(!price||price<=0){ err.textContent='Valid price required.'; err.style.display='block'; return; }
  const sizes=document.getElementById('prodSizes')?.value.split(',').map(s=>s.trim()).filter(Boolean)||[];
  const cat  =document.getElementById('prodCategory').value;
  const badge=document.getElementById('prodBadge').value;
  const desc =document.getElementById('prodDesc')?.value.trim()||'';

  if(_apEditId!==null){
    // Edit existing product
    const items=await getMerch();
    const idx=items.findIndex(i=>i.id===_apEditId);
    if(idx>=0){ items[idx]={...items[idx],name,price,cat,badge,desc,sizes,image:_pendingImg||items[idx].image}; await saveMerch(items); toast('Product updated ✓'); }
    closeAddProductModal();
    typeof renderMerchPage==='function' && await renderMerchPage();
    return;
  }

  if(isAdmin(s)){
    const items=await getMerch();
    items.push({id:Date.now(),name,price,cat,badge,desc,sizes,image:_pendingImg});
    await saveMerch(items);
    await pushActivity({type:'product',text:`New product published: ${name}`});
    toast('Product published ✓');
  } else {
    const pending=await getPending();
    pending.push({id:Date.now(),name,price,cat,badge,desc,sizes,image:_pendingImg,submittedBy:s.id,submittedByName:s.displayName||s.username,submittedAt:Date.now()});
    await savePending(pending);
    toast('Product submitted for review 📋');
  }
  closeAddProductModal();
  typeof renderMerchPage==='function' && await renderMerchPage();
  typeof renderPendingBadge==='function' && renderPendingBadge();
}

/* ════════════════════════════════════════════════════════
   NEWS
   ════════════════════════════════════════════════════════ */
async function renderNewsFeed(){
  const feed=document.getElementById('newsFeed'); if(!feed) return;
  const items=(await getNews()).slice(0,6);
  if(!items.length){ feed.innerHTML='<div class="news-empty">No news yet — check back soon!</div>'; return; }
  feed.innerHTML=items.map(n=>`
    <div class="news-card">
      ${n.image?`<div class="news-card-img"><img src="${n.image}" alt="${esc(n.title)}"/></div>`:''}
      <div class="news-card-body">
        <div class="news-card-meta"><span class="news-tag">${esc(n.tag||'News')}</span><span class="news-date">${timeAgo(n.ts)}</span></div>
        <h3 class="news-card-title">${esc(n.title)}</h3>
        <p class="news-card-excerpt">${esc(n.excerpt||'')}</p>
        ${n.body?`<button class="news-read-more" onclick="openNewsModal(${n.id})">Read more →</button>`:''}
      </div>
    </div>`).join('');
}

async function openNewsModal(id){
  const n=(await getNews()).find(x=>x.id===id); if(!n) return;
  setText('newsModalTitle',n.title);
  const body=document.getElementById('newsModalBody');
  if(body) body.innerHTML=`
    ${n.image?`<img src="${n.image}" alt="${esc(n.title)}" style="width:100%;border-radius:10px;margin-bottom:1rem;max-height:240px;object-fit:cover"/>` :''}
    <div class="news-meta-row"><span class="news-tag">${esc(n.tag||'News')}</span><span class="news-date">${timeAgo(n.ts)}</span></div>
    <p style="font-size:14px;line-height:1.75;color:var(--text-secondary);margin-top:1rem;white-space:pre-wrap">${esc(n.body||n.excerpt||'')}</p>`;
  document.getElementById('newsModal')?.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeNewsModal(){ document.getElementById('newsModal')?.classList.remove('open'); document.body.style.overflow=''; }

function openPostNewsModal(){
  const m=document.getElementById('postNewsModal'); if(!m) return;
  m.classList.add('open'); document.body.style.overflow='hidden';
  ['newsPostTitle','newsPostExcerpt','newsPostBody','newsPostTag'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('newsPostImgPreview').style.display='none';
  document.getElementById('newsPostError').style.display='none';
  _newsPostImg=null;
}
function closePostNewsModal(){ document.getElementById('postNewsModal')?.classList.remove('open'); document.body.style.overflow=''; }
let _newsPostImg=null;
function newsPostHandleImg(e){
  const file=e.target.files[0]; if(!file) return;
  if(file.size>5*1024*1024){ toast('Image must be under 5MB','err'); return; }
  const r=new FileReader(); r.onload=ev=>{
    _newsPostImg=ev.target.result;
    const p=document.getElementById('newsPostImgPreview');
    if(p){p.src=_newsPostImg;p.style.display='block';}
  }; r.readAsDataURL(file);
}
async function newsPostSubmit(){
  const title  =document.getElementById('newsPostTitle')?.value.trim();
  const excerpt=document.getElementById('newsPostExcerpt')?.value.trim();
  const body   =document.getElementById('newsPostBody')?.value.trim();
  const tag    =document.getElementById('newsPostTag')?.value.trim()||'News';
  const err    =document.getElementById('newsPostError');
  err.style.display='none';
  if(!title){ err.textContent='Title required.'; err.style.display='block'; return; }
  if(!excerpt){ err.textContent='Excerpt required.'; err.style.display='block'; return; }
  const news=await getNews();
  news.unshift({id:Date.now(),title,excerpt,body,tag,image:_newsPostImg,ts:Date.now()});
  await saveNews(news);
  closePostNewsModal();
  await renderNewsFeed?.();
  await apRenderNewsList?.();
  toast('News post published ✓');
}
async function apDeleteNews(id){
  apOpenConfirm('Delete this news post?','This cannot be undone.',async()=>{
    await saveNews((await getNews()).filter(n=>n.id!==id));
    typeof renderNewsFeed==='function' && renderNewsFeed();
    apRenderNewsList();
    toast('News post deleted.');
  });
}

/* ════════════════════════════════════════════════════════
   NEWSLETTER
   ════════════════════════════════════════════════════════ */
async function handleNewsletterSignup(e){
  e.preventDefault();
  const input=e.target.querySelector('input[type=email]');
  const btn  =e.target.querySelector('button[type=submit]');
  const email=input?.value.trim();
  if(!email) return;
  const list=await getNewsletter();
  if(list.includes(email)){ toast("You're already subscribed!",'ok'); return; }
  list.push(email);
  await saveNewsletter(list);
  if(btn){btn.textContent="You're in! 🏁";btn.disabled=true;btn.style.opacity='0.7';}
  if(input) input.value='';
  toast('Subscribed to the newsletter ✓');
}

/* ════════════════════════════════════════════════════════
   ACTIVITY FEED
   ════════════════════════════════════════════════════════ */
async function renderHomeActivity(){
  const feed=document.getElementById('activityFeed'); if(!feed) return;
  const items=await getActivity();
  if(!items.length){ feed.innerHTML='<div class="feed-empty">No activity yet — be the first to join!</div>'; return; }
  feed.innerHTML=items.slice(0,8).map(item=>{
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
async function addToCart(productId, size){
  const items=await getMerch();
  const item=items.find(p=>p.id===productId); if(!item) return;
  const cart=getCart();
  const key=productId+(size?'_'+size:'');
  const ex=cart.find(c=>c.key===key);
  if(ex) ex.qty++;
  else cart.push({key,id:productId,name:item.name,price:item.price,size:size||null,image:item.image,cat:item.cat,qty:1});
  saveCart(cart);
  toast('Added to cart ✓');
}
function removeFromCart(key){ saveCart(getCart().filter(c=>c.key!==key)); }
function updateCartQty(key,delta){ const cart=getCart(); const item=cart.find(c=>c.key===key); if(!item) return; item.qty=Math.max(1,item.qty+delta); saveCart(cart); }
function clearCart(){ saveCart([]); }
function _updateCartBadge(){
  const total=getCart().reduce((s,c)=>s+c.qty,0);
  const fb=document.getElementById('cartFloatBadge');
  if(fb){fb.textContent=total;fb.style.display=total?'flex':'none';}
  const cartBtn=document.getElementById('upCartShortcut');
  if(cartBtn) cartBtn.innerHTML=`🛒 My Cart${total>0?` <span class="up-cart-badge">${total}</span>`:''}`;
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
  if(!cart.length){ list.innerHTML=''; if(footer)footer.style.display='none'; if(empty)empty.style.display='flex'; return; }
  if(empty)empty.style.display='none'; if(footer)footer.style.display='block';
  const subtotal=cart.reduce((s,c)=>s+(c.price*c.qty),0);
  setText('cartSubtotal','₦'+subtotal.toLocaleString());
  list.innerHTML=cart.map(item=>{
    const thumb=item.image?`<img src="${item.image}" alt="${esc(item.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:6px"/>`:`<div style="font-size:24px;display:flex;align-items:center;justify-content:center;height:100%">${catEmoji(item.cat)}</div>`;
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
   INIT — runs on every page
   ════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async ()=>{
  applyTheme(getTheme());
  document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);

  await updateHeaderAuth();
  document.getElementById('headerAuthBtn')?.addEventListener('click', ()=>openAuthModal('signin'));
  document.getElementById('adminToggle')?.addEventListener('click', toggleAdminPanel);
  document.getElementById('apOverlay')?.addEventListener('click', closeAdminPanel);

  document.querySelectorAll('.auth-tab-btn').forEach(b=>b.addEventListener('click',()=>switchAuthTab(b.dataset.tab)));
  document.getElementById('authModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('authModal'))closeAuthModal();});
  document.getElementById('si_submitBtn')?.addEventListener('click', doSignIn);
  document.getElementById('su_submitBtn')?.addEventListener('click', doSignUp);
  document.getElementById('si_password')?.addEventListener('keydown',e=>{if(e.key==='Enter')doSignIn();});
  document.getElementById('su_password2')?.addEventListener('keydown',e=>{if(e.key==='Enter')doSignUp();});

  document.getElementById('upOverlay')?.addEventListener('click', closeUserPanel);
  document.getElementById('upAvatarInput')?.addEventListener('change', upHandleAvatar);
  document.getElementById('upSaveProfileBtn')?.addEventListener('click', upSaveProfile);
  document.getElementById('upChangePassToggle')?.addEventListener('click', upToggleChangePass);
  document.getElementById('upSavePassBtn')?.addEventListener('click', upSavePassword);
  document.getElementById('upDeleteBtn')?.addEventListener('click', upDeleteAccount);
  document.getElementById('upDangerToggle')?.addEventListener('click', upToggleDangerZone);
  document.getElementById('upCartShortcut')?.addEventListener('click', ()=>{ closeUserPanel(); setTimeout(openCart,200); });
  document.getElementById('upLogoutBtn')?.addEventListener('click', doLogout);

  document.getElementById('socialsModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('socialsModal'))closeSocials();});

  document.getElementById('apConfirmYes')?.addEventListener('click', apDoConfirm);
  document.getElementById('apConfirmNo')?.addEventListener('click',  apCloseConfirm);
  document.getElementById('apConfirmModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('apConfirmModal'))apCloseConfirm();});

  document.getElementById('addProductModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('addProductModal'))closeAddProductModal();});
  document.getElementById('prodImgInput')?.addEventListener('change', prodHandleImg);
  document.getElementById('newsModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('newsModal'))closeNewsModal();});
  document.getElementById('postNewsModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('postNewsModal'))closePostNewsModal();});
  document.getElementById('newsPostImgInput')?.addEventListener('change', newsPostHandleImg);
  document.getElementById('catModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('catModal'))closeCatModal();});
  document.getElementById('cartModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('cartModal'))closeCart();});

  _updateCartBadge();

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      closeAuthModal(); closeSocials(); closeAdminPanel(); closeUserPanel();
      closeCart(); closeAddProductModal(); closeNewsModal(); closePostNewsModal();
      apCloseConfirm(); closeCatModal();
      const pp=document.getElementById('productPopup'); if(pp) closeProductPopup();
    }
  });

  const s=getSession();
  if(s) markOnline(s.id);

  typeof renderHomeActivity==='function' && renderHomeActivity();
  typeof renderNewsFeed==='function' && renderNewsFeed();
  typeof renderPendingBadge==='function' && renderPendingBadge();

  startAutoRefresh();
});
