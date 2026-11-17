/* =====================================================
   STUDIO UI (modes, ribbon, explorer, properties,
   script editor, lighting, save / exit, publish, submit)
   ===================================================== */
const DEMO = {
  script: `// Script = SERVER. Runs only while playing, changes are seen by everyone.
// Open Output (⌨) in Test Play to see print().
print('Hello from Script!');

// a lift that moves up and down
const lift = workspace.spawn({ name: 'Lift', x: 0, y: 3, z: 14, w: 8, h: 1, d: 8, color: '#ff8800' });
(async () => {
  while (true) {
    lift.moveTo(0, 18, 14, 3);
    await wait(3.5);
    lift.moveTo(0, 3, 14, 3);
    await wait(3.5);
  }
})();

// part.onTouch gives you the player that touched it
lift.onTouch(p => { notify(p.name + ' touched the lift!', 2); });
`,
  localscript: `// LocalScript runs on EACH player's own device and only affects that player.
print('Hello from LocalScript, I am ' + player.name);
notify('Welcome, ' + player.name + '!', 3);

player.onDied(() => print('I died'));
`
};
const ITEM_DEMO = {
  script: `// Script inside an Item = server side.
// 1) Tapping the screen while holding the Item:
item.onActivate(p => {
  for (const q of players.near(p, 8, 70)) q.damage(25);   // hits players in front of you
});
// 2) A GUI button can call the same thing: its LocalScript does remote.fire('attack')
remote.on('attack', (p, data) => {
  for (const q of players.near(p, 8, 70)) q.damage(25);
});
`,
  localscript: `// LocalScript inside an Item = runs on the player's device.
item.onEquip(() => notify('Item equipped', 1));
item.onActivate(() => notify('Swing!', 1));
`
};
const GUI_DEMO = `// LocalScript inside a ScreenGui / Button. Name of the button = 'Button'.
const b = gui.find('Button');
if (b) b.onClick(() => {
  remote.fire('attack');          // the server Script (in your Item) receives it
  notify('Attack!', 1);
});
`;

const SCRIPT_HELP = `print / warn / error(...)  -> Output panel (Test Play)
wait(seconds)  use:  await wait(1)     (setTimeout also works)
chat('text')   notify('text', seconds)

SCRIPT (server)  /  LOCALSCRIPT (each player)
workspace.find(name), findAll(name), spawn({name,x,y,z,w,h,d,color,anchored,canCollide})
part: x y z w h d color name visible canCollide anchored
part.set({...})  part.moveTo(x,y,z,seconds)  part.destroy()
part.onTouch(fn)   Script: fn(player)   LocalScript: fn()
Names Water / Lava / Ladder / Sitting place / Jump pad-N also work on spawned parts.

players.list()  players.find(name)  players.count  players.onJoin(fn)  players.onLeave(fn)
players.near(player, range, halfAngleDeg)  -> players in FRONT of that player
player handle: id name x y z face health maxHealth alive
  teleport(x,y,z) setHealth(n) damage(n) heal(n) kill()
  setSpeed(n) setJumpPower(n) lay() stand()
LocalScript: the variable  player  is you (it can only change you).
Script: use players / the player given to your callbacks.

game.time  game.onTick(fn)  game.onChat((player, text) => ...)  [LocalScript: (name, text)]
game.setLighting({ time: 0-24, bright: 0.1-2, skyTop:'#hex', skyBot:'#hex', fog: 60-3000, shadows: true })

REMOTE (small JSON data only)
LocalScript: remote.fire('name', data)         -> server
Script:      remote.on('name', (player, data) => ...)
Script:      remote.fireClient(player, 'name', data)   remote.fireAll('name', data)
LocalScript: remote.on('name', data => ...)

GUI (LocalScript only, elements from StarterGui)
gui.find('Name') / gui.list()   element: text visible color
element.set({text, visible, color})   element.onClick(fn)

item (only inside an Item-xxx model): item.onActivate(fn)  item.onEquip(fn)  item.onUnequip(fn)
Tap the screen to use the held Item.

Limits: 300 spawned parts. No network, no storage, no access to accounts or wallet.`;

