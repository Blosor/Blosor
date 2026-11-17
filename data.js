/* =====================================================
   SHARED HELPERS
   ===================================================== */
const $ = s => document.querySelector(s);
const byId = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const GV = '⊙'; // platform currency symbol

/* =====================================================
   CONFIG  (edit these before you ship)
   ===================================================== */
const CONFIG = {
  ADMIN_EMAIL: 'ssaapp257@gmail.com',     // the account registered with this email gets the Admin tab
  OWNER_CONTACT: 'ownerblosor@gmail.com', // shown in the wallet: where players contact you to top up
  VOUCHER_SECRET: 'I-Love-U-MOM-TY',      // used to sign voucher codes. CHANGE IT.
  MAP_PRICE: 3500,                        // cost to publish a map (first publish only)
  ACC_PRICE: 1090,                        // review fee to submit an accessory
  MARKET_CUT: 0.03,                       // platform tax on every accessory sale (0.03 = 3%)
  MIN_AGE: 10,
  MAX_PLAYERS_LIMIT: 50,                  // highest "max players per server" a creator can set
  MAX_PLACES: 100,                        // saved places per user
  MAX_ACC_DRAFTS: 100,                    // saved accessories per user
  MAX_PARTS: 1500,                        // parts per map
  MAX_ACC_PARTS: 120,                     // parts per accessory
  MAX_PRICE: 100000000000000,
  MAX_STOCK: 10000000000
};

/* =====================================================
   LOCAL DATABASE (localStorage)
   Replace this object with a server API to go online.
   ===================================================== */
const DB = {
  get(k, d) {
    try {
      const v = JSON.parse(localStorage.getItem('bx_' + k));
      return v === null || v === undefined ? d : v;
    } catch (e) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('bx_' + k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  },
  del(k) { localStorage.removeItem('bx_' + k); },
  users() { return this.get('users', {}); },
  games() { return this.get('games', []); }, // metadata only (no parts), so the menu stays fast
  items() { return this.get('items', []); },
  pending() { return this.get('pending', []); },
  reports() { return this.get('reports', []); }
};

// The heavy part of a game is stored separately and loaded only when somebody enters it.
const GameData = {
  get(id) { return DB.get('gp_' + id, null); },
  set(id, d) { return DB.set('gp_' + id, d); },
  del(id) { DB.del('gp_' + id); }
};

/* =====================================================
   BAD WORD FILTER
   ===================================================== */
const Filter = (() => {
  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
  const STRICT = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'pussy', 'asshole', 'bastard'];
  const WORDS = ['ass', 'dick', 'cock', 'porn', 'rape', 'slut', 'retard', 'fag'];
  const EXTRA_BANNED = []; // add your own words here (any language)

  const squash = s => s.replace(/(.)\1+/g, '$1');
  const cap2 = s => s.replace(/(.)\1{2,}/g, '$1$1');
  const norm = s => String(s).toLowerCase().replace(/[013457@$!]/g, c => LEET[c]);

  function has(text) {
    const toks = norm(text).split(/[^a-z]+/).filter(Boolean);
    const checks = [];
    let run = '';
    for (const t of toks) {
      if (t.length === 1) run += t;
      else { if (run.length > 2) checks.push(run); run = ''; checks.push(t); }
    }
    if (run.length > 2) checks.push(run);
    const strict = STRICT.concat(EXTRA_BANNED).map(w => squash(w.toLowerCase()));
    return checks.some(c => WORDS.includes(cap2(c)) || strict.some(w => squash(c).includes(w)));
  }

  function mask(text) {
    text = String(text);
    const out = text.split(/(\s+)/).map(w => (w.trim() && has(w)) ? '#'.repeat(w.length) : w).join('');
    return (out === text && has(text)) ? '#'.repeat(Math.min(text.length, 12)) : out;
  }
  return { has, mask };
})();

