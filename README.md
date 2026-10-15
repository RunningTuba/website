# Running Tuba AVL — website

Static marketing site for Running Tuba AVL, plus the one dynamic endpoint it
needs: the project-brief form on the home page.

- **Static site** — `public/`, plain HTML/CSS/JS, no build step.
- **Server** — `server/index.js`, Node + Express. Serves `public/` and handles
  `POST /api/contact`, delivering briefs to **Andy@runningtuba.com** through the
  [Resend](https://resend.com) API.
- **Hosting** — [Railway](https://railway.com), built from the `Dockerfile`.

## Local development

```bash
npm install
cp .env.example .env      # then paste your Resend key into RESEND_API_KEY
npm run dev               # http://localhost:8080
```

`npm run dev` reads `.env` automatically. `.env` is gitignored — never commit
the real key.

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | yes | — | From https://resend.com/api-keys, starts with `re_`. |
| `CONTACT_TO_EMAIL` | no | `andy@runningtuba.com` | Destination inbox. Comma-separate for several. |
| `CONTACT_FROM_EMAIL` | no | `Running Tuba Website <website@runningtuba.com>` | Domain must be verified in Resend. See below. |
| `PORT` | no | `8080` | Injected by Railway. |
| `RESEND_ENDPOINT` | no | `https://api.resend.com/emails` | Override for testing. |

If `RESEND_API_KEY` is unset the site runs normally but the form returns **503**,
and the front end shows the "call us instead" fallback.

## The contact form

The home page form posts JSON to `POST /api/contact`. The server validates the
input, then calls Resend with:

- `to` → `CONTACT_TO_EMAIL`
- `reply_to` → the submitter's address, so Andy can just hit Reply
- `from` → `CONTACT_FROM_EMAIL`

It replies `{"result":"ok"}` on success — which is exactly what `script.js`
checks before showing the confirmation. Failures return a non-2xx with
`{"result":"error"}`, and the page falls back to the phone number.

Guardrails: a hidden honeypot field (`website`), a 5-per-10-minutes per-IP rate
limit, field length caps, HTML-escaped email bodies, and a 10s timeout on the
Resend call.

### Resend setup

> **Current status: the form delivers, but through a temporary sender.**
> `runningtuba.com` is not verified in Resend, so sends from
> `website@runningtuba.com` are rejected with a **403**. The service is
> therefore configured with `CONTACT_FROM_EMAIL=onboarding@resend.dev`, Resend's
> shared testing sender, which does deliver today — but *only* to the Resend
> account owner (`andy@runningtuba.com`). It will silently stop working for any
> other recipient, and it is not an appropriate permanent sender.

To finish the setup:

1. Verify `runningtuba.com` under **Domains** at https://resend.com/domains and
   add the DNS records Resend gives you (SPF/DKIM, plus DMARC for deliverability).
2. Once it shows **Verified**, switch the sender back:

   ```bash
   railway variable set "CONTACT_FROM_EMAIL=Running Tuba Website <website@runningtuba.com>" \
     --service website \
     --project fa376087-2329-4424-b595-286abc8531d1 \
     --environment 6ed7b8aa-a247-4c88-ae48-840b022caa3e
   ```

3. Update `.env` to match. You can then also uppercase `CONTACT_TO_EMAIL` if you
   prefer — the lowercase requirement only applies to the `onboarding@resend.dev`
   sender, which compares the recipient address case-sensitively.

The current API key is **send-only** (restricted), which is deliberate: it cannot
read the domain list or manage the account. Use an unrestricted key in the Resend
dashboard if you need to query the API by hand.

## Deploying

Railway builds the `Dockerfile` and health-checks `/health`.

```bash
# one-time: push the local .env value up as a Railway secret
railway variable set RESEND_API_KEY --stdin --service website   # then paste & Ctrl-D
railway variable set CONTACT_TO_EMAIL=Andy@runningtuba.com --service website
railway variable set "CONTACT_FROM_EMAIL=Running Tuba Website <website@runningtuba.com>" --service website
```

The service is connected to this GitHub repo, so **pushing to `main` deploys
automatically**.

## Layout

```
public/            web root — only files here are reachable over HTTP
  index.html         home page (contains the project-brief form)
  script.js          form handling, nav, lightbox, glossary
  styles.css
  images/ logos/ video/
server/index.js    static serving + POST /api/contact
Dockerfile         node:22-alpine, non-root, health-checked
railway.json       Dockerfile builder + /health health check
```

`public/` is the web root in both local dev and production, so what you test
locally is exactly what ships.
