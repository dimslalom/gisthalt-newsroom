# Three-Feed Newsroom: Implementation Plan

**For:** Claude Code, working in a fresh repo.
**Owner:** Dimas (Australia/Brisbane, publishing in Bahasa Indonesia)
**Date:** 12 September 2026
**Companion docs:** `newsroom.raw.html` (market research + strategy), `buildspec.raw.html` (visual build spec)

---

## 0. Read this first

We are building an automated social media newsroom that runs three Indonesian-language
accounts covering **Formula 1**, the **Valorant Champions Tour**, and **Film & TV**.

The system ingests news, decides deterministically whether it is verified, renders a
designed graphic from a template system, and publishes to X, Instagram, Threads and
TikTok via browser automation on the owner's home Windows PC. Anything not
automatically verifiable goes to a Discord review queue where the owner approves with
one tap.

**Three principles that everything else follows from. Do not violate these.**

1. **Facts come from machines. Words come from the model.**
   A language model is never the source of a fact. Structured data (race classifications,
   match scores, TMDB dates) flows into typed fields and fills templates with zero model
   calls. Gemini classifies, extracts claims with a mandatory supporting quote, and writes
   caption copy from fields that are already confirmed. Nothing else.

2. **`apps/` contains no business logic.**
   If adding the second or third brand requires editing anything under `apps/`, the
   layering has failed. Brands are configuration: tokens, archetypes, entity tables,
   source adapters.

3. **The publisher is a swappable layer.**
   Browser automation today, official APIs when an account earns. One interface,
   two implementations. Nothing upstream of the publisher knows or cares which is in use.

---

## 1. Locked decisions

| Question | Decision | Consequence |
|---|---|---|
| Publishing | Browser automation on X, Instagram, Threads, TikTok | No API cost, no Meta app review, higher suspension risk |
| Host | Windows PC with Docker Desktop, near-24/7 | Runtime splits: Linux containers + one native Windows agent |
| Language | TypeScript end to end, pnpm monorepo | Playwright, templates and pipeline share one language |
| Dashboard | Yes, first-class deliverable | Template lab with edge-case fixtures is the headline feature |
| Accounts | None exist yet | Warm-up clock is the longest pole; start it in week 1 |
| Volume | Consistency over peaks, ramped from zero | 5-7/day floor, 12-16/day on event days, after a 6-week ramp |
| First vertical | F1 | Best free data, least Indonesian-language competition |
| Design tokens | Placeholders first, real identity in phase 6 | Decouples pipeline work from brand design |

**Why F1 first:** OpenF1 and Jolpica give free, open, machine-readable timing and
classification data. Almost nobody covers F1 in Indonesian at speed. The event calendar
produces dense, unambiguous, structured facts on a predictable schedule.

**Why browser automation is risky and how we mitigate it:** automated posting is against
the terms of all four platforms, and a brand-new account that starts posting on a
schedule is the easiest possible pattern to detect. Mitigations are built into the
system, not left to discipline: one browser profile per account never shared, always the
owner's home IP, jittered intervals enforced in code, quiet hours, a daily cap, no
bulk-follow or DM automation ever, and a complete local archive of every published post
so a suspended account is a rebuild rather than a loss.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 22 LTS, TypeScript 5.x, ESM | |
| Monorepo | pnpm workspaces | No Turborepo needed at this size |
| Database | PostgreSQL 16 | Single source of truth |
| ORM | Drizzle | Schema is code, migrations are checked in |
| Queue | graphile-worker | Postgres-backed. Do not add Redis until proven necessary |
| Rendering | Playwright (Chromium) | In a Linux container with pinned fonts |
| Dashboard | Next.js 15, App Router | localhost only, no auth needed |
| Publishing | Playwright driving real Chrome | Native Windows process, outside Docker |
| LLM | `@google/genai` against Gemini | Free tier, model router with token buckets |
| Bot | discord.js v14 | Buttons and modals |
| Images | sharp | Only for image analysis in the guards, not for composition |
| Testing | vitest, pixelmatch | Unit tests for guards and gate, golden images for layouts |
| Logging | pino | Structured JSON, one line per pipeline stage transition |

---

## 3. Repository layout

