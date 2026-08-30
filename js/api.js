// SRN API client. Classic script (no ES modules) to match the rest of js/.
// Exposes a single global: SRN
//
// Every page calls SRN.* and falls back to the js/data.js mock collections when the
// API is not reachable, so the static `vite build` output still renders on its own.

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

  // Returns the API payload, or the fallback when there is no server (static build).
  async function withFallback(path, fallback) {
    try {
      return await request('GET', path);
    } catch {
      return fallback;
    }
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
    try {
      cachedMe = (await request('GET', '/api/auth/me')).user;
    } catch {
      cachedMe = null;
    }
    return cachedMe;
  }

  return {
    esc,
    me,
    toast,
    skeleton,

    // accounts
    signup: (payload) => request('POST', '/api/auth/signup', payload),
    login: (payload) => request('POST', '/api/auth/login', payload),
    logout: async () => { cachedMe = null; return request('POST', '/api/auth/logout'); },

    // content
    events: (scope) => withFallback(scope ? `/api/events?scope=${scope}` : '/api/events', { events: mock('ACTIVITIES') }),
    submitEvent: (payload) => request('POST', '/api/events', payload),
    setEventStatus: (id, status) => request('PATCH', `/api/events/${id}/status`, { status }),
    toggleRsvp: (id) => request('POST', `/api/events/${id}/rsvp`),

    news: () => withFallback('/api/news', { articles: mock('NEWS') }),
    publishNews: (payload) => request('POST', '/api/news', payload),
    deleteNews: (slug) => request('DELETE', `/api/news/${slug}`),

    games: () => withFallback('/api/games', { games: mock('GAMES') }),
    addGame: (payload) => request('POST', '/api/games', payload),
    removeGame: (id) => request('DELETE', `/api/games/${id}`),
    members: () => withFallback('/api/members', { members: mock('MEMBERS') }),
    member: (id) => {
      if (!id) return Promise.resolve({ member: null });
      return withFallback(`/api/members/${id}`, { member: mock('MEMBERS').find((m) => m.id === id) || null });
    },
    merch: (scope) => withFallback(scope ? `/api/merch?scope=${scope}` : '/api/merch', { merch: mock('MERCH') }),
    listMerch: (payload) => request('POST', '/api/merch', payload),
    setMerchStatus: (id, status) => request('PATCH', `/api/merch/${id}/status`, { status }),
    rigs: (scope) => withFallback(scope ? `/api/rigs?scope=${scope}` : '/api/rigs', { rigs: mock('RIGS') }),
    rig: (id) => withFallback(`/api/rigs/${id}`, { rig: mock('RIGS').find((r) => r.id === id) || null }),
    submitRig: (payload) => request('POST', '/api/rigs', payload),
    setRigStatus: (id, status) => request('PATCH', `/api/rigs/${id}/status`, { status }),

    // driver profile and interests
    updateProfile: (payload) => request('PATCH', '/api/members/me', payload),
    setInterests: (interests) => request('PATCH', '/api/auth/interests', { interests }),
    friends: () => request('GET', '/api/friends'),
    requestFriend: (memberId) => request('POST', '/api/friends', { memberId }),
    acceptFriend: (id) => request('POST', `/api/friends/${id}/accept`),
    dropFriend: (id) => request('DELETE', `/api/friends/${id}`),
    notifications: () => request('GET', '/api/notifications'),
    markNotification: (id) => request('PATCH', `/api/notifications/${id}/read`),

    // orders
    placeOrder: (items) => request('POST', '/api/orders', { items }),
    orders: (scope) => request('GET', scope ? `/api/orders?scope=${scope}` : '/api/orders'),
    setOrderStatus: (id, status) => request('PATCH', `/api/orders/${id}/status`, { status }),

    // public forms
    subscribe: (email) => request('POST', '/api/newsletter', { email }),
    sendMessage: (payload) => request('POST', '/api/messages', payload),

    // admin
    users: () => request('GET', '/api/users'),
    setRole: (id, role) => request('PATCH', `/api/users/${id}/role`, { role }),
    inbox: () => request('GET', '/api/inbox'),
    markRead: (id) => request('PATCH', `/api/messages/${id}/read`),

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
          slot.innerHTML = stacked ? `${signUp}${signIn}` : `${signIn}${signUp}`;
          return;
        }
        const href = user.role === 'admin' ? 'admin.html' : 'account.html';
        const label = user.role === 'admin' ? `${user.username} (admin)` : user.username;
        slot.innerHTML =
          `<a href="${href}" class="nav-link" title="Signed in as ${esc(user.username)}, role: ${esc(user.role)}">${esc(label)}</a>
           <button class="btn btn-outline-green" data-logout style="padding: 0.5rem 0.9rem; font-size: 0.7rem;">SIGN OUT</button>`;
      });
      document.querySelectorAll('[data-logout]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await SRN.logout();
          toast('Signed out.', 'info');
          setTimeout(() => location.reload(), 400);
        });
      });
      return user;
    },
  };
})();
