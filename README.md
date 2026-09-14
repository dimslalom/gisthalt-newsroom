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
  [Design studio](#design-studio) ·
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
- [Design studio](#design-studio)
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

### Prerequisites

- **Docker Desktop**, running, with Linux containers (the default on macOS/Windows). Nothing else needs installing locally — Node, pnpm and Playwright's browser all live inside the containers.
- **~15–20 GB free disk.** The Playwright/Chromium base image alone is several GB, and `docker compose build` produces one shared image reused by four services. If you ever see `no space left on device` mid-build, it's almost always Docker's own build cache, not this project's data — see [Troubleshooting](#troubleshooting) below.
- Ports **3939**, **8787** and **55432** free on the host (dashboard, renderer, Postgres).

### From a fresh clone

```sh
git clone <this repo's URL>
cd "Gisthalt Dashboard"          # or wherever you cloned it

# .env.example is safe defaults for local dry-run use — copy it once.
# (Skip this line if you're restarting an existing checkout with its own .env.)
cp .env.example .env

# Builds the one shared image (renderer/workers/dashboard all use it, just with
# different start commands) and brings up Postgres → migrate → renderer → the rest,
# in that order, via docker-compose's own health/completion checks.
docker compose up -d --build
```

First build takes several minutes (it's compiling the Playwright image layer and installing all workspace packages). Watch it finish and check everything came up healthy:

```sh
docker compose ps
```

You should see `postgres`, `renderer`, `workers` and `dashboard` all `Up` (`migrate` exits with status 0 — that's expected, it only runs once per `up`). If anything isn't healthy, `docker compose logs --tail 80 <service>` names the actual failure.

Seed some sample content so the dashboard isn't empty on first look:

```sh
docker compose exec workers pnpm demo
```

Open **http://localhost:3939**. The demo seeds 60 treatments of a recorded F1 result plus two labelled VCT/film review examples — it does not enable accounts or enqueue real posts. File-mode data (if you ever run outside Docker) stays in `.data/store.json`; Docker uses its own Postgres volume, so nothing in `.data/` needs to exist before the first `up`.

```sh
docker compose stop           # preserves the database and rendered artwork
docker compose up -d          # bring it back later — no --build needed unless source changed
```

| Service | Port | Notes |
|---|---|---|
| Dashboard | `3939` | Next.js, localhost-only, no auth |
| Renderer | `8787` | Playwright/Chromium, pinned fonts, Linux-only output |
| Postgres | `55432` | Source of truth for items, claims, decisions, posts |

Workers poll sources on persistent Graphile jobs; the default stack does **not** run a publishing agent, all seeded accounts start inactive at the manual-only warm-up stage, and Docker always runs in dry-run mode.

### Troubleshooting

- **`no space left on device` during a build.** This is Docker's own layer cache, which grows every time you rebuild after a source change and is never cleaned up automatically. Check with `docker system df`, then reclaim it with:
  ```sh
  docker builder prune -f
  ```
  This only removes unused build cache — it doesn't touch your Postgres volume, `.data/`, or anything in the repo.
- **A container is stuck or a rebuild seems to have no effect.** Docker sometimes keeps serving an old image layer. `docker compose build <service>` then `docker compose up -d <service>` forces a fresh build and recreate for just that one service.
- **Design or brand edits look uncertified / production won't pick up a layout.** That's not a bug — see [Design studio → Certification](#design-studio) below. Certification has to be re-run after any shared code or brand change, and the dashboard's own **Certify all designs** button does that without a terminal.

## Dashboard

| Screen | What it does |
|---|---|
| **Design** | The layout worklist — see [Design studio](#design-studio). Design and certify shared layouts, derive siblings, add custom layout slots, and edit a brand's palette/fonts. |
| **Template lab** | Pick a brand, archetype, fixture, layout, skin and accents. Render one preview or all valid combinations for an archetype. |
| **Contact sheet** | Inspect the latest 60 treatments and a nine-post profile-grid preview. Select 2–6 same-brand claims to build a cover/body/outro carousel. Each tile links to that post's own editor. |
| **Review** | Edit each platform's caption, reshuffle the design, approve, reject, or hold for a second corroborating source, or open the post in the design editor. Reviews expire after 90 minutes; approval requires an active account. |
| **Ops** | Pause publishing globally, configure account handles/warm-up/caps, pause individual sources, inspect source health and session state, cancel queued work, reconcile uncertain posts, and run a live-launch preflight. |

A removal request for an already-live post still needs manual platform deletion and owner confirmation — the dashboard never claims a deletion it can't verify.

### Manual event-week posting

Open **Contact sheet → Edit design & export** (or **Edit design** on a Review card).
The post editor loads the composition's actual claim, image and platform captions.
Edit layers and text, choose a canvas, then **Save** to re-render only that post;
shared brand templates stay unchanged. Download the saved artwork or the 1080×1920
TikTok frame and copy the platform caption to publish by hand. Caption changes
save when the field loses focus, with a visible success or failure message.

Expired reviews remain editable through Contact sheet, but editing or exporting
does not approve a review, queue a post, or mark it published. Live or unresolved
publications cannot be edited. Single-image compositions are supported; individual
carousel slide editing is not yet available. Downloads use the saved render, not
unsaved preview changes.

Review queue filters cover brand, status, content type, tier, source and headline
search. The default shows incoming pending/held reviews; choose **Expired** to
browse history. **Regenerate recent F1 reviews** prepares up to 12 eligible expired
F1 claims from the last 24 hours with fresh previews and a new review deadline.
It preserves the original source date and gate decision, skips rejected/dropped
or already queued content, and never publishes automatically.

## Design studio

`/design` is the entry point for everything about how a brand's posts look — separate
from [editing one post](#manual-event-week-posting), which starts from Review or
Contact sheet instead. A brand's actual look lives in three places, all plain,
git-diffable files under `brands/<key>/`, none of which need to exist before you
start editing — the studio creates them on first use:

| File | What it holds |
|---|---|
| `layouts.json` | Hand-designed documents (layer trees) for specific archetype/layout pairs. Absent = that pair still renders from the built-in CSS template. |
| `theme-override.json` | The brand's palette and font overrides — colours, custom/uploaded fonts, letter-spacing. Absent = the brand's coded defaults from `brands/<key>/tokens.ts` / `skins.ts`. |
| `layout-slots.json` | Custom layout slots an archetype offers beyond its built-in four, and any built-in slots removed. |
| `fonts/pinned.css` | Any Google Font or uploaded font file this brand uses, embedded as base64 — fetched or uploaded once, never re-fetched at render time. |

### The worklist

Opening **Design** shows brand tabs across the top, then every archetype with a row
per layout slot: a status dot (**No document** / **Uncertified** / **Certified** /
**Failing**), and per-row actions:

- **Design** — opens that exact layout in the editor (`/design/<brand>/<archetype>/<layout>`): a layers panel, a live-rendered canvas, and an inspector for every node's content, position, colour, font and background.
- **Derive…** — proposes a new layout by applying mechanical transforms (mirror left↔right, move the photo, reflow the body) to an existing layout's design, renders a live preview, and only saves it if you click **Use this design**. Nothing is ever auto-applied.
- **Remove slot** (and **+ Add slot** per archetype) — lets an archetype offer more or fewer layout choices than its built-in four, without a code change.

Every text or shape layer's colour and font can be a brand token (from the palette
below) **or** a literal hex colour / custom font family — pick per layer with the
Token/Custom toggle next to each field. A live contrast scanner flags any
foreground/background pairing that fails, naming the exact layer, without blocking
the preview; only certification turns a failing pairing into a hard stop.

### Certification

A layout only gets picked by real production posts once it's **certified** —
rendered through the full fixture set and pixel-diffed against a committed
baseline. Editing a layout, a brand's palette/fonts, or any shared render code
de-certifies whatever it touches (a brand-wide font change de-certifies that whole
brand; editing one layout's document only de-certifies that one layout).

**Certify all designs** (top of the worklist) and **Certify this layout** (inside
the per-layout editor, scoped to just that one) run the same certification a
terminal `pnpm golden --update` would, from a full-screen progress overlay — you
can't navigate away mid-run, since a half-certified brand is not a state anyone
should be editing through. A single layout takes a few seconds; the full matrix
takes a few minutes.

### Brand palette & fonts

**Edit brand palette & fonts** (top of the per-layout editor) opens per-skin colour
swatches and per-font-role controls (Display/headlines, Body text, Numerics/mono):

- **Colours** — hex input per role (Background, Panel, Foreground, Muted, Hairlines, Accent), saved as soon as you change it. A reset icon (↺) appears next to anything overridden, to snap it back to the brand's coded default.
- **Google Fonts** — type a family name and **Fetch & use**; the real font (Latin, weights 400–700) is downloaded once and pinned into the brand, never fetched again at render time.
- **Upload font** — pin your own font file (`.ttf`/`.otf`/`.woff`/`.woff2`) the same way, for a typeface you own that isn't on Google Fonts. Weight is guessed from the filename (e.g. "Bold") and editable before confirming.
- **Tracking (letter-spacing)** — a percentage field for Display/headlines and for Labels/eyebrow text.

Mixing a single-weight custom font across every role is the one thing to avoid: text that needs a weight the font doesn't have gets browser-synthesized, and that synthesis isn't always pixel-stable between renders. Use a custom font for the role its uploaded weight actually covers (usually Display), and leave Body/Mono on the brand default or a fully-weighted Google Font.

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

The fixture matrix covers **3 brands × 7 archetypes × 4 layouts × 11 fixtures = 924 images** in the base skin, diffed against golden PNGs at a 0.2% max-pixel-difference threshold. The suite also deliberately mismatches a layout against the wrong golden to prove drift detection actually fires — a check that only ever passes is not a check. The Lab additionally exposes five skins and 16 accent sets; the guards select which combinations are valid.

After editing design, render, brand, fixture or font inputs, regenerate baselines **inside Linux** and review the artwork before trusting it. From a terminal:

```sh
docker compose build renderer
docker compose run --rm -v "${PWD}/fixtures:/app/fixtures" renderer pnpm golden --update
docker compose build
```

Or from the dashboard: **Design → Certify all designs** (or **Certify this layout**, scoped to one layout, inside its editor) — see [Design studio → Certification](#design-studio). Both paths run the identical script.

The passing manifest records a content fingerprint; the composer refuses to select a layout with missing, stale, or non-Linux certification. The brand's base typefaces are local OFL-licensed assets pinned at build time — no runtime download for them, ever. A brand-specific font picked in the Design studio's palette editor (Google Fonts or your own upload) is the one exception, and it's still only ever fetched **once**, when you pick it, into `brands/<key>/fonts/pinned.css` — never re-fetched at render time. `pnpm fonts` and `node scripts/fetch-cjk-fonts.mjs` change the built-in font assets and require recertification, same as any other shared-code change.

## Data & architecture boundaries

Postgres stores normalized items, claims, evidence, decisions, compositions, review state, accounts, posts, sessions, quotas, logs and settings. Repository transactions serialize mutations to prevent lost updates and double reservations — correctness over throughput, appropriate at newsroom scale. Graphile jobs rediscover unfinished stages after a restart rather than losing them.

Artifacts live in `.data/renders`, `.data/archive`, `.data/receipts`, and (native only) `.data/profiles`. Back up the Postgres volume and these directories together. Brand design work (hand-designed layouts, custom layout slots, palette/font overrides, and any pinned fonts) lives in `brands/<key>/` — `layouts.json`, `layout-slots.json`, `theme-override.json` and `fonts/pinned.css` — which is why it's committed to the repo like any other brand config, not treated as disposable render output. The dashboard has no remote authentication — keep it bound to localhost, or add authentication before exposing it. Nothing here requires real credentials or a live social account to explore.

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
