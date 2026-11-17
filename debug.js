/* =====================================================
   DEBUG: shows JavaScript errors on screen so bugs can be found.
   Tap the red bar to hide it.
   Script load failures that the loader retries are not shown.
   ===================================================== */
(function () {
  const log = [];
  let bar = null;

  function ui() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:45vh;overflow:auto;z-index:99999;' +
      'background:#3a0000;color:#fff;font:12px monospace;padding:8px;white-space:pre-wrap;display:none;word-break:break-all';
    bar.onclick = () => { bar.style.display = 'none'; };
    (document.body || document.documentElement).appendChild(bar);
    return bar;
  }

  function show(msg) {
    msg = String(msg).slice(0, 700);
    if (log[log.length - 1] === msg) return;
    log.push(msg);
    if (log.length > 5) log.shift();
    const b = ui();
    b.style.display = 'block';
    b.textContent = 'ERROR (tap to hide)\n\n' + log.join('\n\n----\n\n');
  }

  window.addEventListener('error', e => {
    const t = e.target;
    if (t && t !== window && t.tagName) {
      if (t.dataset && t.dataset.rt) return; // the loader retries these itself
      show('FILE NOT LOADED: ' + (t.src || t.href || t.tagName));
      return;
    }
    const f = String(e.filename || '').split('/').pop();
    show((e.message || 'Error') + (f ? '\n@ ' + f + ':' + e.lineno + ':' + e.colno : ''));
  }, true);

  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    show('Promise error: ' + ((r && (r.stack || r.message)) || r));
  });

  window.dbgShow = show;
})();