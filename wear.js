/* =====================================================
   WEAR: clothing slots, templates, animation/avatar packs
   (owner only) and official faces (owner only)
   ===================================================== */
['Hair', 'Shoulder', 'T-Shirt', 'Pants', 'Shoes', 'Gloves'].forEach(s => { if (!SLOTS.includes(s)) SLOTS.push(s); });

const TEMPLATES = {
  tshirt: {
    slot: 'T-Shirt', parts: [
      { name: 'Shirt', attach: 'torso', x: 0, y: 3, z: 0, w: 2.1, h: 2.1, d: 1.1, color: '#e53935' },
      { name: 'SleeveL', attach: 'la', x: -1.5, y: 3.5, z: 0, w: 1.1, h: 1.1, d: 1.1, color: '#e53935' },
      { name: 'SleeveR', attach: 'ra', x: 1.5, y: 3.5, z: 0, w: 1.1, h: 1.1, d: 1.1, color: '#e53935' }]
  },
  pants: {
    slot: 'Pants', parts: [
      { name: 'Hip', attach: 'torso', x: 0, y: 2.25, z: 0, w: 2.1, h: 0.5, d: 1.1, color: '#1e88e5' },
      { name: 'LegL', attach: 'll', x: -0.5, y: 1.05, z: 0, w: 1.1, h: 1.9, d: 1.1, color: '#1e88e5' },
      { name: 'LegR', attach: 'rl', x: 0.5, y: 1.05, z: 0, w: 1.1, h: 1.9, d: 1.1, color: '#1e88e5' }]
  },
  shoes: {
    slot: 'Shoes', parts: [
      { name: 'ShoeL', attach: 'll', x: -0.5, y: 0.3, z: 0.1, w: 1.1, h: 0.6, d: 1.3, color: '#424242' },
      { name: 'ShoeR', attach: 'rl', x: 0.5, y: 0.3, z: 0.1, w: 1.1, h: 0.6, d: 1.3, color: '#424242' }]
  },
  gloves: {
    slot: 'Gloves', parts: [
      { name: 'GloveL', attach: 'la', x: -1.5, y: 2.3, z: 0, w: 1.1, h: 0.6, d: 1.1, color: '#8e24aa' },
      { name: 'GloveR', attach: 'ra', x: 1.5, y: 2.3, z: 0, w: 1.1, h: 0.6, d: 1.1, color: '#8e24aa' }]
  },
  hat: {
    slot: 'Hat', parts: [
      { name: 'Brim', attach: 'head', x: 0, y: 5.25, z: 0, w: 1.9, h: 0.15, d: 1.9, color: '#6d4c41' },
      { name: 'Top', attach: 'head', x: 0, y: 5.6, z: 0, w: 1.3, h: 0.55, d: 1.3, color: '#6d4c41' }]
  }
};

const BODY_KEYS = ['head', 'torso', 'la', 'ra', 'll', 'rl'];

/* Packs = animations + body shape. Classic is built in. Owner-made packs live in DB 'packs'. */
const Packs = {
  list() { return [{ id: 'classic', name: 'Classic', price: 0, anims: DEFAULT_PACK.anims, body: null }].concat(DB.get('packs', []).filter(p => !p.down)); },
  get(id) { const l = this.list(); return l.find(p => p.id === id) || l[0]; },
  owned(k, id) { const p = this.get(id); return p.price <= 0 || DB.get('packown_' + k, []).includes(id); },
  equipped(k) { const id = DB.get('pack_' + k, 'classic'); return this.owned(k, id) ? this.get(id) : this.get('classic'); },
  equip(k, id) { if (this.owned(k, id)) DB.set('pack_' + k, id); },
  buy(k, id) {
    const p = this.get(id);
    if (this.owned(k, id)) return 'You already own this pack';
    if (!Wallet.spend(k, p.price)) return 'Not enough ' + GV + '. Top up in your wallet.';
    const l = DB.get('packown_' + k, []); l.push(id); DB.set('packown_' + k, l);
    return null;
  },
  clean(an) {
    const out = {};
    ANIM_STATES.forEach(s => {
      const a = (an && an[s]) || DEFAULT_PACK.anims[s];
      const o = { f: num(a.f, 0, 30, 0), s: a.s ? 1 : 0, bob: num(a.bob, 0, 1.5, 0), j: {} };
      JOINTS.forEach(j => {
        const d = a.j && a.j[j]; if (!d) return;
        ['x', 'y', 'z'].forEach(ax => {
          const v = d[ax];
          if (Array.isArray(v) && v.length >= 2) {
            o.j[j] = o.j[j] || {};
            o.j[j][ax] = [num(v[0], -360, 360, 0), num(v[1], -360, 360, 0), num(v[2], -7, 7, 0)];
          }
        });
      });
      out[s] = o;
    });
    return out;
  },
  // body shape: scale [x,y,z] per body part, limited to 0.3 .. 3
  cleanBody(b) {
    const o = {};
    BODY_KEYS.forEach(k => {
      const v = b && Array.isArray(b[k]) ? b[k] : [1, 1, 1];
      o[k] = [num(v[0], 0.3, 3, 1), num(v[1], 0.3, 3, 1), num(v[2], 0.3, 3, 1)];
    });
    return o;
  },
  save(rec) {
    if (!Auth.isAdmin()) return 'Only the owner can create packs';
    const name = String(rec.name || '').trim();
    if (name.length < 3 || name.length > 24) return 'Pack name must be 3-24 characters';
    if (Filter.has(name)) return 'That name is not allowed';
    const l = DB.get('packs', []), old = l.find(x => x.id === rec.id), r = {
      id: rec.id, name, price: clamp(Math.floor(+rec.price || 0), 0, CONFIG.MAX_PRICE),
      anims: this.clean(rec.anims), body: this.cleanBody(rec.body), down: old ? !!old.down : false, time: Date.now()
    };
    const i = l.findIndex(x => x.id === r.id);
    if (i < 0) l.push(r); else l[i] = r;
    return DB.set('packs', l) ? null : 'Could not save (storage is full)';
  },
  remove(id) { DB.set('packs', DB.get('packs', []).filter(p => p.id !== id)); },
  takedown(id, on, reason) {
    const l = DB.get('packs', []), p = l.find(x => x.id === id);
    if (!p) return;
    p.down = !!on; p.downNote = on ? String(reason || 'Violation').slice(0, 80) : '';
    DB.set('packs', l);
  },
  template(name) {
    const a = JSON.parse(JSON.stringify(DEFAULT_PACK.anims));
    if (name === 'zombie') {
      a.idle.j = { la: { x: [-85, 3, 0] }, ra: { x: [-85, 3, 1] }, torso: { x: [10, 2, 0] }, head: { x: [14, 3, 0] } };
      a.walk.f = 6;
      a.walk.j = { la: { x: [-85, 8, 0] }, ra: { x: [-85, 8, 3.14] }, ll: { x: [0, 30, 3.14] }, rl: { x: [0, 30, 0] }, torso: { x: [12, 0, 0] } };
    }
    return a;
  },
  bodyTemplate(name) {
    const b = this.cleanBody(null);
    if (name === 'chibi') { b.head = [1.7, 1.7, 1.7]; b.ll = [1, 0.7, 1]; b.rl = [1, 0.7, 1]; b.la = [1, 0.8, 1]; b.ra = [1, 0.8, 1]; }
    if (name === 'giant') BODY_KEYS.forEach(k => { b[k] = [1.5, 1.5, 1.5]; });
    return b;
  }
};

