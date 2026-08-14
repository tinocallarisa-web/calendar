/// <reference types="powerbi-visuals-api" />
import powerbi from "powerbi-visuals-api";
import { SP_IDENTIFIER, TRIAL_DAYS, CalendarSettings, parseSettings, defaultSettings } from "./settings";

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
  events: CalendarEvent[];
  isHoliday: boolean;
  holidayName: string;
  isWeekend: boolean;
  isCurrentMonth: boolean;
  selectionId: powerbi.visuals.ISelectionId | null;
  tooltipItems: powerbi.extensibility.VisualTooltipDataItem[];
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
  private trialActive: boolean = false;

  private settings: CalendarSettings = defaultSettings;
  private currentView: "month" | "week" = "month";
  private viewInitialized: boolean = false;   // only apply "Default View" setting once
  private currentDate: Date = new Date();
  private calendarData: CalendarDay[] = [];
  private hasRenderedData: boolean = false;
  private lastDataView: powerbi.DataView | null = null;
  private uniqueEventCategories: string[] = [];  // ordered by first appearance in data
  private viewport: { width: number; height: number } = { width: 400, height: 300 };

  constructor(options: powerbi.extensibility.visual.VisualConstructorOptions) {
    this.host = options.host;
    this.events = options.host.eventService;
    this.selectionManager = options.host.createSelectionManager();
    this.licenseManager = (options.host as any).licenseManager;

    // Root container
    this.container = document.createElement("div");
    this.container.className = "tcviz-calendar";
    this.container.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: 'Segoe UI', system-ui, sans-serif;
      box-sizing: border-box;
      position: relative;
    `;
    options.element.appendChild(this.container);

  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
    this.events.renderingStarted(options);

    try {
      const dataView = options.dataViews?.[0];

      // Landing page — no data yet
      if (!dataView?.table) {
        this.renderLandingPage();
        this.events.renderingFinished(options);
        return;
      }

      this.lastDataView = dataView;
      this.settings = parseSettings(dataView);
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
          // Sanity: only navigate if target is a real date (1970–2100)
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

    // Pre-collect unique event categories (ordered by first appearance) so color
    // slots are stable across renders and can be read from capabilities settings.
    {
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (let r = 0; r < table.rows.length; r++) {
        if (eventCatIdx >= 0 && table.rows[r][eventCatIdx] != null) {
          const cat = String(table.rows[r][eventCatIdx] ?? "");
          if (!seen.has(cat)) { seen.add(cat); ordered.push(cat); }
        }
      }
      this.uniqueEventCategories = ordered;
    }

    const dayMap = new Map<string, CalendarDay>();
    const events: CalendarEvent[] = [];
    const holidays = new Map<string, string>(); // dateKey → name

    const selectionBuilder = this.host.createSelectionIdBuilder;

    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];

      // Holidays — date comes from the shared Date role
      if (holidayNameIdx >= 0 && row[holidayNameIdx] != null && String(row[holidayNameIdx]).trim() !== "") {
        const hDateRaw = dateIdx >= 0 ? row[dateIdx] : null;
        if (hDateRaw) {
          const hDate = this.parseDate(hDateRaw);
          if (hDate) {
            holidays.set(this.dateKey(hDate), String(row[holidayNameIdx]).trim());
          }
        }
      }

      // Events — date comes from the shared Date role (data pre-expanded per day)
      if (eventNameIdx >= 0 && row[eventNameIdx]) {
        const startDate = dateIdx >= 0 && row[dateIdx] ? this.parseDate(row[dateIdx]) : null;
        const endDate = startDate;

        if (startDate) {
          events.push({
            name: String(row[eventNameIdx]),
            startDate,
            endDate: endDate ?? startDate,
            category: eventCatIdx >= 0 ? String(row[eventCatIdx] ?? "") : "",
            color: this.getCategoryColor(eventCatIdx >= 0 ? String(row[eventCatIdx] ?? "") : ""),
            spansMultipleDays: endDate ? endDate.getTime() > startDate.getTime() : false,
          });
        }
      }

      // Measure rows — aggregate by date (sum across SKUs, areas, etc.)
      if (dateIdx >= 0 && row[dateIdx]) {
        const date = this.parseDate(row[dateIdx]);
        if (!date) continue;
        const key = this.dateKey(date);
        const rowMeasure = measureIdx >= 0 ? (row[measureIdx] as number | null) : null;

        if (!dayMap.has(key)) {
          const selId = this.host.createSelectionIdBuilder()
            .withTable(table, r)
            .createSelectionId();

          dayMap.set(key, {
            date,
            measureValue: rowMeasure ?? null,
            highlightValue: null,
            heatmapColor: this.settings.heatmap.colorNull,
            events: [],
            isHoliday: false,
            holidayName: "",
            isWeekend: date.getDay() === 0 || date.getDay() === 6,
            isCurrentMonth: true,
            selectionId: selId,
            tooltipItems: secondaryIdxs.map(i => ({
              displayName: cols[i].displayName,
              value: this.formatValue(row[i]),
            })),
          });
        } else {
          // Aggregate: sum measures for the same day
          const existing = dayMap.get(key)!;
          if (rowMeasure !== null && rowMeasure !== undefined) {
            existing.measureValue = (existing.measureValue ?? 0) + rowMeasure;
          }
          // Aggregate secondary measures too (sum across rows for the same day)
          secondaryIdxs.forEach((colIdx, tipIdx) => {
            const v = row[colIdx] as number | null;
            if (v !== null && v !== undefined && existing.tooltipItems[tipIdx]) {
              const prev = parseFloat(existing.tooltipItems[tipIdx].value.replace(/[^0-9.-]/g, "")) || 0;
              existing.tooltipItems[tipIdx].value = this.formatValue(prev + v);
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
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    dayMap.forEach(day => {
      day.heatmapColor = this.heatmapColor(day.measureValue, minVal, maxVal);
    });

    return Array.from(dayMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  private render(): void {
    const svg = this.currentView === "month"
      ? this.buildMonthView()
      : this.buildWeekView();

    // Atomic swap
    while (this.container.firstChild) this.container.removeChild(this.container.firstChild);

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:100%;height:100%;";
    /* eslint-disable powerbi-visuals/no-inner-outer-html */
    wrapper.innerHTML = svg;
    /* eslint-enable powerbi-visuals/no-inner-outer-html */
    this.container.appendChild(wrapper);

    // Show guidance when data is connected but dates can't be parsed
    if (this.calendarData.length === 0 && this.lastDataView?.table) {
      const t = this.lastDataView.table;
      const cols = t.columns ?? [];
      const row0 = t.rows?.[0] ?? [];
      const dateIdx = cols.findIndex(c => (c.roles ?? {})["date"]);
      const rawDate = dateIdx >= 0 ? row0[dateIdx] : undefined;
      const isYearValue = typeof rawDate === "number" && rawDate > 1980 && rawDate < 2100;

      const msg = isYearValue
        ? `⚠️ <b>Connect the Date field as a Date, not as a Year hierarchy.</b><br>
           In the Field Well, click the ▼ next to your date field and select <b>Date</b> (not Date Hierarchy).<br>
           Or: File → Options → Current file → Data Load → uncheck <i>Auto date/time</i>.`
        : `⚠️ <b>No data received.</b><br>
           Connect a <b>Date</b> column and a <b>Main Measure</b> to this visual.`;

      const dbg = document.createElement("div");
      dbg.style.cssText = `
        position:absolute;inset:12px;background:rgba(255,255,255,0.95);
        border:2px solid #C96442;border-radius:8px;
        display:flex;align-items:center;justify-content:center;
        font-size:12px;color:#3D3929;text-align:center;padding:16px;
        z-index:9999;line-height:1.6;
      `;
      /* eslint-disable powerbi-visuals/no-inner-outer-html */
      dbg.innerHTML = msg;
      /* eslint-enable powerbi-visuals/no-inner-outer-html */
      this.container.appendChild(dbg);
    }

    this.attachInteractions(wrapper);
  }

  private buildMonthView(): string {
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

    let html = `
      <div style="display:flex;flex-direction:column;height:100%;padding:8px;box-sizing:border-box;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;">
          <button data-nav="prev" style="${this.navBtnStyle()}">&#8592;</button>
          <span style="font-weight:600;font-size:14px;color:#3D3929;">${headerLabel}</span>
          <button data-nav="next" style="${this.navBtnStyle()}">&#8594;</button>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:8px;flex-shrink:0;">
          <button data-view="month" style="${this.viewBtnStyle(this.currentView === "month")}">Month</button>
          <button data-view="week" style="${this.viewBtnStyle(false)}">${this.isPro ? "Week" : "Week 🔒"}</button>
        </div>
        ${this.buildCategoryLegend()}
        <div style="display:flex;flex-direction:row;gap:12px;flex:1;overflow:hidden;min-height:0;">
    `;

    for (let m = 0; m < n; m++) {
      const totalMonths = startDate.getMonth() + m;
      const yr = startDate.getFullYear() + Math.floor(totalMonths / 12);
      const mo = totalMonths % 12;
      html += this.buildSingleMonthGrid(yr, mo, dayNames, dayMap, today, n);
    }

    html += `</div></div>`;
    return html;
  }

  private buildSingleMonthGrid(
    year: number,
    month: number,
    dayNames: string[],
    dayMap: Map<string, CalendarDay>,
    today: string,
    totalMonths: number,
  ): string {
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

    const numFontSz = totalMonths > 6 ? "8px" : "10px";
    const showMeasure = totalMonths <= 6;
    const showEvents = this.settings.events.showEvents && totalMonths <= 3;

    const minColW = totalMonths > 1 ? "180px" : "0px";
    let html = `
      <div style="flex:1 0 ${minColW};min-width:${minColW};display:flex;flex-direction:column;min-height:0;overflow:hidden;">
        ${totalMonths > 1 ? `<div style="text-align:center;font-size:12px;font-weight:600;color:#3D3929;margin-bottom:6px;flex-shrink:0;">${monthName}</div>` : ""}
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;flex-shrink:0;">
          ${dayNames.map(dn => `<div style="text-align:center;font-size:10px;font-weight:600;color:#83827D;padding:2px 0;overflow:hidden;">${dn}</div>`).join("")}
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;overflow:hidden;">
    `;

    grid.forEach(wk => {
      html += `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;flex:1;min-height:0;">`;
      wk.forEach(date => {
        if (!date) {
          html += `<div style="background:#F5F3ED;border-radius:4px;opacity:0.3;overflow:hidden;"></div>`;
          return;
        }
        const key = this.dateKey(date);
        const day = dayMap.get(key);
        const isToday = key === today;
        const bgColor = day?.heatmapColor ?? this.settings.heatmap.colorNull;
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const isHoliday = day?.isHoliday ?? false;
        const events = day?.events ?? [];
        const maxEvt = this.isPro ? this.settings.events.maxEventsVisible : 1;
        const visibleEvents = showEvents ? events.slice(0, maxEvt) : [];
        const moreCount = showEvents ? events.length - visibleEvents.length : 0;

        const dayNumColor = isHoliday
          ? this.settings.dayNumber.holidayColor
          : isWeekend ? this.settings.dayNumber.weekendColor
          : this.settings.dayNumber.color;
        const dayNumSz = `${this.settings.dayNumber.fontSize}px`;
        const dayNumFont = this.settings.dayNumber.fontFamily;
        const lblSz = `${this.settings.labels.fontSize}px`;
        const lblFont = this.settings.labels.fontFamily;
        const lblColor = this.settings.labels.color;
        const evtBg = (e: CalendarEvent) => (this.settings.events.useGlobalColor && this.settings.events.eventBgColor) ? this.settings.events.eventBgColor : e.color;
        const evtFg = this.settings.events.eventFontColor;
        const evtFontSz = `${this.settings.events.eventFontSize}px`;
        const evtFont = this.settings.labels.fontFamily;
        const todayBorder = `2px solid ${this.settings.navigation.activeColor}`;
        const holidayBorder = `1px solid ${this.settings.dayNumber.holidayColor}`;

        html += `
          <div data-date="${key}" data-has-data="${day ? "1" : "0"}"
               style="background:${bgColor};border-radius:4px;padding:3px;cursor:${day ? "pointer" : "default"};
                      border:${isToday ? todayBorder : isHoliday ? holidayBorder : "1px solid transparent"};
                      display:flex;flex-direction:column;overflow:hidden;min-height:0;">
            <div style="font-size:${dayNumSz};font-family:${dayNumFont};font-weight:${isToday ? "700" : "400"};color:${dayNumColor};line-height:1;white-space:nowrap;flex-shrink:0;">
              ${date.getDate()}${isHoliday ? "✦" : ""}
            </div>
            ${showMeasure && day?.measureValue != null ? `<div style="font-size:${lblSz};font-family:${lblFont};color:${lblColor};font-weight:600;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;">${this.formatValue(day.measureValue)}</div>` : ""}
            ${visibleEvents.map(e => `<div style="background:${evtBg(e)};color:${evtFg};border-radius:2px;font-size:${evtFontSz};font-family:${evtFont};padding:1px 3px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;">${e.name}</div>`).join("")}
            ${moreCount > 0 ? `<div style="font-size:8px;color:#83827D;margin-top:1px;white-space:nowrap;flex-shrink:0;">+${moreCount}</div>` : ""}
          </div>
        `;
      });
      html += `</div>`;
    });

    html += `</div></div>`;
    return html;
  }

  private buildWeekView(): string {
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

    let html = `
      <div style="display:flex;flex-direction:column;height:100%;padding:8px;box-sizing:border-box;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-shrink:0;">
          <button data-nav="prev" style="${this.navBtnStyle()}">&#8592;</button>
          <span style="font-weight:600;font-size:14px;color:#3D3929;">${weekLabel}</span>
          <button data-nav="next" style="${this.navBtnStyle()}">&#8594;</button>
        </div>
        <div style="display:flex;gap:4px;margin-bottom:8px;flex-shrink:0;">
          <button data-view="month" style="${this.viewBtnStyle(false)}">Month</button>
          <button data-view="week" style="${this.viewBtnStyle(true)}">${this.isPro ? "Week" : "Week 🔒"}</button>
        </div>
        ${this.buildCategoryLegend()}
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;flex:1;min-height:0;overflow:hidden;">
    `;

    const dn = this.settings.dayNumber;
    const lbl = this.settings.labels;
    const nav = this.settings.navigation;
    const evts = this.settings.events;

    days.forEach((date, i) => {
      const key = this.dateKey(date);
      const day = dayMap.get(key);
      const isToday = key === today;
      const bgColor = day?.heatmapColor ?? this.settings.heatmap.colorNull;
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isHoliday = day?.isHoliday ?? false;
      const events = day?.events ?? [];
      const dayNumColor = isHoliday ? dn.holidayColor : isWeekend ? dn.weekendColor : dn.color;
      const evtBg = (e: CalendarEvent) => evts.eventBgColor ?? e.color;

      const maxWeekEvts = Math.max(evts.maxEventsVisible, 5);
      const visibleWeekEvts = events.slice(0, maxWeekEvts);
      const moreWeekCount = events.length - visibleWeekEvts.length;

      html += `
        <div data-date="${key}" data-has-data="${day ? "1" : "0"}"
             style="background:${bgColor};border-radius:6px;padding:6px;cursor:${day ? "pointer" : "default"};
                    border:${isToday ? `2px solid ${nav.activeColor}` : isHoliday ? `1px solid ${dn.holidayColor}` : "1px solid transparent"};
                    display:flex;flex-direction:column;gap:4px;overflow:hidden;">
          <div style="font-size:${dn.fontSize}px;font-family:${dn.fontFamily};font-weight:600;color:${dayNumColor};white-space:nowrap;">${dayNames[i]}</div>
          <div style="font-size:${Math.round(dn.fontSize * 1.6)}px;font-family:${dn.fontFamily};font-weight:${isToday ? "700" : "400"};color:${dn.color};white-space:nowrap;">${date.getDate()}${isHoliday ? " ✦" : ""}</div>
          ${day?.measureValue != null ? `<div style="font-size:${lbl.fontSize}px;font-family:${lbl.fontFamily};font-weight:600;color:${lbl.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.formatValue(day.measureValue)}</div>` : ""}
          ${isHoliday ? `<div style="font-size:${lbl.fontSize}px;font-family:${lbl.fontFamily};color:${dn.holidayColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${day?.holidayName}</div>` : ""}
          ${visibleWeekEvts.map(e => `
            <div style="background:${evtBg(e)};color:${evts.eventFontColor};border-radius:3px;font-size:${evts.eventFontSize}px;font-family:${lbl.fontFamily};padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.name}</div>
          `).join("")}
          ${moreWeekCount > 0 ? `<div style="font-size:${lbl.fontSize}px;color:#83827D;">+${moreWeekCount}</div>` : ""}
        </div>
      `;
    });

    html += `</div></div>`;
    return html;
  }

  private renderLandingPage(): void {
    const html = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#83827D;font-family:'Segoe UI',system-ui,sans-serif;text-align:center;padding:16px;box-sizing:border-box;">
        <div style="font-size:32px;margin-bottom:8px;">📅</div>
        <div style="font-size:14px;font-weight:600;color:#3D3929;margin-bottom:4px;">Calendar by TCViz</div>
        <div style="font-size:11px;line-height:1.5;max-width:200px;">Add a Date field and a Measure to see your calendar heatmap with event overlays.</div>
      </div>
    `;
    while (this.container.firstChild) this.container.removeChild(this.container.firstChild);
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:100%;height:100%;";
    /* eslint-disable powerbi-visuals/no-inner-outer-html */
    wrapper.innerHTML = html;
    /* eslint-enable powerbi-visuals/no-inner-outer-html */
    this.container.appendChild(wrapper);
  }

  // ─── Interactions ──────────────────────────────────────────────────────────

  private attachInteractions(wrapper: HTMLElement): void {
    // Day click → filter / clear selection
    wrapper.addEventListener("click", (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-date]") as HTMLElement;

      // Click on empty background → clear any active selection so slicers work again
      if (!target || target.dataset.hasData !== "1") {
        this.selectionManager.clear();
        return;
      }

      const dateKey = target.dataset.date!;
      const day = this.calendarData.find(d => this.dateKey(d.date) === dateKey);
      if (!day?.selectionId) return;

      this.selectionManager.select(day.selectionId, e.ctrlKey || e.metaKey);
    });

    // Context menu (right-click) → Power BI standard context menu
    wrapper.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
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
        this.showUpgradePrompt("Week view");
        return;
      }
      this.currentView = requested;
      this.render();
    });

    // Tooltips via Power BI tooltip service
    const dayMap = new Map(this.calendarData.map(d => [this.dateKey(d.date), d]));
    const self = this;

    wrapper.querySelectorAll("[data-date][data-has-data='1']").forEach(el => {
      el.addEventListener("mouseover", function(e: Event) {
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
          items.push({ displayName: "Value", value: self.formatValue(day.measureValue) });
        }
        if (day.isHoliday) {
          items.push({ displayName: "Holiday", value: day.holidayName });
        }
        if (day.events.length > 0) {
          items.push({ displayName: "Events", value: day.events.map(e => e.name).join(", ") });
        }
        items.push(...day.tooltipItems);

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
    });
  }

  // ─── License ───────────────────────────────────────────────────────────────

  private requestLicenseDeferred(): void {
    if (this.licenseRequested || this.isPro) return;
    this.licenseRequested = true;
    setTimeout(() => {
      try {
        this.resolveLicense().then(isPro => this.applyLicense(isPro));
      } catch (_) { /* stay Free */ }
    }, 0);
  }

  private resolveLicense(): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      if (!this.licenseManager) { resolve(false); return; }
      this.licenseManager.getAvailableServicePlans().then(
        (result: any) => {
          const plans: any[] = result?.plans ?? [];
          const active = plans.find(
            p => p.spIdentifier === SP_IDENTIFIER && (p.state as unknown as number) === 1
          );
          resolve(!!active);
        },
        () => resolve(false)
      );
    });
  }

  private applyLicense(isPro: boolean): void {
    if (!isPro || this.isPro) return;
    this.isPro = true;
    if (this.lastDataView) {
      try { this.render(); } catch (_) { }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private pad2(n: number): string {
    return n < 10 ? "0" + n : String(n);
  }

  private dateKey(date: Date): string {
    return date.getFullYear() + "-" + this.pad2(date.getMonth() + 1) + "-" + this.pad2(date.getDate());
  }

  /** Parse a date value from Power BI.
   *  Power BI sends dates in table views as JavaScript Date objects or ISO strings.
   *  Numeric fallback handles OLE date serials (e.g. 45292 = Jan 1 2024).
   *  All results are validated to fall within 1970–2100.
   */
  private parseDate(value: any): Date | null {
    if (value === null || value === undefined) return null;

    // Cross-realm-safe Date detection (instanceof fails across iframes)
    if (typeof value === "object" && typeof (value as any).getTime === "function") {
      const t = (value as any).getTime();
      if (isNaN(t)) return null;
      const d = new Date(t);
      return (d.getFullYear() >= 1970 && d.getFullYear() <= 2100) ? d : null;
    }

    if (typeof value === "number") {
      let d: Date;
      if (value > 1e11) {
        // Unix millisecond timestamp  (Jan 1 2024 = ~1.7e12)
        d = new Date(value);
      } else if (value > 25000) {
        // OLE automation date serial — days since Dec 30 1899
        // Jan 1 2024 = 45292;  plausible range 25000–80000 covers ~1968–2118
        d = new Date((value - 25569) * 86400000);
      } else if (value >= 1970 && value <= 2100) {
        // Looks like a year number (Power BI date hierarchy at Year level)
        // Best-effort: treat as Jan 1 of that year
        d = new Date(value, 0, 1);
      } else {
        return null;
      }
      if (isNaN(d.getTime())) return null;
      return (d.getFullYear() >= 1970 && d.getFullYear() <= 2100) ? d : null;
    }

    if (typeof value === "string") {
      const d = new Date(value);
      if (isNaN(d.getTime())) return null;
      return (d.getFullYear() >= 1970 && d.getFullYear() <= 2100) ? d : null;
    }

    // Last resort
    const d = new Date(String(value));
    if (isNaN(d.getTime())) return null;
    return (d.getFullYear() >= 1970 && d.getFullYear() <= 2100) ? d : null;
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

  private formatValue(value: any): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number") {
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
      return value.toLocaleString();
    }
    return String(value);
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
    if (idx >= 0 && idx < 8) {
      const obj = this.lastDataView?.metadata?.objects?.["eventCategoryColors"];
      const configured = (obj?.[`c${idx}`] as any)?.solid?.color;
      if (configured) return configured;
    }
    return this.categoryColor(category);
  }

  /** Shows a non-disruptive toast when a Free user tries a Pro feature. */
  private showUpgradePrompt(feature: string): void {
    const existing = this.container.querySelector(".tcviz-upgrade-toast") as HTMLElement | null;
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "tcviz-upgrade-toast";
    toast.style.cssText = [
      "position:absolute;bottom:12px;left:50%;transform:translateX(-50%);",
      "background:#3D3929;color:#fff;padding:8px 16px;border-radius:6px;",
      "font-size:11px;font-family:'Segoe UI',system-ui,sans-serif;",
      "z-index:9999;white-space:nowrap;pointer-events:none;",
      "box-shadow:0 2px 8px rgba(0,0,0,0.25);",
    ].join("");
    /* eslint-disable powerbi-visuals/no-inner-outer-html */
    toast.innerHTML = `🔒 <b>${feature}</b> is available in Calendar Events Heatmap Pro`;
    /* eslint-enable powerbi-visuals/no-inner-outer-html */
    this.container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
  }

  /** Renders a small color legend strip mapping slot number → category name.
   *  Only shown when events are enabled and categories exist. */
  private buildCategoryLegend(): string {
    if (!this.settings.events.showEvents || this.uniqueEventCategories.length === 0) return "";
    const items = this.uniqueEventCategories.slice(0, 8).map((cat, idx) => {
      const color = this.getCategoryColor(cat);
      return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:#83827D;white-space:nowrap;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0;"></span>
        <span>${cat || "(Default)"}</span>
      </span>`;
    }).join("");
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;flex-shrink:0;">${items}</div>`;
  }

  private navBtnStyle(): string {
    const c = this.settings.navigation.textColor;
    return `background:none;border:1px solid #DAD9D4;border-radius:4px;cursor:pointer;padding:4px 8px;font-size:12px;color:${c};`;
  }

  private viewBtnStyle(active: boolean): string {
    const ac = this.settings.navigation.activeColor;
    const tc = this.settings.navigation.textColor;
    return active
      ? `background:${ac};color:#fff;border:1px solid ${ac};border-radius:4px;cursor:pointer;padding:2px 8px;font-size:11px;`
      : `background:none;color:${tc};border:1px solid #DAD9D4;border-radius:4px;cursor:pointer;padding:2px 8px;font-size:11px;`;
  }

  public enumerateObjectInstances(options: powerbi.EnumerateVisualObjectInstancesOptions): powerbi.VisualObjectInstanceEnumeration {
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
        },
      });
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
    if (objectName === "labels" && this.isPro) {
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
    if (objectName === "navigation" && this.isPro) {
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
      // Only show the global color picker when the toggle is ON, so it can't accidentally
      // override per-category colors.
      if (this.settings.events.useGlobalColor) {
        evtProps["eventBgColor"] = { solid: { color: this.settings.events.eventBgColor ?? "#C96442" } };
      }
      instances.push({ objectName, selector: null as any, properties: evtProps });
    }

    if (objectName === "eventCategoryColors" && this.isPro) {
      // Use a SINGLE instance with all category properties so Power BI stores them reliably.
      // The format pane labels them "Category 1" … "Category N"; the visual itself shows a
      // color legend mapping slot number → category name.
      const catObj = this.lastDataView?.metadata?.objects?.["eventCategoryColors"];
      const cats = this.uniqueEventCategories.slice(0, 8);
      const props: Record<string, any> = {};
      cats.forEach((cat, idx) => {
        props[`c${idx}`] = { solid: { color: (catObj?.[`c${idx}`] as any)?.solid?.color ?? this.categoryColor(cat) } };
      });
      // Always emit all 8 slots so the format pane shows them (hidden slots use auto-color of "")
      for (let i = cats.length; i < 8; i++) {
        props[`c${i}`] = { solid: { color: (catObj?.[`c${i}`] as any)?.solid?.color ?? this.categoryColor("") } };
      }
      instances.push({ objectName, selector: null as any, properties: props });
    }

    return instances;
  }
}
