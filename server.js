// DeckRoom: internal investor deck sharing + tracking for Oyster
require('./lib/env');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const sharp = require('sharp');
const db = require('./lib/db');
const notify = require('./lib/notify');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DOCS_DIR = path.join(DATA_DIR, 'docs');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'oyster';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('deckroom:' + ADMIN_PASSWORD).digest('hex');
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const BRAND = process.env.BRAND_NAME || 'Oyster';
const SENDER = process.env.SENDER_NAME || 'Jude';
fs.mkdirSync(DOCS_DIR, { recursive: true });

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain', limit: '1mb' })); // sendBeacon
app.use(cookieParser(SECRET));

const now = () => Date.now();
const id = (n = 10) => crypto.randomBytes(n).toString('base64url').slice(0, n);
const hash = (s) => crypto.createHash('sha256').update(SECRET + s).digest('hex');
const clean = (s, n = 300) => (s == null ? '' : String(s).trim().slice(0, n));
const listOf = (s) => clean(s, 5000).split(/[\s,;]+/).map((x) => x.toLowerCase()).filter(Boolean);

// ---------- PDF processing ----------
function run(cmd, args) {
  return new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 1 << 26 }, (e, out, err) => (e ? rej(new Error(err || e.message)) : res(out))));
}
async function processPdf(docId, version, pdfPath) {
  const dir = path.join(DOCS_DIR, docId, 'v' + version);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(pdfPath, path.join(dir, 'original.pdf'));
  await run('pdftoppm', ['-jpeg', '-jpegopt', 'quality=86', '-scale-to', '1800', pdfPath, path.join(dir, 'p')]);
  const files = fs.readdirSync(dir).filter((f) => /^p-\d+\.jpg$/.test(f)).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
  let ratio = 0.5625;
  for (let i = 0; i < files.length; i++) {
    const src = path.join(dir, files[i]);
    const dst = path.join(dir, `page-${i + 1}.jpg`);
    fs.renameSync(src, dst);
    await sharp(dst).resize({ width: 360 }).jpeg({ quality: 72 }).toFile(path.join(dir, `thumb-${i + 1}.jpg`));
    if (i === 0) { const m = await sharp(dst).metadata(); ratio = m.height / m.width; }
  }
  return { pages: files.length, ratio };
}
function docDir(doc) { return path.join(DOCS_DIR, doc.id, 'v' + doc.version); }

// ---------- Admin auth ----------
function requireAdmin(req, res, next) {
  if (req.signedCookies.dr_admin === 'ok') return next();
  res.status(401).json({ error: 'auth' });
}
app.post('/api/admin/login', (req, res) => {
  if (clean(req.body.password, 200) !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
  res.cookie('dr_admin', 'ok', { signed: true, httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5 });
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie('dr_admin'); res.json({ ok: true }); });
app.get('/api/admin/me', requireAdmin, (req, res) => res.json({
  ok: true, baseUrl: BASE_URL, brand: BRAND, sender: SENDER,
  smtp: notify.emailEnabled(), slack: notify.slackEnabled(), notifyTo: process.env.NOTIFY_EMAIL || '',
  defaultPassword: ADMIN_PASSWORD === 'oyster',
}));

// ---------- Documents ----------
const upload = multer({ dest: path.join(DATA_DIR, 'tmp'), limits: { fileSize: 100 * 1024 * 1024 } });
app.get('/api/admin/docs', requireAdmin, (req, res) => res.json(db.all('SELECT * FROM documents ORDER BY created_at DESC')));
app.post('/api/admin/docs', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !/pdf/i.test(req.file.mimetype + req.file.originalname)) throw new Error('Upload a PDF');
    const replace = req.body.replaceId && db.get('SELECT * FROM documents WHERE id=?', req.body.replaceId);
    const docId = replace ? replace.id : id(8);
    const version = replace ? replace.version + 1 : 1;
    const { pages, ratio } = await processPdf(docId, version, req.file.path);
    const name = clean(req.body.name, 120) || (replace ? replace.name : req.file.originalname.replace(/\.pdf$/i, ''));
    if (replace) db.run('UPDATE documents SET name=?, version=?, pages=?, ratio=?, updated_at=? WHERE id=?', name, version, pages, ratio, now(), docId);
    else db.run('INSERT INTO documents (id,name,version,pages,ratio,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', docId, name, version, pages, ratio, now(), now());
    fs.unlink(req.file.path, () => {});
    res.json(db.get('SELECT * FROM documents WHERE id=?', docId));
  } catch (e) { if (req.file) fs.unlink(req.file.path, () => {}); res.status(400).json({ error: e.message }); }
});
app.patch('/api/admin/docs/:id', requireAdmin, (req, res) => {
  db.run('UPDATE documents SET name=? WHERE id=?', clean(req.body.name, 120), req.params.id);
  res.json({ ok: true });
});
app.delete('/api/admin/docs/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM documents WHERE id=?', req.params.id);
  fs.rmSync(path.join(DOCS_DIR, req.params.id), { recursive: true, force: true });
  res.json({ ok: true });
});
app.get('/api/admin/docs/:id/:kind-:n.jpg', requireAdmin, (req, res) => {
  const doc = db.get('SELECT * FROM documents WHERE id=?', req.params.id);
  if (!doc || !['page', 'thumb'].includes(req.params.kind)) return res.sendStatus(404);
  res.set('Cache-Control', 'private, max-age=600');
  res.sendFile(path.join(docDir(doc), `${req.params.kind}-${parseInt(req.params.n)}.jpg`));
});

