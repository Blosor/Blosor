/* =====================================================
   SCRIPTS
   - Script       : runs on the SERVER (the host device). Changes are sent to every player.
   - LocalScript  : runs on EACH player's own device. Only affects that player.
                    LocalScripts inside StarterGui / Items talk to the server with remote.fire().
   Both run inside a Web Worker: no localStorage (wallet/accounts), no DOM, no page
   variables, no network. The only way out is a whitelist of validated messages.
   ===================================================== */

function sanPart(p) {
  const o = {};
  if (!p || typeof p !== 'object') return o;
  ['x', 'y', 'z'].forEach(k => { if (p[k] !== undefined) o[k] = num(p[k], -5000, 5000, 0); });
  ['w', 'h', 'd'].forEach(k => { if (p[k] !== undefined) o[k] = num(p[k], 0.2, 2000, 1); });
  if (typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color)) o.color = p.color;
  if (typeof p.name === 'string') o.name = Filter.mask(p.name.slice(0, 30)) || 'Part';
  if (p.visible !== undefined) o.visible = !!p.visible;
  if (p.collide !== undefined) o.collide = !!p.collide;
  if (p.anch !== undefined) o.anch = !!p.anch;
  if (p.canCollide !== undefined) o.collide = !!p.canCollide;
  if (p.anchored !== undefined) o.anch = !!p.anchored;
  return o;
}

