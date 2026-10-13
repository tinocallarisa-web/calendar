# Changelog — Calendar Events Heatmap

All notable changes to this project are documented in this file.

---

## [1.2.0.0] — 2026-10-12

### Added
- **Year view (Pro).** The twelve months in miniature, each day coloured by the measure. Click a month to open it.
- **Drill up and down.** The title goes up a level (week → month → year); a week number opens that week; **Today** jumps to the current date.
- **Week numbers**, ISO 8601 or US, to the left of each week in the month view.
- **Date-range selection (free).** Drag across days, or click one and Shift+click another: every day in between filters the report. Shift+Enter does it from the keyboard.
- **Measure switching (Pro).** With measures in Tooltip Measures, a Measure selector lets the reader choose which one colours the days; the choice is saved with the report.
- **Fiscal periods in weeks: 4-4-5, 4-5-4 and 5-4-4 (free).** Twelve periods of whole weeks, the year starting on the first day of the week closest to day 1 of the fiscal month; in a 53-week year the extra week goes to period 12.
- **Color Rules (free).** Up to three thresholds on the day's value, each with its colour — the visual's conditional formatting.
- **Color schemes:** Blues, Greens, Purples, Greys, Red-yellow-green and its reverse, Viridis and Cividis (colour-blind safe), Activity (GitHub style), TCViz blue, or Custom.
- **Style templates:** Classic (the default look), Clean, Tiles, Minimal and TCViz. A template only fills what you have not set yourself.
- **Color Legend** for the scale, with minimum and maximum, at the top or the bottom; **Layout** with corner radius and space between days.
- **Events as colour marks.** *Show events as*: Auto (marks in month and year, labels in week), Color marks or Labels. Marks are full-width stripes stacked on the day, so four events always fit.
- **Event palettes:** Vivid (Okabe-Ito, colour-blind safe, the default), Bold, Bright, Dark or Classic — eight clearly different colours each.
- **Setup guide inside the visual**, in edit mode only: it ticks off each field as you add it and offers the templates.
- **Format on the canvas:** click a day, its number or value, the view buttons, the legend or the event marks to format them.
- **Twelve languages** for the Format pane, the buttons, tooltips, messages and the licence notice; day and month names follow the report's locale.

### Changed
- **New Format pane.** The visual moves from the legacy property API to the formatting model.
- **The layout adapts to the size of the visual.** *Months to Display* is a maximum: only the months that fit are drawn. Day values hide when a day is too narrow to read them, and below 320 px the visual turns compact. The 380 px minimum height that cut the month view in short visuals is gone.
- **Category colours** follow the order of appearance over eight distinct tones (before, a hash over six could give two categories the same colour) and no longer reuse the heatmap's own orange.
- **Text stays readable**: a day number or value that would not read on its day turns dark or white.
- **Screen readers** announce how many days are selected.
- **Tooling**: powerbi-visuals-tools 7.2.1, API 5.11.1, TypeScript 5.5.4; npm audit from 20 findings to 6 (development only, none in the package).

### Fixed
- **The automatic date hierarchy put everything on 1 January.** With Auto date/time on, Power BI sends Year, Quarter, Month and Day as separate columns and the visual read only the year. It now rebuilds each date from the levels (month names in any of its languages or month numbers); without the Day level it says so instead of piling the data on one day.
- **Fiscal Calendar did nothing.** The setting was in the Format pane but never read. It now labels months with the fiscal year and period (FY2027 P1) and starts the year view at the fiscal month.
- **The fx button on Day Color never applied.** Power BI does not offer conditional formatting to visuals that read data as a table. Replaced by Color Rules; Day Color remains as a fixed colour.
- **Day names were always in English** and month names followed the browser instead of the report.
- **The licence notice** asked Power BI for a text key it does not resolve; it now comes in the report's language.

## [1.1.2.0] — 2026-09-20

### Added
- **Pro preview while editing.** Without a licence, in edit mode, the Pro features (week view,
  multiple events per day and per-category colours) now render working under a "Pro preview"
  watermark, as Microsoft's publishing guidelines allow for paid features. In reading view,
  before the licence resolves, or where Power BI cannot check licences (Publish to Web,
  embedding, export), the free result is shown with no watermark.
- **`build-test.js --free`**: builds with the real licence instead of forcing Pro. It is the
  only mode in which the preview, the watermark and the purchase notices can be tested.