```
newsroom/
  package.json                 # pnpm workspace root
  pnpm-workspace.yaml
  docker-compose.yml
  .env.example
  packages/
    db/                        # Drizzle schema + migrations. The one definition of data shape.
    core/                      # Claim types, the five gate rules, dedupe hashing. Pure functions.
    sources/                   # One adapter per source: openf1, jolpica, fia, tmdb, vlr, rss, reddit
    design/                    # L1-L5 design system, entity colour table, the four guards, fixtures
    render/                    # Playwright page pool, font pinning, PNG output, golden-image diffing
    publish/                   # Platform adapters behind one interface
      browser/                 #   x.ts, instagram.ts, threads.ts, tiktok.ts
      api/                     #   empty until the upgrade
    llm/                       # Gemini router, token buckets, prompt templates, response cache
  apps/
    dashboard/                 # Next.js. Template lab, contact sheet, review queue, ops.
    workers/                   # graphile-worker task definitions. Runs in Docker.
    agent/                     # The native Windows publisher. The only thing outside Docker.
  fixtures/                    # Committed JSON fixtures and their golden PNGs
  brands/
    f1/                        # tokens.ts, archetypes/, copy.id.ts, entities.ts
    vct/                       # phase 6
    film/                      # phase 6
```

---

## 4. Data model

Drizzle schema in `packages/db/src/schema.ts`. Core tables:

```ts
// A raw thing we fetched from a source. Never mutated after insert.
items          { id, sourceId, externalId, fetchedAt, payload jsonb, contentHash,
                 vertical, rawUrl }

// A structured, typed assertion extracted from an item.
claims         { id, itemId, vertical, claimType, entities jsonb, values jsonb,
                 supportingQuote text, extractedBy, dedupeHash, createdAt }

// What the gate decided and why. Append-only audit trail.
decisions      { id, claimId, rule, outcome ('auto'|'review'|'drop'), reason,
                 corroboratingItemIds jsonb, decidedAt }

// A chosen visual + copy treatment for a claim.
compositions   { id, claimId, accountId, archetype, layout, skin, accents jsonb,
                 captionByPlatform jsonb, imagePaths jsonb, renderedAt }

// One published (or failed) post per platform.
posts          { id, compositionId, accountId, platform, status, platformPostId,
                 publishedAt, latencyMs, error, archivePath }

accounts       { id, brand, handle, platform, profileDir, warmupStage,
                 dailyCap, active }

sessions       { id, accountId, lastOkAt, lastCheckAt, healthy, lastScreenshotPath }

modelUsage     { id, model, day, requestCount, tokenCount }   // token bucket persistence

sources        { id, key, vertical, tier ('A'|'B'|'C'), cadenceSeconds,
                 lastSuccessAt, lastErrorAt, active }
```

**Indexes that matter:** `claims.dedupeHash` unique, `items.contentHash`,
`posts(accountId, publishedAt)` for the daily cap check, `decisions.claimId`.

---

## 5. Core contracts

Define these in `packages/core/src/contracts.ts` before writing any implementation.
Everything else is written against them.

```ts
export type Vertical = 'f1' | 'vct' | 'film';
export type Tier = 'A' | 'B' | 'C';

export interface SourceAdapter {
  key: string;
  vertical: Vertical;
  tier: Tier;
  /** Cadence in seconds. May differ inside a live window. */
  cadence(now: Date): number;
  /** Fetch and return raw items. Must be idempotent and side-effect free. */
  poll(ctx: PollContext): Promise<RawItem[]>;
}

export interface Claim {
  vertical: Vertical;
  claimType: string;              // 'session_result' | 'penalty' | 'roster_move' | ...
  entities: Record<string, string>;  // { driver: 'ANT', team: 'Mercedes', gp: 'Spanyol' }
  values: Record<string, unknown>;   // { position: 1, duration: 93.662, laps: 24 }
  /** REQUIRED for every prose-extracted numeric value. Empty for tier A. */
  supportingQuote: string | null;
  sourceTier: Tier;
  sourceDomain: string;
  observedAt: Date;
}

export type GateOutcome =
  | { outcome: 'auto';   rule: 'R1' | 'R2' | 'R3'; reason: string }
  | { outcome: 'review'; rule: 'R4';               reason: string }
  | { outcome: 'drop';   rule: 'R0';               reason: string };

/** Pure. No IO. Fully unit-testable. This is the heart of the system. */
export function evaluateGate(claim: Claim, ctx: GateContext): GateOutcome;

export interface PublishAdapter {
  platform: 'x' | 'instagram' | 'threads' | 'tiktok';
  publish(req: PublishRequest): Promise<PublishResult>;
  checkSession(accountId: string): Promise<SessionHealth>;
}

export interface PublishRequest {
  accountId: string;
  caption: string;
  imagePaths: string[];   // 1 for a single post, 2-10 for a carousel
  idempotencyKey: string; // compositionId + platform. Never double-post.
}
```

---

## 6. The verification gate

Five rules, evaluated **in this order**. First match wins. No model involvement.
Implement as a pure function; test it against recorded real-world fixtures.

