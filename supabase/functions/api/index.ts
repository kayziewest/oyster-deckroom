// Oyster DeckRoom API: one Supabase Edge Function.
// Deploy with "Verify JWT" OFF. Secrets: ADMIN_PASSWORD, SESSION_SECRET, SITE_URL,
// optional RESEND_API_KEY, FROM_EMAIL, NOTIFY_EMAIL, SLACK_WEBHOOK_URL, BRAND_NAME, SENDER_NAME.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;
const ADMIN_PASSWORD = env('ADMIN_PASSWORD');
const SECRET = env('SESSION_SECRET') || ('deckroom:' + ADMIN_PASSWORD);
const SITE = env('SITE_URL', 'http://localhost:8080').replace(/\/$/, '');
const BRAND = env('BRAND_NAME', 'Oyster');
const SENDER = env('SENDER_NAME', 'Jude');
const BUCKET = 'decks';

const sql = postgres(env('SUPABASE_DB_URL') || env('DATABASE_URL'), {
  prepare: false, max: 3, idle_timeout: 20,
  types: {
    int8: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
    numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
  },
});
const q = (text: string, ...args: unknown[]) => { let i = 0; return sql.unsafe(text.replace(/\?/g, () => '$' + (++i)), args as never[]) as Promise<any[]>; };
const one = async (text: string, ...args: unknown[]) => (await q(text, ...args))[0];

// ---------- first run: create tables and the private bucket ----------
const SCHEMA = `-- Oyster DeckRoom schema. Paste into Supabase SQL Editor and run once.
-- All access goes through the api Edge Function (service role). RLS is on with no policies,
-- so the public anon key can read nothing.

create table if not exists documents (
  id text primary key, name text, version int default 0, pending_version int, pages int default 0, ratio real default 0.5625,
  created_at bigint, updated_at bigint
);
create table if not exists links (
  id text primary key, slug text unique, name text, investor_name text, investor_email text, firm text, doc_ids text default '[]',
  require_email int default 1, verify_email int default 0, allow_download int default 0, watermark int default 1, password_hash text,
  expires_at bigint, allow_emails text, block_emails text, block_domains text, notify int default 1, cta_url text, cta_label text, message text,
  active int default 1, created_at bigint
);
create table if not exists visitors (
  id text primary key, link_id text references links(id) on delete cascade, email text, name text, device text,
  verified int default 0, forwarded int default 0, first_seen bigint, last_seen bigint
);
create index if not exists ix_vis_link on visitors(link_id, email);
create table if not exists sessions (
  id text primary key, link_id text references links(id) on delete cascade, visitor_id text references visitors(id) on delete cascade,
  started_at bigint, last_ping bigint, duration bigint default 0, ip text, country text, city text, device text, referrer text
);
create index if not exists ix_sess_vis on sessions(visitor_id);
create table if not exists page_time (
  session_id text references sessions(id) on delete cascade, doc_id text, page int, ms bigint default 0, views int default 1,
  primary key (session_id, doc_id, page)
);
create table if not exists messages (
  id bigserial primary key, link_id text, visitor_id text references visitors(id) on delete cascade, doc_id text, page int, body text, created_at bigint
);
create table if not exists events (id bigserial primary key, link_id text, visitor_id text, type text, meta text, created_at bigint);
create table if not exists otps (link_id text, email text, code text, expires_at bigint, name text, tries int default 0, primary key (link_id, email));
create table if not exists investors (email text primary key, name text, firm text, stage text, notes text, updated_at bigint);

alter table documents enable row level security;
alter table links enable row level security;
alter table visitors enable row level security;
alter table sessions enable row level security;
alter table page_time enable row level security;
alter table messages enable row level security;
alter table events enable row level security;
alter table otps enable row level security;
alter table investors enable row level security;

`;
let ready: Promise<void> | null = null;
const bootstrap = () => (ready ??= (async () => {
  const has = await one(`SELECT to_regclass('public.links') t`);
  if (!has?.t) await sql.unsafe(SCHEMA);
  if (sb) { const { data } = await sb.storage.getBucket(BUCKET); if (!data) await sb.storage.createBucket(BUCKET, { public: false }); }
})().catch((e) => { ready = null; throw e; }));

// ---------- storage (Supabase, or local folder for tests) ----------
const LOCAL = env('LOCAL_STORAGE_DIR');
const sb = LOCAL ? null : createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
let FN_BASE = '';
const store = {
  async uploadUrl(path: string) {
    if (LOCAL) return `${FN_BASE}/_local/put?p=${encodeURIComponent(path)}&s=${await sign('put:' + path)}`;
    const { data, error } = await sb!.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error) throw error; return data.signedUrl;
  },
  async urls(paths: string[], ttl: number, download?: string) {
    if (!paths.length) return [];
    if (LOCAL) return Promise.all(paths.map(async (p) => `${FN_BASE}/_local/get?p=${encodeURIComponent(p)}&s=${await sign('get:' + p)}`));
    if (download) {
      const { data, error } = await sb!.storage.from(BUCKET).createSignedUrl(paths[0], ttl, { download });
      if (error) throw error; return [data.signedUrl];
    }
    const { data, error } = await sb!.storage.from(BUCKET).createSignedUrls(paths, ttl);
    if (error) throw error; return data.map((d: any) => d.signedUrl);
  },
  async removePrefix(prefix: string) {
    if (LOCAL) { await Deno.remove(`${LOCAL}/${prefix}`, { recursive: true }).catch(() => {}); return; }
    const all: string[] = [];
    const walk = async (p: string) => {
      const { data } = await sb!.storage.from(BUCKET).list(p, { limit: 1000 });
      for (const f of data || []) { const full = `${p}/${f.name}`; if (f.id) all.push(full); else await walk(full); }
    };
    await walk(prefix);
    for (let i = 0; i < all.length; i += 100) await sb!.storage.from(BUCKET).remove(all.slice(i, i + 100));
  },
};