/* =====================================================
   AUTH (username + email + date of birth) + BANS
   ===================================================== */
const Auth = {
  hash(s) {
    let h = 5381, g = 52711;
    for (const c of s) {
      h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
      g = ((g << 7) ^ (g >>> 3) ^ c.charCodeAt(0)) >>> 0;
    }
    return h.toString(16) + g.toString(16);
  },
  ageOf(dob) {
    const d = new Date(dob), n = new Date();
    if (isNaN(d) || d > n) return -1;
    let a = n.getFullYear() - d.getFullYear();
    const m = n.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
    return a > 120 ? -1 : a;
  },
  register(u, email, dob, p) {
    u = u.trim(); email = email.trim().toLowerCase();
    if (u.length < 3 || u.length > 20) return 'Username must be 3-20 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(u)) return 'Username: letters, numbers and _ only';
    if (Filter.has(u)) return 'That username is not allowed';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Enter a valid email';
    const age = this.ageOf(dob);
    if (age < 0) return 'Enter a valid date of birth';
    if (age < CONFIG.MIN_AGE) return 'You must be at least ' + CONFIG.MIN_AGE + ' years old';
    if (p.length < 6) return 'Password must be at least 6 characters';
    const us = DB.users(), k = u.toLowerCase();
    if (us[k]) return 'Username already taken';
    if (Object.values(us).some(x => x.email === email)) return 'Email already registered';
    us[k] = { name: u, email, dob, pass: this.hash(k + ':' + p), gv: 0, banned: false, created: Date.now() };
    DB.set('users', us);
    DB.set('session', k);
    return null;
  },
  find(id) {
    id = String(id).trim().toLowerCase();
    const us = DB.users();
    if (us[id]) return id;
    return Object.keys(us).find(k => us[k].email === id) || null;
  },
  // an active ban (temporary bans end by themselves)
  banOf(u) { return u && u.banned && (!u.banUntil || Date.now() < u.banUntil) ? u : null; },
  banMsg(u) {
    return 'Banned: ' + (u.banReason || 'Violation') + (u.banUntil ? ' (until ' + new Date(u.banUntil).toLocaleDateString() + ')' : ' (permanent)');
  },
  ban(k, reason, days) {
    const us = DB.users(); if (!us[k]) return false;
    us[k].banned = true; us[k].banReason = String(reason || 'Violation').slice(0, 80);
    us[k].banUntil = days > 0 ? Date.now() + days * 864e5 : 0;
    return DB.set('users', us);
  },
  unban(k) {
    const us = DB.users(); if (!us[k]) return false;
    us[k].banned = false; us[k].banUntil = 0; us[k].banReason = '';
    return DB.set('users', us);
  },
  login(id, p) {
    const k = this.find(id), us = DB.users();
    if (!k || us[k].pass !== this.hash(k + ':' + p)) return 'Wrong username/email or password';
    if (this.banOf(us[k])) return this.banMsg(us[k]);
    DB.set('session', k);
    return null;
  },
  reset(email, dob, np) {
    const us = DB.users(), k = email.includes('@') ? this.find(email) : null;
    if (!k || us[k].dob !== dob) return 'Email and date of birth do not match';
    if (np.length < 6) return 'Password must be at least 6 characters';
    us[k].pass = this.hash(k + ':' + np);
    DB.set('users', us);
    return null;
  },
  logout() { DB.del('session'); },
  key() { return DB.get('session', null); },
  me() {
    const k = this.key(), u = k ? DB.users()[k] : null;
    if (!u || this.banOf(u)) return null;
    return Object.assign({ key: k }, u);
  },
  isAdmin() {
    const m = this.me();
    return !!m && (m.email || '').toLowerCase() === CONFIG.ADMIN_EMAIL.toLowerCase();
  }
};

/* =====================================================
   WALLET (GV) + VOUCHER CODES
   ===================================================== */
