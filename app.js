/* =====================================================
   STATE + MAIN RENDER
   ===================================================== */
let tab = 'home', authMode = 'login', authErr = '', search = '', avSel = 'head';

const setTab = t => { tab = t; render(); };
function doLogout() { Auth.logout(); tab = 'home'; render(); }

function render() {
  AvatarView.stop();
  const me = Auth.me(), app = $('#app');
  if (!me) {
    const k = Auth.key(), u = k ? DB.users()[k] : null;
    if (u && Auth.banOf(u)) { authErr = Auth.banMsg(u); Auth.logout(); }
    renderAuth(app); Ui.enhance(app); return;
  }
  const tabs = [['home', '🎮', 'Games'], ['avatar', '🧍', 'Avatar'], ['shop', '🛍', 'Shop'], ['create', '🛠', 'Create']];
  if (Auth.isAdmin()) tabs.push(['admin', '🛡', 'Admin']);
  if (!tabs.some(t => t[0] === tab)) tab = 'home';
  app.innerHTML = `
    <header><div class="logo"><span>✷</span> Blosor</div>
      <div class="hr"><span class="uname">${esc(me.name)}</span>
      <button class="gv" onclick="openWallet()">${GV} ${me.gv || 0}</button>
      <button class="gray sm" onclick="doLogout()">Log out</button></div></header>
    <nav>${tabs.map(t => `<button class="${tab === t[0] ? 'on' : ''}" onclick="setTab('${t[0]}')">${t[1]} ${t[2]}</button>`).join('')}</nav>
    <main id="main"></main>`;
  ({ home: viewHome, avatar: viewAvatar, shop: viewShop, create: viewCreate, admin: viewAdmin })[tab]($('#main'), me);
  Ui.enhance(app);
}

/* =====================================================
   LOGIN / SIGN UP / RESET
   ===================================================== */
function renderAuth(app) {
  const ek = `onkeydown="if(event.key==='Enter')doAuth()"`;
  let f, btn;
  if (authMode === 'login') {
    btn = 'Log in';
    f = `<input id="a_id" placeholder="Username or email" autocomplete="username" ${ek}>
         <input id="a_pw" type="password" placeholder="Password" autocomplete="current-password" ${ek}>`;
  } else if (authMode === 'register') {
    btn = 'Sign up';
    f = `<input id="a_user" placeholder="Username" maxlength="20" autocomplete="username">
         <input id="a_email" type="email" placeholder="Email" autocomplete="email">
         <label class="lbl">Date of birth</label>
         <input id="a_dob" type="date">
         <input id="a_pw" type="password" placeholder="Password (min 6 characters)" autocomplete="new-password" ${ek}>`;
  } else {
    btn = 'Reset password';
    f = `<input id="a_email" type="email" placeholder="Account email">
         <label class="lbl">Date of birth</label>
         <input id="a_dob" type="date">
         <input id="a_pw" type="password" placeholder="New password" autocomplete="new-password" ${ek}>`;
  }
  const link = (m, t) => `<button class="gray" onclick="authMode='${m}';authErr='';render()">${t}</button>`;
  app.innerHTML = `<div class="login card"><div class="big">✷</div><h1>Blosor</h1>
    ${f}<div class="err">${esc(authErr)}</div>
    <button onclick="doAuth()">${btn}</button>
    ${authMode === 'login' ? link('register', 'Create account') + link('reset', 'Forgot password?') : link('login', 'Back to log in')}
  </div>`;
}
function doAuth() {
  const v = id => { const e = $('#' + id); return e ? e.value : ''; };
  let err;
  if (authMode === 'login') err = Auth.login(v('a_id'), v('a_pw'));
  else if (authMode === 'register') err = Auth.register(v('a_user'), v('a_email'), v('a_dob'), v('a_pw'));
  else err = Auth.reset(v('a_email'), v('a_dob'), v('a_pw'));
  if (err) { authErr = err; $('.err').textContent = err; return; }
  authErr = '';
  if (authMode === 'reset') { authMode = 'login'; toast('Password updated. Log in now.'); }
  render();
}

/* =====================================================
   WALLET
   ===================================================== */
function openWallet() {
  const me = Auth.me();
  modal('Wallet', `<div class="gvbig">${GV} ${me.gv || 0}</div>
    <p class="muted">${GV} (GV) is the Blosor currency. Every account starts with 0. To top up, contact the owner: <b>${esc(CONFIG.OWNER_CONTACT)}</b>. You will get a voucher code to redeem here.</p>
    <input id="vc" placeholder="Paste voucher code">`, [
    {
      label: 'Redeem', fn: () => {
        const err = Voucher.redeem(byId('vc').value, me.key);
        if (err) { toast(err); return false; }
        toast('Top-up successful!'); render();
      }
    },
    { label: 'Close', cls: 'gray' }]);
}

