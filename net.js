/* =====================================================
   NET: peer-to-peer multiplayer (WebRTC through PeerJS) + LOBBY.

   Game servers: the first device that opens a game is the HOST.
   Slots are named  blosor-<gameCode>-s1, s2 ...  (full -> next slot).
   Net.probe() asks every slot how many players it has (server list).

   Lobby: the first device claims "blosor-lobby-1" and acts as the directory
   for published games, friend requests, friend presence and the owner's
   signed moderation list. If it leaves, the next device claims the id.
   ===================================================== */
const NetCfg = {
  peer: {},   // your own PeerServer: { host:'peer.example.com', port:443, path:'/', secure:true }
  ice: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
    // , { urls: 'turn:YOUR_TURN_HOST:3478', username: 'user', credential: 'pass' }
  ],
  mk(id) {
    const o = Object.assign({ debug: 0, config: { iceServers: this.ice } }, this.peer);
    return id ? new Peer(id, o) : new Peer(o);
  }
};

const Net = {
  live: false, isHost: true, solo: false, peer: null, cp: null, hc: null, clients: {}, n: 0,
  o: null, slot: 0, fails: 0, q: [], hold: true, myId: 'h', MAXSLOTS: 15, joined: false, rx: 0, wt: null,

  // o = { gid, slot?, max, name, av, map|null, snapshot(), watch(), onMsg, onJoin, onLeft, onClosed, onKick, done(err, info) }
  enter(o) {
    this.leave();
    this.o = o; this.live = true; this.isHost = true; this.solo = false; this.slot = o.slot > 0 ? o.slot - 1 : 0; this.fails = 0;
    this.q = []; this.hold = true; this.clients = {}; this.n = 0; this.myId = 'h'; this.joined = false; this.rx = Date.now();
    if (typeof Peer === 'undefined') return this.fallback('Multiplayer library not loaded (needs internet).');
    this.wt = setInterval(() => this.watch(), 2500);
    this.next();
  },

  fallback(msg) {
    const o = this.o;
    this.closeAll();
    if (o && o.map) { this.live = true; this.solo = true; this.isHost = true; o.done(null, { host: true, solo: true, reason: msg, id: 'h', map: o.map, players: [] }); }
    else { this.live = false; if (o) o.done(msg); }
  },

  next() {
    if (!this.live) return;
    const o = this.o;
    if (++this.slot > this.MAXSLOTS) return this.fallback('All servers are full. Try again later.');
    const pid = 'blosor-' + o.gid + '-s' + this.slot;
    let done = false, p;
    try { p = NetCfg.mk(pid); } catch (e) { return this.fallback('Cannot start multiplayer.'); }
    this.peer = p;
    p.on('open', () => { if (done || !this.live) return; done = true; this.becomeHost(p); });
    p.on('error', e => {
      if (done) return;
      done = true;
      try { p.destroy(); } catch (_) {}
      if (e && e.type === 'unavailable-id') this.client(pid);
      else this.fallback('Cannot reach the multiplayer service (' + (e && e.type || 'error') + ').');
    });
  },

  becomeHost(p) {
    const o = this.o;
    if (!o.map) { this.closeAll(); this.live = false; return o.done('No server is online for this game and its map could not be found.'); }
    this.isHost = true; this.myId = 'h';
    p.on('connection', c => this.hostConn(c));
    p.on('disconnected', () => { try { p.reconnect(); } catch (_) {} });
    o.done(null, { host: true, id: 'h', map: o.map, players: [] });
  },

  client(pid) {
    const o = this.o;
    let settled = false, c = null, tm = null, p = this.cp;
    if (!p || p.destroyed) p = this.cp = NetCfg.mk();
    const cleanup = () => { settled = true; clearTimeout(tm); try { p.off('error', onErr); } catch (_) {} };
    const retry = count => {
      cleanup();
      try { if (c) c.close(); } catch (_) {}
      if (count && ++this.fails >= 3) return this.fallback('Could not connect. Your network may block peer-to-peer (a TURN server is needed).');
      this.next();
    };
    const onErr = e => {
      if (settled) return;
      if (e && e.type === 'peer-unavailable') { this.slot--; retry(true); }
      else { cleanup(); this.fallback('Cannot reach the multiplayer service.'); }
    };
    p.on('error', onErr);
    const go = () => {
      if (!this.live || settled) return;
      c = p.connect(pid, { reliable: true });
      tm = setTimeout(() => { if (!settled) retry(true); }, 9000);
      c.on('open', () => c.send({ t: 'join', name: o.name, av: o.av }));
      c.on('data', m => {
        if (!m || typeof m !== 'object') return;
        if (!settled) {
          if (m.t === 'full') return retry(false);
          if (m.t === 'welcome') {
            cleanup();
            this.hc = c; this.isHost = false; this.myId = String(m.id); this.joined = true; this.rx = Date.now();
            return o.done(null, { host: false, id: this.myId, map: m.map, players: m.players || [], dyn: m.dyn || [], watch: m.watch || [] });
          }
          return;
        }
        this.rx = Date.now();
        if (m.t === 'ping') return;
        if (m.t === 'kick') { if (o.onKick) o.onKick(String(m.reason || 'Removed by the server').slice(0, 80)); return; }
        this.deliver(m, 'h');
      });
      c.on('close', () => { if (!settled) return retry(true); if (this.live && this.joined) { this.joined = false; if (o.onClosed) o.onClosed(); } });
      c.on('error', () => { if (!settled) retry(true); });
    };
    if (p.open) go(); else p.once('open', go);
  },

  hostConn(c) {
    const o = this.o; let id = null;
    const hello = setTimeout(() => { if (!id) { try { c.close(); } catch (_) {} } }, 10000);
    c.on('data', m => {
      if (!m || typeof m !== 'object') return;
      if (!id) {
        if (m.t === 'probe') { // server list: tell how many players are here, do not join
          try { c.send({ t: 'info', n: this.count(), max: o.max }); } catch (_) {}
          setTimeout(() => { try { c.close(); } catch (_) {} }, 400);
          return;
        }
        if (m.t !== 'join') return;
        clearTimeout(hello);
        if (Object.keys(this.clients).length + 1 >= o.max) {
          try { c.send({ t: 'full' }); } catch (_) {}
          setTimeout(() => { try { c.close(); } catch (_) {} }, 400);
          return;
        }
        id = 'p' + (++this.n);
        const pl = { id, name: Filter.mask(String(m.name || 'Player').replace(/[^\w]/g, '').slice(0, 20)) || 'Player', av: this.cleanAv(m.av) };
        const players = [{ id: 'h', name: o.name, av: o.av }].concat(Object.values(this.clients).map(x => x.pl));
        this.clients[id] = { c, pl, rx: Date.now() };
        c.send({ t: 'welcome', id, map: o.map, players, dyn: o.snapshot ? o.snapshot() : [], watch: o.watch ? o.watch() : [] });
        this.relay({ t: 'joined', p: pl }, id);
        if (o.onJoin) o.onJoin(pl);
        return;
      }
      const x = this.clients[id]; if (x) x.rx = Date.now();
      if (m.t === 'ping') return;
      this.deliver(m, id);
    });
    const left = () => { clearTimeout(hello); if (id) this.removeClient(id); };
    c.on('close', left); c.on('error', left);
  },

  removeClient(id) {
    const x = this.clients[id]; if (!x) return;
    delete this.clients[id];
    try { x.c.close(); } catch (_) {}
    this.send({ t: 'left', id });
    if (this.o && this.o.onLeft) this.o.onLeft(id);
  },

  watch() {
    if (!this.live || this.solo) return;
    const now = Date.now();
    this.send({ t: 'ping' });
    if (this.isHost) Object.keys(this.clients).forEach(id => { if (now - this.clients[id].rx > 20000) this.removeClient(id); });
    else if (this.joined && now - this.rx > 20000) { this.joined = false; if (this.o && this.o.onClosed) this.o.onClosed(); }
  },

  kick(id, reason) {
    const x = this.clients[id]; if (!x) return;
    try { x.c.send({ t: 'kick', reason: String(reason || '').slice(0, 80) }); } catch (_) {}
    setTimeout(() => this.removeClient(id), 500);
  },

  deliver(m, from) { if (this.hold) this.q.push([m, from]); else if (this.o && this.o.onMsg) this.o.onMsg(m, from); },
  release() { this.hold = false; const q = this.q; this.q = []; q.forEach(x => this.deliver(x[0], x[1])); },

  send(m) {
    if (this.solo || !this.live) return;
    try {
      if (this.isHost) Object.values(this.clients).forEach(x => { try { x.c.send(m); } catch (_) {} });
      else if (this.hc) this.hc.send(m);
    } catch (_) {}
  },
  sendTo(id, m) { const x = this.clients[id]; if (x) try { x.c.send(m); } catch (_) {} },
  relay(m, except) { Object.keys(this.clients).forEach(i => { if (i !== except) this.sendTo(i, m); }); },
  count() { return Object.keys(this.clients).length + 1; },

  cleanAv(a) {
    a = a || {};
    const col = {};
    Object.keys(DEFAULT_COLORS).forEach(k => { col[k] = hexOk((a.colors || {})[k], DEFAULT_COLORS[k]); });
    const items = (Array.isArray(a.items) ? a.items : []).slice(0, 8).map(i => ({ parts: Subs.cleanParts(i && i.parts, CONFIG.MAX_ACC_PARTS) }));
    return {
      colors: col, items, face: Faces.clean(a.face),
      pack: { anims: Packs.clean(a.pack && a.pack.anims), body: Packs.cleanBody(a.pack && a.pack.body) }
    };
  },

  // server list: how many players are in each slot of a game. cb([{slot, n, max, empty}])
  probe(gid, cb) {
    if (typeof Peer === 'undefined') return cb([]);
    let p; try { p = NetCfg.mk(); } catch (e) { return cb([]); }
    const res = [], N = 6; let done = false;
    const fin = () => { if (done) return; done = true; clearTimeout(kill); try { p.destroy(); } catch (_) {} cb(res.sort((a, b) => a.slot - b.slot)); };
    const kill = setTimeout(fin, 7000);
    const add = r => { if (!res.some(x => x.slot === r.slot)) res.push(r); if (res.length >= N) fin(); };
    p.on('error', e => { const m = /-s(\d+)/.exec(String(e && e.message || '')); if (m) add({ slot: +m[1], n: 0, max: 0, empty: true }); });
    p.on('open', () => {
      for (let s = 1; s <= N; s++) {
        const c = p.connect('blosor-' + gid + '-s' + s, { reliable: true });
        c.on('open', () => c.send({ t: 'probe' }));
        c.on('data', m => { if (m && m.t === 'info') { add({ slot: s, n: num(m.n, 0, 100, 0), max: num(m.max, 1, 100, 8), empty: false }); try { c.close(); } catch (_) {} } });
      }
    });
  },

  closeAll() {
    Object.values(this.clients).forEach(x => { try { x.c.close(); } catch (_) {} });
    this.clients = {};
    try { if (this.hc) this.hc.close(); } catch (_) {}
    this.hc = null;
    try { if (this.peer) this.peer.destroy(); } catch (_) {}
    try { if (this.cp) this.cp.destroy(); } catch (_) {}
    this.peer = null; this.cp = null;
  },
  leave() {
    this.live = false; this.solo = false; this.joined = false; clearInterval(this.wt); this.wt = null;
    this.closeAll(); this.q = []; this.hold = true;
    if (typeof Lobby !== 'undefined') { Lobby.pres = null; Lobby.last = 0; }
  }
};
addEventListener('beforeunload', () => Net.leave());