// ---------- Links ----------
const LINK_FIELDS = ['name', 'investor_name', 'investor_email', 'firm', 'doc_ids', 'require_email', 'verify_email', 'allow_download',
  'watermark', 'expires_at', 'allow_emails', 'block_emails', 'block_domains', 'notify', 'cta_url', 'cta_label', 'active', 'message'];
function linkPayload(b) {
  const o = {};
  for (const f of LINK_FIELDS) if (f in b) o[f] = b[f];
  ['require_email', 'verify_email', 'allow_download', 'watermark', 'notify', 'active'].forEach((k) => { if (k in o) o[k] = o[k] ? 1 : 0; });
  if ('doc_ids' in o) o.doc_ids = JSON.stringify((Array.isArray(o.doc_ids) ? o.doc_ids : []).slice(0, 30));
  if ('expires_at' in o) o.expires_at = o.expires_at ? Number(new Date(o.expires_at)) || null : null;
  ['name', 'investor_name', 'firm', 'cta_label'].forEach((k) => { if (k in o) o[k] = clean(o[k], 120); });
  ['investor_email'].forEach((k) => { if (k in o) o[k] = clean(o[k], 200).toLowerCase(); });
  ['allow_emails', 'block_emails', 'block_domains', 'message'].forEach((k) => { if (k in o) o[k] = clean(o[k], 3000); });
  if ('cta_url' in o) o.cta_url = /^https?:\/\//i.test(o.cta_url || '') ? clean(o.cta_url, 500) : '';
  if (o.verify_email) o.require_email = 1;
  return o;
}
function slugify(s) { return clean(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
app.get('/api/admin/links', requireAdmin, (req, res) => {
  const links = db.all('SELECT * FROM links ORDER BY created_at DESC');
  const stats = db.all(`SELECT link_id, COUNT(*) views, COUNT(DISTINCT visitor_id) visitors, SUM(duration) ms, MAX(last_ping) last FROM sessions GROUP BY link_id`);
  const m = Object.fromEntries(stats.map((s) => [s.link_id, s]));
  res.json(links.map((l) => ({ ...l, doc_ids: JSON.parse(l.doc_ids || '[]'), has_password: !!l.password_hash, password_hash: undefined, stats: m[l.id] || { views: 0, visitors: 0, ms: 0 } })));
});
app.post('/api/admin/links', requireAdmin, (req, res) => {
  const o = linkPayload(req.body);
  let slug = slugify(req.body.slug) || slugify(o.investor_name || o.firm || '') || '';
  slug = slug ? `${slug}-${id(4).toLowerCase()}` : id(10);
  if (req.body.slug && slugify(req.body.slug) && !db.get('SELECT 1 FROM links WHERE slug=?', slugify(req.body.slug))) slug = slugify(req.body.slug);
  const lid = id(10);
  const row = { require_email: 1, verify_email: 0, allow_download: 0, watermark: 1, notify: 1, active: 1, doc_ids: '[]', ...o, id: lid, slug, created_at: now() };
  if (req.body.password) row.password_hash = hash(String(req.body.password));
  const keys = Object.keys(row);
  db.run(`INSERT INTO links (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => row[k]));
  if (row.investor_email) upsertInvestor(row.investor_email, { name: row.investor_name, firm: row.firm, stage: 'Shared' });
  res.json({ id: lid, slug });
});
app.patch('/api/admin/links/:id', requireAdmin, (req, res) => {
  const o = linkPayload(req.body);
  if ('password' in req.body) o.password_hash = req.body.password ? hash(String(req.body.password)) : null;
  if (req.body.slug) {
    const s = slugify(req.body.slug);
    const taken = db.get('SELECT id FROM links WHERE slug=? AND id<>?', s, req.params.id);
    if (taken) return res.status(400).json({ error: 'That URL is taken' });
    if (s) o.slug = s;
  }
  const keys = Object.keys(o);
  if (keys.length) db.run(`UPDATE links SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`, ...keys.map((k) => o[k]), req.params.id);
  res.json({ ok: true });
});
app.delete('/api/admin/links/:id', requireAdmin, (req, res) => { db.run('DELETE FROM links WHERE id=?', req.params.id); res.json({ ok: true }); });

// ---------- Investors (CRM) ----------
function upsertInvestor(email, f = {}) {
  email = (email || '').toLowerCase(); if (!email) return;
  const ex = db.get('SELECT * FROM investors WHERE email=?', email);
  if (!ex) db.run('INSERT INTO investors (email,name,firm,stage,notes,updated_at) VALUES (?,?,?,?,?,?)', email, f.name || '', f.firm || '', f.stage || 'Viewed', '', now());
  else {
    const order = ['Shared', 'Viewed', 'Engaged', 'Meeting', 'Due diligence', 'Committed', 'Passed'];
    const stage = f.stage && order.indexOf(f.stage) > order.indexOf(ex.stage) && ex.stage !== 'Passed' ? f.stage : ex.stage;
    db.run('UPDATE investors SET name=COALESCE(NULLIF(name,\'\'),?), firm=COALESCE(NULLIF(firm,\'\'),?), stage=?, updated_at=? WHERE email=?', f.name || '', f.firm || '', stage, now(), email);
  }
}
app.patch('/api/admin/investors/:email', requireAdmin, (req, res) => {
  const e = req.params.email.toLowerCase();
  upsertInvestor(e);
  const sets = [], vals = [];
  ['name', 'firm', 'stage', 'notes'].forEach((k) => { if (k in req.body) { sets.push(k + '=?'); vals.push(clean(req.body[k], 4000)); } });
  if (sets.length) db.run(`UPDATE investors SET ${sets.join(',')}, updated_at=? WHERE email=?`, ...vals, now(), e);
  res.json({ ok: true });
});

// ---------- Analytics ----------
function score(v) {
  const comp = v.completion || 0, t = (v.ms || 0) / 1000, visits = v.visits || 0;
  return Math.round(Math.min(100, comp * 45 + Math.min(t / 360, 1) * 35 + Math.min(Math.max(visits - 1, 0), 2) * 7.5 + (v.messages ? 5 : 0) + (v.cta ? 5 : 0)));
}
function visitorRows(where = '', ...args) {
  const rows = db.all(`
    SELECT v.id, v.email, v.name, v.link_id, v.first_seen, v.last_seen, v.forwarded, l.name link_name, l.slug,
      (SELECT COUNT(*) FROM sessions s WHERE s.visitor_id=v.id) visits,
      (SELECT COALESCE(SUM(duration),0) FROM sessions s WHERE s.visitor_id=v.id) ms,
      (SELECT country FROM sessions s WHERE s.visitor_id=v.id ORDER BY started_at DESC LIMIT 1) country,
      (SELECT city FROM sessions s WHERE s.visitor_id=v.id ORDER BY started_at DESC LIMIT 1) city,
      (SELECT device FROM sessions s WHERE s.visitor_id=v.id ORDER BY started_at DESC LIMIT 1) device,
      (SELECT COUNT(*) FROM messages m WHERE m.visitor_id=v.id) messages,
      (SELECT COUNT(*) FROM events e WHERE e.visitor_id=v.id AND e.type='cta') cta,
      (SELECT COUNT(*) FROM events e WHERE e.visitor_id=v.id AND e.type='download') downloads
    FROM visitors v LEFT JOIN links l ON l.id=v.link_id ${where} ORDER BY v.last_seen DESC`, ...args);
  const totalPages = Object.fromEntries(db.all('SELECT id, pages FROM documents').map((d) => [d.id, d.pages]));
  const seen = db.all(`SELECT s.visitor_id, pt.doc_id, COUNT(DISTINCT pt.page) n FROM page_time pt JOIN sessions s ON s.id=pt.session_id WHERE pt.ms>=1500 GROUP BY s.visitor_id, pt.doc_id`);
  const comp = {};
  seen.forEach((r) => { const tp = totalPages[r.doc_id] || 1; comp[r.visitor_id] = Math.max(comp[r.visitor_id] || 0, Math.min(1, r.n / tp)); });
  const inv = Object.fromEntries(db.all('SELECT * FROM investors').map((i) => [i.email, i]));
  return rows.map((r) => {
    const o = { ...r, completion: comp[r.id] || 0, investor: inv[r.email] || null };
    o.score = score(o); o.heat = o.score >= 70 ? 'hot' : o.score >= 40 ? 'warm' : 'cold';
    return o;
  });
}
function pageStats(docId, where = '', ...args) {
  const doc = db.get('SELECT * FROM documents WHERE id=?', docId);
  if (!doc) return null;
  const rows = db.all(`SELECT pt.page, SUM(pt.ms) ms, COUNT(DISTINCT s.visitor_id) reached FROM page_time pt JOIN sessions s ON s.id=pt.session_id WHERE pt.doc_id=? AND pt.ms>=1000 ${where} GROUP BY pt.page`, docId, ...args);
  const viewers = db.get(`SELECT COUNT(DISTINCT s.visitor_id) n FROM sessions s WHERE s.id IN (SELECT session_id FROM page_time WHERE doc_id=?) ${where}`, docId, ...args).n || 0;
  const m = Object.fromEntries(rows.map((r) => [r.page, r]));
  const pages = [];
  for (let p = 1; p <= doc.pages; p++) {
    const r = m[p] || { ms: 0, reached: 0 };
    pages.push({ page: p, ms: r.ms, avg: r.reached ? r.ms / r.reached : 0, reached: r.reached, reach: viewers ? r.reached / viewers : 0 });
  }
  return { doc, viewers, pages };
}
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const visitors = visitorRows();
  const sess = db.get('SELECT COUNT(*) views, COALESCE(SUM(duration),0) ms FROM sessions');
  const docs = db.all('SELECT * FROM documents ORDER BY updated_at DESC');
  const docId = req.query.doc || (docs[0] && docs[0].id);
  const events = db.all(`SELECT e.*, v.email, v.name, l.name link_name FROM events e LEFT JOIN visitors v ON v.id=e.visitor_id LEFT JOIN links l ON l.id=e.link_id ORDER BY e.created_at DESC LIMIT 40`);
  const days = db.all(`SELECT strftime('%Y-%m-%d', started_at/1000, 'unixepoch') d, COUNT(*) n, COUNT(DISTINCT visitor_id) u FROM sessions WHERE started_at > ? GROUP BY d`, now() - 30 * 864e5);
  res.json({
    kpi: {
      views: sess.views, visitors: visitors.length, totalMs: sess.ms,
      avgMs: visitors.length ? sess.ms / visitors.length : 0,
      avgCompletion: visitors.length ? visitors.reduce((a, v) => a + v.completion, 0) / visitors.length : 0,
      hot: visitors.filter((v) => v.heat === 'hot').length,
      links: db.get('SELECT COUNT(*) n FROM links WHERE active=1').n,
    },
    hot: visitors.slice().sort((a, b) => b.score - a.score).slice(0, 8),
    events, days, docs, deck: docId ? pageStats(docId) : null,
  });
});
app.get('/api/admin/visitors', requireAdmin, (req, res) => {
  const v = visitorRows();
  const known = new Set(v.map((x) => x.email));
  const pending = db.all('SELECT * FROM investors').filter((i) => !known.has(i.email));
  res.json({ visitors: v, pending });
});
app.get('/api/admin/visitors/:id', requireAdmin, (req, res) => {
  const v = visitorRows('WHERE v.id=?', req.params.id)[0];
  if (!v) return res.sendStatus(404);
  const sessions = db.all('SELECT * FROM sessions WHERE visitor_id=? ORDER BY started_at DESC', v.id);
  const docIds = [...new Set(db.all('SELECT DISTINCT pt.doc_id FROM page_time pt JOIN sessions s ON s.id=pt.session_id WHERE s.visitor_id=?', v.id).map((r) => r.doc_id))];
  const decks = docIds.map((d) => pageStats(d, 'AND s.visitor_id=?', v.id)).filter(Boolean);
  const messages = db.all('SELECT * FROM messages WHERE visitor_id=? ORDER BY created_at DESC', v.id);
  const events = db.all('SELECT * FROM events WHERE visitor_id=? ORDER BY created_at DESC LIMIT 100', v.id);
  const others = db.all('SELECT id, email, link_id, last_seen FROM visitors WHERE email=? AND id<>?', v.email, v.id);
  res.json({ visitor: v, sessions, decks, messages, events, others });
});
app.get('/api/admin/links/:id/analytics', requireAdmin, (req, res) => {
  const l = db.get('SELECT * FROM links WHERE id=?', req.params.id);
  if (!l) return res.sendStatus(404);
  const docs = JSON.parse(l.doc_ids || '[]');
  res.json({ link: { ...l, password_hash: undefined }, visitors: visitorRows('WHERE v.link_id=?', l.id), decks: docs.map((d) => pageStats(d, 'AND s.link_id=?', l.id)).filter(Boolean) });
});
app.get('/api/admin/messages', requireAdmin, (req, res) => res.json(db.all(`SELECT m.*, v.email, v.name, l.name link_name, d.name doc_name FROM messages m LEFT JOIN visitors v ON v.id=m.visitor_id LEFT JOIN links l ON l.id=m.link_id LEFT JOIN documents d ON d.id=m.doc_id ORDER BY m.created_at DESC`)));
app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const v = visitorRows();
  const esc = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const head = ['email', 'name', 'firm', 'stage', 'link', 'visits', 'minutes', 'completion_%', 'score', 'heat', 'country', 'city', 'device', 'downloads', 'messages', 'forwarded', 'first_seen', 'last_seen'];
  const lines = v.map((r) => [r.email, r.name || r.investor?.name, r.investor?.firm, r.investor?.stage, r.link_name, r.visits, (r.ms / 60000).toFixed(1), Math.round(r.completion * 100), r.score, r.heat, r.country, r.city, r.device, r.downloads, r.messages, r.forwarded ? 'yes' : '', new Date(r.first_seen).toISOString(), new Date(r.last_seen).toISOString()].map(esc).join(','));
  res.set('Content-Type', 'text/csv').set('Content-Disposition', 'attachment; filename="deckroom-visitors.csv"').send([head.join(','), ...lines].join('\n'));
});

// ---------- Viewer ----------
function getLink(slug) { return db.get('SELECT * FROM links WHERE slug=?', slug); }
function linkState(l) {
  if (!l || !l.active) return 'gone';
  if (l.expires_at && l.expires_at < now()) return 'expired';
  return 'ok';
}
function emailAllowed(l, email) {
  const domain = email.split('@')[1] || '';
  const allow = listOf(l.allow_emails), block = listOf(l.block_emails), bdom = listOf(l.block_domains).map((d) => d.replace(/^@/, ''));
  if (block.includes(email) || bdom.includes(domain)) return false;
  if (allow.length) return allow.some((a) => a === email || a.replace(/^@/, '') === domain || (a.startsWith('@') && a.slice(1) === domain));
  return true;
}
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
function viewerCookie(l) { return 'dr_v_' + l.id; }
function currentVisitor(req, l) {
  const vid = req.signedCookies[viewerCookie(l)];
  return vid ? db.get('SELECT * FROM visitors WHERE id=? AND link_id=?', vid, l.id) : null;
}
function setVisitor(res, l, vid) { res.cookie(viewerCookie(l), vid, { signed: true, httpOnly: true, sameSite: 'lax', maxAge: 180 * 864e5 }); }
function logEvent(linkId, visitorId, type, meta = {}) { db.run('INSERT INTO events (link_id,visitor_id,type,meta,created_at) VALUES (?,?,?,?,?)', linkId, visitorId, type, JSON.stringify(meta), now()); }

function grantVisitor(req, res, l, email, name) {
  const device = req.signedCookies.dr_dev || id(12);
  res.cookie('dr_dev', device, { signed: true, httpOnly: true, sameSite: 'lax', maxAge: 365 * 864e5 });
  let v = email ? db.get('SELECT * FROM visitors WHERE link_id=? AND email=?', l.id, email) : null;
  const isNew = !v;
  if (!v) {
    const vid = id(12);
    let forwarded = 0;
    if (l.investor_email && email && email !== l.investor_email) forwarded = 1;
    const prior = db.get('SELECT email FROM visitors WHERE device=? AND email<>? AND email<>\'\' ORDER BY last_seen DESC LIMIT 1', device, email || '');
    db.run('INSERT INTO visitors (id,link_id,email,name,device,first_seen,last_seen,forwarded) VALUES (?,?,?,?,?,?,?,?)', vid, l.id, email || '', name || '', device, now(), now(), forwarded);
    v = db.get('SELECT * FROM visitors WHERE id=?', vid);
    if (forwarded) {
      logEvent(l.id, vid, 'forwarded', { from: l.investor_email, to: email, sameDevice: prior?.email || null });
      if (l.notify) notify.send(`Deck forwarded: ${email} opened ${l.investor_name || l.investor_email}'s link`, `${email} opened the link you sent to ${l.investor_email} (${l.name || l.slug}). This usually means it was forwarded inside the firm.`, `${BASE_URL}/admin#/visitor/${vid}`);
    }
  } else if (name && !v.name) db.run('UPDATE visitors SET name=? WHERE id=?', name, v.id);
  const sameFirm = email && l.investor_email && email.split('@')[1] === l.investor_email.split('@')[1];
  if (email) upsertInvestor(email, { name, firm: sameFirm ? l.firm : '', stage: 'Viewed' });
  setVisitor(res, l, v.id);
  return { v, isNew };
}

app.get('/api/v/:slug/meta', (req, res) => {
  const l = getLink(req.params.slug);
  const st = linkState(l);
  if (st !== 'ok') return res.status(410).json({ state: st, brand: BRAND });
  const v = currentVisitor(req, l);
  const docs = JSON.parse(l.doc_ids || '[]').map((d) => db.get('SELECT id,name,pages FROM documents WHERE id=?', d)).filter(Boolean);
  res.json({
    state: 'ok', brand: BRAND, sender: SENDER, title: docs[0]?.name || 'Deck', message: l.message || '',
    investorName: l.investor_name || '', prefillEmail: l.investor_email || '',
    gate: { email: !!l.require_email, verify: !!l.verify_email, password: !!l.password_hash },
    granted: !!v && (!l.password_hash || req.signedCookies['dr_pw_' + l.id] === l.password_hash.slice(0, 16)),
  });
});

const otpTries = new Map();
app.post('/api/v/:slug/access', async (req, res) => {
  const l = getLink(req.params.slug);
  if (linkState(l) !== 'ok') return res.status(410).json({ error: 'This link is no longer active.' });
  const email = clean(req.body.email, 200).toLowerCase();
  const name = clean(req.body.name, 120);
  if (l.password_hash && hash(String(req.body.password || '')) !== l.password_hash) return res.status(401).json({ error: 'Incorrect password.' });
  if (l.require_email && !validEmail(email)) return res.status(400).json({ error: 'Enter a valid work email.' });
  if (email && !emailAllowed(l, email)) { logEvent(l.id, null, 'blocked', { email }); return res.status(403).json({ error: 'This email does not have access. Ask the sender for an invite.' }); }
  if (l.password_hash) res.cookie('dr_pw_' + l.id, l.password_hash.slice(0, 16), { signed: true, httpOnly: true, sameSite: 'lax', maxAge: 180 * 864e5 });
  if (l.verify_email) {
    const already = db.get('SELECT * FROM visitors WHERE link_id=? AND email=? AND verified=1', l.id, email);
    if (already && req.signedCookies.dr_dev && already.device === req.signedCookies.dr_dev) { setVisitor(res, l, already.id); return res.json({ ok: true }); }
    const code = String(crypto.randomInt(100000, 999999));
    db.run('INSERT OR REPLACE INTO otps (link_id,email,code,expires_at,name) VALUES (?,?,?,?,?)', l.id, email, code, now() + 15 * 60000, name);
    await notify.sendTo(email, `Your ${BRAND} access code: ${code}`, `Your code to view "${l.name || 'the deck'}" from ${SENDER} at ${BRAND} is:\n\n${code}\n\nIt expires in 15 minutes.`);
    if (!notify.emailEnabled()) console.log(`[otp] ${email} -> ${code} (SMTP not configured)`);
    return res.json({ verify: true, devCode: notify.emailEnabled() ? undefined : (process.env.NODE_ENV === 'production' ? undefined : code) });
  }
  grantVisitor(req, res, l, email, name);
  res.json({ ok: true });
});
app.post('/api/v/:slug/verify', (req, res) => {
  const l = getLink(req.params.slug);
  if (linkState(l) !== 'ok') return res.status(410).json({ error: 'This link is no longer active.' });
  const email = clean(req.body.email, 200).toLowerCase();
  const key = l.id + email; const tries = (otpTries.get(key) || 0) + 1; otpTries.set(key, tries);
  if (tries > 8) return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
  const o = db.get('SELECT * FROM otps WHERE link_id=? AND email=?', l.id, email);
  if (!o || o.expires_at < now() || o.code !== clean(req.body.code, 10)) return res.status(401).json({ error: 'That code is not right.' });
  db.run('DELETE FROM otps WHERE link_id=? AND email=?', l.id, email); otpTries.delete(key);
  const { v } = grantVisitor(req, res, l, email, o.name);
  db.run('UPDATE visitors SET verified=1, device=? WHERE id=?', req.signedCookies.dr_dev || v.device, v.id);
  logEvent(l.id, v.id, 'verified', {});
  res.json({ ok: true });
});
// open links (no email gate) auto-grant an anonymous visitor
app.post('/api/v/:slug/anon', (req, res) => {
  const l = getLink(req.params.slug);
  if (linkState(l) !== 'ok' || l.require_email || l.password_hash) return res.status(403).json({ error: 'no' });
  if (!currentVisitor(req, l)) grantVisitor(req, res, l, '', '');
  res.json({ ok: true });
});

function viewerGuard(req, res) {
  const l = getLink(req.params.slug);
  if (linkState(l) !== 'ok') { res.status(410).json({ error: 'gone' }); return null; }
  const v = currentVisitor(req, l);
  if (!v) { res.status(401).json({ error: 'auth' }); return null; }
  if (l.password_hash && req.signedCookies['dr_pw_' + l.id] !== l.password_hash.slice(0, 16)) { res.status(401).json({ error: 'auth' }); return null; }
  const docIds = JSON.parse(l.doc_ids || '[]');
  return { l, v, docIds };
}
app.get('/api/v/:slug/content', (req, res) => {
  const g = viewerGuard(req, res); if (!g) return;
  const docs = g.docIds.map((d) => db.get('SELECT id,name,pages,ratio,version FROM documents WHERE id=?', d)).filter(Boolean);
  res.json({ docs, allowDownload: !!g.l.allow_download, cta: g.l.cta_url ? { url: g.l.cta_url, label: g.l.cta_label || 'Book a Call' } : null, watermark: g.l.watermark ? (g.v.email || 'Confidential') : '', viewer: { email: g.v.email, name: g.v.name } });
});
const wmCache = new Map();
app.get('/api/v/:slug/doc/:doc/page/:n', async (req, res) => {
  const g = viewerGuard(req, res); if (!g) return;
  if (!g.docIds.includes(req.params.doc)) return res.sendStatus(404);
  const doc = db.get('SELECT * FROM documents WHERE id=?', req.params.doc);
  const n = parseInt(req.params.n);
  if (!doc || !(n >= 1 && n <= doc.pages)) return res.sendStatus(404);
  const file = path.join(docDir(doc), `page-${n}.jpg`);
  res.set('Cache-Control', 'private, no-store');
  if (!g.l.watermark) return res.type('jpg').sendFile(file);
  const key = `${doc.id}:${doc.version}:${n}:${g.v.id}`;
  if (wmCache.has(key)) return res.type('jpg').send(wmCache.get(key));
  const meta = await sharp(file).metadata();
  const label = `${g.v.email || 'Confidential'} · ${new Date().toISOString().slice(0, 10)} · ${BRAND} confidential`.replace(/[<>&"]/g, '');
  const W = meta.width, H = meta.height, fs_ = Math.round(W / 70);
  let rows = '';
  for (let y = -H; y < H * 2; y += fs_ * 9) for (let x = -W; x < W * 2; x += label.length * fs_ * 0.62 + fs_ * 6) rows += `<text x="${x}" y="${y}">${label}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><g transform="rotate(-24 ${W / 2} ${H / 2})" font-family="Helvetica, Arial, sans-serif" font-size="${fs_}" fill="#1e1a17" fill-opacity="0.075">${rows}</g></svg>`;
  const out = await sharp(file).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 84 }).toBuffer();
  if (wmCache.size > 400) wmCache.delete(wmCache.keys().next().value);
  wmCache.set(key, out);
  res.type('jpg').send(out);
});
app.get('/api/v/:slug/doc/:doc/download', (req, res) => {
  const g = viewerGuard(req, res); if (!g) return;
  if (!g.l.allow_download || !g.docIds.includes(req.params.doc)) return res.sendStatus(403);
  const doc = db.get('SELECT * FROM documents WHERE id=?', req.params.doc);
  logEvent(g.l.id, g.v.id, 'download', { doc: doc.name });
  if (g.l.notify) notify.send(`${g.v.email || 'A visitor'} downloaded ${doc.name}`, `${g.v.email || 'An anonymous visitor'} downloaded "${doc.name}" via ${g.l.name || g.l.slug}.`, `${BASE_URL}/admin#/visitor/${g.v.id}`);
  res.download(path.join(docDir(doc), 'original.pdf'), `${doc.name}.pdf`);
});

// geo + device
const geoCache = new Map();
async function geo(req) {
  const h = req.headers;
  let country = h['cf-ipcountry'] || h['x-vercel-ip-country'] || h['x-country-code'] || '';
  let city = h['x-vercel-ip-city'] ? decodeURIComponent(h['x-vercel-ip-city']) : (h['cf-ipcity'] || '');
  const ip = (req.ip || '').replace(/^::ffff:/, '');
  if ((!country || !city) && process.env.GEO_LOOKUP !== 'off' && ip && !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/.test(ip)) {
    if (!geoCache.has(ip)) {
      try {
        const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2500) });
        const j = await r.json(); geoCache.set(ip, { country: j.country_name || j.country || '', city: j.city || '' });
      } catch { geoCache.set(ip, { country: '', city: '' }); }
    }
    const g = geoCache.get(ip); country = country || g.country; city = city || g.city;
  }
  return { ip, country, city };
}
function device(ua = '') {
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const kind = /Mobi|iPhone|Android/.test(ua) ? 'Mobile' : /iPad|Tablet/.test(ua) ? 'Tablet' : 'Desktop';
  return `${kind} · ${os} · ${br}`;
}

