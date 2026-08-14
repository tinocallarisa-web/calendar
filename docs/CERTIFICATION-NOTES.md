# Certification Notes — Calendar Events Heatmap v1.0.0.0

**Visual GUID:** `calendarTCViz022303184F264C8B9ACE6A13E838FFEB`  
**Plan ID:** `calendar-tcviz`  
**Publisher:** TCViz (tinocallarisa@gmail.com)  
**Version:** 1.0.0.0  
**Submission date:** (fill on submission)

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
- The Visual calls `licenseManager.getAvailableServicePlans()` asynchronously on each `update()`.
- License resolution is non-blocking: the visual renders immediately in Free tier mode while the license check completes asynchronously. There is no spinner or blocked state.
- The Plan ID used is `calendar-tcviz`, matching the plan configured in Partner Center.
- The Visual checks `plan.spIdentifier === SP_IDENTIFIER && plan.state === "Active"` to set Pro mode.
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
- Basic format pane: Calendar section, Heatmap Colors, Day Number

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
5. Attempt to switch to Week view; verify "Week 🔒" button shows and clicking it displays an upgrade toast (no navigation occurs)
6. Open Format pane; verify that Measure Labels, View Buttons, and Event Category Colors sections are NOT shown
7. Verify multi-month selector in Format pane > Calendar > Months to Display has no effect (stays at 1 month)

### Pro Tier Test (use build-test.js for local testing)

1. Run `node build-test.js` to produce `_test.pbiviz` with `isPro` forced to `true`
2. Install the `_test` build in Power BI Desktop
3. Verify Week view is accessible and renders correctly
4. Set Months to Display = 3; verify three months render side by side
5. Open Format pane; verify Measure Labels, View Buttons, and Event Category Colors sections are visible
6. In Event Category Colors, change Category 1 color; verify it updates the badge and legend in-visual
7. Toggle "Single color for all events" ON; verify "Event Color" picker appears and overrides category colors
8. Toggle OFF; verify per-category colors are restored

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
