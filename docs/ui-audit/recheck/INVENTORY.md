# UI source inventory

Every TSX file below was read during this pass. Shared CSS, fonts.css, and accounts/accounts.module.css were also reviewed. API routes have no standalone visual surface.

| Area | File | Named components and functions |
| --- | --- | --- |
| accounts | `accounts/board.tsx` | AccountCard, save, update, BrandSettings, run, AccountsBoard |
| accounts | `accounts/page.tsx` | AccountsPage |
| contact-sheet | `contact-sheet/carousel-builder.tsx` | CarouselBuilder, create |
| contact-sheet | `contact-sheet/page.tsx` | ContactSheet |
| contact-sheet | `contact-sheet/sheet.tsx` | Sheet, seed |
| design/[brand]/[archetype]/[layout] | `design/[brand]/[archetype]/[layout]/page.tsx` | StudioPage |
| design | `design/certify-button.tsx` | CertifyButton, start, CertifySuccessToast |
| design | `design/derive-panel.tsx` | DerivePanel, buildTransforms, runPreview, accept |
| design | `design/page.tsx` | DesignPage |
| design | `design/panels.tsx` | LayersPanel, MiniBtn, Inspector, AbsoluteInsets, TextProps, FormatEditor, FrameProps, ImageProps, RowsProps, paintToColourValue, colourValueToPaint, ColourField, FontField, SizeField, PaddingField, Field, Select, Section |
| design/post/[compositionId] | `design/post/[compositionId]/page.tsx` | PostDesignPage |
| design | `design/reference-preview.tsx` | ReferencePreview, ReferenceCaption |
| design | `design/studio.tsx` | DesignStudio, save, seed, discard, PostPanel, saveCaption, Canvas, onMove, onUp, ContrastWarnings |
| design | `design/theme-panel.tsx` | guessFromFileName, bytesToBase64, ThemePanel, saveColour, resetColour, fetchFont, pickUploadFile, onFileChosen, confirmUpload, resetFont, saveTracking, resetTracking |
| design | `design/worklist.tsx` | Worklist, addSlot, removeSlot |
| lab | `lab/editor.tsx` | BoundingBoxEditor, onMove, onUp, startDrag, ElementInspector |
| lab | `lab/lab.tsx` | LayoutEditorPanel, setElementTransform, save, reset, Lab, render, renderAll |
| lab | `lab/page.tsx` | LabPage |
| . | `layout.tsx` | RootLayout |
| . | `nav.tsx` | NavLink |
| ops | `ops/controls.tsx` | Controls, send |
| ops | `ops/page.tsx` | Ops |
| ops | `ops/reconciliation.tsx` | Reconciliation |
| ops | `ops/source-controls.tsx` | SourceControl, RetractControl |
| . | `page.tsx` | Home |
| review | `review/page.tsx` | ReviewPage |
| review | `review/review-list.tsx` | ReviewList, regenerate, act |
