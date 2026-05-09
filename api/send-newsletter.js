/**
 * SIM Racing NG — Newsletter Send API
 * Vercel Serverless Function (CommonJS) — /api/send-newsletter
 *
 * ENV VARIABLES in Vercel dashboard → Settings → Environment Variables:
 *   RESEND_API_KEY    — re_xxxxxxxxxxxxxxxx  (from resend.com)
 *   NEWSLETTER_FROM   — SIM Racing NG <onboarding@resend.dev>
 *   NEWSLETTER_SECRET — teamsrnpaul  (must match shared.js)
 *   ALLOWED_ORIGIN    — https://srn-ng.vercel.app  (your site URL, or * for dev)
 */

module.exports = async function handler(req, res) {
  /* ── CORS — set before everything ── */
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ ok:false, error:'Method not allowed' });

  /* ── AUTH ── */
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token || token !== process.env.NEWSLETTER_SECRET) {
    return res.status(401).json({ ok:false, error:'Unauthorized — NEWSLETTER_SECRET mismatch' });
  }

  /* ── ENV CHECK ── */
  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ ok:false, error:'RESEND_API_KEY not configured in Vercel env vars' });
  }

  /* ── BODY ── */
  const { subject, html, recipients } = req.body || {};

  if (!subject?.trim())                               return res.status(400).json({ ok:false, error:'subject required' });
  if (!html?.trim())                                  return res.status(400).json({ ok:false, error:'html body required' });
  if (!Array.isArray(recipients) || !recipients.length) return res.status(400).json({ ok:false, error:'recipients array required' });

  const FROM = process.env.NEWSLETTER_FROM || 'SIM Racing NG <onboarding@resend.dev>';

  /* ── SEND in batches of 50 ── */
  let sent = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < recipients.length; i += 50) {
    const batch = recipients.slice(i, i + 50);
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch.map(email => ({
          from:    FROM,
          to:      [email],
          subject: subject.trim(),
          html:    buildHTML(subject.trim(), html.trim()),
        }))),
      });

      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        failed += batch.length;
        errors.push(e?.message || `Resend HTTP ${r.status}`);
      } else {
        sent += batch.length;
      }
    } catch (err) {
      failed += batch.length;
      errors.push(err.message);
    }
  }

  return res.status(200).json({
    ok: failed === 0,
    sent, failed,
    total: recipients.length,
    ...(errors.length ? { errors } : {}),
  });
};

function buildHTML(subject, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(subject)}</title></head>
<body style="margin:0;background:#020e1f;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#081c32">
  <div style="background:#020e1f;padding:24px 28px;text-align:center;border-bottom:3px solid #00e06b">
    <div style="font-size:26px;font-weight:900;color:#00e06b;letter-spacing:.05em">
      SRN <span style="color:#eef3f9;font-weight:400;font-size:20px">· SIM Racing NG</span>
    </div>
  </div>
  <div style="padding:28px 32px;color:#c8d8e8;font-size:15px;line-height:1.75">
    ${body}
  </div>
  <div style="background:#020e1f;padding:16px 28px;text-align:center;font-size:11px;color:#4a6a88;border-top:1px solid rgba(255,255,255,.06)">
    <p style="margin:0 0 4px">© 2026 SIM Racing NG — Nigeria's home for competitive sim racing.</p>
    <p style="margin:0">You received this because you subscribed at srn-ng.vercel.app</p>
  </div>
</div>
</body></html>`;
}

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
