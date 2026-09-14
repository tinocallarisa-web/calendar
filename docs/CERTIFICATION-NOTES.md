# Certification Notes — Calendar Events Heatmap v1.1.0.0

**Visual GUID:** `calendarTCViz022303184F264C8B9ACE6A13E838FFEB`  
**Plan ID:** `calendar-tcviz`  
**Publisher:** TCViz (support@tcviz.com)  
**Version:** 1.1.0.0  
**Submission date:** (fill on submission)

---

## Release Notes — Power BI feature support (v1.1.0.0)

No change to data handling, licensing or network behaviour. One new dependency:
`powerbi-visuals-utils-formattingutils` 6.1.2, Microsoft's own formatting library, used
only to format numbers locally. It makes no network calls.

- **Report tooltips.** `capabilities.json` declares
  `"tooltips": { "supportedTypes": { "default": true, "canvas": true } }`. The visual
  already passed `identities` to `tooltipService.show()`, which is what a tooltip page
  needs to resolve the hovered day.
- **Dynamic format strings.** `valueFormatter.getFormatStringByColumn()` is called on
  every `update()` for the Main Measure and each Tooltip Measure, so a format string
  produced by DAX is re-read rather than cached. Day labels use a formatter created with
  a sample value so display units still abbreviate; tooltips and `aria-label`s use a
  full-precision formatter.
- **Bookmarks.** `selectionManager.registerOnSelectCallback()` re-derives the visual's
  selection from the identities Power BI supplies, so bookmarks and report-level clears
  are reflected in the calendar.
- **Conditional formatting.** The `heatmap.dayColor` property carries a `rule` with
  `inputRole: "mainMeasure"` and `output.selector: ["date"]`, and is enumerated with
  `propertyInstanceKind: { dayColor: 3 }` (ConstantOrRule). The resolved colour is read
  from `DataViewTableRow.objects[dateIdx].heatmap.dayColor`, defensively — the whole
  chain is absent when no rule is set. Colours are passed through `sanitizeColor()`
  before reaching a style attribute, as with every other colour in the visual.
- **Allow Interactions.** `host.allowInteractions` is checked before selection, keyboard
  activation and the context menu.
- **Aggregation fix.** Tooltip Measures were summed by parsing their formatted strings;
  aggregation now runs on raw numeric values.

---

## Release Notes — Accessibility (v1.1.0.0)

This release implements the accessibility behaviour that `capabilities.json` already
declared, and adds high-contrast support. No data-handling, licensing or network
behaviour changed.

**Keyboard operability** — `src/visual.ts`

The day grid previously declared `supportsKeyboardFocus: true` without keyboard handlers.
It now implements a standard grid interaction model:

- Roving `tabindex`: exactly one day cell carries `tabindex="0"`, the rest `-1`, so the
  grid is a single tab stop and does not trap the user.
- `ArrowLeft` / `ArrowRight` move one day; `ArrowUp` / `ArrowDown` move one week in month
  view and one day in week view; `Home` / `End` move to the first / last day of the week;
  `PageUp` / `PageDown` move one month (month view) or one week (week view).
- Navigating past the edge of the rendered range advances `currentDate`, re-renders and
  restores focus to the target day.
- `Enter` / `Space` calls `selectionManager.select()` on the focused day; `Ctrl`/`Cmd`
  passes `multiSelect = true`. `Escape` calls `selectionManager.clear()`.
- `Shift+F10` and the Context Menu key call `selectionManager.showContextMenu()`
  positioned on the focused cell.
- A visible focus ring is drawn in `style/visual.less` with `box-shadow`, so it does not
  collide with the inline `outline` used to mark a selected day.
- Tooltips are shown on `focus` and hidden on `blur`, so the Tooltip Measures field well
  is reachable without a pointer.

**Screen reader semantics** — `src/visual.ts`

- `role="grid"` on the calendar surface (with `aria-readonly="true"`), `role="rowgroup"`
  on the body, `role="row"` on each week, `role="columnheader"` on the day-name header
  and `role="gridcell"` on each day. Padding cells are `aria-hidden="true"`.