// ---------- helpers ----------
const now = () => Date.now();
const enc = new TextEncoder();
let keyP: Promise<CryptoKey> | null = null;
const key = () => (keyP ??= crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
async function sign(s: string) { const b = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(s))); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32); }
async function hash(s: string) { const b = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(SECRET + s))); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); }
function rid(n = 10) { const a = new Uint8Array(n); crypto.getRandomValues(a); const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; return [...a].map((x) => c[x % c.length]).join(''); }
const clean = (s: unknown, n = 300) => (s == null ? '' : String(s).trim().slice(0, n));
const listOf = (s: unknown) => clean(s, 5000).split(/[\s,;]+/).map((x) => x.toLowerCase()).filter(Boolean);
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const slugify = (s: unknown) => clean(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const parseDocs = (l: any): string[] => { try { return JSON.parse(l.doc_ids || '[]'); } catch { return []; } };
const bg = (p: Promise<unknown>) => { const w = (globalThis as any).EdgeRuntime?.waitUntil; if (w) w.call((globalThis as any).EdgeRuntime, p.catch((e) => console.error(e))); else p.catch((e) => console.error(e)); };

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const fail = (status: number, msg: string): never => { throw new HttpError(status, msg); };

// ---------- notifications ----------
const emailOn = () => !!env('RESEND_API_KEY') && !!env('FROM_EMAIL');
const slackOn = () => !!env('SLACK_WEBHOOK_URL');
async function sendTo(to: string, subject: string, text: string, replyTo?: string) {
  if (!emailOn() || !to) return;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env('FROM_EMAIL'), to: [to], subject, text, reply_to: replyTo || undefined }),
  });
  if (!r.ok) console.error('[mail]', r.status, await r.text());
}
function notify(subject: string, text: string, url?: string, replyTo?: string) {
  console.log('[notify]', subject);
  const body = `${text}${url ? `\n\nOpen in DeckRoom: ${url}` : ''}`;
  if (env('NOTIFY_EMAIL')) bg(sendTo(env('NOTIFY_EMAIL'), subject, body, replyTo));
  if (slackOn()) bg(fetch(env('SLACK_WEBHOOK_URL'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `*${subject}*\n${text}${url ? `\n<${url}|Open in DeckRoom>` : ''}` }) }));
}
const adminUrl = (h: string) => `${SITE}/admin/#/${h}`;

// ---------- admin auth ----------
async function adminToken() { const exp = now() + 30 * 864e5; return `a.${exp}.${await sign('admin:' + exp + ':' + (await hash(ADMIN_PASSWORD)).slice(0, 12))}`; }
async function isAdmin(req: Request) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [p, exp, sig] = t.split('.');
  if (p !== 'a' || !exp || Number(exp) < now()) return false;
  return sig === await sign('admin:' + exp + ':' + (await hash(ADMIN_PASSWORD)).slice(0, 12));
}

// ---------- viewer auth ----------
async function viewerToken(l: any, vid: string) { const pw = (l.password_hash || '').slice(0, 10); return `v.${l.id}.${vid}.${await sign(`v:${l.id}:${vid}:${pw}`)}`; }
async function currentVisitor(req: Request, l: any) {
  const t = req.headers.get('x-dr-viewer') || '';
  const [p, lid, vid, sig] = t.split('.');
  if (p !== 'v' || lid !== l.id || !vid) return null;
  if (sig !== await sign(`v:${l.id}:${vid}:${(l.password_hash || '').slice(0, 10)}`)) return null;
  return await one('SELECT * FROM visitors WHERE id=? AND link_id=?', vid, l.id) || null;
}

