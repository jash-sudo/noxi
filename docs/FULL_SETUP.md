# NOXI — free setup

This guide keeps secrets out of GitHub and gets the current app online using free-tier services.

## 1. Clone NOXI

```powershell
git clone https://github.com/jash-sudo/noxi.git
cd noxi
npm install
Copy-Item .env.example .env
```

## 2. Generate private secrets

Run this three separate times:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Put a different generated value in `.env` for:

- `SESSION_SECRET`
- `OWNER_SETUP_TOKEN`
- `NOXI_INTERNAL_API_SECRET`

Never paste real values into `.env.example`, README files, screenshots, Discord, issues, or commits.

`.env` is ignored by Git. Confirm before every push:

```powershell
git status
```

If `.env` ever appears under files to commit, stop and do not push.

## 3. Create the hosted database

Create a free Supabase project.

Open its SQL editor and run `db/schema.sql`.

Then copy the Postgres connection string from the Supabase project settings into your local `.env` as `DATABASE_URL`.

Treat `DATABASE_URL` like a password.

Do not put it in browser JavaScript or commit it.

## 4. Test locally

```powershell
npm run check
npm start
```

Open:

`http://localhost:3000`

Register the `jash` account and use the private `OWNER_SETUP_TOKEN` when asked.

## 5. Deploy the web app free on Render

1. Sign in to Render using your GitHub account.
2. Create a new Web Service from `jash-sudo/noxi`.
3. Select the free compute option.
4. Build command: `npm ci`
5. Start command: `npm start`
6. Add the environment variables shown below in Render's Environment page.

Do NOT create or upload a `.env` file to Render. Add secrets through Render's secret/environment UI.

Required production variables:

```text
NODE_ENV=production
BASE_URL=https://noxi.lol
OWNER_USERNAME=jash
SESSION_SECRET=<private random value>
OWNER_SETUP_TOKEN=<different private random value>
NOXI_INTERNAL_API_SECRET=<different private random value>
DATABASE_URL=<private Supabase Postgres URL>
REWARDED_ADS_ENABLED=false
DONATIONS_ENABLED=false
```

Render should set `PORT` automatically. The app must use `process.env.PORT`.

## 6. Connect noxi.lol

In the Render service settings, add `noxi.lol` as the custom domain.

Render will show the exact DNS record(s) it wants. In GoDaddy DNS, copy those exact values. Do not guess them.

Also add/verify `www.noxi.lol` if Render offers it, and redirect it to the root domain.

After DNS verifies, Render handles HTTPS certificates automatically.

## 7. Keep secrets private

Safe to commit:

- `.env.example`
- source code
- `db/schema.sql`
- `render.yaml`
- docs

Never commit:

- `.env`
- database URLs
- passwords
- session secrets
- owner setup token
- Discord bot token
- internal API secret
- payment/ad provider secret keys
- private service-role keys

If a secret is accidentally committed, deleting the line is not enough. Rotate the secret immediately because Git history may still contain it.

## 8. Discord moderation bot

Create a Discord application/bot through Discord's developer dashboard, then add these values only to the bot host's environment variables:

```text
DISCORD_BOT_TOKEN=<private>
DISCORD_CLIENT_ID=<application id>
DISCORD_GUILD_ID=<server id>
NOXI_INTERNAL_API_URL=https://noxi.lol
NOXI_INTERNAL_API_SECRET=<same private internal secret as the web service>
```

Start it with:

```powershell
npm run bot
```

The bot source is `discord/bot.js`.

The bot must never expose its token to frontend JavaScript.

## 9. Rewarded ads and donations

These stay OFF until a provider is connected that permits the account holder's age, region, and use case.

Never fake rewarded-ad completion on the browser. Premium should only be granted after a provider-verified server callback.

Never store raw card details in NOXI.

## 10. Before making the repo public

Run:

```powershell
git status
npm run check
```

Search your repo for obvious secret names and verify all values are placeholders.

Keep the repo private until the production setup is working and you have checked that no secret has ever been committed.
