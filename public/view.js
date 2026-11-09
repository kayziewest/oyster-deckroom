(() => {
  const slug = location.pathname.split('/').filter(Boolean).pop();
  const api = (p, opt = {}) => fetch(`/api/v/${slug}${p}`, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...opt })
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Error'), { status: r.status }); return j; });
  const $ = (id) => document.getElementById(id);
  const show = (el, on = true) => { el.hidden = !on; };
  let meta, content, sessionId, doc, page = 1, atEnd = false;

  // ---------- gate ----------
  async function boot() {
    try { meta = await api('/meta'); } catch (e) { show($('gone')); return; }
    document.title = `${meta.title} · ${meta.brand}`;
    if (meta.granted) return startViewer();
    if (!meta.gate.email && !meta.gate.password) { await api('/anon', { method: 'POST' }); return startViewer(); }
    $('gTitle').textContent = /[.!?]$/.test(meta.title) ? meta.title : meta.title + '.';
    $('gEyebrow').textContent = meta.investorName ? `Shared with ${meta.investorName}` : `Shared by ${meta.sender}`;
    $('gSub').textContent = meta.message || (meta.gate.email ? `${meta.sender} at ${meta.brand} shared this with you. Add your email to open it.` : 'Enter the password to open it.');
    show($('fEmail'), meta.gate.email); show($('fName'), meta.gate.email); show($('fPass'), meta.gate.password);
    if (meta.prefillEmail) $('gForm').email.value = meta.prefillEmail;
    if (meta.gate.verify) $('gBtn').textContent = 'Send Me a Code';
    document.querySelector('.modal-card .sub').textContent = `Goes straight to ${meta.sender}'s inbox, tagged with this slide.`;
    show($('gate'));
  }
  $('gForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('gErr').textContent = '';
    const f = e.target; const b = { email: f.email.value, name: f.name.value, password: f.password.value };
    try {
      const r = await api('/access', { method: 'POST', body: JSON.stringify(b) });
      if (r.verify) {
        $('oEmail').textContent = b.email; show(f, false); show($('oForm'));
        $('oDev').textContent = r.devCode ? `Dev mode (no SMTP): code is ${r.devCode}` : '';
        $('oForm').code.focus();
      } else { show($('gate'), false); startViewer(); }
    } catch (err) { $('gErr').textContent = err.message; }
  });
  $('oForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('oErr').textContent = '';
    try {
      await api('/verify', { method: 'POST', body: JSON.stringify({ email: $('gForm').email.value, code: e.target.code.value }) });
      show($('gate'), false); startViewer();
    } catch (err) { $('oErr').textContent = err.message; }
  });
  $('oBack').onclick = () => { show($('oForm'), false); show($('gForm')); };

  // ---------- viewer ----------
  async function startViewer() {
    try { content = await api('/content'); } catch (e) { if (e.status === 401) { show($('viewer'), false); return boot(); } show($('gone')); return; }
    if (!content.docs.length) { show($('gone')); return; }
    show($('viewer'));
    if (meta) document.querySelector('.modal-card .sub').textContent = `Goes straight to ${meta.sender}'s inbox, tagged with this slide.`;
    if (content.docs.length > 1) {
      const s = $('docSel'); s.innerHTML = content.docs.map((d) => `<option value="${d.id}">${d.name.replace(/</g, '&lt;')}</option>`).join(''); show(s);
      s.onchange = () => { flush(); openDoc(content.docs.find((d) => d.id === s.value)); };
    }
    if (content.cta) { $('ctaBtn').href = content.cta.url; $('ctaLabel').textContent = content.cta.label; show($('ctaBtn')); }
    const r = await api('/session', { method: 'POST', body: JSON.stringify({ referrer: document.referrer }) });
    sessionId = r.sessionId;
    openDoc(content.docs[0]);
    setInterval(tick, 1000); setInterval(flush, 8000);
  }
  function openDoc(d) {
    doc = d; page = 1; atEnd = false;
    $('vTitle').textContent = d.name; document.title = d.name;
    if (content.allowDownload) { $('dlBtn').href = `/api/v/${slug}/doc/${d.id}/download`; show($('dlBtn')); }
    fit(); render();
  }
  const src = (n) => `/api/v/${slug}/doc/${doc.id}/page/${n}?v=${doc.version}`;
  const cache = {};
  function preload(n) { if (n >= 1 && n <= doc.pages && !cache[doc.id + n]) { const i = new Image(); i.src = src(n); cache[doc.id + n] = i; } }
  function render() {
    show($('end'), atEnd); show($('slide'), !atEnd);
    const img = $('img');
    if (!atEnd) {
      img.classList.remove('on'); show($('spin'));
      img.onload = () => { img.classList.add('on'); show($('spin'), false); };
      img.src = src(page);
      preload(page + 1); preload(page + 2); preload(page - 1);
    }
    $('counter').textContent = atEnd ? `End · ${doc.pages} slides` : `${page} / ${doc.pages}`;
    $('prog').style.width = `${(atEnd ? 1 : page / doc.pages) * 100}%`;
    $('prev').disabled = page === 1 && !atEnd;
    $('next').disabled = atEnd;
    $('askPage').textContent = atEnd ? doc.pages : page;
  }
  function go(d) {
    if (!doc) return;
    if (atEnd && d < 0) { atEnd = false; return render(); }
    const n = page + d;
    if (n > doc.pages) { atEnd = true; return render(); }
    if (n < 1) return;
    page = n; render();
  }
  function fit() {
    if (!doc) return;
    const st = $('stage'), cs = getComputedStyle(st);
    const W = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const r = doc.ratio || 0.5625;
    let w = Math.max(W, 120), h = w * r; if (H > 60 && h > H) { h = H; w = H / r; }
    Object.assign($('slide').style, { width: w + 'px', height: h + 'px', aspectRatio: 'auto' });
  }
  addEventListener('resize', fit);
  $('prev').onclick = () => go(-1); $('next').onclick = () => go(1);
  $('restart').onclick = () => { atEnd = false; page = 1; render(); };
  addEventListener('keydown', (e) => {
    if (!$('ask').hidden || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1); }
  });
  let tx = null;
  $('stage').addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  $('stage').addEventListener('touchend', (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); tx = null; });
  $('slide').querySelector('.shield').addEventListener('click', (e) => { const r = $('slide').getBoundingClientRect(); go(e.clientX - r.left > r.width * 0.3 ? 1 : -1); });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  $('fsBtn').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); };
  document.addEventListener('fullscreenchange', () => setTimeout(fit, 50));

  // ---------- tracking: time on each slide while the tab is visible and the viewer is active ----------
  const buf = {}; let lastTick = performance.now(), lastInput = Date.now();
  ['mousemove', 'keydown', 'touchstart', 'wheel', 'click'].forEach((ev) => addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true }));
  function tick() {
    const t = performance.now(), dt = Math.min(t - lastTick, 5000); lastTick = t;
    if (!doc || atEnd || document.visibilityState !== 'visible' || Date.now() - lastInput > 120000 || !$('img').classList.contains('on')) return;
    const k = doc.id + ':' + page; buf[k] = (buf[k] || 0) + dt;
  }
  function items() {
    const out = Object.entries(buf).filter(([, ms]) => ms > 0).map(([k, ms]) => { const [d, p] = k.split(':'); return { doc: d, page: +p, ms: Math.round(ms) }; });
    for (const k in buf) delete buf[k];
    return out;
  }
  function flush(beacon) {
    if (!sessionId) return;
    tick(); const it = items(); if (!it.length) return;
    const body = JSON.stringify({ sessionId, items: it });
    if (beacon && navigator.sendBeacon) navigator.sendBeacon(`/api/v/${slug}/track`, new Blob([body], { type: 'text/plain' }));
    else fetch(`/api/v/${slug}/track`, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); else lastTick = performance.now(); });
  addEventListener('pagehide', () => flush(true));

  // ---------- questions + CTA ----------
  const openAsk = () => { $('askForm').reset(); show($('askOk'), false); show($('ask')); $('askForm').body.focus(); };
  $('askBtn').onclick = openAsk; $('endAsk').onclick = openAsk;
  $('askCancel').onclick = () => show($('ask'), false);
  $('ask').addEventListener('click', (e) => { if (e.target.id === 'ask') show($('ask'), false); });
  $('askForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/message', { method: 'POST', body: JSON.stringify({ body: e.target.body.value, doc: doc.id, page: atEnd ? doc.pages : page }) });
    show($('askOk')); setTimeout(() => show($('ask'), false), 1400);
  });
  $('ctaBtn').addEventListener('click', () => { api('/cta', { method: 'POST' }).catch(() => {}); });

  boot();
})();