| Rule | Condition | Outcome |
|---|---|---|
| **R0** | Hard block list: contested result, on-track injury, death, legal matter, anything involving a minor | `drop` |
| **R1** | Claim came from a tier A endpoint and every required field for its `claimType` is populated | `auto` |
| **R2** | Source domain is on the tier B allowlist AND `supportingQuote` covers every numeric value in `values` | `auto` |
| **R3** | Two or more independent tier B domains assert the same `dedupeHash` within 45 minutes | `auto` |
| **R4** | Everything else, including all tier C items and anything tagged report/rumour/exclusive/"understood to" | `review` |

**Implementation notes**

- R0's block list lives in config (`brands/<x>/blocklist.ts`), not in code. You will
  edit it after the first incident and it should be a one-line change.
- **Dedupe runs before extraction**, not after. One race result arriving from four
  sources must cost at most one Gemini call.
- `dedupeHash = sha256(vertical + claimType + normalisedEntities + normalisedValues)`.
- Review items **expire after 90 minutes** and auto-reject with a note. An unapproved
  breaking item is worthless after that, and a stale queue looks busy without being busy.

### Source tiers

**Tier A (structured truth, auto-publishable):**
- F1: OpenF1 (`api.openf1.org/v1`) for sessions, `session_result`, drivers, laps.
  Jolpica-F1 for classifications and championship standings. FIA decision documents.
- VCT: Riot esports service endpoints, plus a **self-hosted** VLR.gg parser.
- Film & TV: TMDB for dates, cast, trailers, poster art. Studio YouTube channel RSS.

**Tier B (allowlisted prose, mostly free via RSS):**
- F1: formula1.com, fia.com, team press rooms, Autosport, Motorsport.com, RaceFans
- VCT: valorantesports.com, Riot newsroom, org announcements, Sheep Esports, Dot Esports
- Film & TV: Deadline, Variety, The Hollywood Reporter, studio press sites

**Tier C (signals only, never publishable alone):**
- r/formula1, r/VALORANTCompetitive, r/movies, r/television sorted by new and rising.
- Reddit's free API allows roughly 100 queries per minute with OAuth, far more than
  four subreddits need.
- A tier C item can only become a post by **promoting the primary source it links to**,
  which is then evaluated on its own merits.

---

## 7. The design system

Not a generative designer. A **constrained combinatorial** system: a small set of
hand-designed parts recombined under rules, with the brand-defining layer held still.

| Layer | Varies | Contents |
|---|---|---|
| **L1 Tokens** | Never | Type scale, grid unit, radius, stroke weights, shadow/glow recipes, safe margins, logo lockup placement |
| **L2 Archetypes** | By data | 7 per brand. Selected by `claimType`, not by taste |
| **L3 Layouts** | Stochastic | 4 per archetype: hero-left / hero-right, full-bleed / framed, split / stacked, big-number-led / portrait-led |
| **L4 Skins** | Stochastic | 5 moods (dark, light, team-coloured, tournament-coloured, archival) plus **entity colour injection** |
| **L5 Accents** | Stochastic | 0-2 of 6: diagonal cut, halftone field, film grain, ticker strip, oversized watermark, crop marks |

**Combinatorics:** 28 layouts x 5 skins x 22 valid accent sets = **3,080 distinct
compositions per brand**, from 28 files you actually design.

**F1 archetypes (L2):** `session_result`, `classification`, `standings`, `penalty`,
`driver_line`, `schedule`, `quote`.

### Entity colour injection

The single cheapest source of variety. Colours live in a **data table**, not in CSS.
One row per team, constructor, org or studio, each with a contrast-checked text pairing
stored alongside the hex so light-on-Mercedes-cyan never happens.

OpenF1 returns `team_colour` per driver, so the F1 table can be seeded from the API
rather than hand-maintained. Verified working: Mercedes `#00D7B6`, Ferrari `#ED1131`,
Red Bull `#4781D7`, McLaren `#F47600`, Racing Bulls `#6C98FF`.

### Anti-repetition: a shuffle bag, not a random number

Random selection produces visible clumps. Instead:

```
score(candidate) =
    -8 if layout used in the last 4 posts for this account
    -4 if skin used in the last 3
    -1 if accent set repeats the previous post
    + small random jitter to break ties
pick argmax
```

Track the last 12 compositions per account in `compositions`. The specific failure this
prevents is nine good posts that look identical when stacked on a profile grid.

### Carousels are a sequence grammar, not a template type

Do **not** build carousel templates. Build an ordering rule: cover, then 2-6 body slides
drawn from the existing single-post archetypes at a fixed slide skin, then an outro.
A race recap is cover + one classification slide + one standings slide. Instagram
accepts 2-10 items and crops every slide to slide one's aspect ratio, so lock the whole
set to **4:5 (1080x1350)** at the grammar level.

---

## 8. The four guards

