# AppSource listing — Calendar Events Heatmap 1.2.0.0

Copy ready to paste into Partner Center, English only. **The marketplace description is the
documentation most people read** — update it on every release.

**Listing URL:** https://marketplace.microsoft.com/en-us/product/power-bi-visuals/tino_callarisa.calendar-events-heatmap

Limits measured in Partner Center: *Search results summary* 100 characters, *Description* 5,000
characters (truncated silently), *Certification notes* 2,500 **counted with CRLF** and **cleared on
every resubmission**. AppSource does not render markdown: blocks in capitals and `•` bullets only.

**1.2.0.0 changes the description.** The 1.1 listing promised two things that did not work —
conditional formatting on Day Color (Power BI does not offer fx to table-based visuals) and the fiscal
calendar (the setting was never read) — and claimed to be "the only Power BI calendar that…", a
comparison this listing must not make. Rules: no comparisons with other marketplace visuals, not even
implied; "Power BI" always with that capitalisation (rejection 100.7.1).

---

## Search results summary

```
A calendar heatmap with the events that explain each day: promotions, holidays, fiscal weeks.
```

*(93 characters)*

---

## Description

```
A daily measure on a line chart hides the question that matters: why was that Tuesday so good? The answer is usually on the calendar — a promotion, a campaign, a public holiday — and it lives in another report.

Calendar Events Heatmap puts both in one place. Each day is coloured by your measure, and the events that explain it sit on the day they happened. Click a day, or drag across a week, and the whole report filters to it.

WHAT IS NEW IN 1.2

• Year, month and week views, with drill up and down and a Today button
• Drag across days to filter the report by a date range
• Fiscal calendars that follow your year: by month, or in 4-4-5, 4-5-4 and 5-4-4 weeks
• Color rules: paint the days above or below your thresholds
• Ten colour schemes, two of them colour-blind safe, and five style templates
• Events as colour marks in five clearly distinct palettes, so the heatmap stays readable; the legend names each colour
• A setup guide inside the visual, format on the canvas, and twelve languages

A CALENDAR THAT READS LIKE A HEATMAP

• Every day coloured by the measure, with a legend for the scale
• Promotions, campaigns or incidents on their day, one colour per category
• Public holidays marked, with their name in the tooltip
• ISO or US week numbers; weeks starting on Monday or Sunday
• Tooltips with every measure you add, and report tooltip pages

FISCAL YEARS AS YOUR BUSINESS COUNTS THEM

Switch on the fiscal calendar and pick the start month: months show their fiscal year and period, and the year view starts where your year starts. Retail calendars in 4-4-5 weeks get twelve periods of whole weeks, with the 53rd week placed in the last period.

WORKS LIKE A NATIVE VISUAL

• Click a day to cross-filter; Ctrl+click to add; drag or Shift+click for a range
• Bookmarks restore the selected days; "Edit interactions" is respected
• Click a category in the event legend to hide its marks; the day values do not change
• Highlighting from other visuals and the native right-click menu
• Format on the canvas: click a day, a number or a legend to format it
• Keyboard navigation through days, weeks and months, with screen-reader labels
• Windows high contrast: intensity becomes border weight, so nothing depends on colour

FREE AND PRO

Free gives you the full month calendar: heatmap, colour schemes and rules, templates, holidays, events (one shown per day, with a count of the rest), date-range filtering, fiscal calendars including 4-4-5, week numbers, the setup guide and every interaction above.

Pro adds the year and week views, up to twelve months side by side, switching the measure inside the visual, several events per day, and your own colours for each event category, the labels and the buttons.

While you edit a report without a licence, every Pro feature you turn on is drawn working under a "Pro preview" watermark that names it. Reading view shows the free result, so a published report never uses a feature you have not paid for. 30-day free trial on AppSource.

PRIVACY

No network calls of any kind: no telemetry, no analytics, no external scripts. Everything happens inside Power BI. What the visual saves in your report is four of its own settings — the style template, whether the setup guide is shown, which measure is displayed and which event categories are hidden — chosen with a click.

GETTING STARTED

1. Add a Date column and a measure.
2. Follow the setup guide: add events, categories and holidays if you have them.
3. Pick a style, and click a day to filter the report.

Documentation, video and FAQ: https://tinocallarisa-web.github.io/calendar/support.html
Questions: https://github.com/tinocallarisa-web/calendar/discussions
Support: support@tcviz.com
```

---

## Search keywords (max 3)

1. `calendar heatmap` — the **generic** and the type OKviz files the visual under; most of the search
   volume for this kind of visual.
2. `4-4-5 calendar` — the **niche technical term**. **A bet, written down on 12-10-2026:** retail and
   FMCG analysts search for it because the native visuals cannot draw fiscal weeks; low volume, very high
   intent. Watch questions for "4-4-5 with my own start date" (the rule here is the nearest week start
   to day 1 of the fiscal month).
3. `promotion calendar` — the **problem word**: whoever types it wants to see promotions against sales,
   which is exactly what the visual does.

Dropped from the 1.1 listing: none recorded.

---

## Links to keep current in the offer

| Field | Value |
|---|---|
| Support / help | https://tinocallarisa-web.github.io/calendar/support.html |
| Privacy policy | https://tinocallarisa-web.github.io/calendar/privacy.html |
| Terms of use | https://tinocallarisa-web.github.io/calendar/terms.html |
| Changelog | https://tinocallarisa-web.github.io/calendar/changelog.html |
| Video | https://www.youtube.com/watch?v=FUELmlkAGNI |
| Source | https://github.com/tinocallarisa-web/calendar |

Canonical YouTube URL only (policy 100.3.3.3). **Correcting it here does not correct the offer.**

## Images

| Asset | File | Notes |
|---|---|---|
| Offer screenshots | `assets/infographic.png`, `assets/infographic-styles.png`, `assets/Screenshot1.png` (week), `Screenshot2.png` (month), `Screenshot3.png` (year) | 1366×768, all for 1.2.0.0 |
| Offer logo | `assets/tcviz-icono-calendar-300x300.png` | Uploaded by hand: it does not travel in the package |
| Package icon | `assets/icon.png` | Embedded in the `.pbiviz` |

---

## What must be pasted by hand in Partner Center

1. **Description** and **Search results summary** — both change.
2. **Keywords** — `calendar heatmap`, `4-4-5 calendar`, `promotion calendar`.
3. **Certification notes** — `docs/CERTIFICATION-NOTES-SHORT.txt`. Cleared on every resubmission.
4. **Screenshots** — the two infographics and Screenshot1-3 in `assets/` (1366×768).
5. **Video** — unchanged: `https://www.youtube.com/watch?v=FUELmlkAGNI`.
