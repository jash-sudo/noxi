# NOXI

Minimal profile platform for `noxi.lol`.

NOXI intentionally keeps the public homepage quiet: black, white, a username field, login, and Premium. The application behind it includes the account, profile, moderation, analytics, Premium, storage, and deployment infrastructure.

## Included

- registration, login, logout, secure sessions
- case-insensitive unique usernames
- reserved system usernames
- owner setup protection for `jash`
- password hashing with bcrypt
- password reset token flow + optional Resend delivery
- public `noxi.lol/{username}` profiles
- display name, bio, avatar and background
- links and social links
- accent/text colors and font selection
- Premium video backgrounds, profile audio, opacity, blur, entrance effects
- browser-safe audio controls (no autoplay bypass)
- Supabase Storage upload adapter
- profile view counts + 30-day daily analytics
- reporting system
- moderator/admin/owner roles
- ban, unban, suspend, Premium grants, report review
- audit logs
- owner site settings
- registration/maintenance switches
- temporary Premium grants
- server-verified rewarded-ad webhook framework with replay protection
- external donation URL support (NOXI never handles raw card data)
- Discord moderation bot + private internal API
- Postgres production database
- Postgres-backed sessions
- CSRF protection and same-origin upload checks
- Helmet/CSP, rate limiting, secure cookies, output escaping, URL validation
- privacy and terms pages
- `/health` endpoint
- free Render deployment blueprint
- automatic GitHub code checks

## Keep secrets out of the big 'hub

Real secrets never belong in this repository. `.gitignore` blocks `.env` and local secret files. `.env.example` contains names/placeholders only.

Generate secrets with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Use a different generated value for every secret.

## Fast local setup

```powershell
git clone https://github.com/jash-sudo/noxi.git
cd noxi
npm install
Copy-Item .env.example .env
```

Create a free hosted Postgres database, put its private connection URL in `.env` as `DATABASE_URL`, then:

```powershell
npm run db:init
npm run check
npm start
```

Open `http://localhost:3000`.

## Production/free setup

Follow **[docs/FULL_SETUP.md](docs/FULL_SETUP.md)** from top to bottom. It covers the database, secret values, Render, `noxi.lol`, uploads, password-reset email, Discord, rewarded ads, donations, and final verification.

## Owner account

The intended owner username is `jash`, but the username itself never grants owner access. Registration as `jash` requires the private `OWNER_SETUP_TOKEN` from the server environment. After the owner account exists, rotate that token to a new random value.

## Provider integrations

The code for uploads, reset email, Discord, rewarded-ad callbacks, and external donations is already in the repository. Features that depend on a third-party account remain off until that provider's legitimate credentials are entered in the hosting provider's private Environment settings.

Do not put provider tokens into frontend JavaScript, GitHub, screenshots, issues, or chat messages.

## Important files

```text
server.js                 entrypoint
src/app.js                web application/routes
src/db.js                 Postgres layer
src/security.js           validation/CSRF/security helpers
src/views.js              minimal server-rendered UI
src/integrations.js       email/storage/reward adapters
public/style.css          NOXI visual design
public/app.js             tiny browser-side behavior
db/schema.sql             complete Postgres schema
discord/bot.js            Discord moderation bot
render.yaml               free deployment blueprint
docs/FULL_SETUP.md        exact setup instructions
SECURITY.md                secret/security checklist
```

Keep the repository private until deployment is verified and you have confirmed no real secret has ever been committed.