- Each day carries an `aria-label` built by `cellAriaLabel()`: full localised date, the
  measure value or "No data", the holiday name when present, and the event names.
- `aria-selected` is kept in sync with the selection; `aria-live="polite"` on the
  month/week label; `aria-pressed` on the Month/Week toggle; `aria-label` on the
  previous/next buttons; `role="list"` on the event category legend.

**High contrast** — `src/visual.ts`, `style/visual.less`

- `readHighContrast()` reads `host.colorPalette.isHighContrast` and, when active,
  `foreground`, `background` and `foregroundSelected`.
- In high contrast the visual stops encoding meaning in fill: `cellChrome()` returns the
  theme background for every day cell and re-encodes the heatmap intensity as border
  weight (1–4px, `hcBorderWidth()`) in the theme foreground. Today and the active view
  button are marked by a heavier border in `foregroundSelected`. Event badges and legend
  swatches switch to an outlined style. All text resolves through `fg()` / `accent()`.
- `@media (forced-colors: active)` lets the OS palette override the focus and selection
  rings outright; `@media (prefers-reduced-motion: reduce)` disables the button
  transition.

**Timezone correctness**

Day cell keys are parsed with `parseKey()`, which reads the year, month and day
components explicitly. `new Date("2025-03-04")` is parsed as UTC midnight and resolves to
the previous day in any negative UTC offset, which would have moved keyboard focus to the
wrong day for users west of UTC.

---

## Resubmission — Changes Made (v1.0.0.3)

This is a resubmission addressing the rejection under **Security requirement policies — XSS (Cross-Site Scripting)**.

**Issue reported:** The visual built its entire UI as HTML strings inserted via `innerHTML` with unescaped bucket values (Event Category, Event Name, Holiday Name, Main Measure). All four `innerHTML` assignments were wrapped in `/* eslint-disable powerbi-visuals/no-inner-outer-html */`, bypassing the required lint rule.

**Root cause:** The original rendering pipeline used template literal string concatenation to build HTML, then set `wrapper.innerHTML = htmlString`. Any user-controlled data value placed in an event category, event name, or holiday name field could inject arbitrary HTML/JS into the visual's DOM.

