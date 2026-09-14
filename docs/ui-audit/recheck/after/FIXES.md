# UI audit fixes

Implemented in the actual dashboard at http://127.0.0.1:3939.

- D1: Review media and evidence now share a desktop row; narrow screens stack them. Carousels retain horizontal scrolling.
- D2: Theme palette uses a single mobile column, shrinkable tracks and wrapping font controls.
- D3: Certified worklist rows use the shared muted green marker with neutral status text.
- D4: Panel headings use Lexend Deca; layer creation controls inherit Lexend body typography.
- D5: Review counts, account tabs, theme provenance, reference details and post metadata use separate spaced fields.
- D6: Artwork corners are square; reference panels and certification toast use the shared panel radius.
- D7: Theme, derivation, post download, regeneration and certification text is shorter and factual.
- D8: Worklist actions sit beside bounded label columns; removal is visually secondary. Rows stack on mobile.
- I1: HTTP and network failures show a worklist error with Retry. Retrying clears the error and reloads the rows.
- I2: Certification and reference use named native modal dialogs with inert backgrounds, focus containment and focus restoration. Running certification blocks Escape; errors and references can close. Expanding a reference retains focus.
- I3: Only active reviews near expiry use the urgency color. Rejected/failed states retain error color; approved/expired states are neutral.

## Verification

- TypeScript: passed.
- Docker production build: passed; dashboard container rebuilt and started.
- 28 route/state captures across 1440px and 390px: no horizontal document overflow or browser page errors. Additional captures cover certification, worklist errors, inspector and account removal confirmation (40 screenshots total).
- Browser regression checks: HTTP and network retry; running/error certification Tab, Shift+Tab and Escape; reference expansion, Tab containment, Escape and opener focus restoration. Passed at both sizes.
- Existing review-filter tests: 3 passed.
- Historical status check: 48 expired labels rendered neutral. No approved records were available for a live approved-state check; its state condition was checked in source.

Run interaction checks from the project root with `node docs/ui-audit/recheck/verify-interactions.mjs`. Set `DASHBOARD_URL` to test another instance. Failure responses are mocked only in the test browser. These checks do not start certification, publish content or confirm removal.

Before screenshots remain in `../screenshots`; after screenshots and measured widths are alongside this file.
