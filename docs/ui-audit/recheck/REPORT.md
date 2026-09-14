# Whole-dashboard design re-audit

The established grayscale system is holding on the main screens. The remaining drift is concentrated in the newer design controls, reference overlays, and review layout. This pass records eight design findings and three interaction/state findings. No application source or live settings were changed.

## Reference and method

The reference remains the user's approved Final Cut Pro direction: Lexend body text, Lexend Deca headings at -3% tracking, grayscale chrome, and minimal functional red/green. The full current Template lab, studio, shared stylesheet, and every other dashboard TSX file were read. Recent changes were checked first using status, diff, and log; the current HEAD is `03d29b8`.

Relevant values: `--bg: #171717`, `--panel: #222222`, `--panel-2: #2d2d2d`, `--line: #3b3b3b`, `--fg: #eeeeee`, `--muted: #aaaaaa`, `--good: #86b995`, `--bad: #e57373`. Panel corners are 2px, control corners 4px, artwork frames square. Body text is 13px; secondary text is generally 11–12px. Headings use Lexend Deca, weight 500, tracking `-.03em`. Section gaps use the 4/8/12/16/24px scale.

Audited the actual Docker dashboard at port 3939, at 1440×900 and 390×900. Runtime hashes of the worklist and global stylesheet match the workspace. There are 40 screenshots, covering all six main routes, a populated layout editor, a populated post editor, an expired review filter, theme controls, Google Font entry, reference thumbnail/full view, selected-layer inspector, derive controls, account removal confirmation, and simulated certification/loading failures.

[Complete source inventory](INVENTORY.md), [viewport measurements](measurements.json), [interaction evidence](state-evidence.json), [screenshots](screenshots/).

The screenshot folder is this audit's baseline. There are no after-fix captures because this turn is an audit. Certification and failed-worklist responses were simulated only inside the test browser; no certification job, publishing action, removal, or settings save was submitted.

## Design findings

Paths below are relative to `apps/dashboard/app/`. Ranked by visibility and repetition. Each fix refers to the existing system, rather than proposing another aesthetic.

### D1. Review cards waste the space beside their artwork

**P2 · `review/review-list.tsx:103` · Content structure / excessive whitespace.** Each 216×270 preview occupies its own full-width row before the headline and evidence. At 1440px, most of that row is empty. Repeated across a queue of up to 24 cards, this materially slows scanning and pushes actions far below their associated headline.

**Fix:** place the artwork strip beside a `minmax(0, 1fr)` headline/evidence column with the existing 16px review gap on desktop, keep captions and actions below, and stack the media at the existing 700px breakpoint. Preserve horizontal scrolling for multiple slides.

Evidence: [desktop review](screenshots/review-1440.png), [mobile review](screenshots/review-390.png).

### D2. Brand palette overflows the mobile viewport

**P2 · `design/theme-panel.tsx:204`, `design/theme-panel.tsx:209`, `design/theme-panel.tsx:211` · Mobile layout.** Opening the palette changes the measured page width from 390px to 402px. The overridden accent label and reset control extend beyond the page. Its inner grid items retain content-based minimum widths despite the available 150px tracks. The overflow persists while reference overlays are open because the underlying palette remains too wide.

**Fix:** give each palette item `min-width: 0`, use `minmax(0, 1fr)` for shrinkable tracks, and switch palette fields to one column below 700px if swatch, value, and reset cannot fit together; preserve 8px gaps and 4px control corners.

Evidence: [mobile palette](screenshots/theme-390.png). Exact right edge: 402.03125px in `measurements.json`. All six default route captures and the editor/post defaults stayed at 390px.

### D3. Worklist introduces a second success green

**P2 · `design/worklist.tsx:22`, `design/worklist.tsx:145`, `design/worklist.tsx:148` · Color-role drift / minimal functional color.** Certified rows use hard-coded `#3fbf6f` on both the dot and the status text. The screenshot shows a noticeably brighter green repeated through the worklist than the approved muted status green.

**Fix:** replace `#3fbf6f` with `var(--good)` and keep only the small status marker green, with the written label using `--muted` or `--fg`.

Evidence: [worklist desktop](screenshots/design-1440.png).

### D4. Heading and body typography are crossing roles

