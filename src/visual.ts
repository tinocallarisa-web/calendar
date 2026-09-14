/// <reference types="powerbi-visuals-api" />
import powerbi from "powerbi-visuals-api";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { SP_IDENTIFIER, CalendarSettings, parseSettings, freeSettings, defaultSettings } from "./settings";

type IValueFormatter = ReturnType<typeof valueFormatter.create>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  name: string;
  startDate: Date;
  endDate: Date;
  category: string;
  color: string;
  spansMultipleDays: boolean;
}

export interface CalendarDay {
  date: Date;
  measureValue: number | null;
  highlightValue: number | null;
  heatmapColor: string;
  /** Colour resolved by a conditional-formatting rule, when the user set one. */
  ruleColor: string | null;
  events: CalendarEvent[];
  isHoliday: boolean;
  holidayName: string;
  isWeekend: boolean;
  isCurrentMonth: boolean;
  selectionId: powerbi.visuals.ISelectionId | null;
  /** Raw values of the Tooltip Measures, aggregated. Formatted only when displayed. */
  secondaryValues: (number | null)[];
}

// ─── Main Visual Class ─────────────────────────────────────────────────────────

export class CalendarVisual implements powerbi.extensibility.visual.IVisual {
  private host: powerbi.extensibility.visual.IVisualHost;
  private container: HTMLElement;
  private selectionManager: powerbi.extensibility.ISelectionManager;
  private events: powerbi.extensibility.IVisualEventService;
  private licenseManager: any; /* IVisualLicenseManager */

  private isPro: boolean = false; // ISPRO_MARKER
  private licenseRequested: boolean = false;
  private licenseResolved: boolean = false;      // no se avisa de compra hasta conocer la licencia
  private licenseEnvSupported: boolean = true;   // false en Publish to Web, embebido, exportación
  private licenseInfoAvailable: boolean = true;  // false si la licencia no se pudo leer
  private licenseIconShown: boolean = false;
  private lastBlockedNotice: string = "";

  /** Lo que se pinta: en Free, las opciones Pro vuelven a su valor por defecto. */
  private settings: CalendarSettings = defaultSettings;
  /** Lo que eligió el usuario: es lo que muestra el panel de formato. */
  private rawSettings: CalendarSettings = defaultSettings;
  private currentView: "month" | "week" = "month";
  private viewInitialized: boolean = false;   // only apply "Default View" setting once
  private currentDate: Date = new Date();
  private calendarData: CalendarDay[] = [];
  private hasRenderedData: boolean = false;
  private lastDataView: powerbi.DataView | null = null;
  private uniqueEventCategories: string[] = [];  // ordered by first appearance in data
  private viewport: { width: number; height: number } = { width: 400, height: 300 };

  // ── Accessibility state ──
  /** True when Power BI reports a high-contrast theme. */
  private hc: boolean = false;
  private hcFg: string = "#000000";
  private hcBg: string = "#ffffff";
  private hcFgSel: string = "#000000";
  /** Day key that currently owns tabindex=0 (roving tabindex anchor). */
  private focusedKey: string | null = null;
  /** Set when a keyboard move forced a re-render and focus must be restored. */
  private restoreFocus: boolean = false;
  /** Day keys currently selected, mirrored for aria-selected and dimming. */
  private selectedKeys: Set<string> = new Set<string>();
  /** Measure range of the current dataset, used for the high-contrast intensity ramp. */
  private valueMin: number = 0;
  private valueMax: number = 0;

  // ── Number formatting ──
  /** Format string of the Main Measure, re-read on every update so dynamic format strings apply. */
  private mainFormat: string = "";
  /** Compact formatter for the value printed inside a day cell (respects display units). */
  private labelFormatter: IValueFormatter | null = null;
  /** Full-precision formatter for tooltips and screen-reader labels. */
  private fullFormatter: IValueFormatter | null = null;
  /** Display name + formatter for each Tooltip Measure, in field-well order. */
  private secondaryMeta: { name: string; formatter: IValueFormatter | null }[] = [];

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.host = options.host;
    this.events = options.host.eventService;
    this.selectionManager = options.host.createSelectionManager();
    this.licenseManager = (options.host as any).licenseManager;