const Wallet = {
  get(k) { const u = DB.users()[k]; return u ? (u.gv || 0) : 0; },
  add(k, n) {
    const us = DB.users();
    if (!us[k]) return false;
    us[k].gv = (us[k].gv || 0) + n;
    DB.set('users', us);
    return true;
  },
  spend(k, n) {
    const us = DB.users();
    if (!us[k] || (us[k].gv || 0) < n) return false;
    us[k].gv -= n;
    DB.set('users', us);
    return true;
  }
};

const Voucher = {
  sign(p) { return Auth.hash(Auth.hash(p + CONFIG.VOUCHER_SECRET) + p); },
  enc(s) { return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return atob(s);
  },
  make(userKey, amount) {
    const p = [userKey, amount, uid()].join('|');
    return this.enc(p) + '.' + this.sign(p);
  },
  redeem(code, userKey) {
    try {
      const parts = String(code).trim().split('.');
      const p = this.dec(parts[0]), f = p.split('|');
      if (parts[1] !== this.sign(p)) return 'Invalid voucher code';
      if (f[0] !== userKey) return 'This voucher belongs to another account';
      const used = DB.get('redeemed', []);
      if (used.includes(f[2])) return 'This voucher was already used';
      const amt = parseInt(f[1], 10);
      if (!(amt > 0)) return 'Invalid voucher code';
      Wallet.add(userKey, amt);
      used.push(f[2]);
      DB.set('redeemed', used);
      return null;
    } catch (e) { return 'Invalid voucher code'; }
  }
};

/* =====================================================
   AVATAR DATA + INVENTORY + SHOP
   ===================================================== */
const DEFAULT_COLORS = { head: '#f5cd30', torso: '#13a538', la: '#f5cd30', ra: '#f5cd30', ll: '#0d69ac', rl: '#0d69ac' };
const PART_LABELS = { head: 'Head', torso: 'Torso', la: 'Left Arm', ra: 'Right Arm', ll: 'Left Leg', rl: 'Right Leg' };
const SLOTS = ['Hat', 'Face', 'Neck', 'Back', 'Waist']; // wear.js adds Hair, Shoulder, T-Shirt, Pants, Shoes, Gloves

const Inv = {
  list(k) { return DB.get('own_' + k, []); },
  ids(k) { return this.list(k).map(o => o.id); },
  has(k, id) { return this.ids(k).includes(id); },
  add(k, id, serial) {
    const l = this.list(k);
    l.push({ id, serial, t: Date.now() });
    DB.set('own_' + k, l);
  }
};

const Avatar = {
  get(k) {
    const a = DB.get('av_' + k, null) || {};
    return { colors: Object.assign({}, DEFAULT_COLORS, a.colors), equipped: a.equipped || [], itemColors: a.itemColors || {} };
  },
  set(k, a) { DB.set('av_' + k, a); },
  // colors + the accessories the user owns and wears. "Recolor" items use the wearer's chosen color.
  resolve(k) {
    const a = this.get(k), own = Inv.ids(k), all = DB.items();
    const items = a.equipped.filter(id => own.includes(id)).map(id => all.find(i => i.id === id)).filter(i => i && !i.down)
      .map(it => {
        if (!it.recolor) return it;
        const c = a.itemColors[it.id] || (it.parts[0] && it.parts[0].color) || '#a3a2a5';
        return Object.assign({}, it, { parts: it.parts.map(p => Object.assign({}, p, { color: c })) });
      });
    return { colors: a.colors, items };
  },
  // one item per slot: wearing a new Hat removes the old Hat
  toggle(k, id) {
    const a = this.get(k), it = DB.items().find(x => x.id === id);
    if (!it) return;
    if (a.equipped.includes(id)) a.equipped = a.equipped.filter(x => x !== id);
    else {
      const all = DB.items();
      a.equipped = a.equipped.filter(x => { const o = all.find(i => i.id === x); return o && o.slot !== it.slot; });
      a.equipped.push(id);
    }
    this.set(k, a);
  }
};

