# Dashboard UI audit

Reference established by the user: Final Cut Pro style workspaces, Lexend body text, Lexend Deca headings at -3% tracking, grayscale chrome, and minimal functional red/green. The full Template lab and Design studio sources informed the panel structure. This supersedes the earlier teal dashboard styling.

Implemented tokens: background `#171717`, panels `#222222`, controls `#2d2d2d`, dividers `#3b3b3b`, text `#eeeeee`, secondary text `#aaaaaa`. Selection is neutral white. Errors use `#e57373`; positive status uses `#86b995`. Warnings are neutral and retain written labels. Body text is 13px Lexend; headings are 22/16/14px Lexend Deca with `letter-spacing: -.03em`. Controls use 4px corners, panels 2px, artwork frames 0px. Spacing uses 4/8/12/16/24px. No decorative motion, shadows, gradients, or blur were added.

## Findings, ranked by visibility

Locations below refer to the revised source. All paths are relative to `apps/dashboard/app/`. Findings are fixed unless a coverage limitation is stated below.

| Priority | File:line | Checklist rule | Concrete change |
| --- | --- | --- | --- |
| 1 | `globals.css:3` | Color without a product role | Replace slate/teal and amber with the approved grayscale tokens; reserve red and green for outcomes. |
| 1 | `globals.css:13` | Default typography | Load local Lexend 400/500/600 and use Lexend Deca at -.03em for headings and panel titles. |
| 1 | `globals.css:15`, `layout.tsx:9` | Mobile never checked | Wrap the application bar and give navigation its own horizontal scroll region below 700px. |
| 1 | `globals.css:29` | Rounded everything | Use 2px panel corners, 4px controls, and square artwork frames. |
| 1 | `globals.css:47` | Pills for every short string | Replace capsule toggles with rectangular controls and `.tag` capsules with plain 11px labels. |
| 1 | `globals.css:62` | Centered padded empty boxes | Use left-aligned messages with horizontal dividers and 24px vertical spacing. |
| 2 | `lab/editor.tsx:110` | Hard-coded decorative color | Use white selection borders and neutral translucent bounds in place of teal. |
| 2 | `lab/lab.tsx:88` | Fixed desktop layout on mobile | Use a flexible viewer and 360px inspector, stacking below 700px; measure the viewer for matching image and pointer scale. True-size artwork scrolls inside its pane. |
| 2 | `design/studio.tsx:217` | Floating panels and fixed widths | Use a contiguous 250px / flexible / 300px workspace with 1px dividers; adapt to two columns at 1100px and a viewer-first stack at 700px. |
| 2 | `design/studio.tsx:309` | Fixed-size canvas | Derive preview and pointer scale from measured available width; retain the existing 520px/660px maximums. |
| 2 | `design/panels.tsx:30`, `design/panels.tsx:430` | Generic uppercase type hierarchy | Apply the Lexend Deca panel-title pattern to Layers and inspector sections. |
| 2 | `lab/lab.tsx:269`, `design/panels.tsx:201`, `design/panels.tsx:365` | Pill controls as default | Use actual buttons with `aria-pressed`, rectangular corners, and keyboard focus states for accents, text binding, and columns. |
| 2 | `lab/lab.tsx:304`, `lab/lab.tsx:312`, `lab/lab.tsx:319` | Typed separators joining data | Separate resolved settings, variant context, and thumbnail metadata into wrapping elements with 12px gaps. |
| 2 | `design/studio.tsx:211` | Technical explanatory filler | Replace the extended template explanation with a short editable-copy instruction and separate archetype/layout labels. |
| 2 | `design/page.tsx:13`, `design/page.tsx:23`, `lab/page.tsx:15`, `lab/lab.tsx:228` | Verbose product copy | Use one sentence describing the task and a short renderer recovery instruction. |
| 3 | `ops/page.tsx:32` | Repeated boxed metrics and pill labels | Present metrics in a divided strip with tabular values and plain labels; use two columns on mobile. |
| 3 | `ops/page.tsx:50`, `ops/page.tsx:93`, `ops/reconciliation.tsx:7` | Typed metadata separators | Separate process heartbeats into a definition list and session/reconciliation data into distinct elements. |
| 3 | `ops/page.tsx:28` | Editorial filler | State the task directly: monitor polling, sessions, and queue activity. |
| 3 | `accounts/board.tsx:16`, `accounts/board.tsx:59`, `accounts/board.tsx:89`, `accounts/board.tsx:110` | Joined stage/status/brand metadata | Use readable stage labels and separate brand, vertical, session, and count elements. |
| 3 | `accounts/page.tsx:45` | Excessive onboarding explanation | Describe handle, warm-up, and cap controls, followed by the real configured count. |
| 3 | `review/review-list.tsx:34`, `review/review-list.tsx:63`, `review/review-list.tsx:67`, `review/review-list.tsx:83` | Filler, joined metadata, desktop-only grids | Shorten the empty state, split source metadata, stack evidence on mobile, and size caption columns from available width. |
| 3 | `contact-sheet/page.tsx:23`, `contact-sheet/carousel-builder.tsx:3` | Data-model labels with baked-in separators | Give brand navigation separate links with active state and pass the actual claim headline instead of a composite brand/headline string. |
| 3 | `contact-sheet/sheet.tsx:42`, `contact-sheet/sheet.tsx:49`, `contact-sheet/sheet.tsx:61` | Abstract copy and joined thumbnail metadata | Describe the comparison task directly and separate image metadata; constrain the profile grid to available width. |