/* =====================================================
   GAMES (home): published community maps + join by code
   ===================================================== */
const hue = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

function viewHome(el) {
  el.innerHTML = `<div class="row2"><input id="srch" placeholder="🔍 Search games..." value="${esc(search)}">
    <button class="gray" onclick="joinCode()">🔗 Join by code</button></div>
    <div id="glist"></div><div id="rlist"></div>`;
  $('#srch').oninput = e => { search = e.target.value; drawGames(); };
  drawGames();
}
function drawGames() {
  const q = search.toLowerCase();
  const gs = DB.games().filter(g => g.listed !== false && !g.down && g.name.toLowerCase().includes(q)).reverse();
  $('#glist').innerHTML = gs.length
    ? `<div class="grid">${gs.map(g => {
        const h = hue(g.id);
        return `<div class="gcard">
          <div class="thumb" style="background:linear-gradient(135deg,hsl(${h},60%,48%),hsl(${(h + 45) % 360},60%,28%))">✷</div>
          <div class="info"><h4>${esc(g.name)}</h4>
          <div class="muted">by ${esc(g.author)}</div>
          <div class="muted">👤 ${(g.visitors || []).length} · Max ${g.maxPlayers || 1}</div>
          <div class="row2"><button onclick="Play.open('${g.id}')">▶ Play</button>
          <button class="gray" onclick="shareGame('${g.id}')">🔗</button></div></div></div>`;
      }).join('')}</div>`
    : `<div class="card muted">No games yet. Be the first to publish one from the Create tab!</div>`;

  const own = new Set(DB.games().map(g => g.id));
  const rc = DB.get('recent', []).filter(id => !own.has(id)).map(id => DB.get('rc_' + id, null)).filter(Boolean);
  $('#rlist').innerHTML = rc.length
    ? `<div class="card"><h3>Recent (joined by code)</h3>${rc.map(r => `<div class="part"><span><b>${esc(r.meta.name)}</b><br><span class="muted">code ${esc(r.meta.id)}</span></span>
        <span><button class="sm" onclick="Play.openRecent('${r.meta.id}')">▶ Play</button></span></div>`).join('')}</div>`
    : '';
}
function shareGame(id) {
  showText('Game code', 'Friends press "Join by code" and paste this. They connect through their own devices.', id);
}
function joinCode() {
  uiPrompt('Game code', '', v => {
    v = v.trim().toLowerCase();
    if (!/^[a-z0-9]{4,24}$/.test(v)) { toast('Invalid code'); return false; }
    Play.join(v);
  }, 24);
}

/* =====================================================
   AVATAR (colors, face, accessories, animation pack)
   ===================================================== */
