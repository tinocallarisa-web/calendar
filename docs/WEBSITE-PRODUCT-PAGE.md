# Calendar Events Heatmap — Website Product Page Content

**Version 1.3.0.0 · TCViz**

Source for the product page on tcviz.com (`src/data.jsx` in the tcviz-web repo — this file does not update the web
by itself). Rules: no comparisons with other marketplace visuals, no certification claims, no figures that have
not been measured; prices only as shown on the AppSource listing.

---

## TAB 1: OVERVIEW

### Your KPI and the events that explain it, on the same day

A daily measure on a line chart hides the question that matters: why was that Tuesday so good? The answer is usually
on the calendar — a promotion, a campaign, a public holiday — and it lives in another report.

Calendar Events Heatmap puts both in one place. Each day is coloured by your measure, and the events that explain it
sit on the day they happened. Click a day, or drag across a week, and the whole report filters to it.

**Built for people who need to explain the numbers, not just display them.**

---

### New in 1.3

- **Week and month totals (Pro)** — a Σ column for each week, the month total under the grid, the total under each
  month in the year view and the week total in the week view. Sum or daily average, in the measure's own format.
- **Six collection styles (Pro)** — Boardroom, Ledger, Editorial, Signal, Aurora and Terrace, the same styles as the
  other TCViz visuals.
- **Report theme style (free)** — the heat scale and text take your report theme's colours.
- **Accessibility card** — high contrast on demand, focus outline colour and width, minimum text size.
- **Text that scales with the visual** — numbers and labels shrink with a small tile instead of overflowing.
- **Report tooltip pages filtered to the whole day**, with every event of that day.

---

### How it works

Connect your date column and a measure. The calendar colours each day by the measure — your heatmap. Add event name,
category and holiday columns and the events appear on their day as colour marks (labels in the week view), one colour
per category, with a legend that names each colour.

---

### Who is it for

**Retail & FMCG teams** running promotions, seasonal campaigns and price changes — and needing to see them against
daily sales, also in 4-4-5 fiscal weeks.

**Marketing teams** managing campaigns — seeing results in the context of what ran that day.

**Operations teams** tracking incidents, closures or shift coverage alongside public holidays.

**Any analyst** who has had to explain why a number is what it is on a specific date.

---

### At a glance

- Free tier, complete month calendar
- 30-day free Pro trial on AppSource
- Works in Power BI Desktop, Power BI Service, embedded reports and the mobile apps
- No external network calls — your data stays in Power BI
- Twelve languages

---

## TAB 2: FEATURES

### Free

**KPI heatmap** — ten colour schemes (Viridis and Cividis colour-blind safe) or your own minimum and maximum, a colour
legend at the top or the bottom, and Color Rules: up to three thresholds, each with its colour.

**Style** — Report theme and the Classic, Clean, Tiles, Minimal and TCViz templates. A template only fills what you
have not set yourself.

**Events and holidays** — colour marks in five palettes (Vivid, colour-blind safe, by default); one event shown per day
with a count of the rest. Click a category in the legend to hide its marks without changing the day values. Holidays
marked, with their name in the tooltip.

**Filtering** — click a day to cross-filter, Ctrl+click to add, drag or Shift+click for a date range. Bookmarks
restore the selection; Edit interactions is respected; right-click opens the Power BI context menu.

**Navigation** — drill up and down between month and year, a Today button, ISO or US week numbers, weeks starting on
Monday or Sunday.

**Fiscal calendars** — by calendar month, or in 4-4-5, 4-5-4 and 5-4-4 weeks.

**Tooltips** — every Tooltip Measure, and report tooltip pages filtered to the whole day.

**Number formats** — each measure's format string from the model, dynamic format strings included, so labels match
the rest of your report.

**Accessibility** — keyboard navigation, screen-reader labels, high contrast (follow Windows or On), focus outline and
minimum text size.

**Setup guide and format on the canvas** — in edit mode, a guide ticks off each field as you add it; in format mode,
click a day, a number or the legend to format it.

---

### Pro (30-day free trial on AppSource)

**Year and week views** — the twelve months in miniature, or seven large days with every event written out.

**Up to 12 months side by side** in the month view.

**Week and month totals** — sum or daily average.

**Six collection styles** — Boardroom, Ledger, Editorial, Signal, Aurora and Terrace.

