# NOXI — free setup

The old SQLite/MVP setup guide has been retired because NOXI now uses the production Postgres stack.

Use **[FULL_SETUP.md](FULL_SETUP.md)** instead. It is the current step-by-step guide for:

- keeping `.env` and all secrets out of GitHub
- creating the free Postgres database
- initializing the schema
- creating the protected `jash` owner account
- deploying on Render
- connecting `noxi.lol`
- optional Supabase Storage uploads
- optional password-reset email
- Discord moderation bot
- rewarded Premium callbacks
- external donations
- final security/deployment checks

Do not follow older instructions that mention `noxi.db` or production SQLite; those no longer match the current codebase.