const Shop = {
  // 3% platform tax on every purchase. The creator receives the rest.
  buy(k, id) {
    const items = DB.items(), it = items.find(x => x.id === id);
    if (!it || it.down) return 'Item not available';
    if (Inv.has(k, id)) return 'You already own this item';
    if (it.limited && (it.sold || 0) >= it.stock) return 'Sold out';
    if (it.price > 0 && !Wallet.spend(k, it.price)) return 'Not enough ' + GV + '. Top up in your wallet.';
    it.sold = (it.sold || 0) + 1;
    DB.set('items', items);
    if (it.price > 0 && it.creatorKey !== k) Wallet.add(it.creatorKey, Math.floor(it.price * (1 - CONFIG.MARKET_CUT)));
    Inv.add(k, id, it.limited ? it.sold : 0);
    return null;
  }
};

/* =====================================================
   PLACES (maps) AND ACCESSORY DRAFTS
   ===================================================== */
function makeStore(prefix, max) {
  return {
    list(k) { return DB.get(prefix + k, []); },
    get(k, id) { return this.list(k).find(x => x.id === id) || null; },
    save(k, rec) {
      const l = this.list(k), i = l.findIndex(x => x.id === rec.id);
      if (i < 0) { if (l.length >= max) return 'LIMIT'; l.push(rec); } else l[i] = rec;
      return DB.set(prefix + k, l) ? null : 'STORAGE';
    },
    remove(k, id) { DB.set(prefix + k, this.list(k).filter(x => x.id !== id)); }
  };
}
const Places = makeStore('places_', CONFIG.MAX_PLACES);
const Drafts = makeStore('acc_', CONFIG.MAX_ACC_DRAFTS);

function newPlace() {
  return {
    id: uid(), name: '', desc: '', gameId: null, maxPlayers: 8, spawn: null, env: null,
    parts: [
      { type: 'part', name: 'Baseplate', parent: null, x: 0, y: -1, z: 0, w: 200, h: 2, d: 200, color: '#5aa040' },
      { type: 'part', name: 'SpawnLocation', parent: null, x: 0, y: 0.5, z: 0, w: 6, h: 1, d: 6, color: '#a3a2a5', spawn: true }
    ]
  };
}
function newAcc() {
  return {
    id: uid(), name: '', desc: '', slot: 'Hat', price: 100, limited: false, stock: 100, recolor: false,
    status: 'draft', note: '',
    parts: [{ type: 'part', name: 'Part', parent: null, attach: 'head', x: 0, y: 5.6, z: 0, w: 1.6, h: 0.5, d: 1.6, color: '#a3a2a5' }]
  };
}

/* =====================================================
   ACCESSORY SUBMISSIONS (review queue) + TAKEDOWN
   ===================================================== */
