# Calendar Events Heatmap — Website Product Page Content

**Version 1.0.0.0 · TCViz**

---

## TAB 1: OVERVIEW

### The only Power BI calendar that shows your KPIs and your events together

Most calendar visuals make you choose: heatmap *or* events. Calendar Events Heatmap gives you both on the same day cell.

See at a glance which days had the highest sales — and whether it was because of a promotion, a campaign, or a public holiday. No more cross-referencing two separate visuals. No more guessing why last Tuesday spiked.

**Built for people who need to explain the numbers, not just display them.**

---

### How it works

Connect your date column and a measure. The calendar colors each day by measure intensity — your heatmap. Then connect your events table and see colored badges appear on the same cells, labeled with the event name, grouped by category, each category with its own color.

One visual. One story.

---

### Who is it for

**Retail & FMCG teams** running promotions, seasonal campaigns, and price changes — and needing to correlate them with daily sales.

**Marketing teams** managing multiple campaigns across channels — needing to see reach, spend, and conversions in context of what ran that day.

**Operations teams** tracking incidents, shift coverage, or SLA breaches alongside planned maintenance windows and public holidays.

**Any analyst** who has ever had to explain why a number is what it is on a specific date.

---

### What makes it different

| | Calendar Events Heatmap | Standard calendar visuals | Gantt / timeline visuals |
|---|---|---|---|
| KPI heatmap | ✅ | Rarely | ❌ |
| Event badges | ✅ | Sometimes | ✅ |
| Both together | ✅ | ❌ | ❌ |
| Week view | ✅ Pro | Rarely | ❌ |
| Cross-page filtering | ✅ | Sometimes | Sometimes |
| Per-category colors | ✅ Pro | Rarely | ❌ |

---

### At a glance

- Free tier available — no credit card, no sign-up
- 30-day full Pro trial on first install
- Pro: $9.99/month via Microsoft AppSource
- Works in Power BI Desktop, Power BI Service, embedded reports
- No external network calls — your data stays in Power BI

---

## TAB 2: FEATURES

### Core (Free + Pro)

**KPI Heatmap**
Gradient coloring from min to max across all visible days. Instant pattern recognition — peaks, dips, and dead days are visible at a glance. Fully configurable min, max, and no-data colors.

**Event Badges**
Event names appear as colored badges on calendar day cells. Up to 8 event categories, each with its own color. A color legend is rendered automatically in the visual — no external legend needed.

**Holiday Overlay**
Connect a holiday name column and holiday days are immediately highlighted with a configurable color on the day number. Works alongside event badges — no conflict.

**Tooltip Measures**
Add multiple secondary measures to the Tooltip Measures field. They appear in the Power BI native tooltip on hover, keeping the visual clean without losing detail.

**Cross-Page Filtering**
Click any day to filter all other visuals on the page to that date. Click an empty area to deselect. Right-click any day to access the Power BI context menu (drill through, spotlight, etc.).

**Month Navigation**
Previous/Next buttons to navigate months. Keyboard-accessible.

---

### Pro Features ($9.99/month · 30-day free trial)

**Multi-Month View**
Display 1 to 12 months side by side. Ideal for quarterly or seasonal analysis. Combine with a year slicer for year-over-year comparison.

**Week View**
Switch to a week-level calendar showing one week at a time, with the same heatmap and event badges. Perfect for operations and shift-level analysis.

**Per-Category Event Colors**
Up to 8 event categories, each with a fully configurable color picker in the Format pane. A color legend with category names is rendered below the Month/Week navigation buttons.

**Configurable Events per Day**
Control how many event badges appear per day cell in month view. Free tier shows 1; Pro is configurable.

**Full Format Pane**
- Measure Labels: font, size, color
- View Buttons: active and text color
- Event Category Colors: one picker per category (up to 8)
- Event badges: text color and font size

---

### Free vs Pro Comparison

| Feature | Free | Pro ($9.99/mo) |
|---|---|---|
| Month view | 1 month | 1–12 months |
| Week view | 🔒 | ✅ |
| KPI heatmap | ✅ | ✅ |
| Event badges | 1/day | Configurable |
| Per-category event colors | Auto palette | ✅ Configurable |
| Holiday overlay | ✅ | ✅ |
| Tooltip measures | ✅ | ✅ |
| Cross-page filtering | ✅ | ✅ |
| Context menu (right-click) | ✅ | ✅ |
| Measure label formatting | Default | ✅ |
| View button styling | Default | ✅ |
| Event badge text styling | Default | ✅ |
| 30-day full trial | — | ✅ No card required |

---

## TAB 3: TECHNICAL

### Field Wells

| Field | Kind | Required | Notes |
|---|---|---|---|
| Date | Grouping | Yes | Date column, one row per day |
| Main Measure | Measure | Yes | Drives heatmap color intensity |
| Tooltip Measures | Measure | No | Multiple measures; tooltip display only |
| Event Name | Grouping | No | Badge label text |
| Event Category | Grouping | No | Color grouping; up to 8 unique values used |
| Holiday Name | Grouping | No | Holiday label; date from the Date role |

### Data Requirements

The visual uses a table dataViewMapping. All fields must share a common date key. The recommended pattern is a pre-expanded table where each row represents one day × one event. The visual does not expand date ranges internally.

### Power BI Compatibility

- Power BI Desktop
- Power BI Service (cloud)
- Power BI Embedded
- Power BI Mobile (read-only rendering)
- API version: 5.11.0

### Performance

Designed for typical reporting datasets (daily granularity, 1–3 years of data). For very large datasets (multi-year + dense event tables), pre-filter to the reporting period in Power Query.

### Privacy & Network

Zero external network calls. No telemetry. No analytics. All data is processed in-memory within the Power BI sandbox. Format settings are stored in the `.pbix` file by the Power BI platform. See [Privacy Policy](https://tinocallarisa-web.github.io/calendar/privacy.html).

### Licensing

Freemium model via Microsoft AppSource. License validation uses the official `IVisualLicenseManager` API provided by the Power BI host — no external license server. The plan ID is `calendar-tcviz`.

### Certification

Submitted for Microsoft Power BI certification. The visual has no external dependencies, no `localStorage` usage, no DOM manipulation outside the visual container, and passes `npx tsc --noEmit` cleanly.

### Dependencies

No external JavaScript libraries. No npm packages beyond the Power BI SDK. Fonts: system fonts (`Segoe UI, system-ui, sans-serif`).

### Support

- Docs & FAQ: https://tinocallarisa-web.github.io/calendar/support.html
- Bug reports: https://github.com/tinocallarisa-web/calendar/issues
- Email: support@tcviz.com

---

## TAB 4: CHANGELOG

### v1.0.0.0 — 2025-08-01 (Initial Release)

**Added**
- Month view with KPI heatmap (configurable min/max/null colors)
- Event badges with automatic per-category color palette
- Per-category event colors with configurable color pickers (up to 8 categories) — Pro
- Color legend rendered in-visual below navigation buttons
- Single global color mode for events (toggle in Format pane)
- Week view — Pro
- Multi-month view: 1–12 months side by side — Pro
- Holiday overlay via Holiday Name field
- Tooltip measures (multiple secondary measures in native Power BI tooltip)
- Cross-page filtering via selectionManager
- Right-click Power BI context menu support
- Freemium gating: Free (1 month, 1 event/day) vs Pro ($9.99/month, 30-day trial)
- Full format pane: Calendar, Heatmap Colors, Day Number, Events, Measure Labels (Pro), View Buttons (Pro), Event Category Colors (Pro)
- Fiscal calendar support
- Configurable week start (Sunday / Monday)
- Keyboard accessibility