app.post('/api/v/:slug/session', async (req, res) => {
  const g = viewerGuard(req, res); if (!g) return;
  const { ip, country, city } = await geo(req);
  const sid = id(14);
  const prev = db.get('SELECT COUNT(*) n FROM sessions WHERE visitor_id=?', g.v.id).n;
  db.run('INSERT INTO sessions (id,link_id,visitor_id,started_at,last_ping,duration,ip,country,city,device,referrer) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    sid, g.l.id, g.v.id, now(), now(), 0, ip, country, city, device(req.headers['user-agent']), clean(req.body.referrer, 300));
  db.run('UPDATE visitors SET last_seen=? WHERE id=?', now(), g.v.id);
  logEvent(g.l.id, g.v.id, prev ? 'return' : 'open', { country, city });
  if (g.l.notify) {
    const who = g.v.email || 'Someone (no email)';
    const where = [city, country].filter(Boolean).join(', ');
    notify.send(prev ? `${who} is back on your deck (visit ${prev + 1})` : `${who} just opened your deck`,
      `${who}${g.v.name ? ' (' + g.v.name + ')' : ''} ${prev ? 'returned to' : 'opened'} "${g.l.name || g.l.slug}"${where ? ' from ' + where : ''}.`, `${BASE_URL}/admin#/visitor/${g.v.id}`);
  }
  res.json({ sessionId: sid });
});
app.post('/api/v/:slug/track', (req, res) => {
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  const l = getLink(req.params.slug); if (!l) return res.sendStatus(404);
  const v = currentVisitor(req, l); if (!v) return res.sendStatus(401);
  const s = db.get('SELECT * FROM sessions WHERE id=? AND visitor_id=?', clean(b.sessionId, 40), v.id); if (!s) return res.sendStatus(404);
  const docIds = JSON.parse(l.doc_ids || '[]');
  let added = 0;
  const tx = db.tx(() => {
    for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, 50)) {
      const ms = Math.max(0, Math.min(Number(it.ms) || 0, 120000)); const page = parseInt(it.page);
      if (!ms || !docIds.includes(it.doc) || !(page > 0 && page < 2000)) continue;
      db.run('INSERT INTO page_time (session_id,doc_id,page,ms,views) VALUES (?,?,?,?,1) ON CONFLICT(session_id,doc_id,page) DO UPDATE SET ms=ms+excluded.ms', s.id, it.doc, page, ms);
      added += ms;
    }
    db.run('UPDATE sessions SET duration=duration+?, last_ping=? WHERE id=?', added, now(), s.id);
    db.run('UPDATE visitors SET last_seen=? WHERE id=?', now(), v.id);
  });
  tx();
  res.json({ ok: true });
});
app.post('/api/v/:slug/message', (req, res) => {
  const g = viewerGuard(req, res); if (!g) return;
  const body = clean(req.body.body, 4000); if (!body) return res.status(400).json({ error: 'Empty' });
  const doc = g.docIds.includes(req.body.doc) ? req.body.doc : g.docIds[0];
  db.run('INSERT INTO messages (link_id,visitor_id,doc_id,page,body,created_at) VALUES (?,?,?,?,?,?)', g.l.id, g.v.id, doc, parseInt(req.body.page) || null, body, now());
  logEvent(g.l.id, g.v.id, 'message', { page: req.body.page });
  if (g.v.email) upsertInvestor(g.v.email, { stage: 'Engaged' });
  notify.send(`Question from ${g.v.email || 'a viewer'} on slide ${req.body.page}`, `${body}\n\n${g.v.email ? 'Reply to: ' + g.v.email : ''}`, `${BASE_URL}/admin#/messages`, g.v.email);
  res.json({ ok: true });
});
app.post('/api/v/:slug/cta', (req, res) => {
  const g = viewerGuard(req, res); if (!g) return;
  logEvent(g.l.id, g.v.id, 'cta', {});
  if (g.v.email) upsertInvestor(g.v.email, { stage: 'Engaged' });
  notify.send(`${g.v.email || 'A viewer'} clicked "${g.l.cta_label || 'Book a Call'}"`, `${g.v.email || 'A viewer'} clicked your call to action on ${g.l.name || g.l.slug}.`, `${BASE_URL}/admin#/visitor/${g.v.id}`);
  res.json({ ok: true });
});

// ---------- Pages ----------
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.get('/v/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'view.html')));
app.get(['/admin', '/'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/healthz', (req, res) => res.send('ok'));

// ---------- Seed ----------
async function seed() {
  if (db.get('SELECT COUNT(*) n FROM documents').n) return;
  const dir = path.join(__dirname, 'seed');
  if (!fs.existsSync(dir)) return;
  const pdf = fs.readdirSync(dir).find((f) => /\.pdf$/i.test(f));
  if (!pdf) return;
  const did = id(8);
  const { pages, ratio } = await processPdf(did, 1, path.join(dir, pdf));
  db.run('INSERT INTO documents (id,name,version,pages,ratio,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', did, process.env.SEED_NAME || 'Oyster Seed Deck', 1, pages, ratio, now(), now());
  console.log(`[seed] imported ${pdf} (${pages} pages)`);
}
seed().catch((e) => console.error('[seed]', e.message)).finally(() => {
  app.listen(PORT, () => console.log(`DeckRoom running on ${BASE_URL}  (admin: ${BASE_URL}/admin)`));
});
