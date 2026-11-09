// Email (SMTP) + Slack notifications. Both optional.
const nodemailer = require('nodemailer');
let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}
const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'deckroom@localhost';
const emailEnabled = () => !!transport;
const slackEnabled = () => !!process.env.SLACK_WEBHOOK_URL;
async function sendTo(to, subject, text, replyTo) {
  if (!transport || !to) return;
  try { await transport.sendMail({ from: FROM, to, subject, text, replyTo }); } catch (e) { console.error('[mail]', e.message); }
}
async function send(subject, text, url, replyTo) {
  console.log(`[notify] ${subject}`);
  const body = `${text}${url ? `\n\nOpen in DeckRoom: ${url}` : ''}`;
  if (process.env.NOTIFY_EMAIL) sendTo(process.env.NOTIFY_EMAIL, subject, body, replyTo);
  if (slackEnabled()) {
    fetch(process.env.SLACK_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `*${subject}*\n${text}${url ? `\n<${url}|Open in DeckRoom>` : ''}` }) }).catch((e) => console.error('[slack]', e.message));
  }
}
module.exports = { send, sendTo, emailEnabled, slackEnabled };