// This function runs INSIDE the worker. It must not use anything outside itself.
function scriptWorkerMain() {
  const _post = self.postMessage.bind(self);
  const send = m => { try { _post(m); } catch (e) {} };
  const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
  const fin = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const fmt = a => a.map(v => {
    if (typeof v === 'string') return v;
    if (v === undefined) return 'undefined';
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }).join(' ').slice(0, 300);

  let MODE = 'local', ME = '', T = 0, seq = 0, ready = false;
  const PL = {}, parts = {}, touch = {}, HC = {}, itemEv = {}, GU = {}, clk = {}, rem = {};
  const ev = { tick: [], chat: [], join: [], leave: [], died: [], respawn: [] };

  const print = (...a) => send({ op: 'out', l: 0, t: fmt(a) });
  const warn = (...a) => send({ op: 'out', l: 1, t: fmt(a) });
  const error = (...a) => send({ op: 'out', l: 2, t: fmt(a) });
  const wait = s => new Promise(r => setTimeout(r, Math.max(0, fin(s, 0)) * 1000));
  const chat = t => send({ op: 'chat', t: String(t) });
  const notify = (t, s) => send({ op: 'notify', t: String(t), s: fin(s, 3) });
  const call = (f, ...a) => {
    try { const r = f(...a); if (r && r.catch) r.catch(e => error('Error: ' + (e && e.message || e))); }
    catch (e) { error('Error: ' + (e && e.message || e)); }
  };

  const handle = id => HC[id] || (HC[id] = (() => {
    const g = () => PL[id] || {};
    const act = (a, o) => send(Object.assign({ op: 'pl', n: id, a }, o));
    return {
      get id() { return id; }, get name() { return g().name || ''; },
      get x() { return g().x || 0; }, get y() { return g().y || 0; }, get z() { return g().z || 0; },
      get face() { return g().face || 0; },
      get health() { return g().health || 0; }, get maxHealth() { return g().maxHealth || 200; },
      get alive() { return g().alive !== false; },
      teleport: (x, y, z) => act('tp', { x: fin(x, 0), y: fin(y, 0), z: fin(z, 0) }),
      setHealth: v => act('hp', { v: fin(v, 0) }), damage: v => act('dmg', { v: fin(v, 0) }),
      heal: v => act('heal', { v: fin(v, 0) }), kill: () => act('kill', {}),
      setSpeed: v => act('speed', { v: fin(v, 16) }), setJumpPower: v => act('jump', { v: fin(v, 38) }),
      lay: () => act('lay', {}), stand: () => act('stand', {})
    };
  })());

  const FIELDS = ['x', 'y', 'z', 'w', 'h', 'd', 'color', 'name', 'visible', 'canCollide', 'anchored'];
  const mk = d => {
    const o = { id: d.id, name: d.name, x: d.x, y: d.y, z: d.z, w: d.w, h: d.h, d: d.d, color: d.color, visible: true,
      canCollide: d.canCollide !== false, anchored: d.anchored !== false };
    o.set = q => {
      const p = {};
      FIELDS.forEach(k => { if (q && q[k] !== undefined) { p[k] = q[k]; o[k] = q[k]; } });
      send({ op: 'set', id: o.id, p }); return o;
    };
    o.moveTo = (x, y, z, s) => { o.x = x; o.y = y; o.z = z; send({ op: 'tween', id: o.id, x, y, z, s: fin(s, 1) }); return o; };
    o.destroy = () => { send({ op: 'del', id: o.id }); delete parts[o.id]; };
    o.onTouch = fn => { if (typeof fn === 'function') { touch[o.id] = fn; send({ op: 'watch', id: o.id }); } };
    return o;
  };

  const workspace = {
    find: nm => Object.values(parts).find(p => p.name === nm) || null,
    findAll: nm => Object.values(parts).filter(p => p.name === nm),
    spawn: o => {
      o = o || {};
      const d = {
        id: (MODE === 'server' ? 's' : 'l') + (++seq), name: String(o.name || 'Part'),
        x: fin(o.x, 0), y: fin(o.y, 5), z: fin(o.z, 0), w: fin(o.w, 4), h: fin(o.h, 1), d: fin(o.d, 2),
        color: String(o.color || '#a3a2a5'), anchored: o.anchored !== false, canCollide: o.canCollide !== false
      };
      const h = mk(d); parts[d.id] = h; send({ op: 'spawn', d }); return h;
    }
  };

  const players = {
    list: () => Object.keys(PL).map(handle),
    find: nm => { const k = Object.keys(PL).find(i => PL[i].name === nm); return k ? handle(k) : null; },
    get count() { return Object.keys(PL).length; },
    // players in front of `h` (range in studs, angle = half cone in degrees)
    near: (h, r, a) => {
      const me = PL[h && h.id]; if (!me) return [];
      r = fin(r, 8);
      const cs = Math.cos(fin(a, 60) * Math.PI / 180), fx = Math.sin(me.face || 0), fz = Math.cos(me.face || 0);
      return Object.keys(PL).filter(i => {
        if (i === h.id) return false;
        const q = PL[i]; if (q.alive === false) return false;
        const dx = q.x - me.x, dz = q.z - me.z, d = Math.hypot(dx, dz);
        if (d > r || Math.abs(q.y - me.y) > 6) return false;
        return d < 0.01 || (dx * fx + dz * fz) / d >= cs;
      }).map(handle);
    },
    onJoin: f => { if (typeof f === 'function') ev.join.push(f); },
    onLeave: f => { if (typeof f === 'function') ev.leave.push(f); }
  };
  const game = {
    get time() { return T; },
    onTick: f => { if (typeof f === 'function') ev.tick.push(f); },
    onChat: f => { if (typeof f === 'function') ev.chat.push(f); },
    setLighting: o => send({ op: 'light', o: o || {} })
  };

  // StarterGui elements (LocalScript only)
  const guiH = d => {
    const o = { id: d.id, name: d.name, text: d.text, visible: d.visible !== false, color: d.color };
    o.set = q => {
      const p = {};
      ['text', 'visible', 'color'].forEach(k => { if (q && q[k] !== undefined) { p[k] = q[k]; o[k] = q[k]; } });
      send({ op: 'gui', id: o.id, p }); return o;
    };
    o.onClick = f => { if (typeof f === 'function') (clk[o.id] = clk[o.id] || []).push(f); };
    return o;
  };
  const gui = { find: nm => Object.values(GU).find(g => g.name === nm) || null, list: () => Object.values(GU) };

  // talk between LocalScripts (client) and Scripts (server)
  const remote = {
    on: (n, f) => { if (typeof f === 'function') (rem[String(n)] = rem[String(n)] || []).push(f); },
    fire: (n, d) => { if (MODE === 'local') send({ op: 'rem', n: String(n), d }); },
    fireClient: (p, n, d) => { if (MODE === 'server') send({ op: 'remc', n: String(n), d, to: String(p && p.id !== undefined ? p.id : p) }); },
    fireAll: (n, d) => { if (MODE === 'server') send({ op: 'remc', n: String(n), d, to: '*' }); }
  };

  const itemObj = name => {
    const r = k => f => { if (typeof f === 'function') ((itemEv[name] = itemEv[name] || { act: [], eq: [], un: [] })[k]).push(f); };
    return { name, onActivate: r('act'), onEquip: r('eq'), onUnequip: r('un') };
  };

  const run = (list, player) => list.forEach(s => {
    try {
      const f = new AsyncFn('workspace', 'player', 'players', 'game', 'item', 'gui', 'remote', 'print', 'warn', 'error', 'wait', 'chat', 'notify',
        'self', 'globalThis', 'window', '"use strict";\n' + s.code);
      f(workspace, player, players, game, s.item ? itemObj(s.item) : undefined, gui, remote, print, warn, error, wait, chat, notify,
        undefined, undefined, undefined)
        .catch(e => error('[' + s.name + '] ' + (e && e.message || e)));
    } catch (e) { error('[' + s.name + '] ' + (e && e.message || e)); }
  });

  self.onmessage = e => {
    const m = e.data || {};
    if (m.t === 'init') {
      MODE = m.mode === 'server' ? 'server' : 'local'; ME = String(m.me || '');
      (m.players || []).forEach(p => { PL[p.id] = p; });
      (m.parts || []).forEach(d => { parts[d.id] = mk(d); });
      (m.gui || []).forEach(d => { GU[d.id] = guiH(d); });
      run(m.scripts || [], MODE === 'local' ? handle(ME) : undefined);
      ready = true;
    } else if (m.t === 'tick') {
      T = fin(m.time, 0);
      const seen = {};
      (m.pl || []).forEach(p => {
        seen[p.id] = 1;
        if (!PL[p.id]) { PL[p.id] = p; if (ready) ev.join.forEach(f => call(f, handle(p.id))); }
        else Object.assign(PL[p.id], p);
      });
      Object.keys(PL).forEach(id => {
        if (seen[id]) return;
        ev.leave.forEach(f => call(f, handle(id)));
        delete PL[id]; delete HC[id];
      });
      ev.tick.forEach(f => call(f));
    } else if (m.t === 'touch') { const f = touch[m.id]; if (f) call(f, handle(String(m.pid || ME))); }
    else if (m.t === 'ev') (ev[m.n] || []).forEach(f => call(f));
    else if (m.t === 'chat') ev.chat.forEach(f => call(f, MODE === 'server' ? handle(String(m.pid)) : String(m.name), String(m.text)));
    else if (m.t === 'act') ((itemEv[m.item] || {}).act || []).forEach(f => call(f, MODE === 'server' ? handle(String(m.pid)) : undefined));
    else if (m.t === 'eq') ((itemEv[m.item] || {}).eq || []).forEach(f => call(f));
    else if (m.t === 'un') ((itemEv[m.item] || {}).un || []).forEach(f => call(f));
    else if (m.t === 'gclick') (clk[m.id] || []).forEach(f => call(f));
    else if (m.t === 'rem') (rem[String(m.n)] || []).forEach(f => MODE === 'server' ? call(f, handle(String(m.pid)), m.d) : call(f, m.d));
  };

  // lock down the worker: no network, no nested workers, no storage, no way to forge messages
  setInterval(() => send({ op: 'hb' }), 500);
  const BAN = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'Worker',
    'SharedWorker', 'BroadcastChannel', 'WebTransport', 'MessageChannel', 'postMessage', 'close', 'navigator',
    'localStorage', 'sessionStorage'];
  let o = self;
  while (o && o !== Object.prototype) {
    BAN.forEach(k => { try { Object.defineProperty(o, k, { value: undefined, configurable: false, writable: false }); } catch (e) {} });
    o = Object.getPrototypeOf(o);
  }
  send({ op: 'ready' });
}