function viewAvatar(el, me) {
  const st = Avatar.get(me.key), res = Wear.resolve(me.key), all = DB.items();
  const owned = Inv.list(me.key);
  const packs = Packs.list().filter(p => Packs.owned(me.key, p.id));
  const faces = Faces.list().filter(f => Faces.owned(me.key, f.id));
  const cur = Packs.equipped(me.key), curFace = Faces.equippedId(me.key);
  const wornRecolor = owned.map(o => all.find(x => x.id === o.id)).filter(it => it && it.recolor && !it.down && st.equipped.includes(it.id));
  el.innerHTML = `<div class="card" style="text-align:center">
    <canvas id="avc" width="240" height="300"></canvas>
    <div class="chips" style="justify-content:center">${ANIM_STATES.map(s =>
      `<button class="chip ${s === 'idle' ? 'on' : ''}" data-s="${s}">${s}</button>`).join('')}</div>
    <div class="muted">Tap a body part, or preview an animation.</div></div>
    <div class="card"><h3>Body colors</h3>
      <div class="chips">${Object.keys(PART_LABELS).map(k =>
        `<button class="chip ${k === avSel ? 'on' : ''}" data-p="${k}"><i style="background:${st.colors[k]}"></i>${PART_LABELS[k]}</button>`).join('')}</div>
      <label class="lbl" id="avLbl"></label>
      <input type="color" id="avCol" value="${st.colors[avSel]}">
      <button class="gray" onclick="resetAv()">Reset to classic</button></div>
    <div class="card"><h3>Face</h3>
      ${faces.map(f => `<div class="part"><span>${esc(f.name)}</span>
        <span><button class="sm ${f.id === curFace ? 'gray' : ''}" onclick="equipFace('${f.id}')">${f.id === curFace ? 'Equipped' : 'Equip'}</button></span></div>`).join('')}
      <div class="muted" style="margin-top:6px">Official faces are sold in the Shop.</div></div>
    <div class="card"><h3>Animation / body pack</h3>
      ${packs.map(p => `<div class="part"><span>${esc(p.name)}</span>
        <span><button class="sm ${p.id === cur.id ? 'gray' : ''}" onclick="equipPack('${p.id}')">${p.id === cur.id ? 'Equipped' : 'Equip'}</button></span></div>`).join('')}
      <div class="muted" style="margin-top:6px">More packs are sold in the Shop.</div></div>
    ${wornRecolor.length ? `<div class="card"><h3>Accessory colors</h3>${wornRecolor.map(it =>
      `<label class="lbl">${esc(it.name)}</label><input type="color" data-ic="${it.id}" value="${esc(st.itemColors[it.id] || (it.parts[0] && it.parts[0].color) || '#a3a2a5')}">`).join('')}</div>` : ''}
    <div class="card"><h3>Inventory</h3>${owned.length ? owned.map(o => {
      const it = all.find(x => x.id === o.id); if (!it || it.down) return '';
      const on = st.equipped.includes(it.id);
      return `<div class="inv"><img src="${Thumb.get(it)}" alt="">
        <div class="grow"><b>${esc(it.name)}</b><div class="muted">${esc(it.slot)} · by ${esc(it.creator)}${it.recolor ? ' · recolorable' : ''}${it.limited ? ` · <span class="badge">LIMITED #${o.serial}/${it.stock}</span>` : ''}</div></div>
        <button class="sm ${on ? 'gray' : ''}" onclick="toggleEquip('${it.id}')">${on ? 'Remove' : 'Wear'}</button></div>`;
    }).join('') : '<div class="muted">You do not own any accessories yet. Visit the Shop!</div>'}</div>`;

  Ui.enhance(el);
  const sel = k => {
    avSel = k;
    el.querySelectorAll('.chip[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === k));
    byId('avCol').value = st.colors[k];
    byId('avLbl').textContent = 'Color: ' + PART_LABELS[k];
    AvatarView.select(k);
  };
  AvatarView.start(byId('avc'), st.colors, res.items, sel, res.pack, res.face);
  el.querySelectorAll('.chip[data-p]').forEach(b => { b.onclick = () => sel(b.dataset.p); });
  el.querySelectorAll('.chip[data-s]').forEach(b => {
    b.onclick = () => {
      AvatarView.state = b.dataset.s;
      el.querySelectorAll('.chip[data-s]').forEach(x => x.classList.toggle('on', x === b));
    };
  });
  byId('avCol').addEventListener('input', e => {
    st.colors[avSel] = e.target.value;
    AvatarView.av.setColors(st.colors);
    const dot = el.querySelector('.chip[data-p="' + avSel + '"] i');
    if (dot) dot.style.background = e.target.value;
    Avatar.set(me.key, st);
  });
  el.querySelectorAll('input[data-ic]').forEach(inp => {
    inp.addEventListener('change', () => {
      st.itemColors[inp.dataset.ic] = inp.value;
      Avatar.set(me.key, st);
      render();
    });
  });
  sel(avSel);
}
function toggleEquip(id) { Avatar.toggle(Auth.key(), id); render(); }
function equipPack(id) { Packs.equip(Auth.key(), id); render(); }
function equipFace(id) { Faces.equip(Auth.key(), id); render(); }
function resetAv() {
  const k = Auth.key(), a = Avatar.get(k);
  a.colors = Object.assign({}, DEFAULT_COLORS);
  Avatar.set(k, a); render();
}

/* =====================================================
   SHOP (accessories, animation/body packs, faces)
   ===================================================== */
function viewShop(el, me) {
  const items = DB.items().filter(i => !i.down).reverse();
  const packs = Packs.list().filter(p => p.id !== 'classic');
  const faces = Faces.list().filter(f => f.id !== 'classic');
  el.innerHTML = `
  <div class="card"><h3>Animation / body packs</h3>
    ${packs.map(p => `<div class="part"><span><b>${esc(p.name)}</b><br><span class="muted">${p.price > 0 ? GV + ' ' + p.price : 'Free'}</span></span>
      <span><button class="sm gray" onclick="previewPack('${p.id}')">👁</button>
      ${Packs.owned(me.key, p.id) ? '<button class="sm gray" disabled>Owned</button>' : `<button class="sm" onclick="buyPack('${p.id}')">Buy</button>`}</span></div>`).join('')
      || '<div class="muted">No packs yet.</div>'}
  </div>
  <div class="card"><h3>Faces</h3>
    ${faces.map(f => `<div class="part"><span><b>${esc(f.name)}</b><br><span class="muted">${f.price > 0 ? GV + ' ' + f.price : 'Free'}</span></span>
      <span><button class="sm gray" onclick="previewFace('${f.id}')">👁</button>
      ${Faces.owned(me.key, f.id) ? '<button class="sm gray" disabled>Owned</button>' : `<button class="sm" onclick="buyFace('${f.id}')">Buy</button>`}</span></div>`).join('')
      || '<div class="muted">No official faces yet.</div>'}
  </div>
  <h3 style="margin-top:14px">Accessories</h3>` + (items.length
    ? `<div class="grid">${items.map(it => {
        const owned = Inv.has(me.key, it.id), left = it.limited ? it.stock - (it.sold || 0) : null;
        const soldOut = it.limited && left <= 0;
        return `<div class="gcard"><img src="${Thumb.get(it)}" alt="">
          <div class="info"><h4>${esc(it.name)}</h4>
          <div class="muted">by ${esc(it.creator)} · ${esc(it.slot)}</div>
          ${it.limited ? `<span class="badge">LIMITED · ${Math.max(0, left)} left</span>` : ''}
          <div style="margin-top:4px;font-weight:bold;color:#ffd24d">${it.price > 0 ? GV + ' ' + it.price : 'Free'}</div>
          <button ${owned || soldOut ? 'class="gray" disabled' : ''} onclick="buyItem('${it.id}')">${owned ? 'Owned' : soldOut ? 'Sold out' : 'Buy'}</button></div></div>`;
      }).join('')}</div>`
    : `<div class="card muted">The shop is empty. Creators can submit accessories from the Create tab.</div>`);
}
function buyItem(id) {
  const me = Auth.me(), it = DB.items().find(x => x.id === id);
  if (!it) return;
  uiConfirm(`Buy "${it.name}" for ${it.price} ${GV}?`, () => {
    const err = Shop.buy(me.key, id);
    if (err) { uiAlert(err); return; }
    toast('Purchased! Wear it from the Avatar tab.'); render();
  }, 'Buy', '');
}
function buyPack(id) {
  const me = Auth.me(), p = Packs.get(id);
  uiConfirm(`Buy pack "${p.name}" for ${p.price} ${GV}?`, () => {
    const err = Packs.buy(me.key, id);
    if (err) { uiAlert(err); return; }
    toast('Purchased! Equip it from the Avatar tab.'); render();
  }, 'Buy', '');
}
function buyFace(id) {
  const me = Auth.me(), f = Faces.get(id);
  uiConfirm(`Buy face "${f.name}" for ${f.price} ${GV}?`, () => {
    const err = Faces.buy(me.key, id);
    if (err) { uiAlert(err); return; }
    toast('Purchased! Equip it from the Avatar tab.'); render();
  }, 'Buy', '');
}
function previewPack(id) {
  const p = Packs.get(id);
  modal('Preview: ' + p.name, `<div style="text-align:center"><canvas id="ppv" width="240" height="300"></canvas></div>
    <div class="chips" style="justify-content:center">${ANIM_STATES.map(s => `<button class="chip" data-s="${s}">${s}</button>`).join('')}</div>`,
    [{ label: 'Close', cls: 'gray', fn: () => AvatarView.stop() }]);
  AvatarView.start(byId('ppv'), Avatar.get(Auth.key()).colors, [], null, p, Faces.equipped(Auth.key()));
  document.querySelectorAll('#mBody .chip').forEach(b => { b.onclick = () => { AvatarView.state = b.dataset.s; }; });
}
function previewFace(id) {
  const f = Faces.get(id);
  modal('Preview: ' + f.name, `<div style="text-align:center"><canvas id="pfv" width="240" height="300"></canvas></div>`,
    [{ label: 'Close', cls: 'gray', fn: () => AvatarView.stop() }]);
  AvatarView.start(byId('pfv'), Avatar.get(Auth.key()).colors, [], null, null, f.spec);
}

/* =====================================================
   CREATE (places, accessories)
   ===================================================== */
function viewCreate(el, me) {
  const places = Places.list(me.key), drafts = Drafts.list(me.key), games = DB.games();
  const stLabel = d => ({ draft: 'Draft', pending: '⏳ Pending review', approved: '✅ Live in Shop', rejected: '❌ Rejected', down: '🚫 Taken down' }[d.status] || 'Draft');
  el.innerHTML = `
  <div class="card"><h3>✷ Blosor Studio</h3>
    <p class="muted" style="margin-bottom:8px">Build maps (Models, Scripts, Items, GUI) or design clothes and accessories. Publishing a map costs ${CONFIG.MAP_PRICE} ${GV} (first publish only). Submitting an accessory costs ${CONFIG.ACC_PRICE} ${GV} and needs approval from the owner.</p>
    <button onclick="St.openNew('map')">🗺 New Map</button>
    <button class="gray" onclick="St.openNew('avatar')">🎩 New Accessory / Clothing</button>
  </div>
  <div class="card"><h3>My Places (${places.length}/${CONFIG.MAX_PLACES})</h3>
    ${places.map(p => {
      const g = p.gameId ? games.find(x => x.id === p.gameId) : null;
      const status = !g ? 'Not published' : g.down ? '🚫 Taken down: ' + esc(g.downNote || '') : g.listed === false ? 'Hidden' : 'Live';
      return `<div class="part"><span><b>${esc(p.name || 'Untitled')}</b><br><span class="muted">${status}${g && !g.down ? ' · 👤 ' + (g.visitors || []).length : ''}</span></span>
        <span><button class="sm" onclick="St.openPlace('${p.id}')">Edit</button>
        ${g && !g.down ? `<button class="sm gray" onclick="setListed('${g.id}',${g.listed === false})">${g.listed === false ? 'Republish' : 'Unpublish'}</button>` : ''}
        <button class="sm red" onclick="deletePlace('${p.id}')">🗑</button></span></div>`;
    }).join('') || '<div class="muted">No saved places yet.</div>'}
  </div>
  <div class="card"><h3>My Accessories (${drafts.length}/${CONFIG.MAX_ACC_DRAFTS})</h3>
    ${drafts.map(d => `<div class="part"><span><b>${esc(d.name || 'Untitled')}</b><br>
      <span class="muted">${stLabel(d)}${(d.status === 'rejected' || d.status === 'down') && d.note ? ': ' + esc(d.note) : ''}</span></span>
      <span>${d.status === 'draft' || d.status === 'rejected' ? `<button class="sm" onclick="St.openAcc('${d.id}')">Edit</button>` : ''}
      ${d.status === 'pending' ? `<button class="sm gray" onclick="copyCode('${d.id}')">Copy code</button>` : `<button class="sm red" onclick="deleteAcc('${d.id}')">🗑</button>`}</span></div>`).join('')
      || '<div class="muted">No accessories yet.</div>'}
  </div>`;
}
function setListed(gameId, listed) {
  const gs = DB.games(), g = gs.find(x => x.id === gameId);
  if (!g || g.down) return;
  g.listed = listed; DB.set('games', gs);
  toast(listed ? 'Game is live again' : 'Game unpublished');
  render();
}
function deletePlace(id) {
  const me = Auth.me(), p = Places.get(me.key, id);
  if (!p) return;
  uiConfirm('Delete "' + (p.name || 'Untitled') + '"?' + (p.gameId ? ' Its published game will be removed too.' : ''), () => {
    if (p.gameId) { DB.set('games', DB.games().filter(g => g.id !== p.gameId)); GameData.del(p.gameId); }
    Places.remove(me.key, id);
    toast('Place deleted'); render();
  }, 'Delete');
}
function deleteAcc(id) {
  uiConfirm('Delete this accessory draft? (A live Shop item stays in the Shop.)', () => {
    Drafts.remove(Auth.key(), id); render();
  }, 'Delete');
}
function copyCode(draftId) {
  const s = DB.pending().find(x => x.draftId === draftId && x.status === 'pending');
  if (!s) return toast('Submission not found');
  showText('Submission code', 'Send this code to the owner. They can import it in the Admin tab.', Subs.exportCode(s));
}

/* =====================================================
   ADMIN (owner only)
   ===================================================== */
function viewAdmin(el) {
  if (!Auth.isAdmin()) return;
  const pend = DB.pending().filter(s => s.status === 'pending');
  const games = DB.games(), users = Object.entries(DB.users()), items = DB.items();
  const packs = DB.get('packs', []), faces = DB.get('faces', []), reps = DB.reports().slice().reverse();
  const tdBtn = (fn, id, down) => down
    ? `<button class="sm" onclick="${fn}('${id}',false)">Restore</button>`
    : `<button class="sm red" onclick="${fn}('${id}',true)">Takedown</button>`;
  el.innerHTML = `
  <div class="card"><h3>Review queue (${pend.length})</h3>
    ${pend.map(s => `<div class="part"><span><b>${esc(s.name)}</b><br><span class="muted">by ${esc(s.creator)} · ${s.price} ${GV}${s.limited ? ' · LTD ' + s.stock : ''}${s.recolor ? ' · recolor' : ''}</span></span>
      <span><button class="sm gray" onclick="adminPreview('${s.id}')">👁</button>
      <button class="sm" onclick="adminApprove('${s.id}')">✔</button>
      <button class="sm red" onclick="adminReject('${s.id}')">✖</button></span></div>`).join('') || '<div class="muted">Nothing pending</div>'}
    <button class="gray" onclick="adminImport()">Import submission code</button>
  </div>
  <div class="card"><h3>Reports (${reps.length})</h3>
    ${reps.slice(0, 20).map(r => `<div class="part"><span><b>${esc(r.name)}</b><br><span class="muted">${esc(r.reason)} · ${esc(r.game)}</span></span>
      <span><button class="sm red" onclick="adminBanName('${esc(r.name)}')">Ban</button>
      <button class="sm gray" onclick="adminDismiss('${r.id}')">✕</button></span></div>`).join('') || '<div class="muted">No reports</div>'}
  </div>
  <div class="card"><h3>Animation / body packs (${packs.length})</h3>
    ${packs.map(p => `<div class="part"><span><b>${esc(p.name)}</b><br><span class="muted">${p.price} ${GV}${p.down ? ' · DOWN' : ''}</span></span>
      <span><button class="sm" onclick="adminPack('${p.id}')">Edit</button>${tdBtn('adminTdPack', p.id, p.down)}
      <button class="sm red" onclick="adminPackDel('${p.id}')">🗑</button></span></div>`).join('') || '<div class="muted">None yet</div>'}
    <button onclick="adminPack()">➕ New pack</button>
  </div>
  <div class="card"><h3>Official faces (${faces.length})</h3>
    ${faces.map(f => `<div class="part"><span><b>${esc(f.name)}</b><br><span class="muted">${f.price} ${GV}${f.down ? ' · DOWN' : ''}</span></span>
      <span><button class="sm" onclick="adminFace('${f.id}')">Edit</button>${tdBtn('adminTdFace', f.id, f.down)}
      <button class="sm red" onclick="adminFaceDel('${f.id}')">🗑</button></span></div>`).join('') || '<div class="muted">None yet</div>'}
    <button onclick="adminFace()">➕ New face</button>
  </div>
  <div class="card"><h3>${GV} Top-up</h3>
    <input id="tu" placeholder="Username"><input id="ta" type="number" placeholder="Amount">
    <button onclick="adminVoucher()">Create voucher code</button>
    <button class="gray" onclick="adminGrant()">Grant directly (user on this device)</button>
  </div>
  <div class="card"><h3>Shop items (${items.length})</h3>
    ${items.map(i => `<div class="part"><span><b>${esc(i.name)}</b><br><span class="muted">by ${esc(i.creator)}${i.down ? ' · DOWN' : ''}</span></span>
      <span>${tdBtn('adminTdItem', i.id, i.down)}</span></div>`).join('') || '<div class="muted">None</div>'}
  </div>
  <div class="card"><h3>Games (${games.length})</h3>
    ${games.map(g => `<div class="part"><span>${esc(g.name)}<br><span class="muted">by ${esc(g.author)} · ${g.down ? 'DOWN' : g.listed === false ? 'hidden' : 'live'}</span></span>
      <span>${tdBtn('adminTdGame', g.id, g.down)}
      <button class="sm red" onclick="adminRemoveGame('${g.id}')">🗑</button></span></div>`).join('') || '<div class="muted">None</div>'}
  </div>
  <div class="card"><h3>Users (${users.length})</h3>
    ${users.map(([k, u]) => { const b = Auth.banOf(u); return `<div class="part"><span>${esc(u.name)}<br><span class="muted">${esc(u.email || '')} · ${GV} ${u.gv || 0}${b ? ' · BANNED' : ''}</span></span>
      <span>${k === Auth.key() ? '' : b ? `<button class="sm" onclick="adminUnban('${k}')">Unban</button>` : `<button class="sm red" onclick="adminBan('${k}')">Ban</button>`}</span></div>`; }).join('')}
  </div>`;
}

/* ----- review queue ----- */
function adminPreview(id) {
  const s = DB.pending().find(x => x.id === id);
  if (!s) return;
  modal(s.name, `<div style="text-align:center"><canvas id="apv" width="240" height="300"></canvas></div>
    <p class="muted">by ${esc(s.creator)} · slot ${esc(s.slot)} · ${s.price} ${GV}${s.limited ? ' · limited ' + s.stock : ''}${s.recolor ? ' · recolor' : ''}</p>
    <p>${esc(s.desc)}</p>`, [{ label: 'Close', cls: 'gray', fn: () => AvatarView.stop() }]);
  AvatarView.start(byId('apv'), DEFAULT_COLORS, [s]);
}
function adminApprove(id) {
  const err = Subs.approve(id);
  toast(err || 'Approved. It is now in the Shop.'); render();
}
function adminReject(id) {
  uiPrompt('Reject reason (shown to the creator)', '', v => {
    const r = Subs.reject(id, v.trim().slice(0, 60) || 'Not approved');
    if (r.err) { toast(r.err); return; }
    render();
    if (r.code) showText('Refund voucher', 'The creator is not on this device. Send them this refund code.', r.code);
    else toast('Rejected. Fee refunded.');
  }, 60);
}
function adminImport() {
  modal('Import submission', '<textarea id="imp" rows="5" placeholder="Paste the submission code"></textarea>', [
    {
      label: 'Import', fn: () => {
        const err = Subs.importCode(byId('imp').value);
        if (err) { toast(err); return false; }
        toast('Imported'); render();
      }
    },
    { label: 'Cancel', cls: 'gray' }]);
}

/* ----- takedown (reason asked when taking down) ----- */
function adminTd(on, ask, apply) {
  if (!on) { apply(false, ''); render(); return; }
  uiPrompt(ask, '', v => { apply(true, v.trim().slice(0, 80) || 'Policy violation'); render(); toast('Taken down'); }, 80);
}
function adminTdItem(id, on) {
  adminTd(on, 'Takedown reason', (o, r) => { if (o) Subs.takedown(id, r); else Subs.restore(id); });
}
function adminTdPack(id, on) { adminTd(on, 'Takedown reason', (o, r) => Packs.takedown(id, o, r)); }
function adminTdFace(id, on) { adminTd(on, 'Takedown reason', (o, r) => Faces.takedown(id, o, r)); }
function adminTdGame(id, on) {
  adminTd(on, 'Takedown reason (shown to the developer)', (o, r) => {
    const gs = DB.games(), g = gs.find(x => x.id === id); if (!g) return;
    g.down = !!o; g.downNote = o ? r : '';
    DB.set('games', gs);
  });
}

/* ----- animation / body pack editor (owner only) ----- */
function bodyGrid(b) {
  return BODY_KEYS.map(k => `<div class="row2"><span class="muted" style="width:62px">${PART_LABELS[k]}</span>` +
    [0, 1, 2].map(i => `<input type="number" step="0.1" min="0.3" max="3" id="bd_${k}_${i}" value="${b[k][i]}">`).join('') + '</div>').join('');
}
function readBody() {
  const o = {};
  BODY_KEYS.forEach(k => { o[k] = [0, 1, 2].map(i => parseFloat(byId('bd_' + k + '_' + i).value)); });
  return Packs.cleanBody(o);
}
function setBodyInputs(b) { BODY_KEYS.forEach(k => [0, 1, 2].forEach(i => { byId('bd_' + k + '_' + i).value = b[k][i]; })); }

function adminPack(id) {
  if (!Auth.isAdmin()) return;
  const ex = id ? DB.get('packs', []).find(p => p.id === id) : null;
  const an = ex ? ex.anims : Packs.template('classic');
  const body = Packs.cleanBody(ex ? ex.body : null);
  modal(ex ? 'Edit pack' : 'New pack', `
    <input id="pkN" maxlength="24" placeholder="Pack name" value="${esc(ex ? ex.name : '')}">
    <input id="pkP" type="number" min="0" placeholder="Price" value="${ex ? ex.price : 0}">
    <div style="text-align:center"><canvas id="pkc" width="240" height="300"></canvas></div>
    <select id="pkS">${ANIM_STATES.map(s => `<option>${s}</option>`).join('')}</select>
    <label class="lbl">Body shape: scale X, Y, Z per part (0.3 - 3)</label>
    ${bodyGrid(body)}
    <label class="lbl">Animations (JSON)</label>
    <textarea id="pkJ" class="code" rows="8" spellcheck="false" autocapitalize="off">${esc(JSON.stringify(an, null, 1))}</textarea>
    <p class="muted">Anim format: joint → axis → [base°, amplitude°, phase]. Tap Preview to apply both to the avatar above.</p>`, [
    { label: '👁 Preview', fn: () => { packPreview(); return false; } },
    { label: 'Template: Zombie anims', cls: 'gray', fn: () => { byId('pkJ').value = JSON.stringify(Packs.template('zombie'), null, 1); packPreview(); return false; } },
    { label: 'Template: Chibi body', cls: 'gray', fn: () => { setBodyInputs(Packs.bodyTemplate('chibi')); packPreview(); return false; } },
    { label: 'Template: Giant body', cls: 'gray', fn: () => { setBodyInputs(Packs.bodyTemplate('giant')); packPreview(); return false; } },
    { label: 'Reset body', cls: 'gray', fn: () => { setBodyInputs(Packs.cleanBody(null)); packPreview(); return false; } },
    {
      label: '💾 Save', fn: () => {
        let a;
        try { a = JSON.parse(byId('pkJ').value); } catch (e) { toast('Invalid JSON'); return false; }
        const err = Packs.save({ id: ex ? ex.id : uid(), name: byId('pkN').value, price: byId('pkP').value, anims: a, body: readBody() });
        if (err) { toast(err); return false; }
        AvatarView.stop(); toast('Pack saved'); render();
      }
    },
    { label: 'Close', cls: 'gray', fn: () => AvatarView.stop() }]);
  AvatarView.start(byId('pkc'), DEFAULT_COLORS, [], null, { anims: Packs.clean(an), body }, DEF_FACE);
  byId('pkS').onchange = e => { AvatarView.state = e.target.value; };
}
function packPreview() {
  try {
    AvatarView.av.setPack({ anims: Packs.clean(JSON.parse(byId('pkJ').value)), body: readBody() });
  } catch (e) { toast('Invalid JSON'); }
}
function adminPackDel(id) {
  uiConfirm('Delete this pack? Players who own it will fall back to Classic.', () => { Packs.remove(id); render(); }, 'Delete');
}

/* ----- official face editor (owner only) ----- */
function adminFace(id) {
  if (!Auth.isAdmin()) return;
  const ex = id ? DB.get('faces', []).find(f => f.id === id) : null;
  const sp = ex ? ex.spec : DEF_FACE;
  modal(ex ? 'Edit face' : 'New face', `
    <input id="fcN" maxlength="24" placeholder="Face name" value="${esc(ex ? ex.name : '')}">
    <input id="fcP" type="number" min="0" placeholder="Price" value="${ex ? ex.price : 0}">
    <div style="text-align:center"><canvas id="fcc" width="240" height="300"></canvas></div>
    <label class="lbl">Eyes</label><select id="fcE">${FACE_EYES.map(e => `<option ${e === sp.eye ? 'selected' : ''}>${e}</option>`).join('')}</select>
    <label class="lbl">Mouth</label><select id="fcM">${FACE_MOUTHS.map(e => `<option ${e === sp.mouth ? 'selected' : ''}>${e}</option>`).join('')}</select>
    <label class="lbl">Line color</label><input type="color" id="fcI" value="${sp.ink}">
    <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="fcB" ${sp.brow ? 'checked' : ''}> Eyebrows</label>
    <label class="lbl" style="display:flex;align-items:center"><input type="checkbox" id="fcK" ${sp.blush ? 'checked' : ''}> Blush</label>`, [
    {
      label: '💾 Save', fn: () => {
        const err = Faces.save({ id: ex ? ex.id : uid(), name: byId('fcN').value, price: byId('fcP').value, spec: readFace() });
        if (err) { toast(err); return false; }
        AvatarView.stop(); toast('Face saved'); render();
      }
    },
    { label: 'Close', cls: 'gray', fn: () => AvatarView.stop() }]);
  AvatarView.start(byId('fcc'), DEFAULT_COLORS, [], null, null, Faces.clean(sp));
  ['fcE', 'fcM', 'fcI', 'fcB', 'fcK'].forEach(i => byId(i).addEventListener('change', () => AvatarView.av.setFace(readFace())));
}
function readFace() {
  return Faces.clean({ eye: byId('fcE').value, mouth: byId('fcM').value, ink: byId('fcI').value, brow: byId('fcB').checked, blush: byId('fcK').checked });
}
function adminFaceDel(id) {
  uiConfirm('Delete this face?', () => { Faces.remove(id); render(); }, 'Delete');
}

/* ----- top-up, games, users ----- */
function adminVoucher() {
  const k = $('#tu').value.trim().toLowerCase(), a = Math.floor(+$('#ta').value);
  if (!/^[a-z0-9_]{3,20}$/.test(k)) return toast('Enter a valid username');
  if (!(a > 0) || a > 10000000) return toast('Enter a valid amount');
  showText('Voucher code', 'Send this to ' + k + '. It only works for that account and only once.', Voucher.make(k, a));
}
function adminGrant() {
  const k = $('#tu').value.trim().toLowerCase(), a = Math.floor(+$('#ta').value);
  if (!(a > 0)) return toast('Enter a valid amount');
  if (!Wallet.add(k, a)) return toast('That user is not on this device');
  toast('Granted ' + a + ' ' + GV); render();
}
function adminRemoveGame(id) {
  uiConfirm('Delete this game permanently? (Use Takedown to keep it recoverable.)', () => {
    DB.set('games', DB.games().filter(g => g.id !== id));
    GameData.del(id);
    render();
  }, 'Delete');
}
function adminBan(k) {
  const u = DB.users()[k]; if (!u) return;
  modal('Ban ' + u.name, `<input id="bnR" maxlength="80" placeholder="Reason (e.g. Exploiting)">
    <label class="lbl">Duration</label>
    <select id="bnD"><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="0">Permanent</option></select>`, [
    {
      label: 'Ban', cls: 'red', fn: () => {
        Auth.ban(k, byId('bnR').value.trim() || 'Violation', +byId('bnD').value);
        toast(u.name + ' banned'); render();
      }
    },
    { label: 'Cancel', cls: 'gray' }]);
}
function adminUnban(k) { Auth.unban(k); render(); }
function adminBanName(name) {
  const k = Object.keys(DB.users()).find(x => DB.users()[x].name.toLowerCase() === String(name).toLowerCase());
  if (!k) return toast('That player has no account on this device');
  adminBan(k);
}
function adminDismiss(id) { DB.set('reports', DB.reports().filter(r => r.id !== id)); render(); }

render();