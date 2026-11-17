/* =====================================================
   GAME ENGINE 3D (play mode): world, physics, main loop.
   HUD / chat / scripts bridge / network / items are in gx.js.
   The world is rebuilt from the saved data on every entry and freed on exit.
   ===================================================== */
const Game = {
  running: false, keys: {}, joy: { x: 0, y: 0 }, yaw: 0, pitch: 0.35, dist: 16, rid: 0,
  W: 0.9, H: 5.2, GRAV: 100, SPEED: 16, JUMP: 38, CLIMB: 12,
  ACC: 160, DEC: 200,
  AIR_ACC: 110, AIR_DEC: 40,
  MAX_HP: 200, REGEN: 2, MAX_DYN: 300,
  vx: 0, vz: 0, vy: 0, hp: 200, dead: false, face: 0, tFace: 0, grace: 0, noClimb: 0, time: 0,
  climbing: false, ladC: null, stand: null, seat: null, seatCd: 0, lay: false, netT: 0, lastState: 'idle',
  respawnIn: 0, _hpShown: -1, test: false, net: false, myId: 'h', isHost: true, maxP: 1,
  remote: {}, touched: new Set(), srvWatch: new Set(), touchSt: {}, tools: [], tool: -1, useCd: 0,
  meB: { av: null, bub: null, bt: 0 }, dynList: [], seats: [], gui: {}, tapS: null,
  p: null, s: null, cam: null,

  ensure() {
    Gfx.init();
    if (!this.cam) this.cam = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
  },
  resize() {
    if (!this.cam || !Gfx.r) return;
    const sz = Gfx.size(byId('gameCanvas'));
    this.cam.aspect = sz[0] / sz[1];
    this.cam.updateProjectionMatrix();
  },

  start(map, avatar, o) {
    o = o || {};
    try { this._start(map, avatar, o); }
    catch (e) {
      console.error(e);
      if (window.dbgShow) window.dbgShow('Game.start: ' + (e && (e.stack || e.message) || e));
      Net.leave();
      this.stop();
      if (o.onExit) o.onExit();
      uiAlert('Could not start the game: ' + (e && e.message || e));
    }
  },

  _start(map, avatar, o) {
    this.stop();
    this.onExit = o.onExit; this.pname = o.name || 'Player'; this.gname = o.gname || 'game'; this.test = !!o.test;
    this.net = !!o.net; this.myId = o.id || 'h'; this.isHost = !this.net || Net.isHost; this.maxP = o.max || 1;
    this.SPEED = 16; this.JUMP = 38; this.touched = new Set(); this.srvWatch = new Set(); this.touchSt = {};
    this.remote = {}; this.netT = 0; this.seat = null; this.seatCd = 0; this.lay = false; this.tool = -1; this.useCd = 0;
    byId('gameUI').classList.remove('hidden');
    byId('outBtn').classList.toggle('hidden', !this.test);
    byId('outBox').classList.add('hidden'); byId('outLog').innerHTML = '';
    this.ensure(); Gfx.mount(byId('gameCanvas')); this.resize();

    const s = this.s = new THREE.Scene();
    this.sun = addLights(s);
    this.env = Env.clean(map.env);
    Env.apply(s, this.sun, this.env);

    const nodes = Tree.norm(map.parts), m = Tree.map(nodes);
    this.objs = new Map(); this.tweens = []; this.dyn = 0; this.time = 0;
    let low = 0, has = false;
    const ws = nodes.filter(n => n.type === 'part' && Tree.root(m, n) === 'WS');
    ws.forEach(n => {
      this.addPart(n, n.id, Tree.info(m, n));
      low = has ? Math.min(low, n.y - n.h / 2) : n.y - n.h / 2; has = true;
    });
    this.index();
    this.voidY = Math.min(-60, (has ? low : 0) - 60);
    this.spawn = spawnOf(ws) || map.spawn || { x: 0, y: 8, z: 0 };

    // tools from StarterPack (models named Item-xxx)
    this.tools = Tree.tools(nodes).slice(0, 8).map(t => {
      const sub = Tree.sub(nodes, [t.id]);
      return { name: t.name.replace(/^item-/i, '') || 'Item', parts: nodes.filter(n => n.type === 'part' && sub.has(n.id)) };
    });

    this.av = makeAvatar(avatar && avatar.colors, avatar && avatar.items, avatar && avatar.pack, avatar && avatar.face);
    this.av.g.rotation.order = 'YXZ';
    this.av.g.add(nameTag(this.pname));
    s.add(this.av.g);
    this.meB = { av: this.av, bub: null, bt: 0 };
    this.yaw = 0; this.pitch = 0.35; this.dist = 16; this.face = 0; this.tFace = 0;
    this.hp = this.MAX_HP; this.dead = false; this._hpShown = -1; this.grace = 1.2;
    this.joy = { x: 0, y: 0 }; this.climbing = false; this.ladC = null;
    byId('chatLog').innerHTML = '';
    this.addMsg('', 'Welcome to ' + this.gname + '! Type /help for commands.', true);
    this.reset(); this.updHp(); this.bind(); this.buildHotbar(); this.buildGui(nodes, m);

    (o.players || []).forEach(pl => this.addRemote(pl));
    (o.dyn || []).forEach(op => this.netOp(op));
    (o.watch || []).forEach(id => this.srvWatch.add(String(id)));
    this.srvCount();

    // scripts: Script on the host only, LocalScript on every device
    const mk = n => {
      const it = Tree.itemOf(m, n);
      return { name: n.name, code: String(n.code || '').slice(0, 30000), item: it ? it.name.replace(/^item-/i, '') : '' };
    };
    const all = nodes.filter(n => (n.type === 'script' || n.type === 'localscript') && !n.off);
    const snap = [...this.objs.values()].map(q => ({ id: q.id, name: q.p.name, x: q.p.x, y: q.p.y, z: q.p.z, w: q.p.w, h: q.p.h, d: q.p.d, color: q.p.color }));
    if (this.isHost) ScriptHost.start(this, all.filter(n => n.type === 'script').map(mk), snap);
    LocalHost.start(this, all.filter(n => n.type === 'localscript').map(mk), snap);

    this.running = true;
    this.last = performance.now();
    const id = ++this.rid;
    requestAnimationFrame(t => this.loop(id, t));
  },

  reset() {
    const sp = this.spawn;
    if (!this.p) this.p = { x: 0, y: 0, z: 0 };
    this.p.x = sp.x; this.p.y = sp.y; this.p.z = sp.z;
    this.vx = 0; this.vz = 0; this.vy = 0; this.ground = false; this.stand = null;
    this.climbing = false; this.seat = null; this.lay = false;
  },

  /* ---------- parts ---------- */
  addPart(n, id, info) {
    const p = {
      name: n.name, x: n.x, y: n.y, z: n.z, w: n.w, h: n.h, d: n.d, color: n.color || '#a3a2a5', visible: n.visible !== false,
      anch: n.anch !== false, collide: n.collide !== undefined ? !!n.collide : n.col !== false
    };
    const kind = info.kind || '', mesh = partMesh(p, false, kind);
    mesh.visible = p.visible;
    this.s.add(mesh);
    const o = { id, p, kind, pow: info.pow || 2, mesh, box: { id }, vy: 0 };
    this.fit(o); this.objs.set(id, o);
    return o;
  },
  fit(o) {
    const p = o.p, b = o.box;
    b.x0 = p.x - p.w / 2; b.x1 = p.x + p.w / 2; b.y0 = p.y - p.h / 2; b.y1 = p.y + p.h / 2; b.z0 = p.z - p.d / 2; b.z1 = p.z + p.d / 2;
    b.kind = o.kind; b.pow = o.pow; b.off = !p.collide;
  },
  index() {
    this.solid = []; this.lavas = []; this.waters = []; this.ladders = []; this.seats = []; this.dynList = [];
    this.objs.forEach(o => {
      const b = o.box;
      if (!o.p.anch) this.dynList.push(o);
      if (o.kind === 'water') this.waters.push(b);
      else if (o.kind === 'ladder') this.ladders.push(b);
      else { this.solid.push(b); if (o.kind === 'lava') this.lavas.push(b); if (o.kind === 'seat') this.seats.push(b); }
    });
  },
  updPart(id, q) {
    const o = this.objs.get(id); if (!o || !q) return;
    const p = o.p, ox = p.x, oy = p.y, oz = p.z;
    const geo = ['w', 'h', 'd'].some(k => q[k] !== undefined && q[k] !== p[k]);
    Object.assign(p, q);
    if (q.name !== undefined) { const i = nameKind(p.name) || {}; o.kind = i.kind || ''; o.pow = i.pow || 2; }
    if (q.name !== undefined || q.anch !== undefined) this.index();
    if (geo || q.name !== undefined || q.color !== undefined) {
      o.mesh.geometry.dispose(); o.mesh.geometry = partGeo(p, o.kind); o.mesh.material = Mats.forPart(p, o.kind);
    }
    o.mesh.position.set(p.x, p.y, p.z); o.mesh.visible = p.visible;
    this.fit(o);
    if (this.stand === o.box && this.ground) { this.p.x += p.x - ox; this.p.y += p.y - oy; this.p.z += p.z - oz; }
    this.unstick();
  },
  delPart(id) {
    const o = this.objs.get(id); if (!o) return;
    o.box.gone = true;
    this.s.remove(o.mesh); o.mesh.geometry.dispose();
    if (this.stand === o.box) this.stand = null;
    this.objs.delete(id);
    this.tweens = this.tweens.filter(t => t.id !== id);
    this.index();
  },
  tweenStep(dt) {
    if (!this.tweens.length) return;
    this.tweens = this.tweens.filter(tw => {
      if (!this.objs.has(tw.id)) return false;
      tw.t = Math.min(1, tw.t + dt / tw.s);
      const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2;
      this.updPart(tw.id, { x: tw.a.x + (tw.b.x - tw.a.x) * e, y: tw.a.y + (tw.b.y - tw.a.y) * e, z: tw.a.z + (tw.b.z - tw.a.z) * e });
      return tw.t < 1;
    });
  },
  physStep(dt) { // unanchored parts fall and land on solid parts
    if (!this.dynList.length) return;
    const gone = [];
    for (const o of this.dynList) {
      const p = o.p, oy = p.y, b = o.box;
      o.vy = (o.vy || 0) - this.GRAV * dt;
      p.y += o.vy * dt; this.fit(o);
      if (p.collide) {
        for (const q of this.solid) {
          if (q === b || q.off) continue;
          if (b.x0 < q.x1 && b.x1 > q.x0 && b.z0 < q.z1 && b.z1 > q.z0 && b.y0 < q.y1 && b.y1 > q.y0 && oy - p.h / 2 >= q.y1 - 0.6) {
            p.y = q.y1 + p.h / 2; o.vy = 0; this.fit(o);
          }
        }
      }
      o.mesh.position.y = p.y;
      if (this.stand === b && this.ground) this.p.y += p.y - oy;
      if (p.y < this.voidY - 100) gone.push(o.id);
    }
    gone.forEach(id => this.delPart(id));
  },
  unstick() {
    const p = this.p, W = this.W;
    if (!p || this.seat) return;
    for (const b of this.solid) {
      if (!b.off && p.x + W > b.x0 && p.x - W < b.x1 && p.y + this.H > b.y0 && p.y < b.y1 && p.z + W > b.z0 && p.z - W < b.z1) {
        p.y = b.y1; this.vy = Math.max(this.vy, 0);
      }
    }
  },
  groundAt(x, y, z) {
    let g = -1e9;
    for (const b of this.solid) if (!b.off && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 <= y + 1.5 && b.y1 > g) g = b.y1;
    return g;
  },
  overlaps(b) {
    const p = this.p, W = this.W + 0.2;
    return p.x + W > b.x0 && p.x - W < b.x1 && p.y + this.H > b.y0 - 0.2 && p.y < b.y1 + 0.2 && p.z + W > b.z0 && p.z - W < b.z1;
  },
  inWater(x, y, z) {
    return this.waters.some(b => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1);
  },
  touchLava() { return this.lavas.some(b => this.overlaps(b)); },
  nearLadder() {
    const p = this.p, W = this.W + 0.6;
    return this.ladders.find(b => !b.gone && p.x + W > b.x0 && p.x - W < b.x1 && p.y + 2.5 > b.y0 && p.y < b.y1 + 0.5 && p.z + W > b.z0 && p.z - W < b.z1) || null;
  },

  /* ---------- seats ---------- */
  occupied(id) { return Object.values(this.remote).some(r => r.seat === id); },
  sitOn(b) {
    this.seat = b; this.climbing = false; this.lay = false;
    this.p.x = (b.x0 + b.x1) / 2; this.p.z = (b.z0 + b.z1) / 2; this.p.y = b.y1 - 2;
    this.vx = this.vy = this.vz = 0;
  },
  leaveSeat(jump) { // stand up ON TOP of the seat, not through it
    if (this.seat && !this.seat.gone) this.p.y = this.seat.y1 + 0.05;
    this.seat = null; this.seatCd = 0.7;
    this.vx = this.vz = 0;
    if (jump) { this.vy = this.JUMP * 0.7; this.ground = false; }
  },

  move(ax, d) {
    const p = this.p, W = this.W, H = this.H;
    p[ax] += d;
    for (const b of this.solid) {
      if (b.off) continue;
      if (p.x + W > b.x0 && p.x - W < b.x1 && p.y + H > b.y0 && p.y < b.y1 && p.z + W > b.z0 && p.z - W < b.z1) {
        if (ax === 'y') {
          if (d < 0) {
            p.y = b.y1; this.ground = true; this.stand = b; this.vy = 0;
            if (b.kind === 'pad') { this.vy = this.JUMP * Math.sqrt(b.pow); this.ground = false; }
          } else { p.y = b.y0 - H; this.vy = 0; }
        } else if (ax === 'x') { p.x = d > 0 ? b.x0 - W : b.x1 + W; this.vx = 0; }
        else { p.z = d > 0 ? b.z0 - W : b.z1 + W; this.vz = 0; }
      }
    }
  },

  loop(id, t) {
    if (!this.running || id !== this.rid) return;
    requestAnimationFrame(t2 => this.loop(id, t2));
    const dt = clamp((t - this.last) / 1000, 0, 0.05);
    this.last = t; this.time += dt;
    this.tweenStep(dt); this.physStep(dt);
    ScriptHost.tick(this, dt); LocalHost.tick(this, dt);
    Burst.step(dt, (x, y, z) => this.groundAt(x, y, z));
    const k = this.keys;
    let state = 'idle', sp = 1;
    if (this.grace > 0) this.grace -= dt;
    if (this.noClimb > 0) this.noClimb -= dt;
    if (this.seatCd > 0) this.seatCd -= dt;
    if (this.useCd > 0) this.useCd -= dt;

    if (!this.dead) {
      const p = this.p, jy = this.joy;
      const f = (k.w ? 1 : 0) - (k.s ? 1 : 0) - jy.y;
      const sd = (k.d ? 1 : 0) - (k.a ? 1 : 0) + jy.x;
      const mag = Math.min(1, Math.hypot(f, sd));
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const dx = -sy * f + cy * sd, dz = -cy * f - sy * sd, len = Math.hypot(dx, dz);

      if (this.seat) { // sitting: locked to the seat, jump to get up
        const b = this.seat;
        if (b.gone) this.leaveSeat(false);
        else {
          p.x = (b.x0 + b.x1) / 2; p.y = b.y1 - 2; p.z = (b.z0 + b.z1) / 2;
          this.vx = this.vy = this.vz = 0; this.ground = true; state = 'sit';
          if (k[' ']) this.leaveSeat(true);
        }
      }
      if (!this.seat) {
        const ctl = !this.lay;
        if (this.lay && k[' ']) this.lay = false;
        const inW = this.inWater(p.x, p.y + 2.5, p.z);
        const lad = ctl ? this.nearLadder() : null;
        const moving = ctl && mag > 0.12 && len > 0;

        // ladders: push the joystick up/down next to one to grab it
        if (lad && !this.climbing && this.noClimb <= 0 && !inW && (f > 0.3 || (f < -0.3 && !this.ground))) this.climbing = true;
        if (this.climbing) {
          if (!lad || inW || (this.ground && f < -0.3)) {
            const hop = !lad && !inW && f > 0.3 && this.ladC;
            this.climbing = false; this.noClimb = 0.35;
            if (hop) { // reached the top: hop onto the platform
              const hx = this.ladC.x - p.x, hz = this.ladC.z - p.z, hl = Math.hypot(hx, hz) || 1;
              this.vy = 20; this.vx = hx / hl * 9; this.vz = hz / hl * 9;
            }
          } else if (k[' ']) { // jump off backwards
            this.climbing = false; this.noClimb = 0.45; this.vy = this.JUMP * 0.75;
            this.vx = -Math.sin(this.face) * 8; this.vz = -Math.cos(this.face) * 8;
          } else { // stick to the ladder and face it
            const cx = (lad.x0 + lad.x1) / 2, cz = (lad.z0 + lad.z1) / 2;
            this.ladC = { x: cx, z: cz };
            const kk = Math.min(1, dt * 12);
            if ((lad.x1 - lad.x0) < (lad.z1 - lad.z0)) { const sg = p.x >= cx ? 1 : -1; p.x += (cx + sg * ((lad.x1 - lad.x0) / 2 + this.W + 0.05) - p.x) * kk; }
            else { const sg = p.z >= cz ? 1 : -1; p.z += (cz + sg * ((lad.z1 - lad.z0) / 2 + this.W + 0.05) - p.z) * kk; }
            this.tFace = Math.atan2(cx - p.x, cz - p.z);
          }
        }

        const sp0 = this.SPEED * (inW ? 0.6 : 1);
        let tx = 0, tz = 0;
        if (moving && !this.climbing) { tx = dx / len * sp0 * mag; tz = dz / len * sp0 * mag; this.tFace = Math.atan2(tx, tz); }
        const acc = this.climbing ? 60 : inW ? (moving ? 60 : 40)
          : this.ground ? (moving ? this.ACC : this.DEC) : (moving ? this.AIR_ACC : this.AIR_DEC);
        const ex = tx - this.vx, ez = tz - this.vz, el = Math.hypot(ex, ez), step = acc * dt;
        if (el <= step) { this.vx = tx; this.vz = tz; } else { this.vx += ex / el * step; this.vz += ez / el * step; }

        if (this.climbing || moving) { // smooth turning
          let a = this.tFace - this.face;
          a = Math.atan2(Math.sin(a), Math.cos(a));
          this.face += a * Math.min(1, dt * 12);
        }

        if (this.climbing) this.vy = f * this.CLIMB;
        else if (inW) this.vy += ((ctl && k[' '] ? 14 : -5) - this.vy) * Math.min(1, dt * 4);
        else {
          if (ctl && k[' '] && this.ground) this.vy = this.JUMP;
          this.vy -= this.GRAV * dt;
        }
        this.ground = false; this.stand = null;
        this.move('x', this.vx * dt);
        this.move('z', this.vz * dt);
        this.move('y', this.vy * dt);

        const hs = Math.hypot(this.vx, this.vz);
        if (this.climbing) { state = 'climb'; sp = Math.abs(this.vy) / this.CLIMB; }
        else if (inW) state = 'swim';
        else if (!this.ground) state = this.vy > 0 ? 'jump' : 'fall';
        else if (this.lay) state = 'lay';
        else if (hs > 2) { state = 'walk'; sp = hs / 16; }

        if (this.seatCd <= 0 && !this.lay) {
          for (const b of this.seats) if (this.overlaps(b) && !this.occupied(b.id)) { this.sitOn(b); state = 'sit'; break; }
        }
      }

      if (this.grace <= 0 && !this.dead) { if (p.y < this.voidY || this.touchLava()) this.die(); }
      if (!this.dead && this.hp < this.MAX_HP) this.hp = Math.min(this.MAX_HP, this.hp + dt * this.REGEN);
    } else {
      this.respawnIn -= dt;
      byId('deathCount').textContent = 'Respawning in ' + Math.max(1, Math.ceil(this.respawnIn)) + '...';
      if (this.respawnIn <= 0) this.respawn();
    }

    this.lastState = state;
    const P = this.p, lay = this.lay && !this.seat;
    this.av.g.position.set(P.x, P.y + (lay ? 0.5 : 0), P.z);
    this.av.g.rotation.set(lay ? -Math.PI / 2 : 0, this.face, 0);
    this.av.anim(this.time, state, dt, sp);
    if (this.meB.bub) { this.meB.bt -= dt; if (this.meB.bt <= 0) this.rmBubble(this.meB); }
    this.updHp();
    this.netStep(dt);

    const o = Env.sunOff(this.env);
    this.sun.target.position.set(P.x, P.y, P.z);
    this.sun.position.set(P.x + o[0], P.y + o[1], P.z + o[2]);

    const sy2 = Math.sin(this.yaw), cy2 = Math.cos(this.yaw), d = this.dist, cp = Math.cos(this.pitch);
    this.cam.position.set(P.x + sy2 * cp * d, P.y + 3 + Math.sin(this.pitch) * d, P.z + cy2 * cp * d);
    this.cam.lookAt(P.x, P.y + 3, P.z);
    const cpos = this.cam.position;
    byId('uw').classList.toggle('hidden', !this.inWater(cpos.x, cpos.y, cpos.z));
    Gfx.r.render(this.s, this.cam);
  },

  stop() {
    this.running = false;
    ScriptHost.stop(); LocalHost.stop();
    removeEventListener('keydown', this.kd);
    removeEventListener('keyup', this.ku);
    removeEventListener('pointerup', this.pu);
    removeEventListener('pointercancel', this.pu);
    (this.btnH || []).forEach(([b, on, off]) => {
      b.removeEventListener('pointerdown', on);
      b.removeEventListener('pointerup', off);
      b.removeEventListener('pointercancel', off);
      b.removeEventListener('pointerleave', off);
    });
    this.btnH = [];
    const joy = byId('joy');
    joy.removeEventListener('pointerdown', this.jd);
    joy.removeEventListener('pointermove', this.jm);
    joy.removeEventListener('pointerup', this.ju);
    joy.removeEventListener('pointercancel', this.ju);
    byId('knob').style.transform = 'translate(0,0)';
    const cv = byId('gameCanvas');
    cv.removeEventListener('pointerdown', this.pd);
    cv.removeEventListener('pointermove', this.pm);
    cv.removeEventListener('wheel', this.wh);
    this.keys = {}; this.joy = { x: 0, y: 0 }; this.vx = 0; this.vz = 0; this.tweens = [];
    this.remote = {}; this.tools = []; this.tool = -1; this.gui = {};
    this.rmBubble(this.meB);
    if (this.sun && this.sun.shadow) this.sun.shadow.dispose();
    this.sun = null;
    if (this.s) {
      Burst.clear(this.s);
      this.s.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      if (this.s.background && this.s.background.dispose) this.s.background.dispose();
      this.s = null;
    }
    this.objs = new Map(); this.solid = []; this.dynList = []; this.seats = [];
    byId('sgui').innerHTML = '';
    byId('hp').classList.remove('low');
    byId('hotbar').innerHTML = '';
    ['death', 'leaveDlg', 'chatBox', 'uw', 'outBox', 'msg'].forEach(i => byId(i).classList.add('hidden'));
    byId('gameUI').classList.add('hidden');
  }
};