Pure functions in `packages/design/src/guards/`. Unit-tested independently of any
layout. These turn "handle the edge case" from a per-layout chore into a property of
the system.

```ts
/** Binary-search font size between floor and ceiling using the browser's own
 *  measurement, then clamp line count, then ellipsise.
 *  Below the floor: return { overflow: true } and the composer picks a
 *  longer-headline layout variant instead. */
fitText(text, box, { minPx, maxPx, maxLines }): FitResult

/** Sample mean luminance and standard deviation of the image region under the
 *  text via sharp. Returns a scrim opacity and a text colour.
 *  If variance is too high for any scrim: return { overImage: false } and the
 *  layout moves text to a solid panel. */
pickTextTreatment(imagePath, region): TextTreatment

/** Score edge density in each of the four corners; lowest wins; fixed tie-break
 *  order so placement stays consistent across a series rather than jumping around.
 *  All corners busy: return 'strip' and the logo goes in a solid bar. */
pickLogoCorner(imagePath): Corner | 'strip'

/** WCAG ratio check on every text-on-background pair the layout actually
 *  resolved, AFTER skin and entity colour injection.
 *  FAILS THE RENDER. An unreadable post is worse than a missed post, so it
 *  goes to review rather than out. */
assertContrast(resolvedLayout): void   // throws ContrastError
```

---

## 9. Fixture library

Ten committed JSON fixtures in `fixtures/`. **Every layout renders against every
fixture in CI**, compared to a golden PNG with pixelmatch. A layout that has not passed
the full fixture set **cannot be selected by the composer**, enforced in code.

| Fixture | What it tests |
|---|---|
| `title-overflow` | 4x expected headline length. Longest real names: constructor legal names, Korean/Japanese VCT org names, film titles with subtitles |
| `title-underflow` | A one-word headline. Under-fill breaks composition as badly as overflow and nobody tests it. A giant empty middle is a bug |
| `image-missing` | No image, a 404, and a 120px thumbnail. Each falls back to a typography-only variant, never a grey box |
| `image-lowcontrast` | White sky where white text goes, dark frame where dark text goes |
| `image-busy` | High-detail photo with no quiet corner. Forces `pickLogoCorner` into its strip fallback |
| `image-wrongratio` | Ultra-wide and ultra-tall sources. Smart crop keeps the subject, result is still 4:5 |
| `data-missing` | DNS, DNF, no gap, no lap count, release date "TBA". Missing values render as a dash, never blank or `undefined` |
| `data-extremes` | 4-row and 22-row classifications. Gaps from `+0.002` to `+1 LAP`, which have wildly different widths in a tabular column |
| `colour-clash` | Near-white entity colour on the light skin, near-black on the dark skin. The contrast pairing must swap the text colour |
| `diacritics` | Hulkenberg, Perez, Nurburgring, plus Hangul and Kana org names. Catches missing glyphs that silently fall back to another typeface |

**Golden images catch visual drift. The guards catch data the golden images never
contained. You need both.**

---

## 10. Renderer

`packages/render`. Runs **in the Linux container**, never on Windows directly.

- Playwright Chromium, a warm page pool (3 pages) so there is no cold start on a
  breaking item.
- **Fonts are pinned inside the container.** Download the woff2 files at build time and
  embed them as base64 `@font-face` data URIs in the template CSS, or install them into
  the image and `fc-cache`. Do not rely on `fonts.googleapis.com` at render time:
  a network blip must not change your typography.
- Output: PNG at 1080x1350, `deviceScaleFactor: 1`.
- Determinism is a requirement, not a nice-to-have. Same input must always produce the
  same bytes so a golden-image diff means something.

**The font trap, stated plainly:** Windows and Linux rasterise type differently. A
layout that fits when previewed in Windows Chrome can overflow when rendered in the
container. **The dashboard must preview by calling the container's renderer**, never by
displaying the template HTML locally.

Working spike is in the appendix. It renders real OpenF1 data at 1080x1350 with
embedded fonts and has been verified end to end.

---

## 11. Publisher agent

`apps/agent`. The **only** component outside Docker. A native Windows Node process.

- Launched by Task Scheduler at boot. Requires an auto-login desktop session, because
  headed Chrome needs one.
- Playwright driving **real Chrome**, not bundled Chromium, for a genuine consumer
  fingerprint.
- One `userDataDir` per account per platform. Twelve profiles at full build. Never shared.
- **Headed and visible**, so the owner can take over when a login challenge appears.
- Polls Postgres for jobs with status `ready`. Claims a job by row-level update so a
  restart never double-posts.
- Idempotency key = `compositionId + platform`. Check before posting, record after.

### Pacing, enforced in code not in cron

