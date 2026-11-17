/* =====================================================
   PLAY: enters a game (own game, recent game, online game or join by code).
   Every entry builds the world fresh from saved data and frees it on exit.
   Multiplayer is peer-to-peer (see net.js). If the network is not
   reachable and this device has the map, the game runs offline.
   ===================================================== */
const Play = {
  busy: false,

  // my avatar as sent to other devices (kept small)
  payload(r) {
    return {
      colors: r.colors, items: r.items.map(i => ({ parts: i.parts })), face: r.face,
      pack: { anims: r.pack.anims, body: r.pack.body }
    };
  },

  // never trust map data that came from another device
  cleanMap(d) {
    d = d || {};
    const parts = (Array.isArray(d.parts) ? d.parts : []).slice(0, 3000).map(n => {
      n = n || {};
      const t = NODE_T.includes(n.type) ? n.type : 'part';
      const o = { id: String(n.id || '').slice(0, 24), type: t, name: String(n.name || 'Part').slice(0, 30), parent: n.parent ? String(n.parent).slice(0, 24) : null };
      if (t === 'part') {
        o.x = num(n.x, -5000, 5000, 0); o.y = num(n.y, -5000, 5000, 0); o.z = num(n.z, -5000, 5000, 0);
        o.w = num(n.w, 0.2, 2000, 1); o.h = num(n.h, 0.2, 2000, 1); o.d = num(n.d, 0.2, 2000, 1);
        o.color = hexOk(n.color, '#a3a2a5'); o.spawn = !!n.spawn; o.anch = n.anch !== false; o.col = n.col !== false;
      } else if (t === 'script' || t === 'localscript') {
        o.code = String(n.code || '').slice(0, 30000); o.off = !!n.off;
      } else if (t === 'btn' || t === 'lbl') {
        o.text = Filter.mask(String(n.text || '').slice(0, 60));
        o.gx = num(n.gx, 0, 100, 50); o.gy = num(n.gy, 0, 100, 50);
        o.gw = num(n.gw, 10, 800, 100); o.gh = num(n.gh, 10, 600, 40);
        o.color = hexOk(n.color, '#d94545'); o.tc = hexOk(n.tc, '#ffffff');
      }
      return o;
    });
    const sp = d.spawn && typeof d.spawn === 'object' ? { x: num(d.spawn.x, -5000, 5000, 0), y: num(d.spawn.y, -5000, 5000, 8), z: num(d.spawn.z, -5000, 5000, 0) } : null;
    const mt = d.meta && typeof d.meta === 'object' ? { name: String(d.meta.name || '').slice(0, 40), max: num(d.meta.max, 1, CONFIG.MAX_PLAYERS_LIMIT, 8), author: String(d.meta.author || '').slice(0, 20) } : null;
    return { parts, env: Env.clean(d.env), spawn: sp, meta: mt };
  },

  // my own published game
  open(id) {
    const g = DB.games().find(x => x.id === id);
    if (!g || g.listed === false) return toast('This game is not available');
    if (g.down) return toast('This game was taken down: ' + (g.downNote || 'policy violation'));
    const data = GameData.get(id);
    if (!data) return toast('Game data is missing');
    const me = Auth.me();
    // 1 account = 1 count, no matter how many times they re-join
    if (!(g.visitors || []).includes(me.key)) {
      const gs = DB.games(), x = gs.find(q => q.id === id);
      x.visitors = x.visitors || []; x.visitors.push(me.key); DB.set('games', gs);
    }
    this.go(g, data);
  },

  openRecent(id) {
    const r = DB.get('rc_' + id, null);
    if (!r) return toast('Not found');
    this.go(r.meta, r.data);
  },

  // a game from another player (online list or a code)
  join(code) {
    code = String(code).trim().toLowerCase();
    if (DB.games().some(g => g.id === code)) return this.open(code);
    const r = DB.get('rc_' + code, null);
    if (r) return this.go(r.meta, r.data);
    toast('Looking for the game...');
    Lobby.fetch(code, data => {
      const lm = Lobby.list.find(g => g.id === code);
      const meta = { id: code, name: lm ? lm.name : 'Game ' + code, maxPlayers: lm ? lm.max : 8, author: lm ? lm.author : '' };
      if (data) { const m = this.cleanMap(data); this.remember(code, meta, m); return this.go(meta, m); }
      this.go(meta, null);   // no map from the lobby: only works when a live server exists
    });
  },

  remember(id, meta, m) {
    const l = DB.get('recent', []).filter(x => x !== id);
    l.unshift(id);
    while (l.length > 15) DB.del('rc_' + l.pop());
    DB.set('recent', l);
    DB.set('rc_' + id, { meta, data: m });
  },

  // data = the world if this device has it, otherwise null (we must get it from a host)
  go(meta, data) {
    if (this.busy) return;
    this.busy = true;
    const me = Auth.me(), r = Wear.resolve(me.key);
    const map = data ? Object.assign({}, this.cleanMap(data), { meta: { name: meta.name, max: meta.maxPlayers || 8, author: meta.author || '' } }) : null;
    let fin = false, tm = null;

    const begin = (info, net) => {
      const m = this.cleanMap(info.map), mt = m.meta || {};
      const name = String(mt.name || meta.name || 'Game').slice(0, 40);
      const max = clamp(+mt.max || meta.maxPlayers || 8, 1, CONFIG.MAX_PLAYERS_LIMIT);
      if (!data) this.remember(meta.id, { id: meta.id, name, maxPlayers: max, author: mt.author || '' }, m);
      Game.start(m, r, {
        onExit: () => { render(); }, name: me.name, gname: name, max, test: false,
        net, id: info.id, players: info.players, dyn: info.dyn, watch: info.watch
      });
      if (net) { if (Game.running) Net.release(); else Net.leave(); }
    };

    tm = setTimeout(() => {
      if (fin) return;
      fin = true; this.busy = false;
      Net.leave();
      if (map) { toast('Multiplayer unavailable, playing offline'); begin({ host: true, id: 'h', map, players: [] }, false); }
      else toast('Could not connect. Check the code and your internet.');
    }, 25000);

    Net.enter({
      gid: meta.id, max: meta.maxPlayers || 8, name: me.name, av: this.payload(r), map,
      snapshot: () => Game.netSnapshot(), watch: () => Game.netWatch(),
      onMsg: (m, from) => Game.onNet(m, from),
      onJoin: p => Game.onJoin(p), onLeft: id => Game.onLeft(id), onClosed: () => Game.onClosed(),
      onKick: reason => Game.onKick(reason),
      done: (err, info) => {
        if (fin) return;
        fin = true; clearTimeout(tm); this.busy = false;
        if (err) { toast(err); return; }
        if (info.solo && info.reason) toast('Playing offline: ' + info.reason);
        begin(info, !info.solo);
      }
    });
  }
};

/* Add the "Online games" card under the Games tab without touching app.js */
(function () {
  const base = viewHome;
  viewHome = function (el, me) { base(el, me); Lobby.mount(el); };
  Lobby.start();
})();