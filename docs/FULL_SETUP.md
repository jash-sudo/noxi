# NOXI — full free setup

This is the exact setup path for the repository. Keep the repo private while setting it up.

## 1. Clone it

```powershell
git clone https://github.com/jash-sudo/noxi.git
cd noxi
npm install
Copy-Item .env.example .env
```

Never edit `.env.example` with real credentials. Put private values only in `.env` locally or in your host's private Environment settings.

## 2. Generate the three NOXI secrets

Run this three separate times:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Put three different outputs in `.env`:

```text
SESSION_SECRET=<random 1>
OWNER_SETUP_TOKEN=<random 2>
NOXI_INTERNAL_API_SECRET=<random 3>
```

Leave `OWNER_USERNAME=jash`.

Check that `.env` is ignored:

```powershell
git status
```

`.env` must NOT appear as a file to commit.

## 3. Free Postgres database

Create a free Supabase project using an account that is allowed to use the service under its current terms.

Get the Postgres connection string from the project/database connection settings and place it in local `.env`:

```text
DATABASE_URL=<private postgres connection URL>
```

Do not paste that URL into browser code or GitHub.

Initialize all NOXI tables:

```powershell
npm run db:init
```

This creates users, profiles, links, socials, analytics, reports, audit logs, Premium grants, password reset tokens, rewarded-ad progress, Discord links, uploads metadata, and site settings. The session table is automatically created by the app.

## 4. Test locally

```powershell
npm run check
npm start
```

Open:

```text
http://localhost:3000
```

Create `jash`. The registration page will ask for the private `OWNER_SETUP_TOKEN` only when that username is being created.

After `jash` exists, generate a fresh value for `OWNER_SETUP_TOKEN` and replace the old one. The existing owner account stays owner; this simply invalidates the original setup token.

## 5. Optional uploads

NOXI can upload profile media to a public Supabase Storage bucket.

Create a bucket named:

```text
noxi-uploads
```

If you want uploaded media to render directly on public profiles, configure that bucket for public reads according to Supabase's current storage controls.

Then put these ONLY in `.env`/Render Environment:

```text
SUPABASE_URL=<project URL>
SUPABASE_SERVICE_ROLE_KEY=<server-only service-role key>
SUPABASE_STORAGE_BUCKET=noxi-uploads
```

The service-role key is highly sensitive. It must never be placed in `public/`, frontend JavaScript, GitHub, or a screenshot.

Allowed upload types are limited in code and files are capped at 8 MB.

## 6. Optional password-reset email

NOXI already creates secure one-use password-reset tokens. To email them automatically, configure a supported email provider through the included Resend adapter:

```text
RESEND_API_KEY=<private provider key>
EMAIL_FROM=<verified sender address>
```

If email is not configured, registration/login still work; automatic reset-email delivery remains unavailable until these values are added.

Follow the email provider's current account/age/identity rules. Do not bypass them.

## 7. Deploy the web app on Render Free

The repository contains `render.yaml`.

In Render:

1. Create a new Blueprint/Web Service from `jash-sudo/noxi`.
2. Choose the free web service option if it is still offered for your account/region.
3. Build command: `npm install && npm run check`
4. Start command: `npm start`
5. Health check: `/health`

Add these Environment values in Render. Never upload `.env` to GitHub.

Required:

```text
NODE_ENV=production
BASE_URL=https://noxi.lol
OWNER_USERNAME=jash
SESSION_SECRET=<private random 1>
OWNER_SETUP_TOKEN=<private random 2 or rotated replacement>
NOXI_INTERNAL_API_SECRET=<private random 3>
DATABASE_URL=<private Postgres URL>
```

Optional features can stay blank/off initially:

```text
RESEND_API_KEY=
EMAIL_FROM=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=noxi-uploads
REWARDED_ADS_ENABLED=false
REWARDED_AD_WEBHOOK_SECRET=
DONATIONS_ENABLED=false
DONATION_URL=
```

Render provides `PORT`; do not hardcode a production port.

## 8. Connect `noxi.lol`

In Render's custom-domain settings, add:

```text
noxi.lol
```

Render will show the exact DNS record it expects. Copy that exact record into GoDaddy DNS. Do not guess the target.

If Render offers `www.noxi.lol`, add that too and redirect it to the root domain.

Wait for DNS verification and HTTPS certificate issuance. Production `BASE_URL` should stay:

```text
https://noxi.lol
```

## 9. Discord moderation bot

The source is `discord/bot.js`.

Create a Discord application/bot through Discord's official developer dashboard. Add the bot to a server you control with only the permissions you actually need.

Put these values only in the bot host's private Environment settings:

```text
DISCORD_BOT_TOKEN=<private>
DISCORD_CLIENT_ID=<application id>
DISCORD_GUILD_ID=<server id>
NOXI_INTERNAL_API_URL=https://noxi.lol
NOXI_INTERNAL_API_SECRET=<same private internal secret used by web app>
```

Run:

```powershell
npm run bot
```

The bot registers private moderation commands for user lookup, ban/unban, temporary Premium, and site stats. The internal API uses a separate shared secret and never exposes database credentials to Discord.

## 10. Rewarded Premium

NOXI contains the server-side reward verification path. It is OFF by default.

Do not enable it until you have a legitimate rewarded-ad provider that supports server callbacks and permits your account/use case.

When you have one, create a private webhook secret and configure the provider to send verified events to:

```text
POST https://noxi.lol/api/rewards/provider-callback
```

NOXI expects an HMAC-SHA256 signature in:

```text
x-noxi-signature
```

using `REWARDED_AD_WEBHOOK_SECRET`.

Then set:

```text
REWARDED_ADS_ENABLED=true
REWARDED_AD_WEBHOOK_SECRET=<private secret>
```

The owner can control required completions and Premium duration from `/admin/settings`. Browser-only/fake ad completion is intentionally not accepted.

## 11. Donations

NOXI never handles raw payment-card information. Donations are an external-provider link only.

After an eligible account holder legitimately creates a provider page, set:

```text
DONATIONS_ENABLED=true
DONATION_URL=https://...
```

If the provider requires an adult account holder, identity verification, tax information, or other requirements, those requirements must be followed rather than bypassed.

## 12. Production verification

Check all of these before sharing the site:

```text
/                       minimal homepage
/register               account creation
/login                  login
/dashboard              editor
/jash                   owner profile
/analytics              daily views
/account                password/account controls
/premium                Premium page
/donate                 donation state
/admin                   moderation panel
/admin/settings          owner settings
/privacy                 privacy page
/terms                   terms page
/health                  { ok: true }
```

Also test:

- a normal account cannot access `/admin`
- a moderator cannot change owner status
- the owner cannot be banned by admin actions
- invalid `javascript:` links do not save
- `.env` never appears in `git status`
- database data survives web-service restarts
- HTTPS is active on `noxi.lol`
- secrets do not appear in HTML/source/network responses

## 13. Secret leak rule

If a real secret is ever committed, assume it is exposed even if the repo is private. Removing the line is not enough because Git history may retain it.

Immediately rotate/revoke the exposed value at its provider, replace it in your local/host Environment settings, and only then continue.

## 14. What GitHub should contain

Safe:

```text
.env.example
source code
db/schema.sql
render.yaml
docs
```

Never commit:

```text
.env
DATABASE_URL
SESSION_SECRET
OWNER_SETUP_TOKEN
NOXI_INTERNAL_API_SECRET
DISCORD_BOT_TOKEN
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
REWARDED_AD_WEBHOOK_SECRET
provider/payment secrets
```