// ---------- pages / analytics ----------
function score(v: any) {
  const comp = v.completion || 0, t = (v.ms || 0) / 1000, visits = v.visits || 0;
  return Math.round(Math.min(100, comp * 45 + Math.min(t / 360, 1) * 35 + Math.min(Math.max(visits - 1, 0), 2) * 7.5 + (v.messages ? 5 : 0) + (v.cta ? 5 : 0)));
}
async function visitorRows(where = '', ...args: unknown[]) {
  const rows = await q(`
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
  const totalPages = Object.fromEntries((await q('SELECT id, pages FROM documents')).map((d) => [d.id, d.pages]));
  const seen = await q(`SELECT s.visitor_id, pt.doc_id, COUNT(DISTINCT pt.page) n FROM page_time pt JOIN sessions s ON s.id=pt.session_id WHERE pt.ms>=1500 GROUP BY s.visitor_id, pt.doc_id`);
  const comp: Record<string, number> = {};
  seen.forEach((r) => { const tp = totalPages[r.doc_id] || 1; comp[r.visitor_id] = Math.max(comp[r.visitor_id] || 0, Math.min(1, r.n / tp)); });
  const inv = Object.fromEntries((await q('SELECT * FROM investors')).map((i) => [i.email, i]));
  return rows.map((r) => {
    const o: any = { ...r, completion: comp[r.id] || 0, investor: inv[r.email] || null };
    o.score = score(o); o.heat = o.score >= 70 ? 'hot' : o.score >= 40 ? 'warm' : 'cold';
    return o;
  });
}
async function pageStats(docId: string, where = '', ...args: unknown[]) {
  const doc = await one('SELECT * FROM documents WHERE id=?', docId);
  if (!doc || !doc.version) return null;
  const rows = await q(`SELECT pt.page, SUM(pt.ms) ms, COUNT(DISTINCT s.visitor_id) reached FROM page_time pt JOIN sessions s ON s.id=pt.session_id WHERE pt.doc_id=? AND pt.ms>=1000 ${where} GROUP BY pt.page`, docId, ...args);
  const viewers = (await one(`SELECT COUNT(DISTINCT s.visitor_id) n FROM sessions s WHERE s.id IN (SELECT session_id FROM page_time WHERE doc_id=?) ${where}`, docId, ...args)).n || 0;
  const m = Object.fromEntries(rows.map((r) => [r.page, r]));
  const pages = [];
  for (let p = 1; p <= doc.pages; p++) {
    const r = m[p] || { ms: 0, reached: 0 };
    pages.push({ page: p, ms: r.ms, avg: r.reached ? r.ms / r.reached : 0, reached: r.reached, reach: viewers ? r.reached / viewers : 0 });
  }
  return { doc, viewers, pages };
}
async function upsertInvestor(email: string, f: any = {}) {
  email = (email || '').toLowerCase(); if (!email) return;
  const ex = await one('SELECT * FROM investors WHERE email=?', email);
  if (!ex) { await q('INSERT INTO investors (email,name,firm,stage,notes,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT (email) DO NOTHING', email, f.name || '', f.firm || '', f.stage || 'Viewed', '', now()); return; }
  const order = ['Shared', 'Viewed', 'Engaged', 'Meeting', 'Due diligence', 'Committed', 'Passed'];
  const stage = f.stage && order.indexOf(f.stage) > order.indexOf(ex.stage) && ex.stage !== 'Passed' ? f.stage : ex.stage;
  await q(`UPDATE investors SET name=COALESCE(NULLIF(name,''),?), firm=COALESCE(NULLIF(firm,''),?), stage=?, updated_at=? WHERE email=?`, f.name || '', f.firm || '', stage, now(), email);
}
const logEvent = (linkId: string, visitorId: string | null, type: string, meta: any = {}) => q('INSERT INTO events (link_id,visitor_id,type,meta,created_at) VALUES (?,?,?,?,?)', linkId, visitorId, type, JSON.stringify(meta), now());
const docPrefix = (d: any, v = d.version) => `${d.id}/v${v}`;
async function docAssets(d: any, ttl: number, kind: 'page' | 'thumb') {
  const paths = Array.from({ length: d.pages }, (_, i) => `${docPrefix(d)}/${kind}-${i + 1}.jpg`);
  return store.urls(paths, ttl);
}

// ---------- links ----------
const LINK_FIELDS = ['name', 'investor_name', 'investor_email', 'firm', 'doc_ids', 'require_email', 'verify_email', 'allow_download',
  'watermark', 'expires_at', 'allow_emails', 'block_emails', 'block_domains', 'notify', 'cta_url', 'cta_label', 'active', 'message'];
function linkPayload(b: any) {
  const o: any = {};
  for (const f of LINK_FIELDS) if (f in b) o[f] = b[f];
  ['require_email', 'verify_email', 'allow_download', 'watermark', 'notify', 'active'].forEach((k) => { if (k in o) o[k] = o[k] ? 1 : 0; });
  if ('doc_ids' in o) o.doc_ids = JSON.stringify((Array.isArray(o.doc_ids) ? o.doc_ids : []).slice(0, 30).map(String));
  if ('expires_at' in o) o.expires_at = o.expires_at ? (Number(new Date(o.expires_at)) + 864e5 - 1) || null : null;
  ['name', 'investor_name', 'firm', 'cta_label'].forEach((k) => { if (k in o) o[k] = clean(o[k], 120); });
  if ('investor_email' in o) o.investor_email = clean(o.investor_email, 200).toLowerCase();
  ['allow_emails', 'block_emails', 'block_domains', 'message'].forEach((k) => { if (k in o) o[k] = clean(o[k], 3000); });
  if ('cta_url' in o) o.cta_url = /^https?:\/\//i.test(o.cta_url || '') ? clean(o.cta_url, 500) : '';
  if (o.verify_email) o.require_email = 1;
  return o;
}
const linkState = (l: any) => (!l || !l.active ? 'gone' : l.expires_at && l.expires_at < now() ? 'expired' : 'ok');
function emailAllowed(l: any, email: string) {
  const domain = email.split('@')[1] || '';
  const allow = listOf(l.allow_emails), block = listOf(l.block_emails), bdom = listOf(l.block_domains).map((d) => d.replace(/^@/, ''));
  if (block.includes(email) || bdom.includes(domain)) return false;
  if (allow.length) return allow.some((a) => a === email || a.replace(/^@/, '') === domain);
  return true;
}

// ---------- geo + device ----------
const geoCache = new Map<string, { country: string; city: string }>();
async function geo(req: Request) {
  const h = req.headers;
  const ip = (h.get('cf-connecting-ip') || h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || '').trim();
  let country = h.get('cf-ipcountry') || '', city = '';
  if (ip && env('GEO_LOOKUP') !== 'off' && !/^(127\.|10\.|192\.168\.|::1)/.test(ip)) {
    if (!geoCache.has(ip)) {
      try { const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2500) }); const j = await r.json(); geoCache.set(ip, { country: j.country_name || '', city: j.city || '' }); }
      catch { geoCache.set(ip, { country: '', city: '' }); }
    }
    const g = geoCache.get(ip)!; country = g.country || country; city = g.city;
  }
  return { ip, country, city };
}
function device(ua = '') {
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const kind = /iPad|Tablet/.test(ua) ? 'Tablet' : /Mobi|iPhone|Android/.test(ua) ? 'Mobile' : 'Desktop';
  return `${kind} · ${os} · ${br}`;
}

// ---------- routes ----------
type Ctx = { req: Request; url: URL; body: any; parts: string[] };
async function grantVisitor(c: Ctx, l: any, email: string, name: string) {
  const dev = clean(c.req.headers.get('x-dr-device'), 40) || rid(12);
  let v = email ? await one('SELECT * FROM visitors WHERE link_id=? AND email=?', l.id, email) : null;
  if (!v) {
    const vid = rid(12);
    const forwarded = l.investor_email && email && email !== l.investor_email ? 1 : 0;
    const prior = await one(`SELECT email FROM visitors WHERE device=? AND email<>? AND email<>'' ORDER BY last_seen DESC LIMIT 1`, dev, email || '');
    await q('INSERT INTO visitors (id,link_id,email,name,device,first_seen,last_seen,forwarded) VALUES (?,?,?,?,?,?,?,?)', vid, l.id, email || '', name || '', dev, now(), now(), forwarded);
    v = await one('SELECT * FROM visitors WHERE id=?', vid);
    if (forwarded) {
      await logEvent(l.id, vid, 'forwarded', { from: l.investor_email, to: email, sameDevice: prior?.email || null });
      if (l.notify) notify(`Deck forwarded: ${email} opened ${l.investor_name || l.investor_email}'s link`, `${email} opened the link you sent to ${l.investor_email} (${l.name || l.slug}). It was likely forwarded inside the firm.`, adminUrl('visitor/' + vid));
    }
  } else if (name && !v.name) await q('UPDATE visitors SET name=? WHERE id=?', name, v.id);
  const sameFirm = email && l.investor_email && email.split('@')[1] === l.investor_email.split('@')[1];
  if (email) await upsertInvestor(email, { name, firm: sameFirm ? l.firm : '', stage: 'Viewed' });
  return { v, token: await viewerToken(l, v.id) };
}
async function viewerGuard(c: Ctx, slug: string) {
  const l = await one('SELECT * FROM links WHERE slug=?', slug);
  if (linkState(l) !== 'ok') fail(410, 'gone');
  const v = await currentVisitor(c.req, l);
  if (!v) fail(401, 'auth');
  return { l, v, docIds: parseDocs(l) };
}

