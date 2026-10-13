# Calendar Events Heatmap — Tips & Hints (v1.2.0.0)

Demo video: https://www.youtube.com/watch?v=FUELmlkAGNI  
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
events table every day (empty event on days without one), or merge
them in Power Query. Rows of the same day = Automatic counts the
day's value once.



## Views And Navigation

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
- A slicer on Event Category removes the days without that category.
  Use the legend, or Edit interactions > None on the calendar.



## Colour

- Color scheme: ten palettes, Viridis and Cividis colour-blind safe.
- Color Rules: paint the days above or below your thresholds.
- Style template: Classic, Clean, Tiles, Minimal, TCViz.
- Show events as: colour marks (month, year) or labels (week).



## Fiscal Calendars

Calendar > Fiscal Calendar on, then the start month. The fiscal year
is named after the year it ends in (Oct 2026 starts FY2027).
Fiscal Periods = 4-4-5 / 4-5-4 / 5-4-4 shows periods of whole weeks.



## Tips

- Months to Display is a maximum: only the months that fit are drawn.
- Small visual? Legends and day values step aside; the colour stays.
- In format mode, click a day, its number or the legend to format it.
- Esc clears the selection; Shift+Enter selects a range by keyboard.



## Free And Pro

Free: month view, heatmap, schemes, rules, templates, holidays, one
event per day plus a count, date ranges, fiscal and 4-4-5 calendars,
week numbers, setup guide, 12 languages.
Pro: year and week views, up to 12 months, measure switching, several
events per day, category, label and button colours.
Without a licence, Pro features show working in edit mode under a
"Pro preview" watermark.

Questions: github.com/tinocallarisa-web/calendar/discussions
Support: support@tcviz.com