const Subs = {
  submit(me, draft, meta) {
    if (!Wallet.spend(me.key, CONFIG.ACC_PRICE)) return 'Not enough ' + GV + ' for the review fee';
    const sub = {
      id: uid(), draftId: draft.id, creator: me.name, creatorKey: me.key,
      name: meta.name, desc: meta.desc, slot: meta.slot, price: meta.price,
      limited: meta.limited, stock: meta.stock, recolor: !!meta.recolor,
      parts: JSON.parse(JSON.stringify(draft.parts)),
      fee: CONFIG.ACC_PRICE, status: 'pending', note: '', time: Date.now()
    };
    const l = DB.pending(); l.push(sub); DB.set('pending', l);
    return sub;
  },
  mark(s, status, note) {
    const d = Drafts.get(s.creatorKey, s.draftId);
    if (d) { d.status = status; d.note = note; Drafts.save(s.creatorKey, d); }
  },
  approve(id) {
    const l = DB.pending(), s = l.find(x => x.id === id);
    if (!s || s.status !== 'pending') return 'Submission not found';
    const items = DB.items();
    items.push({
      id: uid(), subId: s.id, name: s.name, desc: s.desc, creator: s.creator, creatorKey: s.creatorKey,
      slot: s.slot, parts: s.parts, price: s.price, limited: s.limited, stock: s.stock, recolor: !!s.recolor, sold: 0, time: Date.now()
    });
    DB.set('items', items);
    s.status = 'approved';
    DB.set('pending', l);
    this.mark(s, 'approved', '');
    return null;
  },
  reject(id, reason) {
    const l = DB.pending(), s = l.find(x => x.id === id);
    if (!s || s.status !== 'pending') return { err: 'Submission not found' };
    s.status = 'rejected'; s.note = reason;
    DB.set('pending', l);
    const refunded = Wallet.add(s.creatorKey, s.fee);
    this.mark(s, 'rejected', reason);
    return { refunded, code: refunded ? '' : Voucher.make(s.creatorKey, s.fee) };
  },
  // owner takes a live item off the shop (and off every avatar)
  takedown(id, reason) {
    const items = DB.items(), it = items.find(x => x.id === id);
    if (!it) return 'Item not found';
    it.down = true; it.downNote = String(reason || 'Violation').slice(0, 80);
    DB.set('items', items);
    const s = DB.pending().find(x => x.id === it.subId);
    if (s) this.mark(s, 'down', it.downNote);
    return null;
  },
  restore(id) {
    const items = DB.items(), it = items.find(x => x.id === id);
    if (!it) return 'Item not found';
    it.down = false; it.downNote = '';
    DB.set('items', items);
    const s = DB.pending().find(x => x.id === it.subId);
    if (s) this.mark(s, 'approved', '');
    return null;
  },
  exportCode(s) { return btoa(unescape(encodeURIComponent(JSON.stringify(s)))); },
  // sanitize parts (also used for avatars received from other players)
  cleanParts(parts, max) {
    return (Array.isArray(parts) ? parts : []).slice(0, max).map(p => ({
      type: 'part',
      name: String(p.name || 'Part').slice(0, 30),
      x: clamp(+p.x || 0, -6, 6), y: clamp(+p.y || 0, -1, 12), z: clamp(+p.z || 0, -6, 6),
      w: clamp(+p.w || 1, 0.2, 6), h: clamp(+p.h || 1, 0.2, 6), d: clamp(+p.d || 1, 0.2, 6),
      color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#a3a2a5',
      attach: ATTACH.includes(p.attach) ? p.attach : ''
    }));
  },
  importCode(code) {
    let s;
    try { s = JSON.parse(decodeURIComponent(escape(atob(String(code).trim())))); }
    catch (e) { return 'Invalid submission code'; }
    if (!s || typeof s !== 'object' || !s.id || !s.name || !s.creatorKey) return 'Invalid submission code';
    const l = DB.pending();
    if (l.some(x => x.id === s.id)) return 'This submission was already imported';
    l.push({
      id: String(s.id).slice(0, 30), draftId: String(s.draftId || '').slice(0, 30),
      creator: String(s.creator || '?').slice(0, 20), creatorKey: String(s.creatorKey).slice(0, 20).toLowerCase(),
      name: String(s.name).slice(0, 30), desc: String(s.desc || '').slice(0, 120),
      slot: SLOTS.includes(s.slot) ? s.slot : 'Hat',
      price: clamp(Math.floor(+s.price || 0), 0, CONFIG.MAX_PRICE),
      limited: !!s.limited, stock: clamp(Math.floor(+s.stock || 1), 1, CONFIG.MAX_STOCK), recolor: !!s.recolor,
      parts: this.cleanParts(s.parts, CONFIG.MAX_ACC_PARTS),
      fee: CONFIG.ACC_PRICE, status: 'pending', note: '', time: Date.now()
    });
    DB.set('pending', l);
    return null;
  }
};