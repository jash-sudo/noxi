# NOXI — Free and Safe Setup

This guide keeps secrets out of GitHub and explains the safest free path for the current NOXI codebase.

## Important current limitation

NOXI currently uses a local SQLite file (`noxi.db`). That is fine for development on your own PC, but many free web hosts use an ephemeral filesystem. On those hosts the database can disappear after a restart, redeploy, or idle shutdown.

Do **not** invite real users until the database has been migrated to a persistent hosted database such as Postgres/Supabase.

## 1. Clone the private repository

```powershell
git clone https://github.com/jash-sudo/noxi.git
cd noxi
npm install
```

## 2. Create your local secret file

```powershell
Copy-Item .env.example .env
```

`.env` is ignored by Git and should stay only on your computer.

Open `.env` and use values like:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
OWNER_USERNAME=jash
OWNER_SETUP_TOKEN=REPLACE_WITH_A_DIFFERENT_LONG_RANDOM_SECRET
BASE_URL=http://localhost:3000
```

Generate a random secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run it twice and use different outputs for `SESSION_SECRET` and `OWNER_SETUP_TOKEN`.

Never paste your real `.env` into GitHub, a README, an issue, a screenshot, or frontend JavaScript.

## 3. Run locally

```powershell
npm start
```

Open:

`http://localhost:3000`

Register the username `jash` and supply your `OWNER_SETUP_TOKEN` when asked. That creates the owner account. The username by itself does not grant owner permissions.

After the owner account has been created successfully, replace or remove the owner setup token from the production host so it cannot be reused.

## 4. Check Git before every push

Use:

```powershell
git status
```

You should **not** see `.env` or `noxi.db` listed as files to commit.

You can also check:

```powershell
git check-ignore .env
git check-ignore noxi.db
```

Both should print the file name, confirming Git is ignoring them.

## 5. Free public hosting

The current Express app can run on a free Node web service such as Render, but the current SQLite database is not safe there because free web-service filesystems are ephemeral.

The correct public architecture is:

- GitHub private repo — source code
- Free Node web service — NOXI Express server
- Free persistent Postgres/Supabase database — users/profiles/moderation data
- DNS provider / registrar — `noxi.lol`
- Hosting provider environment settings — secrets

Do not put production secrets in GitHub just because the repo is private. Private repositories can still be shared accidentally or exposed by compromised credentials.

## 6. Environment variables on the host

When you deploy, enter secrets through the host's **Environment Variables / Secrets** screen. Do not create and commit a production `.env` file.

Production variables should eventually include:

```env
NODE_ENV=production
SESSION_SECRET=<random secret>
OWNER_USERNAME=jash
OWNER_SETUP_TOKEN=<temporary random setup token>
BASE_URL=https://noxi.lol
DATABASE_URL=<hosted database connection string>
```

Future integrations can add their own server-only values, for example Discord/storage/payment provider keys. Those must never be exposed in `public/` or browser JavaScript.

## 7. Domain setup

Only connect `noxi.lol` after the public deployment works on the host's temporary URL.

General order:

1. Deploy NOXI.
2. Confirm registration/login/profile pages work.
3. Add `noxi.lol` as a custom domain in the hosting dashboard.
4. The host will show the exact DNS record(s) it expects.
5. Add only those exact records at your registrar/DNS provider.
6. Wait for DNS verification.
7. Confirm `https://noxi.lol` works and HTTPS is valid.
8. Set `BASE_URL=https://noxi.lol` in the host environment.

Never guess DNS records and do not delete unrelated email/TXT records.

## 8. Account security

Enable 2FA on:

- GitHub
- your hosting provider
- database provider
- domain/DNS account
- Discord account used for administration

Use unique passwords for each service.

## 9. Before real users

The following must be completed before treating NOXI as a real public service:

- migrate SQLite to persistent Postgres/Supabase
- use a persistent production session store instead of the default in-memory Express session store
- add CSRF protection for state-changing form actions
- enable a strict Content Security Policy instead of disabling CSP
- validate remote image/background URLs more strictly or move to controlled uploads
- add email verification/password reset if email accounts are relied on
- connect and permission-check the Discord bot
- connect a compliant donation/payment provider only if its account requirements are satisfied
- connect rewarded ads only if the provider explicitly supports that use case
- add backups and recovery procedures

## If a secret is accidentally pushed

1. Immediately revoke/rotate the exposed credential at the provider.
2. Create a new secret.
3. Remove the secret from the repository/history as needed.
4. Update the hosting environment with the new value.

Deleting the visible file alone does not make a leaked secret safe again.
