/* =====================================================
   BOOT CHECK: reports missing files / unsupported device,
   and keeps one broken page from blanking the whole app.
   ===================================================== */
(function () {
  const need = [
    ['THREE', 'three.min.js (needs internet, or use a local copy)'],
    ['DB', 'data.js'], ['Ui', 'ui.js'], ['Tree', 'tree.js'], ['Mats', 'render.js'],
    ['makeAvatar', 'avatar.js'], ['Packs', 'wear.js'], ['ScriptHost', 'gscript.js'], ['Net', 'net.js'],
    ['Game', 'game.js'], ['Game.netSnapshot', 'gx.js'], ['Studio', 'studio.js'], ['St', 'stui.js'],
    ['render', 'app.js'], ['Play', 'play.js']
  ];
  const missing = [];
  need.forEach(n => {
    let ok = true;
    try { ok = eval('typeof ' + n[0]) !== 'undefined'; } catch (e) { ok = false; }
    if (!ok) missing.push(n[1]);
  });

  let msg = '';
  if (missing.length) msg += 'These files are missing or failed to load:\n\n- ' + missing.join('\n- ') + '\n\n';
  if (typeof Peer === 'undefined') msg += 'Multiplayer library (PeerJS) did not load. Games will run offline.\n';
  try {
    const c = document.createElement('canvas');
    if (!(c.getContext('webgl') || c.getContext('experimental-webgl'))) msg += 'WebGL is not available on this device/browser.\n';
  } catch (e) { msg += 'WebGL check failed.\n'; }

  if (msg && window.dbgShow) window.dbgShow('BOOT CHECK\n\n' + msg);

  // a failing page should show a message, not a blank screen
  if (typeof render === 'function') {
    const orig = render;
    window.render = function () {
      try { orig(); }
      catch (e) {
        console.error(e);
        if (window.dbgShow) window.dbgShow('render(): ' + (e && (e.stack || e.message) || e));
        const m = document.getElementById('main');
        if (m && !m.innerHTML.trim()) m.innerHTML = '<div class="card"><h3>This page failed to load</h3><p class="muted">' +
          String(e && e.message || e).replace(/</g, '&lt;') + '</p></div>';
      }
    };
  }
})();