### Certification
- `npm audit`: de 14 avisos (1 alto, 9 moderados) a **7 (0 altos, 3 moderados, 4 bajos)**,
  con `overrides` de `uuid` y `elliptic`. **`ajv` moderado no se puede resolver sin subir
  `powerbi-visuals-tools`**: forzar `ajv@8` rompe el build (el ESLint interno de tools 5.6
  necesita `ajv@6`). Queda declarado como hueco conocido.
- **ESLint no existía en el repo**: ni dependencia, ni plugin, ni configuración, ni script.
  Añadidos `eslint@^9`, `eslint-plugin-powerbi-visuals`, `eslint.config.mjs` y el script
  `"eslint"` que pide certificación. Sin errores (`tools/` y `build-test.js` excluidos por
  ser utilidades locales, no parte del visual).
- **Localización creada desde cero.** No había carpeta `stringResources` y `pbiviz.json`
  la declaraba como `[]`. Ahora hay `resources.resjson` con 50 cadenas, las 46 entradas de
  `capabilities.json` (6 roles, 7 objetos, 33 propiedades) llevan su `displayNameKey`, y el
  visual llama a `createLocalizationManager()` para el texto del aviso de compra.
- `build-test.js` admite `--free`, el único modo en el que se pueden probar la vista previa,
  la marca de agua y los avisos de compra.

### Fixed
- **Only one purchase notice reached the user.** `notifyLicenseRequired` and
  `notifyFeatureBlocked` were called back to back, and Power BI shows a single notification
  at a time, so the second replaced the first. The previous notice is now cleared first, the
  banner names only the newly activated features, and the persistent Upgrade bar follows once
  the banner ends (~10.5 s). Pattern verified in Risk Matrix Pro in the Power BI service.
- Clicking the Week button still notifies, even if that feature was already announced.

---

## [1.1.1.0] — 2026-09-14

### Fixed

- **A paying customer could stay on Free.** `getAvailableServicePlans()` returns each plan's
  `spIdentifier` as the full Partner Center **Service ID** (`publisher.offer.plan`), as the
  licensing API documentation states. The visual compared it with the bare plan ID
  `calendar-tcviz`, which never matches the full Service ID. It now accepts a Service ID
  ending in `.calendar-tcviz`, and the bare plan ID as well. The 30-day trial resolves the
  same way.

---

## [1.1.0.0] — 2026-09-04

### Added

**Power BI feature support**
- **Report tooltips.** `capabilities.json` now declares
  `tooltips.supportedTypes.canvas`, so a tooltip page can be attached to the visual and
  is shown for the hovered day. Standard tooltips were already supported; this adds the
  report-page variant.
- **Dynamic format strings.** Values are formatted with the measure's own format string,
  read from the column metadata on every update so a DAX-driven format string is picked
  up. Percentages, currencies, decimal precision and custom formats now render correctly
  where they previously fell back to a hand-rolled K/M abbreviation. Day cells keep the
  compact form via display units; tooltips and screen-reader labels show full precision.
  Each Tooltip Measure is formatted with its own column's format string.
- **Bookmarks.** `registerOnSelectCallback` keeps the visual's selection in sync when a
  bookmark, a "clear filters" action or a selection made elsewhere in the report changes
  it. Previously the visual kept painting a stale selection.
- **Conditional formatting.** A new **Day Color** property under Heatmap Colors carries an
  fx button. A rule bound to the Main Measure resolves per day and overrides the
  gradient; a constant value applies to every day. Precedence is rule, then constant,
  then the gradient.
- **Allow Interactions.** Click, keyboard activation and the context menu now honour
  `host.allowInteractions`, so the visual is inert where Power BI asks it to be — for
  example when used inside a report tooltip page.

### Fixed

- Tooltip Measures were aggregated by parsing their own *formatted* strings and stripping
  every non-numeric character. Any currency symbol, percent sign or thousands separator
  corrupted the running total. Aggregation now runs on the raw numbers and formatting
  happens only at display time.

**Accessibility**
- Full keyboard navigation across the day grid. A roving `tabindex` makes the grid a
  single tab stop; from there:
  - `←` `→` move one day, `↑` `↓` move one week (month view) or one day (week view)
  - `Home` / `End` jump to the first / last day of the week
  - `Page Up` / `Page Down` jump one month (month view) or one week (week view)
  - `Enter` / `Space` filter on the focused day; `Ctrl`/`Cmd` adds to the selection
  - `Escape` clears the selection so slicers and other visuals return to unfiltered
  - `Shift+F10` / `Context Menu` opens the Power BI context menu on the focused day
  - Moving past the edge of the visible range navigates to the adjacent month or week
    and keeps focus on the target day