```
jitter:       every interval gets a random 0-9 minute offset. Never an exact cadence.
quiet hours:  no posts 01:00-06:00 local unless a real event is running.
              A 3am post with no event behind it is a pure bot signal.
daily cap:    per account, read from accounts.dailyCap. Hard stop.
kill switch:  a single global flag that halts all publishing immediately.
```

### Session health

Hourly check per profile: navigate to the platform home, assert a logged-in selector,
screenshot on failure, write to `sessions`, alert `#alerts` with the screenshot.
Sessions dying silently is the single most likely failure mode of this path.

### Post archive

Every published image, caption, source link and platform post ID stored locally.
A suspended account then becomes a one-day rebuild rather than a total loss.

### Adapter build order

`x` first (simplest composer, most forgiving), then `threads`, then `instagram`
(hardest browser target, budget real time for the upload flow), then `tiktok`.

---

## 12. Gemini router

`packages/llm`. Free-tier limits are **per project**, not per key, so a "key manager"
is the wrong mental model. Build a **model router with a persisted token bucket per
model** and a fallback ladder.

| Model | RPM | RPD | Job | On exhaustion |
|---|---|---|---|---|
| Flash-Lite | 30 | 1,500 | Classification, dedupe adjudication, claim extraction | Fall to Flash |
| Flash | 15 | 1,500 | Indonesian caption copy, carousel slide copy, headline compression | Fall to template-only copy |
| Pro | 5 | 50 | Reserved: ambiguous claims heading to review. ~30 calls/day max | Send to review unsummarised |

- Persist counts in `modelUsage` so a restart does not reset the daily count.
- **Read live limits from config, never hardcode them.** These numbers have moved
  at least once in the last twelve months.
- **Cache caption copy by claim hash.** A retry or a design reshuffle then costs nothing.
- **Send extracted fields, never whole articles.** Keeps you far from the
  tokens-per-minute ceiling and makes prompts cheap and auditable.
- Structured tier A posts call **no model at all**, which is most of your volume during
  race weekends and VCT stage weeks.

### The extraction prompt contract

The extractor must return, for every numeric value in `values`, the **exact sentence
from the source that supports it**. If it cannot, the claim goes to review. This is not
a soft instruction: validate it in code after the response returns, and downgrade the
outcome if the quote does not literally contain the value.

---

## 13. Discord review loop

One private server: `#review-f1` (one per account), `#published`, `#alerts`, and a
firehose channel used during phase 2.

Every message is **one embed with the rendered image attached**, so design and copy are
judged in the same glance on a phone.

**Approving must be one tap.** Every extra interaction is latency on breaking news, and
latency is the product. Editing and reshuffling exist for the cases where one tap is
not enough, not as the normal path.

Buttons: `Publish` (primary) / `Edit caption` (modal) / `Reshuffle design` /
`Hold for second source` / `Reject`.

**`Hold for second source`** is the button that earns its place: it parks the item and
publishes the instant rule R3 is satisfied by a second outlet. That is exactly the
judgement a human is good at and a rule engine is not.

**Add `/retract` on day one**, before you need it.

The embed shows: rule that fired, source tier and domain, the extracted claim, the
supporting quote (or "support found for 0 of 2 numbers"), and the expiry countdown.

---

## 14. Dashboard

`apps/dashboard`, Next.js, localhost only, no auth.

| Screen | Contents |
|---|---|
| **Template lab** | Four dropdowns: fixture, archetype, layout, skin. Accents as toggles. Renders through the **container renderer** and shows the real PNG at true size and feed size. A "render all variants" button produces the full matrix for one fixture. This is where design happens |
| **Contact sheet** | 60 posts from real historical data in a grid, **plus a simulated profile grid** showing the last nine as Instagram arranges them. Coherence is a property of a set, not of one image |
| **Review queue** | Same items as Discord with a wider editing surface: per-platform caption character counts, variant reshuffle, source links, extracted claim and quote |
| **Ops** | Source health with last-success timestamps, queue depth, publish log with per-platform latency, session health for all profiles, today's post count per account against target |

---

## 15. Phases and acceptance criteria

### Phase 0: prove the data path (this weekend)

- [x] Confirm OpenF1 returns live 2026 data. Meeting 1294 (Madring, Madrid) verified.
- [x] Render a real post from real results. FP2 classification, four layout variants
      plus an edge-case board, 1080x1350.
- [ ] **Time the live path.** Poll `session_result` for qualifying (session_key 11365)
      and the race (11369) and record how many seconds after the session ends the data
      appears. This number sets the entire latency budget.
- [ ] Spike Jolpica and the FIA document feed for standings and penalties, which OpenF1
      does not carry.

**Exit:** you know exactly how fast F1 results become available, which tells you whether
"under sixty seconds" is a promise you can make.

### Phase 1: foundations and accounts (week 1)

