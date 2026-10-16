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

Sending is live from the verified subdomain **`send.runningtuba.com`**, so briefs
arrive from `Running Tuba Website <website@send.runningtuba.com>` with `reply_to`
set to the submitter.

Resend verified the domain on its **DKIM** record alone. Two of the three records
Resend asks for are still unpublished:

| Type | Host | Value | Status |
| --- | --- | --- | --- |
| TXT | `resend._domainkey.send` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ…` | published |
| MX | `send` | `feedback-smtp.<region>.amazonses.com` (priority 10) | **not published** |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | **not published** |

Delivery works without them — DKIM is what authenticates the mail. Publishing the
MX record lets Resend receive bounce and complaint notifications, and the SPF
record improves alignment for receivers that weigh it. Worth adding, but not
blocking.

There is also a stray `send.send.runningtuba.com` CNAME pointing at
`send.forge.rmta.net`, an unrelated sending setup. It does nothing for this site
and looks like a duplicate created by pasting a full hostname into GoDaddy's
relative Name field. Safe to delete once you've confirmed nothing else uses it.

Check DNS state at any time with:

```bash
dig +short MX send.runningtuba.com
dig +short TXT send.runningtuba.com
dig +short TXT resend._domainkey.send.runningtuba.com
```

The API key in use is **send-only** (restricted): it can send mail but cannot read
the domain list or manage the account. That is deliberate least-privilege — use an
unrestricted key in the Resend dashboard if you need to query the API by hand.

## Deploying

Railway builds the `Dockerfile` and health-checks `/health`.

```bash
# one-time: push the local .env value up as a Railway secret
railway variable set RESEND_API_KEY --stdin --service website   # then paste & Ctrl-D
railway variable set CONTACT_TO_EMAIL=andy@runningtuba.com --service website
railway variable set "CONTACT_FROM_EMAIL=Running Tuba Website <website@send.runningtuba.com>" --service website
```

> **Auto-deploy on push is not currently active.** The service is linked to
> `RunningTuba/website`, but Railway's GitHub App has not been granted access to
> that repository (it covers `RunningTuba/bassline`, which predates it), so pushes
> to `main` do not trigger a build. Add the repo at
> **github.com/settings/installations → Railway → Configure → Repository access**.
>
> Until then, deploy by triggering a build against a commit:
>
> ```bash
> SHA=$(git rev-parse HEAD)
> railway api 'mutation($s:String!,$e:String!,$c:String!){serviceInstanceDeployV2(serviceId:$s,environmentId:$e,commitSha:$c)}' \
>   --variables "{\"s\":\"2631d20e-9528-41fe-b54d-9a25ebe70058\",\"e\":\"6ed7b8aa-a247-4c88-ae48-840b022caa3e\",\"c\":\"$SHA\"}"
> ```

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
