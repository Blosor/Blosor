/* =====================================================
   SHARED HELPERS
   ===================================================== */
const $ = s => document.querySelector(s);
const byId = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const GV = '⊙';

/* =====================================================
   CONFIG
   ===================================================== */
const CONFIG = {
  ADMIN_EMAIL: 'ssaapp257@gmail.com',
  OWNER_CONTACT: 'ownerblosor@gmail.com',
  VOUCHER_SECRET: 'I-Love-U-MOM-TY',
  OWNER_PUB: null,                        // paste the public key from Admin -> Generate moderation key
  MAP_PRICE: 3500,
  ACC_PRICE: 1090,
  MARKET_CUT: 0.03,
  MIN_AGE: 10,
  MAX_PLAYERS_LIMIT: 50,
  MAX_PLACES: 100,
  MAX_ACC_DRAFTS: 100,
  MAX_PARTS: 1500,
  MAX_ACC_PARTS: 120,
  MAX_PRICE: 100000000000000,
  MAX_STOCK: 10000000000
};

/* =====================================================
   LOCAL DATABASE (localStorage). Prefix "by_" = fresh start.
   ===================================================== */
const DB = {
  get(k, d) {
    try {
      const v = JSON.parse(localStorage.getItem('by_' + k));
      return v === null || v === undefined ? d : v;
    } catch (e) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('by_' + k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  },
  del(k) { localStorage.removeItem('by_' + k); },
  users() { return this.get('users', {}); },
  games() { return this.get('games', []); },
  items() { return this.get('items', []); },
  pending() { return this.get('pending', []); },
  reports() { return this.get('reports', []); },
  // delete everything of this app on this device (the moderation key is kept)
  wipe() {
    const keep = 'by_modkey';
    Object.keys(localStorage).forEach(k => {
      if ((k.startsWith('by_') && k !== keep) || k.startsWith('bx_') || k.startsWith('bl_')) localStorage.removeItem(k);
    });
  }
};

const GameData = {
  get(id) { return DB.get('gp_' + id, null); },
  set(id, d) { return DB.set('gp_' + id, d); },
  del(id) { DB.del('gp_' + id); }
};

/* =====================================================
   BAD WORD FILTER (English + Indonesian, owner can add words)
   ===================================================== */
const Filter = (() => {
  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
  const STRICT = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'pussy', 'asshole', 'bastard',
    'bodoh', 'anjing', 'bangsat', 'kontol', 'memek', 'ngentot', 'jancok', 'jancuk', 'goblok', 'tolol', 'bajingan',
    'kampret', 'pepek', 'pelacur', 'keparat', 'brengsek', 'sialan', 'jembut'];
  const WORDS = ['ass', 'dick', 'cock', 'porn', 'rape', 'slut', 'retard', 'fag', 'asu', 'babi', 'tai', 'idiot'];
  const EXTRA = [];

  const squash = s => s.replace(/(.)\1+/g, '$1');
  const cap2 = s => s.replace(/(.)\1{2,}/g, '$1$1');
  const norm = s => String(s).toLowerCase().replace(/[013457@$!]/g, c => LEET[c]);

  function add(ws) {
    (ws || []).forEach(w => {
      w = String(w).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (w.length >= 3 && !EXTRA.includes(w)) EXTRA.push(w);
    });
  }
  function has(text) {
    const toks = norm(text).split(/[^a-z]+/).filter(Boolean);
    const checks = [];
    let run = '';
    for (const t of toks) {
      if (t.length === 1) run += t;
      else { if (run.length > 2) checks.push(run); run = ''; checks.push(t); }
    }
    if (run.length > 2) checks.push(run);
    const strict = STRICT.concat(EXTRA).map(w => squash(norm(w)));
    return checks.some(c => WORDS.includes(cap2(c)) || strict.some(w => squash(c).includes(w)));
  }
  function mask(text) {
    text = String(text);
    const out = text.split(/(\s+)/).map(w => (w.trim() && has(w)) ? '#'.repeat(w.length) : w).join('');
    return (out === text && has(text)) ? '#'.repeat(Math.min(text.length, 12)) : out;
  }
  add(DB.get('badwords', []));
  return { has, mask, add };
})();