Two parallel tracks. Engineering and brand do not block each other.

- [ ] Scaffold the monorepo, `docker-compose.yml` with Postgres and graphile-worker,
      Drizzle schema and first migration.
- [ ] Windows uptime chores (see section 16).
- [ ] Name the F1 brand, check handle availability on X, Instagram, Threads and TikTok
      **simultaneously**. Take all four even if you launch on one.
- [ ] Create the account and start using it like a person. **This starts the two-week
      warm-up clock, so it must happen in week 1 regardless of code progress.**
- [ ] Private Discord server with the four channels.

**Exit:** the warm-up clock is running and `docker compose up` brings up a healthy
empty system.

### Phase 2: ingest, gate, firehose (weeks 1-2)

- [ ] Source adapters: openf1, jolpica, fia, RSS for the tier B allowlist, Reddit for r/formula1.
- [ ] Dedupe before extraction.
- [ ] Gemini router with persisted token buckets and the fallback ladder.
- [ ] The five gate rules as pure functions, unit-tested against recorded real items.
- [ ] Firehose to Discord, each item labelled with the rule that fired and why.

**Exit:** you have watched a full race weekend through the firehose and you agree with
the gate on nearly every call.

### Phase 3: design system and template lab (weeks 2-3)

- [ ] Port the placeholder tokens from the spike into `brands/f1/tokens.ts` as L1.
- [ ] Seven archetypes, four layouts each.
- [ ] **The four guards with their own unit tests, before any layout depends on them.**
- [ ] Ten fixtures as committed JSON, golden PNGs, pixelmatch CI check.
- [ ] Template lab and contact sheet in the dashboard, rendering through the container.
- [ ] Shuffle-bag selection with the last 12 compositions tracked per account.

**Exit:** every layout passes every fixture, and 60 renders read as one brand with no
two adjacent tiles alike.

### Phase 4: publisher agent (week 3)

- [ ] Native Windows agent, one persistent Chrome profile per account per platform,
      manual first login for each.
- [ ] X adapter first.
- [ ] Session health monitor with screenshot-on-failure alerts.
- [ ] Pacing enforcement in code: jitter, quiet hours, daily cap, global kill switch.
- [ ] Post archive.

**Exit:** a real F1 session result posts to X automatically and you can prove it took
under sixty seconds.

### Phase 5: review loop and remaining platforms (weeks 4-5)

- [ ] Discord review card with one-tap publish, edit modal, reshuffle,
      hold-for-second-source, reject, and `/retract`.
- [ ] Indonesian caption copy via Flash, cached by claim hash, per-platform length variants.
- [ ] Enable gate rules R2 and R3 once the quote requirement has proven itself.
- [ ] Instagram and Threads adapters.
- [ ] Carousel sequence grammar plus the simulated profile grid.

**Exit:** you approve a breaking item from your phone in under fifteen seconds, and one
item fans out to three platforms.

### Phase 6: real identity, then clone (weeks 6-8)

- [ ] Replace placeholder tokens with the real F1 brand identity. By now you have seen
      hundreds of renders and will design a far better system than you could have in week 1.
- [ ] TikTok adapter and that account's own warm-up.
- [ ] VCT brand as configuration. **No changes under `apps/`.**
- [ ] Film & TV brand, same way.

**Exit:** brand three ships without touching service code. If it cannot, fix the
layering now rather than at brand four.

---

## 16. Environment and setup

### Windows uptime chores

- Disable sleep and hibernate, including on the display power plan.
- Docker Desktop set to start at login. Cap WSL2 memory in `%UserProfile%\.wslconfig`.
- Windows Update active hours set wide, auto-restart deferred.
- Auto-login enabled, so a reboot returns to a desktop session for headed Chrome.
- Watchdog that pings `#alerts` if any container or the agent is down for two minutes.

### `.env.example`

```
DATABASE_URL=postgres://newsroom:newsroom@localhost:5432/newsroom
GEMINI_API_KEY=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
TMDB_API_KEY=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
RENDER_OUT_DIR=/data/renders          # shared volume, readable by the Windows agent
AGENT_PROFILE_ROOT=C:\newsroom\profiles
PUBLISH_KILL_SWITCH=false
```

### Volume targets after warm-up

| Stage | Posts/day | Notes |
|---|---|---|
| Weeks 1-2 | 0 automated | Manual use only. Building a usage history |
| Week 3 | 2-3 | Only during plausible waking hours |
| Week 4 | 4-6 | Still mixing in manual posts and engagement |
| Weeks 5-6 | 6-9 | Live event coverage on, which clusters naturally |
| Steady, quiet day | 5-7 | The floor. Consistency lives here |
| Steady, event day | 12-16 | Clustering is fine because the events are real |

