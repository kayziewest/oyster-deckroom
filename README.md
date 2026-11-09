# Oyster DeckRoom

Internal tool to share the Oyster investor deck with a link, gate it by email, and see who read what.

Built from the Pitchwise (Bantaba) feature set, self hosted, no per seat fees.

## What it does

**Sharing and access**
- One link per investor (or one general link). Investors need no account.
- Email gate, with optional 6 digit code to verify the email is real.
- Password, expiry date, instant revoke.
- Allow list (emails or `@domain`), block list, blocked domains.
- Custom URL slug. Welcome note on the gate.
- Download on or off per link. Slides are served as images, so the PDF never leaves the server unless you allow it.
- Dynamic watermark: viewer email and date burned into every slide on the server.
- Upload a new version of the deck. Every existing link shows it at once.
- Multiple decks per link (deck plus one pager, data room style).

**Tracking**
- Who opened, when, from where (city, country), on what device.
- Time on every slide, per viewer and averaged. Counts only while the tab is visible and the viewer is active.
- Slide reach and drop off chart, slide heatmap with the top 3 slides.
- Completion rate, visits, return visits.
- Forward detection: a per investor link opened with a different email is flagged.
- Engagement score (hot, warm, cold) for every investor.
- Questions from inside the deck, tagged with the slide.
- "Book a call" button at the end, click tracked.
- Live activity feed. CSV export.

**Pipeline**
- Every viewer becomes an investor record with stage (Shared, Viewed, Engaged, Meeting, Due diligence, Committed, Passed), firm and notes.
- "Shared, not opened yet" list.

**Alerts**
- Email and Slack on open, return visit, forward, download, question, call click.

## Run locally

Needs Node 20+ and `pdftoppm` (`brew install poppler` on Mac).

```
npm install
cp .env.example .env   # set ADMIN_PASSWORD at least
npm start
```

Open http://localhost:3000/admin. The seed deck in `seed/` is imported on first boot.
Without SMTP, verification codes print in the terminal and show on the gate (dev only).

## Deploy (recommended: Render, about $7/month)

1. Push this folder to a private GitHub repo.
2. Render > New > Blueprint > pick the repo. `render.yaml` sets up the Docker service and a 2 GB disk at `/data`.
3. Fill `ADMIN_PASSWORD`, `BASE_URL` and SMTP values.
4. Point `deck.oysterskin.com` at the service (CNAME) and set `BASE_URL=https://deck.oysterskin.com`.

Any Docker host with a persistent volume at `/data` works (Railway, Fly.io, a VPS). Data is one SQLite file plus slide images in `/data`. Back up that folder.

For SMTP, a Resend account on oysterskin.com is the fastest path: `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASS=<api key>`.

## Environment

| Var | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Dashboard password |
| `BASE_URL` | Public URL used in share links and alerts |
| `SESSION_SECRET` | Signs cookies |
| `SMTP_*`, `NOTIFY_EMAIL` | Codes to investors, alerts to you |
| `SLACK_WEBHOOK_URL` | Alerts into a Slack channel |
| `BRAND_NAME`, `SENDER_NAME` | Text on the viewer gate |
| `GEO_LOOKUP` | `off` disables IP city lookup (ipapi.co). Cloudflare/Vercel geo headers are used first when present |
| `DATA_DIR` | Where the database and slides live |

## Files

- `server.js` API, viewer gate, tracking, analytics
- `lib/db.js` SQLite schema
- `lib/notify.js` email and Slack
- `public/view.*` investor viewer
- `public/admin.*` dashboard