**Fix applied in `src/visual.ts`:**
- Removed all 4 `innerHTML` assignments and their corresponding `eslint-disable` comments. The `powerbi-visuals/no-inner-outer-html` lint rule now passes without suppression.
- Converted `buildMonthView()`, `buildWeekView()`, `buildSingleMonthGrid()`, and `buildCategoryLegend()` to return `HTMLElement` nodes instead of HTML strings. All DOM construction uses `document.createElement()`, `.textContent`, `.setAttribute()`, and `element.style.*`.
- All user-data text (event names, event categories, holiday names, measure formatted values) is assigned exclusively via `.textContent`, which the browser never interprets as markup.
- Added `sanitizeColor(val, fallback)`: validates that color values from the format pane match `#hex`, `rgb()`, or `rgba()` patterns before placing them in style attributes. Rejects any other string and returns the fallback.
- Added `sanitizeFont(val, fallback)`: strips characters that break CSS context (`;`, `<`, `>`, `{`, `}`, `\`, `"`, newlines) from font-family strings before use in style attributes.
- Added input validation in `parseDataView()`: rows with unparseable dates are skipped; event/holiday names have control characters (`\x00–\x1f`, `\x7f`) stripped; measure values are validated with `isFinite()` before use.
- `renderLandingPage()` and `showUpgradePrompt()` rebuilt entirely with DOM nodes — no string HTML.

**Verification:** Setting an Event Category or Event Name bucket value to `<script>alert('XSS')</script>` causes the visual to display that text literally in the badge/legend with no script execution.

---

## Resubmission — Changes Made (v1.0.0.1)

This is a resubmission addressing the rejection under **Content requirement policies — Altering size display not working**.

**Issue reported:** When the visual is resized to a smaller size, data (calendar rows) was getting hidden.

**Root cause:** The calendar grid used a fixed `min-height: 40px` on each day cell. With 5–6 week rows, the minimum height of the grid alone exceeded 240px. When the visual was resized below the total minimum (grid + navigation + header), the bottom rows overflowed and were clipped silently by `overflow: hidden` on the container.

**Fix applied in `src/visual.ts`:**
- Removed fixed `min-height` from all day cells. Cells now use `min-height: 0` and grow proportionally via CSS `flex: 1`, distributing the available height equally across all week rows regardless of the visual size.
- Added `min-height: 0` at every level of the flex chain (month container, week-rows wrapper, individual week row) so that CSS flex shrink works correctly through nested containers — this is a known requirement for flex shrink to propagate in column layouts.
- Changed outer wrapper from `overflow: auto` to `overflow: hidden` to prevent scrollbars on the visual surface.
- Added `flex-shrink: 0` to fixed UI elements (navigation bar, view toggle, day-name header row, category legend) so they never yield their space to the calendar grid, ensuring controls are always visible.
- Both Month view and Week view were updated with the same fix.

**Verification:** After the fix, resizing the visual to any size (including very small) keeps all calendar rows visible and proportionally distributed within the available space. Content inside each cell clips cleanly at the cell boundary via `overflow: hidden`.

---

## Source Code

**Certification branch:** `certification`  
GitHub: https://github.com/tinocallarisa-web/calendar/tree/certification

The `certification` branch contains the exact source used to build the submitted `.pbiviz`. It has no build artifacts (`node_modules/`, `dist/`, `.tmp/` are in `.gitignore` and not tracked).

---

## Required URLs

| Resource | URL |
|---|---|
| Support | https://tinocallarisa-web.github.io/calendar/support.html |
| Privacy Policy | https://tinocallarisa-web.github.io/calendar/privacy.html |
| Terms of Service | https://tinocallarisa-web.github.io/calendar/terms.html |
| GitHub repo | https://github.com/tinocallarisa-web/calendar |
| Demo video | https://www.youtube.com/watch?v=FUELmlkAGNI |

---

## Capabilities Flags

All five required flags are present in `capabilities.json`:

```json
"supportsHighlight": true,
"supportsSynchronizingFilterState": true,
"supportsLandingPage": true,
"supportsKeyboardFocus": true,
"supportsMultiVisualSelection": true,
"privileges": []
```

---

## Data Roles

| Role name | Kind | Required | Description |
|---|---|---|---|
| `date` | Grouping | Yes | Date column, one row per day |
| `mainMeasure` | Measure | Yes | KPI measure driving heatmap intensity |
| `secondaryMeasures` | Measure | No | Additional tooltip-only measures (multiple allowed) |
| `eventName` | Grouping | No | Event badge label text |
| `eventCategory` | Grouping | No | Event grouping for color coding |
| `holidayName` | Grouping | No | Holiday label (date from Date role) |

---

## License Validation

- License is validated via the official `IVisualLicenseManager` API (`options.host.licenseManager`) provided by the Power BI host runtime.
- The Visual calls `licenseManager.getAvailableServicePlans()` once, deferred after the first render.
- License resolution is non-blocking: the visual renders immediately in Free tier mode while the license check completes asynchronously. There is no spinner or blocked state.
- The Plan ID used is `calendar-tcviz`, matching the plan configured in Partner Center.
- Pro is granted when `plan.spIdentifier === "calendar-tcviz"` and the state is `Active` (1) or `Warning` (2, the payment grace period). The 30-day trial configured on the Partner Center plan resolves as Active.
- `isLicenseUnsupportedEnv` and `isLicenseInfoAvailable` are honoured: where the licence cannot be read (Publish to Web, embedding, export) the Free experience renders and no purchase prompt is shown.
- **No licensing UI of its own.** When a Free user clicks Week or sets a Pro option, the visual calls Power BI's `notifyFeatureBlocked` and `notifyLicenseRequired`, which carry the purchase path, and clears them with `clearLicenseNotification` when the licence resolves to Pro. There is no license key field.
- No external network calls are made by the Visual for license validation or any other purpose.

---

## Privacy & Network

**The Visual makes zero external network calls.** No telemetry, no analytics, no CDN loads.

- All fonts used are system fonts: `Segoe UI, system-ui, sans-serif` — resolved locally by the browser.
- All data (dates, measures, event names, categories, holiday names) is processed in-memory within the Power BI sandbox.
- No data is stored beyond the render call lifetime.
- Format settings are stored in the `.pbix` file by the Power BI platform using standard `objects` storage.

---

## Features — Free Tier

Available without a Pro license or after trial expiry:

- Month view (1 month at a time)
- KPI heatmap with configurable min/max/null colors
- 1 event badge per day
- Automatic event category color palette (non-configurable)
- Holiday name overlay (displayed as colored day number)
- Tooltip measures (displayed in Power BI native tooltip)
- Cross-page filtering via `selectionManager`
- Right-click Power BI context menu
- Format pane: Calendar, Heatmap Colors (including the fx Day Color rule), Day Number. Pro cards and options are visible and marked "[Pro]"; they apply only with a licence.

---

## Features — Pro Tier ($9.99/month, 30-day trial)

All Free features plus:

- Multi-month view: 1–12 months side by side
- Week view
- Configurable max events per day (month view)
- Per-category event colors (up to 8 categories, color legend rendered in-visual)
- Single global event color override toggle
- Full format pane: Measure Labels section, View Buttons section, Event Category Colors section
- Event badge text color and font size

---

## Testing Instructions

### Free Tier Test

1. Install the visual in Power BI Desktop
2. Connect: Date column → Date, any measure → Main Measure
3. Verify heatmap renders with color gradient
4. Connect Event Name column → Event Name; verify at most 1 badge per day is shown
5. Click Week; verify the calendar stays in month view and Power BI shows its own licence notification (no toast drawn by the visual)
6. Open Format pane; verify Measure Labels [Pro], View Buttons [Pro] and Event Category Colors [Pro] are visible
7. Set Calendar > Months to Display [Pro] = 3; verify it stays at 1 month and the notification appears
8. Set Calendar > Default View = Week [Pro]; verify month view still renders

### Pro Tier Test (submitted package with an active "calendar-tcviz" plan, or the 30-day trial)

1. Install the submitted package with an active plan or trial
2. Verify no licence notification is shown
3. Verify Week view is accessible and renders correctly
4. Set Months to Display = 3; verify three months render side by side
5. Open Format pane; verify Measure Labels, View Buttons, and Event Category Colors sections are visible
6. In Event Category Colors, change Category 1 color; verify it updates the badge and legend in-visual
7. Toggle "Single color for all events" ON; verify "Event Color" picker appears and overrides category colors
8. Toggle OFF; verify per-category colors are restored

### Resize Test (addresses rejection reason)

1. Add the visual to a report page with Date and Main Measure connected
2. Resize the visual to approximately half of its default size (drag corner inward)
3. Verify all calendar rows (weeks) remain visible — no rows hidden at the bottom
4. Resize to a small size (~200×200px); verify the grid compresses but does not hide rows
5. Switch to Week view (Pro build) and repeat steps 2–4; verify all 7 day columns remain visible
6. Restore to default size; verify the visual returns to normal layout

### Cross-filtering Test

1. Click any calendar day; verify other visuals on the page filter to that date
2. Click an empty area to deselect; verify filters clear
3. Right-click a day; verify Power BI context menu appears

---

## Build Verification Checklist

- [ ] `isPro` resolved by `licenseManager`, not hardcoded
- [ ] `guid` has no `_test` suffix
- [ ] `npx tsc --noEmit` passes cleanly
- [ ] No `console.log`, `debugger`, or debug-only blocks in source
- [ ] `capabilities.json` has all 5 required flags + `"privileges": []`
- [ ] `pbiviz.json` version matches `package.json` version
- [ ] `assets/icon.png` exists
- [ ] `privacy.html`, `terms.html`, `support.html` accessible at their published URLs
- [ ] No `innerHTML` assignments anywhere in `src/visual.ts`
- [ ] No `eslint-disable powerbi-visuals/no-inner-outer-html` comments in source
- [ ] ESLint passes without suppressions (`npx pbiviz package` lint step clean)
- [ ] XSS test: set Event Category = `<script>alert(1)</script>` — text must display literally, no alert fires