async function viewer(c: Ctx, slug: string, action: string, sub: string[]): Promise<any> {
  const b = c.body;
  if (action === 'meta') {
    const l = await one('SELECT * FROM links WHERE slug=?', slug);
    const st = linkState(l);
    if (st !== 'ok') fail(410, st);
    const v = await currentVisitor(c.req, l);
    const first = parseDocs(l)[0];
    const d = first ? await one('SELECT name FROM documents WHERE id=?', first) : null;
    return { state: 'ok', brand: BRAND, sender: SENDER, title: d?.name || 'Deck', message: l.message || '', investorName: l.investor_name || '', prefillEmail: l.investor_email || '',
      gate: { email: !!l.require_email, verify: !!l.verify_email, password: !!l.password_hash }, granted: !!v };
  }
  if (action === 'access') {
    const l = await one('SELECT * FROM links WHERE slug=?', slug);
    if (linkState(l) !== 'ok') fail(410, 'This link is no longer active.');
    const email = clean(b.email, 200).toLowerCase(), name = clean(b.name, 120);
    if (l.password_hash && await hash(String(b.password || '')) !== l.password_hash) fail(401, 'Incorrect password.');
    if (l.require_email && !validEmail(email)) fail(400, 'Enter a valid work email.');
    if (email && !emailAllowed(l, email)) { await logEvent(l.id, null, 'blocked', { email }); fail(403, 'This email does not have access. Ask the sender for an invite.'); }
    if (l.verify_email) {
      const dev = clean(c.req.headers.get('x-dr-device'), 40);
      const already = await one('SELECT * FROM visitors WHERE link_id=? AND email=? AND verified=1', l.id, email);
      if (already && dev && already.device === dev) return { ok: true, token: await viewerToken(l, already.id) };
      if (!emailOn() && env('DEV') !== '1') fail(503, 'Email codes are not set up yet. Ask the sender for a new link.');
      const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      await q('INSERT INTO otps (link_id,email,code,expires_at,name,tries) VALUES (?,?,?,?,?,0) ON CONFLICT (link_id,email) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, name=excluded.name, tries=0', l.id, email, code, now() + 15 * 60000, name);
      await sendTo(email, `Your ${BRAND} access code: ${code}`, `Your code to view the deck ${SENDER} at ${BRAND} shared with you:\n\n${code}\n\nIt expires in 15 minutes.`);
      return { verify: true, devCode: env('DEV') === '1' ? code : undefined };
    }
    const { token } = await grantVisitor(c, l, email, name);
    return { ok: true, token };
  }
  if (action === 'verify') {
    const l = await one('SELECT * FROM links WHERE slug=?', slug);
    if (linkState(l) !== 'ok') fail(410, 'This link is no longer active.');
    const email = clean(b.email, 200).toLowerCase();
    const o = await one('SELECT * FROM otps WHERE link_id=? AND email=?', l.id, email);
    if (!o) fail(401, 'That code is not right.');
    if (o.tries >= 8) fail(429, 'Too many attempts. Request a new code.');
    if (o.expires_at < now() || o.code !== clean(b.code, 10)) { await q('UPDATE otps SET tries=tries+1 WHERE link_id=? AND email=?', l.id, email); fail(401, 'That code is not right.'); }
    await q('DELETE FROM otps WHERE link_id=? AND email=?', l.id, email);
    const { v, token } = await grantVisitor(c, l, email, o.name);
    await q('UPDATE visitors SET verified=1, device=? WHERE id=?', clean(c.req.headers.get('x-dr-device'), 40) || v.device, v.id);
    await logEvent(l.id, v.id, 'verified', {});
    return { ok: true, token };
  }
  if (action === 'anon') {
    const l = await one('SELECT * FROM links WHERE slug=?', slug);
    if (linkState(l) !== 'ok' || l.require_email || l.password_hash) fail(403, 'no');
    const v = await currentVisitor(c.req, l);
    if (v) return { ok: true, token: c.req.headers.get('x-dr-viewer') };
    const { token } = await grantVisitor(c, l, '', '');
    return { ok: true, token };
  }

  const g = await viewerGuard(c, slug);
  if (action === 'content') {
    const docs = [];
    for (const id of g.docIds) {
      const d = await one('SELECT id,name,pages,ratio,version FROM documents WHERE id=? AND version>0', id);
      if (d) docs.push({ ...d, urls: await docAssets(d, 4 * 3600, 'page') });
    }
    return { docs, allowDownload: !!g.l.allow_download, cta: g.l.cta_url ? { url: g.l.cta_url, label: g.l.cta_label || 'Book a Call' } : null,
      watermark: g.l.watermark ? `${g.v.email || 'Confidential'} · ${new Date().toISOString().slice(0, 10)} · ${BRAND} confidential` : '', viewer: { email: g.v.email, name: g.v.name } };
  }
  if (action === 'download') {
    if (!g.l.allow_download || !g.docIds.includes(sub[0])) fail(403, 'Downloads are off for this link.');
    const d = await one('SELECT * FROM documents WHERE id=?', sub[0]);
    await logEvent(g.l.id, g.v.id, 'download', { doc: d.name });
    if (g.l.notify) notify(`${g.v.email || 'A visitor'} downloaded ${d.name}`, `${g.v.email || 'An anonymous visitor'} downloaded "${d.name}" via ${g.l.name || g.l.slug}.`, adminUrl('visitor/' + g.v.id));
    const [url] = await store.urls([`${docPrefix(d)}/original.pdf`], 120, `${d.name}.pdf`);
    return { url };
  }
  if (action === 'session') {
    const { ip, country, city } = await geo(c.req);
    const sid = rid(14);
    const prev = (await one('SELECT COUNT(*) n FROM sessions WHERE visitor_id=?', g.v.id)).n;
    await q('INSERT INTO sessions (id,link_id,visitor_id,started_at,last_ping,duration,ip,country,city,device,referrer) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      sid, g.l.id, g.v.id, now(), now(), 0, ip, country, city, device(c.req.headers.get('user-agent') || ''), clean(b.referrer, 300));
    await q('UPDATE visitors SET last_seen=? WHERE id=?', now(), g.v.id);
    await logEvent(g.l.id, g.v.id, prev ? 'return' : 'open', { country, city });
    if (g.l.notify) {
      const who = g.v.email || 'Someone (no email)'; const where = [city, country].filter(Boolean).join(', ');
      notify(prev ? `${who} is back on your deck (visit ${prev + 1})` : `${who} just opened your deck`,
        `${who}${g.v.name ? ' (' + g.v.name + ')' : ''} ${prev ? 'returned to' : 'opened'} "${g.l.name || g.l.slug}"${where ? ' from ' + where : ''}.`, adminUrl('visitor/' + g.v.id));
    }
    return { sessionId: sid };
  }
  if (action === 'track') {
    const s = await one('SELECT * FROM sessions WHERE id=? AND visitor_id=?', clean(b.sessionId, 40), g.v.id);
    if (!s) fail(404, 'no session');
    let added = 0;
    await sql.begin(async (tx: any) => {
      for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, 50)) {
        const ms = Math.round(Math.max(0, Math.min(Number(it.ms) || 0, 120000))); const page = parseInt(it.page);
        if (!ms || !g.docIds.includes(it.doc) || !(page > 0 && page < 2000)) continue;
        await tx.unsafe('INSERT INTO page_time (session_id,doc_id,page,ms,views) VALUES ($1,$2,$3,$4,1) ON CONFLICT (session_id,doc_id,page) DO UPDATE SET ms=page_time.ms+excluded.ms', [s.id, it.doc, page, ms]);
        added += ms;
      }
      await tx.unsafe('UPDATE sessions SET duration=duration+$1, last_ping=$2 WHERE id=$3', [added, now(), s.id]);
      await tx.unsafe('UPDATE visitors SET last_seen=$1 WHERE id=$2', [now(), g.v.id]);
    });
    return { ok: true };
  }
  if (action === 'message') {
    const body = clean(b.body, 4000); if (!body) fail(400, 'Empty');
    const doc = g.docIds.includes(b.doc) ? b.doc : g.docIds[0];
    await q('INSERT INTO messages (link_id,visitor_id,doc_id,page,body,created_at) VALUES (?,?,?,?,?,?)', g.l.id, g.v.id, doc, parseInt(b.page) || null, body, now());
    await logEvent(g.l.id, g.v.id, 'message', { page: b.page });
    if (g.v.email) await upsertInvestor(g.v.email, { stage: 'Engaged' });
    notify(`Question from ${g.v.email || 'a viewer'} on slide ${b.page}`, `${body}\n\n${g.v.email ? 'Reply to: ' + g.v.email : ''}`, adminUrl('messages'), g.v.email);
    return { ok: true };
  }
  if (action === 'cta') {
    await logEvent(g.l.id, g.v.id, 'cta', {});
    if (g.v.email) await upsertInvestor(g.v.email, { stage: 'Engaged' });
    notify(`${g.v.email || 'A viewer'} clicked "${g.l.cta_label || 'Book a Call'}"`, `${g.v.email || 'A viewer'} clicked your call to action on ${g.l.name || g.l.slug}.`, adminUrl('visitor/' + g.v.id));
    return { ok: true };
  }
  fail(404, 'not found');
}