Roughly 250 posts/month per account at steady state.

---

## 17. Conventions for Claude Code

**Do**
- Write the contracts in section 5 first, then implement against them.
- Unit-test the gate and the guards before anything depends on them. These are pure
  functions and there is no excuse for them being untested.
- Keep every pipeline stage a separate worker task. A failure must be attributable to
  a stage, and a retry must never re-run work already paid for.
- Log one structured line per stage transition with the claim's dedupeHash, so a post
  can be traced end to end.
- Commit fixtures and golden PNGs. They are source, not build output.

**Do not**
- Do not let a model decide whether something is true.
- Do not add Redis, Turborepo, or a message broker before proving the need.
- Do not put business logic in `apps/`.
- Do not preview templates outside the container renderer.
- Do not fetch fonts at render time.
- Do not build carousel-specific templates.
- Do not push to GitHub without being asked.

**Commit style:** conventional commits, scoped by package.
`feat(design): add session_result archetype with four layouts`

---

## 18. Known gotchas

1. **Font rasterisation differs Windows vs Linux.** Covered above. This will bite you
   at least once.
2. **Instagram crops carousels to slide one's aspect ratio.** Lock the whole set to 4:5
   at the grammar level, not per slide.
3. **VLR.gg parsing is a scraper and will break.** Self-host it, pin the parser, make a
   parse failure page you in `#alerts` rather than silently produce empty posts.
4. **OpenF1 `session_result` returns `{"detail":"No results found."}` before a session
   completes**, not an empty array. Handle the shape, not just the emptiness.
5. **`gap_to_leader` is `0` for P1**, not null. Render a dash, not "+0.000".
6. **Lap times arrive as float seconds** (`93.662`), not formatted strings. Format to
   `1:33.662` in one place.
7. **The PC is "almost always on", which is not "always on".** Queue durably in Postgres
   so a reboot resumes rather than loses.
8. **X posts containing a URL cost 13x** on the API path ($0.20 vs $0.015). Design
   captions to carry no URLs from day one so the future API switch is free.
9. **New account + schedule = detection.** The warm-up is not optional.

---

## Appendix A: verified API facts (September 2026)

| Fact | Value | Source |
|---|---|---|
| X API free tier | **Removed 6 Feb 2026.** Pay-per-use credits | docs.x.com |
| X post cost | $0.015 plain, **$0.20 with a URL** | docs.x.com pricing |
| Instagram Graph API | Free, 100 posts/24h, carousel counts as 1, 2-10 items, JPEG, 4:5 to 1.91:1, 2,200 char caption. App review 2-4 weeks | Meta docs |
| Threads API | Free, 250 posts/24h | Meta docs |
| TikTok Content Posting API | Free. **Unaudited apps are private-only.** Photos by URL pull only. ~15 posts/day/creator | developers.tiktok.com |
| YouTube community posts | **No API exists** | n/a |
| Reddit Data API | ~100 QPM with OAuth, ~10 QPM without | Reddit terms |
| Gemini free tier | Flash-Lite 30 RPM / 1,500 RPD; Flash 15 / 1,500; Pro 5 / 50 | ai.google.dev |
| OpenF1 | Free and open. Live timing, session_result, drivers with `team_colour` | openf1.org |
| Jolpica-F1 | Free, open source, Ergast successor | github.com/jolpica/jolpica-f1 |

**Indonesia market (DataReportal Digital 2026):** 286M population, 230M internet users
(80.5%), 180M social identities, median age 30.4. Platform reach: TikTok 180M (18+),
YouTube 151M, Facebook 121M, **Instagram 108M, X 22.9M**.

Instagram is the audience prize. X stays because Indonesian X is unusually dense for
fandom conversation and it is the most forgiving automation target.

---

## Appendix B: working spike

Verified end to end on 12 September 2026 against the Madrid GP.

### Fetch and normalise

```bash
curl -s "https://api.openf1.org/v1/sessions?meeting_key=1294"
curl -s "https://api.openf1.org/v1/session_result?session_key=11363" -o fp2.json
curl -s "https://api.openf1.org/v1/drivers?session_key=11363" -o drv.json
```

```python
import json
r = json.load(open('fp2.json'))
d = {x['driver_number']: x for x in json.load(open('drv.json'))}
rows = []
for x in sorted(r, key=lambda y: (y.get('position') or 99)):
    dd = d.get(x['driver_number'], {})
    rows.append({
        'pos': x.get('position'), 'num': x['driver_number'],
        'abbr': dd.get('name_acronym'), 'last': dd.get('last_name'),
        'first': dd.get('first_name'), 'team': dd.get('team_name'),
        'colour': '#' + (dd.get('team_colour') or '999999'),
        'dur': x.get('duration'), 'gap': x.get('gap_to_leader'),
        'laps': x.get('number_of_laps'),
    })
```

