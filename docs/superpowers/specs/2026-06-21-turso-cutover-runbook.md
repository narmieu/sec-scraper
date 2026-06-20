# Turso Cutover Runbook

The code migration (JSON → libSQL/`@sec/db`) is complete and merged. These are the
**one-time operational steps** to point production at a real Turso database. Until
they're done, the hourly Action fails fast (the `require database secret` guard) and
the Vercel build reads an empty database.

Order matters: provision → secrets → migrate → verify → finalize.

## 1. Provision the database (Turso)

```bash
# install CLI: https://docs.turso.tech/cli/installation
turso auth login
turso db create sec-scraper
turso db show sec-scraper --url            # -> libsql://sec-scraper-<org>.turso.io
turso db tokens create sec-scraper          # -> full-access token (scraper + migration)
turso db tokens create sec-scraper --read-only   # -> read token (Vercel build)
```

Local SQLite alternative (no account): leave `TURSO_DATABASE_URL` unset and everything
uses `data/local.db`. Fine for dev; not for the hosted Action/Vercel.

## 2. Set secrets

GitHub Actions (scraper — full-access token):

```bash
gh secret set TURSO_DATABASE_URL --body "libsql://sec-scraper-<org>.turso.io"
gh secret set TURSO_AUTH_TOKEN   --body "<full-access-token>"
# optional: trigger a Vercel rebuild after each scrape (see step 5)
gh secret set VERCEL_DEPLOY_HOOK_URL --body "<vercel-deploy-hook-url>"
```

Vercel (dashboard build — read-only token), for the Production environment:

```bash
# from apps/dashboard, or set via the Vercel dashboard › Settings › Environment Variables
vercel env add TURSO_DATABASE_URL production   # libsql://sec-scraper-<org>.turso.io
vercel env add TURSO_AUTH_TOKEN   production   # <read-only-token>
```

## 3. Migrate the data into Turso

Run once from your machine (reads the local `data/` files, writes to Turso):

```bash
# bash
TURSO_DATABASE_URL="libsql://sec-scraper-<org>.turso.io" \
TURSO_AUTH_TOKEN="<full-access-token>" \
pnpm --filter @sec/db migrate
```

```powershell
# PowerShell
$env:TURSO_DATABASE_URL = "libsql://sec-scraper-<org>.turso.io"
$env:TURSO_AUTH_TOKEN   = "<full-access-token>"
pnpm --filter @sec/db migrate
```

Expect: `vulns table now holds <N> rows` (≈11.7k) and `row count == expected`. The
script is idempotent — safe to re-run.

## 4. Verify end-to-end

```bash
# scraper: trigger a manual run and confirm it writes to Turso
gh workflow run scrape.yml
gh run watch

# dashboard: trigger a build and confirm the index is populated
turso db shell sec-scraper "SELECT count(*) FROM vulns;"
```

Then open the deployed dashboard — it should show the same vulns as before.

## 5. (Optional) Auto-rebuild the dashboard after each scrape

The dashboard is a static export that reads Turso **at build time**, so new scrapes
only appear after a rebuild. Create a Vercel **Deploy Hook**
(Settings › Git › Deploy Hooks), store it as the `VERCEL_DEPLOY_HOOK_URL` GitHub
secret (step 2). The workflow's `trigger dashboard rebuild` step then fires it each
run. Without it, rebuild manually or on Vercel's own cadence.

## 6. Finalize — remove the legacy JSON data from git

Only after steps 3–4 confirm Turso holds the data. `stack.json` stays (hand-edited config).

```bash
git rm data/vulns.json data/sources.json data/alerted.json data/last-run.json
git rm -r data/archive
cat >> .gitignore <<'EOF'

# Legacy scraper data — now in the database (Turso)
data/vulns.json
data/sources.json
data/alerted.json
data/last-run.json
data/archive/
EOF
git commit -m "chore: drop legacy JSON data store (migrated to Turso)"
```

`.git` stops growing here. It does **not** shrink — the 160 MB of historical scrape
commits remain in history. Reclaiming that is a separate, history-rewriting job
(`git filter-repo --path data/vulns.json --path data/archive --invert-paths`) that
must be force-pushed and coordinated with any clones; out of scope for this migration.
