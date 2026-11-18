/* =====================================================
   GAME EXTRAS: HUD, chat, GUI, script bridge, items, network
   ===================================================== */
const hexA = (h, a) => {
  h = hexOk(h, '#000000');
  return 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + a + ')';
};
const cleanD = d => { // data sent through remote events: JSON only, small
  try { const s = JSON.stringify(d === undefined ? null : d); return s.length <= 1000 ? JSON.parse(s) : null; } catch (e) { return null; }
};

Object.assign(Game, {

  /* ---------- HUD ---------- */
  srvCount() { byId('srv').textContent = '👥 ' + (1 + Object.keys(this.remote).length) + '/' + this.maxP; },
  updHp() {
    const v = Math.ceil(this.hp);
    if (v === this._hpShown) return;
    this._hpShown = v;
    const fr = clamp(this.hp / this.MAX_HP, 0, 1), f = byId('hpFill');
    f.style.width = (fr * 100) + '%';
    f.style.background = fr > 0.5 ? '#3ddc4f' : fr > 0.25 ? '#f2c230' : '#e04444';
    byId('hpTxt').textContent = v + '/' + this.MAX_HP;
    byId('hp').classList.toggle('low', fr <= 0.25 && !this.dead);
  },
  setHp(v) { if (this.dead) return; this.hp = clamp(v, 0, this.MAX_HP); if (this.hp <= 0) this.die(); this.updHp(); },
  die() {
    if (this.dead) return;
    this.dead = true; this.hp = 0; this.updHp();
    this.lay = false; this.seat = null;
    this.dropTool();
    Burst.start(this.av, this.s, this.vx, this.vz);
    this.av.g.visible = false; this.rmBubble(this.meB);
    this.respawnIn = 3; this.climbing = false;
    byId('deathCount').textContent = 'Respawning in 3...';
    byId('death').classList.remove('hidden');
    LocalHost.send({ t: 'ev', n: 'died' });
  },
  respawn() {
    Burst.clear(this.s);
    this.dead = false; this.hp = this.MAX_HP; this.grace = 1.2;
    this.reset(); this.av.g.visible = true;
    byId('death').classList.add('hidden');
    this.updHp();
    LocalHost.send({ t: 'ev', n: 'respawn' });
  },
  out(text, lvl, mode) {
    if (!this.test) return;
    const log = byId('outLog'), d = document.createElement('div');
    d.className = 'o' + (lvl || 0); d.textContent = (mode === 'local' ? '[Local] ' : '') + text;
    log.appendChild(d);
    while (log.children.length > 80) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  },
  notify(text, secs) {
    const el = byId('msg'); el.textContent = text; el.classList.remove('hidden');
    clearTimeout(this._mt); this._mt = setTimeout(() => el.classList.add('hidden'), secs * 1000);
  },
  showHotbar(v) { this.hotbarOn = !!v; byId('hotbar').style.display = v ? '' : 'none'; },

  /* ---------- animations: a script can force the standard pack for everyone ---------- */
  applyAnim() {
    this.av.setPack(this.animOK ? this.myPack : null);
    Object.values(this.remote).forEach(r => r.av.setPack(this.animOK ? r.pack : null));
  },

  /* ---------- StoreServer data (saved on the host device) ---------- */
  storeSet(k, v) {
    if (!k) return;
    try {
      const s = JSON.stringify(v === undefined ? null : v); if (s.length > 20000) return;
      if (!(k in this.store) && Object.keys(this.store).length >= 200) return;
      this.store[k] = JSON.parse(s); this.storeSave();
    } catch (e) {}
  },
  storeDel(k) { delete this.store[k]; this.storeSave(); },
  storeSave() {
    if (!this.gid || !this.isHost || this.test) return;
    clearTimeout(this._sv);
    this._sv = setTimeout(() => { DB.set('st_' + this.gid, this.store); }, 800);
  },

  /* ---------- StarterGui ---------- */
  guiStyle(g) {
    const el = g.el, s = el.style;
    el.textContent = g.text;
    s.left = g.gx + '%'; s.top = g.gy + '%'; s.width = g.gw + 'px'; s.height = g.gh + 'px';
    s.background = g.type === 'lbl' ? hexA(g.color, 0.5) : g.color;
    s.color = g.tc; s.display = g.visible ? 'flex' : 'none';
  },
  buildGui(nodes, m) {
    const box = byId('sgui'); box.innerHTML = ''; this.gui = {};
    nodes.filter(n => (n.type === 'btn' || n.type === 'lbl') && Tree.root(m, n) === 'SG').slice(0, 60).forEach(n => {
      const el = document.createElement(n.type === 'btn' ? 'button' : 'div');
      el.className = n.type === 'btn' ? 'gbtn' : 'glbl';
      const g = {
        id: n.id, name: n.name, type: n.type, el, text: String(n.text || '').slice(0, 60), visible: true,
        gx: num(n.gx, 0, 100, 50), gy: num(n.gy, 0, 100, 50), gw: num(n.gw, 10, 800, 100), gh: num(n.gh, 10, 600, 40),
        color: hexOk(n.color, '#d94545'), tc: hexOk(n.tc, '#ffffff')
      };
      if (n.type === 'btn') el.onclick = () => LocalHost.send({ t: 'gclick', id: n.id });
      this.guiStyle(g); box.appendChild(el); this.gui[n.id] = g;
    });
  },
  guiList() { return Object.values(this.gui).map(g => ({ id: g.id, name: g.name, text: g.text, visible: g.visible, color: g.color })); },
  guiSet(id, p) {
    const g = this.gui[id]; if (!g || !p) return;
    if (p.text !== undefined) g.text = Filter.mask(String(p.text).slice(0, 60));
    if (p.visible !== undefined) g.visible = !!p.visible;
    if (p.color !== undefined) g.color = hexOk(p.color, g.color);
    this.guiStyle(g);
  },

  /* ---------- remote events / functions (LocalScript <-> Script) ---------- */
  rok(n) { return !this.rwhite || this.rnames.has(n); },
  remoteOp(mode, m) {
    const n = String(m.n || '').slice(0, 30);
    if (mode === 'local') {
      if (m.op === 'rem') {
        if (!n || !this.rok(n)) return;
        const d = cleanD(m.d);
        if (this.isHost) ScriptHost.send({ t: 'rem', n, d, pid: this.myId }); else Net.send({ t: 'rem', n, d });
      } else if (m.op === 'rinv') {
        const c = num(m.c, 0, 1e9, 0);
        if (!n || !this.rok(n)) return LocalHost.send({ t: 'rres', c, v: null });
        const d = cleanD(m.d);
        if (this.isHost) ScriptHost.send({ t: 'rinv', n, d, pid: this.myId, c }); else Net.send({ t: 'rinv', n, d, c });
      }
    } else {
      if (m.op === 'remc') {
        if (!n || !this.rok(n)) return;
        const d = cleanD(m.d), to = String(m.to || '*');
        if (to === '*' || to === this.myId) LocalHost.send({ t: 'rem', n, d });
        if (this.net && Net.isHost) {
          if (to === '*') Net.send({ t: 'remc', n, d });
          else if (this.remote[to]) Net.sendTo(to, { t: 'remc', n, d });
        }
      } else if (m.op === 'rret') {
        const pid = String(m.pid || ''), v = cleanD(m.v), c = num(m.c, 0, 1e9, 0);
        if (pid === this.myId) LocalHost.send({ t: 'rres', c, v });
        else if (this.net && Net.isHost) Net.sendTo(pid, { t: 'rres', c, v });
      }
    }
  },

  /* ---------- chat ---------- */
  addMsg(name, text, sys) {
    const log = byId('chatLog'), d = document.createElement('div');
    d.className = 'cm' + (sys ? ' sys' : '');
    if (name) { const n = document.createElement('span'); n.className = 'n'; n.textContent = name + ': '; d.appendChild(n); }
    d.appendChild(document.createTextNode(text));
    log.appendChild(d);
    while (log.children.length > 50) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  },
  putBubble(o, text) {
    this.rmBubble(o);
    if (!o.av) return;
    o.bub = makeBubble(text); o.av.g.add(o.bub); o.bt = 5;
  },
  rmBubble(o) {
    if (!o || !o.bub) return;
    if (o.av) o.av.g.remove(o.bub);
    if (o.bub.material.map) o.bub.material.map.dispose();
    o.bub.material.dispose(); o.bub = null;
  },
  showChat(id, name, text) {
    this.addMsg(name, text);
    const who = id === this.myId ? this.meB : this.remote[id];
    if (who && !(id === this.myId && this.dead)) this.putBubble(who, text);
    LocalHost.send({ t: 'chat', name, text, pid: id });
    if (this.isHost) ScriptHost.send({ t: 'chat', name, text, pid: id });
  },
  sendChat() {
    const inp = byId('chatIn');
    let t = inp.value.trim().slice(0, 120);
    inp.value = '';
    if (!t) return;
    if (t[0] === '/') {
      const c = t.toLowerCase();
      if (c === '/reset') this.die();
      else if (c === '/help') this.addMsg('', 'Commands: /reset (die & respawn), /help', true);
      else this.addMsg('', 'Unknown command. Type /help', true);
      return;
    }
    t = Filter.mask(t);
    if (!this.net) return this.showChat(this.myId, this.pname, t);
    if (this.isHost) { this.showChat('h', this.pname, t); Net.send({ t: 'chat', id: 'h', name: this.pname, text: t }); }
    else Net.send({ t: 'chat', text: t });
  },
  scriptChat(mode, text) {
    this.addMsg('[Script]', text, true);
    if (mode === 'server' && this.net && this.isHost) Net.send({ t: 'chat', id: '', name: '[Script]', text, sys: 1 });
  },

  /* ---------- leaving ---------- */
  askLeave() { byId('leaveDlg').classList.toggle('hidden'); },
  leave() {
    const g = this.gname;
    if (this.net) Net.leave();
    this.stop();
    if (this.onExit) this.onExit();
    toast('You left ' + g);
  },
  onKick(reason) {
    if (!this.running) return;
    this.leave();
    uiAlert('You were removed from the game: ' + reason);
  },

  /* ---------- script bridge ---------- */
  playersState() {
    const p = this.p || { x: 0, y: 0, z: 0 }, f = n => +n.toFixed(1);
    const a = [{ id: this.myId, name: this.pname, x: f(p.x), y: f(p.y), z: f(p.z), face: +this.face.toFixed(2), health: Math.round(this.hp), maxHealth: this.MAX_HP, alive: !this.dead }];
    Object.values(this.remote).forEach(r => a.push({ id: r.id, name: r.name, x: f(r.x), y: f(r.y), z: f(r.z), face: +r.face.toFixed(2), health: r.hp, maxHealth: 200, alive: r.alive }));
    return a;
  },
  scriptAct(a, m) {
    if (a === 'kill') return this.die();
    if (this.dead) return;
    if (a === 'tp') { this.p.x = m.x; this.p.y = m.y; this.p.z = m.z; this.vx = this.vy = this.vz = 0; this.climbing = false; this.seat = null; }
    else if (a === 'hp') this.setHp(m.v);
    else if (a === 'dmg') this.setHp(this.hp - m.v);
    else if (a === 'heal') this.setHp(this.hp + m.v);
    else if (a === 'speed') this.SPEED = clamp(m.v, 4, 60);
    else if (a === 'jump') this.JUMP = clamp(m.v, 0, 120);
    else if (a === 'lay') { if (!this.seat) { this.lay = true; this.climbing = false; } }
    else if (a === 'stand') this.lay = false;
  },
  playerAct(mode, id, a, m) {
    if (!['tp', 'hp', 'dmg', 'heal', 'kill', 'speed', 'jump', 'lay', 'stand'].includes(a)) return;
    if (mode === 'local' && id !== this.myId) return;
    if (id === this.myId) return this.scriptAct(a, m);
    const r = this.remote[id];
    if (this.net && this.isHost && r) {
      if (a === 'tp') r.grace = performance.now() + 3000;
      Net.sendTo(id, { t: 'pl', a, m });
    }
  },
  applyOp(o, rep) {
    const id = o.id;
    switch (o.k) {
      case 'set': if (this.objs.has(id)) { this.updPart(id, o.p); if (!/^[sl]\d+$/.test(id)) this.touched.add(id); } break;
      case 'tween': {
        const ob = this.objs.get(id); if (!ob) break;
        this.tweens = this.tweens.filter(t => t.id !== id);
        this.tweens.push({ id, t: 0, s: o.s, a: { x: ob.p.x, y: ob.p.y, z: ob.p.z }, b: { x: o.x, y: o.y, z: o.z } });
        if (!/^[sl]\d+$/.test(id)) this.touched.add(id);
        break;
      }
      case 'del': if (this.objs.has(id)) this.delPart(id); break;
      case 'spawn':
        if (this.objs.has(id) || this.dyn >= this.MAX_DYN) return;
        this.dyn++;
        this.addPart(o.p, id, nameKind(o.p.name) || {});
        this.index(); this.unstick();
        break;
      case 'light': this.env = Env.clean(Object.assign({}, this.env, o.o)); Env.apply(this.s, this.sun, this.env); break;
      case 'notify': this.notify(o.t, o.s); break;
      case 'anim': this.animOK = !!o.v; this.applyAnim(); break;
      default: return;
    }
    if (rep && this.net && Net.isHost) Net.send({ t: 'op', o });
  },
  netWatchAdd(id) { if (this.net && Net.isHost) Net.send({ t: 'watch', id }); },
  netWatch() { return Object.keys(ScriptHost.watching); },
  netSnapshot() {
    const out = [];
    this.objs.forEach(o => {
      const dyn = /^[sl]\d+$/.test(o.id);
      if (dyn && o.id[0] === 'l') return;
      if (!dyn && !this.touched.has(o.id)) return;
      const p = o.p;
      out.push({ k: dyn ? 'spawn' : 'set', id: o.id, p: { name: p.name, x: p.x, y: p.y, z: p.z, w: p.w, h: p.h, d: p.d, color: p.color, visible: p.visible, collide: p.collide, anch: p.anch, shape: p.shape, rx: p.rx, ry: p.ry, rz: p.rz, t: p.t } });
    });
    out.push({ k: 'light', id: '', o: this.env });
    out.push({ k: 'anim', id: '', v: this.animOK });
    return out;
  },
  netOp(o) {
    if (!o || typeof o !== 'object') return;
    const id = String(o.id || ''), k = o.k;
    if (k === 'spawn') {
      if (!/^s\d{1,6}$/.test(id)) return;
      o = { k, id, p: Object.assign({ name: 'Part', x: 0, y: 5, z: 0, w: 4, h: 1, d: 2, color: '#a3a2a5', visible: true, collide: true, anch: true }, sanPart(o.p)) };
    } else if (k === 'set') { if (!this.objs.has(id)) return; o = { k, id, p: sanPart(o.p) }; }
    else if (k === 'tween') {
      if (!this.objs.has(id)) return;
      o = { k, id, s: num(o.s, 0.05, 60, 1), x: num(o.x, -5000, 5000, 0), y: num(o.y, -5000, 5000, 0), z: num(o.z, -5000, 5000, 0) };
    } else if (k === 'del') o = { k, id };
    else if (k === 'light') o = { k, o: Env.part(o.o) };
    else if (k === 'anim') o = { k, v: !!o.v };
    else if (k === 'notify') o = { k, t: Filter.mask(String(o.t || '').slice(0, 80)), s: num(o.s, 1, 10, 3) };
    else return;
    this.applyOp(o, false);
  },

  /* ---------- network ---------- */
  addRemote(pl) {
    if (!pl || pl.id === this.myId || this.remote[pl.id]) return;
    const av = Net.cleanAv(pl.av), a = makeAvatar(av.colors, av.items, this.animOK ? av.pack : null, av.face);
    a.g.rotation.order = 'YXZ';
    a.g.add(nameTag(String(pl.name || 'Player').slice(0, 20)));
    a.g.visible = false; this.s.add(a.g);
    this.remote[pl.id] = { id: pl.id, name: String(pl.name || 'Player').slice(0, 20), av: a, pack: av.pack, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0,
      face: 0, tf: 0, state: 'idle', seat: null, hp: 200, alive: true, sp: 0, seen: false, bub: null, bt: 0,
      lastT: 0, spd: 0, flags: 0, grace: performance.now() + 3000 };
    this.srvCount();
    this.addMsg('', this.remote[pl.id].name + ' joined the game.', true);
  },
  removeRemote(id) {
    const r = this.remote[id]; if (!r) return;
    this.rmBubble(r);
    this.s.remove(r.av.g);
    delete this.remote[id];
    this.srvCount();
    this.addMsg('', r.name + ' left the game.', true);
  },
  onJoin(pl) { if (this.running) this.addRemote(pl); },
  onLeft(id) { if (this.running) this.removeRemote(id); },
  onClosed() { if (!this.running) return; toast('The server was closed'); this.leave(); },

  kickPlayer(id, reason) {
    const r = this.remote[id]; if (!r) return;
    const l = DB.reports(); l.push({ id: uid(), name: r.name, game: this.gname, reason, time: Date.now() });
    DB.set('reports', l.slice(-100));
    Net.kick(id, reason);
    this.addMsg('', r.name + ' was removed: ' + reason, true);
  },

  onNet(m, from) {
    if (!this.running || !m || typeof m !== 'object') return;
    const host = Net.isHost;
    switch (m.t) {
      case 'st': {
        const id = host ? from : String(m.id || ''), r = this.remote[id];
        if (!r) break;
        const nx = num(m.x, -1e5, 1e5, r.tx), ny = num(m.y, -1e5, 1e5, r.ty), nz = num(m.z, -1e5, 1e5, r.tz);
        if (host && r.seen) {
          const now = performance.now(), dt = Math.max((now - r.lastT) / 1000, 0.02);
          r.spd = r.spd * 0.8 + (Math.hypot(nx - r.tx, nz - r.tz) / dt) * 0.2;
          if (now > r.grace && r.spd > 110) r.flags += dt; else r.flags = Math.max(0, r.flags - dt);
          r.lastT = now;
          if (r.flags > 2.5) { this.kickPlayer(id, 'Exploiting (impossible speed)'); break; }
        } else r.lastT = performance.now();
        r.tx = nx; r.ty = ny; r.tz = nz;
        r.tf = num(m.f, -10, 10, r.tf);
        r.state = ANIM_STATES.includes(m.s) ? m.s : 'idle';
        r.seat = m.q ? String(m.q).slice(0, 12) : null;
        r.hp = num(m.hp, 0, 1000, 200); r.alive = m.al !== false;
        if (!r.seen) { r.seen = true; r.x = r.tx; r.y = r.ty; r.z = r.tz; r.face = r.tf; }
        if (host) Net.relay({ t: 'st', id, x: r.tx, y: r.ty, z: r.tz, f: r.tf, s: r.state, q: r.seat, hp: r.hp, al: r.alive }, from);
        break;
      }
      case 'chat': {
        if (host) {
          const r = this.remote[from]; if (!r) break;
          const text = Filter.mask(String(m.text || '').slice(0, 120));
          this.showChat(from, r.name, text);
          Net.send({ t: 'chat', id: from, name: r.name, text });
        } else {
          const text = Filter.mask(String(m.text || '').slice(0, 120)), name = String(m.name || '').slice(0, 20);
          if (m.sys) this.addMsg(name, text, true); else this.showChat(String(m.id || ''), name, text);
        }
        break;
      }
      case 'op': if (!host) this.netOp(m.o); break;
      case 'pl': {
        if (host || !['tp', 'hp', 'dmg', 'heal', 'kill', 'speed', 'jump', 'lay', 'stand'].includes(m.a)) break;
        const q = m.m || {};
        this.scriptAct(m.a, { x: num(q.x, -5000, 5000, 0), y: num(q.y, -5000, 5000, 0), z: num(q.z, -5000, 5000, 0), v: num(q.v, 0, 100000, 0) });
        break;
      }
      case 'rem': { const n = String(m.n || '').slice(0, 30); if (host && this.remote[from] && this.rok(n)) ScriptHost.send({ t: 'rem', n, d: cleanD(m.d), pid: from }); break; }
      case 'rinv': {
        const n = String(m.n || '').slice(0, 30), c = num(m.c, 0, 1e9, 0);
        if (!host || !this.remote[from]) break;
        if (!this.rok(n)) { Net.sendTo(from, { t: 'rres', c, v: null }); break; }
        ScriptHost.send({ t: 'rinv', n, d: cleanD(m.d), pid: from, c });
        break;
      }
      case 'rres': if (!host) LocalHost.send({ t: 'rres', c: num(m.c, 0, 1e9, 0), v: cleanD(m.v) }); break;
      case 'remc': { const n = String(m.n || '').slice(0, 30); if (!host && this.rok(n)) LocalHost.send({ t: 'rem', n, d: cleanD(m.d) }); break; }
      case 'watch': if (!host) this.srvWatch.add(String(m.id || '').slice(0, 12)); break;
      case 'touch': if (host && this.remote[from]) ScriptHost.send({ t: 'touch', id: String(m.id || '').slice(0, 12), pid: from }); break;
      case 'act': if (host && this.remote[from]) ScriptHost.send({ t: 'act', item: String(m.item || '').slice(0, 30), pid: from }); break;
      case 'joined': if (!host && m.p) this.addRemote(m.p); break;
      case 'left': if (!host) this.removeRemote(String(m.id || '')); break;
      default: break;
    }
  },

  netStep(dt) {
    if (!this.net) return;
    this.netT -= dt;
    if (this.netT <= 0) {
      this.netT = 0.08;
      const p = this.p, f = n => +n.toFixed(2);
      const msg = { t: 'st', x: f(p.x), y: f(p.y), z: f(p.z), f: f(this.face), s: this.lay && !this.seat ? 'lay' : this.lastState,
        q: this.seat ? this.seat.id : null, hp: Math.round(this.hp), al: !this.dead };
      if (Net.isHost) msg.id = 'h';
      Net.send(msg);
    }
    Object.values(this.remote).forEach(r => {
      if (!r.seen) return;
      const k = 1 - Math.exp(-dt * 14), ox = r.x, oz = r.z;
      r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; r.z += (r.tz - r.z) * k;
      let a = r.tf - r.face; a = Math.atan2(Math.sin(a), Math.cos(a)); r.face += a * Math.min(1, dt * 12);
      r.sp += (clamp(Math.hypot(r.x - ox, r.z - oz) / Math.max(dt, 0.001) / 16, 0, 1.3) - r.sp) * 0.2;
      const lay = r.state === 'lay';
      r.av.g.visible = r.alive;
      r.av.g.position.set(r.x, r.y + (lay ? 0.5 : 0), r.z);
      r.av.g.rotation.set(lay ? -Math.PI / 2 : 0, r.face, 0);
      r.av.anim(this.time, r.state, dt, r.sp);
      if (r.bub) { r.bt -= dt; if (r.bt <= 0) this.rmBubble(r); }
    });
    if (!Net.isHost && !this.dead) {
      this.srvWatch.forEach(id => {
        const o = this.objs.get(id); if (!o) return;
        const hit = this.overlaps(o.box);
        if (hit && !this.touchSt[id]) Net.send({ t: 'touch', id });
        this.touchSt[id] = hit;
      });
    }
  },

  /* ---------- items (tools from the StarterPack). Tap the screen to use. ---------- */
  buildHotbar() {
    const hb = byId('hotbar'); hb.innerHTML = ''; hb.style.display = '';
    this.tools.forEach((t, i) => {
      const b = document.createElement('button');
      b.textContent = (i + 1) + ' ' + t.name.slice(0, 10);
      b.onclick = () => this.toggleTool(i);
      hb.appendChild(b);
    });
  },
  heldModel(t) {
    const g = new THREE.Group(), ps = t.parts;
    if (!ps.length) return g;
    const b = Tree.bbox(ps, ps.map(p => p.id));
    if (!b) return g;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, cz = (b.z0 + b.z1) / 2;
    const sc = Math.min(1, 4 / Math.max(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0, 0.1));
    ps.forEach(p => {
      const m = new THREE.Mesh(partGeo(Object.assign({}, p, { w: p.w * sc, h: p.h * sc, d: p.d * sc }), ''), Mats.flat(p.color || '#a3a2a5'));
      m.position.set((p.x - cx) * sc, (p.y - cy) * sc, (p.z - cz) * sc);
      m.rotation.order = 'YXZ'; m.rotation.set((p.rx || 0) * D2, (p.ry || 0) * D2, (p.rz || 0) * D2);
      m.castShadow = true;
      g.add(m);
    });
    return g;
  },
  dropTool() {
    if (this.tool < 0) return;
    LocalHost.send({ t: 'un', item: this.tools[this.tool].name });
    this.tool = -1;
    if (this.av) this.av.setHold(null);
    [...byId('hotbar').children].forEach(b => b.classList.remove('on'));
  },
  toggleTool(i) {
    if (this.dead) return;
    const old = this.tool;
    if (old >= 0) this.dropTool();
    if (i >= 0 && i !== old && this.tools[i]) {
      this.tool = i;
      this.av.setHold(this.heldModel(this.tools[i]));
      LocalHost.send({ t: 'eq', item: this.tools[i].name });
      [...byId('hotbar').children].forEach((b, j) => b.classList.toggle('on', j === i));
    }
  },
  useItem() {
    if (this.tool < 0 || this.dead || this.useCd > 0) return;
    this.useCd = 0.25;
    const name = this.tools[this.tool].name;
    LocalHost.send({ t: 'act', item: name, pid: this.myId });
    if (this.isHost) ScriptHost.send({ t: 'act', item: name, pid: this.myId });
    else Net.send({ t: 'act', item: name });
  },

  /* ---------- input ---------- */
  bind() {
    const map = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' };
    this.kd = e => {
      const tg = e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { this.askLeave(); return; }
      if (/^[1-8]$/.test(k)) { if (this.tools[+k - 1]) this.toggleTool(+k - 1); return; }
      if (k === 'e') { this.useItem(); return; }
      if (k === 'enter' || k === '/') {
        e.preventDefault();
        byId('chatBox').classList.remove('hidden');
        byId('chatIn').focus();
        if (k === '/') byId('chatIn').value = '/';
        return;
      }
      if (map[k] || k === ' ') e.preventDefault();
      this.keys[map[k] || k] = true;
    };
    this.ku = e => { const k = e.key.toLowerCase(); this.keys[map[k] || k] = false; };
    addEventListener('keydown', this.kd);
    addEventListener('keyup', this.ku);

    this.btnH = [];
    document.querySelectorAll('#gameUI [data-k]').forEach(b => {
      const k = b.dataset.k;
      const on = e => { e.preventDefault(); this.keys[k] = true; };
      const off = e => { e.preventDefault(); this.keys[k] = false; };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
      this.btnH.push([b, on, off]);
    });

    const joy = byId('joy'), knob = byId('knob'), R = 40;
    let jid = null;
    const upd = e => {
      const b = joy.getBoundingClientRect();
      let dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      this.joy = { x: dx / R, y: dy / R };
    };
    this.jd = e => { e.preventDefault(); jid = e.pointerId; try { joy.setPointerCapture(jid); } catch (_) {} upd(e); };
    this.jm = e => { if (e.pointerId === jid) upd(e); };
    this.ju = e => { if (e.pointerId !== jid) return; jid = null; knob.style.transform = 'translate(0,0)'; this.joy = { x: 0, y: 0 }; };
    joy.addEventListener('pointerdown', this.jd);
    joy.addEventListener('pointermove', this.jm);
    joy.addEventListener('pointerup', this.ju);
    joy.addEventListener('pointercancel', this.ju);

    const cv = byId('gameCanvas');
    let cid = null, lx = 0, ly = 0;
    this.pd = e => { if (cid !== null) return; cid = e.pointerId; lx = e.clientX; ly = e.clientY; this.tapS = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    this.pm = e => {
      if (e.pointerId !== cid) return;
      this.yaw -= (e.clientX - lx) * 0.006;
      this.pitch = clamp(this.pitch + (e.clientY - ly) * 0.006, -0.2, 1.3);
      lx = e.clientX; ly = e.clientY;
    };
    this.pu = e => {
      if (e.pointerId !== cid) return;
      cid = null;
      const s = this.tapS; this.tapS = null;
      if (s && e.type === 'pointerup' && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 10 && performance.now() - s.t < 350) this.useItem();
    };
    this.wh = e => { this.dist = clamp(this.dist * (e.deltaY > 0 ? 1.1 : 0.9), 6, 60); };
    cv.addEventListener('pointerdown', this.pd);
    cv.addEventListener('pointermove', this.pm);
    cv.addEventListener('wheel', this.wh);
    addEventListener('pointerup', this.pu);
    addEventListener('pointercancel', this.pu);

    byId('zIn').onclick = () => { this.dist = clamp(this.dist * 0.85, 6, 60); };
    byId('zOut').onclick = () => { this.dist = clamp(this.dist * 1.15, 6, 60); };
    byId('exitBtn').onclick = () => this.askLeave();
    byId('leaveNo').onclick = () => byId('leaveDlg').classList.add('hidden');
    byId('leaveYes').onclick = () => this.leave();
    byId('respawnBtn').onclick = () => { if (this.dead) this.respawn(); };
    byId('chatBtn').onclick = () => byId('chatBox').classList.toggle('hidden');
    byId('outBtn').onclick = () => byId('outBox').classList.toggle('hidden');
    byId('chatSend').onclick = () => this.sendChat();
    byId('chatIn').onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.sendChat(); }
    };
  }
});
