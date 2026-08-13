# Changelog — Calendar Events Heatmap

All notable changes to this project are documented in this file.

---

## [1.0.0.0] — 2025-08-01

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
