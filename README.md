# NOXI

Minimal profile pages for `noxi.lol`.

## What works now

- Minimal homepage matching the NOXI look
- Registration + login
- Unique usernames
- Public profiles at `/:username`
- Profile editor
- Links, bio, avatar/background URLs, accent color
- View counter
- Reports
- Owner/admin panel
- Ban/unban
- Temporary Premium grants
- Audit logs
- Premium and donate placeholders ready for provider integrations

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

On Windows PowerShell:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Open `http://localhost:3000`.

## Owner account

The owner username defaults to `jash`.

Before registering `jash`, set a strong `OWNER_SETUP_TOKEN` in `.env`. When registering the `jash` account, enter that token in the owner setup token field. This prevents someone from getting owner permissions merely by claiming the username first.

Also replace `SESSION_SECRET` with a long random value before production.

## Production notes

This first version uses SQLite so it runs immediately with almost no setup. For public deployment, use persistent storage or migrate the database layer to hosted Postgres/Supabase before expecting lots of users.

Do not commit `.env`, tokens, passwords, payment secrets, Discord bot tokens, or database credentials.

## Next integrations

The app is structured so these can be connected next without redesigning the homepage:

- Supabase/Postgres
- Cloudflare R2 uploads
- Discord bot moderation
- Rewarded ad provider
- Donation/payment provider
- noxi.lol custom domain
