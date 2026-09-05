# NOXI Security

## Secrets

Never commit real secrets to GitHub. `.gitignore` blocks `.env` and `.env.*` while allowing only `.env.example`.

Real values belong only in:

- your local `.env` file
- the hosting provider's private Environment/Secrets settings
- a legitimate secret manager

Never place secrets in `public/`, browser JavaScript, HTML, screenshots, issues, commits, README files, or Discord messages.

Treat all of these as private:

- `SESSION_SECRET`
- `OWNER_SETUP_TOKEN`
- `NOXI_INTERNAL_API_SECRET`
- `DATABASE_URL`
- `DISCORD_BOT_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `REWARDED_AD_WEBHOOK_SECRET`
- any future provider secret

If a secret is committed, deleting the visible line is not enough. Revoke/rotate it immediately because Git history may retain it.

## Generate strong values

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Generate a different value for every secret.

## Owner account

The owner role is stored and checked server-side. The username `jash` alone does not grant owner access. Initial registration requires the private `OWNER_SETUP_TOKEN`.

After the owner exists, rotate the setup token. Do not replace the owner logic with a client-side username check.

## Current protections

NOXI includes:

- bcrypt password hashing
- Postgres-backed sessions
- HTTP-only/SameSite cookies and Secure cookies in production
- CSRF tokens for normal state-changing forms
- same-origin checks for multipart uploads
- Helmet security headers and CSP
- request rate limiting
- server-side role/permission checks
- URL protocol validation
- HTML escaping
- upload MIME/size allowlists
- hashed, expiring, one-use password reset tokens
- moderation audit logs
- HMAC verification for rewarded-ad callbacks
- provider-reference replay protection
- internal Discord API secret authentication

## Production checklist

Before sharing the site:

- `NODE_ENV=production`
- `BASE_URL=https://noxi.lol`
- HTTPS verified
- strong unique server secrets
- Postgres database initialized from `db/schema.sql`
- `.env` absent from Git commits/history
- GitHub/host/database/domain accounts protected with 2FA where available
- storage service-role key only on the server
- Discord token only on the bot host
- rewarded ads disabled unless a legitimate provider callback is connected
- donation flow kept external so NOXI never stores raw card data
- account-provider age/identity/region requirements followed rather than bypassed

Run:

```powershell
npm run check
```

before production deploys.

## Security reports

Do not post live credentials or personal information in a GitHub issue. Rotate exposed credentials first, then describe the vulnerability without including the secret itself.
