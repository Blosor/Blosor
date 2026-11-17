/* =====================================================
   CUSTOM UI: toast, dialogs and custom widgets.
   Ui.enhance(root) replaces the browser's own dropdown, color picker
   and date picker with Blosor widgets. The original element stays
   hidden and keeps the value, so the rest of the code just works.
   ===================================================== */
const PAL = ['#f5cd30', '#13a538', '#0d69ac', '#c4281c', '#da8541', '#e8bb70', '#7c5c46', '#a3a2a5',
  '#e5e4df', '#ffffff', '#1b2a35', '#000000', '#6d6e6c', '#9fc3e9', '#a1c48c', '#cbe0ff',
  '#ff98dc', '#f9d62e', '#8d6e63', '#2ee66b', '#ff5a00', '#2e86de', '#b5651d', '#8e24aa'];

const Ui = {
  sheet(html) {
    const s = document.createElement('div');
    s.className = 'sheet';
    s.innerHTML = '<div class="sheetBox"></div>';
    s.firstChild.innerHTML = html;
    s.onclick = e => { if (e.target === s) Ui.close(s); };
    document.body.appendChild(s);
    return s;
  },
  close(s) { if (s.onclose) { const f = s.onclose; s.onclose = null; f(); } s.remove(); },

  hsv(x) {
    x = /^#[0-9a-f]{6}$/i.test(x) ? x : '#ffffff';
    const r = parseInt(x.slice(1, 3), 16) / 255, g = parseInt(x.slice(3, 5), 16) / 255, b = parseInt(x.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, mx ? d / mx : 0, mx];
  },
  hex(h, s, v) {
    const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    const t = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return '#' + t(f(5)) + t(f(3)) + t(f(1));
  },

  enhance(root) {
    root = root || document;
    root.querySelectorAll('select:not([data-ui])').forEach(e => Ui.select(e));
    root.querySelectorAll('input[type=color]:not([data-ui])').forEach(e => Ui.color(e));
    root.querySelectorAll('input[type=date]:not([data-ui])').forEach(e => Ui.date(e));
  },

  /* ----- dropdown ----- */
  select(el) {
    el.dataset.ui = 1;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ddb ' + el.className;
    el.style.display = 'none'; el.after(b);
    const sync = () => { const o = el.options[el.selectedIndex]; b.textContent = (o ? o.textContent : '') + '  ▾'; };
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(el, 'value', { get() { return d.get.call(this); }, set(v) { d.set.call(this, v); sync(); }, configurable: true });
    b.onclick = () => {
      const sh = Ui.sheet(''), box = sh.firstChild;
      [...el.options].forEach(o => {
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'opt' + (o.value === el.value ? ' on' : ''); x.textContent = o.textContent;
        x.onclick = () => { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); Ui.close(sh); };
        box.appendChild(x);
      });
    };
    sync();
  },

  /* ----- color picker ----- */
  color(el) {
    el.dataset.ui = 1;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swb ' + el.className;
    el.style.display = 'none'; el.after(b);
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const sync = () => { b.style.background = d.get.call(el); };
    Object.defineProperty(el, 'value', { get() { return d.get.call(this); }, set(v) { d.set.call(this, v); sync(); }, configurable: true });
    b.onclick = () => Ui.picker(el);
    sync();
  },
  picker(el) {
    let hsv = Ui.hsv(el.value), h = hsv[0], s = hsv[1], v = hsv[2];
    const sh = Ui.sheet('<h3 style="margin-bottom:6px">Color</h3>' +
      '<div class="pkc" id="pkSV"><canvas width="240" height="150"></canvas><i class="dot"></i></div>' +
      '<div class="pkc" id="pkH"><canvas width="240" height="22"></canvas><i class="dot"></i></div>' +
      '<div class="pal">' + PAL.map(c => '<i data-c="' + c + '" style="background:' + c + '"></i>').join('') + '</div>' +
      '<input id="pkX" maxlength="7"><button id="pkOk">OK</button>');
    const q = x => sh.querySelector(x);
    const svc = q('#pkSV canvas'), hc = q('#pkH canvas'), dsv = q('#pkSV .dot'), dh = q('#pkH .dot'), hex = q('#pkX');
    const g1 = hc.getContext('2d'), gr = g1.createLinearGradient(0, 0, 240, 0);
    for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, 'hsl(' + (i * 60) + ',100%,50%)');
    g1.fillStyle = gr; g1.fillRect(0, 0, 240, 22);
    const drawSV = () => {
      const c = svc.getContext('2d');
      c.fillStyle = 'hsl(' + h + ',100%,50%)'; c.fillRect(0, 0, 240, 150);
      let a = c.createLinearGradient(0, 0, 240, 0); a.addColorStop(0, '#fff'); a.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = a; c.fillRect(0, 0, 240, 150);
      a = c.createLinearGradient(0, 0, 0, 150); a.addColorStop(0, 'rgba(0,0,0,0)'); a.addColorStop(1, '#000');
      c.fillStyle = a; c.fillRect(0, 0, 240, 150);
    };
    const upd = () => {
      dsv.style.left = (s * 100) + '%'; dsv.style.top = ((1 - v) * 100) + '%';
      dh.style.left = (h / 360 * 100) + '%'; dh.style.top = '50%';
      hex.value = Ui.hex(h, s, v);
    };
    const fire = t => { el.value = Ui.hex(h, s, v); el.dispatchEvent(new Event(t, { bubbles: true })); };
    const drag = (box, fn) => {
      let on = false;
      const mv = e => { const r = box.getBoundingClientRect(); fn(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)); };
      box.onpointerdown = e => { on = true; try { box.setPointerCapture(e.pointerId); } catch (_) {} mv(e); };
      box.onpointermove = e => { if (on) mv(e); };
      box.onpointerup = box.onpointercancel = () => { on = false; };
    };
    drag(q('#pkSV'), (x, y) => { s = x; v = 1 - y; upd(); fire('input'); });
    drag(q('#pkH'), x => { h = x * 359.9; drawSV(); upd(); fire('input'); });
    const setHex = c => { const a = Ui.hsv(c); h = a[0]; s = a[1]; v = a[2]; drawSV(); upd(); fire('input'); };
    sh.querySelectorAll('.pal i').forEach(i => { i.onclick = () => setHex(i.dataset.c); });
    hex.onchange = () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) setHex(hex.value); };
    q('#pkOk').onclick = () => Ui.close(sh);
    sh.onclose = () => el.dispatchEvent(new Event('change', { bubbles: true }));
    drawSV(); upd();
  },

  /* ----- date of birth: DD / MM / YYYY ----- */
  date(el) {
    el.dataset.ui = 1; el.style.display = 'none';
    const w = document.createElement('div');
    w.className = 'dob';
    w.innerHTML = '<input inputmode="numeric" maxlength="2" placeholder="DD"><input inputmode="numeric" maxlength="2" placeholder="MM"><input inputmode="numeric" maxlength="4" placeholder="YYYY">';
    el.after(w);
    const f = w.querySelectorAll('input');
    const upd = () => {
      const D = +f[0].value, M = +f[1].value, Y = +f[2].value;
      const ok = D >= 1 && D <= 31 && M >= 1 && M <= 12 && Y >= 1900 && f[2].value.length === 4;
      el.value = ok ? Y + '-' + String(M).padStart(2, '0') + '-' + String(D).padStart(2, '0') : '';
    };
    f.forEach(i => { i.oninput = () => { i.value = i.value.replace(/\D/g, ''); upd(); }; });
  }
};

