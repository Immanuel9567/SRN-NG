// SRN API client. Classic script (no ES modules) to match the rest of js/.
// Exposes a single global: SRN
//
// Every page calls SRN.* and falls back to the js/data.js mock collections when the
// API is not reachable, so the static `vite build` output still renders on its own.
//
// LOCAL ACCOUNTS: when there is no /api (a plain static deployment: GitHub Pages,
// `vite preview`, dist/ on any file host), the account system does not go dead.
// Signup, sign-in, profiles, RSVPs, submissions and orders all run against a
// browser-local datastore kept in localStorage. That data lives in one browser
// only -- it is a stopgap until the Node server in server/ is hosted somewhere.

const SRN = (() => {
  // Escape anything that came from a user before it goes into innerHTML.
  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function request(method, path, body) {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status, data });
    return data;
  }

  // js/data.js declares its collections with `const`, so they are visible to other
  // classic scripts by bare name but are NOT properties of window. Reference them
  // directly; window['ACTIVITIES'] would always be undefined.
  const MOCKS = {
    ACTIVITIES: () => (typeof ACTIVITIES !== 'undefined' ? ACTIVITIES : []),
    NEWS: () => (typeof NEWS !== 'undefined' ? NEWS : []),
    GAMES: () => (typeof GAMES !== 'undefined' ? GAMES : []),
    MEMBERS: () => (typeof MEMBERS !== 'undefined' ? MEMBERS : []),
    MERCH: () => (typeof MERCH !== 'undefined' ? MERCH : []),
    RIGS: () => (typeof RIGS !== 'undefined' ? RIGS : []),
  };
  const mock = (name) => (MOCKS[name] ? MOCKS[name]() : []);

  // ---- local datastore ----------------------------------------------------

  const LOCAL_KEY = 'srn.local.v1';

  // localStorage throws in a sandboxed iframe and is absent under some file://
  // configurations. Fall back to memory so nothing on the page explodes; the
  // account simply does not survive a reload in that case.
  const storage = (() => {
    try {
      const probe = '__srn_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    } catch {
      const mem = new Map();
      return {
        getItem: (k) => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => mem.set(k, String(v)),
        removeItem: (k) => mem.delete(k),
      };
    }
  })();

  const LOCAL_SHAPE = {
    users: [], members: [], events: [], merch: [], rigs: [], orders: [],
    messages: [], newsletter: [], rsvps: {}, session: null,
  };

  function readLocal() {
    let parsed = null;
    try { parsed = JSON.parse(storage.getItem(LOCAL_KEY) || 'null'); } catch { parsed = null; }
    const state = parsed && typeof parsed === 'object' ? parsed : {};
    for (const [key, blank] of Object.entries(LOCAL_SHAPE)) {
      if (Array.isArray(blank)) { if (!Array.isArray(state[key])) state[key] = []; }
      else if (blank && typeof blank === 'object') { if (!state[key] || typeof state[key] !== 'object') state[key] = {}; }
      else if (state[key] === undefined) state[key] = blank;
    }
    return state;
  }

  function writeLocal(state) {
    try { storage.setItem(LOCAL_KEY, JSON.stringify(state)); } catch { /* quota or private mode */ }
    return state;
  }

  function localId(prefix) {
    const bytes = new Uint8Array(8);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  // Passwords are never stored in plaintext, not even in localStorage. WebCrypto
  // needs a secure context (https or localhost); on plain http we degrade to a
  // non-cryptographic digest rather than storing the password itself.
  async function localHash(password, salt) {
    const text = `${salt}:${password}`;
    const subtle = globalThis.crypto?.subtle;
    if (subtle?.digest) {
      const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
      return `s256:${Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')}`;
    }
    let a = 0x811c9dc5;
    let b = 0x01000193;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      a = Math.imul(a ^ code, 16777619) >>> 0;
      b = Math.imul(b + code * (i + 1), 2654435761) >>> 0;
    }
    return `fnv:${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
  }

  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

  // Mirror the server's publicUser(): credential material never reaches a caller.
  const localPublic = (user) => (user ? {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    vendor: user.vendor,
    interests: user.interests || [],
    createdAt: user.createdAt,
  } : null);

  function localActor(state = readLocal()) {
    return state.users.find((u) => u.id === state.session) || null;
  }

  function requireLocalActor(state, message) {
    const actor = localActor(state);
    if (!actor) fail(message, 401);
    return actor;
  }

  const LOCAL_USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;
  const LOCAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const trim = (value, max) => String(value ?? '').trim().slice(0, max);

  function localProfileFor(state, user) {
    let profile = state.members.find((m) => m.userId === user.id);
    if (profile) return profile;
    profile = {
      id: localId('mem'),
      userId: user.id,
      name: user.username,
      city: '',
      rank: 'Unranked',
      sim: '',
      avatar: 'media/placeholder.png',
      joined: String(new Date().getFullYear()),
      bio: '',
      stats: { races: 0, wins: 0, podiums: 0 },
      activity: [],
      socials: {},
      gamesPlayed: [],
      local: true,
    };
    state.members.push(profile);
    return profile;
  }

  // Mock content plus anything this browser has added, with local RSVPs applied.
  function localEventList(scope) {
    const state = readLocal();
    const merged = [...mock('ACTIVITIES'), ...state.events]
      .map((e) => ({ ...e, rsvps: state.rsvps[e.id] || e.rsvps || [] }));
    return scope === 'all' ? merged : merged.filter((e) => e.status !== 'pending');
  }

  function localMemberList() {
    const state = readLocal();
    const local = state.members.filter((m) => !mock('MEMBERS').some((x) => x.id === m.id));
    return [...mock('MEMBERS'), ...local];
  }

  function localMerchList(scope) {
    const state = readLocal();
    const merged = [...mock('MERCH'), ...state.merch];
    return scope === 'all' ? merged : merged.filter((m) => m.status !== 'pending');
  }

  function localRigList(scope) {
    const state = readLocal();
    const merged = [...mock('RIGS'), ...state.rigs];
    return scope === 'all' ? merged : merged.filter((r) => r.status !== 'pending');
  }

  function localMe() {
    const state = readLocal();
    const user = localActor(state);
    if (!user) return null;
    const profile = state.members.find((m) => m.userId === user.id);
    return {
      ...localPublic(user),
      avatar: profile?.avatar || 'media/placeholder.png',
      memberId: profile?.id || null,
      local: true,
    };
  }

  const local = {
    async signup(payload = {}) {
      const state = readLocal();
      const username = trim(payload.username, 24);
      const email = trim(payload.email, 200).toLowerCase();
      const password = String(payload.password ?? '');
      const vendor = payload.vendor === true || payload.vendor === 'true' || payload.vendor === 'on';

      if (!LOCAL_USERNAME_RE.test(username)) {
        fail('Username must be 3-24 characters: letters, numbers, dot, underscore, dash.');
      }
      if (!LOCAL_EMAIL_RE.test(email)) fail('Enter a valid email address.');
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        fail('Password must be at least 8 characters and include a letter and a number.');
      }
      if (state.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        fail('That username is already taken.', 409);
      }
      if (state.users.some((u) => u.email === email)) fail('That email is already registered.', 409);

      // Signup can never mint an admin here either: vendor -> salesperson, else user.
      const salt = localId('slt');
      const user = {
        id: localId('usr'),
        username,
        email,
        role: vendor ? 'salesperson' : 'user',
        vendor,
        interests: [],
        salt,
        hash: await localHash(password, salt),
        createdAt: new Date().toISOString(),
        local: true,
      };
      state.users.push(user);
      const profile = localProfileFor(state, user);
      state.session = user.id;
      writeLocal(state);
      return { user: localPublic(user), profile, local: true };
    },

    async login(payload = {}) {
      const state = readLocal();
      const email = trim(payload.email, 200).toLowerCase();
      const user = state.users.find((u) => u.email === email);
      // Same answer for an unknown email and a wrong password.
      const ok = user && (await localHash(String(payload.password ?? ''), user.salt)) === user.hash;
      if (!ok) fail('Email or password is incorrect.', 401);
      state.session = user.id;
      writeLocal(state);
      return { user: localPublic(user), local: true };
    },

    async logout() {
      const state = readLocal();
      state.session = null;
      writeLocal(state);
      return { ok: true };
    },

    async setInterests(interests) {
      const state = readLocal();
      const actor = requireLocalActor(state, 'Sign in to choose your interests.');
      const wanted = Array.isArray(interests) ? interests : [];
      if (wanted.length > 20) fail('Pick at most 20 interests.');
      const valid = new Set(mock('GAMES').map((g) => g.id));
      const unknown = wanted.filter((id) => valid.size && !valid.has(id));
      if (unknown.length) fail(`Unknown game(s): ${unknown.join(', ')}.`);
      actor.interests = [...new Set(wanted)];
      writeLocal(state);
      return { interests: actor.interests };
    },

    async updateProfile(payload = {}) {
      const state = readLocal();
      const actor = requireLocalActor(state, 'Sign in to edit your profile.');
      const mine = localProfileFor(state, actor);
      for (const field of ['city', 'sim', 'bio', 'avatar']) {
        if (payload[field] !== undefined) mine[field] = trim(payload[field], field === 'bio' ? 1000 : 200);
      }
      if (payload.socials !== undefined && payload.socials) {
        mine.socials = { ...(mine.socials || {}), ...payload.socials };
      }
      if (payload.gamesPlayed !== undefined) {
        const wanted = Array.isArray(payload.gamesPlayed) ? payload.gamesPlayed : [];
        if (wanted.length > 20) fail('Pick at most 20 games.');
        const valid = new Set(mock('GAMES').map((g) => g.id));
        mine.gamesPlayed = [...new Set(wanted.filter((id) => !valid.size || valid.has(id)))];
      }
      // No disk to write to offline, so an attached photo is kept as a data URL.
      if (payload.photo) {
        if (String(payload.photo).length > 2_800_000) fail('Photo must be under 2 MB.');
        mine.avatar = String(payload.photo);
      }
      mine.name = actor.username;
      writeLocal(state);
      return { member: mine };
    },

    async submitEvent(payload = {}) {
      const state = readLocal();
      const actor = requireLocalActor(state, 'Sign in to submit an event.');
      const missing = ['title', 'date', 'time', 'location', 'type', 'description']
        .filter((f) => !String(payload[f] ?? '').trim());
      if (missing.length) fail(`Missing required field(s): ${missing.join(', ')}.`);

      const wantedGame = trim(payload.game, 40) || 'general';
      const event = {
        id: localId('evt'),
        title: trim(payload.title, 120),
        date: trim(payload.date, 40),
        time: trim(payload.time, 40),
        location: trim(payload.location, 120),
        type: trim(payload.type, 40),
        game: mock('GAMES').some((g) => g.id === wantedGame) ? wantedGame : 'general',
        description: trim(payload.description, 1000),
        img: trim(payload.img, 500) || 'media/placeholder.png',
        // There is no admin queue in this browser, so an offline submission is
        // published straight away instead of waiting forever for a review.
        status: 'upcoming',
        submittedBy: actor.username,
        submittedById: actor.id,
        rsvps: [],
        createdAt: new Date().toISOString(),
        local: true,
      };
      state.events.push(event);
      writeLocal(state);
      return { event, pending: false, message: 'Event added. It is saved in this browser only.' };
    },

    async toggleRsvp(id) {
      const state = readLocal();
      const actor = requireLocalActor(state, 'Sign in to RSVP.');
      const known = [...mock('ACTIVITIES'), ...state.events].find((e) => e.id === id);
      if (!known) fail('No such event.', 404);
      const list = state.rsvps[id] || known.rsvps || [];
      const at = list.indexOf(actor.id);
      const attending = at === -1;
      if (attending) list.push(actor.id); else list.splice(at, 1);
      state.rsvps[id] = list;
      writeLocal(state);
      return { attending, count: list.length };
    },

    async listMerch(payload = {}) {
      const state = readLocal();
      const actor = requireLocalActor(state, 'Sign in to list an item.');
      if (actor.role !== 'salesperson' && actor.role !== 'admin') {
        fail('Only salespeople and admins can list merchandise.', 403);
      }
      const missing = ['name', 'category', 'price'].filter((f) => !String(payload[f] ?? '').trim());
      if (missing.length) fail(`Missing required field(s): ${missing.join(', ')}.`);
      const price = Number(payload.price);
      if (!Number.isFinite(price) || price < 0 || price > 100_000_000) {
        fail('Price must be a positive number in Naira.');
      }
      const item = {
        id: localId('mer'),
        name: trim(payload.name, 120),
        category: trim(payload.category, 60),
        description: trim(payload.description, 600),
        price: Math.round(price),
        img: trim(payload.img, 500) || 'media/placeholder.png',
        status: 'approved',
        listedBy: actor.username,
        listedById: actor.id,
        createdAt: new Date().toISOString(),
        local: true,
      };
      state.merch.push(item);
      writeLocal(state);
      return { item, pending: false, message: 'Listing saved in this browser.' };
    },

    async submitRig(payload = {}) {
      const state = readLocal();
      const actor = requireLocalActor(state, 'Sign in to submit a rig.');
      const missing = ['name', 'owner'].filter((f) => !String(payload[f] ?? '').trim());
      if (missing.length) fail(`Missing required field(s): ${missing.join(', ')}.`);
      const specs = Array.isArray(payload.specs)
        ? payload.specs.filter((s) => s && s.label && s.value).slice(0, 12)
          .map((s) => ({ label: trim(s.label, 40), value: trim(s.value, 80) }))
        : [];
      const rig = {
        id: localId('rig'),
        name: trim(payload.name, 120),
        owner: trim(payload.owner, 60),
        ownerId: trim(payload.ownerId, 40) || null,
        city: trim(payload.city, 80),
        img: payload.photo ? String(payload.photo) : (trim(payload.img, 500) || 'media/placeholder.png'),
        specs,
        notes: trim(payload.notes, 1000),
        status: 'approved',
        submittedBy: actor.username,
        submittedById: actor.id,
        createdAt: new Date().toISOString(),
        local: true,
      };
      state.rigs.push(rig);
      writeLocal(state);
      return { rig, pending: false, message: 'Rig saved in this browser.' };
    },

    async placeOrder(items) {
      const state = readLocal();
      const actor = requireLocalActor(state, 'Sign in to place an order.');
      const wanted = Array.isArray(items) ? items : [];
      if (!wanted.length) fail('Your cart is empty.');
      if (wanted.length > 50) fail('Too many line items in one order.');

      const catalogue = localMerchList();
      const lines = [];
      let total = 0;
      for (const raw of wanted) {
        const product = catalogue.find((m) => m.id === raw?.id);
        if (!product) fail(`Unknown or unavailable item: ${raw?.id}`);
        const qty = Math.floor(Number(raw?.qty));
        if (!Number.isFinite(qty) || qty < 1 || qty > 99) fail(`Invalid quantity for ${product.name}.`);
        lines.push({ id: product.id, name: product.name, price: product.price, qty });
        total += product.price * qty;
      }
      const order = {
        id: localId('ord'),
        userId: actor.id,
        username: actor.username,
        email: actor.email,
        items: lines,
        total,
        status: 'new',
        createdAt: new Date().toISOString(),
        local: true,
      };
      state.orders.push(order);
      writeLocal(state);
      return { order, message: `Order saved locally. Total ${total.toLocaleString('en-NG')} naira.` };
    },

    async orders() {
      const state = readLocal();
      const actor = requireLocalActor(state, 'Sign in to view orders.');
      return { orders: state.orders.filter((o) => o.userId === actor.id).reverse() };
    },

    async subscribe(email) {
      const state = readLocal();
      const clean = trim(email, 200).toLowerCase();
      if (!LOCAL_EMAIL_RE.test(clean)) fail('Enter a valid email address.');
      if (state.newsletter.some((s) => s.email === clean)) fail('That email is already subscribed.', 409);
      state.newsletter.push({ email: clean, createdAt: new Date().toISOString() });
      writeLocal(state);
      return { ok: true, message: 'You are on the list. Race updates incoming.' };
    },

    async sendMessage(payload = {}) {
      const state = readLocal();
      const missing = ['name', 'email', 'message'].filter((f) => !String(payload[f] ?? '').trim());
      if (missing.length) fail(`Missing required field(s): ${missing.join(', ')}.`);
      if (!LOCAL_EMAIL_RE.test(trim(payload.email, 200))) fail('Enter a valid email address.');
      const entry = {
        id: localId('msg'),
        name: trim(payload.name, 80),
        email: trim(payload.email, 200),
        subject: trim(payload.subject, 160),
        message: trim(payload.message, 2000),
        read: false,
        createdAt: new Date().toISOString(),
      };
      state.messages.push(entry);
      writeLocal(state);
      return { ok: true, id: entry.id, message: 'Message saved. It will reach SRN once the server is live.' };
    },
  };

  // ---- transport ----------------------------------------------------------

  // One probe per page load: does this origin actually serve the API? A static
  // host answers /api/* with its own HTML 404 page, which is how we tell them apart.
  let apiProbe = null;
  function apiAvailable() {
    if (!apiProbe) {
      apiProbe = fetch('/api/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then((res) => (res.headers.get('content-type') || '').includes('json'))
        .catch(() => false);
    }
    return apiProbe;
  }

  const NO_SERVER = 'This needs the SRN server. It is not available in offline mode.';

  // Runs the real API call when there is a server, and the local equivalent when
  // there is not. A real API error (400/401/409...) is always surfaced as-is:
  // only a transport failure falls through to the local store.
  async function api(method, path, body, localFn) {
    if (await apiAvailable()) {
      try {
        return await request(method, path, body);
      } catch (err) {
        if (err.status || !localFn) throw err;
        apiProbe = Promise.resolve(false); // server went away mid-session
      }
    }
    if (!localFn) throw Object.assign(new Error(NO_SERVER), { status: 503 });
    return localFn();
  }

  // GET helper for read-only content: the API when present, otherwise local data.
  const read = (path, localFn) => api('GET', path, null, localFn);

  // ---- toasts -------------------------------------------------------------
  function toast(message, kind = 'info') {
    let host = document.getElementById('srn-toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'srn-toasts';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `srn-toast srn-toast-${kind}`;
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 300);
    }, 4200);
  }

  // ---- skeletons ----------------------------------------------------------
  function skeleton(count, height = '7rem') {
    return Array.from({ length: count }, () =>
      `<div class="srn-skeleton" style="height: ${height};"></div>`).join('');
  }

  let cachedMe;
  async function me(force = false) {
    if (cachedMe && !force) return cachedMe;
    if (await apiAvailable()) {
      try {
        cachedMe = (await request('GET', '/api/auth/me')).user;
      } catch {
        cachedMe = null;
      }
    } else {
      cachedMe = localMe();
    }
    return cachedMe;
  }

  // Keep the cached identity in step with a signup or sign-in that just succeeded,
  // so the navbar repaints without a reload.
  function adoptUser(res) {
    if (res?.user) {
      cachedMe = {
        ...res.user,
        avatar: res.profile?.avatar || res.user.avatar || 'media/placeholder.png',
        memberId: res.profile?.id || res.user.memberId || null,
      };
    }
    return res;
  }

  return {
    esc,
    me,
    toast,
    skeleton,

    // True when this page is running without the Node API (static deployment).
    offline: async () => !(await apiAvailable()),

    // accounts
    signup: (payload) => api('POST', '/api/auth/signup', payload, () => local.signup(payload)).then(adoptUser),
    login: (payload) => api('POST', '/api/auth/login', payload, () => local.login(payload)).then(adoptUser),
    logout: async () => { cachedMe = null; return api('POST', '/api/auth/logout', null, () => local.logout()); },

    // content
    events: (scope) => read(scope ? `/api/events?scope=${scope}` : '/api/events',
      () => ({ events: localEventList(scope) })),
    submitEvent: (payload) => api('POST', '/api/events', payload, () => local.submitEvent(payload)),
    setEventStatus: (id, status) => api('PATCH', `/api/events/${id}/status`, { status }),
    toggleRsvp: (id) => api('POST', `/api/events/${id}/rsvp`, null, () => local.toggleRsvp(id)),

    news: () => read('/api/news', () => ({ articles: mock('NEWS') })),
    publishNews: (payload) => api('POST', '/api/news', payload),
    deleteNews: (slug) => api('DELETE', `/api/news/${slug}`),

    games: () => read('/api/games', () => ({ games: mock('GAMES') })),
    addGame: (payload) => api('POST', '/api/games', payload),
    removeGame: (id) => api('DELETE', `/api/games/${id}`),
    members: () => read('/api/members', () => ({ members: localMemberList() })),
    member: (id) => {
      if (!id) return Promise.resolve({ member: null });
      return read(`/api/members/${id}`, () => ({ member: localMemberList().find((m) => m.id === id) || null }));
    },
    merch: (scope) => read(scope ? `/api/merch?scope=${scope}` : '/api/merch',
      () => ({ merch: localMerchList(scope) })),
    listMerch: (payload) => api('POST', '/api/merch', payload, () => local.listMerch(payload)),
    setMerchStatus: (id, status) => api('PATCH', `/api/merch/${id}/status`, { status }),
    rigs: (scope) => read(scope ? `/api/rigs?scope=${scope}` : '/api/rigs',
      () => ({ rigs: localRigList(scope) })),
    rig: (id) => read(`/api/rigs/${id}`, () => ({ rig: localRigList('all').find((r) => r.id === id) || null })),
    submitRig: (payload) => api('POST', '/api/rigs', payload, () => local.submitRig(payload)),
    setRigStatus: (id, status) => api('PATCH', `/api/rigs/${id}/status`, { status }),

    // driver profile and interests
    updateProfile: (payload) => api('PATCH', '/api/members/me', payload, () => local.updateProfile(payload)),
    setInterests: (interests) => api('PATCH', '/api/auth/interests', { interests }, () => local.setInterests(interests)),
    // Friends and notifications need other people, so offline they are simply empty.
    friends: () => read('/api/friends', () => ({ friends: [], incoming: [], outgoing: [] })),
    requestFriend: (memberId) => api('POST', '/api/friends', { memberId }),
    acceptFriend: (id) => api('POST', `/api/friends/${id}/accept`),
    dropFriend: (id) => api('DELETE', `/api/friends/${id}`),
    notifications: () => read('/api/notifications', () => ({ notifications: [] })),
    markNotification: (id) => api('PATCH', `/api/notifications/${id}/read`, null, () => ({ ok: true })),

    // Comments read fine offline (an article has no pit wall without a server
    // anyway); posting needs the server because other people have to see it.
    comments: (slug) => read(`/api/news/${encodeURIComponent(slug)}/comments`, () => ({ comments: [] })),
    postComment: (slug, text) => api('POST', `/api/news/${encodeURIComponent(slug)}/comments`, { text }),
    // Same story for reactions: read anywhere, toggle on the server only.
    reactions: (slug) => read(`/api/news/${encodeURIComponent(slug)}/reactions`,
      () => ({ counts: {}, mine: [], kinds: ['flag', 'fire', 'love', 'trophy'] })),
    toggleReaction: (slug, kind) => api('POST', `/api/news/${encodeURIComponent(slug)}/reactions`, { kind }),

    // orders
    placeOrder: (items) => api('POST', '/api/orders', { items }, () => local.placeOrder(items)),
    orders: (scope) => read(scope ? `/api/orders?scope=${scope}` : '/api/orders',
      scope === 'all' ? undefined : () => local.orders()),
    setOrderStatus: (id, status) => api('PATCH', `/api/orders/${id}/status`, { status }),

    // public forms
    subscribe: (email) => api('POST', '/api/newsletter', { email }, () => local.subscribe(email)),
    sendMessage: (payload) => api('POST', '/api/messages', payload, () => local.sendMessage(payload)),

    // admin (server only: there is nobody to moderate on a single browser)
    users: () => api('GET', '/api/users'),
    setRole: (id, role) => api('PATCH', `/api/users/${id}/role`, { role }),
    inbox: () => api('GET', '/api/inbox'),
    markRead: (id) => api('PATCH', `/api/messages/${id}/read`),

    // Reflect the signed-in state in the shared navbar across every page.
    async renderAccountState() {
      const user = await me();
      document.querySelectorAll('[data-account-slot]').forEach((slot) => {
        if (!user) {
          // The mobile drawer slot is a column, so lead with the primary action there.
          const stacked = /flex-direction:\s*column/.test(slot.getAttribute('style') || '');
          const center = stacked ? ' style="text-align: center;"' : '';
          const signIn = `<a href="account.html?mode=signin" class="btn btn-outline-light"${center}>SIGN IN</a>`;
          const signUp = `<a href="account.html" class="btn btn-primary"${center}>SIGN UP</a>`;
          slot.innerHTML = stacked ? `${signUp}${signIn}` : signIn;
          return;
        }
        const avatar = esc(user.avatar || 'media/placeholder.png');
        slot.innerHTML =
          `<button type="button" class="nav-user" data-settings-open title="Signed in as ${esc(user.username)}">
             <img class="nav-avatar" src="${avatar}" alt="">
             <span>${esc(user.username)}</span>
           </button>`;
      });
      document.querySelectorAll('[data-settings-open]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof openSettingsPanel === 'function') openSettingsPanel(user);
        });
      });
      return user;
    },
  };
})();