    // Root container
    this.container = document.createElement("div");
    this.container.className = "tcviz-calendar";
    this.container.setAttribute("aria-label", "Calendar events heatmap");
    this.container.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: 'Segoe UI', system-ui, sans-serif;
      box-sizing: border-box;
      position: relative;
    `;
    options.element.appendChild(this.container);
    this.injectStyles();

    // Bookmarks, "clear filters" and selections applied from elsewhere in the report all
    // arrive through this callback. Without it the visual keeps painting a stale
    // selection after a bookmark is applied.
    const sm = this.selectionManager as any;
    if (typeof sm.registerOnSelectCallback === "function") {
      sm.registerOnSelectCallback((ids: powerbi.visuals.ISelectionId[]) => {
        this.selectedKeys.clear();
        (ids ?? []).forEach(id => {
          const day = this.calendarData.find(
            d => d.selectionId && typeof (d.selectionId as any).equals === "function"
              && (d.selectionId as any).equals(id),
          );
          if (day) this.selectedKeys.add(this.dateKey(day.date));
        });
        this.applySelectionStyles();
      });
    }
  }

  /**
   * Adds the visual's stylesheet at runtime.
   *
   * `style/visual.less` is declared in pbiviz.json but pbiviz has never emitted it into
   * the package — every shipped build from 1.0.0.0 onwards has `content.css` absent — so
   * a focus ring defined there would never reach the user. Injecting it here makes the
   * keyboard focus indicator part of the bundle that actually ships.
   *
   * Scoped to `.tcviz-calendar` so nothing leaks into the host report. Deliberately does
   * not set a global `box-sizing`, which has never applied in production and would change
   * existing cell metrics.
   */
  private injectStyles(): void {
    const STYLE_ID = "tcviz-calendar-styles";
    const doc = this.container.ownerDocument ?? document;
    if (doc.getElementById(STYLE_ID)) return;

    const st = doc.createElement("style");
    st.id = STYLE_ID;
    st.textContent = [
      ".tcviz-calendar button{transition:opacity .1s ease}",
      ".tcviz-calendar button:hover{opacity:.75}",
      // Keyboard users must be able to see which control has focus.
      ".tcviz-calendar button:focus-visible{outline:2px solid var(--tcviz-focus,#3D3929);outline-offset:2px}",
      // Day cells use a roving tabindex. The ring is a box-shadow so it never collides
      // with the inline `outline` that marks a selected day.
      ".tcviz-calendar [data-date]{box-sizing:border-box}",
      ".tcviz-calendar [data-date]:focus{outline:none;position:relative;z-index:2;" +
        "box-shadow:0 0 0 2px var(--tcviz-focus-halo,#FAF9F5),0 0 0 4px var(--tcviz-focus,#3D3929)}",
      // Windows high contrast / forced colors: let the OS palette win outright.
      "@media (forced-colors:active){" +
        ".tcviz-calendar [data-date]:focus{box-shadow:none;outline:3px solid Highlight;outline-offset:-3px}" +
        ".tcviz-calendar [data-date][aria-selected=\"true\"]{outline:3px solid Highlight;outline-offset:-3px}" +
      "}",
      // Respect a reduced-motion preference.
      "@media (prefers-reduced-motion:reduce){.tcviz-calendar button{transition:none}}",
    ].join("");

    (doc.head ?? this.container).appendChild(st);
  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
    this.events.renderingStarted(options);

    try {
      this.readHighContrast();
      const dataView = options.dataViews?.[0];

      // Landing page — no data yet
      if (!dataView?.table) {
        this.renderLandingPage();
        this.events.renderingFinished(options);
        return;
      }

      this.lastDataView = dataView;
      this.rawSettings = parseSettings(dataView);
      this.settings = this.isPro ? this.rawSettings : freeSettings(this.rawSettings);
      // Apply "Default View" only on first load; after that preserve user's choice
      if (!this.viewInitialized) {
        this.currentView = this.settings.calendar.view;
        this.viewInitialized = true;
      }

      // Parse data
      this.calendarData = this.parseDataView(dataView);
      this.hasRenderedData = this.calendarData.length > 0;

      // Auto-navigate: if current month has no data, jump to first month with data
      if (this.calendarData.length > 0) {
        const hasDataThisMonth = this.calendarData.some(d =>
          d.date.getFullYear() === this.currentDate.getFullYear() &&
          d.date.getMonth() === this.currentDate.getMonth()
        );
        if (!hasDataThisMonth) {
          const target = this.calendarData[0].date;
          if (target.getFullYear() >= 1970 && target.getFullYear() <= 2100) {
            this.currentDate = new Date(target);
          }
        }
      }

      // Store viewport for responsive rendering
      this.viewport = options.viewport ?? this.viewport;

      // Render
      this.render();

      // Request license after render (never blocks render)
      this.requestLicenseDeferred();
      this.notifyProBlocked();

      this.events.renderingFinished(options);
    } catch (e) {
      this.events.renderingFailed(options, String(e));
    }
  }

  // ─── Data Parsing ───────────────────────────────────────────────────────────

  private parseDataView(dataView: powerbi.DataView): CalendarDay[] {
    const table = dataView.table;
    if (!table?.rows) return [];

    const cols = table.columns;
    const dateIdx = cols.findIndex(c => c.roles["date"]);
    const measureIdx = cols.findIndex(c => c.roles["mainMeasure"]);
    const eventNameIdx = cols.findIndex(c => c.roles["eventName"]);
    const eventCatIdx = cols.findIndex(c => c.roles["eventCategory"]);
    const holidayNameIdx = cols.findIndex(c => c.roles["holidayName"]);

    // Secondary measures
    const secondaryIdxs = cols
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.roles["secondaryMeasures"])
      .map(({ i }) => i);

    // Format strings are re-read on every update, which is what makes dynamic format
    // strings work: Power BI resolves the DAX expression and puts the result on the
    // column metadata before the visual is called.
    this.mainFormat = measureIdx >= 0
      ? (valueFormatter.getFormatStringByColumn(cols[measureIdx]) ?? "")
      : "";
    this.fullFormatter = this.makeFormatter(this.mainFormat, undefined);
    this.secondaryMeta = secondaryIdxs.map(i => ({
      name: String(cols[i].displayName ?? "").replace(/[\x00-\x1f\x7f]/g, ""),
      formatter: this.makeFormatter(valueFormatter.getFormatStringByColumn(cols[i]) ?? "", undefined),
    }));

    // Pre-collect unique event categories (ordered by first appearance) so color
    // slots are stable across renders and can be read from capabilities settings.
    {
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (let r = 0; r < table.rows.length; r++) {
        if (eventCatIdx >= 0 && table.rows[r][eventCatIdx] != null) {
          const cat = String(table.rows[r][eventCatIdx] ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim();
          if (!seen.has(cat)) { seen.add(cat); ordered.push(cat); }
        }
      }
      this.uniqueEventCategories = ordered;
    }

    const dayMap = new Map<string, CalendarDay>();
    const events: CalendarEvent[] = [];
    const holidays = new Map<string, string>(); // dateKey → name

    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];

      // Input validation: skip rows with unparseable date values
      if (dateIdx >= 0 && row[dateIdx] != null && !this.parseDate(row[dateIdx])) {
        continue;
      }

      // Holidays — date comes from the shared Date role
      if (holidayNameIdx >= 0 && row[holidayNameIdx] != null && String(row[holidayNameIdx]).trim() !== "") {
        const hDateRaw = dateIdx >= 0 ? row[dateIdx] : null;
        if (hDateRaw) {
          const hDate = this.parseDate(hDateRaw);
          if (hDate) {
            // Sanitize: strip control characters from holiday name
            const hName = String(row[holidayNameIdx]).replace(/[\x00-\x1f\x7f]/g, "").trim();
            if (hName) holidays.set(this.dateKey(hDate), hName);
          }
        }
      }

      // Events — date comes from the shared Date role (data pre-expanded per day)
      if (eventNameIdx >= 0 && row[eventNameIdx]) {
        const startDate = dateIdx >= 0 && row[dateIdx] ? this.parseDate(row[dateIdx]) : null;
        const endDate = startDate;

        if (startDate) {
          // Sanitize: strip control characters from event name and category
          const evtName = String(row[eventNameIdx]).replace(/[\x00-\x1f\x7f]/g, "").trim();
          const evtCat = eventCatIdx >= 0
            ? String(row[eventCatIdx] ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim()
            : "";
          if (evtName) {
            events.push({
              name: evtName,
              startDate,
              endDate: endDate ?? startDate,
              category: evtCat,
              color: this.getCategoryColor(evtCat),
              spansMultipleDays: endDate ? endDate.getTime() > startDate.getTime() : false,
            });
          }
        }
      }

      // Measure rows — aggregate by date (sum across SKUs, areas, etc.)
      if (dateIdx >= 0 && row[dateIdx]) {
        const date = this.parseDate(row[dateIdx]);
        if (!date) continue;
        const key = this.dateKey(date);
        const rawMeasure = measureIdx >= 0 ? row[measureIdx] : null;
        // Validate measure is a finite number
        const rowMeasure: number | null = (rawMeasure !== null && rawMeasure !== undefined && isFinite(rawMeasure as number))
          ? (rawMeasure as number)
          : null;

        if (!dayMap.has(key)) {
          const selId = this.host.createSelectionIdBuilder()
            .withTable(table, r)
            .createSelectionId();

          dayMap.set(key, {
            date,
            measureValue: rowMeasure,
            highlightValue: null,
            heatmapColor: this.settings.heatmap.colorNull,
            ruleColor: this.readRuleColor(row, dateIdx),
            events: [],
            isHoliday: false,
            holidayName: "",
            isWeekend: date.getDay() === 0 || date.getDay() === 6,
            isCurrentMonth: true,
            selectionId: selId,
            secondaryValues: secondaryIdxs.map(i => {
              const v = row[i];
              return (typeof v === "number" && isFinite(v)) ? v : null;
            }),
          });
        } else {
          // Aggregate: sum measures for the same day
          const existing = dayMap.get(key)!;
          if (rowMeasure !== null) {
            existing.measureValue = (existing.measureValue ?? 0) + rowMeasure;
          }
          // Aggregate secondary measures too, on the raw numbers. The previous version
          // summed the *formatted* strings by stripping non-numeric characters, which
          // cannot survive a currency symbol, a percent sign or a thousands separator.
          secondaryIdxs.forEach((colIdx, tipIdx) => {
            const v = row[colIdx];
            if (typeof v === "number" && isFinite(v)) {
              existing.secondaryValues[tipIdx] = (existing.secondaryValues[tipIdx] ?? 0) + v;
            }
          });
        }
      }
    }

    // Apply holidays to days
    holidays.forEach((name, key) => {
      const day = dayMap.get(key);
      if (day) { day.isHoliday = true; day.holidayName = name; }
    });

    // Assign events to days they cover
    events.forEach(evt => {
      const d = new Date(evt.startDate);
      while (d <= evt.endDate) {
        const key = this.dateKey(d);
        const day = dayMap.get(key);
        if (day) day.events.push(evt);
        d.setDate(d.getDate() + 1);
      }
    });

    // Apply heatmap colors
    const values = Array.from(dayMap.values())
      .map(d => d.measureValue)
      .filter((v): v is number => v !== null);
    const minVal = values.length ? Math.min(...values) : 0;
    const maxVal = values.length ? Math.max(...values) : 0;
    this.valueMin = minVal;
    this.valueMax = maxVal;
    // Display units are chosen from the largest value, so "1.2M" style abbreviation is
    // kept while the measure's own format (currency, percent, decimals) is honoured.
    this.labelFormatter = this.makeFormatter(this.mainFormat, Math.max(Math.abs(minVal), Math.abs(maxVal)));

    dayMap.forEach(day => {
      day.heatmapColor = this.heatmapColor(day.measureValue, minVal, maxVal);
    });

    return Array.from(dayMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  private render(): void {
    // Focus ring colour lives in CSS; feed it the theme-aware value.
    this.container.style.setProperty(
      "--tcviz-focus",
      this.hc ? this.hcFgSel : this.sanitizeColor(this.settings.navigation.activeColor, "#3D3929"),
    );
    this.container.style.setProperty("--tcviz-focus-halo", this.hc ? this.hcBg : "#FAF9F5");

    // La vista semanal es Pro. Antes bastaba con "Default View = Week" para verla en Free.
    const view = (this.currentView === "week" && this.isPro)
      ? this.buildWeekView()
      : this.buildMonthView();

    // Atomic swap
    while (this.container.firstChild) this.container.removeChild(this.container.firstChild);

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:100%;height:100%;overflow-x:hidden;overflow-y:auto;";
    wrapper.appendChild(view);
    this.container.appendChild(wrapper);

    // Show guidance when data is connected but dates can't be parsed
    if (this.calendarData.length === 0 && this.lastDataView?.table) {
      const t = this.lastDataView.table;
      const cols = t.columns ?? [];
      const row0 = t.rows?.[0] ?? [];
      const dateIdx = cols.findIndex(c => (c.roles ?? {})["date"]);
      const rawDate = dateIdx >= 0 ? row0[dateIdx] : undefined;
      const isYearValue = typeof rawDate === "number" && rawDate > 1980 && rawDate < 2100;

      const dbg = document.createElement("div");
      dbg.setAttribute("role", "status");
      dbg.style.cssText = [
        `position:absolute;inset:12px;background:${this.hc ? this.hcBg : "rgba(255,255,255,0.95)"};`,
        `border:2px solid ${this.hc ? this.hcFg : "#C96442"};border-radius:8px;`,
        "display:flex;flex-direction:column;align-items:center;justify-content:center;",
        `font-size:12px;color:${this.fg(null, "#3D3929")};text-align:center;padding:16px;`,
        "z-index:9999;line-height:1.6;gap:4px;",
      ].join("");

      const titleEl = document.createElement("b");
      const bodyEl = document.createElement("div");

      if (isYearValue) {
        titleEl.textContent = "Connect the Date field as a Date, not as a Year hierarchy.";
        bodyEl.textContent = "In the Field Well, click the ▼ next to your date field and select Date (not Date Hierarchy). Or: File → Options → Current file → Data Load → uncheck Auto date/time.";
      } else {
        titleEl.textContent = "No data received.";
        bodyEl.textContent = "Connect a Date column and a Main Measure to this visual.";
      }

      dbg.appendChild(titleEl);
      dbg.appendChild(bodyEl);
      this.container.appendChild(dbg);
    }

    this.attachInteractions(wrapper);
    this.setRovingTabindex();
    this.applySelectionStyles();

    // A keyboard move that crossed a month/week boundary re-rendered the grid;
    // put focus back on the day the user navigated to.
    if (this.restoreFocus && this.focusedKey) {
      this.restoreFocus = false;
      const el = this.container.querySelector(
        `[data-date="${this.focusedKey}"]`
      ) as HTMLElement | null;
      if (el) el.focus();
    }
  }

  private buildMonthView(): HTMLElement {
    // Free tier: single month only
    const n = this.isPro
      ? Math.max(1, this.settings.calendar.monthsToShow ?? 1)
      : 1;
    const weekStart = this.settings.calendar.weekStart;
    const dayMap = new Map(this.calendarData.map(d => [this.dateKey(d.date), d]));
    const today = this.dateKey(new Date());

    const dayNames = weekStart === 1
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const startDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + n - 1, 1);
    const startLabel = startDate.toLocaleString("default", { month: "long", year: "numeric" });
    const endLabel = endDate.toLocaleString("default", { month: "long", year: "numeric" });
    const headerLabel = n > 1 ? `${startLabel} – ${endLabel}` : startLabel;

    const outer = document.createElement("div");
    outer.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:380px;padding:8px;box-sizing:border-box;overflow:hidden;";

    // ── Navigation header ──
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;";

    const prevBtn = document.createElement("button");
    prevBtn.setAttribute("data-nav", "prev");
    prevBtn.setAttribute("type", "button");
    prevBtn.setAttribute("aria-label", this.currentView === "month" ? "Previous month" : "Previous week");
    prevBtn.style.cssText = this.navBtnStyle();
    prevBtn.textContent = "←";

    const headerSpan = document.createElement("span");
    headerSpan.setAttribute("aria-live", "polite");
    headerSpan.style.cssText = `font-weight:600;font-size:14px;color:${this.fg(null, "#3D3929")};`;
    headerSpan.textContent = headerLabel;

    const nextBtn = document.createElement("button");
    nextBtn.setAttribute("data-nav", "next");
    nextBtn.setAttribute("type", "button");
    nextBtn.setAttribute("aria-label", this.currentView === "month" ? "Next month" : "Next week");
    nextBtn.style.cssText = this.navBtnStyle();
    nextBtn.textContent = "→";

    header.appendChild(prevBtn);
    header.appendChild(headerSpan);
    header.appendChild(nextBtn);
    outer.appendChild(header);

    // ── View buttons ──
    const viewRow = document.createElement("div");
    viewRow.setAttribute("role", "group");
    viewRow.setAttribute("aria-label", "Calendar view");
    viewRow.style.cssText = "display:flex;gap:4px;margin-bottom:8px;flex-shrink:0;";

    const monthBtn = document.createElement("button");
    monthBtn.setAttribute("data-view", "month");
    monthBtn.setAttribute("type", "button");
    monthBtn.setAttribute("aria-label", "Month view");
    monthBtn.setAttribute("aria-pressed", String(this.currentView === "month"));
    monthBtn.style.cssText = this.viewBtnStyle(this.currentView === "month");
    monthBtn.textContent = "Month";

    const weekBtn = document.createElement("button");
    weekBtn.setAttribute("data-view", "week");
    weekBtn.setAttribute("type", "button");
    weekBtn.setAttribute("aria-label", this.isPro ? "Week view" : "Week view (Pro feature)");
    weekBtn.setAttribute("aria-pressed", String(this.currentView === "week"));
    weekBtn.style.cssText = this.viewBtnStyle(false);
    weekBtn.textContent = "Week";

    viewRow.appendChild(monthBtn);
    viewRow.appendChild(weekBtn);
    outer.appendChild(viewRow);

    // ── Category legend ──
    const legend = this.buildCategoryLegend();
    if (legend) outer.appendChild(legend);

    // ── Month grids ──
    const gridsContainer = document.createElement("div");
    gridsContainer.style.cssText = "display:flex;flex-direction:row;gap:12px;flex:1;overflow:hidden;min-height:0;";

    for (let m = 0; m < n; m++) {
      const totalMonths = startDate.getMonth() + m;
      const yr = startDate.getFullYear() + Math.floor(totalMonths / 12);
      const mo = totalMonths % 12;
      gridsContainer.appendChild(this.buildSingleMonthGrid(yr, mo, dayNames, dayMap, today, n));
    }

    outer.appendChild(gridsContainer);
    return outer;
  }

  private buildSingleMonthGrid(
    year: number,
    month: number,
    dayNames: string[],
    dayMap: Map<string, CalendarDay>,
    today: string,
    totalMonths: number,
  ): HTMLElement {
    const weekStart = this.settings.calendar.weekStart;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const monthName = firstDay.toLocaleString("default", { month: "long", year: "numeric" });

    const grid: (Date | null)[][] = [];
    let week: (Date | null)[] = [];
    const startOffset = (firstDay.getDay() - weekStart + 7) % 7;
    for (let i = 0; i < startOffset; i++) week.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      week.push(new Date(year, month, d));
      if (week.length === 7) { grid.push(week); week = []; }
    }
    if (week.length) {
      while (week.length < 7) week.push(null);
      grid.push(week);
    }

    const showMeasure = totalMonths <= 6;
    const showEvents = this.settings.events.showEvents && totalMonths <= 3;
    const minColW = totalMonths > 1 ? "180px" : "0px";

    // Pre-validate colors and fonts from settings
    const ac             = this.accent(this.settings.navigation.activeColor, "#C96442");
    const holColor       = this.fg(this.settings.dayNumber.holidayColor, "#C96442");
    const wkndColor      = this.fg(this.settings.dayNumber.weekendColor, "#C96442");
    const numColor       = this.fg(this.settings.dayNumber.color, "#3D3929");
    const numFont        = this.sanitizeFont(this.settings.dayNumber.fontFamily, "Segoe UI, system-ui, sans-serif");
    const numSz          = `${Math.max(6, Math.min(24, this.settings.dayNumber.fontSize))}px`;
    const lblColor       = this.fg(this.settings.labels.color, "#535146");
    const lblFont        = this.sanitizeFont(this.settings.labels.fontFamily, "Segoe UI, system-ui, sans-serif");
    const lblSz          = `${Math.max(6, Math.min(24, this.settings.labels.fontSize))}px`;
    const evtFg          = this.hc ? this.hcFg : this.sanitizeColor(this.settings.events.eventFontColor, "#ffffff");
    const evtFontSz      = `${Math.max(6, Math.min(24, this.settings.events.eventFontSize))}px`;

    const outer = document.createElement("div");
    outer.style.cssText = `flex:1 0 ${minColW};min-width:${minColW};display:flex;flex-direction:column;min-height:0;overflow:hidden;`;

    // Optional per-month label (when showing >1 month)
    if (totalMonths > 1) {
      const mlabel = document.createElement("div");
      mlabel.style.cssText = `text-align:center;font-size:12px;font-weight:600;color:${this.fg(null, "#3D3929")};margin-bottom:6px;flex-shrink:0;`;
      mlabel.textContent = monthName;
      outer.appendChild(mlabel);
    }

    // Day names header
    const dayNamesRow = document.createElement("div");
    dayNamesRow.setAttribute("role", "row");
    dayNamesRow.style.cssText = "display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;flex-shrink:0;";
    dayNames.forEach(dn => {
      const cell = document.createElement("div");
      cell.setAttribute("role", "columnheader");
      cell.style.cssText = `text-align:center;font-size:10px;font-weight:600;color:${this.fg(null, "#83827D")};padding:2px 0;overflow:hidden;`;
      cell.textContent = dn;
      dayNamesRow.appendChild(cell);
    });

    // Grid body
    const gridBody = document.createElement("div");
    gridBody.setAttribute("role", "rowgroup");
    gridBody.style.cssText = "display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;overflow:hidden;";

    grid.forEach(wk => {
      const weekRow = document.createElement("div");
      weekRow.setAttribute("role", "row");
      weekRow.style.cssText = "display:grid;grid-template-columns:repeat(7,1fr);gap:2px;flex:1;min-height:0;";

      wk.forEach(date => {
        if (!date) {
          const empty = document.createElement("div");
          empty.setAttribute("role", "gridcell");
          empty.setAttribute("aria-hidden", "true");
          empty.style.cssText = this.hc
            ? `background:${this.hcBg};border-radius:4px;opacity:0.3;overflow:hidden;`
            : "background:#F5F3ED;border-radius:4px;opacity:0.3;overflow:hidden;";
          weekRow.appendChild(empty);
          return;
        }

        const key = this.dateKey(date);
        const day = dayMap.get(key);
        const isToday = key === today;
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const isHoliday = day?.isHoliday ?? false;
        const eventsArr = day?.events ?? [];
        const maxEvt = this.isPro ? this.settings.events.maxEventsVisible : 1;
        const visibleEvents = showEvents ? eventsArr.slice(0, maxEvt) : [];
        const moreCount = showEvents ? eventsArr.length - visibleEvents.length : 0;

        const dayNumColor = isHoliday ? holColor : isWeekend ? wkndColor : numColor;

        // Day cell
        const chrome = this.cellChrome(day, isToday, isHoliday, ac, holColor);

        const cell = document.createElement("div");
        cell.setAttribute("data-date", key);
        cell.setAttribute("data-has-data", day ? "1" : "0");
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("tabindex", "-1");
        cell.setAttribute("aria-label", this.cellAriaLabel(date, day));
        cell.setAttribute("aria-selected", "false");
        cell.style.backgroundColor = chrome.bg;
        cell.style.borderRadius = "4px";
        cell.style.padding = "3px";
        cell.style.cursor = day ? "pointer" : "default";
        cell.style.display = "flex";
        cell.style.flexDirection = "column";
        cell.style.overflow = "hidden";
        cell.style.minHeight = "0";
        cell.style.border = chrome.border;

        // Day number
        const numDiv = document.createElement("div");
        numDiv.style.fontSize = numSz;
        numDiv.style.fontFamily = numFont;
        numDiv.style.fontWeight = isToday ? "700" : "400";
        numDiv.style.color = dayNumColor;
        numDiv.style.lineHeight = "1";
        numDiv.style.whiteSpace = "nowrap";
        numDiv.style.flexShrink = "0";
        numDiv.textContent = String(date.getDate()) + (isHoliday ? "❆" : "");
        cell.appendChild(numDiv);

        // Measure value
        if (showMeasure && day?.measureValue != null) {
          const valDiv = document.createElement("div");
          valDiv.style.fontSize = lblSz;
          valDiv.style.fontFamily = lblFont;
          valDiv.style.color = lblColor;
          valDiv.style.fontWeight = "600";
          valDiv.style.lineHeight = "1.2";
          valDiv.style.whiteSpace = "nowrap";
          valDiv.style.overflow = "hidden";
          valDiv.style.textOverflow = "ellipsis";
          valDiv.style.flexShrink = "0";
          valDiv.textContent = this.formatValue(day.measureValue);
          cell.appendChild(valDiv);
        }

        // Event pills
        visibleEvents.forEach(e => {
          const evtDiv = document.createElement("div");
          const evtBg = this.sanitizeColor(
            (this.settings.events.useGlobalColor && this.settings.events.eventBgColor)
              ? this.settings.events.eventBgColor
              : e.color,
            "#C96442"
          );
          evtDiv.style.backgroundColor = this.hc ? this.hcBg : evtBg;
          evtDiv.style.color = evtFg;
          if (this.hc) evtDiv.style.border = `1px solid ${this.hcFg}`;
          evtDiv.style.borderRadius = "2px";
          evtDiv.style.fontSize = evtFontSz;
          evtDiv.style.fontFamily = lblFont;
          evtDiv.style.padding = "1px 3px";
          evtDiv.style.marginTop = "1px";
          evtDiv.style.whiteSpace = "nowrap";
          evtDiv.style.overflow = "hidden";
          evtDiv.style.textOverflow = "ellipsis";
          evtDiv.style.flexShrink = "0";
          evtDiv.textContent = e.name;   // safe: textContent, never innerHTML
          cell.appendChild(evtDiv);
        });

        // "+N more"
        if (moreCount > 0) {
          const moreDiv = document.createElement("div");
          moreDiv.style.fontSize = "8px";
          moreDiv.style.color = this.fg(null, "#83827D");
          moreDiv.style.marginTop = "1px";
          moreDiv.style.whiteSpace = "nowrap";
          moreDiv.style.flexShrink = "0";
          moreDiv.textContent = `+${moreCount}`;
          cell.appendChild(moreDiv);
        }

        weekRow.appendChild(cell);
      });

      gridBody.appendChild(weekRow);
    });

    const gridWrap = document.createElement("div");
    gridWrap.setAttribute("role", "grid");
    gridWrap.setAttribute("aria-label", `Calendar heatmap, ${monthName}`);
    gridWrap.setAttribute("aria-readonly", "true");
    gridWrap.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;";
    gridWrap.appendChild(dayNamesRow);
    gridWrap.appendChild(gridBody);

    outer.appendChild(gridWrap);
    return outer;
  }

  private buildWeekView(): HTMLElement {
    const weekStart = this.settings.calendar.weekStart;
    const now = this.currentDate;
    const dayOfWeek = (now.getDay() - weekStart + 7) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }

    const weekLabel = `${monday.toLocaleDateString("default", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" })}`;
    const dayNames = weekStart === 1
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const dayMap = new Map(this.calendarData.map(d => [this.dateKey(d.date), d]));
    const today = this.dateKey(new Date());

    const dn  = this.settings.dayNumber;
    const lbl = this.settings.labels;
    const nav = this.settings.navigation;
    const evts = this.settings.events;

    // Pre-validate colors and fonts from settings
    const ac          = this.accent(nav.activeColor, "#C96442");
    const dnColor     = this.fg(dn.color, "#3D3929");
    const dnWknd      = this.fg(dn.weekendColor, "#C96442");
    const dnHol       = this.fg(dn.holidayColor, "#C96442");
    const dnFont      = this.sanitizeFont(dn.fontFamily, "Segoe UI, system-ui, sans-serif");
    const lblColor    = this.fg(lbl.color, "#535146");
    const lblFont     = this.sanitizeFont(lbl.fontFamily, "Segoe UI, system-ui, sans-serif");
    const evtFg       = this.hc ? this.hcFg : this.sanitizeColor(evts.eventFontColor, "#ffffff");
    const evtFontSz   = `${Math.max(6, Math.min(24, evts.eventFontSize))}px`;

    const outer = document.createElement("div");
    outer.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:280px;padding:8px;box-sizing:border-box;overflow:hidden;";

    // ── Navigation header ──
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;";

    const prevBtn = document.createElement("button");
    prevBtn.setAttribute("data-nav", "prev");
    prevBtn.setAttribute("type", "button");
    prevBtn.setAttribute("aria-label", this.currentView === "month" ? "Previous month" : "Previous week");
    prevBtn.style.cssText = this.navBtnStyle();
    prevBtn.textContent = "←";

    const weekSpan = document.createElement("span");
    weekSpan.setAttribute("aria-live", "polite");
    weekSpan.style.cssText = `font-weight:600;font-size:14px;color:${this.fg(null, "#3D3929")};`;
    weekSpan.textContent = weekLabel;

    const nextBtn = document.createElement("button");
    nextBtn.setAttribute("data-nav", "next");
    nextBtn.setAttribute("type", "button");
    nextBtn.setAttribute("aria-label", this.currentView === "month" ? "Next month" : "Next week");
    nextBtn.style.cssText = this.navBtnStyle();
    nextBtn.textContent = "→";

    header.appendChild(prevBtn);
    header.appendChild(weekSpan);
    header.appendChild(nextBtn);
    outer.appendChild(header);

    // ── View buttons ──
    const viewRow = document.createElement("div");
    viewRow.setAttribute("role", "group");
    viewRow.setAttribute("aria-label", "Calendar view");
    viewRow.style.cssText = "display:flex;gap:4px;margin-bottom:8px;flex-shrink:0;";

    const monthBtn = document.createElement("button");
    monthBtn.setAttribute("data-view", "month");
    monthBtn.setAttribute("type", "button");
    monthBtn.setAttribute("aria-label", "Month view");
    monthBtn.setAttribute("aria-pressed", String(this.currentView === "month"));
    monthBtn.style.cssText = this.viewBtnStyle(false);
    monthBtn.textContent = "Month";

    const weekBtn = document.createElement("button");
    weekBtn.setAttribute("data-view", "week");
    weekBtn.setAttribute("type", "button");
    weekBtn.setAttribute("aria-label", this.isPro ? "Week view" : "Week view (Pro feature)");
    weekBtn.setAttribute("aria-pressed", String(this.currentView === "week"));
    weekBtn.style.cssText = this.viewBtnStyle(true);
    weekBtn.textContent = "Week";

    viewRow.appendChild(monthBtn);
    viewRow.appendChild(weekBtn);
    outer.appendChild(viewRow);

    // ── Category legend ──
    const legend = this.buildCategoryLegend();
    if (legend) outer.appendChild(legend);

    // ── Days grid ──
    const daysGrid = document.createElement("div");
    daysGrid.setAttribute("role", "grid");
    daysGrid.setAttribute("aria-label", `Calendar heatmap, week of ${weekLabel}`);
    daysGrid.setAttribute("aria-readonly", "true");
    daysGrid.style.cssText = "display:grid;grid-template-columns:repeat(7,1fr);gap:4px;flex:1;min-height:0;overflow:hidden;";

    const weekRowEl = document.createElement("div");
    weekRowEl.setAttribute("role", "row");
    weekRowEl.style.cssText = "display:contents;";
    daysGrid.appendChild(weekRowEl);

    days.forEach((date, i) => {
      const key = this.dateKey(date);
      const day = dayMap.get(key);
      const isToday = key === today;
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isHoliday = day?.isHoliday ?? false;
      const eventsArr = day?.events ?? [];
      const dayNumColor = isHoliday ? dnHol : isWeekend ? dnWknd : dnColor;

      const maxWeekEvts = Math.max(evts.maxEventsVisible, 5);
      const visibleWeekEvts = eventsArr.slice(0, maxWeekEvts);
      const moreWeekCount = eventsArr.length - visibleWeekEvts.length;

      const chrome = this.cellChrome(day, isToday, isHoliday, ac, dnHol);

      const cell = document.createElement("div");
      cell.setAttribute("data-date", key);
      cell.setAttribute("data-has-data", day ? "1" : "0");
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("tabindex", "-1");
      cell.setAttribute("aria-label", this.cellAriaLabel(date, day));
      cell.setAttribute("aria-selected", "false");
      cell.style.backgroundColor = chrome.bg;
      cell.style.borderRadius = "6px";
      cell.style.padding = "6px";
      cell.style.cursor = day ? "pointer" : "default";
      cell.style.display = "flex";
      cell.style.flexDirection = "column";
      cell.style.gap = "4px";
      cell.style.overflow = "hidden";
      cell.style.border = chrome.border;

      // Day name (Mon, Tue, …)
      const dnDiv = document.createElement("div");
      dnDiv.style.fontSize = `${dn.fontSize}px`;
      dnDiv.style.fontFamily = dnFont;
      dnDiv.style.fontWeight = "600";
      dnDiv.style.color = dayNumColor;
      dnDiv.style.whiteSpace = "nowrap";
      dnDiv.textContent = dayNames[i];
      cell.appendChild(dnDiv);

      // Day number
      const numDiv = document.createElement("div");
      numDiv.style.fontSize = `${Math.round(dn.fontSize * 1.6)}px`;
      numDiv.style.fontFamily = dnFont;
      numDiv.style.fontWeight = isToday ? "700" : "400";
      numDiv.style.color = dnColor;
      numDiv.style.whiteSpace = "nowrap";
      numDiv.textContent = String(date.getDate()) + (isHoliday ? " ❆" : "");
      cell.appendChild(numDiv);

      // Measure value
      if (day?.measureValue != null) {
        const valDiv = document.createElement("div");
        valDiv.style.fontSize = `${lbl.fontSize}px`;
        valDiv.style.fontFamily = lblFont;
        valDiv.style.fontWeight = "600";
        valDiv.style.color = lblColor;
        valDiv.style.whiteSpace = "nowrap";
        valDiv.style.overflow = "hidden";
        valDiv.style.textOverflow = "ellipsis";
        valDiv.textContent = this.formatValue(day.measureValue);
        cell.appendChild(valDiv);
      }

      // Holiday name
      if (isHoliday && day?.holidayName) {
        const holDiv = document.createElement("div");
        holDiv.style.fontSize = `${lbl.fontSize}px`;
        holDiv.style.fontFamily = lblFont;
        holDiv.style.color = dnHol;
        holDiv.style.whiteSpace = "nowrap";
        holDiv.style.overflow = "hidden";
        holDiv.style.textOverflow = "ellipsis";
        holDiv.textContent = day.holidayName;   // safe: textContent, never innerHTML
        cell.appendChild(holDiv);
      }

      // Event pills
      visibleWeekEvts.forEach(e => {
        const evtDiv = document.createElement("div");
        const evtBg = this.sanitizeColor(evts.eventBgColor ?? e.color, "#C96442");
        evtDiv.style.backgroundColor = this.hc ? this.hcBg : evtBg;
        evtDiv.style.color = evtFg;
        if (this.hc) evtDiv.style.border = `1px solid ${this.hcFg}`;
        evtDiv.style.borderRadius = "3px";
        evtDiv.style.fontSize = evtFontSz;
        evtDiv.style.fontFamily = lblFont;
        evtDiv.style.padding = "2px 4px";
        evtDiv.style.whiteSpace = "nowrap";
        evtDiv.style.overflow = "hidden";
        evtDiv.style.textOverflow = "ellipsis";
        evtDiv.textContent = e.name;   // safe: textContent, never innerHTML
        cell.appendChild(evtDiv);
      });

      // "+N more"
      if (moreWeekCount > 0) {
        const moreDiv = document.createElement("div");
        moreDiv.style.fontSize = `${lbl.fontSize}px`;
        moreDiv.style.color = this.fg(null, "#83827D");
        moreDiv.textContent = `+${moreWeekCount}`;
        cell.appendChild(moreDiv);
      }

      weekRowEl.appendChild(cell);
    });

    outer.appendChild(daysGrid);
    return outer;
  }

  private renderLandingPage(): void {
    while (this.container.firstChild) this.container.removeChild(this.container.firstChild);

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:100%;height:100%;";

    const inner = document.createElement("div");
    inner.setAttribute("role", "status");
    inner.style.cssText = `display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:${this.fg(null, "#83827D")};font-family:'Segoe UI',system-ui,sans-serif;text-align:center;padding:16px;box-sizing:border-box;`;

    const icon = document.createElement("div");
    icon.style.cssText = "font-size:32px;margin-bottom:8px;";
    icon.textContent = "📅";

    const title = document.createElement("div");
    title.style.cssText = `font-size:14px;font-weight:600;color:${this.fg(null, "#3D3929")};margin-bottom:4px;`;
    title.textContent = "Calendar by TCViz";

    const sub = document.createElement("div");
    sub.style.cssText = "font-size:11px;line-height:1.5;max-width:200px;";
    sub.textContent = "Add a Date field and a Measure to see your calendar heatmap with event overlays.";

    inner.appendChild(icon);
    inner.appendChild(title);
    inner.appendChild(sub);
    wrapper.appendChild(inner);
    this.container.appendChild(wrapper);
  }

  // ─── Interactions ──────────────────────────────────────────────────────────

  /** Power BI can disable interactivity (for example in a report tooltip page). */
  private interactionsAllowed(): boolean {
    return (this.host as any).allowInteractions !== false;
  }

  private attachInteractions(wrapper: HTMLElement): void {
    // Day click → filter / clear selection
    wrapper.addEventListener("click", (e: MouseEvent) => {
      if (!this.interactionsAllowed()) return;
      const target = (e.target as HTMLElement).closest("[data-date]") as HTMLElement;

      // Click on empty background → clear any active selection so slicers work again
      if (!target || target.dataset.hasData !== "1") {
        this.selectionManager.clear();
        this.selectedKeys.clear();
        this.applySelectionStyles();
        return;
      }

      const dateKey = target.dataset.date!;
      const day = this.calendarData.find(d => this.dateKey(d.date) === dateKey);
      if (!day?.selectionId) return;

      const multi = e.ctrlKey || e.metaKey;
      this.selectionManager.select(day.selectionId, multi);
      this.focusedKey = dateKey;
      this.trackSelection(dateKey, multi);
      this.setRovingTabindex();
      this.applySelectionStyles();
    });

    // Context menu (right-click) → Power BI standard context menu
    wrapper.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      if (!this.interactionsAllowed()) return;
      const target = (e.target as HTMLElement).closest("[data-date]") as HTMLElement;
      const dateKey = target?.dataset.date;
      const day = dateKey ? this.calendarData.find(d => this.dateKey(d.date) === dateKey) : null;
      const selId = day?.selectionId ?? null;
      this.selectionManager.showContextMenu(selId as any, { x: e.clientX, y: e.clientY });
    });

