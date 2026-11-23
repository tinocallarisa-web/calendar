# Calendar Events Heatmap — Tips & Hints (v1.3.0.0)

Demo video: https://www.youtube.com/watch?v=CJ62plGb6QE  
Same content as `TIPS-AND-HINTS-PLAIN.txt`, which is the one to paste into Power BI text boxes.

## Getting Started

Calendar Events Heatmap colours each day by your measure and puts
promotions, campaigns and holidays on the day they happened.

  - Drag a Date column to Date and a measure to Main Measure.
  - Follow the setup guide inside the visual: it ticks off each
    optional field as you add it and offers the style templates.
    It only shows while you edit; reopen it from
    Format > Style template > Setup guide.

! If the year looks wrong, click the dropdown next to your Date
  field and choose "Date" (not Date Hierarchy).

## Field Wells

Date .............. Required. One row per day.
Main Measure ...... Required. Colours each day.
Tooltip Measures .. Optional. More figures on hover; with Pro, the
                    Measure selector can show any of them.
Event Name ........ Optional. The event on that day.
Event Category .... Optional. One colour per category, with legend.
Holiday Name ...... Optional. Marks the day as a holiday.

All fields share the Date column: expand each event to one row per
day before connecting it.

Sales and events in two tables? Relate them by Date and give the
events table every day x every category, with an empty event where
there is none. A category slicer then keeps every day, and Rows of
the same day = Automatic counts the day's value once.

## Views and Navigation

Month ............. One month, or up to 12 side by side (Pro).
Year (Pro) ........ The twelve months in miniature.
Week (Pro) ........ Seven large days with every event written.
Click the title to go up a level, a month name or a week number to
go down. Today jumps to the current date.

## Filtering

- Click a day to filter the page; Ctrl+click adds.
- Drag across days, or Shift+click, to filter by a date range.
- Click empty space to clear.
- Click a category in the event legend to hide its marks. The day
  values and the report do not change. Saved with the report, not
  with bookmarks (Power BI bookmarks keep filters and selection).
- A slicer on Event Category removes the days without that category,
  unless the events table has every day x every category (above).

## Colour and Style

- Color scheme: ten palettes, Viridis and Cividis colour-blind safe.
- Color Rules: paint the days above or below your thresholds.
- Style template: Report theme (the report's own colours), Classic,
  Clean, Tiles, Minimal and TCViz are free. Boardroom, Ledger,
  Editorial, Signal, Aurora and Terrace (Pro) change background,
  text, empty days and type, as in the other TCViz visuals.
- Show events as: colour marks (month, year) or labels (week).

## Week and Month Totals (Pro)

Format > Totals > Week and month totals on.
- Month view: a Σ column at the end of each week and the month
  total under the grid.
- Year view: the total under each month. Week view: the week total.
- Total as = Sum, or Daily average for measures that should not be
  added up (prices, rates, averages).
Totals use the measure's own number format.

## Tooltips and Report Page Tooltips

- Hover a day: date, value, holiday, events and Tooltip Measures.
- Report page tooltip: build a tooltip page, then in the visual go to
  Format > General > Tooltips > Type = Report page and pick it. The
  page is filtered to the day under the pointer, with every event of
  that day, also with a Date Hierarchy.

## Fiscal Calendars

Calendar > Fiscal Calendar on, then the start month. The fiscal year
is named after the year it ends in (Oct 2026 starts FY2027).
Fiscal Periods = 4-4-5 / 4-5-4 / 5-4-4 shows periods of whole weeks.

## Tips

- Months to Display is a maximum: only the months that fit are drawn.
- Small visual? Text scales down with it, and legends and day values
  step aside; the colour stays. Format > Accessibility > Minimum text
  size sets the floor.
- Accessibility: High contrast = On forces the high-contrast look;
  focus outline colour and width for keyboard users.
- Number formats, dynamic format strings included, come from the
  measure.
- In format mode, click a day, its number or the legend to format it.
- Esc clears the selection; Shift+Enter selects a range by keyboard.
- On a Mac (Power BI in the browser), use Cmd wherever these tips
  say Ctrl.

## Free and Pro

Free: month view, heatmap, schemes, rules, Report theme and the five
templates, holidays, one event per day plus a count, date ranges,
fiscal and 4-4-5 calendars, week numbers, report page tooltips,
accessibility, setup guide, 12 languages.
Pro: year and week views, up to 12 months, week and month totals,
the six collection styles, measure switching, several events per day,
category, label and button colours.
Without a licence, Pro features show working in edit mode under a
"Pro preview" watermark.

Questions: github.com/tinocallarisa-web/calendar/discussions
Support: support@tcviz.com
