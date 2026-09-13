# MVP implementation status

The original PLAN.md remains unchanged as the project specification. This document distinguishes implemented local functionality from setup and live acceptance checks that need the owner's accounts or a future event.

## Implemented

| Area | MVP behavior |
|---|---|
| Runtime | pnpm packages, Linux Playwright renderer, Next dashboard, Postgres 16 migrations, persistent Graphile worker jobs; native publisher entry point |
| Storage | Normalized records, independent evidence retention, transaction-safe reservations, persistent quotas/cache, atomic locked file fallback, nonblocking read snapshots |
| Sources | OpenF1 results/schedule, Jolpica standings, FIA document links, allowlisted RSS, Reddit primary-link promotion, VLR completed results, TMDB release/cast/trailer metadata |
| Verification | R0–R4 pure rules, required fields, verbatim supporting quotes, exact numeric matching, domain boundaries, source independence and 45-minute corroboration, 90-minute review expiry |
| Model routing | Configurable role/budget ladder, persisted minute/day usage, cached extraction/copy, malformed/quota fallback, zero model calls for structured A data |
| Design | Three configurable brands, seven archetypes/four layouts each, five skins, 22 accent sets, shuffle history, contrast/image/logo/headline guards, pinned multilingual fonts |
| Certification | 11 adversarial fixtures, 924 Linux base-skin golden images, pixel-difference checks, missing/stale certification refused by composer |
| Dashboard | All-brand Lab, complete paginated variant rendering, contact sheet/profile grid, review actions and per-platform caption editing, carousel builder, Ops controls, reconciliation, and a machine-readable live-launch preflight |
| Review | Preview before approval, terminal/idempotent transitions, held-source release gated by R3, Discord owner buttons/modal and alerts, manual retraction workflow |
| Publishing | Four adapter implementations, explicit dry-run status, cap/warm-up/jitter/quiet-hour checks, kill switch, committed reservation before external effects, durable uncertain-submission receipts, local archive |
| Windows | Native headed Chrome profiles, session health checks/screenshots, agent heartbeat, optional interactive at-login task scripts |
| Demo | 60 recorded F1 treatments, labelled VCT/film review examples; no accounts enabled or posts queued |

## External acceptance still required

- **Live publishing:** X, Instagram, Threads and TikTok selectors/submission are implemented but have not been exercised against logged-in owner accounts. Manual login, platform checkpoints and a controlled first post per platform remain necessary. TikTok uploads native photo-mode stills (each render extended to 1080x1920 with a blurred cover-crop background, never stretched or letterboxed) — no ffmpeg dependency, no video re-encode.
- **Discord/Gemini/TMDB:** credential-dependent live runs require the owner's configured keys/channel IDs. No actual Discord messages or social posts were sent as part of this work.
- **Windows uptime:** the native scripts were authored on macOS, not executed on a Windows machine. Sleep/power/network settings and Task Scheduler acceptance require that host.
- **Fresh-event latency:** OpenF1 latency measurement tooling is included, but the planned live session-end-to-result observation and sub-60-second publication target are not certified by recorded fixtures.
- **Editorial identity/accounts:** names, handles and tokens are provisional. Handle availability, account creation and the two-week manual warm-up are owner actions, not completed by this implementation.
- **Source breadth:** FIA PDF text extraction is a manual-review path. VCT map/player/bracket and some film/TV claim types have rendering/review support but no dedicated automatic source adapter. VLR markup can change and fails visibly. No Riot account API integration is configured.
- **Retractions:** queued jobs cancel locally; already submitted posts require manual platform deletion and owner reconciliation. The UI never claims deletion based on a local status change alone.

## Deliberate MVP limits

The dashboard is local-only with no remote sign-in. Some worker network stages retain a serialized mutation transaction, limiting throughput; dashboard read snapshots do not share that lock. Full fixture certification uses the base skin, while the five-skin/accent combinatorial system uses guards and the Lab for further review. Brand fixture reuse intentionally stresses typography with recorded F1-shaped inputs; real VCT/film claims use their own typed fields.

## Verification

Verified locally on 12 September 2026:

- TypeScript typecheck and Next production Docker build passed.
- Linux test suite: 99 tests passed before the final two source-parser regression tests were added; final result recorded in `.data/verification/tests.log`.
- Full Linux golden comparison: **924 / 924 passed without updating baselines**. Multilingual and portrait examples inspected visually.
- End-to-end smoke: **12 simulated posts**, all three brands/four platforms, four-slide carousel, archive files present, idempotent approval, **zero model calls**. Isolated file-backed state under `.data/smoke`; it did not enable any real account.
- Postgres demo: 60 recorded-result treatments plus two labelled review examples; persisted unsigned shuffle seeds up to 4,273,879,227 after widening the database column to bigint.
- Browser inspection: brand selection and rendered Lab preview, 60-post contact sheet, review captions/previews, Ops/account defaults.
- Running services: local Postgres, renderer, dashboard and Graphile ingestion workers. All 12 actual account placeholders remain inactive at stage zero; no live publishing agent is running.
- Live source checks: OpenF1 (3 items), Jolpica (2), FIA (15), VLR (20), Formula1/Autosport/Motorsport/RaceFans/Deadline/Variety RSS ingested successfully. Counts describe the initial poll. DotEsports returned HTTP 403 (Cloudflare bot protection, confirmed not a User-Agent issue) and is visible as a source error; TMDB is idle without a key.
- Reddit: the adapter now authenticates via OAuth2 client-credentials (`REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`, no user login) against `oauth.reddit.com` instead of the public `www.reddit.com/*.json` endpoint, which Reddit blocks for non-browser callers regardless of headers. Verified with 9 unit tests covering the token exchange, bearer-token calls, and token caching across polls. Without those two env vars set it still falls back to the public endpoint and fails the same documented way (confirmed live: all four subreddits returned 403 pre- and post-fix, since no credentials are configured yet) — this closes the code gap, not the credentials gap. The owner still needs to create a Reddit "script" app at reddit.com/prefs/apps to get a client ID/secret.

Verification logs are retained under `.data/verification/`. The parser changes affect source normalization only and do not invalidate the design fingerprint or visual baselines.