/* =====================================================
   MODERATION: a list signed by the owner (ECDSA P-256).
   The private key never leaves the owner's browser. Other devices
   download the list through the lobby and verify it with CONFIG.OWNER_PUB.
   ===================================================== */
const Mod = {
  EMPTY: { v: 0, games: {}, gone: [], users: {}, verified: [], deduct: [], words: [] },
  list() { return DB.get('mod', this.EMPTY); },
  ok() { return !!(window.crypto && crypto.subtle); },
  b64(buf) { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); },
  unb64(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; },
  alg: { name: 'ECDSA', namedCurve: 'P-256' },

  async genKey() {
    const k = await crypto.subtle.generateKey(this.alg, true, ['sign', 'verify']);
    const priv = await crypto.subtle.exportKey('jwk', k.privateKey), pub = await crypto.subtle.exportKey('jwk', k.publicKey);
    DB.set('modkey', { priv, pub });
    DB.del('modhash');
    return pub;
  },
  async sign(s) {
    const mk = DB.get('modkey', null); if (!mk) return null;
    const key = await crypto.subtle.importKey('jwk', mk.priv, this.alg, false, ['sign']);
    return this.b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(s)));
  },
  async verify(p) {
    try {
      if (!CONFIG.OWNER_PUB || !p || typeof p.s !== 'string' || typeof p.sig !== 'string' || p.s.length > 200000) return false;
      const key = await crypto.subtle.importKey('jwk', CONFIG.OWNER_PUB, this.alg, false, ['verify']);
      return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, this.unb64(p.sig), new TextEncoder().encode(p.s));
    } catch (e) { return false; }
  },

  // current moderation state of this device (owner side)
  state() {
    const g = {}, u = {}, us = DB.users();
    DB.games().forEach(x => { if (x.down) g[x.id] = x.downNote || 'Taken down'; });
    Object.keys(us).forEach(k => { const b = Auth.banOf(us[k]); if (b) u[k] = { r: b.banReason || 'Violation', u: b.banUntil || 0 }; });
    return { games: g, gone: DB.get('modgone', []), users: u, verified: DB.get('modver', []), deduct: DB.get('moddeduct', []).slice(-300), words: DB.get('badwords', []) };
  },
  async rebuild() {
    if (!this.ok() || !Auth.isAdmin() || !DB.get('modkey', null)) return null;
    const st = this.state(), h = JSON.stringify(st);
    if (h === DB.get('modhash', '') && DB.get('modpack', null)) return this.pack();
    const list = Object.assign({ v: Date.now() }, st), s = JSON.stringify(list), sig = await this.sign(s);
    if (!sig) return null;
    DB.set('modpack', { s, sig }); DB.set('modhash', h);
    this.apply(list);
    return this.pack();
  },
  pack() { return DB.get('modpack', null); },

  // a pack received from the network
  async consume(p) {
    if (!(await this.verify(p))) return;
    try { const l = JSON.parse(p.s); if (+l.v > this.list().v) this.apply(l); } catch (e) {}
  },

  // sanitize and store a moderation list, then enforce it on this device
  apply(l) {
    if (!l || typeof l !== 'object') return;
    const id = s => /^[a-z0-9]{4,24}$/.test(String(s)), nm = s => /^[a-z0-9_]{3,20}$/.test(String(s));
    const c = { v: +l.v || 0, games: {}, gone: [], users: {}, verified: [], deduct: [], words: [] };
    Object.keys(l.games || {}).slice(0, 500).forEach(k => { if (id(k)) c.games[k] = String(l.games[k]).slice(0, 80); });
    (l.gone || []).slice(0, 500).forEach(k => { if (id(k)) c.gone.push(String(k)); });
    Object.keys(l.users || {}).slice(0, 500).forEach(k => { const x = l.users[k] || {}; if (nm(k)) c.users[k] = { r: String(x.r || '').slice(0, 80), u: +x.u || 0 }; });
    (l.verified || []).slice(0, 500).forEach(k => { if (nm(k)) c.verified.push(String(k)); });
    (l.deduct || []).slice(0, 300).forEach(d => { if (d && id(d.id) && nm(d.k)) c.deduct.push({ id: String(d.id), k: String(d.k), a: clamp(Math.floor(+d.a || 0), 1, 1e12) }); });
    (l.words || []).slice(0, 500).forEach(w => { w = String(w).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20); if (w.length >= 3) c.words.push(w); });
    DB.set('mod', c);
    Filter.add(c.words);

    // games: hide / un-hide / remove on this device
    const gs = DB.games(); let ch = false;
    const keepG = gs.filter(g => !c.gone.includes(g.id));
    if (keepG.length !== gs.length) ch = true;
    keepG.forEach(g => {
      if (c.games[g.id]) { if (!g.down) { g.down = true; g.downNote = c.games[g.id]; g.downBy = 'mod'; ch = true; } }
      else if (g.down && g.downBy === 'mod') { g.down = false; g.downNote = ''; g.downBy = ''; ch = true; }
    });
    if (ch) DB.set('games', keepG);
    gs.filter(g => c.gone.includes(g.id)).forEach(g => GameData.del(g.id));
    const rc = DB.get('recent', []), keepR = rc.filter(x => !c.games[x] && !c.gone.includes(x));
    rc.filter(x => !keepR.includes(x)).forEach(x => DB.del('rc_' + x));
    if (keepR.length !== rc.length) DB.set('recent', keepR);
    this.deducts();
  },
  // GV deductions ordered by the owner: applied once per id for the logged-in player
  deducts() {
    const me = Auth.key(); if (!me) return;
    const done = DB.get('dedone', []); let ch = false;
    this.list().deduct.forEach(d => { if (d.k === me && !done.includes(d.id)) { Wallet.deduct(me, d.a); done.push(d.id); ch = true; } });
    if (ch) DB.set('dedone', done.slice(-500));
  },
  blocked(id) {
    const l = this.list();
    if (l.games[id]) return 'This game was taken down: ' + l.games[id];
    if (l.gone.includes(id)) return 'This game was removed';
    const g = DB.games().find(x => x.id === id);
    return g && g.down ? 'This game was taken down: ' + (g.downNote || 'policy violation') : null;
  }
};

