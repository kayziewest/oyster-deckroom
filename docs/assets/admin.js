(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5.5 1 1.5 2 2 2 2S10 6 12 3z"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>', upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4M5 20h14"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/>', download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>', forward: '<path d="m15 5 6 6-6 6"/><path d="M21 11H9a5 5 0 0 0-5 5v3"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', return: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  };
  const icon = (n) => `<i data-i="${n}"><svg viewBox="0 0 24 24">${ICONS[n] || ''}</svg></i>`;
  const hydrateIcons = (root = document) => $$('i[data-i]', root).forEach((el) => { if (!el.innerHTML) el.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[el.dataset.i] || ''}</svg>`; });
  const API = (window.DECKROOM_API || '').replace(/\/$/, '');
  const tok = { get() { try { return localStorage.getItem('dr_admin'); } catch { return null; } }, set(v) { try { v ? localStorage.setItem('dr_admin', v) : localStorage.removeItem('dr_admin'); } catch {} } };
  const api = async (p, opt = {}) => {
    const r = await fetch(API + '/admin' + p, { headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (tok.get() || '') }, ...opt });
    if (r.status === 401) { showLogin(); throw new Error('auth'); }
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Error'); return j;
  };
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 2200); };
  const dur = (ms) => { const s = Math.round((ms || 0) / 1000); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`; return `${Math.floor(m / 60)}h ${m % 60}m`; };
  const ago = (t) => { if (!t) return 'never'; const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; if (s < 604800) return Math.floor(s / 86400) + 'd ago'; return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
  const pct = (x) => Math.round((x || 0) * 100) + '%';
  const initials = (s) => (s || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('') || '?';
  const avColors = [['#EBCFBE', '#B0451A'], ['#CFDEE8', '#2C6E8F'], ['#CDE0D3', '#3E7C5A'], ['#E6BE9E', '#8a3a12'], ['#DCBFC8', '#8A3F4E'], ['#E4CD97', '#7a570c']];
  const av = (s) => { let h = 0; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) >>> 0; const [b, f] = avColors[h % avColors.length]; return `<span class="av" style="background:${b};color:${f}">${esc(initials(s))}</span>`; };
  const STAGES = ['Shared', 'Viewed', 'Engaged', 'Meeting', 'Proposal', 'Due diligence', 'Won', 'Committed', 'Lost', 'Passed'];
  const isOwner = () => ME && ME.user && ME.user.role === 'owner';
  const ownerChip = (name, mine) => (isOwner() && name && !mine ? `<span class="chip off">${esc(name.split(' ')[0])}</span>` : '');
  const thumb = (doc, n) => { const d = DOCS.find((x) => x.id === doc); return (d && d.thumbs && d.thumbs[n - 1]) || ''; };
  const heatChip = (v) => `<span class="chip ${v.heat}">${v.heat === 'hot' ? icon('flame') : ''}${v.heat[0].toUpperCase() + v.heat.slice(1)} · ${v.score}</span>`;
  let ME = null;

  // ---------- auth ----------
  function showLogin() { $('#shell').hidden = true; $('#login').hidden = false; }
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    let r; try { r = await fetch(API + '/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e.target.email.value, password: e.target.password.value }) }); } catch { $('#loginErr').textContent = 'Cannot reach the server. Check config.js'; return; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $('#loginErr').textContent = j.error || 'Wrong email or password'; return; }
    tok.set(j.token);
    start();
  };
  $('#logout').onclick = () => { tok.set(null); showLogin(); };
  async function start() {
    try { [ME] = await Promise.all([api('/me'), loadDocs()]); } catch { return; }
    $('#login').hidden = true; $('#shell').hidden = false;
    $('#navTeam').hidden = !isOwner();
    $('#meName').textContent = ME.user.name || ME.user.email; $('#meRole').textContent = isOwner() ? 'Owner' : (ME.user.title || 'Team');
    $('#meAv').outerHTML = av(ME.user.email).replace('class="av"', 'class="av" id="meAv"');
    hydrateIcons(); route(); refreshMsgCount();
  }
  async function refreshMsgCount() { try { const m = await api('/messages'); const n = m.filter((x) => Date.now() - x.created_at < 7 * 864e5).length; $('#msgCount').textContent = n || ''; } catch {} }

  // ---------- router ----------
  addEventListener('hashchange', route);
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [r, arg] = h.split('/');
    const key = r || 'overview';
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === key || (key === 'visitor' && a.dataset.r === 'investors') || (key === 'profile' && a.dataset.r === 'settings') || (key === 'link' && a.dataset.r === 'links')));
    const old = $('#main'); const m = old.cloneNode(false); old.replaceWith(m); m.innerHTML = '<div class="empty">Loading…</div>';
    const views = { overview, investors, visitor: () => visitor(arg), links, link: () => linkView(arg), docs, messages, settings, team };
    (views[key] || overview)().then(() => hydrateIcons(m)).catch((e) => { if (e.message !== 'auth') m.innerHTML = `<div class="empty"><b>Something went wrong</b>${esc(e.message)}</div>`; });
    scrollTo(0, 0);
  }
  $('#newLinkSide').onclick = () => linkForm();

  // ---------- charts ----------
  function slideChart(deck) {
    const pages = deck.pages; const n = pages.length; if (!n) return '';
    const W = 760, H = 220, pad = { l: 36, r: 36, t: 14, b: 28 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, bw = iw / n;
    const max = Math.max(5000, ...pages.map((p) => p.avg));
    const yt = [0, max / 2, max];
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average time per slide">`;
    yt.forEach((v) => { const y = pad.t + ih - (v / max) * ih; s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="rgba(80,50,25,.10)"/><text x="${pad.l - 6}" y="${y + 4}" text-anchor="end">${dur(v)}</text>`; });
    [0, 0.5, 1].forEach((v) => { const y = pad.t + ih - v * ih; s += `<text x="${W - pad.r + 6}" y="${y + 4}">${v * 100}%</text>`; });
    const topAvg = Math.max(...pages.map((p) => p.avg));
    pages.forEach((p, i) => {
      const h = (p.avg / max) * ih; const x = pad.l + i * bw + bw * 0.18; const w = bw * 0.64;
      s += `<rect x="${x}" y="${pad.t + ih - h}" width="${w}" height="${Math.max(h, 1)}" rx="3" fill="${p.avg === topAvg && p.avg > 0 ? '#C0501E' : '#F6DFA0'}"><title>Slide ${p.page}: ${dur(p.avg)} avg, ${pct(p.reach)} reached</title></rect>`;
      s += `<text x="${pad.l + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${p.page}</text>`;
    });
    const pts = pages.map((p, i) => `${pad.l + i * bw + bw / 2},${pad.t + ih - p.reach * ih}`).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="#3A2113" stroke-width="2" stroke-linejoin="round"/>`;
    pages.forEach((p, i) => { s += `<circle cx="${pad.l + i * bw + bw / 2}" cy="${pad.t + ih - p.reach * ih}" r="3" fill="#FBF6EC" stroke="#3A2113" stroke-width="1.6"/>`; });
    return s + '</svg><div class="legend"><span><i style="background:#F6DFA0"></i>Avg time on slide</span><span><i style="background:#C0501E"></i>Most time</span><span><i style="background:#3A2113"></i>Viewers who reached the slide</span></div>';
  }
  function slideGrid(deck, docId) {
    const max = Math.max(1, ...deck.pages.map((p) => p.avg));
    const top = new Set(deck.pages.slice().sort((a, b) => b.avg - a.avg).filter((p) => p.avg > 0).slice(0, 3).map((p) => p.page));
    return `<div class="slides">${deck.pages.map((p) => {
      const a = p.avg / max; const col = `rgba(192,80,30,${0.15 + a * 0.85})`;
      return `<div class="sl ${top.has(p.page) ? 'top' : ''}" data-pv="${docId}" data-p="${p.page}"><span class="heat" style="background:${p.avg ? col : 'transparent'}"></span><span class="n">${p.page}</span><img loading="lazy" src="${thumb(docId, p.page)}"><div class="m"><b>${dur(p.avg)}</b><span>${pct(p.reach)} reached</span></div></div>`;
    }).join('')}</div>`;
  }
  function daysChart(days) {
    const map = Object.fromEntries(days.map((d) => [d.d, d]));
    const arr = []; for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); arr.push({ d, n: map[d]?.n || 0 }); }
    const W = 760, H = 120, max = Math.max(3, ...arr.map((a) => a.n)), bw = W / arr.length;
    return `<svg class="chart" viewBox="0 0 ${W} ${H + 18}">${arr.map((a, i) => `<rect x="${i * bw + 2}" y="${H - (a.n / max) * H}" width="${bw - 4}" height="${Math.max((a.n / max) * H, a.n ? 2 : 1)}" rx="2" fill="${a.n ? '#C98A6B' : 'rgba(80,50,25,.08)'}"><title>${a.d}: ${a.n} views</title></rect>`).join('')}<text x="0" y="${H + 14}">${arr[0].d.slice(5)}</text><text x="${W}" y="${H + 14}" text-anchor="end">Today</text></svg>`;
  }
  document.addEventListener('click', (e) => { const el = e.target.closest('[data-pv]'); if (el) preview(el.dataset.pv, +el.dataset.p || 1, el.dataset.stats ? JSON.parse(el.dataset.stats) : null); });

  // ---------- overview ----------
  async function overview() {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const d = await api('/overview' + (q.get('doc') ? `?doc=${q.get('doc')}` : ''));
    const k = d.kpi;
    const evMeta = { open: ['eye', '#CFDEE8', '#2C6E8F', 'opened'], return: ['return', '#E4CD97', '#7a570c', 'came back to'], verified: ['check', '#CDE0D3', '#3E7C5A', 'verified email on'], forwarded: ['forward', '#DCBFC8', '#8A3F4E', 'opened a forwarded link'], download: ['download', '#EBCFBE', '#B0451A', 'downloaded'], message: ['chat', '#EBCFBE', '#B0451A', 'asked a question on'], cta: ['star', '#F1DD93', '#7a570c', 'clicked book a call on'], blocked: ['lock', '#EEE1CF', '#6B4A2F', 'was blocked from'] };
    $('#main').innerHTML = `
      <div class="ph"><div><p class="eyebrow">${isOwner() ? 'Whole team' : 'Your links'}</p><h1>Who is reading your files.</h1></div><div class="acts"><button class="btn ghost" data-export>${icon('download')}Export CSV</button><button class="btn" id="nl">Share a File<span class="arr">↗</span></button></div></div>
      <div class="kpis">
        <div class="kpi t-c"><div class="l">${icon('eye')}Total views</div><div class="v">${k.views}</div><div class="s">${k.links} active links</div></div>
        <div class="kpi t-p"><div class="l">${icon('users')}Unique viewers</div><div class="v">${k.visitors}</div><div class="s">identified by email</div></div>
        <div class="kpi t-f"><div class="l">${icon('clock')}Avg time per viewer</div><div class="v">${dur(k.avgMs)}</div><div class="s">${dur(k.totalMs)} total</div></div>
        <div class="kpi t-i"><div class="l">${icon('check')}Avg completion</div><div class="v">${pct(k.avgCompletion)}</div><div class="s">slides seen</div></div>
        <div class="kpi hotk"><div class="l">${icon('flame')}Hot contacts</div><div class="v">${k.hot}</div><div class="s">score 70+</div></div>
      </div>
      <div class="grid2">
        <div class="stack">
          <div class="card"><h2>Where people spend time. ${d.docs.length > 1 ? `<select class="stage" id="docSwitch">${d.docs.map((x) => `<option value="${x.id}" ${d.deck && x.id === d.deck.doc.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : `<small>${d.deck ? esc(d.deck.doc.name) + ' · ' + d.deck.viewers + ' viewers' : ''}</small>`}</h2>
            ${d.deck ? (d.deck.viewers ? slideChart(d.deck) : '<div class="empty"><b>No views yet</b>Share a link to start collecting slide analytics.</div>') : '<div class="empty"><b>No files yet</b><a href="#/docs">Upload a PDF</a></div>'}
          </div>
          ${d.deck ? `<div class="card"><h2>Slide heatmap. <small>Orange outline marks the top 3 slides</small></h2>${slideGrid(d.deck, d.deck.doc.id)}</div>` : ''}
          <div class="card"><h2>Views, last 30 days.</h2>${daysChart(d.days)}</div>
        </div>
        <div class="stack">
          <div class="card"><h2>Most engaged. <a href="#/investors" class="muted" style="font-size:12px;font-weight:400">All contacts</a></h2>
            ${d.hot.length ? `<div class="feed">${d.hot.map((v) => `<div class="ev"><a href="#/visitor/${v.id}" style="text-decoration:none">${av(v.email || v.name)}</a><div class="t"><a href="#/visitor/${v.id}">${esc(v.investor?.name || v.name || v.email || 'Anonymous')}</a><div class="muted" style="font-size:12px">${esc(v.investor?.firm || v.email)} · ${dur(v.ms)} · ${pct(v.completion)}</div></div>${heatChip(v)}</div>`).join('')}</div>` : '<div class="empty">No viewers yet</div>'}
          </div>
          <div class="card"><h2>Live activity.</h2>
            ${d.events.length ? `<div class="feed">${d.events.map((e) => { const m = evMeta[e.type] || ['eye', '#eee', '#888', e.type]; const meta = JSON.parse(e.meta || '{}'); const where = [meta.city, meta.country].filter(Boolean).join(', ');
              return `<div class="ev"><span class="dot" style="background:${m[1]};color:${m[2]}">${icon(m[0])}</span><div class="t">${e.visitor_id ? `<a href="#/visitor/${e.visitor_id}">${esc(e.name || e.email || meta.email || 'Anonymous')}</a>` : `<b>${esc(meta.email || 'Someone')}</b>`} ${m[3]} <span class="muted">${esc(e.link_name || '')}</span>${e.type === 'message' && meta.page ? ` <span class="muted">(slide ${meta.page})</span>` : ''}${where ? `<div class="muted" style="font-size:12px">${icon('pin')} ${esc(where)}</div>` : ''}</div><span class="w">${ago(e.created_at)}</span></div>`; }).join('')}</div>` : '<div class="empty">Activity shows here in real time.</div>'}
          </div>
        </div>
      </div>`;
    $('#nl').onclick = () => linkForm();
    const ds = $('#docSwitch'); if (ds) ds.onchange = () => { location.hash = '#/?doc=' + ds.value; };
  }

  // ---------- investors ----------
  async function investors() {
    const { visitors, pending } = await api('/visitors');
    const m = $('#main');
    m.innerHTML = `
      <div class="ph"><div><p class="eyebrow">Pipeline</p><h1>Contacts.</h1><p>Investors and clients who opened a link, ranked by engagement.</p></div><div class="acts"><button class="btn ghost" data-export>${icon('download')}Export CSV</button></div></div>
      <div class="filters"><input id="q" placeholder="Search name, email, company"><select id="fh"><option value="">All heat</option><option>hot</option><option>warm</option><option>cold</option></select><select id="fs"><option value="">All stages</option>${STAGES.map((s) => `<option>${s}</option>`).join('')}</select><select id="sort"><option value="last">Last seen</option><option value="score">Engagement</option><option value="ms">Time spent</option></select></div>
      <div class="card"><div class="tw"><table><thead><tr><th>Contact</th><th>Engagement</th><th>Stage</th><th>Time</th><th>Completion</th><th>Visits</th><th>Location</th><th>Last seen</th></tr></thead><tbody id="tb"></tbody></table></div></div>
      ${pending.length ? `<div class="card"><h2>Shared, not opened yet. <small>${pending.length}</small></h2><div class="tw"><table><tbody>${pending.map((p) => `<tr><td><div class="who">${av(p.email)}<div><b>${esc(p.name || p.email)}</b><span>${esc(p.firm || p.email)}</span></div></div></td><td><span class="chip off">Not opened</span></td><td class="muted">${ago(p.updated_at)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    const draw = () => {
      const q = $('#q').value.toLowerCase(), fh = $('#fh').value, fs = $('#fs').value, so = $('#sort').value;
      let rows = visitors.filter((v) => (!q || [v.email, v.name, v.investor?.name, v.investor?.firm].join(' ').toLowerCase().includes(q)) && (!fh || v.heat === fh) && (!fs || v.investor?.stage === fs));
      rows.sort((a, b) => (so === 'score' ? b.score - a.score : so === 'ms' ? b.ms - a.ms : b.last_seen - a.last_seen));
      $('#tb').innerHTML = rows.length ? rows.map((v) => `<tr class="click" data-id="${v.id}">
        <td><div class="who">${av(v.email || v.name)}<div><b>${esc(v.investor?.name || v.name || v.email || 'Anonymous')}${v.forwarded ? ' <span class="chip fw">Forwarded</span>' : ''} ${ownerChip(v.owner_name, v.owner_id === ME.user.id)}</b><span>${esc([v.investor?.firm, v.email].filter(Boolean).join(' · '))}</span></div></div></td>
        <td>${heatChip(v)}</td>
        <td>${v.email ? `<select class="stage" data-e="${esc(v.email)}">${STAGES.map((s) => `<option ${v.investor?.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select>` : '<span class="muted">n/a</span>'}</td>
        <td class="num">${dur(v.ms)}</td><td><div style="display:flex;align-items:center;gap:8px"><div class="bar"><div style="width:${pct(v.completion)}"></div></div><span class="num">${pct(v.completion)}</span></div></td>
        <td class="num">${v.visits}</td><td class="muted">${esc([v.city, v.country].filter(Boolean).join(', ') || '·')}</td><td class="muted num">${ago(v.last_seen)}</td></tr>`).join('') : `<tr><td colspan="8"><div class="empty"><b>No viewers yet</b>Create a link and send it to an investor.</div></td></tr>`;
      hydrateIcons(m);
    };
    ['q', 'fh', 'fs', 'sort'].forEach((id) => $('#' + id).addEventListener('input', draw)); draw();
    m.addEventListener('click', (e) => { if (e.target.closest('select')) return; const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#/visitor/' + tr.dataset.id; });
    m.addEventListener('change', async (e) => { const s = e.target.closest('select[data-e]'); if (!s) return; await api('/investors/' + encodeURIComponent(s.dataset.e), { method: 'PATCH', body: JSON.stringify({ stage: s.value }) }); toast('Stage updated'); });
  }

  // ---------- visitor detail ----------
  async function visitor(vid) {
    const d = await api('/visitors/' + vid); const v = d.visitor; const inv = v.investor || {};
    const ring = (p, c) => `<div class="ring" style="--p:${p};--c:${c}"><span>${p}</span></div>`;
    const evName = { open: 'Opened the deck', return: 'Came back', verified: 'Verified email', forwarded: 'Opened a forwarded link', download: 'Downloaded the PDF', message: 'Asked a question', cta: 'Clicked book a call' };
    $('#main').innerHTML = `
      <div class="ph"><div class="vh">${av(v.email || v.name)}<div><p class="eyebrow"><a href="#/investors">Contacts</a></p><h1>${esc(inv.name || v.name || v.email || 'Anonymous viewer')}</h1><p>${esc([inv.firm, v.email].filter(Boolean).join(' · '))} ${v.forwarded ? '<span class="chip fw">Forwarded link</span>' : ''}</p></div></div>
        <div class="acts" style="align-items:center">${ring(v.score, v.heat === 'hot' ? '#C0501E' : v.heat === 'warm' ? '#C88E24' : '#2C6E8F')}${v.email ? `<a class="btn ghost" href="mailto:${esc(v.email)}">${icon('chat')}Email</a>` : ''}</div></div>
      <div class="kpis">
        <div class="kpi"><div class="l">${icon('clock')}Time on deck</div><div class="v">${dur(v.ms)}</div></div>
        <div class="kpi"><div class="l">${icon('check')}Completion</div><div class="v">${pct(v.completion)}</div></div>
        <div class="kpi"><div class="l">${icon('return')}Visits</div><div class="v">${v.visits}</div><div class="s">first ${ago(v.first_seen)}</div></div>
        <div class="kpi"><div class="l">${icon('pin')}Location</div><div class="v" style="font-size:18px">${esc([v.city, v.country].filter(Boolean).join(', ') || 'Unknown')}</div><div class="s">${esc(v.device || '')}</div></div>
        <div class="kpi"><div class="l">${icon('link')}Link</div><div class="v" style="font-size:18px">${esc(v.link_name || v.slug || '')}</div><div class="s">${v.downloads ? 'Downloaded PDF' : 'No download'}</div></div>
      </div>
      <div class="grid2">
        <div class="stack">
          ${d.decks.map((dk) => `<div class="card"><h2>Time per slide. <small>${esc(dk.doc.name)}</small></h2>${slideChartSingle(dk)}<div style="margin-top:16px">${slideGrid(dk, dk.doc.id)}</div></div>`).join('') || '<div class="card"><div class="empty">No slide time recorded yet.</div></div>'}
          <div class="card"><h2>Sessions. <small>${d.sessions.length}</small></h2><div class="tw"><table><thead><tr><th>When</th><th>Duration</th><th>Location</th><th>Device</th></tr></thead><tbody>${d.sessions.map((s) => `<tr><td class="num">${new Date(s.started_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td><td class="num">${dur(s.duration)}</td><td class="muted">${esc([s.city, s.country].filter(Boolean).join(', ') || '·')}</td><td class="muted">${esc(s.device || '')}</td></tr>`).join('')}</tbody></table></div></div>
        </div>
        <div class="stack">
          ${v.email ? `<div class="card"><h2>Pipeline.</h2><div class="form">
            <div class="two"><label class="fld">Name<input id="iName" value="${esc(inv.name || v.name || '')}"></label><label class="fld">Company<input id="iFirm" value="${esc(inv.firm || '')}"></label></div>
            <label class="fld">Stage<select id="iStage">${STAGES.map((s) => `<option ${inv.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            <label class="fld">Notes<textarea class="notes" id="iNotes" placeholder="Call notes, cheque size, follow up date">${esc(inv.notes || '')}</textarea></label>
            <div><button class="btn sm" id="iSave">Save</button></div></div></div>` : ''}
          ${d.messages.length ? `<div class="card"><h2>Questions.</h2>${d.messages.map((mm) => `<div class="msg"><div><span class="chip warm">Slide ${mm.page || '?'}</span><div class="body">${esc(mm.body)}</div><span class="muted" style="font-size:12px">${ago(mm.created_at)}</span></div></div>`).join('')}</div>` : ''}
          <div class="card"><h2>Timeline.</h2><div class="feed">${d.events.map((e) => `<div class="ev"><div class="t">${evName[e.type] || e.type}</div><span class="w">${new Date(e.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span></div>`).join('') || '<div class="empty">Nothing yet</div>'}</div></div>
        </div>
      </div>`;
    const sv = $('#iSave'); if (sv) sv.onclick = async () => { await api('/investors/' + encodeURIComponent(v.email), { method: 'PATCH', body: JSON.stringify({ name: $('#iName').value, firm: $('#iFirm').value, stage: $('#iStage').value, notes: $('#iNotes').value }) }); toast('Saved'); };
  }
  function slideChartSingle(dk) {
    const max = Math.max(1, ...dk.pages.map((p) => p.ms));
    return `<div style="display:flex;flex-direction:column;gap:6px">${dk.pages.map((p) => `<div style="display:grid;grid-template-columns:28px 1fr 64px;gap:10px;align-items:center;font-size:12px"><span class="muted num">${p.page}</span><div class="bar" style="height:10px"><div style="width:${(p.ms / max) * 100}%;background:${p.ms === max ? '#C0501E' : '#F6DFA0'}"></div></div><span class="num" style="text-align:right">${p.ms ? dur(p.ms) : '<span class="muted">skipped</span>'}</span></div>`).join('')}</div>`;
  }

  // ---------- links ----------
  let DOCS = [];
  async function links() {
    const ls = await api('/links'); const docs = DOCS;
    const dn = Object.fromEntries(docs.map((d) => [d.id, d.name]));
    $('#main').innerHTML = `
      <div class="ph"><div><p class="eyebrow">Sharing</p><h1>Links.</h1><p>${isOwner() ? 'Every link on the team. ' : ''}One link can go to everyone. Each person who opens it is tracked by their email.</p></div><div class="acts"><button class="btn" id="nl">New Link<span class="arr">↗</span></button></div></div>
      <div class="card"><div class="tw"><table><thead><tr><th>Link</th>${isOwner() ? '<th>Owner</th>' : ''}<th>URL</th><th>Access</th><th>Views</th><th>Time</th><th>Last view</th><th></th></tr></thead><tbody>
      ${ls.map((l) => { const url = `${ME.siteUrl}/${l.slug}`; const exp = l.expires_at && l.expires_at < Date.now();
        return `<tr class="click" data-id="${l.id}"><td><div class="who">${av(l.investor_name || l.name || l.slug)}<div><b>${esc(l.name || l.investor_name || l.slug)}</b><span>${esc([l.firm, l.investor_email, l.doc_ids.map((d) => dn[d]).filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</span></div></div></td>
        ${isOwner() ? `<td>${l.mine ? '<span class="muted">You</span>' : esc(l.owner_name || '')}</td>` : ''}<td><span class="linkurl" title="${esc(url)}">/${esc(l.slug)}</span></td>
        <td><div style="display:flex;gap:4px;flex-wrap:wrap">${!l.active ? '<span class="chip off">Revoked</span>' : exp ? '<span class="chip off">Expired</span>' : '<span class="chip ok">Live</span>'}${l.verify_email ? '<span class="chip cold">Verified email</span>' : l.require_email ? '<span class="chip cold">Email</span>' : '<span class="chip off">Open</span>'}${l.has_password ? `<span class="chip cold">${icon('lock')}</span>` : ''}</div></td>
        <td class="num">${l.stats.views} <span class="muted">/ ${l.stats.visitors} people</span></td><td class="num">${dur(l.stats.ms)}</td><td class="muted">${ago(l.stats.last)}</td>
        <td style="white-space:nowrap"><button class="btn sm ghost" data-copy="${esc(url)}">${icon('copy')}Copy</button> <button class="btn sm ghost" data-edit="${l.id}">Edit</button></td></tr>`; }).join('') || `<tr><td colspan="7"><div class="empty"><b>No links yet</b>Create your first share link.</div></td></tr>`}
      </tbody></table></div></div>`;
    $('#nl').onclick = () => linkForm();
    $('#main').onclick = (e) => {
      const c = e.target.closest('[data-copy]'); if (c) { navigator.clipboard.writeText(c.dataset.copy); toast('Link copied'); return; }
      const ed = e.target.closest('[data-edit]'); if (ed) { linkForm(ls.find((l) => l.id === ed.dataset.edit)); return; }
      const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#/link/' + tr.dataset.id;
    };
  }
  async function linkView(lid) {
    const [d, ls] = await Promise.all([api(`/links/${lid}/analytics`), api('/links')]); const l = d.link; const full = ls.find((x) => x.id === lid);
    const url = `${ME.siteUrl}/${l.slug}`;
    $('#main').innerHTML = `
      <div class="ph"><div><p class="eyebrow"><a href="#/links">Links</a></p><h1>${esc(l.name || l.investor_name || l.slug)}</h1><p><span class="linkurl" style="display:inline-flex;max-width:none">${esc(url)}</span></p></div>
      <div class="acts"><button class="btn ghost" id="cp">${icon('copy')}Copy link</button><a class="btn ghost" href="${esc(url)}" target="_blank">${icon('eye')}Open</a><button class="btn" id="ed">Edit settings</button></div></div>
      <div class="kpis"><div class="kpi"><div class="l">Views</div><div class="v">${full.stats.views}</div></div><div class="kpi"><div class="l">People</div><div class="v">${d.visitors.length}</div></div><div class="kpi"><div class="l">Total time</div><div class="v">${dur(full.stats.ms)}</div></div><div class="kpi"><div class="l">Forwards detected</div><div class="v">${d.visitors.filter((v) => v.forwarded).length}</div></div></div>
      ${d.decks.map((dk) => `<div class="card"><h2>${esc(dk.doc.name)} <small>${dk.viewers} viewers</small></h2>${dk.viewers ? slideChart(dk) + '<div style="margin-top:16px">' + slideGrid(dk, dk.doc.id) + '</div>' : '<div class="empty">No views on this link yet.</div>'}</div>`).join('')}
      <div class="card"><h2>People on this link.</h2><div class="tw"><table><tbody>${d.visitors.map((v) => `<tr class="click" onclick="location.hash='#/visitor/${v.id}'"><td><div class="who">${av(v.email)}<div><b>${esc(v.investor?.name || v.name || v.email || 'Anonymous')}${v.forwarded ? ' <span class="chip fw">Forwarded</span>' : ''}</b><span>${esc(v.email)}</span></div></div></td><td>${heatChip(v)}</td><td class="num">${dur(v.ms)}</td><td class="num">${pct(v.completion)}</td><td class="muted">${ago(v.last_seen)}</td></tr>`).join('') || '<tr><td><div class="empty">Nobody yet</div></td></tr>'}</tbody></table></div></div>`;
    $('#cp').onclick = () => { navigator.clipboard.writeText(url); toast('Link copied'); };
    $('#ed').onclick = () => linkForm(full);
  }
  async function linkForm(l) {
    if (!DOCS.length) await loadDocs();
    const edit = !!(l && l.id); l = Object.assign({ require_email: 1, verify_email: 0, allow_download: 0, watermark: 1, notify: 1, active: 1, doc_ids: DOCS[0] ? [DOCS[0].id] : [], cta_label: 'Book a Call', cta_url: ME.user.cta_url || '' }, l || {});
    const tg = (k, t, s) => `<label class="tg"><input type="checkbox" name="${k}" ${l[k] ? 'checked' : ''}><span class="sw"></span><div><b>${t}</b><span>${s}</span></div></label>`;
    const dt = l.expires_at ? new Date(l.expires_at).toISOString().slice(0, 10) : '';
    openDrawer(`<form class="form" id="lf">
      <div><p class="eyebrow">${edit ? 'Edit link' : 'New link'}</p><h2>${edit ? esc(l.name || l.slug) : 'Share the deck.'}</h2></div>
      <div class="fs"><b>Recipient (optional)</b><p class="muted" style="font-size:12.5px;margin-top:-6px">Leave blank for a link you send to many people. Fill it in only for a personal link: it prefills their email and flags forwards.</p>
        <div class="two"><label class="fld">Name<input name="investor_name" value="${esc(l.investor_name || '')}" placeholder="Tolu Adeyemi"></label><label class="fld">Company<input name="firm" value="${esc(l.firm || '')}" placeholder="Fund name"></label></div>
        <label class="fld">Email <small>Prefills the gate and flags forwards when someone else opens it</small><input name="investor_email" type="email" value="${esc(l.investor_email || '')}" placeholder="tolu@fund.com"></label>
        <label class="fld">Internal link name <small>Only you see this</small><input name="name" value="${esc(l.name || '')}" placeholder="e.g. Seed round, Nahdi proposal, Tolu"></label>
      </div>
      <div class="fs"><b>Content</b>
        <div class="docpick">${DOCS.map((d) => `<label><input type="checkbox" name="doc" value="${d.id}" ${l.doc_ids.includes(d.id) ? 'checked' : ''}><img src="${thumb(d.id, 1)}"><span><b>${esc(d.name)}</b><br><span class="muted">${d.pages} pages${d.visibility === 'team' ? ' · Team' : ''}</span></span></label>`).join('') || '<p class="muted">Upload a deck first.</p>'}</div>
        <label class="fld">Custom URL <small>${esc(ME.siteUrl)}/</small><input name="slug" value="${esc(l.slug || '')}" placeholder="auto"></label>
        <label class="fld">Welcome note on the gate <small>Optional</small><textarea name="message" rows="2" placeholder="Great meeting you today. Here is the deck we discussed.">${esc(l.message || '')}</textarea></label>
      </div>
      <div class="fs"><b>Access</b>
        ${tg('require_email', 'Require email to view', 'Viewer enters their email before the deck opens')}
        ${tg('verify_email', 'Verify email with a code', 'Sends a 6 digit code so nobody can fake an address')}
        ${tg('watermark', 'Watermark slides', 'Burns the viewer email and date into every slide')}
        ${tg('allow_download', 'Allow PDF download', 'Off keeps the deck view only')}
        ${tg('notify', 'Notify me', 'Email or Slack alert on opens, returns, forwards, questions')}
        ${edit ? tg('active', 'Link is live', 'Turn off to revoke access instantly') : ''}
        <div class="two"><label class="fld">Password <small>${l.has_password ? 'Set. Type to change, clear to remove' : 'Optional'}</small><input name="password" type="text" placeholder="${l.has_password ? '••••••' : 'none'}"></label><label class="fld">Expires on<input name="expires_at" type="date" value="${dt}"></label></div>
        <label class="fld">Only allow these emails or domains <small>Comma separated. e.g. tolu@fund.com, @fund.com</small><input name="allow_emails" value="${esc(l.allow_emails || '')}"></label>
        <div class="two"><label class="fld">Block emails<input name="block_emails" value="${esc(l.block_emails || '')}"></label><label class="fld">Block domains<input name="block_domains" value="${esc(l.block_domains || '')}" placeholder="competitor.com"></label></div>
      </div>
      <div class="fs"><b>Call to action at the end</b>
        <div class="two"><label class="fld">Button label<input name="cta_label" value="${esc(l.cta_label || 'Book a Call')}"></label><label class="fld">Link<input name="cta_url" value="${esc(l.cta_url || '')}" placeholder="https://calendly.com/..."></label></div>
      </div>
      <p class="err" id="lfErr"></p>
      <div class="formacts">${edit ? '<button type="button" class="btn danger" id="del" style="margin-right:auto">Delete</button>' : ''}<button type="button" class="btn ghost" id="cx">Cancel</button><button class="btn">${edit ? 'Save Changes' : 'Create Link'}<span class="arr">↗</span></button></div>
    </form>`);
    const f = $('#lf');
    $('#cx').onclick = closeDrawer;
    f.verify_email.onchange = () => { if (f.verify_email.checked) f.require_email.checked = true; };
    if ($('#del')) $('#del').onclick = async () => { if (!confirm('Delete this link and all its analytics?')) return; await api('/links/' + l.id, { method: 'DELETE' }); closeDrawer(); location.hash = '#/links'; route(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const b = {}; ['investor_name', 'firm', 'investor_email', 'name', 'slug', 'message', 'expires_at', 'allow_emails', 'block_emails', 'block_domains', 'cta_label', 'cta_url'].forEach((k) => (b[k] = f[k].value));
      ['require_email', 'verify_email', 'watermark', 'allow_download', 'notify'].forEach((k) => (b[k] = f[k].checked)); if (edit) b.active = f.active.checked;
      if (f.password.value || !edit) b.password = f.password.value;
      b.doc_ids = $$('input[name=doc]:checked', f).map((x) => x.value);
      if (!b.doc_ids.length) { $('#lfErr').textContent = 'Pick at least one deck'; return; }
      if (edit && !b.slug) delete b.slug;
      try {
        if (edit) { await api('/links/' + l.id, { method: 'PATCH', body: JSON.stringify(b) }); closeDrawer(); toast('Saved'); route(); }
        else {
          const r = await api('/links', { method: 'POST', body: JSON.stringify(b) }); const url = `${ME.siteUrl}/${r.slug}`;
          $('#drawerPanel').innerHTML = `<div class="form"><p class="eyebrow">Link ready</p><h2>Send this to ${esc(b.investor_name || 'them')}.</h2><div class="created"><div class="u">${esc(url)}</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn gold" id="cpy">Copy Link<span class="arr">↗</span></button>${b.investor_email ? `<a class="btn ghost" href="mailto:${esc(b.investor_email)}?subject=${encodeURIComponent((ME.brand || 'Oyster') + ': ' + ((DOCS.find((d) => d.id === b.doc_ids[0]) || {}).name || 'our deck'))}&body=${encodeURIComponent(`Hello ${(b.investor_name || '').split(' ')[0] || 'there'},\n\nHere it is: ${url}\n\nHappy to walk you through it.\n\n${ME.user.name || ''}`)}">${icon('chat')}Draft email</a>` : ''}<a class="btn ghost" href="${esc(url)}" target="_blank">${icon('eye')}Preview</a></div></div><div class="formacts"><button class="btn" id="dn">Done</button></div></div>`;
          hydrateIcons($('#drawerPanel'));
          $('#cpy').onclick = () => { navigator.clipboard.writeText(url); toast('Link copied'); };
          $('#dn').onclick = () => { closeDrawer(); if (location.hash.startsWith('#/links')) route(); else location.hash = '#/links'; };
        }
      } catch (err) { $('#lfErr').textContent = err.message; }
    };
  }
  function openDrawer(html, wide) { const p = $('#drawerPanel'); p.className = 'drawer-panel' + (wide ? ' wide' : ''); p.innerHTML = html; $('#drawer').hidden = false; hydrateIcons(p); }
  function closeDrawer() { $('#drawer').hidden = true; $('#drawerPanel').innerHTML = ''; }
  $('.drawer-bg').onclick = closeDrawer;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // ---------- docs cache + PDF upload (rendered in the browser with pdf.js) ----------
  async function loadDocs() { DOCS = await api('/docs'); return DOCS; }
  let pdfjsP = null;
  function loadPdfjs() {
    return (pdfjsP ??= new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); };
      s.onerror = () => rej(new Error('Could not load the PDF reader'));
      document.head.appendChild(s);
    }));
  }
  const canvasBlob = (c, q) => new Promise((r) => c.toBlob(r, 'image/jpeg', q));
  async function putFile(url, blob, type) {
    const r = await fetch(url, { method: 'PUT', body: blob, headers: { 'content-type': type, 'x-upsert': 'true' } });
    if (!r.ok) throw new Error('Upload failed (' + r.status + ')');
  }
  async function uploadPdf(file, replaceId, visibility) {
    const lib = await loadPdfjs();
    toast('Reading PDF…');
    const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const n = pdf.numPages;
    const p1 = await pdf.getPage(1); const v1 = p1.getViewport({ scale: 1 }); const ratio = v1.height / v1.width;
    const name = file.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
    const res = await api('/docs', { method: 'POST', body: JSON.stringify({ name, pages: n, ratio, replaceId, visibility }) });
    for (let i = 1; i <= n; i++) {
      toast(`Processing slide ${i} of ${n}…`);
      const page = await pdf.getPage(i);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 1800 / vp0.width });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const big = await canvasBlob(c, 0.86);
      const t = document.createElement('canvas'); t.width = 360; t.height = Math.round(360 * c.height / c.width);
      t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      const small = await canvasBlob(t, 0.74);
      await Promise.all([putFile(res.uploads[`page-${i}.jpg`], big, 'image/jpeg'), putFile(res.uploads[`thumb-${i}.jpg`], small, 'image/jpeg')]);
    }
    toast('Saving original PDF…');
    await putFile(res.uploads['original.pdf'], file, 'application/pdf');
    await api(`/docs/${res.id}/commit`, { method: 'POST', body: JSON.stringify({ version: res.version, pages: n, ratio, name: replaceId ? '' : name }) });
  }
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-export]')) return;
    const r = await api('/export'); const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv' })); a.download = 'deckroom-contacts.csv'; a.click();
  });

  // ---------- docs ----------
  async function docs() {
    await loadDocs();
    $('#main').innerHTML = `
      <div class="ph"><div><p class="eyebrow">Library</p><h1>Files.</h1><p>Decks, proposals and sales material. Upload a new version anytime and every link updates.</p></div><div class="acts"><div class="seg" id="docFilter"><button data-f="all" class="on">All</button><button data-f="team">Team</button><button data-f="mine">Mine</button></div></div></div>
      <div class="docs">
        <div class="drop" id="drop"><input type="file" accept="application/pdf" hidden id="file"><div>${icon('upload')}<b>Upload a PDF.</b><p class="muted">Drop it here or click to browse</p><label class="tg sharetg" onclick="event.stopPropagation()"><input type="checkbox" id="shareTeam" ${isOwner() ? '' : 'checked'}><span class="sw"></span><div><b>Share with the team</b><span>Sales can send it to clients</span></div></label></div></div>
        ${DOCS.map((d) => { const can = isOwner() || d.mine; return `<div class="doc" data-vis="${d.visibility}" data-mine="${d.mine ? 1 : 0}"><img src="${thumb(d.id, 1)}" data-pv="${d.id}" data-p="1"><div class="b"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${d.visibility === 'team' ? '<span class="chip ok">Team</span>' : '<span class="chip off">' + icon('lock') + 'Private</span>'}${!d.mine && d.owner_name ? `<span class="muted" style="font-size:12px">by ${esc(d.owner_name)}</span>` : ''}</div><h3>${esc(d.name)}</h3><span class="muted">${d.pages} pages · v${d.version} · updated ${ago(d.updated_at)}</span><div class="row"><button class="btn sm" data-share="${d.id}">${icon('share')}Share</button>${can ? `<button class="btn sm ghost" data-vis="${d.id}">${d.visibility === 'team' ? 'Make private' : 'Share with team'}</button><label class="btn sm ghost">${icon('upload')}New version<input type="file" accept="application/pdf" hidden data-replace="${d.id}"></label><button class="btn sm ghost" data-ren="${d.id}">Rename</button><button class="btn sm danger" data-deld="${d.id}">Delete</button>` : ''}</div></div></div>`; }).join('')}
      </div>`;
    const up = async (file, replaceId) => {
      if (!/pdf$/i.test(file.type || file.name)) { toast('Upload a PDF'); return; }
      try { await uploadPdf(file, replaceId, $('#shareTeam') && $('#shareTeam').checked ? 'team' : 'private'); toast(replaceId ? 'New version live on all links' : 'File uploaded'); await loadDocs(); route(); } catch (e) { console.error(e); toast(e.message || 'Upload failed'); }
    };
    $('#drop').onclick = (e) => { if (!e.target.closest('.sharetg')) $('#file').click(); };
    $('#file').onchange = (e) => e.target.files[0] && up(e.target.files[0]);
    $$('#docFilter button').forEach((b) => (b.onclick = () => { $$('#docFilter button').forEach((x) => x.classList.toggle('on', x === b)); $$('.doc').forEach((el) => { const f = b.dataset.f; el.hidden = f === 'team' ? el.dataset.vis !== 'team' : f === 'mine' ? el.dataset.mine !== '1' : false; }); }));
    $$('[data-vis]').forEach((b) => { if (b.tagName !== 'BUTTON') return; b.onclick = async () => { const d = DOCS.find((x) => x.id === b.dataset.vis); await api('/docs/' + d.id, { method: 'PATCH', body: JSON.stringify({ visibility: d.visibility === 'team' ? 'private' : 'team' }) }); toast(d.visibility === 'team' ? 'Now private' : 'Shared with the team'); await loadDocs(); route(); }; });
    const dz = $('#drop');
    ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('over')));
    dz.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) up(f); });
    $$('[data-replace]').forEach((i) => (i.onchange = (e) => e.target.files[0] && up(e.target.files[0], i.dataset.replace)));
    $$('[data-share]').forEach((b) => (b.onclick = () => linkForm({ require_email: 1, watermark: 1, notify: 1, active: 1, doc_ids: [b.dataset.share], cta_label: 'Book a Call', cta_url: ME.user.cta_url || '' }) ));
    $$('[data-ren]').forEach((b) => (b.onclick = async () => { const d = DOCS.find((x) => x.id === b.dataset.ren); const n = prompt('File name', d.name); if (!n) return; await api('/docs/' + d.id, { method: 'PATCH', body: JSON.stringify({ name: n }) }); route(); }));
    $$('[data-deld]').forEach((b) => (b.onclick = async () => { if (!confirm('Delete this file? Links pointing to it will show nothing.')) return; await api('/docs/' + b.dataset.deld, { method: 'DELETE' }); route(); }));
  }

  function preview(docId, p) {
    const d = DOCS.find((x) => x.id === docId) || { id: docId, pages: 40, name: '' };
    if (!d.pageUrls) api(`/docs/${docId}/pages`).then((r) => { d.pageUrls = r.urls; go(p); }).catch(() => {});
    const go = (n) => {
      p = Math.max(1, Math.min(d.pages, n));
      $('#pvImg').src = (d.pageUrls || [])[p - 1] || thumb(docId, p); $('#pvN').textContent = `${p} / ${d.pages}`;
      $$('.pv-strip img').forEach((im, i) => im.classList.toggle('on', i + 1 === p));
    };
    openDrawer(`<div class="pv"><div class="pv-top"><b>${esc(d.name)}</b><span class="pv-stat" id="pvN"></span><button class="btn sm ghost" id="pvX">Close</button></div><div class="pv-img"><button class="pv-nav" style="left:12px" id="pvP">‹</button><img id="pvImg"><button class="pv-nav" style="right:12px" id="pvNx">›</button></div><div class="pv-strip">${Array.from({ length: d.pages }, (_, i) => `<img src="${thumb(docId, i + 1)}" data-n="${i + 1}">`).join('')}</div></div>`, true);
    $('#pvX').onclick = closeDrawer; $('#pvP').onclick = () => go(p - 1); $('#pvNx').onclick = () => go(p + 1);
    $$('.pv-strip img').forEach((im) => (im.onclick = () => go(+im.dataset.n)));
    go(p);
  }

  // ---------- messages ----------
  async function messages() {
    const ms = await api('/messages');
    $('#main').innerHTML = `<div class="ph"><div><p class="eyebrow">Inbox</p><h1>Questions.</h1><p>Asked from inside the deck, tagged with the slide.</p></div></div>
      <div class="card">${ms.length ? ms.map((m) => `<div class="msg">${m.doc_id ? `<img src="${thumb(m.doc_id, m.page || 1)}" data-pv="${m.doc_id}" data-p="${m.page || 1}" style="cursor:zoom-in">` : ''}<div style="flex:1;min-width:0"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><a href="#/visitor/${m.visitor_id}"><b>${esc(m.name || m.email || 'Anonymous')}</b></a><span class="chip warm">Slide ${m.page || '?'}</span>${isOwner() && m.owner_name ? `<span class="chip off">${esc(m.owner_name.split(' ')[0])}'s link</span>` : ''}<span class="muted" style="font-size:12px">${esc(m.doc_name || '')} · ${ago(m.created_at)}</span></div><div class="body">${esc(m.body)}</div>${m.email ? `<a class="btn sm ghost" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: your question on slide ' + (m.page || ''))}&body=${encodeURIComponent('Hello ' + ((m.name || '').split(' ')[0] || '') + ',\n\n> ' + m.body + '\n\n')}">Reply</a>` : ''}</div></div>`).join('') : '<div class="empty"><b>No questions yet</b>Viewers can ask from any slide.</div>'}</div>`;
    $('#msgCount').textContent = '';
  }

  // ---------- settings ----------
  async function settings() {
    const st = (ok, t, d) => `<div class="status"><span class="chip ${ok ? 'ok' : 'off'}">${ok ? 'On' : 'Off'}</span><div><b>${t}</b><div class="muted" style="font-size:13px">${d}</div></div></div>`;
    const u = ME.user;
    $('#main').innerHTML = `<div class="ph"><div><p class="eyebrow">Account</p><h1>Settings.</h1><p>Your profile shows on the links you send.</p></div></div>
      <div class="grid2">
        <div class="stack">
          <div class="card"><h2>Profile.</h2><form class="form" id="pf">
            <div class="two"><label class="fld">Name <small>Shown on your links: "Shared by …"</small><input name="name" value="${esc(u.name || '')}"></label><label class="fld">Title<input name="title" value="${esc(u.title || '')}" placeholder="Account Executive"></label></div>
            <label class="fld">Booking link <small>Default "Book a Call" button on your new links</small><input name="cta_url" value="${esc(u.cta_url || '')}" placeholder="https://calendly.com/you"></label>
            <label class="fld">Email <small>Alerts for your links go here</small><input value="${esc(u.email || '')}" disabled></label>
            <div><button class="btn sm">Save Profile<span class="arr">↗</span></button></div></form></div>
          <div class="card"><h2>Password.</h2><form class="form" id="pw">
            <div class="two"><label class="fld">Current password<input type="password" name="current_password" autocomplete="current-password"></label><label class="fld">New password <small>10+ characters</small><input type="password" name="new_password" autocomplete="new-password"></label></div>
            <p class="err" id="pwErr"></p><div><button class="btn sm ghost">Change Password</button></div></form></div>
        </div>
        <div class="stack">
          <div class="card"><h2>Status.</h2>
            ${st(ME.email, 'Email alerts and codes', ME.email ? `Alerts for your links go to ${esc(u.email)}.` : 'Not set up yet. Email codes and alerts switch on once Resend is connected.')}
            ${st(ME.slack, 'Slack alerts', ME.slack ? 'Posting to the team channel.' : 'Add <code>SLACK_WEBHOOK_URL</code> to the backend secrets for pings in a channel.')}
            ${st(true, 'Public URL', `Links are built on <code>${esc(ME.siteUrl)}</code>.`)}
          </div>
          <div class="card"><h2>How tracking works.</h2><p class="muted" style="line-height:1.6">Time counts only while the file is open and the viewer has interacted in the last two minutes. Completion counts pages viewed for 1.5s or more. The engagement score mixes completion, time spent, return visits, questions and call clicks. A personal link opened with a different email is flagged as forwarded.</p></div>
        </div>
      </div>`;
    $('#pf').onsubmit = async (e) => { e.preventDefault(); const f = e.target; const r = await api('/me', { method: 'PATCH', body: JSON.stringify({ name: f.name.value, title: f.title.value, cta_url: f.cta_url.value }) }); ME.user = r.user; $('#meName').textContent = r.user.name || r.user.email; toast('Profile saved'); };
    $('#pw').onsubmit = async (e) => { e.preventDefault(); const f = e.target; $('#pwErr').textContent = ''; try { const r = await api('/me', { method: 'PATCH', body: JSON.stringify({ current_password: f.current_password.value, new_password: f.new_password.value }) }); if (r.token) tok.set(r.token); f.reset(); toast('Password changed'); } catch (err) { $('#pwErr').textContent = err.message; } };
  }

  // ---------- team (owner only) ----------
  async function team() {
    if (!isOwner()) { location.hash = '#/'; return; }
    const us = await api('/team');
    $('#main').innerHTML = `<div class="ph"><div><p class="eyebrow">Team</p><h1>Who can share.</h1><p>Sales sees their own links and contacts, plus files you share with the team. You see everything.</p></div><div class="acts"><button class="btn" id="inv">Add Person<span class="arr">↗</span></button></div></div>
      <div class="card"><div class="tw"><table><thead><tr><th>Person</th><th>Role</th><th>Links</th><th>Viewers</th><th>Last sign in</th><th></th></tr></thead><tbody>
      ${us.map((x) => `<tr><td><div class="who">${av(x.email)}<div><b>${esc(x.name || x.email)}</b><span>${esc([x.title, x.email].filter(Boolean).join(' · '))}</span></div></div></td>
        <td>${x.role === 'owner' ? '<span class="chip warm">Owner</span>' : x.active ? '<span class="chip ok">Member</span>' : '<span class="chip off">Paused</span>'}</td>
        <td class="num">${x.stats.links}</td><td class="num">${x.stats.viewers}</td><td class="muted">${ago(x.last_login)}</td>
        <td style="white-space:nowrap">${x.role === 'owner' ? '' : `<button class="btn sm ghost" data-reset="${x.id}">Reset password</button> <button class="btn sm ${x.active ? 'danger' : 'ghost'}" data-act="${x.id}" data-on="${x.active ? 0 : 1}">${x.active ? 'Pause access' : 'Restore access'}</button>`}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    const showPw = (title, x, r) => {
      openDrawer(`<div class="form"><p class="eyebrow">Access</p><h2>${esc(title)}</h2><div class="created"><div>Send this to ${esc(x.name || x.email)}${r.emailed ? '. We also emailed it to them.' : '.'}</div><div class="u" id="cred">Sign in: ${esc(r.signIn || ME.siteUrl + '/admin/')}\nEmail: ${esc(x.email)}\nTemporary password: ${esc(r.tempPassword)}</div><div><button class="btn gold" id="cp">Copy Details<span class="arr">↗</span></button></div></div><p class="muted">The password shows only once. They can change it in Settings.</p><div class="formacts"><button class="btn" id="dn">Done</button></div></div>`);
      $('#cp').onclick = () => { navigator.clipboard.writeText($('#cred').innerText); toast('Copied'); };
      $('#dn').onclick = () => { closeDrawer(); route(); };
    };
    $('#inv').onclick = () => {
      openDrawer(`<form class="form" id="tf"><div><p class="eyebrow">Team</p><h2>Add a person.</h2></div><div class="fs"><div class="two"><label class="fld">Name<input name="name" required placeholder="Kolapo Ayantoye"></label><label class="fld">Title<input name="title" placeholder="Account Executive"></label></div><label class="fld">Work email<input name="email" type="email" required placeholder="name@oysterskin.com"></label></div><p class="err" id="tfErr"></p><div class="formacts"><button type="button" class="btn ghost" id="cx">Cancel</button><button class="btn">Add Person<span class="arr">↗</span></button></div></form>`);
      $('#cx').onclick = closeDrawer;
      $('#tf').onsubmit = async (e) => { e.preventDefault(); const f = e.target; try { const r = await api('/team', { method: 'POST', body: JSON.stringify({ name: f.name.value, title: f.title.value, email: f.email.value }) }); showPw(`${r.user.name || 'They'} can sign in now.`, r.user, r); } catch (err) { $('#tfErr').textContent = err.message; } };
    };
    $('#main').onclick = async (e) => {
      const rs = e.target.closest('[data-reset]'); const ac = e.target.closest('[data-act]');
      if (rs) { if (!confirm('Create a new temporary password? The old one stops working.')) return; const x = us.find((y) => y.id === rs.dataset.reset); const r = await api('/team/' + x.id, { method: 'PATCH', body: JSON.stringify({ reset: true }) }); showPw('New password ready.', x, { ...r, signIn: ME.siteUrl + '/admin/' }); }
      if (ac) { await api('/team/' + ac.dataset.act, { method: 'PATCH', body: JSON.stringify({ active: ac.dataset.on === '1' }) }); toast(ac.dataset.on === '1' ? 'Access restored' : 'Access paused'); route(); }
    };
  }

  start();
})();
