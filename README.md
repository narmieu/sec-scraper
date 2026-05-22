# security-scraper

Self-hosted security vulnerability tracker. Scrapes broad sources (CVE feeds,
ecosystem advisories, AI/LLM-specific), dedupes, ranks by stack-relevance, and
renders a static Next.js dashboard. Hourly cron via GitHub Actions. Critical
alerts pushed to Microsoft Teams.

See [`docs/superpowers/specs/2026-05-22-security-scraper-design.md`](docs/superpowers/specs/2026-05-22-security-scraper-design.md)
for the full design.

## Setup

```bash
pnpm install
pnpm typecheck
```

## Local commands

```bash
pnpm dev                       # dashboard on http://localhost:3000
pnpm scrape                    # full pipeline, writes data/*.json
pnpm scrape --dry-run          # no writes, no notify
pnpm scrape --source=ghsa      # single adapter, debug
pnpm scrape --alert-test       # fake critical → notifiers
```

## Required secrets (GitHub Actions)

| Secret | Purpose |
|---|---|
| `SCRAPER_PAT` | Fine-grained PAT with `contents:write` |
| `NVD_API_KEY` | Boosts NVD rate limit (50 req/30s) |
| `TEAMS_WEBHOOK_URL` | Power Automate workflow webhook |
| `GITHUB_TOKEN` | Auto-provided, used for GHSA API |

## Teams webhook setup

1. Power Automate → Create from blank → trigger "When a Teams webhook request is received".
2. Add action "Post adaptive card in a chat or channel" bound to the target channel.
3. Save; copy the generated POST URL.
4. Add to GitHub repo secrets as `TEAMS_WEBHOOK_URL`.
5. Verify with `pnpm scrape --alert-test`.

## Repo visibility

Public is recommended to avoid the 2000-min/month Actions quota for private
repos. The data committed by the scraper is non-sensitive (aggregated from
public sources).