async function admin(c: Ctx, parts: string[], method: string): Promise<any> {
  const [res, id, sub] = parts; const b = c.body;
  if (res === 'login' && method === 'POST') {
    if (!ADMIN_PASSWORD) fail(500, 'ADMIN_PASSWORD secret is not set');
    if (clean(b.password, 200) !== ADMIN_PASSWORD) fail(401, 'Wrong password');
    return { token: await adminToken() };
  }
  if (!(await isAdmin(c.req))) fail(401, 'auth');
  if (res === 'me') return { ok: true, siteUrl: SITE, brand: BRAND, sender: SENDER, email: emailOn(), slack: slackOn(), notifyTo: env('NOTIFY_EMAIL') };

  if (res === 'docs') {
    if (!id && method === 'GET') {
      const docs = await q('SELECT * FROM documents WHERE version>0 ORDER BY created_at DESC');
      for (const d of docs) { d.thumbs = await docAssets(d, 12 * 3600, 'thumb'); d.pageUrls = await docAssets(d, 12 * 3600, 'page'); }
      return docs;
    }
    if (!id && method === 'POST') { // reserve a version and hand out upload URLs
      const pages = Math.max(1, Math.min(parseInt(b.pages) || 0, 300)); if (!parseInt(b.pages)) fail(400, 'No pages');
      let d = b.replaceId ? await one('SELECT * FROM documents WHERE id=?', b.replaceId) : null;
      const docId = d ? d.id : rid(8);
      const version = d ? Math.max(d.version, d.pending_version || 0) + 1 : 1;
      if (d) await q('UPDATE documents SET pending_version=? WHERE id=?', version, docId);
      else await q('INSERT INTO documents (id,name,version,pending_version,pages,ratio,created_at,updated_at) VALUES (?,?,0,?,?,?,?,?)', docId, clean(b.name, 120) || 'Deck', version, pages, Number(b.ratio) || 0.5625, now(), now());
      const pre = `${docId}/v${version}`;
      const uploads: Record<string, string> = {};
      for (let i = 1; i <= pages; i++) { uploads[`page-${i}.jpg`] = await store.uploadUrl(`${pre}/page-${i}.jpg`); uploads[`thumb-${i}.jpg`] = await store.uploadUrl(`${pre}/thumb-${i}.jpg`); }
      uploads['original.pdf'] = await store.uploadUrl(`${pre}/original.pdf`);
      return { id: docId, version, uploads };
    }
    if (id && sub === 'commit' && method === 'POST') {
      const d = await one('SELECT * FROM documents WHERE id=?', id); if (!d) fail(404, 'no doc');
      const version = parseInt(b.version); if (version !== d.pending_version) fail(409, 'Stale upload');
      const old = d.version;
      await q('UPDATE documents SET version=?, pending_version=NULL, pages=?, ratio=?, name=COALESCE(NULLIF(?,\'\'),name), updated_at=? WHERE id=?', version, parseInt(b.pages), Number(b.ratio) || d.ratio, clean(b.name, 120), now(), id);
      if (old) bg(store.removePrefix(`${id}/v${old}`));
      return { ok: true };
    }
    if (id && method === 'PATCH') { await q('UPDATE documents SET name=? WHERE id=?', clean(b.name, 120), id); return { ok: true }; }
    if (id && method === 'DELETE') { await q('DELETE FROM documents WHERE id=?', id); bg(store.removePrefix(id)); return { ok: true }; }
  }

  if (res === 'links') {
    if (!id && method === 'GET') {
      const links = await q('SELECT * FROM links ORDER BY created_at DESC');
      const stats = await q('SELECT link_id, COUNT(*) views, COUNT(DISTINCT visitor_id) visitors, COALESCE(SUM(duration),0) ms, MAX(last_ping) last FROM sessions GROUP BY link_id');
      const m = Object.fromEntries(stats.map((s) => [s.link_id, s]));
      return links.map((l) => ({ ...l, doc_ids: parseDocs(l), has_password: !!l.password_hash, password_hash: undefined, stats: m[l.id] || { views: 0, visitors: 0, ms: 0 } }));
    }
    if (!id && method === 'POST') {
      const o = linkPayload(b);
      const want = slugify(b.slug);
      let slug = want && !(await one('SELECT 1 x FROM links WHERE slug=?', want)) ? want : '';
      if (want && !slug) fail(400, 'That URL is taken');
      if (!slug) { const base = slugify(o.firm || o.investor_name || ''); slug = base ? `${base}-${rid(4).toLowerCase()}` : rid(10); }
      if (['admin', 'assets', 'index', '404'].includes(slug)) fail(400, 'That URL is reserved');
      const row: any = { require_email: 1, verify_email: 0, allow_download: 0, watermark: 1, notify: 1, active: 1, doc_ids: '[]', ...o, id: rid(10), slug, created_at: now() };
      if (b.password) row.password_hash = await hash(String(b.password));
      const keys = Object.keys(row);
      await q(`INSERT INTO links (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => row[k]));
      if (row.investor_email) await upsertInvestor(row.investor_email, { name: row.investor_name, firm: row.firm, stage: 'Shared' });
      return { id: row.id, slug };
    }
    if (id && sub === 'analytics') {
      const l = await one('SELECT * FROM links WHERE id=?', id); if (!l) fail(404, 'no link');
      const decks = []; for (const d of parseDocs(l)) { const s = await pageStats(d, 'AND s.link_id=?', l.id); if (s) decks.push(s); }
      return { link: { ...l, password_hash: undefined }, visitors: await visitorRows('WHERE v.link_id=?', l.id), decks };
    }
    if (id && method === 'PATCH') {
      const o = linkPayload(b);
      if ('password' in b) o.password_hash = b.password ? await hash(String(b.password)) : null;
      if (b.slug) {
        const s = slugify(b.slug);
        if (['admin', 'assets', 'index', '404'].includes(s)) fail(400, 'That URL is reserved');
        if (await one('SELECT id FROM links WHERE slug=? AND id<>?', s, id)) fail(400, 'That URL is taken');
        if (s) o.slug = s;
      }
      const keys = Object.keys(o);
      if (keys.length) await q(`UPDATE links SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`, ...keys.map((k) => o[k]), id);
      return { ok: true };
    }
    if (id && method === 'DELETE') { await q('DELETE FROM links WHERE id=?', id); return { ok: true }; }
  }

  if (res === 'investors' && id && method === 'PATCH') {
    const e = decodeURIComponent(id).toLowerCase();
    await upsertInvestor(e);
    const sets: string[] = [], vals: unknown[] = [];
    ['name', 'firm', 'stage', 'notes'].forEach((k) => { if (k in b) { sets.push(k + '=?'); vals.push(clean(b[k], 4000)); } });
    if (sets.length) await q(`UPDATE investors SET ${sets.join(',')}, updated_at=? WHERE email=?`, ...vals, now(), e);
    return { ok: true };
  }
  if (res === 'overview') {
    const visitors = await visitorRows();
    const sess = await one('SELECT COUNT(*) views, COALESCE(SUM(duration),0) ms FROM sessions');
    const docs = await q('SELECT * FROM documents WHERE version>0 ORDER BY updated_at DESC');
    const docId = c.url.searchParams.get('doc') || docs[0]?.id;
    const events = await q(`SELECT e.*, v.email, v.name, l.name link_name FROM events e LEFT JOIN visitors v ON v.id=e.visitor_id LEFT JOIN links l ON l.id=e.link_id ORDER BY e.created_at DESC LIMIT 40`);
    const days = await q(`SELECT to_char(to_timestamp(started_at/1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD') d, COUNT(*) n, COUNT(DISTINCT visitor_id) u FROM sessions WHERE started_at > ? GROUP BY 1`, now() - 30 * 864e5);
    return {
      kpi: { views: sess.views, visitors: visitors.length, totalMs: sess.ms, avgMs: visitors.length ? sess.ms / visitors.length : 0,
        avgCompletion: visitors.length ? visitors.reduce((a: number, v: any) => a + v.completion, 0) / visitors.length : 0,
        hot: visitors.filter((v: any) => v.heat === 'hot').length, links: (await one('SELECT COUNT(*) n FROM links WHERE active=1')).n },
      hot: visitors.slice().sort((a: any, b: any) => b.score - a.score).slice(0, 8), events, days, docs, deck: docId ? await pageStats(docId) : null,
    };
  }
  if (res === 'visitors' && !id) {
    const v = await visitorRows(); const known = new Set(v.map((x: any) => x.email));
    return { visitors: v, pending: (await q('SELECT * FROM investors')).filter((i) => !known.has(i.email)) };
  }
  if (res === 'visitors' && id) {
    const v = (await visitorRows('WHERE v.id=?', id))[0]; if (!v) fail(404, 'not found');
    const sessions = await q('SELECT * FROM sessions WHERE visitor_id=? ORDER BY started_at DESC', v.id);
    const docIds = (await q('SELECT DISTINCT pt.doc_id FROM page_time pt JOIN sessions s ON s.id=pt.session_id WHERE s.visitor_id=?', v.id)).map((r) => r.doc_id);
    const decks = []; for (const d of docIds) { const s = await pageStats(d, 'AND s.visitor_id=?', v.id); if (s) decks.push(s); }
    return { visitor: v, sessions, decks, messages: await q('SELECT * FROM messages WHERE visitor_id=? ORDER BY created_at DESC', v.id), events: await q('SELECT * FROM events WHERE visitor_id=? ORDER BY created_at DESC LIMIT 100', v.id) };
  }
  if (res === 'messages') return q(`SELECT m.*, v.email, v.name, l.name link_name, d.name doc_name FROM messages m LEFT JOIN visitors v ON v.id=m.visitor_id LEFT JOIN links l ON l.id=m.link_id LEFT JOIN documents d ON d.id=m.doc_id ORDER BY m.created_at DESC`);
  if (res === 'export') {
    const v = await visitorRows();
    const esc = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const head = ['email', 'name', 'firm', 'stage', 'link', 'visits', 'minutes', 'completion_%', 'score', 'heat', 'country', 'city', 'device', 'downloads', 'messages', 'forwarded', 'first_seen', 'last_seen'];
    const lines = v.map((r: any) => [r.email, r.name || r.investor?.name, r.investor?.firm, r.investor?.stage, r.link_name, r.visits, (r.ms / 60000).toFixed(1), Math.round(r.completion * 100), r.score, r.heat, r.country, r.city, r.device, r.downloads, r.messages, r.forwarded ? 'yes' : '', new Date(r.first_seen).toISOString(), new Date(r.last_seen).toISOString()].map(esc).join(','));
    return { csv: [head.join(','), ...lines].join('\n') };
  }
  fail(404, 'not found');
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-dr-viewer, x-dr-device, x-upsert, apikey, x-client-info', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, PUT, OPTIONS' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const idx = url.pathname.indexOf('/api');
  const path = idx >= 0 ? url.pathname.slice(idx + 4) : url.pathname;
  FN_BASE = env('FN_PUBLIC_URL') || `${url.origin}${idx >= 0 ? url.pathname.slice(0, idx + 4) : ''}`;
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  try {
    if (LOCAL && parts[0] === '_local') { // test-only storage
      const p = url.searchParams.get('p') || ''; const s = url.searchParams.get('s');
      if (p.includes('..')) return json({ error: 'bad' }, 400);
      if (parts[1] === 'put' && s === await sign('put:' + p)) { const f = `${LOCAL}/${p}`; await Deno.mkdir(f.replace(/\/[^/]+$/, ''), { recursive: true }); await Deno.writeFile(f, new Uint8Array(await req.arrayBuffer())); return json({ ok: true }); }
      if (parts[1] === 'get' && s === await sign('get:' + p)) return new Response(await Deno.readFile(`${LOCAL}/${p}`), { headers: { ...CORS, 'content-type': p.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' } });
      return json({ error: 'bad sig' }, 403);
    }
    let body: any = {};
    if (req.method !== 'GET') { const t = await req.text(); try { body = t ? JSON.parse(t) : {}; } catch { body = {}; } }
    const c: Ctx = { req, url, body, parts };
    if (parts[0] === 'health') return json({ ok: true });
    await bootstrap();
    if (parts[0] === 'admin') return json(await admin(c, parts.slice(1), req.method));
    if (parts[0] === 'v' && parts[1] && parts[2]) {
      // sendBeacon cannot set headers: allow the token inside the body for /track
      if (parts[2] === 'track' && body.token && !req.headers.get('x-dr-viewer')) {
        const h = new Headers(req.headers); h.set('x-dr-viewer', String(body.token));
        c.req = new Request(req.url, { method: 'POST', headers: h });
      }
      return json(await viewer(c, parts[1], parts[2], parts.slice(3)));
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, state: e.message }, e.status);
    console.error(e);
    return json({ error: 'Server error' }, 500);
  }
});
