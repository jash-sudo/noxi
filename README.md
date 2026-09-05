# NOXI

Minimal profile pages for `noxi.lol`.

## Current status

NOXI is a working MVP, not the final full platform yet.

Working now:

- minimal NOXI homepage
- registration + login
- unique usernames
- public profiles at `/:username`
- profile editor
- links, bio, avatar/background URLs, accent color
- profile view counter
- reports
- owner/admin panel
- ban/unban
- temporary Premium grants
- audit logs
- Premium and donate placeholders

Still needs production work before real users:

- persistent hosted Postgres/Supabase database
- persistent production session store
- CSRF protection
- stricter CSP/security hardening
- controlled file uploads/storage
- password reset/email verification
- Discord bot integration
- rewarded-ad provider integration
- donation/payment provider integration
- final `noxi.lol` deployment/DNS

## Run locally

```powershell
git clone https://github.com/jash-sudo/noxi.git
cd noxi
npm install
Copy-Item .env.example .env
npm start
```

Open `http://localhost:3000`.

## Secrets

Never commit `.env`.

The repository's `.gitignore` blocks `.env`, `.env.*`, local databases, logs, and other local files. Only `.env.example` is meant to be committed.

Generate strong values with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Use different random values for `SESSION_SECRET` and `OWNER_SETUP_TOKEN`.

See **[SECURITY.md](SECURITY.md)** for the security checklist.

## Owner account

The intended owner username is `jash`, but the username alone does not grant owner access.

Before registering `jash`, set a strong `OWNER_SETUP_TOKEN` in your local/hosting environment. Supply that token during owner registration.

After the owner account is created, remove or rotate the production owner setup token so it cannot be reused.

## Free deployment

Do not deploy the current SQLite database as important user storage on a free ephemeral web host. Data can disappear after restarts or redeploys.

Use **[docs/FREE_SETUP.md](docs/FREE_SETUP.md)** for the safe free setup path and the exact secret-handling steps.

## Security rule

Real secrets belong only in your local `.env` or your hosting provider's secret/environment settings. Never place database passwords, Discord bot tokens, payment keys, service-role keys, or session secrets in GitHub or frontend code.