/* =====================================================
   TOAST + MODAL DIALOGS
   ===================================================== */
function toast(msg) {
  const t = byId('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), 2600);
}

// buttons: [{label, cls, fn}]. If fn returns false the dialog stays open.
function modal(title, body, buttons) {
  const tok = ++modal.n;
  byId('mTitle').textContent = title;
  byId('mBody').innerHTML = body;
  Ui.enhance(byId('mBody'));
  const bx = byId('mBtns'); bx.innerHTML = '';
  (buttons || [{ label: 'OK' }]).forEach(b => {
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b.cls) el.className = b.cls;
    el.onclick = () => {
      const r = b.fn ? b.fn() : undefined;
      if (r !== false && modal.n === tok) closeModal(); // a new dialog opened by fn stays open
    };
    bx.appendChild(el);
  });
  byId('modal').classList.remove('hidden');
}
modal.n = 0;
function closeModal() { byId('modal').classList.add('hidden'); byId('mBody').innerHTML = ''; }

const uiAlert = (msg, fn) => modal('Notice', '<p>' + esc(msg) + '</p>', [{ label: 'OK', fn }]);
const uiConfirm = (msg, yes, label, cls) =>
  modal('Confirm', '<p>' + esc(msg) + '</p>', [{ label: label || 'Yes', cls: cls || 'red', fn: yes }, { label: 'Cancel', cls: 'gray' }]);
function uiPrompt(title, val, fn, max) {
  modal(title, '<input id="mi" maxlength="' + (max || 40) + '" value="' + esc(val || '') + '">',
    [{ label: 'OK', fn: () => fn(byId('mi').value) }, { label: 'Cancel', cls: 'gray' }]);
  setTimeout(() => { const i = byId('mi'); if (i) i.focus(); }, 60);
}
function showText(title, hint, text) {
  modal(title, '<p class="muted">' + esc(hint) + '</p><textarea id="mt" rows="5" readonly>' + esc(text) + '</textarea>', [
    {
      label: 'Copy', fn: () => {
        const t = byId('mt'); t.focus(); t.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
        toast(ok || navigator.clipboard ? 'Copied' : 'Select the text and copy it manually');
        return false;
      }
    },
    { label: 'Close', cls: 'gray' }]);
}