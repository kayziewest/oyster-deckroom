# Oyster DeckRoom

Share the Oyster investor deck with a private link, gate it by email, and see who read which slide.

- **Site:** static files in `docs/`, hosted on GitHub Pages.
- **Backend:** one Supabase Edge Function in `supabase/functions/api/index.ts` with Supabase Postgres and private Storage. It creates its own tables and bucket on first run.

## What it does

**Sharing:** one link per investor at `deck.oysterskin.com/kaleo`. Email gate, optional six digit code, password, expiry, instant revoke, allow and block lists, download on or off, viewer email watermark on every slide, new deck versions update every link, several decks per link.

**Tracking:** opens, return visits, city and device, time on every slide, reach and drop off, slide heatmap, completion, forward detection, engagement score, questions tagged with the slide, Book a Call clicks, live feed, CSV export.

**Pipeline:** every viewer becomes an investor with stage, firm and notes, plus a list of people who have not opened yet.

**Alerts:** email (Resend) and Slack on open, return, forward, download, question and call click.

## Setup

1. **Supabase.** Create a free project. Deploy the function with JWT verification off:
   ```
   npx supabase functions deploy api --project-ref YOUR_REF --no-verify-jwt
   npx supabase secrets set --project-ref YOUR_REF ADMIN_PASSWORD=... SESSION_SECRET=... SITE_URL=https://deck.oysterskin.com
   ```
   Optional secrets: `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFY_EMAIL`, `SLACK_WEBHOOK_URL`, `BRAND_NAME`, `SENDER_NAME`.
2. **Config.** Put the function URL in `docs/config.js`:
   `window.DECKROOM_API = 'https://YOUR_REF.supabase.co/functions/v1/api';`
3. **GitHub Pages.** Settings › Pages › Deploy from branch › `main` › `/docs`.
4. **Domain (optional).** Add `docs/CNAME` containing `deck.oysterskin.com`, and a DNS CNAME `deck` › `YOUR_GITHUB_USER.github.io`.
5. Open `/admin/`, sign in with `ADMIN_PASSWORD`, upload the deck on the Decks page, create links.

Slides are rendered from the PDF in your browser and stored in a private Supabase bucket. Investors only ever receive short lived signed image links after passing the gate.

## Local test

```
deno run -A supabase/functions/api/index.ts   # with DATABASE_URL, LOCAL_STORAGE_DIR, ADMIN_PASSWORD, DEV=1
```
Serve `docs/` with any static server that falls back to `404.html`, and point `docs/config.js` at `http://localhost:8000/api`.