/* ----- host side (main thread). One instance per mode. ----- */
function makeHost(mode) {
  const srv = mode === 'server', pre = srv ? 's' : 'l';
  return {
    mode, w: null, lastMsg: 0, ops: 0, opsT: 0, tickT: 0, watching: {},

    supported() { return typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && window.URL && URL.createObjectURL; },

    start(G, scripts, snapshot) {
      this.stop();
      if (!scripts.length) return;
      if (!this.supported()) return G.out('Scripts are not supported on this device.', 2, mode);
      let url;
      try {
        url = URL.createObjectURL(new Blob(['(' + scriptWorkerMain.toString() + ')()'], { type: 'text/javascript' }));
        this.w = new Worker(url);
      } catch (e) { this.w = null; return G.out('Could not start the script engine.', 2, mode); }
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      this.lastMsg = performance.now(); this.ops = 0; this.opsT = this.lastMsg; this.tickT = 0; this.watching = {};
      const w = this.w;
      w.onmessage = e => { if (this.w === w) this.msg(G, e.data); };
      w.onerror = e => { if (e.preventDefault) e.preventDefault(); G.out('Script error: ' + String(e.message || 'unknown').slice(0, 200), 2, mode); };
      w.postMessage({ t: 'init', mode, me: G.myId, scripts, parts: snapshot, players: G.playersState(), gui: srv ? [] : G.guiList() });
      G.out((srv ? 'Scripts' : 'LocalScripts') + ' started (' + scripts.length + ').', 0, mode);
    },
    stop() { if (this.w) { try { this.w.terminate(); } catch (e) {} } this.w = null; this.watching = {}; },
    kill(G, text) { G.out(text, 2, mode); this.stop(); },
    send(m) { if (this.w) this.w.postMessage(m); },

    msg(G, m) {
      if (!m || typeof m !== 'object') return;
      const now = performance.now();
      this.lastMsg = now;
      if (now - this.opsT > 1000) { this.opsT = now; this.ops = 0; }
      if (++this.ops > 4000) return this.kill(G, 'Script stopped: too many operations per second.');
      const id = String(m.id || ''), rep = srv;
      const mine = G.objs.has(id) && !(srv && id[0] === 'l');
      switch (m.op) {
        case 'out': G.out(String(m.t || '').slice(0, 300), num(m.l, 0, 2, 0), mode); break;
        case 'set': if (mine) G.applyOp({ k: 'set', id, p: sanPart(m.p) }, rep); break;
        case 'tween':
          if (mine) {
            const o = G.objs.get(id).p;
            G.applyOp({ k: 'tween', id, s: num(m.s, 0.05, 60, 1), x: num(m.x, -5000, 5000, o.x), y: num(m.y, -5000, 5000, o.y), z: num(m.z, -5000, 5000, o.z) }, rep);
          }
          break;
        case 'del': if (mine) G.applyOp({ k: 'del', id }, rep); break;
        case 'spawn': {
          const d = m.d || {}, sid = String(d.id || '');
          if (!new RegExp('^' + pre + '\\d{1,6}$').test(sid) || G.objs.has(sid)) break;
          const n = Object.assign({ name: 'Part', x: 0, y: 5, z: 0, w: 4, h: 1, d: 2, color: '#a3a2a5', visible: true, collide: true, anch: true }, sanPart(d));
          G.applyOp({ k: 'spawn', id: sid, p: n }, rep);
          break;
        }
        case 'watch': if (G.objs.has(id)) { this.watching[id] = false; if (srv) G.netWatchAdd(id); } break;
        case 'pl': G.playerAct(mode, String(m.n || ''), String(m.a || ''), { x: num(m.x, -5000, 5000, 0), y: num(m.y, -5000, 5000, 0), z: num(m.z, -5000, 5000, 0), v: num(m.v, 0, 100000, 0) }); break;
        case 'chat': G.scriptChat(mode, Filter.mask(String(m.t || '').slice(0, 120))); break;
        case 'notify': G.applyOp({ k: 'notify', t: Filter.mask(String(m.t || '').slice(0, 80)), s: num(m.s, 1, 10, 3) }, rep); break;
        case 'light': G.applyOp({ k: 'light', o: Env.part(m.o) }, rep); break;
        case 'gui': {
          if (srv) break;
          const q = m.p || {};
          G.guiSet(id, { text: typeof q.text === 'string' ? q.text : undefined, visible: q.visible === undefined ? undefined : !!q.visible, color: typeof q.color === 'string' ? q.color : undefined });
          break;
        }
        case 'rem': case 'remc': G.remoteOp(mode, m); break;
        default: break;
      }
    },

    tick(G, dt) {
      if (!this.w) return;
      if (performance.now() - this.lastMsg > 6000) return this.kill(G, 'Script stopped: it took too long (infinite loop?).');
      for (const id in this.watching) {
        const o = G.objs.get(id);
        if (!o) { delete this.watching[id]; continue; }
        const hit = G.overlaps(o.box);
        if (hit && !this.watching[id]) this.w.postMessage({ t: 'touch', id, pid: G.myId });
        this.watching[id] = hit;
      }
      this.tickT -= dt;
      if (this.tickT <= 0) { this.tickT = 0.1; this.w.postMessage({ t: 'tick', pl: G.playersState(), time: +G.time.toFixed(2) }); }
    }
  };
}
const ScriptHost = makeHost('server');
const LocalHost = makeHost('local');