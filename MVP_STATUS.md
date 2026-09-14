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

Session-news headline follow-up on 13 September 2026:

- Fixed `session_result` prose-news graphics to use the stored editorial headline instead of only the driver name. Structured tier-A result cards retain short driver headings; blank prose headlines fall back safely.
- Updated the caption fallback so a complete story headline is not duplicated with another position/session phrase.
- Typecheck and three targeted headline regression tests passed. Re-rendered composition `2c19dbb1-ac3e-4a35-ba60-e41e99b686d3`; visually verified the full headline in both the design editor and saved PNG, with no headline overflow.
- Subsequently verified the Madrid qualifying classification against the FIA report: Piastri was seventh. Corrected the canonical headline to “Piastri Finis Ketujuh di Kualifikasi GP Spanyol”, aligned all four platform captions with P7/Madrid, and re-rendered this unpublished post preserving its saved design. No publication was queued or submitted.
- Post editor ticker accents now become a selectable “Lower bar” frame with Session, Source and Brand text layers. Save avoids duplicate overlays, deletion persists, and Reset restores the shared layout. Typecheck, production build and all 180 unit tests passed; live editor verified the corrected headline and selectable bar text controls.
- Production build passed. Linux comparison remained **913/924**, with exactly the same 11 pre-existing `session_result/big-number` mismatches and no new drift; passing layout certifications were refreshed and service caches reloaded.

Review-queue follow-up on 13 September 2026:

- Diagnosed the empty F1 incoming queue: 170 F1 reviews had expired under the 90-minute TTL.
- Added brand/status/type/tier/source/search filters and 24-card pagination. Expired history is browseable without enabling terminal review actions.
- Added owner-requested regeneration for up to 12 expired F1 claims observed in the last 24 hours; original gate decisions and source dates remain unchanged. Rejected/dropped or already queued/live content is excluded; old reviews remain in history.
- Regenerated **12 F1 reviews with 12 rendered designs**, with no preview errors. Existing publication queue stayed at 42 ready posts. Background workers/bot were briefly stopped during regeneration and restored afterward.
- Typecheck, production Docker build and **176 unit tests passed**. Browser checks verified 12 F1 incoming cards, 4 session-result cards with the type filter, and expired Madrid search results.
- Resolved the Piastri third/P7 conflict using the FIA Madrid qualifying report. The corrected artwork and captions are saved; review remains manual and nothing was published.

Manual-editor continuation verified on 13 September 2026:

- Per-composition design documents, real-claim/photo previews, isolated save/reset, saved-artwork download, and shared TikTok export are implemented. Contact Sheet provides editor links even after review expiry.
- Manual-editor captions save separately from review approval, with platform validation and visible failure reporting. Editing does not approve, enqueue, or record a publication; live/unresolved compositions are protected.
- Typecheck and production Docker build passed; **170 unit tests passed**.
- Madrid qualifying composition acceptance: saved a square design, reloaded it, verified 1080×1080 artwork and 1080×1920 TikTok PNG downloads, saved/reloaded its X caption, rejected an invalid document, and restored the original design/captions. The shared layout hash and existing 42 queued posts were unchanged.
- Linux golden comparison: **913/924 passed**. All 11 mismatches are `f1/session_result/big-number`; this layout remains uncertified and is excluded from automatic composition selection. Baselines were not overwritten.
- Remaining limitations: individual carousel-slide editing is unavailable, and manual saves can wait behind background worker/bot transactions. The acceptance test required briefly stopping those services; both were restarted afterward.

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