const St = {
  cur: null, type: 'map', isNew: true, lastId: { map: null, avatar: null },

  init() {
    Ui.enhance(byId('studio'));
    document.querySelectorAll('#stRibbon [data-tool]').forEach(b => { b.onclick = () => this.setTool(b.dataset.tool); });
    document.querySelectorAll('#studio [data-act]').forEach(b => { b.onclick = () => this.act(b.dataset.act); });
    document.querySelectorAll('#studio [data-tpl]').forEach(b => {
      b.onclick = () => {
        const t = Studio.addTpl(b.dataset.tpl);
        if (t) { this.cur.slot = t.slot; $('#stName').textContent = this.cur.name || 'Untitled'; }
      };
    });
    document.querySelectorAll('#studio .mtab').forEach(b => {
      b.onclick = () => { if (b.dataset.m !== this.type) this.guard(() => this.switchMode(b.dataset.m)); };
    });
    document.querySelectorAll('#studio .nud button').forEach(b => {
      b.onclick = () => { const a = b.dataset.n.split(','); Studio.nudge(a[0], +a[1]); };
    });

    const snapIn = $('#stSnap');
    snapIn.onchange = () => this.setSnap(parseFloat(snapIn.value));

    $('#stExpBody').onclick = e => {
      const t = e.target.closest('[data-t]');
      if (t) { const n = Studio.node(t.dataset.t); if (n) { n.open = n.open === false; this.explorer(); } return; }
      const r = e.target.closest('[data-i]');
      if (r) Studio.tap(r.dataset.i);
    };
    $('#stExpBody').ondblclick = e => {
      const r = e.target.closest('[data-i]'); if (!r) return;
      Studio.sel = [r.dataset.i]; Studio.changed(true);
      const n = Studio.node(r.dataset.i);
      if (n && Studio.isScriptType(n.type)) this.editScript(); else this.rename();
    };

    $('#pEdit').onclick = () => this.editScript();
    $('#propForm').addEventListener('change', e => {
      if (e.target.id === 'pc') return;
      const p = Studio.prim(); if (!p) return;
      let nm = ($('#pn').value.trim() || p.type).slice(0, 30);
      if (Filter.has(nm)) { toast('That name is not allowed'); nm = p.name; }
      if (Studio.isScriptType(p.type)) return Studio.patch({ name: nm, off: !$('#pOn').checked });
      const n = (id, d, min) => { const v = parseFloat($('#' + id).value); return isNaN(v) ? d : Math.max(min === undefined ? -100000 : min, v); };
      if (p.type === 'btn' || p.type === 'lbl') {
        return Studio.patch({
          name: nm, text: Filter.mask($('#pgt').value.slice(0, 40)),
          gx: clamp(n('pgx', p.gx), 0, 100), gy: clamp(n('pgy', p.gy), 0, 100),
          gw: clamp(n('pgw', p.gw), 10, 800), gh: clamp(n('pgh', p.gh), 10, 600),
          color: $('#pgc').value, tc: $('#pgk').value
        });
      }
      if (p.type !== 'part') return Studio.patch({ name: nm });
      const o = {
        name: nm, x: n('px', p.x), y: n('py', p.y), z: n('pz', p.z),
        w: n('pw', p.w, 0.2), h: n('ph', p.h, 0.2), d: n('pd', p.d, 0.2)
      };
      if (this.type === 'map') { o.spawn = $('#ps').checked; o.anch = $('#pAn').checked; o.col = $('#pCo').checked; }
      if (this.type === 'avatar') o.attach = $('#pa').value;
      Studio.patch(o);
    });
    let cu = false;
    const pc = $('#pc');
    pc.addEventListener('input', () => { if (!cu) { Studio.push(); cu = true; } Studio.patch({ color: pc.value }, false, false); });
    pc.addEventListener('change', () => { cu = false; Studio.changed(true); });
  },

  setSnap(v) {
    v = isFinite(v) && v >= 0 ? v : 1;
    Studio.snap = v;
    $('#stSnap').value = String(v);
    ['px', 'py', 'pz', 'pw', 'ph', 'pd'].forEach(id => { $('#' + id).step = String(v > 0 ? v : 0.25); });
  },

  /* ---------- open / switch ---------- */
  openNew(type) { this.open(type, type === 'map' ? newPlace() : newAcc(), true); },
  openPlace(id) { const p = Places.get(Auth.key(), id); if (p) this.open('map', JSON.parse(JSON.stringify(p)), false); },
  openAcc(id) {
    const d = Drafts.get(Auth.key(), id);
    if (!d) return;
    if (d.status === 'pending' || d.status === 'approved' || d.status === 'down') return uiAlert('This accessory is locked (pending, live or taken down).');
    this.open('avatar', JSON.parse(JSON.stringify(d)), false);
  },
  switchMode(m) {
    const k = Auth.key(), id = this.lastId[m];
    let rec = id ? (m === 'map' ? Places : Drafts).get(k, id) : null;
    if (rec && m === 'avatar' && ['pending', 'approved', 'down'].includes(rec.status)) rec = null;
    if (rec) this.open(m, JSON.parse(JSON.stringify(rec)), false);
    else this.open(m, m === 'map' ? newPlace() : newAcc(), true);
  },
  open(type, rec, isNew) {
    this.cur = rec; this.type = type; this.isNew = isNew;
    const el = $('#studio');
    el.dataset.mode = type; el.classList.remove('hidden');
    document.querySelectorAll('#studio .mtab').forEach(b => b.classList.toggle('on', b.dataset.m === type));
    Studio.onList = () => this.list();
    Studio.onProps = () => this.props();
    Studio.onDirty = () => this.dirtyUi();
    Studio.load(rec.parts, type, rec.env);
    this.setSnap(type === 'avatar' ? 0.25 : 1);
    Studio.show();
    $('#multiBtn').classList.remove('on');
    this.setTool('select');
    $('#stName').textContent = rec.name || 'Untitled';
    const wide = innerWidth >= 900;
    $('#stExp').classList.toggle('hidden', !wide);
    $('#stProp').classList.toggle('hidden', !wide);
    this.dirtyUi();
  },

  /* ---------- ribbon ---------- */
  addS(type) {
    const S = Studio, m = Tree.map(S.nodes), home = S.scriptHome();
    const hn = home === 'SS' ? null : m[home];
    const inItem = hn && Tree.itemOf(m, hn), inGui = hn && Tree.root(m, hn) === 'SG';
    if (inGui && type === 'script') { type = 'localscript'; toast('GUI scripts must be LocalScripts'); }
    const code = inGui ? GUI_DEMO : (inItem ? ITEM_DEMO : DEMO)[type];
    const n = S.addScript(type, code);
    if (n) this.editScript();
  },
  act(a) {
    const S = Studio, m = {
      add: () => S.add(),
      addWater: () => S.add({ name: 'Water', w: 20, h: 6, d: 20, color: '#2e86de' }),
      addLava: () => S.add({ name: 'Lava', w: 8, h: 1, d: 8, color: '#ff5a00' }),
      addLadder: () => S.add({ name: 'Ladder', w: 3, h: 14, d: 0.6, y: 7, color: '#b5651d' }),
      addPad: () => S.add({ name: 'Jump pad', w: 6, h: 1, d: 6, y: 0.5, color: '#2ee66b' }),
      addSeat: () => S.add({ name: 'Sitting place', w: 4, h: 1, d: 4, y: 1, color: '#8d6e63' }),
      addModel: () => S.addContainer('model'), addFolder: () => S.addContainer('folder'),
      addItem: () => S.addItem(),
      addScript: () => this.addS('script'), addLScript: () => this.addS('localscript'),
      addGui: () => S.addGui('gui'), addBtn: () => S.addGui('btn'), addLbl: () => S.addGui('lbl'),
      rename: () => this.rename(), dup: () => S.dup(), del: () => S.del(),
      cut: () => S.cut(), copy: () => S.copy(), paste: () => S.paste(),
      rotate: () => S.rotate(), flipX: () => S.flip('x'), flipZ: () => S.flip('z'),
      group: () => S.group('model'), groupF: () => S.group('folder'), ungroup: () => S.ungroup(),
      into: () => S.into(), out: () => S.out(),
      toSP: () => S.toSP(), toWS: () => S.toWS(),
      multi: () => { S.multi = !S.multi; $('#multiBtn').classList.toggle('on', S.multi); toast(S.multi ? 'Multi-select on: tap to add or remove' : 'Multi-select off'); },
      code: () => this.editScript(),
      undo: () => S.undo(), redo: () => S.redo(), focus: () => S.focus(),
      exp: () => $('#stExp').classList.toggle('hidden'),
      prop: () => $('#stProp').classList.toggle('hidden'),
      light: () => this.lighting(),
      save: () => this.save(), play: () => this.play(), publish: () => this.askPublish(), submit: () => this.askSubmit(),
      close: () => this.guard(() => this.exit())
    };
    if (m[a]) m[a]();
  },
  setTool(t) {
    Studio.setTool(t);
    document.querySelectorAll('#stRibbon [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    this.props();
  },
  rename() {
    const p = Studio.prim();
    if (!p) return uiAlert('Select something first.');
    const title = this.type === 'map' ? 'Name (Water, Lava, Ladder, Sitting place, Jump pad-3, Item-Name)' : 'Name';
    uiPrompt(title, p.name, v => {
      v = v.trim() || p.type;
      if (Filter.has(v)) { toast('That name is not allowed'); return false; }
      Studio.patch({ name: v.slice(0, 30) });
    }, 30);
  },

  /* ---------- lighting / sky ---------- */
  lighting() {
    const e = Studio.env;
    modal('☀ Lighting & Sky', `
      <label class="lbl">Time of day (0-24)</label><input id="lgT" type="number" min="0" max="24" step="0.5" value="${e.time}">
      <label class="lbl">Brightness (0.1-2)</label><input id="lgB" type="number" min="0.1" max="2" step="0.1" value="${e.bright}">
      <label class="lbl">Sky top color</label><input id="lgS" type="color" value="${e.skyTop}">
      <label class="lbl">Sky horizon color</label><input id="lgH" type="color" value="${e.skyBot}">
      <label class="lbl">Fog distance in game (60-3000)</label><input id="lgF" type="number" min="60" max="3000" step="10" value="${e.fog}">
      <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="lgSh" ${e.shadows ? 'checked' : ''}> Shadows</label>`, [
      {
        label: 'Apply', fn: () => {
          Studio.setEnv({ time: byId('lgT').value, bright: byId('lgB').value, skyTop: byId('lgS').value, skyBot: byId('lgH').value, fog: byId('lgF').value, shadows: byId('lgSh').checked });
          toast('Lighting updated');
        }
      },
      { label: 'Reset to default', cls: 'gray', fn: () => { Studio.setEnv(null); } },
      { label: 'Close', cls: 'gray' }]);
  },

  /* ---------- script editor ---------- */
  editScript() {
    const p = Studio.prim();
    if (!p || !Studio.isScriptType(p.type)) return uiAlert('Select a Script or LocalScript first (or press Script / LocalScript to create one).');
    modal('📝 ' + p.name + (p.type === 'script' ? ' (server)' : ' (local)'),
      `<textarea id="sc" class="code" rows="13" maxlength="20000" spellcheck="false" autocapitalize="off" autocorrect="off">${esc(p.code || '')}</textarea>
      <p class="muted">Scripts only run while playing. They cannot touch accounts, wallet or storage.</p>`, [
      { label: '💾 Apply', fn: () => { Studio.patch({ code: byId('sc').value.slice(0, 20000) }); toast('Script updated'); } },
      { label: 'Help', cls: 'gray', fn: () => { showText('Script API', 'Quick reference', SCRIPT_HELP); } },
      { label: 'Close', cls: 'gray' }]);
  },

  /* ---------- explorer / properties ---------- */
  list() { this.explorer(); this.props(); },
  explorer() {
    const S = Studio, N = S.nodes, m = Tree.map(N), by = { WS: [], SS: [], SP: [], SG: [] };
    N.forEach(n => { const k = n.parent || 'WS'; (by[k] = by[k] || []).push(n); });
    const icon = n => {
      if (n.type === 'model') return isItemName(n.name) ? '🗡' : '📦';
      if (n.type === 'folder') return '📁';
      if (n.type === 'gui') return '🖼';
      if (n.type === 'btn') return '🔘';
      if (n.type === 'lbl') return '🏷';
      if (n.type === 'script') return n.off ? '⛔' : '📜';
      if (n.type === 'localscript') return n.off ? '⛔' : '🖥';
      if (this.type === 'avatar') return '🧱';
      const k = Tree.info(m, n).kind;
      return n.spawn ? '🏁' : k === 'water' ? '💧' : k === 'lava' ? '🔥' : k === 'ladder' ? '🪜' : k === 'pad' ? '⏫' : k === 'seat' ? '🪑' : '🧱';
    };
    const row = (n, d) => {
      const kids = by[n.id] || [], hasK = kids.length > 0, open = n.open !== false;
      let h = `<div class="tr ${S.sel.includes(n.id) ? 'sel' : ''}" style="padding-left:${6 + d * 14}px" data-i="${n.id}">` +
        `<span class="tg" ${hasK ? `data-t="${n.id}"` : ''}>${hasK ? (open ? '▾' : '▸') : ''}</span>${icon(n)} ${esc(n.name)}</div>`;
      if (hasK && open) kids.forEach(k => { h += row(k, d + 1); });
      return h;
    };
    const sec = (title, k) => `<div class="tr hd">${title}</div>` + (by[k] || []).map(n => row(n, 1)).join('');
    const el = $('#stExpBody'), top = el.scrollTop;
    el.innerHTML = this.type === 'map'
      ? sec('🌐 Workspace', 'WS') + sec('📜 ServerScript', 'SS') + sec('🎒 StarterPack', 'SP') + sec('🖼 StarterGui', 'SG')
      : sec('🎩 Accessory', 'WS');
    el.scrollTop = top;
  },
  props() {
    const S = Studio, p = S.prim();
    $('#propEmpty').classList.toggle('hidden', !!p);
    $('#propForm').classList.toggle('hidden', !p);
    const scripts = S.nodes.filter(n => S.isScriptType(n.type)).length;
    $('#stStatus').textContent = `${S.count()}/${S.maxParts()} parts` + (this.type === 'map' ? ` · ${scripts} scripts` : '') +
      ` · Tool: ${S.tool}` + (S.multi ? ' · Multi' : '') + (p ? ' · ' + p.name : '') + (S.dirty ? ' · Unsaved' : ' · Saved');
    if (!p) return;
    $('#pMulti').textContent = S.sel.length > 1 ? S.sel.length + ' items selected (showing the last)' : '';
    $('#pPart').classList.toggle('hidden', p.type !== 'part');
    $('#pGui').classList.toggle('hidden', !(p.type === 'btn' || p.type === 'lbl'));
    $('#pCode').classList.toggle('hidden', !S.isScriptType(p.type));
    const set = (id, v) => {
      const el = $('#' + id);
      if (document.activeElement === el) return;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    };
    set('pn', p.name);
    if (p.type === 'part') {
      set('px', p.x); set('py', p.y); set('pz', p.z); set('pw', p.w); set('ph', p.h); set('pd', p.d);
      set('pc', p.color); set('ps', p.spawn); set('pa', p.attach || '');
      set('pAn', p.anch !== false); set('pCo', p.col !== false);
    }
    if (p.type === 'btn' || p.type === 'lbl') {
      set('pgt', p.text || ''); set('pgx', p.gx); set('pgy', p.gy); set('pgw', p.gw); set('pgh', p.gh);
      set('pgc', p.color || '#d94545'); set('pgk', p.tc || '#ffffff');
    }
    if (S.isScriptType(p.type)) set('pOn', !p.off);
  },
  dirtyUi() { $('#stDirty').textContent = Studio.dirty ? '● unsaved' : ''; this.props(); },

  /* ---------- save / exit ---------- */
  guard(next) {
    if (!Studio.dirty) return next();
    modal('Unsaved changes', '<p>Do you want to save your changes before leaving?</p>', [
      { label: '💾 Save', fn: () => { this.save(() => next()); } },
      { label: 'Exit without saving', cls: 'red', fn: () => { next(); } },
      { label: 'Cancel', cls: 'gray' }]);
  },
  save(cb) {
    const me = Auth.me(), c = this.cur, isMap = this.type === 'map';
    const go = () => {
      c.parts = JSON.parse(JSON.stringify(Studio.nodes));
      if (isMap) c.env = Studio.env;
      c.time = Date.now();
      const err = (isMap ? Places : Drafts).save(me.key, c);
      if (err === 'LIMIT') return uiAlert(isMap
        ? 'You can keep up to ' + CONFIG.MAX_PLACES + ' places. Delete an old one first.'
        : 'You can keep up to ' + CONFIG.MAX_ACC_DRAFTS + ' accessories. Delete an old one first.');
      if (err) return uiAlert('Could not save (storage is full).');
      this.isNew = false; this.lastId[this.type] = c.id;
      Studio.dirty = false; $('#stName').textContent = c.name;
      this.dirtyUi(); toast('Saved');
      if (cb) cb();
    };
    if (!c.name) {
      uiPrompt('Name your ' + (isMap ? 'place' : 'accessory'), '', v => {
        v = v.trim();
        if (v.length < 3) { toast('Name must be at least 3 characters'); return false; }
        if (Filter.has(v)) { toast('That name is not allowed'); return false; }
        c.name = v; go();
      }, 40);
    } else go();
  },
  exit(toTab) {
    Studio.hide();
    $('#studio').classList.add('hidden');
    this.cur = null;
    tab = toTab || 'create';
    render();
  },

  /* ---------- test play ---------- */
  play() {
    if (this.type !== 'map') return;
    if (!Studio.count()) return uiAlert('Add a part first.');
    const me = Auth.me(), c = this.cur;
    Studio.hide();
    $('#studio').classList.add('hidden');
    Game.start({ parts: Studio.nodes, env: Studio.env, spawn: null }, Wear.resolve(me.key), {
      onExit: () => { $('#studio').classList.remove('hidden'); Studio.show(); },
      name: me.name, gname: c.name || 'Test Play', max: c.maxPlayers, test: true, net: false, id: 'h'
    });
  },

  /* ---------- publish map (costs MAP_PRICE the first time) ---------- */
  askPublish() {
    const c = this.cur, me = Auth.me();
    if (!Studio.count()) return uiAlert('Add at least one part first.');
    const g = c.gameId ? DB.games().find(x => x.id === c.gameId) : null;
    if (g && g.down) return uiAlert('This game was taken down: ' + (g.downNote || 'policy violation') + '. You cannot republish it.');
    modal('🚀 Publish map', `
      <input id="pbN" placeholder="Game name" maxlength="40" value="${esc(c.name)}">
      <textarea id="pbD" rows="3" maxlength="200" placeholder="Description">${esc(c.desc)}</textarea>
      <label class="lbl">Max players per server (1-${CONFIG.MAX_PLAYERS_LIMIT})</label>
      <input id="pbM" type="number" min="1" max="${CONFIG.MAX_PLAYERS_LIMIT}" value="${c.maxPlayers || 8}">
      <p class="muted">${g ? 'Updating a game you already paid for is free.' : 'Publishing costs ' + CONFIG.MAP_PRICE + ' ' + GV + '.'} Your balance: ${GV} ${Wallet.get(me.key)}</p>`,
      [{ label: g ? 'Update' : 'Publish', fn: () => this.doPublish() }, { label: 'Cancel', cls: 'gray' }]);
  },
  doPublish() {
    const me = Auth.me(), c = this.cur;
    const name = $('#pbN').value.trim(), desc = $('#pbD').value.trim();
    const mp = clamp(Math.round(+$('#pbM').value || 1), 1, CONFIG.MAX_PLAYERS_LIMIT);
    if (name.length < 3) { toast('Name must be at least 3 characters'); return false; }
    if (Filter.has(name) || Filter.has(desc)) { toast('Inappropriate words are not allowed'); return false; }
    const gs = DB.games();
    let g = c.gameId ? gs.find(x => x.id === c.gameId) : null;
    const cost = g ? 0 : CONFIG.MAP_PRICE;
    if (Wallet.get(me.key) < cost) { toast('Not enough ' + GV + '. You need ' + cost + '.'); return false; }
    if (this.isNew && Places.list(me.key).length >= CONFIG.MAX_PLACES) { toast('Place limit reached. Delete one first.'); return false; }

    c.name = name; c.desc = desc; c.maxPlayers = mp;
    c.parts = JSON.parse(JSON.stringify(Studio.nodes));
    c.env = Studio.env;
    const m = Tree.map(Tree.norm(c.parts));
    const spawn = spawnOf(c.parts.filter(n => n.type === 'part' && Tree.root(m, n) === 'WS')) || { x: 0, y: 8, z: 0 };
    const gid = g ? g.id : uid();
    if (!GameData.set(gid, { parts: c.parts, env: c.env, spawn })) { toast('Storage is full, could not publish'); return false; }
    if (cost) Wallet.spend(me.key, cost);
    if (g) Object.assign(g, { name, desc, maxPlayers: mp, listed: true, time: Date.now() });
    else {
      g = { id: gid, name, desc, author: me.name, authorKey: me.key, maxPlayers: mp, visitors: [], listed: true, placeId: c.id, time: Date.now() };
      gs.push(g); c.gameId = gid;
    }
    DB.set('games', gs);
    const err = Places.save(me.key, c);
    if (err) { toast('Published, but the place could not be saved (storage full?)'); }
    this.lastId.map = c.id; Studio.dirty = false;
    toast('Published! Game code: ' + gid);
    this.exit('home');
  },

  /* ---------- submit accessory for review (costs ACC_PRICE) ---------- */
  askSubmit() {
    const c = this.cur, me = Auth.me();
    if (!Studio.count()) return uiAlert('Add at least one part first.');
    modal('📤 Submit accessory', `
      <input id="sbN" placeholder="Accessory name" maxlength="30" value="${esc(c.name)}">
      <textarea id="sbD" rows="2" maxlength="120" placeholder="Description">${esc(c.desc)}</textarea>
      <label class="lbl">Slot</label>
      <select id="sbS">${SLOTS.map(s => `<option ${s === c.slot ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label class="lbl">Color mode</label>
      <select id="sbM"><option value="fixed" ${c.recolor ? '' : 'selected'}>Fixed colors (as I designed)</option><option value="recolor" ${c.recolor ? 'selected' : ''}>Wearer can recolor it</option></select>
      <label class="lbl">Price (${GV}). You decide.</label>
      <input id="sbP" type="number" min="0" max="${CONFIG.MAX_PRICE}" value="${c.price}">
      <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="sbL" ${c.limited ? 'checked' : ''}> Limited edition</label>
      <label class="lbl">Limited stock (1-${CONFIG.MAX_STOCK})</label>
      <input id="sbT" type="number" min="1" max="${CONFIG.MAX_STOCK}" value="${c.stock}">
      <p class="muted">Review fee: ${CONFIG.ACC_PRICE} ${GV} (refunded if rejected). Platform tax on each sale: ${Math.round(CONFIG.MARKET_CUT * 100)}%. Your balance: ${GV} ${Wallet.get(me.key)}.</p>
      <p class="muted">The owner reviews your model first. If approved, it goes live in the Shop under your name.</p>`,
      [{ label: 'Submit (' + CONFIG.ACC_PRICE + ' ' + GV + ')', fn: () => this.doSubmit() }, { label: 'Cancel', cls: 'gray' }]);
  },
  doSubmit() {
    const me = Auth.me(), c = this.cur;
    const name = $('#sbN').value.trim(), desc = $('#sbD').value.trim();
    if (name.length < 3) { toast('Name must be at least 3 characters'); return false; }
    if (Filter.has(name) || Filter.has(desc)) { toast('Inappropriate words are not allowed'); return false; }
    const price = clamp(Math.floor(+$('#sbP').value || 0), 0, CONFIG.MAX_PRICE);
    const limited = $('#sbL').checked;
    const stock = clamp(Math.floor(+$('#sbT').value || 1), 1, CONFIG.MAX_STOCK);
    const slot = $('#sbS').value;
    const recolor = $('#sbM').value === 'recolor';
    if (this.isNew && Drafts.list(me.key).length >= CONFIG.MAX_ACC_DRAFTS) { toast('Accessory limit reached. Delete one first.'); return false; }

    Object.assign(c, { name, desc, price, limited, stock, slot, recolor });
    c.parts = JSON.parse(JSON.stringify(Studio.nodes.filter(n => n.type === 'part')));
    const sub = Subs.submit(me, c, { name, desc, price, limited, stock, slot, recolor });
    if (typeof sub === 'string') { toast(sub); return false; }
    c.status = 'pending'; c.subId = sub.id; c.note = '';
    Drafts.save(me.key, c);
    Studio.dirty = false;
    toast('Submitted for review!');
    this.exit('create');
  }
};

St.init();