/* Official faces: only the owner can create them. Players equip faces they own. */
const Faces = {
  clean(s) {
    s = s || {};
    return {
      eye: FACE_EYES.includes(s.eye) ? s.eye : 'oval', mouth: FACE_MOUTHS.includes(s.mouth) ? s.mouth : 'smile',
      brow: s.brow ? 1 : 0, blush: s.blush ? 1 : 0, ink: hexOk(s.ink, '#000000')
    };
  },
  list() { return [{ id: 'classic', name: 'Classic Smile', price: 0, spec: DEF_FACE }].concat(DB.get('faces', []).filter(f => !f.down)); },
  get(id) { const l = this.list(); return l.find(f => f.id === id) || l[0]; },
  owned(k, id) { const f = this.get(id); return f.price <= 0 || DB.get('faceown_' + k, []).includes(id); },
  equipped(k) { const id = DB.get('face_' + k, 'classic'); return this.owned(k, id) ? this.get(id).spec : DEF_FACE; },
  equippedId(k) { const id = DB.get('face_' + k, 'classic'); return this.owned(k, id) ? this.get(id).id : 'classic'; },
  equip(k, id) { if (this.owned(k, id)) DB.set('face_' + k, id); },
  buy(k, id) {
    const f = this.get(id);
    if (this.owned(k, id)) return 'You already own this face';
    if (!Wallet.spend(k, f.price)) return 'Not enough ' + GV + '. Top up in your wallet.';
    const l = DB.get('faceown_' + k, []); l.push(id); DB.set('faceown_' + k, l);
    return null;
  },
  save(rec) {
    if (!Auth.isAdmin()) return 'Only the owner can create faces';
    const name = String(rec.name || '').trim();
    if (name.length < 3 || name.length > 24) return 'Face name must be 3-24 characters';
    if (Filter.has(name)) return 'That name is not allowed';
    const l = DB.get('faces', []), old = l.find(x => x.id === rec.id);
    const r = { id: rec.id, name, price: clamp(Math.floor(+rec.price || 0), 0, CONFIG.MAX_PRICE), spec: this.clean(rec.spec), down: old ? !!old.down : false };
    const i = l.findIndex(x => x.id === r.id);
    if (i < 0) l.push(r); else l[i] = r;
    return DB.set('faces', l) ? null : 'Could not save (storage is full)';
  },
  remove(id) { DB.set('faces', DB.get('faces', []).filter(f => f.id !== id)); },
  takedown(id, on, reason) {
    const l = DB.get('faces', []), f = l.find(x => x.id === id);
    if (!f) return;
    f.down = !!on; f.downNote = on ? String(reason || 'Violation').slice(0, 80) : '';
    DB.set('faces', l);
  }
};

const Wear = {
  // colors + accessories + animation/body pack + face
  resolve(k) { const r = Avatar.resolve(k); r.pack = Packs.equipped(k); r.face = Faces.equipped(k); return r; }
};