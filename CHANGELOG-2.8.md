# ASTRA LAB 2.8: one professional design system

Everything here is presentation only. No physics, result, flight or validation number changed.

## Why
By 2.7 the app carried four looks stacked on top of each other (2.2 serif night sky, 2.2b "Explore Beyond" Arial Black headlines,
2.3 floating clip-art, 2.6 emerald glass). Headings, menu, buttons and accents changed style from screen to screen.
2.8 replaces that with one system.

## What changed
- **New stylesheet `ui/theme.css`**, loaded after `ui/styles.css`, is now the last word on the look. It defines the tokens
  and the component rules; the three colour looks only swap tokens.
- **Typography:** Inter (variable) for all text and JetBrains Mono for code and the cockpit clock, bundled in `assets/fonts`
  (SIL Open Font License, latin + latin-ext so Czech works), so the app looks the same on every PC. One type scale
  (10.5 / 11.5 / 12.5 / 14 / 16 / 20 / 24 / 30 px), tight tracking on headings, tabular figures for numbers.
  No more gradient-filled or Arial Black headings.
- **Spacing and shape:** 4 px grid tokens (`--sp-1` to `--sp-8`); corner radii 6 / 8 / 12 / 16 px; controls are 32 px high
  (26 px small, 44 px big).
- **Colour:** one accent (sky cyan) instead of mint in some places and cyan in others; semantic success / warning / failure
  colours with matching tints; deep navy-slate surfaces with three elevations.
- **Components:** buttons (primary, secondary, ghost, danger), inputs and selects with a focus ring, segmented controls
  (units switch, Academy tabs), underline tabs, cards, KPI stat tiles with a coloured status edge, tables with quiet
  headers and row hover, tinted pill badges, notes and callouts, modals, toasts, scrollbars, checkboxes.
- **Frame:** calmer sidebar (clear group labels, subtle active state with an accent edge, accent app mark), lighter top toolbar
  (borderless icon buttons), quieter status bar.
- **Charts:** a colour-blind-checked categorical palette (validated for lightness band, chroma, CVD separation and contrast on
  the dark chart surface) and navy-slate chart backgrounds and grid to match the app.
- **Home:** cleaner headline, the seven big buttons fit on one row, the cover now fills exactly the visible screen at every
  text size (before, part of it fell below the window when the text size was Large).
- **Decorations:** the floating astronaut and drifting rocks are now off by default. Settings → Look and motion →
  **Decorations** brings them back.
- **Looks:** Deep space, Daylight and High contrast all come from the same tokens. Daylight no longer shows dark patches on
  the report-card verdict, goal chips and in-page callouts; High contrast keeps white 2 px outlines and a yellow focus ring.

## Small code changes outside CSS
- `ui/index.html` loads `theme.css`.
- `ui/lib/app.js` default setting `decor: false`; `ui/lib/fx.js` sets `body[data-decor]`; `ui/screens/settings.js` adds the
  Decorations switch.
- `src/main/main.cjs` and `scripts/serve.mjs` serve `.woff2` fonts.
- Chart colours in `ui/lib/charts.js`, `studentdata.js`, `proviews.js`, `diagrams.js`, `cockpit.js`, `ui/screens/analysis.js`.
- Hard-coded pale green / red / amber text and border colours in `ui/styles.css` now use the semantic tokens.

## Honest limits
- The older rules in `styles.css` are still there underneath (the new layer overrides them); a later clean-up can delete the
  dead layers.
- The Engineering Workbench (opened inside the Engineering screen) has its own stylesheet and was not restyled.
- The 3D scenes, rocket livery and cockpit instruments are unchanged apart from colours and fonts.
