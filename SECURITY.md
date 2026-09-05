# NOXI Security

## Secrets

Never commit real secrets to GitHub. The repository intentionally ignores `.env` and `.env.*` files while keeping only `.env.example` as a template.

Real values belong only in one of these places:

- your local `.env` file on your own computer
- the hosting provider's Environment / Secrets settings
- a dedicated secret manager

Never place secrets in `public/`, client-side JavaScript, HTML, screenshots, issues, commits, README files, or Discord messages.

Treat these as secrets:

- `SESSION_SECRET`
- `OWNER_SETUP_TOKEN`
- database passwords / connection strings
- Discord bot tokens
- payment provider keys
- ad provider server keys
- storage service keys

If a secret is ever committed, deleting the file is not enough. Rotate/revoke that secret immediately because Git history may still contain it.

## Generating strong values

PowerShell:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Use different random values for `SESSION_SECRET` and `OWNER_SETUP_TOKEN`.

## Owner account

The owner role is checked server-side. The username alone does not grant owner access. Before registering `jash`, set a strong `OWNER_SETUP_TOKEN`. Do not share that token.

After the owner account exists, you should remove the owner setup token from the hosting environment or replace it with a fresh random value so it cannot be reused.

## Production checklist

Before making the site public:

- Set `NODE_ENV=production`.
- Set a strong `SESSION_SECRET`.
- Set a strong `OWNER_SETUP_TOKEN` before owner registration.
- Use HTTPS only.
- Keep the GitHub repo private while the project is early-stage.
- Enable 2FA on GitHub, hosting, database, DNS, and Discord accounts.
- Do not use SQLite on an ephemeral free host for important user data.
- Use a persistent hosted database before inviting real users.
- Keep dependencies updated.
- Review moderation/admin logs regularly.
- Never expose database service-role keys or Discord bot tokens to the browser.

## Reporting a security issue

Do not post active secrets, private tokens, or personal information in a public GitHub issue. Rotate exposed credentials first.