**P2 · `design/derive-panel.tsx:85`, `design/studio.tsx:415`, `design/certify-button.tsx:81`, `design/certify-button.tsx:110`, `lab/editor.tsx:154` · Type hierarchy.** The derive heading, post headline, certification titles, and selected-element name are plain `strong`/`div` elements inheriting Lexend rather than the required Lexend Deca title treatment. Conversely, `design/panels.tsx:68` applies `.panel-title` to the entire add-layer section, making its help text and buttons inherit the heading family and tracking.

**Fix:** put `.panel-title` on actual title elements only, using 14px for panel headings and 16px for dialog/post titles, and remove it from the add-layer wrapper so instructions and controls inherit Lexend.

Evidence: [derive panel](screenshots/derive-1440.png), [post editor](screenshots/post-1440.png), [certification](screenshots/certifying-1440.png).

### D5. Joined metadata strings have returned

**P3 · `review/review-list.tsx:59`, `accounts/board.tsx:135`, `design/theme-panel.tsx:203`, `design/theme-panel.tsx:210`, `design/theme-panel.tsx:243`, `design/theme-panel.tsx:313`, `design/reference-preview.tsx:151`, `design/reference-preview.tsx:159`, `design/studio.tsx:417` · Typed separators.** Counts, brand names, font provenance, override state, and archetype/layout metadata are again joined into single strings. The long font/provenance string contributes to awkward wrapping in the mobile theme panel.

**Fix:** use separate elements following `.metadata` with 12px horizontal / 4px row gaps, keeping counts and provenance at 11px Lexend; use separate title and skin labels for the palette. Do not rewrite URL paths or syntax where a slash has a real technical meaning.

Evidence: [theme mobile](screenshots/theme-390.png), [account tabs](screenshots/accounts-1440.png), [review heading](screenshots/review-390.png).

### D6. Reference and confirmation corners drift from the chosen scale

**P3 · `design/reference-preview.tsx:93`, `design/reference-preview.tsx:113`, `design/reference-preview.tsx:130`, `design/derive-panel.tsx:126`, `design/certify-button.tsx:139` · Rounded-surface inconsistency.** Artwork previews use 4px corners, the full reference container uses 8px, and the certification toast uses 6px. These differ from the chosen square artwork / 2px panel / 4px control roles.

**Fix:** apply the existing square `.art-frame` treatment to artwork, `--radius-panel` to the reference panel and toast, and retain `--radius-control` for actual buttons. The round reference launcher and its real-image thumbnail are functional, so this finding does not require replacing that control.

Evidence: [reference full view](screenshots/reference-full-1440.png), [certification toast](screenshots/certify-success-390.png).

### D7. Technical explanations and stylistic punctuation are creeping back into task copy

**P3 · `design/theme-panel.tsx:299`, `design/derive-panel.tsx:129`, `design/post/[compositionId]/page.tsx:38`, `design/studio.tsx:436`, `review/review-list.tsx:106`, `design/certify-button.tsx:141` · Copy.** Several newer messages explain implementation philosophy rather than the immediate task and use the em-dash construction explicitly excluded by the original audit brief. The post introduction also directs users to a “right-hand panel” although export controls are at the top.

**Fix:** use short operational copy: “Fonts are stored with this brand.”, “Preview only. Use this design to save it.”, “Edit this post, then save and download the artwork above.”, and “Save changes before downloading.” Keep the source-date reminder and certification result factual and brief. Remove stylistic em dashes in authored UI copy, while preserving quotations and actual news headlines.

The same punctuation occurs in comments at `theme-panel.tsx:5,44,60`; `certify-button.tsx:11,18,89,102,127`; `reference-preview.tsx:14,141`; `studio.tsx:39,389,593`; `panels.tsx:389,401,445`; `derive-panel.tsx:18`. These are low-priority comment edits, not a reason to rewrite working logic.

### D8. Worklist row actions sit far from their labels

**P3 · `design/worklist.tsx:141` · Excessive uniform spacing / interaction hierarchy.** On desktop, `justify-content: space-between` stretches every short layout row across almost the full page. Design, Derive, and Remove slot have nearly equal visual emphasis and sit more than a thousand pixels from many labels. The same three controls repeat for every slot.

