<div align="center">
  <img src="docs/brand/readme-logo.png" width="88" alt="Gisthalt" />

  # Gisthalt Newsroom

  **A local, automated, Indonesian-language newsroom for Formula&nbsp;1, Valorant and Film/TV.**

  ![Status](https://img.shields.io/badge/status-local%20MVP-2ea88f?style=flat-square)
  ![Publishing](https://img.shields.io/badge/publishing-dry--run%20by%20default-e0a72f?style=flat-square)
  ![Node](https://img.shields.io/badge/node-%E2%89%A522.9-3c873a?style=flat-square&logo=node.js&logoColor=white)
  ![pnpm](https://img.shields.io/badge/pnpm-9.15.9-f69220?style=flat-square&logo=pnpm&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
  ![Docker](https://img.shields.io/badge/docker-compose-2496ed?style=flat-square&logo=docker&logoColor=white)
  ![License](https://img.shields.io/badge/license-private-lightgrey?style=flat-square)

  [Quick start](#quick-start) ·
  [Dashboard](#dashboard) ·
  [Configuration](#configuration) ·
  [Windows publisher](#windows-publisher) ·
  [Validation](#validation--testing) ·
  [Docs](#learn-more)
</div>

<br>

Facts come from machines; words come from the model. Gisthalt polls structured and prose sources for three verticals, runs every claim through a deterministic verification gate, composes a branded graphic from a combinatorial template system, and queues it for review or auto-publish — never the other way around. The full design rationale lives in [PLAN.md](PLAN.md); this file is the operator's manual.

## Contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Dashboard](#dashboard)
- [Configuration](#configuration)
- [Windows publisher](#windows-publisher)
- [Validation & testing](#validation--testing)
- [Data & architecture boundaries](#data--architecture-boundaries)
- [Project layout](#project-layout)
- [Learn more](#learn-more)

## How it works

```mermaid
flowchart LR
    A[Sources\nOpenF1 · Jolpica · FIA\nVLR · TMDB · RSS · Reddit] --> B[Gate\nR0–R4 rules]
    B -->|auto| C[Compose\narchetype · layout · skin]
    B -->|review| R[Review queue\nDashboard + Discord]
    R -->|approve| C
    C --> D[Render\nLinux · Playwright]
    D --> E[Publish\nX · Instagram · Threads · TikTok]
    E --> F[(Archive)]
```

Three brands (F1, VCT, Film/TV) share one pipeline and one set of rules; only their tokens, archetypes and source adapters differ. A claim is **never** trusted on a model's say-so — tier-A structured data (race results, standings, match scores) needs zero model calls, tier-B prose needs a verbatim supporting quote for every number it carries, and anything else waits for a human tap in the review queue.

## Quick start

Requires Docker Desktop with Linux containers. Allow a few GB for the Playwright image, dependencies and render fixtures.

```sh
# Only on a fresh checkout — this preserves an existing .env.
cp .env.example .env

docker compose up -d --build
docker compose exec workers pnpm demo
```

Open **http://localhost:3939**. The demo seeds 60 treatments of a recorded F1 result plus two labelled VCT/film review examples — it does not enable accounts or enqueue real posts. File-mode data (if you ever run outside Docker) stays in `.data/store.json`; Docker uses its own Postgres volume.

```sh
docker compose ps
docker compose logs --tail 80 workers renderer dashboard
docker compose stop           # preserves the database and rendered artwork
```

| Service | Port | Notes |
|---|---|---|
| Dashboard | `3939` | Next.js, localhost-only, no auth |
| Renderer | `8787` | Playwright/Chromium, pinned fonts, Linux-only output |
| Postgres | `55432` | Source of truth for items, claims, decisions, posts |

Workers poll sources on persistent Graphile jobs; the default stack does **not** run a publishing agent, all seeded accounts start inactive at the manual-only warm-up stage, and Docker always runs in dry-run mode.

## Dashboard

| Screen | What it does |
|---|---|
| **Template lab** | Pick a brand, archetype, fixture, layout, skin and accents. Render one preview or all valid combinations for an archetype. |
| **Contact sheet** | Inspect the latest 60 treatments and a nine-post profile-grid preview. Select 2–6 same-brand claims to build a cover/body/outro carousel. |
| **Review** | Edit each platform's caption, reshuffle the design, approve, reject, or hold for a second corroborating source. Reviews expire after 90 minutes; approval requires an active account. |
| **Ops** | Pause publishing globally, configure account handles/warm-up/caps, pause individual sources, inspect source health and session state, cancel queued work, reconcile uncertain posts, and run a live-launch preflight. |

A removal request for an already-live post still needs manual platform deletion and owner confirmation — the dashboard never claims a deletion it can't verify.

## Configuration

Copy `.env.example` to `.env`, fill in what you need, then recreate the affected services: `docker compose up -d`.

### Core (already set by `cp .env.example .env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `STORE_BACKEND` | Docker's services use their own internal `DATABASE_URL` regardless of this file; set it here only for running CLI scripts (`pnpm pipeline`, `pnpm renderer`, …) directly on the host. |
| `RENDER_OUT_DIR`, `ARCHIVE_DIR`, `AGENT_PROFILE_ROOT`, `PUBLISH_RECEIPT_DIR` | Local artifact directories — renders, the post archive, browser profiles, publish receipts. |
| `PUBLISH_DRY_RUN`, `PUBLISH_KILL_SWITCH` | `true`/`true`-to-halt safety rails. Docker always forces dry-run. |
| `PUBLISH_JITTER_MAX_MINUTES`, `PUBLISH_MIN_INTERVAL_SECONDS` | Pacing enforced in code, never in a cron expression — an exact cadence is the easiest bot signal there is. |
| `ENABLE_R2`, `ENABLE_R3` | Off by default. Turn on only after you've watched the gate's decisions on real items and agree with its calls. |

### Optional integrations

| Variable | Get it from | Unlocks |
|---|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (free tier) | Quoted prose extraction and caption copy. Without it (or on exhausted quota), structured tier-A data still flows with **zero** model calls; unextracted prose goes to review instead of being dropped. |
| `TMDB_API_KEY` | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) | Indonesian-region release dates, cast and official trailer metadata for the Film/TV brand. |
| `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_OWNER_IDS`, `DISCORD_*_CHANNEL_ID` | [discord.com/developers/applications](https://discord.com/developers/applications) → bot token; enable Developer Mode in Discord to copy server/channel IDs | The Discord review loop — one-tap Publish / Edit / Reshuffle / Hold / Reject buttons that mirror the dashboard's Review screen. Start it with `docker compose --profile discord up -d bot`. |

Reddit needs no credentials at all: it reads the public per-subreddit Atom feed (`reddit.com/r/<sub>/new/.rss`) rather than the OAuth API, since Reddit's 2026 Responsible Builder Policy closed self-service app creation in favor of a manual, unbounded-wait approval queue. It's tier C either way — a signal that can only promote the primary source it links to, never a fact on its own.

FIA polling surfaces document links only — PDF-only decisions need human review. VLR completed-result parsing is implemented and fails visibly in Ops if upstream markup changes. Additional VCT/Film archetypes can render typed or reviewed claims without yet having a dedicated live source feed.

## Windows publisher

**Only one piece of this stack is Windows-specific.** Postgres, the renderer, the workers and the dashboard are the same Docker Compose stack on macOS or Windows — nothing about them changes when you move hosts. The one thing that can't run in Docker is the publisher agent (`apps/agent`): it drives a real, headed Chrome with a persistent, human-shaped browsing profile, and that needs an actual desktop session. So the move from Mac-dev to Windows-24/7 is: stand the same `docker compose up -d` up on the Windows box, then add the native agent on top of it.

### Host hygiene, once, before anything runs unattended

A box left on 24/7 with nobody watching it needs these done up front, not discovered later:

- **Disable sleep and hibernate**, including on the display's power plan — a sleeping PC is a publisher that silently stopped.
- **Docker Desktop → Settings → General → Start Docker Desktop when you sign in.**
- Copy [`scripts/windows/wslconfig.example`](scripts/windows/wslconfig.example) to `%UserProfile%\.wslconfig` and adjust `memory`/`processors` to the machine's actual RAM, then `wsl --shutdown`. Uncapped, the WSL2 VM backing Docker Desktop will grow to consume most of the machine and never give it back.
- **Windows Update → Advanced options → Active hours**: set it wide, and defer or schedule restarts — an update-triggered reboot on a machine with no auto-login means the agent's headed Chrome never comes back.
- **Enable auto-login** (`netplwiz`, or `sysdm.cpl` on some builds) so a reboot returns straight to a desktop session — headed Chrome cannot run against a locked screen or before anyone signs in.

### Setting up the agent

1. On the Windows host (with Docker Desktop already running the rest of the stack): install **Node ≥22.9** (or 24), **pnpm 9.15.9**, and **Google Chrome**.
2. `pnpm install --frozen-lockfile` on Windows, to rebuild native dependencies for that platform.
3. Run `scripts/windows/start-agent.ps1` in a logged-in Windows session. It points at Postgres on `55432` and the shared render folder.

**Simulate first.** Keep `PUBLISH_DRY_RUN=true`, enable one test account in Ops, and set its warm-up stage to 1 or above — the agent still enforces caps, quiet hours and jitter in dry-run mode, and results are marked `simulated`, never `published`.

**Going live** means setting `PUBLISH_DRY_RUN=false` in the native agent's environment only, enabling real accounts deliberately, completing a manual first login in each headed Chrome profile (`.data/profiles/<account-id>`), and verifying one controlled post per platform before trusting the queue. The adapters require the English desktop UI. **Actual logged-in X/Instagram/Threads/TikTok submission has not been validated in this workspace** — that acceptance step is the owner's to run. CAPTCHAs, checkpoints and account restrictions need a human at the keyboard.

`scripts/windows/install-agent-task.ps1` optionally registers an at-login task; it is not installed automatically. An interrupted submission stays `publishing` or `uncertain` until reconciled in Ops — never delete a receipt to blindly retry.

### Knowing when it's stopped

The worker process and the native agent each write a heartbeat timestamp every few seconds. With `DISCORD_BOT_TOKEN`, `DISCORD_OWNER_IDS` and `DISCORD_ALERTS_CHANNEL_ID` set, the Discord bot (`docker compose --profile discord up -d bot`) already pages `#alerts` the moment either heartbeat goes stale for two minutes — no separate watchdog to build or run. Without Discord configured, the same staleness is visible at a glance on the Ops screen.

### Controlled first F1 post: X, Instagram, and TikTok

The Review queue now has a **Launch X + Instagram + TikTok** action on F1 items. It queues exactly one rendered composition to those three platforms; it never includes Threads. The action remains subject to the normal daily cap, quiet hours, deterministic jitter, durable submission receipts, and manual reconciliation safeguards.

1. On the Windows publisher host, keep `PUBLISH_DRY_RUN=true`. In **Accounts**, set the three F1 handles, make only **X**, **Instagram**, and **TikTok** active, and use warm-up stage 1 with a cap of 1.
2. Start `pnpm agent`. Chrome opens a separate persistent profile for each active platform. Log in manually and finish any platform checkpoint or CAPTCHA. Wait for each account to show **session healthy** in the dashboard.
3. Choose one non-demo F1 review with its render and captions checked. Click **Launch X + Instagram + TikTok**. The preflight refuses placeholder handles, stage-0 accounts, missing sessions, non-F1 items, and any missing launch platform.
4. Confirm that exactly three `ready` jobs appear in Ops. They should become `simulated` in dry-run mode; verify the artwork, captions, archive files, timing, and no accidental Threads job.
5. For the real controlled post, change `PUBLISH_DRY_RUN=false` in the **native Windows agent environment only** and restart that agent. Do not change Docker's forced dry-run setting. Approve one newly reviewed F1 item, then wait through its normal jitter rather than forcing an exact cadence.
6. Confirm all three URLs in Ops and retain the local archive. If any job is `publishing` or `uncertain`, inspect the platform first and use Ops reconciliation; never blindly retry or remove its receipt.

## Validation & testing

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:unit

# Render tests must run inside the pinned Linux image — fonts and rasterisation
# differ from macOS/Windows, and that difference is exactly what this guards against.
docker compose run --rm renderer pnpm test
docker compose run --rm renderer pnpm golden

# Isolated end-to-end rendering/review/carousel/four-platform simulation:
docker compose run --rm workers pnpm smoke

# Optional: repository integration tests against the live project database.
TEST_DATABASE_URL=postgres://newsroom:newsroom@127.0.0.1:55432/newsroom \
  pnpm exec vitest run tests/postgres.test.ts
```

The fixture matrix covers **3 brands × 7 archetypes × 4 layouts × 11 fixtures = 924 images** in the base skin, diffed against golden PNGs at a 0.2% max-pixel-difference threshold. The suite also deliberately mismatches a layout against the wrong golden to prove drift detection actually fires — a check that only ever passes is not a check. The Lab additionally exposes five skins and 22 accent sets; the guards select which combinations are valid.

After editing design, render, brand, fixture or font inputs, regenerate baselines **inside Linux** and review the artwork before trusting it:

```sh
docker compose build renderer
docker compose run --rm -v "${PWD}/fixtures:/app/fixtures" renderer pnpm golden --update
docker compose build
```

The passing manifest records a content fingerprint; the composer refuses to select a layout with missing, stale, or non-Linux certification. Fonts are local OFL-licensed assets — no runtime font downloads, ever. `pnpm fonts` and `node scripts/fetch-cjk-fonts.mjs` change those assets and require recertification.

## Data & architecture boundaries

Postgres stores normalized items, claims, evidence, decisions, compositions, review state, accounts, posts, sessions, quotas, logs and settings. Repository transactions serialize mutations to prevent lost updates and double reservations — correctness over throughput, appropriate at newsroom scale. Graphile jobs rediscover unfinished stages after a restart rather than losing them.

Artifacts live in `.data/renders`, `.data/archive`, `.data/receipts`, and (native only) `.data/profiles`. Back up the Postgres volume and these directories together. The dashboard has no remote authentication — keep it bound to localhost, or add authentication before exposing it. Nothing here requires real credentials or a live social account to explore.

## Project layout

```
packages/
  core       Claim types, the five gate rules, dedupe hashing — pure functions
  db         Schema + the transactional repository
  design     Tokens, archetypes, layouts, skins, guards, the template renderer
  render     Playwright page pool, font pinning, golden-image diffing
  sources    One adapter per source: openf1, jolpica, fia, vlr, tmdb, rss, reddit
  llm        Gemini router, token buckets, extraction/caption prompts
  publish    Platform adapters behind one interface — browser today, API later
  pipeline   Poll → extract → gate → compose → render → queue → publish
  brands     The brand registry apps/ reads from
apps/
  dashboard  Next.js — Lab, Contact sheet, Review, Ops
  workers    Graphile-worker runner (imports packages/pipeline; no logic of its own)
  bot        Discord review loop
  agent      The native Windows publisher — the only thing outside Docker
brands/
  f1  vct  film   Tokens, archetypes, entity colours, copy, source config per vertical
```

**The rule that keeps this honest:** if adding a fourth brand means touching anything under `apps/`, the layering has failed.

## Learn more

- [PLAN.md](PLAN.md) — the original implementation plan and the three non-negotiable principles
- [buildspec.raw.html](buildspec.raw.html) — visual build spec
- [newsroom.raw.html](newsroom.raw.html) — market research and strategy
- [MVP_STATUS.md](MVP_STATUS.md) — what's implemented, what's verified, and what still needs the owner's own accounts or a live event

<div align="center">
  <sub>Built for one operator, three verticals, and zero tolerance for a model inventing a fact.</sub>
</div>
