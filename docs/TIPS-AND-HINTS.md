# Calendar Events Heatmap — Tips & Hints

**Version 1.0.0.0 · TCViz**  
Demo video: https://www.youtube.com/watch?v=FUELmlkAGNI

---

## Getting Started

Calendar Events Heatmap is a Power BI custom visual that combines a KPI heatmap with event badges in a single calendar surface. You can see how your measures (sales, revenue, traffic) relate to promotions, campaigns, and holidays — all on the same day cell.

**Minimum to get a working calendar:**

1. Add the visual to the report canvas
2. Drag a **Date** column to the **Date** field well
3. Drag a numeric measure to the **Main Measure** field well

The heatmap is now live. Add events and holidays to get the full picture.

> ⚠️ **Auto Date/Time issue:** If your dates show as a year number (2024) instead of full dates, click the dropdown arrow next to your Date field and select **Date** (not Date Hierarchy). You can also disable Auto Date/Time globally in File → Options → Current file → Data Load.

---

## Field Wells

| Field | Required | What it does |
|---|---|---|
| **Date** | Yes | Calendar days. One row per day in your data. |
| **Main Measure** | Yes | Drives heatmap color. Higher = darker color. |
| **Tooltip Measures** | No | Extra measures shown in the hover tooltip only. Add as many as needed. |
| **Event Name** | No | Text shown as the event badge on the calendar day. |
| **Event Category** | No | Groups events by type. Each category gets its own color. Up to 8 categories. |
| **Holiday Name** | No | Holiday text. Uses the Date column for the date — no separate date column needed. |

**Key design note:** All fields share the same Date column. The recommended data model is a single merged/expanded table where each row represents one calendar day, with the event name, category, and holiday name already joined to that day's date.

**Connecting events:** Your events table should be expanded per-day before connecting to the visual. If a promo runs Jan 10–15, you need 6 rows (one per day) with the same event name and category. The visual does not expand date ranges internally.

---

## Format Pane Settings

### Calendar
- **Default View:** Start in Month or Week view. The view the user selects in the report is remembered — this setting only applies on first load.
- **Months to Display** *(Pro)*: Show 1–12 months side by side. Great for quarterly reviews.
- **Week Starts On:** Sunday or Monday.
- **Fiscal Calendar:** Enable to offset the calendar to your fiscal year.

### Heatmap Colors
- **Min Color / Max Color:** The gradient endpoints. Set to your brand colors for a polished look.
- **No Data Color:** Days with no measure data use this color. Setting it close to Min Color gives a cleaner look.

### Day Number
- Style the day numbers independently from the measure labels.
- **Weekend Color / Holiday Color:** Call out Saturdays, Sundays, and holidays with distinct colors.

### Events *(some settings Pro)*
- **Show Events:** Toggle all event badges on or off.
- **Max Events per Day** *(Pro)*: Limit how many badges show per cell in month view.
- **Single color for all events** *(Pro)*: When ON, all badges use the "Event Color" picker. When OFF, categories each get their own configurable color.

### Event Category Colors *(Pro)*
One color picker per category (labeled Category 1 through Category 8), in order of first appearance in the data. A color legend is automatically rendered in the visual below the Month/Week buttons.

### Measure Labels / View Buttons *(Pro)*
Full font and color control for the measure value labels and the Month/Week navigation buttons.

---

## Free vs Pro

| Feature | Free | Pro ($9.99/mo) |
|---|---|---|
| Month view | 1 month | 1–12 months |
| Week view | — | ✅ |
| KPI heatmap | ✅ | ✅ |
| Event badges | 1/day | Configurable |
| Per-category event colors | Auto palette | ✅ Configurable |
| Holiday overlay | ✅ | ✅ |
| Tooltip measures | ✅ | ✅ |
| Cross-page filtering | ✅ | ✅ |
| Full format pane | Basic | ✅ Full |
| 30-day full trial | ✅ All Pro features | — |

To unlock Pro: click the lock icon or visit Microsoft AppSource to purchase the plan.

---

## Tips & Best Practices

**Multi-month comparison:** Set Months to Display to 3 or 6 to compare quarterly patterns at a glance. Combine with a year slicer for year-over-year comparison.

**Category color strategy:** Put your most important event type first in the data so it maps to Category 1 — then assign it your most prominent brand color.

**Clean tooltips:** Add your secondary KPIs (margin, units) to the Tooltip Measures field instead of the main table. They'll appear in the hover tooltip without cluttering the badge.

**Fiscal calendars:** If your fiscal year starts in April, enable Fiscal Calendar and set Fiscal Year Start Month to 4. All month labels and navigation will use fiscal naming.

**Holiday overlap:** If a day is both a holiday and has events, the holiday color applies to the day number and event badges still show. You can distinguish holidays visually by using a bright Holiday Color in the Day Number section.

**Performance tip:** For large datasets (multi-year with daily granularity), filter your Date table to the reporting period in Power Query before connecting. The visual renders all rows in the current dataView.

---

## Example Configurations

### Retail Promotion Calendar
- Date → store calendar date  
- Main Measure → daily sales revenue  
- Event Name → promotion name  
- Event Category → promotion type (Discount, Bundle, Clearance, Campaign)  
- Holiday Name → public holidays  
- Format: 3 months, Max Color = orange brand color, Category colors = traffic-light palette

### Marketing Campaign Tracker
- Date → campaign date  
- Main Measure → daily website visits  
- Tooltip Measures → conversions, spend  
- Event Name → campaign name  
- Event Category → channel (Paid, Organic, Email, Social)  
- Format: Week view, single color per category matching channel brand colors

### Operations Shift Calendar
- Date → work date  
- Main Measure → incidents count (higher = darker = worse)  
- Event Name → incident type  
- Holiday Name → public holidays (affects staffing)  
- Format: Min Color = green, Max Color = red (reverse heatmap)

---

## Troubleshooting

**Events appear on wrong days**  
Your events data likely uses a date range (start/end). Expand the table per-day in Power Query before connecting to the visual.

**Category colors reset after saving**  
Check that the Event Category field is still connected and that category values haven't changed. Colors are stored by position (Category 1, 2, ...) based on first-occurrence order in the data.

**Heatmap shows all days the same color**  
Your measure may have zero variance. Check the measure formula or try switching Min/Max colors to see the gradient.

**Slicers stop working after clicking a day**  
Click on an empty area of the visual to deselect. Day selection activates cross-filtering; deselecting restores slicer-driven filters.

**Clicking Week keeps month view**  
Week view is a Pro feature. Power BI shows its own notice with the option to start the 30-day trial or buy Pro on Microsoft AppSource.