    // Navigation
    wrapper.addEventListener("click", (e: MouseEvent) => {
      const nav = (e.target as HTMLElement).closest("[data-nav]") as HTMLElement;
      if (!nav) return;
      const dir = nav.dataset.nav === "next" ? 1 : -1;
      if (this.currentView === "month") {
        this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + dir, 1);
      } else {
        this.currentDate = new Date(this.currentDate.getTime() + dir * 7 * 24 * 60 * 60 * 1000);
      }
      this.render();
    });

    // View toggle
    wrapper.addEventListener("click", (e: MouseEvent) => {
      const viewBtn = (e.target as HTMLElement).closest("[data-view]") as HTMLElement;
      if (!viewBtn) return;
      const requested = viewBtn.dataset.view as "month" | "week";
      if (!this.isPro && requested === "week") {
        this.notifyProBlocked("week view");   // aviso de Power BI con la ruta de compra
        return;
      }
      this.currentView = requested;
      this.render();
    });

    // Keyboard navigation across the day grid
    wrapper.addEventListener("keydown", (e: KeyboardEvent) => {
      const cell = ((e.target as HTMLElement)?.closest?.("[data-date]") ?? null) as HTMLElement | null;
      if (!cell) return;   // buttons keep their native keyboard behaviour

      const current = this.parseKey(cell.dataset.date);
      if (!current) return;
      const k = e.key;

      // Activate: filter on this day (Ctrl/Cmd to add to the selection)
      if (k === "Enter" || k === " " || k === "Spacebar") {
        e.preventDefault();
        if (!this.interactionsAllowed()) return;
        if (cell.dataset.hasData !== "1") return;
        const dateKey = cell.dataset.date!;
        const day = this.calendarData.find(d => this.dateKey(d.date) === dateKey);
        if (!day?.selectionId) return;
        const multi = e.ctrlKey || e.metaKey;
        this.selectionManager.select(day.selectionId, multi);
        this.trackSelection(dateKey, multi);
        this.applySelectionStyles();
        return;
      }

      // Clear the selection so slicers and other visuals go back to unfiltered
      if (k === "Escape") {
        e.preventDefault();
        this.selectionManager.clear();
        this.selectedKeys.clear();
        this.applySelectionStyles();
        return;
      }

      // Power BI context menu from the keyboard
      if (k === "ContextMenu" || (e.shiftKey && k === "F10")) {
        e.preventDefault();
        const day = this.calendarData.find(d => this.dateKey(d.date) === cell.dataset.date);
        const rect = cell.getBoundingClientRect();
        this.selectionManager.showContextMenu(
          (day?.selectionId ?? null) as any,
          { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        );
        return;
      }

      // Jump a whole month (month view) or week (week view)
      if (k === "PageUp" || k === "PageDown") {
        e.preventDefault();
        const dir = k === "PageUp" ? -1 : 1;
        if (this.currentView === "month") {
          const y = current.getFullYear();
          const m = current.getMonth() + dir;
          const lastDay = new Date(y, m + 1, 0).getDate();
          this.moveFocusTo(new Date(y, m, Math.min(current.getDate(), lastDay)));
        } else {
          this.moveFocusTo(new Date(current.getFullYear(), current.getMonth(), current.getDate() + dir * 7));
        }
        return;
      }

      const weekStart = this.settings.calendar.weekStart;
      const posInWeek = (current.getDay() - weekStart + 7) % 7;
      let delta: number | null = null;

      switch (k) {
        case "ArrowLeft":  delta = -1; break;
        case "ArrowRight": delta = 1; break;
        case "ArrowUp":    delta = this.currentView === "month" ? -7 : -1; break;
        case "ArrowDown":  delta = this.currentView === "month" ? 7 : 1; break;
        case "Home":       delta = -posInWeek; break;
        case "End":        delta = 6 - posInWeek; break;
        default: return;
      }

      e.preventDefault();
      if (delta === 0) return;
      this.moveFocusTo(new Date(current.getFullYear(), current.getMonth(), current.getDate() + delta));
    });

    // Tooltips via Power BI tooltip service
    const dayMap = new Map(this.calendarData.map(d => [this.dateKey(d.date), d]));
    const self = this;

    wrapper.querySelectorAll("[data-date][data-has-data='1']").forEach(el => {
      el.addEventListener("mouseover", function() {
        const key = (el as HTMLElement).dataset.date!;
        const day = dayMap.get(key);
        if (!day) return;

        const items: powerbi.extensibility.VisualTooltipDataItem[] = [
          {
            displayName: "Date",
            value: day.date.toLocaleDateString(),
          },
        ];
        if (day.measureValue != null) {
          items.push({ displayName: "Value", value: self.formatFull(day.measureValue) });
        }
        if (day.isHoliday) {
          items.push({ displayName: "Holiday", value: day.holidayName });
        }
        if (day.events.length > 0) {
          items.push({ displayName: "Events", value: day.events.map(e => e.name).join(", ") });
        }
        self.secondaryMeta.forEach((meta, i) => {
          items.push({ displayName: meta.name, value: self.formatSecondary(i, day.secondaryValues[i]) });
        });

        const rect = (el as HTMLElement).getBoundingClientRect();
        self.host.tooltipService.show({
          dataItems: items as any,
          identities: day.selectionId ? [day.selectionId] : [],
          coordinates: [rect.left + rect.width / 2, rect.top],
          isTouchEvent: false,
        });
      });

      el.addEventListener("mouseout", function() {
        self.host.tooltipService.hide({ immediately: false, isTouchEvent: false });
      });

      // Keyboard users get the same tooltip when the cell receives focus
      el.addEventListener("focus", function() {
        (el as HTMLElement).dispatchEvent(new Event("mouseover"));
      });
      el.addEventListener("blur", function() {
        self.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
      });
    });
  }

  // ─── License ───────────────────────────────────────────────────────────────

  private requestLicenseDeferred(): void {
    if (this.licenseRequested) return;
    if (this.isPro) { this.licenseResolved = true; return; }   // build de test con Pro forzado
    this.licenseRequested = true;
    setTimeout(() => {
      try {
        this.resolveLicense().then(isPro => this.applyLicense(isPro));
      } catch (_) {
        // Free, sin avisos: si la licencia no se pudo leer no sabemos si ya pagó
        this.licenseInfoAvailable = false;
        this.licenseResolved = true;
      }
    }, 0);
  }

  private resolveLicense(): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      if (!this.licenseManager) { resolve(false); return; }
      this.licenseManager.getAvailableServicePlans().then(
        (result: any) => {
          // Donde la licencia no se puede consultar, un cliente de pago también se ve Free
          this.licenseEnvSupported  = !result?.isLicenseUnsupportedEnv;
          this.licenseInfoAvailable = result?.isLicenseInfoAvailable !== false;
          const plans: any[] = result?.plans ?? [];
          // ServicePlanState: Active = 1, Warning = 2. Warning es el periodo de gracia de un
          // cobro fallido: el cliente ya pagó y conserva Pro. La prueba de 30 días llega como Active.
          resolve(plans.some(p => p.spIdentifier === SP_IDENTIFIER &&
            ((p.state as unknown as number) === 1 || (p.state as unknown as number) === 2)));
        },
        () => { this.licenseInfoAvailable = false; resolve(false); }
      );
    });
  }

  private applyLicense(isPro: boolean): void {
    this.licenseResolved = true;
    if (!isPro || this.isPro) { this.notifyProBlocked(); return; }
    this.isPro = true;
    this.clearLicenseNotice();
    this.settings = this.rawSettings;
    if (this.lastDataView) {
      try { this.render(); } catch (_) { }
    }
  }

  /** Opciones Pro que el usuario ha fijado en este informe (solo lo que está en metadata.objects). */
  private attemptedPro(): string[] {
    const o: any = this.lastDataView?.metadata?.objects ?? {};
    const w: string[] = [];
    if (o.calendar?.view === "week") w.push("week view");
    if (parseInt(String(o.calendar?.monthsToShow ?? "1"), 10) > 1) w.push("several months");
    if ((o.events?.maxEventsVisible ?? 1) > 1) w.push("more than one event per day");
    if (o.events?.useGlobalColor !== undefined || o.events?.eventBgColor !== undefined ||
        o.events?.eventFontColor !== undefined || o.events?.eventFontSize !== undefined) w.push("event styling");
    if (o.labels) w.push("measure label styling");
    if (o.navigation) w.push("view button colours");
    if (o.eventCategoryColors) w.push("event category colours");
    return w;
  }

  /**
   * Avisos de compra de Power BI, que llevan la ruta de compra. Sustituyen al antiguo
   * toast propio ("🔒 … is available in Pro"): Microsoft pide no dibujar UI de licencias.
   * Solo con la licencia ya resuelta, y nunca donde no se puede leer.
   */
  private notifyProBlocked(clicked?: string): void {
    if (this.isPro) { this.clearLicenseNotice(); return; }
    if (!this.licenseResolved) return;
    const wanted = this.attemptedPro();
    if (clicked && wanted.indexOf(clicked) < 0) wanted.unshift(clicked);
    if (!wanted.length) { this.clearLicenseNotice(); return; }
    if (!this.licenseEnvSupported || !this.licenseInfoAvailable) return;

    const lm = this.licenseManager;
    if (!this.licenseIconShown) {
      this.licenseIconShown = true;
      // LicenseNotificationType.General es const enum: 0 en runtime
      try { lm?.notifyLicenseRequired?.(0); } catch (_) { /* best effort */ }
    }
    const sig = wanted.join("|");
    if (!clicked && sig === this.lastBlockedNotice) return;   // no repetir en cada resize
    this.lastBlockedNotice = sig;
    const one = wanted.length === 1;
    const list = one ? wanted[0] : wanted.slice(0, -1).join(", ") + " and " + wanted[wanted.length - 1];
    try {
      lm?.notifyFeatureBlocked?.(
        `Calendar Events Heatmap: ${list} ${one ? "is" : "are"} part of the Pro plan. ` +
        `Get a licence to enable ${one ? "it" : "them"}.`);
    } catch (_) { /* best effort */ }
  }

  private clearLicenseNotice(): void {
    this.lastBlockedNotice = "";
    if (!this.licenseIconShown) return;
    this.licenseIconShown = false;
    try { this.licenseManager?.clearLicenseNotification?.(); } catch (_) { /* best effort */ }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private pad2(n: number): string {
    return n < 10 ? "0" + n : String(n);
  }

  private dateKey(date: Date): string {
    return date.getFullYear() + "-" + this.pad2(date.getMonth() + 1) + "-" + this.pad2(date.getDate());
  }

  /** Parse a date value from Power BI. */
  private parseDate(value: any): Date | null {
    if (value === null || value === undefined) return null;

    // Cross-realm-safe Date detection
    if (typeof value === "object" && typeof (value as any).getTime === "function") {
      const t = (value as any).getTime();
      if (isNaN(t)) return null;
      const d = new Date(t);
      return (d.getFullYear() >= 1970 && d.getFullYear() <= 2100) ? d : null;
    }

    if (typeof value === "number") {
      if (!isFinite(value)) return null;
      let d: Date;
      if (value > 1e11) {
        d = new Date(value);
      } else if (value > 25000) {
        d = new Date((value - 25569) * 86400000);
      } else if (value >= 1970 && value <= 2100) {
        d = new Date(value, 0, 1);
      } else {
        return null;
      }
      if (isNaN(d.getTime())) return null;
      return (d.getFullYear() >= 1970 && d.getFullYear() <= 2100) ? d : null;
    }

    if (typeof value === "string") {
      if (value.length > 50) return null; // reject suspiciously long strings
      const d = new Date(value);
      if (isNaN(d.getTime())) return null;
      return (d.getFullYear() >= 1970 && d.getFullYear() <= 2100) ? d : null;
    }

    const d = new Date(String(value));
    if (isNaN(d.getTime())) return null;
    return (d.getFullYear() >= 1970 && d.getFullYear() <= 2100) ? d : null;
  }

  // ─── Accessibility helpers ─────────────────────────────────────────────────

  /** Reads the host color palette so the visual can honour Windows high-contrast themes. */
  private readHighContrast(): void {
    const cp: any = (this.host as any).colorPalette;
    this.hc = !!(cp && cp.isHighContrast);
    if (!this.hc) return;
    this.hcFg    = this.sanitizeColor(cp?.foreground?.value, "#000000");
    this.hcBg    = this.sanitizeColor(cp?.background?.value, "#ffffff");
    this.hcFgSel = this.sanitizeColor(cp?.foregroundSelected?.value, this.hcFg);
  }

  /**
   * Parses a `YYYY-MM-DD` cell key back into a local Date.
   * `new Date("2025-03-04")` is parsed as UTC midnight, which lands on the previous
   * day in any negative UTC offset — so the components are read explicitly instead.
   */
  private parseKey(key: string | undefined | null): Date | null {
    if (!key) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  /** Foreground color: the theme foreground in high contrast, the configured color otherwise. */
  private fg(configured: string | null | undefined, fallback: string): string {
    return this.hc ? this.hcFg : this.sanitizeColor(configured, fallback);
  }

  /** Accent color: the selected-foreground in high contrast, the configured color otherwise. */
  private accent(configured: string | null | undefined, fallback: string): string {
    return this.hc ? this.hcFgSel : this.sanitizeColor(configured, fallback);
  }

  /**
   * High contrast forbids encoding meaning in fill color, so the heatmap intensity
   * is re-encoded as border weight (1-4px) over the theme background.
   */
  private hcBorderWidth(value: number | null): number {
    if (value === null || this.valueMax === this.valueMin) return 1;
    const t = Math.max(0, Math.min(1, (value - this.valueMin) / (this.valueMax - this.valueMin)));
    return 1 + Math.round(t * 3);
  }

  /** Background + border for a day cell, honouring high-contrast mode. */
  private cellChrome(
    day: CalendarDay | undefined,
    isToday: boolean,
    isHoliday: boolean,
    accentColor: string,
    holidayColor: string,
  ): { bg: string; border: string } {
    if (this.hc) {
      const w = isToday ? 3 : this.hcBorderWidth(day?.measureValue ?? null);
      const style = day ? "solid" : "dotted";
      return { bg: this.hcBg, border: `${w}px ${style} ${isToday ? this.hcFgSel : this.hcFg}` };
    }
    // Precedence: a per-day rule wins, then a constant "Day Color", then the gradient.
    const fill = day?.ruleColor ?? (day ? this.settings.heatmap.dayColor : null) ?? day?.heatmapColor;
    return {
      bg: this.sanitizeColor(fill, this.settings.heatmap.colorNull),
      border: isToday
        ? `2px solid ${accentColor}`
        : isHoliday
          ? `1px solid ${holidayColor}`
          : "1px solid transparent",
    };
  }

  /** Screen-reader description of a day cell: date, value, holiday and events. */
  private cellAriaLabel(date: Date, day: CalendarDay | undefined): string {
    const parts: string[] = [
      date.toLocaleDateString("default", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      }),
    ];
    if (day?.measureValue != null) parts.push(`Value ${this.formatFull(day.measureValue)}`);
    else parts.push("No data");
    if (day?.isHoliday && day.holidayName) parts.push(`Holiday: ${day.holidayName}`);
    const evs = day?.events ?? [];
    if (evs.length === 1) parts.push(`1 event: ${evs[0].name}`);
    else if (evs.length > 1) parts.push(`${evs.length} events: ${evs.map(e => e.name).join(", ")}`);
    return parts.join(". ");
  }

  /**
   * Roving tabindex: exactly one day cell is tabbable, so Tab reaches the grid once
   * and the arrow keys move within it.
   */
  private setRovingTabindex(): void {
    const cells = Array.from(
      this.container.querySelectorAll("[data-date]")
    ) as HTMLElement[];
    if (cells.length === 0) return;

    let anchor = this.focusedKey
      ? cells.find(c => c.dataset.date === this.focusedKey)
      : undefined;
    if (!anchor) anchor = cells.find(c => c.dataset.hasData === "1") ?? cells[0];
    this.focusedKey = anchor.dataset.date ?? null;

    cells.forEach(c => c.setAttribute("tabindex", c === anchor ? "0" : "-1"));
  }

  /** Moves keyboard focus to a date, re-rendering first when it falls outside the view. */
  private moveFocusTo(target: Date): void {
    if (target.getFullYear() < 1970 || target.getFullYear() > 2100) return;
    this.focusedKey = this.dateKey(target);

    const el = this.container.querySelector(
      `[data-date="${this.focusedKey}"]`
    ) as HTMLElement | null;
    if (el) {
      this.setRovingTabindex();
      el.focus();
      return;
    }

    // Crossed a month/week boundary — navigate and restore focus after the render.
    this.currentDate = new Date(target);
    this.restoreFocus = true;
    this.render();
  }

  /** Keeps our mirror of the selection in sync with selectionManager's toggle semantics. */
  private trackSelection(key: string, multi: boolean): void {
    if (multi) {
      if (this.selectedKeys.has(key)) this.selectedKeys.delete(key);
      else this.selectedKeys.add(key);
      return;
    }
    if (this.selectedKeys.size === 1 && this.selectedKeys.has(key)) this.selectedKeys.clear();
    else { this.selectedKeys.clear(); this.selectedKeys.add(key); }
  }

  /** Paints aria-selected, the selection outline and the dimming of unselected days. */
  private applySelectionStyles(): void {
    const outline = this.hc
      ? this.hcFgSel
      : this.sanitizeColor(this.settings.navigation.activeColor, "#C96442");
    const any = this.selectedKeys.size > 0;

    (Array.from(this.container.querySelectorAll("[data-date]")) as HTMLElement[])
      .forEach(el => {
        const on = this.selectedKeys.has(el.dataset.date ?? "");
        el.setAttribute("aria-selected", on ? "true" : "false");
        el.style.outline = on ? `2px solid ${outline}` : "";
        el.style.outlineOffset = on ? "-2px" : "";
        el.style.opacity = any && !on ? "0.45" : "1";
      });
  }

  /** Validate a color value from settings before placing it in a style attribute. */
  private sanitizeColor(val: string | null | undefined, fallback: string): string {
    if (!val) return fallback;
    const s = String(val).trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
    if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(s)) return s;
    if (/^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)$/.test(s)) return s;
    return fallback;
  }

  /** Validate a font-family value from settings before placing it in a style attribute. */
  private sanitizeFont(val: string | null | undefined, fallback: string): string {
    if (!val) return fallback;
    // Strip characters that could break CSS context (keep only font-safe chars)
    const s = String(val).replace(/[;<>{}\\"\n\r]/g, "").trim();
    return s || fallback;
  }

  private heatmapColor(value: number | null, min: number, max: number): string {
    if (value === null || min === max) return this.settings.heatmap.colorNull;
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return this.interpolateColor(this.settings.heatmap.colorMin, this.settings.heatmap.colorMax, t);
  }

  private interpolateColor(hex1: string, hex2: string, t: number): string {
    const parse = (h: string) => {
      const c = h.replace("#", "");
      return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
    };
    const [r1, g1, b1] = parse(hex1);
    const [r2, g2, b2] = parse(hex2);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${b})`;
  }

  /**
   * Builds a Power BI value formatter. `sampleValue` opts into display units, so a large
   * measure abbreviates to "1.2M" while still honouring its own format string.
   * Returns null when the formatter cannot be created, and callers fall back to plain text.
   */
  private makeFormatter(format: string, sampleValue: number | undefined): IValueFormatter | null {
    try {
      return valueFormatter.create(
        sampleValue === undefined
          ? { format: format || undefined }
          : { format: format || undefined, value: sampleValue },
      );
    } catch (_) {
      return null;
    }
  }

  /**
   * Reads the colour a conditional-formatting rule resolved for this row.
   *
   * With a `table` mapping Power BI attaches the rule output to
   * `DataViewTableRow.objects`, one entry per column, on the column named by the rule's
   * output selector — here the `date` role. Read defensively: when no rule is set the
   * whole chain is absent, which is the normal case.
   */
  private readRuleColor(row: powerbi.DataViewTableRow, dateIdx: number): string | null {
    if (dateIdx < 0) return null;
    const objs = (row as any)?.objects;
    if (!objs) return null;
    const color = objs[dateIdx]?.["heatmap"]?.["dayColor"]?.solid?.color;
    if (!color) return null;
    const safe = this.sanitizeColor(String(color), "");
    return safe || null;
  }

  /** Fallback used when no format string is available and no formatter could be built. */
  private compactFallback(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  }

  /** Compact value for the label printed inside a day cell. */
  private formatValue(value: any): string {
    if (value === null || value === undefined) return "—";
    if (typeof value !== "number") return String(value);
    if (!isFinite(value)) return "—";
    if (this.labelFormatter) {
      try { return this.labelFormatter.format(value); } catch (_) { /* fall through */ }
    }
    return this.compactFallback(value);
  }

  /** Full-precision value for tooltips and screen-reader labels. */
  private formatFull(value: any): string {
    if (value === null || value === undefined) return "—";
    if (typeof value !== "number") return String(value);
    if (!isFinite(value)) return "—";
    if (this.fullFormatter) {
      try { return this.fullFormatter.format(value); } catch (_) { /* fall through */ }
    }
    return value.toLocaleString();
  }

  /** Formats one Tooltip Measure with that column's own format string. */
  private formatSecondary(index: number, value: number | null): string {
    if (value === null || value === undefined || !isFinite(value)) return "—";
    const f = this.secondaryMeta[index]?.formatter;
    if (f) {
      try { return f.format(value); } catch (_) { /* fall through */ }
    }
    return value.toLocaleString();
  }

  private categoryColor(category: string): string {
    const palette = ["#C96442", "#9C87F5", "#4BA3C3", "#E8A838", "#5BAD6F", "#D06E8C"];
    if (!category) return palette[0];
    let hash = 0;
    for (let i = 0; i < category.length; i++) hash = category.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  }

  /** Returns the user-configured color for the event category, or falls back to the auto-palette. */
  private getCategoryColor(category: string): string {
    const idx = this.uniqueEventCategories.indexOf(category);
    if (this.isPro && idx >= 0 && idx < 8) {   // colores por categoría: Pro
      const obj = this.lastDataView?.metadata?.objects?.["eventCategoryColors"];
      const configured = (obj?.[`c${idx}`] as any)?.solid?.color;
      if (configured) return this.sanitizeColor(configured, this.categoryColor(category));
    }
    return this.categoryColor(category);
  }

  /** Renders a small color legend strip mapping category name → color swatch. */
  private buildCategoryLegend(): HTMLElement | null {
    if (!this.settings.events.showEvents || this.uniqueEventCategories.length === 0) return null;

    const container = document.createElement("div");
    container.setAttribute("role", "list");
    container.setAttribute("aria-label", "Event categories");
    container.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;flex-shrink:0;";

    this.uniqueEventCategories.slice(0, 8).forEach(cat => {
      const color = this.sanitizeColor(this.getCategoryColor(cat), "#C96442");

      const item = document.createElement("span");
      item.setAttribute("role", "listitem");
      item.setAttribute("aria-label", `Event category: ${cat || "Default"}`);
      item.style.cssText = `display:inline-flex;align-items:center;gap:3px;font-size:9px;color:${this.fg(null, "#83827D")};white-space:nowrap;`;

      const swatch = document.createElement("span");
      swatch.style.display = "inline-block";
      swatch.style.width = "8px";
      swatch.style.height = "8px";
      swatch.style.borderRadius = "2px";
      swatch.style.backgroundColor = this.hc ? this.hcBg : color;
      if (this.hc) swatch.style.border = `2px solid ${this.hcFg}`;
      swatch.style.flexShrink = "0";

      const labelEl = document.createElement("span");
      labelEl.textContent = cat || "(Default)";   // safe: textContent, never innerHTML

      item.appendChild(swatch);
      item.appendChild(labelEl);
      container.appendChild(item);
    });

    return container;
  }

  private navBtnStyle(): string {
    const c = this.fg(this.settings.navigation.textColor, "#535146");
    const bd = this.hc ? this.hcFg : "#DAD9D4";
    const bg = this.hc ? this.hcBg : "none";
    return `background:${bg};border:1px solid ${bd};border-radius:4px;cursor:pointer;padding:4px 8px;font-size:12px;color:${c};`;
  }

  private viewBtnStyle(active: boolean): string {
    const ac = this.accent(this.settings.navigation.activeColor, "#C96442");
    const tc = this.fg(this.settings.navigation.textColor, "#535146");
    if (this.hc) {
      // High contrast: never fill with an accent — mark the active button by border weight.
      return `background:${this.hcBg};color:${this.hcFg};border:${active ? 3 : 1}px solid ${active ? this.hcFgSel : this.hcFg};border-radius:4px;cursor:pointer;padding:2px 8px;font-size:11px;`;
    }
    return active
      ? `background:${ac};color:#fff;border:1px solid ${ac};border-radius:4px;cursor:pointer;padding:2px 8px;font-size:11px;`
      : `background:none;color:${tc};border:1px solid #DAD9D4;border-radius:4px;cursor:pointer;padding:2px 8px;font-size:11px;`;
  }

  public enumerateObjectInstances(options: powerbi.EnumerateVisualObjectInstancesOptions): powerbi.VisualObjectInstanceEnumeration {
    // El panel muestra lo que eligió el usuario, no los valores efectivos de Free:
    // si mostrara los de Free, parecería que el ajuste no se ha aplicado.
    const effective = this.settings;
    this.settings = this.rawSettings;
    try { return this.enumerateInstances(options); } finally { this.settings = effective; }
  }

  private enumerateInstances(options: powerbi.EnumerateVisualObjectInstancesOptions): powerbi.VisualObjectInstanceEnumeration {
    const instances: powerbi.VisualObjectInstance[] = [];
    const { objectName } = options;

    if (objectName === "calendar") {
      instances.push({
        objectName,
        selector: null as any,
        properties: {
          view: this.settings.calendar.view,
          monthsToShow: String(this.settings.calendar.monthsToShow),
          fiscalEnabled: this.settings.calendar.fiscalEnabled,
          fiscalStartMonth: this.settings.calendar.fiscalStartMonth,
          weekStart: String(this.settings.calendar.weekStart),
        },
      });
    }
    if (objectName === "heatmap") {
      instances.push({
        objectName,
        selector: null as any,
        properties: {
          colorMin: { solid: { color: this.settings.heatmap.colorMin } },
          colorMax: { solid: { color: this.settings.heatmap.colorMax } },
          colorNull: { solid: { color: this.settings.heatmap.colorNull } },
          dayColor: { solid: { color: this.settings.heatmap.colorMax } },
        },
        // ConstantOrRule = Constant | Rule. VisualEnumerationInstanceKinds is a
        // `const enum`, so it cannot be referenced at runtime — the literal is used.
        propertyInstanceKind: { dayColor: 3 },
        altConstantValueSelector: null as any,
      } as powerbi.VisualObjectInstance);
    }
    if (objectName === "dayNumber") {
      instances.push({
        objectName,
        selector: null as any,
        properties: {
          fontSize: this.settings.dayNumber.fontSize,
          fontFamily: this.settings.dayNumber.fontFamily,
          color: { solid: { color: this.settings.dayNumber.color } },
          weekendColor: { solid: { color: this.settings.dayNumber.weekendColor } },
          holidayColor: { solid: { color: this.settings.dayNumber.holidayColor } },
        },
      });
    }
    // Tarjetas Pro visibles también en Free (llevan "[Pro]"): si no, nadie descubre que existen
    if (objectName === "labels") {
      instances.push({
        objectName,
        selector: null as any,
        properties: {
          fontSize: this.settings.labels.fontSize,
          fontFamily: this.settings.labels.fontFamily,
          color: { solid: { color: this.settings.labels.color } },
        },
      });
    }
    if (objectName === "navigation") {
      instances.push({
        objectName,
        selector: null as any,
        properties: {
          activeColor: { solid: { color: this.settings.navigation.activeColor } },
          textColor: { solid: { color: this.settings.navigation.textColor } },
        },
      });
    }
    if (objectName === "events") {
      const evtProps: Record<string, any> = {
        showEvents: this.settings.events.showEvents,
        maxEventsVisible: this.settings.events.maxEventsVisible,
        useGlobalColor: this.settings.events.useGlobalColor,
        eventFontColor: { solid: { color: this.settings.events.eventFontColor } },
        eventFontSize: this.settings.events.eventFontSize,
      };
      if (this.settings.events.useGlobalColor) {
        evtProps["eventBgColor"] = { solid: { color: this.settings.events.eventBgColor ?? "#C96442" } };
      }
      instances.push({ objectName, selector: null as any, properties: evtProps });
    }

    if (objectName === "eventCategoryColors") {
      const catObj = this.lastDataView?.metadata?.objects?.["eventCategoryColors"];
      const cats = this.uniqueEventCategories.slice(0, 8);
      const props: Record<string, any> = {};
      cats.forEach((cat, idx) => {
        props[`c${idx}`] = { solid: { color: (catObj?.[`c${idx}`] as any)?.solid?.color ?? this.categoryColor(cat) } };
      });
      for (let i = cats.length; i < 8; i++) {
        props[`c${i}`] = { solid: { color: (catObj?.[`c${i}`] as any)?.solid?.color ?? this.categoryColor("") } };
      }
      instances.push({ objectName, selector: null as any, properties: props });
    }

    return instances;
  }
}