**Fix:** use an aligned row grid with a bounded label/status column and a nearby action group using the existing 8–12px gaps; emphasize the Design action through position or the existing selected-control treatment, and keep removal visually secondary. Preserve the current mobile wrapping.

Evidence: [worklist desktop](screenshots/design-1440.png), [worklist mobile](screenshots/design-390.png).

## Interaction and state findings

These are distinct from visual boilerplate, but they affect the usability of the audited UI.

### I1. Worklist errors remain hidden behind the loading state

**P2 · `design/worklist.tsx:42`, `design/worklist.tsx:85`.** A 503 response containing an error sets `error`, but the early `!rows` return renders “Loading worklist…” forever before reaching the error message. Reproduced at both viewport widths.

**Fix:** handle loading, error, and empty results separately; show a `--bad` error message with a compact Retry button calling `loadRows`, and catch rejected fetches. Use the existing left-aligned empty/error pattern rather than another modal.

Evidence: [error state](screenshots/worklist-error-390.png), `state-evidence.json`.

### I2. Certification's blocking overlay does not block keyboard navigation

**P2 · `design/certify-button.tsx:72`.** With running and failure responses simulated, the first Tab focuses the background Design navigation link at both widths. `aria-modal="true"` alone does not manage focus or make background content inert, so the page can be navigated while it visually claims to be locked.

**Fix:** use a modal dialog that moves focus inside, makes the background inert, restores focus on dismissal, and provides an accessible name; retain the grayscale backdrop and functional progress indicator. The reference dialog likewise has no explicit focus containment, though this pass's first Tab reached its Close button, so it is not counted as a separately reproduced failure.

Evidence: [running overlay](screenshots/certifying-390.png), [failure overlay](screenshots/certify-error-390.png), `state-evidence.json`.

### I3. Approved reviews can be colored as errors

**P2 · `review/review-list.tsx:98`.** Status color depends only on `expiresInMinutes < 15`, while the displayed value becomes `approved`, `rejected`, or `expired` for non-active records. A previously approved review past its expiry therefore renders “approved” in red. This is a deterministic source finding; an approved-item screenshot was not captured.

**Fix:** choose colors from the displayed state: neutral for historical records, optional `--good` for approved, `--bad` for rejected/failed; only apply the red expiry threshold while the record is pending or held.

## Coverage and exceptions

All 27 TSX files are listed in [INVENTORY.md](INVENTORY.md), including every named component and helper. The three dashboard CSS files were reviewed. There are no source or deployment changes in this pass.

There is source coverage but no individual screenshot for every inspector node kind, font upload draft, every brand/layout combination, each error payload, or every publishing-control state. Simulated states are clearly identified above. No success/failure of publishing was tested.

The public landing page and static planning HTML are separate from the dashboard scope, as in the prior audit. Artwork inside the editor, color swatches, and brand-font choices represent the actual publishing output; their color and typography are not violations of the grayscale application chrome. The default lab fixture's geometric image is intentional test input, not filler UI. Overlay transparency/shadows have real layers beneath them, and the account loading blur obscures controls during a save, so they are not flagged as decorative glassmorphism. Loading/progress motion communicates work; there is no ambient hover-lift pattern.

## Already compliant surfaces to retain

- `globals.css`, `layout.tsx`, `nav.tsx`: grayscale navigation, requested logo, locally hosted typefaces, correct main heading tracking, rectangular controls, visible focus treatment.
- `lab/page.tsx`, `lab/lab.tsx`: clear render task, responsive viewer/inspector split, real renderer output, and separate variant metadata. The selected-element title exception is D4.
- `ops/page.tsx`, `ops/controls.tsx`, `ops/source-controls.tsx`, `ops/reconciliation.tsx`: compact divided metrics, structured tables, functional status labels, and direct action copy.
- `accounts/accounts.module.css`: platform rows change deliberately from five columns to two to one. This is not a generic feature-card grid.
- `contact-sheet/sheet.tsx`: actual rendered content, a meaningful three-column profile preview, and square image frames.
- `review/review-list.tsx`: existing evidence and caption grids stack without page-level overflow; retain those patterns while addressing D1/D5/I3.
- `design/panels.tsx`: actual layer-kind symbols, data bindings, and targeted property controls. They represent real editing functions and should not be replaced by decorative icons.
