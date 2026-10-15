'use strict';

/**
 * Running Tuba AVL — site server.
 *
 * Serves the static marketing site out of `public/` and implements the single
 * dynamic endpoint the front end expects: POST /api/contact, which delivers the
 * project brief to the sales inbox through the Resend API.
 *
 * Configuration is entirely environment-driven (see .env.example):
 *   PORT                 listening port (Railway injects this)
 *   RESEND_API_KEY       Resend API key — REQUIRED for the form to deliver
 *   CONTACT_TO_EMAIL     destination inbox (default andy@runningtuba.com)
 *   CONTACT_FROM_EMAIL   verified Resend sender (default website@runningtuba.com)
 */

const path = require('node:path');
const express = require('express');
const compression = require('compression');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const RESEND_ENDPOINT = process.env.RESEND_ENDPOINT || 'https://api.resend.com/emails';
const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'andy@runningtuba.com';
const CONTACT_FROM_EMAIL =
  process.env.CONTACT_FROM_EMAIL || 'Running Tuba Website <website@runningtuba.com>';

/** Resend request budget — the form should fail fast, never hang. */
const RESEND_TIMEOUT_MS = 10_000;

/** Per-IP submission budget. Generous for humans, useless for scripts. */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

/** Field caps — keeps a hostile payload from becoming a hostile inbox. */
const LIMITS = {
  name: 120,
  email: 254,
  organization: 160,
  phone: 40,
  division: 80,
  description: 5000,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Extensions that are safe to cache hard in the browser. */
const IMMUTABLE_ASSET_RE = /\.(?:css|js|jpe?g|png|gif|webp|avif|svg|ico|mp4|webm|woff2?|ttf|otf)$/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeWithBreaks(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

/** Collapse whitespace, trim, and hard-cap. Used for every single-line field. */
function oneLine(value, max) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Same, but preserves the author's line breaks in the brief body. */
function multiLine(value, max) {
  return String(value == null ? '' : value)
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function parseRecipients(raw) {
  return String(raw)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Rate limiting (in-process; adequate for a single-instance marketing site)
// ---------------------------------------------------------------------------

const submissions = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = submissions.get(ip);
  if (!entry || now > entry.resetAt) {
    submissions.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of submissions) {
    if (now > entry.resetAt) submissions.delete(ip);
  }
}, 60_000).unref();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateBrief(body) {
  const brief = {
    name: oneLine(body.name, LIMITS.name),
    email: oneLine(body.email, LIMITS.email),
    organization: oneLine(body.organization, LIMITS.organization),
    phone: oneLine(body.phone, LIMITS.phone),
    division: oneLine(body.division, LIMITS.division),
    description: multiLine(body.description, LIMITS.description),
  };

  if (!brief.name) return { error: 'Please include your name.' };
  if (!brief.email) return { error: 'Please include an email address.' };
  if (!EMAIL_RE.test(brief.email)) return { error: 'Please include a valid email address.' };
  if (!brief.division) return { error: 'Please choose a division.' };
  if (!brief.description) return { error: 'Please describe the project.' };

  return { brief };
}

// ---------------------------------------------------------------------------
// Email rendering
// ---------------------------------------------------------------------------

function renderText(brief) {
  return [
    'New project brief from the website.',
    '',
    `Name:         ${brief.name}`,
    `Email:        ${brief.email}`,
    `Organization: ${brief.organization || '—'}`,
    `Phone:        ${brief.phone || '—'}`,
    `Division:     ${brief.division}`,
    '',
    'Project description:',
    brief.description,
    '',
    '—',
    'Reply to this email to reach the sender directly.',
  ].join('\n');
}

function renderHtml(brief) {
  const cellLabel =
    'padding:10px 18px 10px 0;color:#6b7280;font:600 11px/1.4 Helvetica,Arial,sans-serif;' +
    'text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;vertical-align:top';
  const cellValue =
    'padding:10px 0;color:#111827;font:400 15px/1.5 Helvetica,Arial,sans-serif;vertical-align:top';
  const border = 'border-bottom:1px solid #e5e7eb';

  const rows = [
    ['Name', escapeHtml(brief.name)],
    ['Email', `<a href="mailto:${escapeHtml(brief.email)}" style="color:#0f62fe">${escapeHtml(brief.email)}</a>`],
    ['Organization', escapeHtml(brief.organization) || '<span style="color:#9ca3af">—</span>'],
    ['Phone', escapeHtml(brief.phone) || '<span style="color:#9ca3af">—</span>'],
    ['Division', escapeHtml(brief.division)],
  ]
    .map(
      ([label, value], index, all) =>
        `<tr><td style="${cellLabel};${index < all.length - 1 ? border : ''}">${label}</td>` +
        `<td style="${cellValue};${index < all.length - 1 ? border : ''}">${value}</td></tr>`
    )
    .join('');

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3f4f6">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px">
    <tr><td style="padding:24px 28px 8px">
      <h1 style="margin:0;font:700 19px/1.3 Helvetica,Arial,sans-serif;color:#111827">New project brief</h1>
      <p style="margin:6px 0 0;font:400 14px/1.5 Helvetica,Arial,sans-serif;color:#6b7280">
        Submitted through the contact form at runningtuba.com.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px 4px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>
    </td></tr>
    <tr><td style="padding:20px 28px 28px">
      <p style="margin:0 0 8px;font:600 11px/1.4 Helvetica,Arial,sans-serif;color:#6b7280;text-transform:uppercase;letter-spacing:.08em">Project description</p>
      <div style="padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#111827">${escapeWithBreaks(
        brief.description
      )}</div>
    </td></tr>
    <tr><td style="padding:0 28px 24px">
      <p style="margin:0;font:400 13px/1.5 Helvetica,Arial,sans-serif;color:#9ca3af">
        Reply directly to this email to answer ${escapeHtml(brief.name)}.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Resend delivery
// ---------------------------------------------------------------------------

async function deliverBrief(brief) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: CONTACT_FROM_EMAIL,
        to: parseRecipients(CONTACT_TO_EMAIL),
        reply_to: brief.email,
        subject: `New project brief: ${brief.division} — ${brief.name}`,
        text: renderText(brief),
        html: renderHtml(brief),
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const detail = payload.message || payload.error || raw.slice(0, 300);
      throw new Error(`Resend responded ${response.status}: ${detail}`);
    }

    return payload.id || 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');

// Railway terminates TLS at its edge and forwards the client address.
app.set('trust proxy', 1);

app.use(compression());

app.get('/health', (_req, res) => {
  res.type('text/plain').send('ok');
});

app.post('/api/contact', express.json({ limit: '32kb' }), async (req, res) => {
  const ip = req.ip || 'unknown';

  if (isRateLimited(ip)) {
    console.warn(`contact: rate limited ${ip}`);
    return res.status(429).json({
      result: 'error',
      message: 'Too many submissions from this address. Please try again shortly.',
    });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot: only a bot fills in a field it cannot see. Accept silently.
  if (oneLine(body.website, 200)) {
    console.warn(`contact: honeypot triggered by ${ip}`);
    return res.json({ result: 'ok' });
  }

  const { brief, error } = validateBrief(body);
  if (error) {
    return res.status(422).json({ result: 'error', message: error });
  }

  if (!RESEND_API_KEY) {
    console.error('contact: RESEND_API_KEY is not set — cannot deliver the brief');
    return res.status(503).json({
      result: 'error',
      message: 'Email delivery is not configured.',
    });
  }

  try {
    const id = await deliverBrief(brief);
    console.log(`contact: delivered brief from ${brief.email} (resend id ${id})`);
    return res.json({ result: 'ok' });
  } catch (err) {
    const reason = err && err.name === 'AbortError' ? 'Resend timed out' : err.message;
    console.error(`contact: delivery failed — ${reason}`);
    return res.status(502).json({ result: 'error', message: 'Delivery failed.' });
  }
});

// Static site. `public/` holds nothing but web assets, and dotfiles are never
// served, so there is no config or secret reachable over HTTP.
app.use(
  express.static(PUBLIC_DIR, {
    index: 'index.html',
    extensions: ['html'], // /about -> about.html
    dotfiles: 'ignore',
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (IMMUTABLE_ASSET_RE.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

// 404 — pages fall back to the home page, asset requests get a flat 404 so a
// missing image never resolves to a screenful of HTML.
app.use((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).type('text/plain').send('Method not allowed');
  }
  // Anything that looks like a file request — an extension, or a dotfile such
  // as /.env — gets a flat 404 rather than a screenful of HTML.
  const firstSegment = req.path.split('/').filter(Boolean)[0] || '';
  if (path.extname(req.path) || firstSegment.startsWith('.')) {
    return res.status(404).type('text/plain').send('Not found');
  }
  return res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
    if (err && !res.headersSent) res.status(404).type('text/plain').send('Not found');
  });
});

// JSON error responses for the API, so the front end never receives an HTML
// error page it cannot parse.
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
    return res.status(400).json({ result: 'error', message: 'Malformed request body.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ result: 'error', message: 'Request body too large.' });
  }
  console.error('unhandled error:', err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ result: 'error', message: 'Internal error.' });
  }
  return next(err);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const server = app.listen(PORT, HOST, () => {
  console.log(`runningtuba-site listening on http://${HOST}:${PORT}`);
  console.log(`  contact form -> ${CONTACT_TO_EMAIL}`);
  console.log(`  sender       -> ${CONTACT_FROM_EMAIL}`);
  if (!RESEND_API_KEY) {
    console.warn('  RESEND_API_KEY is not set — the contact form will return 503.');
  }
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}

module.exports = app;
