// Admin (team) API for DeckRoom. Owner sees everything; members see their own links, contacts and analytics.
// deno-lint-ignore-file no-explicit-any
export function makeAdmin(h: any) {
  const { q, one, sql, now, rid, clean, hash, sign, fail, env, store, docAssets, docPrefix, bg, linkPayload, slugify, parseDocs,
    visitorRows, pageStats, upsertInvestor, sendTo, emailOn, slackOn, SITE, BRAND, ADMIN_PASSWORD } = h;
  const enc = new TextEncoder();
  const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

  async function pwHash(pw: string, salt: string) {
    const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, k, 256)));
  }
  const tempPassword = () => { const a = new Uint8Array(10); crypto.getRandomValues(a); const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; return [...a].map((x) => c[x % c.length]).join(''); };
  async function userVer(u: any) { return u.id === 'owner' && !u.pw_hash ? (await hash(ADMIN_PASSWORD)).slice(0, 12) : `${u.pw_ver || 1}${(u.pw_hash || '').slice(0, 8)}`; }
  async function tokenFor(u: any) { const exp = now() + 30 * 864e5; return `a.${u.id}.${exp}.${await sign(`admin:${u.id}:${exp}:${await userVer(u)}`)}`; }
  async function authUser(req: Request) {
    const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const [p, uid, exp, s] = t.split('.');
    if (p !== 'a' || !uid || !exp || Number(exp) < now()) return null;
    const u = await one('SELECT * FROM users WHERE id=? AND active=1', uid);
    if (!u) return null;
    return s === await sign(`admin:${u.id}:${exp}:${await userVer(u)}`) ? u : null;
  }
  const isOwner = (u: any) => u.role === 'owner';
  const pub = (u: any) => ({ id: u.id, email: u.email, name: u.name, role: u.role, title: u.title || '', cta_url: u.cta_url || '', active: !!u.active, created_at: u.created_at, last_login: u.last_login });
  const dashUrl = `${SITE}/admin/`;

  // scoping: members only see links they own
  const lscope = (u: any, alias = 'l') => (isOwner(u) ? { w: '', a: [] as unknown[] } : { w: ` ${alias}.owner_id=? `, a: [u.id] });
  const canDoc = (u: any, d: any) => d && (isOwner(u) || d.owner_id === u.id || d.visibility === 'team');
  const canLink = (u: any, l: any) => l && (isOwner(u) || l.owner_id === u.id);

  async function sendInvite(u: any, pw: string, by: any) {
    await sendTo(u.email, `${by.name || 'Your team'} added you to ${BRAND} DeckRoom`,
      `Hello ${u.name || ''},\n\n${by.name || 'Your team'} gave you access to ${BRAND} DeckRoom, where you share decks and sales material with clients and see who read what.\n\nSign in: ${dashUrl}\nEmail: ${u.email}\nTemporary password: ${pw}\n\nChange the password in Settings after you sign in.`);
  }

  return async function admin(c: any, parts: string[], method: string): Promise<any> {
    const [res, id, sub] = parts; const b = c.body;

    if (res === 'login' && method === 'POST') {
      const email = clean(b.email, 200).toLowerCase(), pw = clean(b.password, 200);
      if (!pw) fail(400, 'Enter your password');
      const owner = await one(`SELECT * FROM users WHERE id='owner'`);
      let u: any = null;
      if (ADMIN_PASSWORD && pw === ADMIN_PASSWORD && (!email || email === (owner?.email || '').toLowerCase())) u = owner;
      if (!u && email) {
        const x = await one('SELECT * FROM users WHERE lower(email)=? AND active=1', email);
        if (x?.pw_hash && await pwHash(pw, x.pw_salt) === x.pw_hash) u = x;
      }
      if (!u) { await new Promise((r) => setTimeout(r, 400)); fail(401, 'Wrong email or password'); }
      await q('UPDATE users SET last_login=? WHERE id=?', now(), u.id);
      return { token: await tokenFor(u), user: pub(u) };
    }

    const u = await authUser(c.req);
    if (!u) fail(401, 'auth');
    const L = lscope(u);

    if (res === 'me' && method === 'GET') return { ok: true, user: pub(u), siteUrl: SITE, brand: BRAND, email: emailOn(), slack: slackOn(), notifyTo: u.email };
    if (res === 'me' && method === 'PATCH') {
      const sets: string[] = [], vals: unknown[] = [];
      if ('name' in b) { sets.push('name=?'); vals.push(clean(b.name, 120)); }
      if ('title' in b) { sets.push('title=?'); vals.push(clean(b.title, 120)); }
      if ('cta_url' in b) { sets.push('cta_url=?'); vals.push(/^https?:\/\//i.test(b.cta_url || '') ? clean(b.cta_url, 500) : ''); }
      if (b.new_password) {
        const np = String(b.new_password);
        if (np.length < 10) fail(400, 'Use at least 10 characters');
        const okCur = (u.id === 'owner' && !u.pw_hash && b.current_password === ADMIN_PASSWORD) || (u.pw_hash && await pwHash(String(b.current_password || ''), u.pw_salt) === u.pw_hash);
        if (!okCur) fail(401, 'Current password is wrong');
        const salt = rid(16);
        sets.push('pw_salt=?', 'pw_hash=?', 'pw_ver=COALESCE(pw_ver,1)+1'); vals.push(salt, await pwHash(np, salt));
      }
      if (sets.length) await q(`UPDATE users SET ${sets.join(',')} WHERE id=?`, ...vals, u.id);
      const nu = await one('SELECT * FROM users WHERE id=?', u.id);
      return { ok: true, user: pub(nu), token: b.new_password ? await tokenFor(nu) : undefined };
    }

    if (res === 'team') {
      if (!isOwner(u)) fail(403, 'Only the owner manages the team');
      if (!id && method === 'GET') {
        const users = await q('SELECT * FROM users ORDER BY created_at');
        const stats = await q('SELECT l.owner_id, COUNT(DISTINCT l.id) links, COUNT(DISTINCT s.visitor_id) viewers, COUNT(s.id) views FROM links l LEFT JOIN sessions s ON s.link_id=l.id GROUP BY l.owner_id');
        const m = Object.fromEntries(stats.map((s: any) => [s.owner_id, s]));
        return users.map((x: any) => ({ ...pub(x), stats: m[x.id] || { links: 0, viewers: 0, views: 0 } }));
      }
      if (!id && method === 'POST') {
        const email = clean(b.email, 200).toLowerCase(), name = clean(b.name, 120);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail(400, 'Enter a valid email');
        if (await one('SELECT 1 x FROM users WHERE lower(email)=?', email)) fail(400, 'That person is already on the team');
        const pw = tempPassword(), salt = rid(16), uid = rid(10);
        await q('INSERT INTO users (id,email,name,role,pw_salt,pw_hash,pw_ver,title,active,created_at) VALUES (?,?,?,?,?,?,1,?,1,?)', uid, email, name, 'member', salt, await pwHash(pw, salt), clean(b.title, 120), now());
        const nu = await one('SELECT * FROM users WHERE id=?', uid);
        if (emailOn()) bg(sendInvite(nu, pw, u));
        return { user: pub(nu), tempPassword: pw, emailed: emailOn(), signIn: dashUrl };
      }
      if (id && method === 'PATCH') {
        if (id === 'owner') fail(400, 'The owner account cannot be changed here');
        const x = await one('SELECT * FROM users WHERE id=?', id); if (!x) fail(404, 'Not found');
        if ('active' in b) await q('UPDATE users SET active=? WHERE id=?', b.active ? 1 : 0, id);
        if ('name' in b) await q('UPDATE users SET name=? WHERE id=?', clean(b.name, 120), id);
        if ('title' in b) await q('UPDATE users SET title=? WHERE id=?', clean(b.title, 120), id);
        if (b.reset) {
          const pw = tempPassword(), salt = rid(16);
          await q('UPDATE users SET pw_salt=?, pw_hash=?, pw_ver=COALESCE(pw_ver,1)+1 WHERE id=?', salt, await pwHash(pw, salt), id);
          if (emailOn()) bg(sendInvite(x, pw, u));
          return { ok: true, tempPassword: pw, emailed: emailOn() };
        }
        return { ok: true };
      }
    }

    if (res === 'docs') {
      if (!id && method === 'GET') {
        const docs = isOwner(u)
          ? await q(`SELECT d.*, us.name owner_name FROM documents d LEFT JOIN users us ON us.id=d.owner_id WHERE d.version>0 ORDER BY d.created_at DESC`)
          : await q(`SELECT d.*, us.name owner_name FROM documents d LEFT JOIN users us ON us.id=d.owner_id WHERE d.version>0 AND (d.visibility='team' OR d.owner_id=?) ORDER BY d.created_at DESC`, u.id);
        await Promise.all(docs.map(async (d: any) => { d.thumbs = await docAssets(d, 12 * 3600, 'thumb'); d.mine = d.owner_id === u.id; }));
        return docs;
      }
      if (!id && method === 'POST') {
        const pages = Math.max(1, Math.min(parseInt(b.pages) || 0, 300)); if (!parseInt(b.pages)) fail(400, 'No pages');
        const d = b.replaceId ? await one('SELECT * FROM documents WHERE id=?', b.replaceId) : null;
        if (d && !(isOwner(u) || d.owner_id === u.id)) fail(403, 'Only the uploader can replace this file');
        const docId = d ? d.id : rid(8);
        const version = d ? Math.max(d.version, d.pending_version || 0) + 1 : 1;
        const vis = b.visibility === 'team' ? 'team' : 'private';
        if (d) await q('UPDATE documents SET pending_version=? WHERE id=?', version, docId);
        else await q('INSERT INTO documents (id,name,version,pending_version,pages,ratio,created_at,updated_at,owner_id,visibility) VALUES (?,?,0,?,?,?,?,?,?,?)', docId, clean(b.name, 120) || 'Deck', version, pages, Number(b.ratio) || 0.5625, now(), now(), u.id, vis);
        const pre = `${docId}/v${version}`;
        const names = ['original.pdf']; for (let i = 1; i <= pages; i++) names.push(`page-${i}.jpg`, `thumb-${i}.jpg`);
        const urls = await Promise.all(names.map((n) => store.uploadUrl(`${pre}/${n}`)));
        return { id: docId, version, uploads: Object.fromEntries(names.map((n, i) => [n, urls[i]])) };
      }
      const d = id ? await one('SELECT * FROM documents WHERE id=?', id) : null;
      if (id && !canDoc(u, d)) fail(404, 'Not found');
      const mineOrOwner = d && (isOwner(u) || d.owner_id === u.id);
      if (id && sub === 'pages') return { urls: await docAssets(d, 12 * 3600, 'page') };
      if (id && sub === 'commit' && method === 'POST') {
        if (!mineOrOwner) fail(403, 'Not yours');
        const version = parseInt(b.version); if (version !== d.pending_version) fail(409, 'Stale upload');
        const old = d.version;
        await q(`UPDATE documents SET version=?, pending_version=NULL, pages=?, ratio=?, name=COALESCE(NULLIF(?,''),name), updated_at=? WHERE id=?`, version, parseInt(b.pages), Number(b.ratio) || d.ratio, clean(b.name, 120), now(), id);
        if (old) bg(store.removePrefix(`${id}/v${old}`));
        return { ok: true };
      }
      if (id && method === 'PATCH') {
        if (!mineOrOwner) fail(403, 'Only the uploader can change this file');
        if ('name' in b) await q('UPDATE documents SET name=? WHERE id=?', clean(b.name, 120), id);
        if ('visibility' in b) await q('UPDATE documents SET visibility=? WHERE id=?', b.visibility === 'team' ? 'team' : 'private', id);
        return { ok: true };
      }
      if (id && method === 'DELETE') {
        if (!mineOrOwner) fail(403, 'Only the uploader can delete this file');
        await q('DELETE FROM documents WHERE id=?', id); bg(store.removePrefix(id)); return { ok: true };
      }
    }

    if (res === 'links') {
      if (!id && method === 'GET') {
        const links = await q(`SELECT l.*, us.name owner_name FROM links l LEFT JOIN users us ON us.id=l.owner_id ${L.w ? 'WHERE' + L.w : ''} ORDER BY l.created_at DESC`, ...L.a);
        const stats = await q('SELECT link_id, COUNT(*) views, COUNT(DISTINCT visitor_id) visitors, COALESCE(SUM(duration),0) ms, MAX(last_ping) last FROM sessions GROUP BY link_id');
        const m = Object.fromEntries(stats.map((s: any) => [s.link_id, s]));
        return links.map((l: any) => ({ ...l, doc_ids: parseDocs(l), has_password: !!l.password_hash, password_hash: undefined, mine: l.owner_id === u.id, stats: m[l.id] || { views: 0, visitors: 0, ms: 0 } }));
      }
      if (!id && method === 'POST') {
        const o = linkPayload(b);
        const ids = parseDocs(o);
        for (const did of ids) if (!canDoc(u, await one('SELECT * FROM documents WHERE id=?', did))) fail(403, 'You cannot share that file');
        const want = slugify(b.slug);
        let slug = want && !(await one('SELECT 1 x FROM links WHERE slug=?', want)) ? want : '';
        if (want && !slug) fail(400, 'That URL is taken');
        if (!slug) { const base = slugify(o.firm || o.investor_name || ''); slug = base ? `${base}-${rid(4).toLowerCase()}` : rid(10); }
        if (['admin', 'assets', 'index', '404', 'config'].includes(slug)) fail(400, 'That URL is reserved');
        const row: any = { require_email: 1, verify_email: 0, allow_download: 0, watermark: 1, notify: 1, active: 1, doc_ids: '[]', cta_url: u.cta_url || '', ...o, id: rid(10), slug, created_at: now(), owner_id: u.id };
        if (b.password) row.password_hash = await hash(String(b.password));
        const keys = Object.keys(row);
        await q(`INSERT INTO links (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => row[k]));
        if (row.investor_email) await upsertInvestor(row.investor_email, { name: row.investor_name, firm: row.firm, stage: 'Shared', owner_id: u.id });
        return { id: row.id, slug };
      }
      const l = await one('SELECT * FROM links WHERE id=?', id);
      if (!canLink(u, l)) fail(404, 'Not found');
      if (sub === 'analytics') {
        const decks = (await Promise.all(parseDocs(l).map((d: string) => pageStats(d, 'AND s.link_id=?', l.id)))).filter(Boolean);
        return { link: { ...l, password_hash: undefined }, visitors: await visitorRows('WHERE v.link_id=?', l.id), decks };
      }
      if (method === 'PATCH') {
        const o = linkPayload(b);
        if ('doc_ids' in o) for (const did of parseDocs(o)) if (!canDoc(u, await one('SELECT * FROM documents WHERE id=?', did))) fail(403, 'You cannot share that file');
        if ('password' in b) o.password_hash = b.password ? await hash(String(b.password)) : null;
        if (b.slug) {
          const s = slugify(b.slug);
          if (['admin', 'assets', 'index', '404', 'config'].includes(s)) fail(400, 'That URL is reserved');
          if (await one('SELECT id FROM links WHERE slug=? AND id<>?', s, id)) fail(400, 'That URL is taken');
          if (s) o.slug = s;
        }
        const keys = Object.keys(o);
        if (keys.length) await q(`UPDATE links SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`, ...keys.map((k) => o[k]), id);
        return { ok: true };
      }
      if (method === 'DELETE') { await q('DELETE FROM links WHERE id=?', id); return { ok: true }; }
    }

    // contacts visible to this user: owner all; member = contacts they shared with or who opened their links
    const myContact = async (email: string) => isOwner(u) || !!(await one(`SELECT 1 x FROM investors WHERE email=? AND owner_id=? UNION SELECT 1 FROM visitors v JOIN links l ON l.id=v.link_id WHERE v.email=? AND l.owner_id=? LIMIT 1`, email, u.id, email, u.id));

    if (res === 'investors' && id && method === 'PATCH') {
      const e = decodeURIComponent(id).toLowerCase();
      if (!(await myContact(e))) fail(404, 'Not found');
      await upsertInvestor(e, { owner_id: u.id });
      const sets: string[] = [], vals: unknown[] = [];
      ['name', 'firm', 'stage', 'notes'].forEach((k) => { if (k in b) { sets.push(k + '=?'); vals.push(clean(b[k], 4000)); } });
      if (sets.length) await q(`UPDATE investors SET ${sets.join(',')}, updated_at=? WHERE email=?`, ...vals, now(), e);
      return { ok: true };
    }

    const vWhere = L.w ? `WHERE${L.w}` : '';
    const sScope = L.w ? 'AND s.link_id IN (SELECT id FROM links WHERE owner_id=?)' : '';
    if (res === 'overview') {
      const docsQ = isOwner(u) ? q('SELECT * FROM documents WHERE version>0 ORDER BY updated_at DESC')
        : q(`SELECT * FROM documents WHERE version>0 AND (visibility='team' OR owner_id=?) ORDER BY updated_at DESC`, u.id);
      const [visitors, sess, docs, events, days, lc] = await Promise.all([
        visitorRows(vWhere, ...L.a),
        one(`SELECT COUNT(*) views, COALESCE(SUM(duration),0) ms FROM sessions s WHERE true ${sScope}`, ...L.a),
        docsQ,
        q(`SELECT e.*, v.email, v.name, l.name link_name, us.name owner_name FROM events e LEFT JOIN visitors v ON v.id=e.visitor_id LEFT JOIN links l ON l.id=e.link_id LEFT JOIN users us ON us.id=l.owner_id ${vWhere} ORDER BY e.created_at DESC LIMIT 40`, ...L.a),
        q(`SELECT to_char(to_timestamp(started_at/1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD') d, COUNT(*) n, COUNT(DISTINCT visitor_id) u FROM sessions s WHERE started_at > ? ${sScope} GROUP BY 1`, now() - 30 * 864e5, ...L.a),
        one(`SELECT COUNT(*) n FROM links l WHERE active=1 ${L.w ? 'AND' + L.w : ''}`, ...L.a),
      ]);
      // default chart: the most viewed file in this user's scope
      let docId = c.url.searchParams.get('doc');
      if (!docId) {
        const top = await one(`SELECT pt.doc_id FROM page_time pt JOIN sessions s ON s.id=pt.session_id WHERE true ${sScope} GROUP BY pt.doc_id ORDER BY COUNT(*) DESC LIMIT 1`, ...L.a);
        docId = top?.doc_id || docs[0]?.id;
      }
      const deck = docId && docs.some((d: any) => d.id === docId) ? await pageStats(docId, sScope, ...L.a) : null;
      return {
        kpi: { views: sess.views, visitors: visitors.length, totalMs: sess.ms, avgMs: visitors.length ? sess.ms / visitors.length : 0,
          avgCompletion: visitors.length ? visitors.reduce((a: number, v: any) => a + v.completion, 0) / visitors.length : 0,
          hot: visitors.filter((v: any) => v.heat === 'hot').length, links: lc.n },
        hot: visitors.slice().sort((a: any, b: any) => b.score - a.score).slice(0, 8), events, days, docs, deck,
      };
    }
    if (res === 'visitors' && !id) {
      const v = await visitorRows(vWhere, ...L.a); const known = new Set(v.map((x: any) => x.email));
      const pend = isOwner(u) ? await q('SELECT * FROM investors') : await q('SELECT * FROM investors WHERE owner_id=?', u.id);
      return { visitors: v, pending: pend.filter((i: any) => !known.has(i.email)) };
    }
    if (res === 'visitors' && id) {
      const v = (await visitorRows(`WHERE v.id=? ${L.w ? 'AND' + L.w : ''}`, id, ...L.a))[0]; if (!v) fail(404, 'not found');
      const [sessions, docRows, messages, events] = await Promise.all([
        q('SELECT * FROM sessions WHERE visitor_id=? ORDER BY started_at DESC', v.id),
        q('SELECT DISTINCT pt.doc_id FROM page_time pt JOIN sessions s ON s.id=pt.session_id WHERE s.visitor_id=?', v.id),
        q('SELECT * FROM messages WHERE visitor_id=? ORDER BY created_at DESC', v.id),
        q('SELECT * FROM events WHERE visitor_id=? ORDER BY created_at DESC LIMIT 100', v.id),
      ]);
      const decks = (await Promise.all(docRows.map((r: any) => pageStats(r.doc_id, 'AND s.visitor_id=?', v.id)))).filter(Boolean);
      return { visitor: v, sessions, decks, messages, events };
    }
    if (res === 'messages') return q(`SELECT m.*, v.email, v.name, l.name link_name, d.name doc_name, us.name owner_name FROM messages m LEFT JOIN visitors v ON v.id=m.visitor_id LEFT JOIN links l ON l.id=m.link_id LEFT JOIN documents d ON d.id=m.doc_id LEFT JOIN users us ON us.id=l.owner_id ${vWhere} ORDER BY m.created_at DESC`, ...L.a);
    if (res === 'export') {
      const v = await visitorRows(vWhere, ...L.a);
      const esc = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`;
      const head = ['email', 'name', 'company', 'stage', 'link', 'shared_by', 'visits', 'minutes', 'completion_%', 'score', 'heat', 'country', 'city', 'device', 'downloads', 'messages', 'forwarded', 'first_seen', 'last_seen'];
      const lines = v.map((r: any) => [r.email, r.name || r.investor?.name, r.investor?.firm, r.investor?.stage, r.link_name, r.owner_name, r.visits, (r.ms / 60000).toFixed(1), Math.round(r.completion * 100), r.score, r.heat, r.country, r.city, r.device, r.downloads, r.messages, r.forwarded ? 'yes' : '', new Date(r.first_seen).toISOString(), new Date(r.last_seen).toISOString()].map(esc).join(','));
      return { csv: [head.join(','), ...lines].join('\n') };
    }
    fail(404, 'not found');
  };
}