- Visible focus ring on day cells and on all navigation buttons, themed to the
  configured accent color and drawn with `box-shadow` so it never collides with the
  selection outline.
- Tooltips now open on keyboard focus, not only on hover, so the secondary measures in
  the **Tooltip Measures** field well are reachable without a mouse.
- ARIA semantics: `role="grid"` / `rowgroup` / `row` / `columnheader` / `gridcell` on the
  calendar structure, a per-day `aria-label` announcing date, measure value, holiday and
  event names, `aria-selected` on selected days, `aria-live` on the month/week label,
  `aria-pressed` on the Month/Week toggle, `aria-label` on the navigation buttons, and
  `role="list"` on the event category legend.
- High contrast support via `host.colorPalette.isHighContrast`. When a high-contrast
  theme is active the visual stops encoding meaning in fill color: day cells use the
  theme background with the heatmap intensity re-encoded as border weight (1–4px) in the
  theme foreground, today and the active view button are marked by a heavier border in
  the selected-foreground color, event badges and legend swatches switch to outlined
  style, and all text uses the theme foreground.
- `@media (forced-colors: active)` and `@media (prefers-reduced-motion: reduce)` rules so
  the OS palette and motion preferences win outright.

### Changed

- **Power BI's own purchase notifications replace the visual's licensing UI.** The "🔒" on
  the Week button and the "… is available in Calendar Events Heatmap Pro" toast are gone:
  Microsoft asks visuals not to draw their own licensing UX. A Free user who clicks Week,
  or sets a Pro option (several months, more events per day, event styling, label and
  button styling, category colours), gets `notifyFeatureBlocked` and `notifyLicenseRequired`,
  which carry the purchase path. They fire only once the licence is resolved and are
  cleared when it resolves to Pro.
- **Pro options are visible to Free users**, marked "[Pro]" in the format pane. The
  Measure Labels, View Buttons and Event Category Colors cards used to be hidden without a
  licence, so nobody could find them. The pane shows the value the user chose; the visual
  applies it only with a licence.
- The package description no longer claims to be "the only" calendar of its kind.
- Selecting a day now dims the unselected days and draws an outline on the selected
  ones, in both month and week view, for mouse and keyboard alike.
- `capabilities.json` already declared `supportsKeyboardFocus`; this release is what
  actually implements it.
- `style/visual.less` is no longer where the stylesheet lives. pbiviz has never emitted
  it into the package — `content.css` is absent in every build from 1.0.0.0 onwards — so
  the rules it declared never reached a report. The stylesheet is now injected at runtime
  by `injectStyles()`, which is what makes the keyboard focus ring actually ship.

### Fixed

- **Week view was reachable without a licence** by setting *Default View = Week*: the
  toggle was gated, the render path was not. Week view now renders only with a licence.
- **A licence in the `Warning` state was treated as Free.** Warning is the grace period of
  a failed payment; the customer has paid and now keeps Pro through it. The 30-day trial
  configured on the Partner Center plan resolves as Active, as before.
- **Publish to Web, embedding and export no longer ask anyone to buy.**
  `isLicenseUnsupportedEnv` and `isLicenseInfoAvailable` are honoured.
- **Removed a "License Key" text field** from the format pane and `capabilities.json`. It
  was never read by the code, and the visual is licensed only through AppSource.
- Removed the unused `TRIAL_DAYS` constant and `trialActive` field.
- Day keys are parsed back into dates from their explicit year/month/day components.
  `new Date("2025-03-04")` is interpreted as UTC midnight and lands on the previous day
  in any negative UTC offset, which would have moved keyboard focus to the wrong day for
  users west of UTC.

---

## [1.0.0.3] — 2026-08-21

### Fixed

- **Security — XSS.** Removed all four `innerHTML` assignments and the
  `powerbi-visuals/no-inner-outer-html` lint suppressions that accompanied them.
  `buildMonthView()`, `buildWeekView()`, `buildSingleMonthGrid()` and
  `buildCategoryLegend()` now build DOM nodes instead of HTML strings, and every
  user-supplied value (event name, event category, holiday name, formatted measure) is
  written through `.textContent`, which is never interpreted as markup.