/* =====================================================
   AUTH (username + email + date of birth) + BANS
   ===================================================== */
const Auth = {
  flash: '',
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
  // ban made on this device
  banOf(u) { return u && u.banned && (!u.banUntil || Date.now() < u.banUntil) ? u : null; },
  // local ban or a ban from the owner's signed list
  banFor(k, u) {
    const l = this.banOf(u); if (l) return l;
    const m = Mod.list().users[k];
    if (m && (!m.u || Date.now() < m.u)) return { banReason: m.r, banUntil: m.u };
    return null;
  },
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
  setPass(k, p) {
    const us = DB.users(); if (!us[k] || String(p).length < 6) return false;
    us[k].pass = this.hash(k + ':' + p);
    return DB.set('users', us);
  },
  login(id, p) {
    const k = this.find(id), us = DB.users();
    if (!k || us[k].pass !== this.hash(k + ':' + p)) return 'Wrong username/email or password';
    const b = this.banFor(k, us[k]);
    if (b) return this.banMsg(b);
    if (Filter.has(us[k].name)) return 'Your username is not allowed. Contact the owner.';
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
    if (!u) return null;
    const b = this.banFor(k, u);
    if (b) { this.flash = this.banMsg(b); this.logout(); return null; }
    if (Filter.has(u.name)) { this.flash = 'Your username is not allowed. Contact the owner.'; this.logout(); return null; }
    return Object.assign({ key: k }, u);
  },
  isAdmin() {
    const k = this.key(), u = k ? DB.users()[k] : null;
    return !!u && (u.email || '').toLowerCase() === CONFIG.ADMIN_EMAIL.toLowerCase();
  },
  isVerified(k) {
    k = String(k || '').toLowerCase();
    return Mod.list().verified.includes(k) || DB.get('modver', []).includes(k);
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
  },
  // take away up to n (never below 0). Returns how much was taken.
  deduct(k, n) {
    const us = DB.users(); if (!us[k]) return 0;
    const t = Math.min(us[k].gv || 0, n);
    us[k].gv = (us[k].gv || 0) - t;
    DB.set('users', us);
    return t;
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
const SLOTS = ['Hat', 'Face', 'Neck', 'Back', 'Waist'];

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
    id: uid(), name: '', desc: '', gameId: null, maxPlayers: 8, spawn: null, env: null, paid: false,
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