Also corrected the account Active checkbox to use its native change event, named the layer action buttons for assistive technology, and stopped displaying editor save errors as green success messages.

## Full dashboard inventory

| Area | Files reviewed in full | Components / surfaces |
| --- | --- | --- |
| Shared | `layout.tsx`, `nav.tsx`, `globals.css`, `page.tsx` | RootLayout, NavLink, navigation, shared controls, tables, statuses, empty states, root redirect |
| Template lab | `lab/page.tsx`, `lab/lab.tsx`, `lab/editor.tsx` | LabPage, Lab, LayoutEditorPanel, BoundingBoxEditor, ElementInspector, render checks, variants |
| Design studio | `design/page.tsx`, `design/studio.tsx`, `design/panels.tsx`, `design/doc-model.ts` | DesignPage, DesignStudio, Canvas, LayersPanel, MiniBtn, Inspector, AbsoluteInsets, TextProps, FormatEditor, FrameProps, ImageProps, RowsProps, SizeField, PaddingField, Field, Select, Section; document model has no standalone surface |
| Contact sheet | `contact-sheet/page.tsx`, `contact-sheet/sheet.tsx`, `contact-sheet/carousel-builder.tsx` | ContactSheet, Sheet, profile preview, render thumbnails, CarouselBuilder |
| Review | `review/page.tsx`, `review/review-list.tsx` | ReviewPage, ReviewList, evidence, image strip, captions, actions, empty queue |
| Accounts | `accounts/page.tsx`, `accounts/board.tsx` | AccountsPage, AccountsBoard, AccountCard, stage controls, sessions |
| Operations | `ops/page.tsx`, `ops/controls.tsx`, `ops/source-controls.tsx`, `ops/reconciliation.tsx` | Ops, Controls, SourceControl, RetractControl, Reconciliation, metrics and logs |

The public `site/index.html`, planning documents `buildspec.raw.html` / `newsroom.raw.html`, and publishing artwork/templates are separate from the requested app interface. They are unchanged. Colored media previews remain faithful to the publishing renderer; the application chrome is grayscale.

## Verification and screenshots

- Dashboard TypeScript check and production build pass. The build skips lint under the existing project configuration.
- All six routes captured at 1440px desktop and 390px mobile, before and after. Files are in `before/` and `after/` with route and viewport in each filename.
- Before: page widths at a 390px viewport were 659px on five routes and 682px in Template lab. After: all six measure exactly 390px with no page-level overflow. Tables, navigation, and true-size artwork have local scroll regions.
- Populated Design studio checked using the repository's own `seedDoc('hero-left')` returned only to the test browser. The actual renderer produced its artwork. Layer selection, static/data toggle, and Undo pass at 1440px and 390px. The browser confirms Lexend and Lexend Deca are loaded, with heading tracking -0.66px at 22px, exactly -3%.
- Populated review checked using a temporary copy of a real expired review with its expiry extended. No publishing or account actions were submitted.
- Coverage limits: the populated editor and review have after-only captures because neither state was present in the initial route capture. Every conditional inspector variant, caption platform, failure message, and rendered-variant combination has source coverage but not an individual before/after screenshot. This is not an exhaustive state-by-state visual certification.

## Already compliant patterns retained

- `ops/source-controls.tsx`: direct Pause, Resume, Cancel, and Request removal controls.
- `review/page.tsx`: real claims, evidence, sources, and renderer output.
- `contact-sheet/sheet.tsx`: the three-column Instagram profile arrangement reflects the actual content format.
- `design/panels.tsx`: functional layer-kind symbols identify real node types; image scrim controls affect published artwork and serve text legibility.
- `page.tsx`: the existing root redirect has no visual surface.
