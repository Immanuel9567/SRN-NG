// HTTP API: accounts, roles, and every content collection the site runs on.
// Every handler returns { status, body, headers } and never throws to the caller.

import {
  DEFAULT_ROLE,
  ROLES,
  SESSION_TTL_MS,
  VENDOR_ROLE,
  clearedCookie,
  hashPassword,
  newId,
  newToken,
  publicUser,
  sessionCookie,
  verifyPassword,
} from './auth.js';
import { clientKey, rateLimit } from './ratelimit.js';
import { read, saveUpload, update } from './store.js';

const USERS = 'users';
const SESSIONS = 'sessions';
const EVENTS = 'events';
const NEWS = 'news';
const RIGS = 'rigs';
const MESSAGES = 'messages';
const NEWSLETTER = 'newsletter';
const MERCH = 'merch';
const ORDERS = 'orders';
const MEMBERS = 'members';
const GAMES = 'games';
const FRIENDS = 'friends';
const NOTIFICATIONS = 'notifications';
const COMMENTS = 'comments';

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_TEXT = 4000;

// ---------------------------------------------------------------- helpers

function json(status, body, headers = {}) {
  return { status, body, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 4_000_000) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Body must be valid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function currentUser(cookies) {
  const token = cookies.srn_session;
  if (!token) return null;
  const session = read(SESSIONS, {})[token];
  if (!session || Date.now() > session.expiresAt) return null;
  return read(USERS, []).find((u) => u.id === session.userId) || null;
}

function startSession(userId) {
  const token = newToken();
  update(SESSIONS, {}, (sessions) => {
    const now = Date.now();
    for (const [key, value] of Object.entries(sessions)) {
      if (value.expiresAt <= now) delete sessions[key];
    }
    sessions[token] = { userId, expiresAt: now + SESSION_TTL_MS };
    return sessions;
  });
  return token;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `item-${Date.now()}`;
}

function uniqueSlug(collection, base, key = 'slug') {
  let slug = base;
  let n = 2;
  while (collection.some((item) => item[key] === slug)) slug = `${base}-${n++}`;
  return slug;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// 401 says "who are you", 403 says "you may not". Returning 403 to an anonymous
// caller leaks that the route exists and is admin-gated, so distinguish them.
const adminError = (actor) =>
  json(actor ? 403 : 401, { error: actor ? 'Admin only.' : 'Sign in as an admin.' });

const clean = (v, max = MAX_TEXT) => String(v ?? '').trim().slice(0, max);
const requireFields = (body, fields) => fields.filter((f) => !String(body[f] ?? '').trim());

const SOCIAL_KEYS = ['x', 'instagram', 'youtube', 'discord', 'twitch'];

function parseSocials(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of SOCIAL_KEYS) {
    if (raw[key] === undefined) continue;
    const s = clean(raw[key], 200);
    if (!s) { out[key] = ''; continue; }
    if (/^javascript:/i.test(s) || /\s/.test(s)) continue;
    if (/^https?:\/\//i.test(s) || /^@?[\w.]{2,40}$/.test(s)) out[key] = s;
  }
  return out;
}

function pushNote(userId, type, text, href) {
  update(NOTIFICATIONS, [], (list) => [...list, {
    id: newId('ntf'),
    userId,
    type,
    text: clean(text, 240),
    href: clean(href, 200),
    read: false,
    createdAt: new Date().toISOString(),
  }]);
}

function emptyProfile(actor) {
  return {
    id: newId('mem'),
    userId: actor.id,
    name: actor.username,
    city: '',
    rank: actor.role === 'admin' ? 'Series Admin' : 'Unranked',
    sim: '',
    avatar: 'media/placeholder.png',
    joined: String(new Date().getFullYear()),
    bio: '',
    stats: { races: 0, wins: 0, podiums: 0 },
    activity: [],
    socials: {},
    gamesPlayed: [],
  };
}

// ---------------------------------------------------------------- routes

export async function handleApi(req, res, url, cookies) {
  const path = url.pathname;
  const method = req.method;
  const route = `${method} ${path}`;
  const actor = currentUser(cookies);
  const isAdmin = actor?.role === 'admin';

  try {
    // ================= accounts ==========================================
    if (route === 'POST /api/auth/signup') {
      const rl = rateLimit(clientKey(req, 'signup'), { limit: 10, windowMs: 15 * 60 * 1000 });
      if (!rl.allowed) {
        return json(429, { error: 'Too many signup attempts. Try again later.' },
          { 'Retry-After': String(rl.retryAfterSec) });
      }
      const body = await readBody(req);
      const username = clean(body.username, 24);
      const email = clean(body.email, 200).toLowerCase();
      const password = String(body.password ?? '');
      const vendor = body.vendor === true || body.vendor === 'true' || body.vendor === 'on';

      if (!USERNAME_RE.test(username)) {
        return json(400, { error: 'Username must be 3-24 characters: letters, numbers, dot, underscore, dash.' });
      }
      if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid email address.' });
      if (password.length < MIN_PASSWORD || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return json(400, { error: `Password must be at least ${MIN_PASSWORD} characters and include a letter and a number.` });
      }

      const users = read(USERS, []);
      if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        return json(409, { error: 'That username is already taken.' });
      }
      if (users.some((u) => u.email === email)) {
        return json(409, { error: 'That email is already registered.' });
      }

      // Signup can never mint an admin. Vendor toggle -> salesperson, otherwise user.
      const role = vendor ? VENDOR_ROLE : DEFAULT_ROLE;
      const user = {
        id: newId('usr'), username, email, role, vendor,
        interests: [],
        ...hashPassword(password),
        createdAt: new Date().toISOString(),
      };
      update(USERS, [], (list) => [...list, user]);

      // Every account gets a linked driver profile so the member directory,
      // RSVP attribution and profile pages all resolve to a real person.
      const profile = {
        id: newId('mem'),
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
      };
      update(MEMBERS, [], (list) => [...list, profile]);

      return json(201, { user: publicUser(user), profile }, { 'Set-Cookie': sessionCookie(startSession(user.id)) });
    }

    if (route === 'POST /api/auth/login') {
      const rl = rateLimit(clientKey(req, 'login'), { limit: 10, windowMs: 15 * 60 * 1000 });
      if (!rl.allowed) {
        return json(429, { error: 'Too many sign-in attempts. Try again later.' },
          { 'Retry-After': String(rl.retryAfterSec) });
      }
      const body = await readBody(req);
      const email = clean(body.email, 200).toLowerCase();
      const user = read(USERS, []).find((u) => u.email === email);
      // Same response for unknown email and wrong password: do not leak which accounts exist.
      if (!user || !verifyPassword(String(body.password ?? ''), user.salt, user.hash)) {
        return json(401, { error: 'Email or password is incorrect.' });
      }
      return json(200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(startSession(user.id)) });
    }

    if (route === 'POST /api/auth/logout') {
      const token = cookies.srn_session;
      if (token) update(SESSIONS, {}, (s) => (delete s[token], s));
      return json(200, { ok: true }, { 'Set-Cookie': clearedCookie() });
    }

    if (route === 'PATCH /api/auth/interests') {
      if (!actor) return json(401, { error: 'Sign in to choose your interests.' });
      const body = await readBody(req);
      const wanted = Array.isArray(body.interests) ? body.interests : [];
      if (wanted.length > 20) return json(400, { error: 'Pick at most 20 interests.' });

      // Only accept ids that correspond to a real supported game.
      const valid = new Set(read(GAMES, []).map((g) => g.id));
      const unknown = wanted.filter((id) => !valid.has(id));
      if (unknown.length) return json(400, { error: `Unknown game(s): ${unknown.join(', ')}.` });

      const users = read(USERS, []);
      const target = users.find((u) => u.id === actor.id);
      target.interests = [...new Set(wanted)];
      update(USERS, [], () => users);
      return json(200, { interests: target.interests });
    }

    if (route === 'GET /api/auth/me') {
      if (!actor) return json(401, { user: null });
      const profile = read(MEMBERS, []).find((m) => m.userId === actor.id);
      return json(200, {
        user: {
          ...publicUser(actor),
          avatar: profile?.avatar || 'media/placeholder.png',
          memberId: profile?.id || null,
        },
      });
    }

    // ================= admin: members and roles ===========================
    if (route === 'GET /api/users') {
      if (!isAdmin) return adminError(actor);
      return json(200, { users: read(USERS, []).map(publicUser) });
    }

    const roleMatch = path.match(/^\/api\/users\/([\w-]+)\/role$/);
    if (roleMatch && method === 'PATCH') {
      if (!isAdmin) return adminError(actor);
      const body = await readBody(req);
      const role = clean(body.role, 20);
      if (!ROLES.includes(role)) return json(400, { error: `Role must be one of: ${ROLES.join(', ')}.` });

      const users = read(USERS, []);
      const target = users.find((u) => u.id === roleMatch[1]);
      if (!target) return json(404, { error: 'No such user.' });

      if (target.role === 'admin' && role !== 'admin' && users.filter((u) => u.role === 'admin').length <= 1) {
        return json(409, { error: 'Cannot demote the last remaining admin.' });
      }
      target.role = role;
      target.vendor = role === VENDOR_ROLE ? true : target.vendor;
      update(USERS, [], () => users);
      return json(200, { user: publicUser(target) });
    }

    // ================= public read-only collections =======================
    if (route === 'GET /api/games') return json(200, { games: read(GAMES, []) });

    if (route === 'POST /api/games') {
      if (!isAdmin) return adminError(actor);
      const body = await readBody(req);
      const missing = requireFields(body, ['name']);
      if (missing.length) return json(400, { error: `Missing required field(s): ${missing.join(', ')}.` });

      const games = read(GAMES, []);
      const name = clean(body.name, 80);
      if (games.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
        return json(409, { error: 'That game is already supported.' });
      }
      const game = {
        id: newId('game'),
        name,
        shortName: clean(body.shortName, 24) || name,
        genre: clean(body.genre, 40) || 'Other',
        description: clean(body.description, 400),
        img: clean(body.img, 500) || 'media/placeholder.png',
        addedBy: actor.username,
        createdAt: new Date().toISOString(),
      };
      update(GAMES, [], (list) => [...list, game]);
      return json(201, { game });
    }

    const gameDelete = path.match(/^\/api\/games\/([\w-]+)$/);
    if (gameDelete && method === 'DELETE') {
      if (!isAdmin) return adminError(actor);
      const before = read(GAMES, []);
      const after = before.filter((g) => g.id !== gameDelete[1]);
      if (after.length === before.length) return json(404, { error: 'No such game.' });
      update(GAMES, [], () => after);
      return json(200, { ok: true });
    }
    // Merch: salespeople and admins can list items; submissions wait for approval.
    if (route === 'GET /api/merch') {
      const all = url.searchParams.get('scope') === 'all' && isAdmin;
      const items = read(MERCH, []);
      return json(200, { merch: all ? items : items.filter((m) => m.status !== 'pending') });
    }

    if (route === 'POST /api/merch') {
      if (!actor) return json(401, { error: 'Sign in to list an item.' });
      if (actor.role !== VENDOR_ROLE && !isAdmin) {
        return json(403, { error: 'Only salespeople and admins can list merchandise.' });
      }
      const body = await readBody(req);
      const missing = requireFields(body, ['name', 'category', 'price']);
      if (missing.length) return json(400, { error: `Missing required field(s): ${missing.join(', ')}.` });
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0 || price > 100_000_000) {
        return json(400, { error: 'Price must be a positive number in Naira.' });
      }

      const item = {
        id: newId('mer'),
        name: clean(body.name, 120),
        category: clean(body.category, 60),
        description: clean(body.description, 600),
        price: Math.round(price),
        img: clean(body.img, 500) || 'media/placeholder.png',
        status: isAdmin ? 'approved' : 'pending',
        listedBy: actor.username,
        listedById: actor.id,
        createdAt: new Date().toISOString(),
      };
      update(MERCH, [], (list) => [...list, item]);
      return json(201, {
        item,
        pending: item.status === 'pending',
        message: item.status === 'pending' ? 'Listing submitted for review.' : 'Listing published.',
      });
    }

    const merchStatus = path.match(/^\/api\/merch\/([\w-]+)\/status$/);
    if (merchStatus && method === 'PATCH') {
      if (!isAdmin) return adminError(actor);
      const body = await readBody(req);
      const status = clean(body.status, 20);
      if (!['approved', 'pending', 'rejected'].includes(status)) {
        return json(400, { error: 'Status must be approved, pending or rejected.' });
      }
      const items = read(MERCH, []);
      const target = items.find((m) => m.id === merchStatus[1]);
      if (!target) return json(404, { error: 'No such listing.' });
      target.status = status;
      update(MERCH, [], () => items);
      return json(200, { item: target });
    }

    // ================= orders ============================================
    if (route === 'POST /api/orders') {
      if (!actor) return json(401, { error: 'Sign in to place an order.' });
      const body = await readBody(req);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return json(400, { error: 'Your cart is empty.' });
      if (items.length > 50) return json(400, { error: 'Too many line items in one order.' });

      // Prices are read from the catalogue, never trusted from the request body.
      const catalogue = read(MERCH, []).filter((m) => m.status !== 'pending');
      const lines = [];
      let total = 0;
      for (const raw of items) {
        const product = catalogue.find((m) => m.id === raw?.id);
        if (!product) return json(400, { error: `Unknown or unavailable item: ${raw?.id}` });
        const qty = Math.floor(Number(raw?.qty));
        if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
          return json(400, { error: `Invalid quantity for ${product.name}.` });
        }
        lines.push({ id: product.id, name: product.name, price: product.price, qty });
        total += product.price * qty;
      }

      const order = {
        id: newId('ord'),
        userId: actor.id,
        username: actor.username,
        email: actor.email,
        items: lines,
        total,
        status: 'new',
        createdAt: new Date().toISOString(),
      };
      update(ORDERS, [], (list) => [...list, order]);
      return json(201, { order, message: `Order placed. Total ${total.toLocaleString('en-NG')} naira.` });
    }

    if (route === 'GET /api/orders') {
      if (!actor) return json(401, { error: 'Sign in to view orders.' });
      const all = url.searchParams.get('scope') === 'all' && isAdmin;
      const orders = read(ORDERS, []);
      return json(200, { orders: all ? [...orders].reverse() : orders.filter((o) => o.userId === actor.id).reverse() });
    }

    const orderStatus = path.match(/^\/api\/orders\/([\w-]+)\/status$/);
    if (orderStatus && method === 'PATCH') {
      if (!isAdmin) return adminError(actor);
      const body = await readBody(req);
      const status = clean(body.status, 20);
      if (!['new', 'fulfilled', 'cancelled'].includes(status)) {
        return json(400, { error: 'Status must be new, fulfilled or cancelled.' });
      }
      const orders = read(ORDERS, []);
      const target = orders.find((o) => o.id === orderStatus[1]);
      if (!target) return json(404, { error: 'No such order.' });
      target.status = status;
      update(ORDERS, [], () => orders);
      return json(200, { order: target });
    }

    if (route === 'GET /api/members') return json(200, { members: read(MEMBERS, []) });

    // A signed-in user edits only their own linked profile.
    if (route === 'PATCH /api/members/me') {
      if (!actor) return json(401, { error: 'Sign in to edit your profile.' });
      const body = await readBody(req);
      const members = read(MEMBERS, []);
      // Self-heal: an account created before profiles were auto-created on signup
      // gets one on first edit rather than failing.
      let mine = members.find((m) => m.userId === actor.id);
      if (!mine) {
        mine = emptyProfile(actor);
        members.push(mine);
      }
      for (const field of ['city', 'sim', 'bio', 'avatar']) {
        if (body[field] !== undefined) mine[field] = clean(body[field], field === 'bio' ? 1000 : 200);
      }
      if (body.socials !== undefined) {
        mine.socials = { ...(mine.socials || {}), ...parseSocials(body.socials) };
      }
      if (body.gamesPlayed !== undefined) {
        const wanted = Array.isArray(body.gamesPlayed) ? body.gamesPlayed : [];
        if (wanted.length > 20) return json(400, { error: 'Pick at most 20 games.' });
        const valid = new Set(read(GAMES, []).map((g) => g.id));
        mine.gamesPlayed = [...new Set(wanted.filter((id) => valid.has(id)))];
      }
      if (body.photo) mine.avatar = saveUpload(body.photo);
      update(MEMBERS, [], () => members);
      return json(200, { member: mine });
    }
    const memberMatch = path.match(/^\/api\/members\/([\w-]+)$/);
    if (memberMatch && method === 'GET') {
      const member = read('members', []).find((m) => m.id === memberMatch[1]);
      return member ? json(200, { member }) : json(404, { error: 'No such member.' });
    }

    // ================= events ============================================
    if (route === 'GET /api/events') {
      const all = url.searchParams.get('scope') === 'all' && isAdmin;
      const events = read(EVENTS, []);
      return json(200, { events: all ? events : events.filter((e) => e.status !== 'pending') });
    }

    if (route === 'POST /api/events') {
      if (!actor) return json(401, { error: 'Sign in to submit an event.' });
      const body = await readBody(req);
      const missing = requireFields(body, ['title', 'date', 'time', 'location', 'type', 'description']);
      if (missing.length) return json(400, { error: `Missing required field(s): ${missing.join(', ')}.` });

      const event = {
        id: newId('evt'),
        title: clean(body.title, 120),
        date: clean(body.date, 40),
        time: clean(body.time, 40),
        location: clean(body.location, 120),
        type: clean(body.type, 40),
        // Topic is either a supported game id or the literal 'general'.
        // Anything unrecognised falls back to general rather than failing the submission.
        game: (() => {
          const wanted = clean(body.game, 40) || 'general';
          if (wanted === 'general') return 'general';
          return read(GAMES, []).some((g) => g.id === wanted) ? wanted : 'general';
        })(),
        description: clean(body.description, 1000),
        img: clean(body.img, 500) || 'media/placeholder.png',
        // Admins publish straight away; everyone else waits for approval.
        status: isAdmin ? 'upcoming' : 'pending',
        submittedBy: actor.username,
        submittedById: actor.id,
        rsvps: [],
        createdAt: new Date().toISOString(),
      };
      update(EVENTS, [], (list) => [...list, event]);
      return json(201, {
        event,
        pending: event.status === 'pending',
        message: event.status === 'pending' ? 'Submitted. An admin will review it.' : 'Event published.',
      });
    }

    const eventStatus = path.match(/^\/api\/events\/([\w-]+)\/status$/);
    if (eventStatus && method === 'PATCH') {
      if (!isAdmin) return adminError(actor);
      const body = await readBody(req);
      const status = clean(body.status, 20);
      if (!['upcoming', 'past', 'pending', 'rejected'].includes(status)) {
        return json(400, { error: 'Status must be upcoming, past, pending or rejected.' });
      }
      const events = read(EVENTS, []);
      const target = events.find((e) => e.id === eventStatus[1]);
      if (!target) return json(404, { error: 'No such event.' });
      target.status = status;
      update(EVENTS, [], () => events);
      return json(200, { event: target });
    }

    // RSVP is a toggle: joining and leaving use the same call.
    const rsvpMatch = path.match(/^\/api\/events\/([\w-]+)\/rsvp$/);
    if (rsvpMatch && method === 'POST') {
      if (!actor) return json(401, { error: 'Sign in to RSVP.' });
      const events = read(EVENTS, []);
      const target = events.find((e) => e.id === rsvpMatch[1]);
      if (!target) return json(404, { error: 'No such event.' });
      if (target.status === 'pending') return json(409, { error: 'That event is not approved yet.' });
      target.rsvps = target.rsvps || [];
      const i = target.rsvps.indexOf(actor.id);
      const attending = i === -1;
      if (attending) target.rsvps.push(actor.id); else target.rsvps.splice(i, 1);
      update(EVENTS, [], () => events);
      return json(200, { attending, count: target.rsvps.length });
    }

    // ================= news: admin only ===================================
    if (route === 'GET /api/news') return json(200, { articles: read(NEWS, []) });

    if (route === 'POST /api/news') {
      if (!isAdmin) return adminError(actor);
      const body = await readBody(req);
      const missing = requireFields(body, ['title', 'tag', 'excerpt', 'body']);
      if (missing.length) return json(400, { error: `Missing required field(s): ${missing.join(', ')}.` });

      const paragraphs = Array.isArray(body.body)
        ? body.body.map(String).filter((p) => p.trim())
        : String(body.body).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      if (!paragraphs.length) return json(400, { error: 'Article body cannot be empty.' });

      const articles = read(NEWS, []);
      const article = {
        slug: uniqueSlug(articles, slugify(body.title)),
        featured: body.featured === true,
        tag: clean(body.tag, 40),
        date: clean(body.date, 40) || today(),
        title: clean(body.title, 160),
        excerpt: clean(body.excerpt, 400),
        body: paragraphs.map((p) => p.slice(0, MAX_TEXT)),
        img: clean(body.img, 500) || 'media/placeholder.png',
        readTime: `${Math.max(1, Math.round(paragraphs.join(' ').split(/\s+/).length / 200))} min read`,
        author: clean(body.author, 60) || actor.username,
        createdBy: actor.username,
        createdAt: new Date().toISOString(),
      };
      update(NEWS, [], (list) => [article, ...list]);
      return json(201, { article });
    }

    const newsDelete = path.match(/^\/api\/news\/([\w-]+)$/);
    if (newsDelete && method === 'DELETE') {
      if (!isAdmin) return adminError(actor);
      const before = read(NEWS, []);
      const after = before.filter((a) => a.slug !== newsDelete[1]);
      if (after.length === before.length) return json(404, { error: 'No such article.' });
      update(NEWS, [], () => after);
      // The pit wall dies with the article: no orphaned comments.
      update(COMMENTS, [], (list) => list.filter((c) => c.slug !== newsDelete[1]));
      return json(200, { ok: true });
    }

    // ================= comments: the pit wall ==============================
    // Anyone can read; only signed-in drivers can post. Comments on an unknown
    // article are 404, and an article deletion is only complete once its pit
    // wall goes with it.
    const newsComments = path.match(/^\/api\/news\/([\w-]+)\/comments$/);

    if (newsComments && method === 'GET') {
      const slug = newsComments[1];
      if (!read(NEWS, []).some((a) => a.slug === slug)) return json(404, { error: 'No such article.' });
      const comments = read(COMMENTS, []).filter((c) => c.slug === slug);
      return json(200, { comments });
    }

    if (newsComments && method === 'POST') {
      if (!actor) return json(401, { error: 'Sign in to join the pit wall.' });
      const slug = newsComments[1];
      if (!read(NEWS, []).some((a) => a.slug === slug)) return json(404, { error: 'No such article.' });
      const body = await readBody(req);
      const text = clean(body.text, 600);
      if (!text) return json(400, { error: 'Comment cannot be empty.' });
      const rl = rateLimit(clientKey(req, 'comment'), { limit: 12, windowMs: 10 * 60 * 1000 });
      if (rl.limited) return json(429, { error: 'Too many comments. Take a lap and try again shortly.' });
      const comment = {
        id: newId('cmt'),
        slug,
        userId: actor.id,
        username: actor.username,
        avatar: actor.avatar || '',
        text,
        createdAt: new Date().toISOString(),
      };
      update(COMMENTS, [], (list) => [comment, ...list]);
      return json(201, { comment });
    }


    // ================= rigs: signed in submits, admin approves ============
    if (route === 'GET /api/rigs') {
      const all = url.searchParams.get('scope') === 'all' && isAdmin;
      const rigs = read(RIGS, []);
      return json(200, { rigs: all ? rigs : rigs.filter((r) => r.status !== 'pending') });
    }

    const rigById = path.match(/^\/api\/rigs\/([\w-]+)$/);
    if (rigById && method === 'GET') {
      const rig = read(RIGS, []).find((r) => r.id === rigById[1]);
      if (!rig) return json(404, { error: 'No such rig.' });
      if (rig.status === 'pending' && !isAdmin) return json(404, { error: 'No such rig.' });
      return json(200, { rig });
    }

    if (route === 'POST /api/rigs') {
      if (!actor) return json(401, { error: 'Sign in to submit a rig.' });
      const body = await readBody(req);
      // Field names match the shape already used by data/rigs.json and sim-rigs.html.
      const missing = requireFields(body, ['name', 'owner']);
      if (missing.length) return json(400, { error: `Missing required field(s): ${missing.join(', ')}.` });

      const specs = Array.isArray(body.specs)
        ? body.specs.filter((s) => s && s.label && s.value).slice(0, 12)
            .map((s) => ({ label: clean(s.label, 40), value: clean(s.value, 80) }))
        : [];

      const rig = {
        id: newId('rig'),
        name: clean(body.name, 120),
        owner: clean(body.owner, 60),
        ownerId: clean(body.ownerId, 40) || null,
        city: clean(body.city, 80),
        // An attached photo is stored on disk; a plain URL is used as given.
        img: body.photo ? saveUpload(body.photo) : (clean(body.img, 500) || 'media/placeholder.png'),
        specs,
        notes: clean(body.notes, 1000),
        status: isAdmin ? 'approved' : 'pending',
        submittedBy: actor.username,
        submittedById: actor.id,
        createdAt: new Date().toISOString(),
      };
      update(RIGS, [], (list) => [...list, rig]);
      return json(201, {
        rig,
        pending: rig.status === 'pending',
        message: rig.status === 'pending' ? 'Rig submitted for review.' : 'Rig published.',
      });
    }

    const rigStatus = path.match(/^\/api\/rigs\/([\w-]+)\/status$/);
    if (rigStatus && method === 'PATCH') {
      if (!isAdmin) return adminError(actor);
      const body = await readBody(req);
      const status = clean(body.status, 20);
      if (!['approved', 'pending', 'rejected'].includes(status)) {
        return json(400, { error: 'Status must be approved, pending or rejected.' });
      }
      const rigs = read(RIGS, []);
      const target = rigs.find((r) => r.id === rigStatus[1]);
      if (!target) return json(404, { error: 'No such rig.' });
      target.status = status;
      update(RIGS, [], () => rigs);
      return json(200, { rig: target });
    }

    // ================= newsletter and contact: public =====================
    if (route === 'POST /api/newsletter') {
      const body = await readBody(req);
      const email = clean(body.email, 200).toLowerCase();
      if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid email address.' });
      const list = read(NEWSLETTER, []);
      if (list.some((s) => s.email === email)) {
        return json(409, { error: 'That email is already subscribed.' });
      }
      const entry = { id: newId('sub'), email, createdAt: new Date().toISOString() };
      update(NEWSLETTER, [], (l) => [...l, entry]);
      return json(201, { ok: true, message: 'You are on the list. Race updates incoming.' });
    }

    if (route === 'POST /api/messages') {
      const body = await readBody(req);
      const missing = requireFields(body, ['name', 'email', 'message']);
      if (missing.length) return json(400, { error: `Missing required field(s): ${missing.join(', ')}.` });
      const email = clean(body.email, 200).toLowerCase();
      if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid email address.' });

      const message = {
        id: newId('msg'),
        name: clean(body.name, 80),
        email,
        message: clean(body.message, 2000),
        fromUserId: actor?.id || null,
        read: false,
        createdAt: new Date().toISOString(),
      };
      update(MESSAGES, [], (l) => [...l, message]);
      // `message` is the human-readable notice everywhere else in this API, so the
      // created record's id travels as its own field rather than colliding with it.
      return json(201, { ok: true, id: message.id, message: 'Message sent. The SRN team will get back to you.' });
    }

    // ================= admin inbox ========================================
    if (route === 'GET /api/inbox') {
      if (!isAdmin) return adminError(actor);
      const messages = read(MESSAGES, []);
      const subscribers = read(NEWSLETTER, []);
      const pendingEvents = read(EVENTS, []).filter((e) => e.status === 'pending');
      const pendingRigs = read(RIGS, []).filter((r) => r.status === 'pending');
      const orders = read(ORDERS, []);
      const pendingMerch = read(MERCH, []).filter((m) => m.status === 'pending');
      return json(200, {
        messages: [...messages].reverse(),
        subscribers,
        orders: [...orders].reverse(),
        stats: {
          messages: messages.length,
          unread: messages.filter((m) => !m.read).length,
          subscribers: subscribers.length,
          pendingEvents: pendingEvents.length,
          pendingRigs: pendingRigs.length,
          pendingMerch: pendingMerch.length,
          newOrders: orders.filter((o) => o.status === 'new').length,
          members: read(USERS, []).length,
        },
      });
    }

    const markRead = path.match(/^\/api\/messages\/([\w-]+)\/read$/);
    if (markRead && method === 'PATCH') {
      if (!isAdmin) return adminError(actor);
      const messages = read(MESSAGES, []);
      const target = messages.find((m) => m.id === markRead[1]);
      if (!target) return json(404, { error: 'No such message.' });
      target.read = true;
      update(MESSAGES, [], () => messages);
      return json(200, { message: target });
    }

    // ================= friends ===========================================
    if (route === 'GET /api/friends') {
      if (!actor) return json(401, { error: 'Sign in to view friends.' });
      const rows = read(FRIENDS, []);
      const members = read(MEMBERS, []);
      const label = (userId) => members.find((m) => m.userId === userId)?.name
        || read(USERS, []).find((u) => u.id === userId)?.username || userId;
      const mine = rows.filter((f) => f.fromId === actor.id || f.toId === actor.id);
      const pack = (f) => ({
        id: f.id,
        status: f.status,
        fromId: f.fromId,
        toId: f.toId,
        otherId: f.fromId === actor.id ? f.toId : f.fromId,
        otherName: label(f.fromId === actor.id ? f.toId : f.fromId),
        otherMemberId: members.find((m) => m.userId === (f.fromId === actor.id ? f.toId : f.fromId))?.id || null,
      });
      return json(200, {
        friends: mine.filter((f) => f.status === 'accepted').map(pack),
        incoming: mine.filter((f) => f.status === 'pending' && f.toId === actor.id).map(pack),
        outgoing: mine.filter((f) => f.status === 'pending' && f.fromId === actor.id).map(pack),
      });
    }

    if (route === 'POST /api/friends') {
      if (!actor) return json(401, { error: 'Sign in to add a friend.' });
      const body = await readBody(req);
      const members = read(MEMBERS, []);
      const targetMember = members.find((m) => m.id === clean(body.memberId, 40));
      if (!targetMember?.userId) return json(404, { error: 'No such member.' });
      if (targetMember.userId === actor.id) return json(400, { error: 'You cannot friend yourself.' });
      const rows = read(FRIENDS, []);
      const existing = rows.find((f) =>
        (f.fromId === actor.id && f.toId === targetMember.userId)
        || (f.fromId === targetMember.userId && f.toId === actor.id));
      if (existing?.status === 'accepted') return json(409, { error: 'Already friends.' });
      if (existing?.status === 'pending') return json(409, { error: 'A request is already pending.' });
      const row = {
        id: newId('frn'),
        fromId: actor.id,
        toId: targetMember.userId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      update(FRIENDS, [], (list) => [...list, row]);
      const meName = members.find((m) => m.userId === actor.id)?.name || actor.username;
      pushNote(targetMember.userId, 'friend', `${meName} sent you a friend request.`, `member-profile.html?id=${targetMember.id}`);
      return json(201, { friend: row });
    }

    const friendAccept = path.match(/^\/api\/friends\/([\w-]+)\/accept$/);
    if (friendAccept && method === 'POST') {
      if (!actor) return json(401, { error: 'Sign in to accept a friend request.' });
      const rows = read(FRIENDS, []);
      const row = rows.find((f) => f.id === friendAccept[1]);
      if (!row) return json(404, { error: 'No such request.' });
      if (row.toId !== actor.id) return json(403, { error: 'That request is not yours to accept.' });
      if (row.status !== 'pending') return json(409, { error: 'Already resolved.' });
      row.status = 'accepted';
      update(FRIENDS, [], () => rows);
      const members = read(MEMBERS, []);
      const meName = members.find((m) => m.userId === actor.id)?.name || actor.username;
      const theirMem = members.find((m) => m.userId === row.fromId);
      pushNote(row.fromId, 'friend', `${meName} accepted your friend request.`,
        theirMem ? `member-profile.html?id=${theirMem.id}` : 'members.html');
      return json(200, { friend: row });
    }

    const friendId = path.match(/^\/api\/friends\/([\w-]+)$/);
    if (friendId && method === 'DELETE') {
      if (!actor) return json(401, { error: 'Sign in to manage friends.' });
      const before = read(FRIENDS, []);
      const row = before.find((f) => f.id === friendId[1]);
      if (!row) return json(404, { error: 'No such request.' });
      if (row.fromId !== actor.id && row.toId !== actor.id) return json(403, { error: 'Not your friendship.' });
      update(FRIENDS, [], () => before.filter((f) => f.id !== row.id));
      return json(200, { ok: true });
    }

    // ================= notifications =====================================
    if (route === 'GET /api/notifications') {
      if (!actor) return json(401, { error: 'Sign in to view notifications.' });
      const mine = read(NOTIFICATIONS, []).filter((n) => n.userId === actor.id).reverse();
      return json(200, { notifications: mine, unread: mine.filter((n) => !n.read).length });
    }

    const noteRead = path.match(/^\/api\/notifications\/([\w-]+)\/read$/);
    if (noteRead && method === 'PATCH') {
      if (!actor) return json(401, { error: 'Sign in to update notifications.' });
      const list = read(NOTIFICATIONS, []);
      const target = list.find((n) => n.id === noteRead[1]);
      if (!target) return json(404, { error: 'No such notification.' });
      if (target.userId !== actor.id) return json(403, { error: 'Not your notification.' });
      target.read = true;
      update(NOTIFICATIONS, [], () => list);
      return json(200, { notification: target });
    }

    return json(404, { error: `No API route for ${route}` });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: status === 500 ? 'Internal server error.' : err.message });
  }
}