**Measure switching** — with measures in Tooltip Measures, the reader chooses which one colours the days.

**Several events per day**, a single colour for all events, and event text colour and size.

**Your own colours** for each event category (up to 8), the measure labels and the view buttons.

While you edit without a licence, every Pro feature you turn on is drawn working on your own data under a
"Pro preview" watermark that names it. Reading view shows the free result.

---

### Free vs Pro Comparison

| Feature | Free | Pro |
|---|---|---|
| Month view | 1 month | 1–12 months |
| Year view and week view | — | ✅ |
| Week and month totals | — | ✅ |
| Report theme style and 5 templates | ✅ | ✅ |
| 6 collection styles | — | ✅ |
| KPI heatmap, colour schemes, Color Rules, legend | ✅ | ✅ |
| Events per day | 1 + count of the rest | Configurable |
| Event palettes | ✅ | ✅ |
| Per-category event colours set by hand | — | ✅ |
| Holidays, tooltip measures, report tooltip pages | ✅ | ✅ |
| Date-range filtering, drill, week numbers, Today | ✅ | ✅ |
| Fiscal calendars (months and 4-4-5) | ✅ | ✅ |
| Measure switching | — | ✅ |
| Measure label and view button styling | Default | ✅ |
| Accessibility card, keyboard, screen reader | ✅ | ✅ |
| Setup guide, format on the canvas, 12 languages | ✅ | ✅ |

---

## TAB 3: TECHNICAL

### Field Wells

| Field | Kind | Required | Notes |
|---|---|---|---|
| Date | Grouping | Yes | Date column, or the automatic date hierarchy (Year, Quarter, Month, Day) |
| Main Measure | Measure | Yes | Colours each day |
| Tooltip Measures | Measure | No | Shown on hover; with Pro, any of them can colour the calendar |
| Event Name | Grouping | No | The event on that day |
| Event Category | Grouping | No | One colour per category; 8 distinct colours |
| Holiday Name | Grouping | No | Marks the day as a holiday |

### Data Requirements

Since 1.3.0.0 the visual reads the data as a matrix (date → event → category → holiday), up to 30,000 rows. Events
and holidays use the same date as the measure. Sales and events can live in two tables related by date; *Rows of the
same day → Automatic* counts a repeated day value once.

### Power BI Compatibility

- Power BI Desktop, Power BI Service, Power BI Embedded, Power BI Mobile
- API version: 5.11.1

### Privacy & Network

Zero external network calls. No telemetry. No analytics. Settings are stored in the report by Power BI; the visual
saves its own settings only when you click. See the
[Privacy Policy](https://tinocallarisa-web.github.io/calendar/privacy.html).

### Licensing

Freemium via Microsoft AppSource. The licence is read through the official `IVisualLicenseManager` API provided by the
Power BI host — no external licence server. Plan ID: `calendar-pro` (licences on the earlier `calendar-tcviz` plan keep working).

### Support

- Docs & FAQ: https://tinocallarisa-web.github.io/calendar/support.html
- Changelog: https://tinocallarisa-web.github.io/calendar/changelog.html
- Bug reports: https://github.com/tinocallarisa-web/calendar/issues
- Email: support@tcviz.com

---

## TAB 4: CHANGELOG

Full history: https://tinocallarisa-web.github.io/calendar/changelog.html

### v1.3.0.0 — 2026-11-24
- Week and month totals (Pro); six collection styles (Pro); Report theme style (free)
- Accessibility card: high contrast on demand, focus outline, minimum text size
- Text that scales with the visual; dynamic format strings in tooltips, labels and totals
- Fixed: report tooltip pages on days with events now open filtered to the whole day; with a date hierarchy they no
  longer match every day with the same number; the tooltip no longer flickers; the setup guide no longer covers small
  tiles
- Changed: the data is read as a matrix — a bookmark saved earlier with a day selected must be saved again

### v1.2.1.2 — 2026-10-25
- Start screen of the TCViz series; Try Pro buttons in the setup guide
- Fixed: date hierarchies with month names in other languages; Pro settings left at their default; Calendar → View

### v1.2.0.0 — 2026-10-12
- Year view (Pro), drill up and down, Today, week numbers, date-range filtering
- Measure switching (Pro), fiscal periods in 4-4-5 weeks, Color Rules, colour schemes, style templates
- Events as colour marks, event palettes, setup guide, format on the canvas, twelve languages
