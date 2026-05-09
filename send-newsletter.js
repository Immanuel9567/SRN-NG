/**
 * SIM Racing NG — Newsletter Send API
 * Vercel Serverless Function — /api/send-newsletter
 *
 * Uses Resend (https://resend.com) to send emails.
 *
 * ENV VARIABLES to set in Vercel dashboard:
 *   RESEND_API_KEY   — your Resend API key (re_xxxxxxxxxxxx)
 *   NEWSLETTER_FROM  — verified sender, e.g. "SIM Racing NG <news@simracingng.com>"
 *                      OR use "SIM Racing NG <onboarding@resend.dev>" for testing
 *   ALLOWED_ORIGIN   — your site URL e.g. https://simracingng.vercel.app
 *                      (used for CORS — set to * during dev if needed)
 */

export default async function handler(req, res) {
  /* ── CORS ── */
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  /* ── AUTH — simple shared secret ── */
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token || token !== process.env.NEWSLETTER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  /* ── BODY ── */
  const { subject, html, recipients } = req.body;

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'subject is required' });
  }
  if (!html || typeof html !== 'string' || !html.trim()) {
    return res.status(400).json({ error: 'html body is required' });
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'recipients array is required and must not be empty' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM           = process.env.NEWSLETTER_FROM || 'SIM Racing NG <onboarding@resend.dev>';

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  /* ── SEND (batch — Resend supports up to 100 recipients per call) ── */
  const BATCH_SIZE = 50; // stay well under limits
  const batches    = [];
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    batches.push(recipients.slice(i, i + BATCH_SIZE));
  }

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const batch of batches) {
    try {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          batch.map(email => ({
            from:    FROM,
            to:      [email],
            subject: subject.trim(),
            html:    buildEmailHTML(subject.trim(), html.trim()),
            // Optional: add unsubscribe header
            headers: {
              'List-Unsubscribe': `<mailto:unsubscribe@simracingng.com?subject=Unsubscribe>`,
            },
          }))
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        failed += batch.length;
        errors.push(data?.message || `Batch failed with status ${response.status}`);
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
    sent,
    failed,
    total: recipients.length,
    errors: errors.length ? errors : undefined,
  });
}

/* ── EMAIL TEMPLATE ── */
function buildEmailHTML(subject, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${escapeHtml(subject)}</title>
<style>
  body { margin:0; padding:0; background:#020e1f; font-family:'Helvetica Neue',Arial,sans-serif; }
  .wrapper { max-width:600px; margin:0 auto; background:#081c32; }
  .header  { background:#020e1f; padding:28px 32px; text-align:center; border-bottom:2px solid #00e06b; }
  .logo    { font-size:28px; font-weight:900; color:#00e06b; letter-spacing:0.05em; }
  .logo span { color:#eef3f9; }
  .content { padding:32px; color:#c8d8e8; font-size:15px; line-height:1.7; }
  .content h1,h2,h3 { color:#eef3f9; }
  .content a { color:#00e06b; }
  .footer  { background:#020e1f; padding:20px 32px; text-align:center; font-size:11px; color:#3a5a78; border-top:1px solid rgba(255,255,255,0.06); }
  .btn     { display:inline-block; background:#00e06b; color:#020e1f !important; font-weight:700; padding:12px 28px; border-radius:8px; text-decoration:none; margin:16px 0; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="logo">SRN<span> · SIM Racing NG</span></div>
  </div>
  <div class="content">
    ${bodyHtml}
  </div>
  <div class="footer">
    <p>© 2026 SIM Racing NG — Nigeria's home for competitive sim racing.</p>
    <p>You're receiving this because you subscribed at simracingng.com.<br/>
    To unsubscribe, reply with "Unsubscribe" in the subject.</p>
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