Sample output (real):
```
1 ANT Kimi Antonelli   Mercedes      #00D7B6  93.662  0      24
2 LEC Charles Leclerc  Ferrari       #ED1131  93.775  0.113  26
3 HAM Lewis Hamilton   Ferrari       #ED1131  93.811  0.149  23
4 LIN Arvid Lindblad   Racing Bulls  #6C98FF  93.890  0.228  15
```

### Pin fonts as base64 data URIs

```python
import urllib.request, re, base64
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
want = [("Saira Condensed", [400,600,700]), ("IBM Plex Sans", [400,500,600]),
        ("IBM Plex Mono", [400,500])]
faces = []
for fam, wts in want:
    for w in wts:
        url = f"https://fonts.googleapis.com/css2?family={fam.replace(' ','+')}:wght@{w}&display=swap"
        css = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA})).read().decode()
        blocks = re.findall(r"@font-face\s*\{(.*?)\}", css, re.S)
        pick = next((b for b in blocks if "U+0000-00FF" in b), blocks[-1])   # latin subset
        u = re.search(r"url\((https://fonts\.gstatic\.com[^)]+)\)", pick).group(1)
        data = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA})).read()
        b64 = base64.b64encode(data).decode()
        faces.append(f"@font-face{{font-family:'{fam}';font-weight:{w};font-display:block;"
                     f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}")
open("fonts.css", "w").write("\n".join(faces))
```

### L1 token set used by the spike (the placeholder set to port)

```css
:root{
  --fs-mega: 232px; --fs-hero: 118px; --fs-h1: 68px; --fs-h2: 44px;
  --fs-body: 30px;  --fs-lab: 21px;   --fs-fine: 18px;
  --ls-lab: .22em;  --ls-disp: -.01em;
  --pad: 64px;      --stroke: 3px;    --u: 8px;  --r: 0px;
  --ink-d: #0A0C0E; --paper-d: #12161A; --text-d: #F2F5F6; --mut-d: #7C8B93;
  --ink-l: #EFEDE8; --paper-l: #FFFFFF; --text-l: #0A0C0E; --mut-l: #6E7478;
}
.art  { width:1080px; height:1350px; position:relative; overflow:hidden;
        font-family:'IBM Plex Sans',sans-serif; }
.disp { font-family:'Saira Condensed',sans-serif; font-weight:700;
        letter-spacing:var(--ls-disp); line-height:.92; }
.lab  { font-family:'IBM Plex Mono',monospace; font-weight:500; font-size:var(--fs-lab);
        letter-spacing:var(--ls-lab); text-transform:uppercase; }
.num  { font-variant-numeric: tabular-nums; font-family:'IBM Plex Mono',monospace; }
```

### Render

```python
async with async_playwright() as pw:
    b = await pw.chromium.launch()
    pg = await b.new_page(viewport={"width":1160,"height":1400}, device_scale_factor=1)
    await pg.goto("file://" + path_to_artboards_html)
    await pg.wait_for_timeout(900)                     # let embedded fonts settle
    el = await pg.query_selector('[id="01_hero-left_team"] .art')
    await el.screenshot(path="out/01.png")
    await b.close()
```

Note: IDs beginning with a digit are invalid CSS selectors. Use `[id="..."]`.

### Indonesian copy strings used

```
FORMULA 1 / PUTARAN 17 / GP SPANYOL / MADRING, MADRID
LATIHAN BEBAS 2      (FP2)
TERCEPAT             (fastest)
KLASEMEN SESI        (session classification)
SELISIH              (gap)
LAP DICATAT          (laps completed)
DUA TERDEPAN         (front two)
SISA SEPULUH BESAR   (rest of the top ten)
TIDAK START / DNS
SUMBER: OPENF1 - DATA RESMI
```

---

## Appendix C: this weekend

Madrid GP, first F1 race at the Madring (IFEMA Madrid), meeting_key `1294`.

| Session | session_key | Start (UTC) |
|---|---|---|
| Practice 1 | 11362 | 2026-09-11 11:30 |
| Practice 2 | 11363 | 2026-09-11 15:00 |
| Practice 3 | 11364 | 2026-09-12 10:30 |
| Qualifying | 11365 | 2026-09-12 14:00 |
| **Race** | **11369** | **2026-09-13 13:00** |

Race is 20:00 WIB, which is prime time for the Indonesian audience.

**The ten-minute task worth doing before qualifying:** a throwaway script that polls
`https://api.openf1.org/v1/session_result?session_key=11365` every 10 seconds from
session end and logs the timestamp when results first appear. That single number decides
whether "under sixty seconds" is a promise you can make.