/* =====================================================
   LOBBY: peer-to-peer directory (games, friends, moderation)
   ===================================================== */
const Lobby = {
  DIR: 'blosor-lobby-1', role: null, dp: null, cp: null, ent: {}, list: [], busy: false, last: 0, sig: '',
  status: 'Searching...', started: false, MAXMAP: 600000,
  pres: null, fpres: {}, prs: {}, ibx: {}, mod: null, modv: 0,

  /* ----- what this device offers ----- */
  mine() {
    const me = Auth.me(); if (!me) return [];
    return DB.games().filter(g => g.authorKey === me.key && g.listed !== false && !g.down)
      .map(g => ({ id: g.id, name: g.name, desc: g.desc || '', author: g.author, max: g.maxPlayers || 8, v: g.time || 0, owner: me.key }));
  },
  sigOf() { return this.mine().map(m => m.id + ':' + m.v).join(','); },
  mapOf(id) {
    const d = GameData.get(id); if (!d) return null;
    try { return JSON.stringify(d).length <= this.MAXMAP ? d : null; } catch (e) { return null; }
  },
  clean(g) {
    if (!g || typeof g !== 'object') return null;
    const id = String(g.id || '');
    if (!/^[a-z0-9]{4,24}$/.test(id)) return null;
    return {
      id, name: Filter.mask(String(g.name || 'Game').slice(0, 40)), desc: Filter.mask(String(g.desc || '').slice(0, 120)),
      author: Filter.mask(String(g.author || '').slice(0, 20)), max: num(g.max, 1, CONFIG.MAX_PLAYERS_LIMIT, 8),
      v: num(g.v, 0, 1e15, 0), owner: String(g.owner || '').slice(0, 20)
    };
  },
  cleanList(a) { return (Array.isArray(a) ? a : []).slice(0, 100).map(g => this.clean(g)).filter(Boolean); },

  /* ----- directory side ----- */
  prune() { const t = Date.now(); Object.keys(this.ent).forEach(id => { const e = this.ent[id]; if (!e.own && t - e.seen > 150000) delete this.ent[id]; }); },
  metas() { this.prune(); return Object.values(this.ent).filter(e => e.map && !Mod.blocked(e.meta.id)).map(e => e.meta); },
  regOwn() {
    const mine = this.mine(), ids = new Set(mine.map(m => m.id));
    mine.forEach(m => { const d = this.mapOf(m.id); if (d) this.ent[m.id] = { meta: m, map: d, seen: Date.now(), own: 1 }; });
    Object.keys(this.ent).forEach(id => { if (this.ent[id].own && !ids.has(id)) delete this.ent[id]; });
  },
  takeMod(p) {
    Mod.verify(p).then(ok => {
      if (!ok) return;
      try { const v = JSON.parse(p.s).v; if (v > this.modv) { this.mod = p; this.modv = v; } Mod.consume(p); } catch (_) {}
    });
  },
  // presence + friend requests. Returns what this player should receive.
  social(me, friends, pres) {
    me = String(me || '').toLowerCase().slice(0, 20);
    if (!/^[a-z0-9_]{3,20}$/.test(me)) return { inbox: [], pres: {} };
    const t = Date.now();
    if (pres && typeof pres === 'object' && /^[a-z0-9]{4,24}$/.test(String(pres.gid))) {
      this.prs[me] = { gid: String(pres.gid), slot: num(pres.slot, 1, 50, 1), gname: String(pres.gname || '').slice(0, 40), ts: t };
    } else delete this.prs[me];
    Object.keys(this.prs).forEach(k => { if (t - this.prs[k].ts > 150000) delete this.prs[k]; });
    const inbox = this.ibx[me] || []; delete this.ibx[me];
    const out = {};
    (Array.isArray(friends) ? friends : []).slice(0, 100).forEach(f => {
      f = String(f).toLowerCase(); const x = this.prs[f];
      if (x) out[f] = { gid: x.gid, slot: x.slot, gname: x.gname };
    });
    return { inbox, pres: out };
  },
  fr(m) {
    const to = String(m.to || '').toLowerCase(), from = String(m.from || '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(to) || !/^[a-z0-9_]{3,20}$/.test(from)) return;
    const l = this.ibx[to] = this.ibx[to] || [];
    if (l.length < 50) l.push({ k: m.k === 'acc' ? 'acc' : 'req', from });
  },
  claim(cb) {
    let p, done = false;
    try { p = NetCfg.mk(this.DIR); } catch (e) { return cb(false); }
    p.on('open', () => {
      if (done) return; done = true;
      this.role = 'dir'; this.dp = p;
      p.on('connection', c => this.serve(c));
      p.on('disconnected', () => { try { p.reconnect(); } catch (_) {} });
      p.on('close', () => { if (this.dp === p) { this.role = null; this.dp = null; } });
      p.on('error', () => {});
      this.regOwn(); this.list = this.metas();
      cb(true);
    });
    p.on('error', () => { if (done) return; done = true; try { p.destroy(); } catch (_) {} cb(false); });
  },
  serve(c) {
    const send = m => { try { c.send(m); } catch (_) {} };
    c.on('data', m => {
      if (!m || typeof m !== 'object') return;
      this.prune();
      if (m.t === 'sync') {
        const need = [];
        (Array.isArray(m.games) ? m.games : []).slice(0, 20).forEach(g => {
          const meta = this.clean(g); if (!meta || Mod.blocked(meta.id)) return;
          const e = this.ent[meta.id];
          if (e && e.own) return;
          if (e && e.meta.owner !== meta.owner && Date.now() - e.seen < 150000) return;
          if (e && e.map && e.meta.v === meta.v) { e.seen = Date.now(); return; }
          this.ent[meta.id] = { meta, map: null, seen: Date.now() };
          need.push(meta.id);
        });
        if (m.mod) this.takeMod(m.mod);
        const s = this.social(m.me, m.friends, m.pres);
        send(need.length ? { t: 'need', ids: need, inbox: s.inbox, pres: s.pres, mod: this.mod }
                         : { t: 'list', games: this.metas(), inbox: s.inbox, pres: s.pres, mod: this.mod });
      } else if (m.t === 'maps') {
        (Array.isArray(m.maps) ? m.maps : []).slice(0, 10).forEach(x => {
          const e = x && this.ent[String(x.id)];
          if (!e || e.map || !x.data || typeof x.data !== 'object') return;
          let ok = false; try { ok = JSON.stringify(x.data).length <= this.MAXMAP; } catch (_) {}
          if (ok) e.map = x.data;
        });
        send({ t: 'list', games: this.metas(), mod: this.mod });
      } else if (m.t === 'get') {
        const e = this.ent[String(m.id)];
        send({ t: 'map', id: String(m.id), data: e && e.map && !Mod.blocked(String(m.id)) ? e.map : null });
      } else if (m.t === 'fr') { this.fr(m); send({ t: 'ok' }); }
    });
  },

  /* ----- client side ----- */
  talk(first, handle, cb) {
    let done = false, c = null, tm = null;
    let p = this.cp;
    if (!p || p.destroyed) p = this.cp = NetCfg.mk();
    const finish = r => { if (done) return; done = true; clearTimeout(tm); try { p.off('error', onErr); } catch (_) {} try { if (c) c.close(); } catch (_) {} cb(r); };
    const onErr = e => finish(e && e.type === 'peer-unavailable' ? 'none' : 'err');
    p.on('error', onErr);
    const go = () => {
      if (done) return;
      c = p.connect(this.DIR, { reliable: true });
      tm = setTimeout(() => finish('err'), 9000);
      c.on('open', () => c.send(first));
      c.on('data', m => { if (m && typeof m === 'object') handle(m, c, finish); });
      c.on('error', () => finish('err'));
      c.on('close', () => finish('err'));
    };
    if (p.disconnected) { try { p.reconnect(); } catch (_) {} }
    if (p.open) go(); else p.once('open', go);
  },

  // process social + moderation data that came back from the directory
  eat(m) {
    if (m.mod) Mod.consume(m.mod);
    if (Array.isArray(m.inbox) && typeof Social !== 'undefined') m.inbox.slice(0, 50).forEach(x => Social.inbox(x));
    if (m.pres && typeof m.pres === 'object') this.fpres = m.pres;
  },

  send(m) { // friend request / acceptance
    if (this.role === 'dir') return this.fr(m);
    this.talk(m, r => { if (r.t === 'ok') this.cb && 0; }, res => { if (res === 'none') this.claim(ok => { if (ok) this.fr(m); }); });
  },

  sync() {
    if (this.busy || typeof Peer === 'undefined' || !Auth.me()) return;
    this.busy = true; this.last = Date.now(); this.sig = this.sigOf();
    const go = () => this.sync2();
    (Auth.isAdmin() && Mod.ok() ? Mod.rebuild().catch(() => null) : Promise.resolve()).then(go, go);
  },
  sync2() {
    const me = Auth.me();
    const end = st => { this.busy = false; this.status = st; this.draw(); };
    if (!me) { this.busy = false; return; }
    Mod.deducts();
    const friends = typeof Social !== 'undefined' ? Social.names() : [], mp = Mod.pack();
    if (mp) this.takeMod(mp);
    if (this.role === 'dir') {
      this.regOwn(); this.list = this.metas();
      const s = this.social(me.name, friends, this.pres);
      this.eat({ inbox: s.inbox, pres: s.pres, mod: this.mod });
      return end('You are hosting the lobby');
    }
    this.talk({ t: 'sync', games: this.mine(), me: me.name, friends, pres: this.pres, mod: mp }, (m, c, finish) => {
      this.eat(m);
      if (m.t === 'need') {
        const maps = [];
        (m.ids || []).slice(0, 10).forEach(id => { const d = this.mapOf(String(id)); if (d) maps.push({ id: String(id), data: d }); });
        c.send({ t: 'maps', maps });
      } else if (m.t === 'list') { this.list = this.cleanList(m.games).filter(g => !Mod.blocked(g.id)); finish('ok'); }
    }, r => {
      if (r === 'ok') return end('Online');
      this.claim(ok => end(ok ? 'You are hosting the lobby' : 'Lobby unreachable (check your internet)'));
    });
  },

  fetch(id, cb) {
    if (Mod.blocked(id)) return cb(null);
    if (this.role === 'dir') { const e = this.ent[id]; return cb(e && e.map ? e.map : null); }
    if (typeof Peer === 'undefined') return cb(null);
    let data = null;
    this.talk({ t: 'get', id }, (m, c, finish) => { if (m.t === 'map' && m.id === id) { data = m.data || null; finish('ok'); } }, () => cb(data));
  },

  /* ----- UI: "Online games" card ----- */
  start() {
    if (this.started) return; this.started = true;
    setInterval(() => {
      if (!Auth.me()) return;
      if (Date.now() - this.last > (Game.running ? 45000 : 60000) || (!Game.running && !this.last)) this.sync();
    }, 5000);
  },
  mount(el) {
    const d = document.createElement('div'); d.id = 'olist'; el.appendChild(d);
    this.draw();
    if (Date.now() - this.last > 20000 || this.sig !== this.sigOf()) this.sync();
  },
  draw() {
    const box = byId('olist'); if (!box) return;
    const own = new Set(DB.games().map(g => g.id));
    const l = this.list.filter(g => !own.has(g.id) && !Mod.blocked(g.id));
    box.innerHTML = `<div class="card"><h3>🌐 Online games</h3><div class="muted" style="margin-bottom:6px">${esc(this.status)}${this.busy ? ' ...' : ''}</div>` +
      (l.length ? l.map(g => `<div class="part"><span><b>${esc(g.name)}</b><br><span class="muted">by ${esc(g.author)} ${Auth.isVerified(g.owner) ? '<span class="vb">✔</span>' : ''} · Max ${g.max}</span></span>
        <span><button class="sm" onclick="Play.join('${g.id}')">▶ Play</button></span></div>`).join('')
        : '<div class="muted">No games from other players right now.</div>') +
      `<button class="gray" style="margin-top:8px" onclick="Lobby.last=0;Lobby.sync()">↻ Refresh</button></div>`;
    if (typeof Social !== 'undefined') Social.draw();
  }
};