- Added `sanitizeColor()` and `sanitizeFont()` so format-pane values are validated before
  they reach a style attribute.
- Added input validation in `parseDataView()`: unparseable dates are skipped, control
  characters are stripped from event and holiday names, and measure values are checked
  with `isFinite()`.
- `renderLandingPage()` and `showUpgradePrompt()` rebuilt with DOM nodes.
- License check now compares `plan.state` against the numeric `ServicePlanState.Active`
  instead of the string `"Active"`.

---

## [1.0.0.2] — 2026-08-17

### Fixed

- First attempt at the XSS remediation above. Superseded by 1.0.0.3, which completed the
  conversion away from `innerHTML`.

---

## [1.0.0.1] — 2026-08-14

### Fixed

- **Resizing hid calendar rows.** Day cells carried a fixed `min-height: 40px`, so a
  5–6 row grid had a minimum height above 240px and the bottom rows were silently
  clipped by `overflow: hidden` when the visual was made smaller. Cells now use
  `min-height: 0` and `flex: 1`, distributing the available height evenly across week
  rows at any size.
- Added `min-height: 0` at every level of the flex chain so flex shrink propagates
  through the nested column layouts.
- Added `flex-shrink: 0` to the navigation bar, view toggle, day-name header and legend
  so the controls never yield their space to the grid.
- Applied to both month and week view.

---

## [1.0.0.0] — 2026-08-13

### Added

**Core visual**
- Month view with KPI heatmap — gradient coloring from min to max across visible days
- Configurable heatmap colors: min, max, and no-data color pickers
- Day number styling: font size, family, color; separate weekend and holiday colors
- Previous/Next navigation buttons for month and week views
- Keyboard accessibility (`supportsKeyboardFocus`)
- Cross-page filtering via Power BI `selectionManager`
- Right-click Power BI context menu support (`showContextMenu`)
- Landing page support (`supportsLandingPage`)
- Highlight support (`supportsHighlight`)
- Multi-visual selection (`supportsMultiVisualSelection`)
- Filter state synchronization (`supportsSynchronizingFilterState`)

**Events**
- Event badges with automatic per-category color palette (auto mode)
- Per-category event color configuration: up to 8 categories, one color picker each — **Pro**
- Color legend rendered in-visual below Month/Week navigation buttons
- Single global event color mode with `useGlobalColor` toggle (when ON, single "Event Color" picker overrides category colors)
- Event badge text color and font size configuration — **Pro**
- Max events per day (month view) — **Pro**

**Views**
- Week view — **Pro**
- Multi-month view: 1–12 months side by side — **Pro**
- Configurable default view (month/week), week start day (Sun/Mon), fiscal calendar with start month offset

**Data roles**
- `date` — calendar date (Grouping)
- `mainMeasure` — KPI measure for heatmap (Measure)
- `secondaryMeasures` — tooltip-only measures, multiple fields supported (Measure)
- `eventName` — event badge label (Grouping)
- `eventCategory` — event color grouping (Grouping)
- `holidayName` — holiday overlay label (Grouping)

**Format pane**
- Calendar: Default View, Months to Display, Week Starts On, Fiscal Calendar, Fiscal Year Start Month
- Heatmap Colors: Min Color, Max Color, No Data Color
- Day Number: Font Size, Font Family, Color, Weekend Color, Holiday Color
- Events: Show Events, Max Events per Day, Single color for all events, Event Color (conditional), Event Text Color, Event Font Size
- Event Category Colors (c0–c7): one picker per category — **Pro**
- Measure Labels: Font Size, Font Family, Color — **Pro**
- View Buttons: Active Button Color, Button Text Color — **Pro**

**Freemium**
- Free tier: 1 month view, heatmap, 1 event/day, auto category colors, holidays, tooltip measures, filtering
- Pro tier ($9.99/month): all Free features + multi-month, week view, configurable events/day, per-category colors, full format pane
- 30-day full Pro trial on first install — no payment required
- Upgrade toast when Free-tier user attempts a Pro-only action

**Documentation**
- `support.html`, `terms.html`, `privacy.html` published to GitHub Pages
- `docs/CERTIFICATION-NOTES.md`
- `docs/TIPS-AND-HINTS.md` + `docs/TIPS-AND-HINTS-PLAIN.txt`
- `docs/WEBSITE-PRODUCT-PAGE.md`
- `docs/YOUTUBE-DESCRIPTION.txt`
- `docs/YOUTUBE-TAGS.txt`
