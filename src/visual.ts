/// <reference types="powerbi-visuals-api" />
import powerbi from "powerbi-visuals-api";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import {
  HtmlSubSelectableClass, HtmlSubSelectionHelper, SubSelectableDisplayNameAttribute,
  SubSelectableObjectNameAttribute, SubSelectableTypeAttribute,
} from "powerbi-visuals-utils-onobjectutils";
import { SP_IDENTIFIER, matchesPlan, CalendarSettings, parseSettings, freeSettings, defaultSettings, applyTemplate, SCHEMES, TEMPLATES } from "./settings";
import { PANEL, PanelProp } from "./panel";
import { STRINGS } from "./strings";

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
  /** Funciones Pro de las que ya se avisó en esta sesión de edición */
  private notifiedPro: string[] = [];
  /** Temporizador que deja la barra de Upgrade cuando termina el banner */
  private licenseIconTimer: number | null = null;
  private localization: powerbi.extensibility.ILocalizationManager;
  /** Vista previa Pro: Free, editando, con la licencia ya resuelta y legible */
  private proPreview: boolean = false;
  /** Modo edición (ViewMode != 0). Se guarda para poder recalcular la vista previa
      cuando la licencia responde, que ocurre después del primer pintado. */
  private editing: boolean = false;
  private watermarkEl: HTMLDivElement;

  /** Lo que se pinta: en Free, las opciones Pro vuelven a su valor por defecto. */
  private settings: CalendarSettings = defaultSettings;
  /** Lo que eligió el usuario: es lo que muestra el panel de formato. */
  private rawSettings: CalendarSettings = defaultSettings;
  private currentView: "year" | "month" | "week" = "month";
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
  /** Selección de rango (1.2.0.0): el último día elegido, y el arrastre en curso. */
  private anchorKey: string | null = null;
  private dragStart: string | null = null;
  private dragOver: string | null = null;
  private suppressClick = false;
  /** Medida que manda en el color: 0 = la principal, i = la secundaria i (1.2.0.0, Pro). */
  private activeMeasure = 0;
  private activeMeasureLoaded = false;
  /** Nombres de las medidas en el orden de los pozos: principal y secundarias. */
  private measureNames: string[] = [];
  /** Paso del asistente de configuración (2 = campos opcionales, 3 = estilo). El 1 es la pantalla de inicio. */
  private guideStep = 2;
  /** Formato sobre el lienzo (1.2.0.0). */
  public visualOnObjectFormatting: powerbi.extensibility.visual.VisualOnObjectFormatting;
  private subSelectionHelper: HtmlSubSelectionHelper;
  private formatMode = false;
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
    // Localización de los textos que muestra el visual en tiempo de ejecución.
    this.localization = options.host.createLocalizationManager();
    this.subSelectionHelper = HtmlSubSelectionHelper.createHtmlSubselectionHelper({
      hostElement: options.element,
      subSelectionService: (options.host as any).subSelectionService,
      selectionIdCallback: () => undefined,
    });
    this.visualOnObjectFormatting = {
      getSubSelectionStyles: (subs) => this.getSubSelectionStyles(subs),
      getSubSelectionShortcuts: (subs) => this.getSubSelectionShortcuts(subs),
      getSubSelectables: (filter) => this.subSelectionHelper.getAllSubSelectables(filter),
    };

    // Root container
    this.container = document.createElement("div");
    this.container.className = "tcviz-calendar";
    this.container.setAttribute("aria-label", "Calendar Events Heatmap");
    this.container.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: 'Segoe UI', system-ui, sans-serif;
      box-sizing: border-box;
      position: relative;
    `;
    // Marca de agua de la vista previa Pro. Blanca con contorno oscuro y opacidad 0.55:
    // un gris translúcido desaparece sobre celdas saturadas y fondos oscuros. No intercepta
    // clics ni entra en el recorrido del lector de pantalla.
    this.watermarkEl = document.createElement("div");
    this.watermarkEl.setAttribute("aria-hidden", "true");
    this.watermarkEl.textContent = this.t("Msg_ProPreview", "Pro preview");
    this.watermarkEl.style.cssText =
      "position:absolute;left:0;top:0;right:0;bottom:0;display:none;align-items:center;" +
      "justify-content:center;pointer-events:none;z-index:5;font:700 32px 'Segoe UI',sans-serif;" +
      "color:#FFFFFF;opacity:0.55;transform:rotate(-20deg);" +
      "text-shadow:0 0 2px rgba(51,51,51,0.85),0 1px 3px rgba(51,51,51,0.65);";
    this.container.appendChild(this.watermarkEl);

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
        this.proPreview = false;
        this.updateWatermark();   // nada que pintar: tampoco marca
        this.renderLandingPage();
        this.events.renderingFinished(options);
        return;
      }

      this.lastDataView = dataView;
      // Vista previa Pro: solo en edición (ViewMode View=0), con la licencia ya resuelta y
      // en un entorno donde se puede leer. En lectura, antes de resolver, o donde no se
      // puede leer (Publish to Web, export), se pinta el resultado gratuito sin marca:
      // ahí un cliente que paga se leería como Free.
      const viewMode = (options as any).viewMode;
      this.editing = typeof viewMode === "number" && viewMode !== 0;
      this.formatMode = !!(options as any).formatMode;
      this.subSelectionHelper.setFormatMode(this.formatMode);
      this.proPreview = this.computePreview();

      // La plantilla se aplica dos veces: sobre lo leído y, sin licencia, después de devolver lo
      // Pro a su valor por defecto. Así una plantilla se ve completa también en Free, pero un
      // color Pro elegido a mano no.
      const objs = dataView?.metadata?.objects;
      this.rawSettings = applyTemplate(parseSettings(dataView), objs);
      this.settings = (this.isPro || this.proPreview) ? this.rawSettings : applyTemplate(freeSettings(this.rawSettings), objs);
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
      this.updateWatermark();
      if (this.formatMode) {
        const subs = (options as any).subSelections as powerbi.visuals.CustomVisualSubSelection[] | undefined;
        this.subSelectionHelper.updateOutlinesFromSubSelections(subs ?? [], true);
      }

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
    let measureIdx = cols.findIndex(c => c.roles["mainMeasure"]);
    const eventNameIdx = cols.findIndex(c => c.roles["eventName"]);
    const eventCatIdx = cols.findIndex(c => c.roles["eventCategory"]);
    const holidayNameIdx = cols.findIndex(c => c.roles["holidayName"]);

    // Secondary measures
    const secondaryIdxs = cols
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.roles["secondaryMeasures"])
      .map(({ i }) => i);

    // CAMBIO DE MEDIDA (1.2.0.0, Pro): la elegida pasa a mandar en el color y las cifras, y la
    // principal ocupa su sitio en la ayuda emergente. Se intercambian los índices y el resto del
    // parseo no cambia.
    const limpio = (i: number) => String(cols[i]?.displayName ?? "").replace(/[\x00-\x1f\x7f]/g, "");
    this.measureNames = measureIdx >= 0 ? [limpio(measureIdx), ...secondaryIdxs.map(limpio)] : [];
    if (!this.activeMeasureLoaded) {
      const st = (dataView.metadata?.objects as any)?.state?.activeMeasure;
      if (typeof st === "number") this.activeMeasure = st;
      this.activeMeasureLoaded = true;
    }
    if (this.activeMeasure > secondaryIdxs.length) this.activeMeasure = 0;
    const k = this.activeMeasure;
    if (k > 0 && measureIdx >= 0 && (this.isPro || this.proPreview)) {
      const elegida = secondaryIdxs[k - 1];
      secondaryIdxs[k - 1] = measureIdx;
      measureIdx = elegida;
    }

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
    // Semana y año son Pro. Antes bastaba con "Default View = Week" para verla en Free.
    const pro = this.isPro || this.proPreview;
    const view = (this.currentView === "week" && pro) ? this.buildWeekView()
      : (this.currentView === "year" && pro) ? this.buildYearView()
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
        titleEl.textContent = this.t("Msg_DateHierarchy", "Connect the Date field as a Date, not as a Year hierarchy.");
        bodyEl.textContent = this.t("Msg_DateHierarchyHow", "In the Field Well, click the ▼ next to your date field and select Date (not Date Hierarchy). Or: File → Options → Current file → Data Load → uncheck Auto date/time.");
      } else {
        titleEl.textContent = this.t("Msg_NoData", "No data received.");
        bodyEl.textContent = this.t("Msg_NoDataHow", "Connect a Date column and a Main Measure to this visual.");
      }

      dbg.appendChild(titleEl);
      dbg.appendChild(bodyEl);
      this.container.appendChild(dbg);
    }

    this.attachInteractions(wrapper);
    this.setRovingTabindex();
    this.applySelectionStyles();

    // Asistente de configuración (1.2.0.0): solo editando y con datos; nunca en lectura.
    if (this.editing && !this.formatMode && this.calendarData.length > 0 && this.rawSettings.style.guide && this.interactionsAllowed()) {
      this.container.appendChild(this.buildGuide());
    }

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
    // La vista previa cuenta como Pro a efectos de pintado: este gate se saltaba
    // proPreview y forzaba un mes aunque los ajustes ya trajeran tres.
    const n = (this.isPro || this.proPreview)
      ? Math.max(1, Math.min(this.settings.calendar.monthsToShow ?? 1,
          // Meses a mostrar es un máximo (1.2.0.0): solo los que caben a unos 180 px cada uno.
          Math.max(1, Math.floor((this.viewport.width - 16 + 12) / (200 + 12)))))
      : 1;
    const weekStart = this.settings.calendar.weekStart;
    const dayMap = new Map(this.calendarData.map(d => [this.dateKey(d.date), d]));
    const today = this.dateKey(new Date());

    const dayNames = this.dayNames(weekStart);

    const startDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + n - 1, 1);
    const startLabel = startDate.toLocaleString(this.loc(), { month: "long", year: "numeric" });
    const endLabel = endDate.toLocaleString(this.loc(), { month: "long", year: "numeric" });
    // Calendario fiscal (1.2.0.0): por meses, el título añade año y periodo fiscal; en semanas
    // (4-4-5 y variantes), la vista muestra periodos en lugar de meses.
    const periodos = this.retailPattern() ? this.periodsFrom(this.currentDate, n) : null;
    let headerLabel = n > 1 ? `${startLabel} – ${endLabel}` : startLabel;
    if (periodos) {
      const a = periodos[0], z = periodos[periodos.length - 1];
      headerLabel = n > 1
        ? `${this.t("Cal_FY", "FY")}${a.fy} P${a.n} – ${this.t("Cal_FY", "FY")}${z.fy} P${z.n}`
        : `${this.t("Cal_FY", "FY")}${a.fy} · P${a.n} (${this.shortRange(a.start, a.end)})`;
    } else if (this.settings.calendar.fiscalEnabled) {
      const f = this.fiscalMonthOf(startDate);
      headerLabel += ` · ${this.t("Cal_FY", "FY")}${f.fy} P${f.n}`;
    }

    const outer = document.createElement("div");
    outer.style.cssText = `display:flex;flex-direction:column;height:100%;padding:${this.compact() ? 4 : 8}px;box-sizing:border-box;overflow:hidden;`;

    // ── Cabecera, vistas y leyendas (comunes a las tres vistas) ──
    this.buildChrome(outer, headerLabel, "year");

    // ── Month grids ──
    const gridsContainer = document.createElement("div");
    gridsContainer.style.cssText = "display:flex;flex-direction:row;gap:12px;flex:1;overflow:hidden;min-height:0;";

    for (let m = 0; m < n; m++) {
      if (periodos) {
        const pr = periodos[m];
        gridsContainer.appendChild(this.buildSingleMonthGrid(0, 0, dayNames, dayMap, today, n,
          { start: pr.start, end: pr.end, title: `P${pr.n} · ${this.shortRange(pr.start, pr.end)}` }));
        continue;
      }
      const totalMonths = startDate.getMonth() + m;
      const yr = startDate.getFullYear() + Math.floor(totalMonths / 12);
      const mo = totalMonths % 12;
      gridsContainer.appendChild(this.buildSingleMonthGrid(yr, mo, dayNames, dayMap, today, n));
    }

    outer.appendChild(gridsContainer);
    this.appendScaleLegend(outer, "bottom");
    return outer;
  }

  private buildSingleMonthGrid(
    year: number,
    month: number,
    dayNames: string[],
    dayMap: Map<string, CalendarDay>,
    today: string,
    totalMonths: number,
    rango?: { start: Date; end: Date; title: string },
  ): HTMLElement {
    const weekStart = this.settings.calendar.weekStart;
    // Un mes de calendario, o un periodo fiscal de semanas completas (4-4-5 y variantes).
    const firstDay = rango ? rango.start : new Date(year, month, 1);
    const lastDay = rango ? rango.end : new Date(year, month + 1, 0);
    const monthName = rango ? rango.title : firstDay.toLocaleString(this.loc(), { month: "long", year: "numeric" });

    const grid: (Date | null)[][] = [];
    let week: (Date | null)[] = [];
    const startOffset = (firstDay.getDay() - weekStart + 7) % 7;
    for (let i = 0; i < startOffset; i++) week.push(null);
    for (let d = new Date(firstDay); d <= lastDay; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      week.push(d);
      if (week.length === 7) { grid.push(week); week = []; }
    }
    if (week.length) {
      while (week.length < 7) week.push(null);
      grid.push(week);
    }

    // En modo compacto el valor del día se retira: el color ya lo dice y el número no cabe.
    // Ancho aproximado de un día: por debajo de ~40 px el valor salía truncado ("0.9…").
    const anchoDia = ((this.viewport.width - 16 - (totalMonths - 1) * 12) / totalMonths
      - (this.settings.calendar.weekNumbers !== "none" ? 28 : 0)) / 7;
    const showMeasure = totalMonths <= 6 && !this.compact() && anchoDia >= 40;
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
    const semanas = this.settings.calendar.weekNumbers !== "none";
    const columnas = semanas ? "26px repeat(7,1fr)" : "repeat(7,1fr)";
    const hueco = `${Math.max(0, Math.min(12, this.settings.layout.cellGap))}px`;
    const radio = `${Math.max(0, Math.min(16, this.settings.layout.cellRadius))}px`;
    dayNamesRow.style.cssText = `display:grid;grid-template-columns:${columnas};gap:${hueco};margin-bottom:4px;flex-shrink:0;`;
    if (semanas) {
      const wk = document.createElement("div");
      wk.setAttribute("role", "columnheader");
      wk.style.cssText = `text-align:center;font-size:9px;font-weight:600;color:${this.fg(null, "#83827D")};padding:2px 0;`;
      wk.textContent = this.t("Cal_Wk", "Wk");
      wk.title = this.t("Cal_WeekNumber", "Week number");
      dayNamesRow.appendChild(wk);
    }
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
    gridBody.style.cssText = `display:flex;flex-direction:column;gap:${hueco};flex:1;min-height:0;overflow:hidden;`;

    grid.forEach(wk => {
      const weekRow = document.createElement("div");
      weekRow.setAttribute("role", "row");
      weekRow.style.cssText = `display:grid;grid-template-columns:${columnas};gap:${hueco};flex:1;min-height:0;`;
      if (semanas) {
        // Número de semana: un clic abre esa semana (navegación jerárquica año → mes → semana).
        const primero = wk.find(d => d !== null) as Date;
        const n = this.weekNumber(primero);
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-drill-week", this.dateKey(primero));
        b.setAttribute("aria-label", this.t("Cal_OpenWeek", "Open week {0}").replace("{0}", String(n)));
        b.style.cssText = `border:none;background:none;cursor:pointer;font-size:9px;font-weight:600;padding:0;`
          + `color:${this.fg(this.settings.navigation.textColor, "#83827D")};align-self:center;`;
        b.textContent = String(n);
        weekRow.appendChild(b);
      }

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
        const maxEvt = (this.isPro || this.proPreview) ? this.settings.events.maxEventsVisible : 1;
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
        this.subSelectable(cell, "heatmap", this.t("OO_Day", "Day colour"), powerbi.visuals.SubSelectionStylesType.Shape);
        cell.style.backgroundColor = chrome.bg;
        cell.style.borderRadius = radio;
        cell.style.padding = "3px";
        cell.style.cursor = day ? "pointer" : "default";
        cell.style.display = "flex";
        cell.style.flexDirection = "column";
        cell.style.overflow = "hidden";
        cell.style.minHeight = "0";
        cell.style.border = chrome.border;

        // Day number
        const numDiv = document.createElement("div");
        this.subSelectable(numDiv, "dayNumber", this.t("OO_DayNumber", "Day number"), powerbi.visuals.SubSelectionStylesType.Text);
        numDiv.style.fontSize = numSz;
        numDiv.style.fontFamily = numFont;
        numDiv.style.fontWeight = isToday ? "700" : "400";
        numDiv.style.color = this.hc ? dayNumColor : this.legible(dayNumColor, chrome.bg);
        numDiv.style.lineHeight = "1";
        numDiv.style.whiteSpace = "nowrap";
        numDiv.style.flexShrink = "0";
        numDiv.textContent = String(date.getDate()) + (isHoliday ? "❆" : "");
        cell.appendChild(numDiv);

        // Measure value
        if (showMeasure && day?.measureValue != null) {
          const valDiv = document.createElement("div");
          this.subSelectable(valDiv, "labels", this.t("OO_Value", "Day value"), powerbi.visuals.SubSelectionStylesType.Text);
          valDiv.style.fontSize = lblSz;
          valDiv.style.fontFamily = lblFont;
          valDiv.style.color = this.hc ? lblColor : this.legible(lblColor, chrome.bg);
          valDiv.style.fontWeight = "600";
          valDiv.style.lineHeight = "1.2";
          valDiv.style.whiteSpace = "nowrap";
          valDiv.style.overflow = "hidden";
          valDiv.style.textOverflow = "ellipsis";
          valDiv.style.flexShrink = "0";
          valDiv.textContent = this.formatValue(day.measureValue);
          cell.appendChild(valDiv);
        }

        // Eventos como marcas de color (1.2.0.0): una por categoría al pie del día; los nombres
        // están en la leyenda y en la ayuda emergente. "auto" = marcas en mes y año.
        const comoMarcas = this.settings.events.display !== "labels";
        if (comoMarcas && showEvents && eventsArr.length > 0) {
          const pie = document.createElement("div");
          this.subSelectable(pie, "events", this.t("OO_Events", "Events"), powerbi.visuals.SubSelectionStylesType.Shape);
          pie.style.cssText = "display:flex;gap:2px;margin-top:auto;align-items:center;flex-shrink:0;";
          const vistos = new Set<string>();
          const colores: string[] = [];
          eventsArr.forEach(e => {
            const col = this.sanitizeColor(
              (this.settings.events.useGlobalColor && this.settings.events.eventBgColor) ? this.settings.events.eventBgColor : e.color, "#C96442");
            if (!vistos.has(col)) { vistos.add(col); colores.push(col); }
          });
          colores.slice(0, 4).forEach(col => {
            const m = document.createElement("span");
            m.style.cssText = `display:inline-block;width:14px;height:4px;border-radius:2px;background:${this.hc ? this.hcFg : col};flex-shrink:0;`
              + "box-shadow:0 0 0 1px rgba(255,255,255,0.85);";
            pie.appendChild(m);
          });
          if (colores.length > 4) {
            const mas = document.createElement("span");
            mas.style.cssText = `font-size:8px;color:${this.fg(null, "#83827D")};`;
            mas.textContent = `+${colores.length - 4}`;
            pie.appendChild(mas);
          }
          cell.appendChild(pie);
        }

        // Event pills
        (comoMarcas ? [] : visibleEvents).forEach(e => {
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
        if (moreCount > 0 && !comoMarcas) {
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
    gridWrap.setAttribute("aria-label", `${this.t("Cal_Heatmap", "Calendar heatmap")}, ${monthName}`);
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

    const weekLabel = `${monday.toLocaleDateString(this.loc(), { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(this.loc(), { month: "short", day: "numeric", year: "numeric" })}`;
    const dayNames = this.dayNames(weekStart);

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
    outer.style.cssText = `display:flex;flex-direction:column;height:100%;padding:${this.compact() ? 4 : 8}px;box-sizing:border-box;overflow:hidden;`;

    // ── Cabecera, vistas y leyendas (comunes a las tres vistas) ──
    this.buildChrome(outer, weekLabel, "month");

    // ── Days grid ──
    const daysGrid = document.createElement("div");
    daysGrid.setAttribute("role", "grid");
    daysGrid.setAttribute("aria-label", `${this.t("Cal_Heatmap", "Calendar heatmap")}, ${weekLabel}`);
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
    title.textContent = "Calendar Events Heatmap";

    const sub = document.createElement("div");
    sub.style.cssText = "font-size:11px;line-height:1.5;max-width:200px;";
    sub.textContent = this.t("Msg_Landing", "Add a Date field and a Measure to see your calendar heatmap with event overlays.");

    const paso = document.createElement("div");
    paso.style.cssText = `font-size:11px;font-weight:700;color:${this.hc ? this.hcFg : "#2B6CB0"};margin-bottom:4px;`;
    paso.textContent = this.t("Guide_Step", "Setup · step {0} of 3").replace("{0}", "1");
    inner.appendChild(icon);
    inner.appendChild(paso);
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
    // Rango arrastrando: se marca mientras se arrastra y se selecciona al soltar.
    wrapper.style.userSelect = "none";
    wrapper.addEventListener("mousedown", (e: MouseEvent) => {
      if (e.button !== 0 || !this.interactionsAllowed() || this.formatMode) return;
      const c = (e.target as HTMLElement).closest("[data-date]") as HTMLElement | null;
      this.dragStart = c && c.dataset.hasData === "1" ? c.dataset.date! : null;
      this.dragOver = null;
    });
    wrapper.addEventListener("mouseover", (e: MouseEvent) => {
      if (!this.dragStart || (e.buttons & 1) === 0) return;
      const c = (e.target as HTMLElement).closest("[data-date]") as HTMLElement | null;
      if (!c || c.dataset.date === this.dragOver) return;
      this.dragOver = c.dataset.date!;
      this.previewRange(this.dragStart, this.dragOver);
    });
    wrapper.addEventListener("mouseup", (e: MouseEvent) => {
      if (this.dragStart && this.dragOver && this.dragOver !== this.dragStart) {
        this.selectRange(this.dragStart, this.dragOver, e.ctrlKey || e.metaKey);
        this.suppressClick = true;   // el click que sigue al mouseup no debe deshacerlo
      }
      this.dragStart = null;
      this.dragOver = null;
    });

    wrapper.addEventListener("click", (e: MouseEvent) => {
      if (this.suppressClick) { this.suppressClick = false; return; }
      if (!this.interactionsAllowed() || this.formatMode) return;
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
      if (e.shiftKey && this.anchorKey) { this.selectRange(this.anchorKey, dateKey, multi); return; }
      this.selectionManager.select(day.selectionId, multi);
      this.focusedKey = dateKey;
      this.anchorKey = dateKey;
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
      if (this.currentView === "year") {
        this.currentDate = new Date(this.currentDate.getFullYear() + dir, this.currentDate.getMonth(), 1);
      } else if (this.currentView === "month" && this.retailPattern()) {
        const pr = this.periodOf(this.currentDate);
        this.currentDate = dir > 0 ? new Date(pr.end.getFullYear(), pr.end.getMonth(), pr.end.getDate() + 1)
                                   : this.periodOf(new Date(pr.start.getFullYear(), pr.start.getMonth(), pr.start.getDate() - 1)).start;
      } else if (this.currentView === "month") {
        this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + dir, 1);
      } else {
        this.currentDate = new Date(this.currentDate.getTime() + dir * 7 * 24 * 60 * 60 * 1000);
      }
      this.render();
    });

    // Cambio de vista y navegación jerárquica: botones Year / Month / Week, el título (sube un
    // nivel), el nombre de cada mes en la vista de año y el número de semana (bajan), y Hoy.
    wrapper.addEventListener("click", (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const viewBtn = el.closest("[data-view]") as HTMLElement | null;
      const up = el.closest("[data-up]") as HTMLElement | null;
      const mes = el.closest("[data-drill-month]") as HTMLElement | null;
      const sem = el.closest("[data-drill-week]") as HTMLElement | null;
      const hoy = el.closest("[data-today]") as HTMLElement | null;
      if (hoy) { this.currentDate = new Date(); this.render(); this.updateWatermark(); return; }
      if (mes) { const d = this.parseKey(mes.dataset.drillMonth); if (d) this.currentDate = d; this.goTo("month"); return; }
      if (sem) { const d = this.parseKey(sem.dataset.drillWeek); if (d) this.currentDate = d; this.goTo("week"); return; }
      if (up) { this.goTo(up.dataset.up as "year" | "month"); return; }
      if (viewBtn) this.goTo(viewBtn.dataset.view as "year" | "month" | "week");
    });

    // Cambio de medida (Pro): se guarda en el informe desde el clic del usuario.
    wrapper.addEventListener("change", (e: Event) => {
      const sel = (e.target as HTMLElement).closest("[data-measure]") as HTMLSelectElement | null;
      if (!sel) return;
      const k = parseInt(sel.value, 10) || 0;
      if (k > 0 && !this.isPro && !this.proPreview) {
        sel.value = "0";
        this.notifyProBlocked("measure switching");
        return;
      }
      this.activeMeasure = k;
      this.host.persistProperties({ merge: [{ objectName: "state", selector: null as any, properties: { activeMeasure: k } }] });
      if (this.lastDataView) {
        this.calendarData = this.parseDataView(this.lastDataView);
        this.render();
        this.updateWatermark();
      }
      if (k > 0 && !this.isPro) this.notifyProBlocked("measure switching");
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
        if (e.shiftKey && this.anchorKey) { this.selectRange(this.anchorKey, dateKey, multi); return; }
        this.selectionManager.select(day.selectionId, multi);
        this.anchorKey = dateKey;
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

      // Jump a whole month (month and year view) or week (week view)
      if (k === "PageUp" || k === "PageDown") {
        e.preventDefault();
        const dir = k === "PageUp" ? -1 : 1;
        if (this.currentView !== "week") {
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
        case "ArrowUp":    delta = this.currentView !== "week" ? -7 : -1; break;
        case "ArrowDown":  delta = this.currentView !== "week" ? 7 : 1; break;
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
            displayName: self.t("Tip_Date", "Date"),
            value: day.date.toLocaleDateString(self.loc()),
          },
        ];
        if (day.measureValue != null) {
          items.push({ displayName: self.measureNames[self.activeMeasure] || self.t("Tip_Value", "Value"), value: self.formatFull(day.measureValue) });
        }
        if (day.isHoliday) {
          items.push({ displayName: self.t("Tip_Holiday", "Holiday"), value: day.holidayName });
        }
        if (day.events.length > 0) {
          items.push({ displayName: self.t("Tip_Events", "Events"), value: day.events.map(e => e.name).join(", ") });
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
          resolve(plans.some(p => matchesPlan(p.spIdentifier, SP_IDENTIFIER) &&
            ((p.state as unknown as number) === 1 || (p.state as unknown as number) === 2)));
        },
        () => { this.licenseInfoAvailable = false; resolve(false); }
      );
    });
  }

  private applyLicense(isPro: boolean): void {
    this.licenseResolved = true;
    if (!isPro || this.isPro) {
      // La licencia responde después del primer render, cuando proPreview aún era false y
      // los ajustes se resolvieron como Free. Ahora ya se sabe: recalcular y repintar, o
      // el autor se queda con el resultado gratuito y una marca de agua que no corresponde.
      const before = this.proPreview;
      this.proPreview = this.computePreview();
      if (this.proPreview !== before && this.lastDataView) {
        this.settings = this.proPreview ? this.rawSettings : freeSettings(this.rawSettings);
        try { this.render(); } catch (_) { /* el render ya reporta su propio fallo */ }
      }
      this.notifyProBlocked();
      this.updateWatermark();
      return;
    }
    this.isPro = true;
    this.proPreview = false;          // con licencia no hay vista previa que marcar
    this.clearLicenseNotice();
    this.settings = this.rawSettings;
    if (this.lastDataView) {
      try { this.render(); } catch (_) { }
    }
    this.updateWatermark();           // el render acaba de vaciar el contenedor
  }

  /** Opciones Pro que el usuario ha fijado en este informe (solo lo que está en metadata.objects). */
  private attemptedPro(): string[] {
    const o: any = this.lastDataView?.metadata?.objects ?? {};
    const w: string[] = [];
    if (o.calendar?.view === "week") w.push("week view");
    if (o.calendar?.view === "year") w.push("year view");
    if ((o.state?.activeMeasure ?? 0) > 0) w.push("measure switching");
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

    // Power BI muestra UNA notificación a la vez y la última sustituye a la anterior
    // (verificado en Risk Matrix, en el servicio, 2026-09-16). Llamar a notifyFeatureBlocked
    // y notifyLicenseRequired seguidos dejaba solo una visible. Secuencia correcta: retirar
    // lo anterior, banner con la función concreta, y al terminar (~10 s) la barra de Upgrade.
    const added = wanted.filter(w => this.notifiedPro.indexOf(w) === -1);
    this.notifiedPro = wanted.slice();
    // Un clic sobre un control Pro siempre merece aviso, aunque ya se hubiera avisado.
    if (added.length === 0 && !clicked) return;
    const show0 = added.length ? added : [clicked as string];
    this.licenseIconShown = true;
    this.lastBlockedNotice = wanted.join("|");
    const one = show0.length === 1;
    // Nombres y frase en el idioma del informe (1.2.0.0). Antes la frase se pedía con
    // getDisplayName a una clave que no está en capabilities.json, y Desktop no la resuelve.
    const nombres = show0.map(w => this.t("Pro_" + w.replace(/[^A-Za-z]+/g, "_"), w));
    const list = one ? nombres[0] : nombres.slice(0, -1).join(", ") + " " + this.t("Msg_And", "and") + " " + nombres[nombres.length - 1];
    const tpl = this.t(one ? "LicenceNotice_One" : "LicenceNotice_Many",
      one ? "Calendar Events Heatmap: {0} is part of the Pro plan, shown as a watermarked preview."
          : "Calendar Events Heatmap: {0} are part of the Pro plan, shown as a watermarked preview.");
    const msg = tpl.replace("{0}", list);

    const show = () => {
      try { lm?.notifyFeatureBlocked?.(msg.slice(0, 500)); } catch (_) { /* best effort */ }
      this.cancelLicenseIcon();
      this.licenseIconTimer = window.setTimeout(() => {
        this.licenseIconTimer = null;
        if (this.isPro || this.notifiedPro.length === 0) return;
        // LicenseNotificationType.General es const enum: 0 en runtime
        try { lm?.notifyLicenseRequired?.(0); } catch (_) { /* best effort */ }
      }, 10500);
    };
    try {
      const cleared = lm?.clearLicenseNotification?.();
      if (cleared && typeof cleared.then === "function") { cleared.then(show, show); }
      else { show(); }
    } catch (_) { show(); }
  }

  /**
   * La marca solo sale si el usuario ha pedido de verdad algo de pago, y su tamaño sigue al
   * ancho del visual: un font-size fijo se queda ridículo a pantalla completa, que es justo
   * donde lo mira el revisor.
   */
  /** Vista previa Pro: Free, editando, con la licencia resuelta y legible. */
  private computePreview(): boolean {
    return !this.isPro && this.editing && this.licenseResolved
      && this.licenseEnvSupported && this.licenseInfoAvailable;
  }

  private updateWatermark(): void {
    // El render vacía el contenedor entero (removeChild en bucle), así que la marca se
    // pierde en cada pintado y hay que volver a insertarla. Encenderla sobre un elemento
    // desconectado del DOM no hace nada: ese era el motivo de que no se viera.
    if (this.watermarkEl.parentNode !== this.container) {
      this.container.appendChild(this.watermarkEl);
    }
    const show = this.proPreview && this.attemptedPro().length > 0;
    this.watermarkEl.style.display = show ? "flex" : "none";
    if (!show) { return; }
    const width = this.container.clientWidth || 0;
    const size  = Math.max(20, Math.min(72, Math.round(width * 0.09)));
    this.watermarkEl.style.fontSize = `${size}px`;
  }

  private cancelLicenseIcon(): void {
    if (this.licenseIconTimer !== null) {
      window.clearTimeout(this.licenseIconTimer);
      this.licenseIconTimer = null;
    }
  }

  private clearLicenseNotice(): void {
    this.lastBlockedNotice = "";
    this.notifiedPro = [];
    this.cancelLicenseIcon();
    if (!this.licenseIconShown) return;
    this.licenseIconShown = false;
    try { this.licenseManager?.clearLicenseNotification?.(); } catch (_) { /* best effort */ }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private pad2(n: number): string {
    return n < 10 ? "0" + n : String(n);
  }

  /** Idioma del informe. Antes los días iban en inglés fijo y los meses en el idioma del navegador. */
  private loc(): string {
    return String((this.host as any).locale || "en-US");
  }

  /** Nombres cortos de los días en el idioma del informe, empezando por el día elegido. */
  private dayNames(weekStart: number): string[] {
    const f = new Intl.DateTimeFormat(this.loc(), { weekday: "short" });
    // El 7 de enero de 2024 es domingo: 7 + i recorre la semana desde el domingo.
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 7 + ((i + weekStart) % 7))))
      .map(x => x.replace(/\.$/, ""));
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
    const fill = this.ruleFor(day?.measureValue ?? null) ?? day?.ruleColor ?? (day ? this.settings.heatmap.dayColor : null) ?? day?.heatmapColor;
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
      date.toLocaleDateString(this.loc(), {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      }),
    ];
    if (day?.measureValue != null) parts.push(`${this.measureNames[this.activeMeasure] || this.t("Tip_Value", "Value")} ${this.formatFull(day.measureValue)}`);
    else parts.push(this.t("Aria_NoData", "No data"));
    if (day?.isHoliday && day.holidayName) parts.push(`${this.t("Tip_Holiday", "Holiday")}: ${day.holidayName}`);
    const evs = day?.events ?? [];
    if (evs.length === 1) parts.push(`${this.t("Aria_OneEvent", "1 event")}: ${evs[0].name}`);
    else if (evs.length > 1) parts.push(`${this.t("Aria_Events", "{0} events").replace("{0}", String(evs.length))}: ${evs.map(e => e.name).join(", ")}`);
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
  /** Días con datos entre dos fechas, ambas incluidas (las claves yyyy-mm-dd se ordenan como texto). */
  private daysBetween(a: string, b: string): CalendarDay[] {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return this.calendarData.filter(d => { const k = this.dateKey(d.date); return k >= lo && k <= hi; });
  }

  /**
   * Selecciona un rango de fechas (criterio FT.CAL01): filtra el informe por todos los días entre
   * los dos extremos. Con Ctrl se añade a lo que ya había.
   */
  private selectRange(a: string, b: string, multi: boolean): void {
    const dias = this.daysBetween(a, b).filter(d => d.selectionId);
    if (dias.length === 0) return;
    this.selectionManager.select(dias.map(d => d.selectionId!) as any, multi);
    if (!multi) this.selectedKeys.clear();
    dias.forEach(d => this.selectedKeys.add(this.dateKey(d.date)));
    this.anchorKey = a;
    this.focusedKey = b;
    this.setRovingTabindex();
    this.applySelectionStyles();
  }

  /** Marca provisional del rango mientras se arrastra. */
  private previewRange(a: string, b: string): void {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const color = this.hc ? this.hcFgSel : this.sanitizeColor(this.settings.navigation.activeColor, "#C96442");
    (Array.from(this.container.querySelectorAll("[data-date]")) as HTMLElement[]).forEach(el => {
      const k = el.dataset.date ?? "";
      const dentro = k >= lo && k <= hi && el.dataset.hasData === "1";
      el.style.outline = dentro ? `2px dashed ${color}` : (this.selectedKeys.has(k) ? el.style.outline : "");
      el.style.outlineOffset = dentro ? "-2px" : el.style.outlineOffset;
    });
  }

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
  /** Anuncio para lector de pantalla del número de días seleccionados (1.2.0.0, útil con rangos). */
  private announceSelection(): void {
    let vivo = this.container.querySelector(".tcviz-live") as HTMLElement | null;
    if (!vivo) {
      vivo = document.createElement("div");
      vivo.className = "tcviz-live";
      vivo.setAttribute("aria-live", "polite");
      vivo.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;";
      this.container.appendChild(vivo);
    }
    const n = this.selectedKeys.size;
    vivo.textContent = n === 0 ? "" : n === 1 ? this.t("Aria_OneSelected", "1 day selected")
      : this.t("Aria_Selected", "{0} days selected").replace("{0}", String(n));
  }

  private applySelectionStyles(): void {
    this.announceSelection();
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

  /** Puntos de la escala: los de la paleta elegida (bajo, medio, alto) o mínimo y máximo a mano. */
  private scaleStops(): string[] {
    const sc = SCHEMES[this.settings.heatmap.scheme];
    return sc ? sc.slice() : [this.settings.heatmap.colorMin, this.settings.heatmap.colorMax];
  }

  private heatmapColor(value: number | null, min: number, max: number): string {
    if (value === null || min === max) return this.settings.heatmap.colorNull;
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const st = this.scaleStops();
    if (st.length === 3) {
      return t < 0.5 ? this.interpolateColor(st[0], st[1], t * 2) : this.interpolateColor(st[1], st[2], (t - 0.5) * 2);
    }
    return this.interpolateColor(st[0], st[1], t);
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
  /**
   * Reglas de color (1.2.0.0): la primera regla activa que se cumple pinta el día. Son el formato
   * condicional del visual: Power BI no ofrece el fx a los visuales que leen los datos como tabla
   * (documentado por Microsoft), y el de la 1.1 nunca llegaba a aplicarse.
   */
  /** Luminancia relativa de #rrggbb o rgb(r,g,b) (el degradado se calcula como rgb()). */
  private lum(color: string | null | undefined): number | null {
    const txt = String(color || "");
    const hex = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(txt);
    const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i.exec(txt);
    const canales = hex ? [hex[1], hex[2], hex[3]].map(h => parseInt(h, 16)) : rgb ? [rgb[1], rgb[2], rgb[3]].map(Number) : null;
    if (!canales) return null;
    const [r, g, b] = canales.map(c => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** ¿Fondo oscuro? Para poner el texto en blanco encima (reglas y paletas con tonos intensos). */
  private isDark(color: string | null | undefined): boolean {
    const l = this.lum(color);
    return l !== null && l < 0.3;
  }

  /**
   * El color de texto pedido si se lee sobre el fondo (contraste 3:1 o más); si no, oscuro o
   * blanco según el fondo. Los números de fin de semana en naranja desaparecían sobre los días
   * naranjas de la paleta por defecto.
   */
  private legible(deseado: string, fondo: string): string {
    const a = this.lum(deseado), f = this.lum(fondo);
    if (a === null || f === null) return deseado;
    const ratio = (Math.max(a, f) + 0.05) / (Math.min(a, f) + 0.05);
    return ratio >= 3 ? deseado : (f < 0.3 ? "#FFFFFF" : "#252423");
  }

  private ruleFor(value: number | null): string | null {
    if (value === null || value === undefined || !isFinite(value)) return null;
    for (const r of this.settings.rules) {
      if (!r.on) continue;
      if ((r.op === "gte" && value >= r.value) || (r.op === "lte" && value <= r.value)) {
        return this.sanitizeColor(r.color, "") || null;
      }
    }
    return null;
  }

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
    // Sin el teja del mapa de calor (#C96442): una marca de ese color desaparecía sobre un día "caliente".
    const palette = ["#9C87F5", "#4BA3C3", "#E8A838", "#5BAD6F", "#D06E8C", "#2B6CB0", "#8C8C3E", "#6B4E9B"];
    if (!category) return palette[0];
    // Por orden de aparición (1.2.0.0): hasta 8 categorías nunca comparten color. Antes era un
    // hash del nombre sobre 6 colores y dos categorías podían salir iguales.
    const idx = this.uniqueEventCategories.indexOf(category);
    if (idx >= 0 && idx < palette.length) return palette[idx];
    let hash = 0;
    for (let i = 0; i < category.length; i++) hash = category.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  }

  /** Returns the user-configured color for the event category, or falls back to the auto-palette. */
  private getCategoryColor(category: string): string {
    const idx = this.uniqueEventCategories.indexOf(category);
    if ((this.isPro || this.proPreview) && idx >= 0 && idx < 8) {   // colores por categoría: Pro
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
    container.setAttribute("aria-label", this.t("Aria_EventCategories", "Event categories"));
    container.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;flex-shrink:0;";

    this.uniqueEventCategories.slice(0, 8).forEach(cat => {
      const color = this.sanitizeColor(this.getCategoryColor(cat), "#C96442");

      const item = document.createElement("span");
      item.setAttribute("role", "listitem");
      item.setAttribute("aria-label", `${this.t("Aria_EventCategory", "Event category")}: ${cat || this.t("Cal_Default", "Default")}`);
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
      labelEl.textContent = cat || `(${this.t("Cal_Default", "Default")})`;   // safe: textContent, never innerHTML

      item.appendChild(swatch);
      item.appendChild(labelEl);
      container.appendChild(item);
    });

    return container;
  }

  // ─── Formato sobre el lienzo (1.2.0.0) ────────────────────────────────────

  private subSelectable(el: Element, objectName: string, displayName: string, type: powerbi.visuals.SubSelectionStylesType): void {
    if (!this.formatMode) return;
    el.classList.add(HtmlSubSelectableClass);
    el.setAttribute(SubSelectableObjectNameAttribute, objectName);
    el.setAttribute(SubSelectableDisplayNameAttribute, displayName);
    el.setAttribute(SubSelectableTypeAttribute, String(type));
  }

  private getSubSelectionStyles(subs: powerbi.visuals.CustomVisualSubSelection[]): powerbi.visuals.SubSelectionStyles | undefined {
    const name = subs[0]?.customVisualObjects[0]?.objectName;
    const ref = (objectName: string, propertyName: string, label: string) => ({ reference: { objectName, propertyName }, label });
    switch (name) {
      case "dayNumber":
        return { type: powerbi.visuals.SubSelectionStylesType.Text,
          fontFamily: ref("dayNumber", "fontFamily", this.t("OO_Font", "Font")),
          fontSize: ref("dayNumber", "fontSize", this.t("OO_Size", "Size")),
          fontColor: ref("dayNumber", "color", this.t("OO_Color", "Color")) } as any;
      case "labels":
        return { type: powerbi.visuals.SubSelectionStylesType.Text,
          fontFamily: ref("labels", "fontFamily", this.t("OO_Font", "Font")),
          fontSize: ref("labels", "fontSize", this.t("OO_Size", "Size")),
          fontColor: ref("labels", "color", this.t("OO_Color", "Color")) } as any;
      case "navigation":
        return { type: powerbi.visuals.SubSelectionStylesType.Text,
          fontColor: ref("navigation", "textColor", this.t("OO_Color", "Color")) } as any;
      case "heatmap":
        return { type: powerbi.visuals.SubSelectionStylesType.Shape,
          fill: ref("heatmap", "colorMax", this.t("OO_MaxColor", "Max color")) } as any;
      case "events":
        return { type: powerbi.visuals.SubSelectionStylesType.Shape,
          fill: ref("events", "eventBgColor", this.t("OO_Color", "Color")) } as any;
      case "legend":
        return { type: powerbi.visuals.SubSelectionStylesType.Shape } as any;
    }
    return undefined;
  }

  private getSubSelectionShortcuts(subs: powerbi.visuals.CustomVisualSubSelection[]): powerbi.visuals.VisualSubSelectionShortcuts | undefined {
    const name = subs[0]?.customVisualObjects[0]?.objectName;
    const id = (objectName: string, propertyName: string) => ({ objectName, propertyName });
    const nav = (card: string, label: string) => ({ type: powerbi.visuals.VisualShortcutType.Navigate, destinationInfo: { cardUid: "Visual-" + card + "-card" }, label });
    const reset = (ids: { objectName: string; propertyName: string }[]) => ({ type: powerbi.visuals.VisualShortcutType.Reset, relatedResetFormattingIds: ids });
    const mas = this.t("OO_More", "More options");
    switch (name) {
      case "dayNumber":
        return [reset([id("dayNumber", "fontFamily"), id("dayNumber", "fontSize"), id("dayNumber", "color")]), nav("dayNumber", mas)] as any;
      case "labels":
        return [reset([id("labels", "fontFamily"), id("labels", "fontSize"), id("labels", "color")]), nav("labels", mas)] as any;
      case "navigation":
        return [{ type: powerbi.visuals.VisualShortcutType.Picker, ...id("calendar", "view"), label: this.t("OO_DefaultView", "Default view") },
                { type: powerbi.visuals.VisualShortcutType.Divider }, nav("navigation", mas)] as any;
      case "heatmap":
        return [{ type: powerbi.visuals.VisualShortcutType.Picker, ...id("heatmap", "scheme"), label: this.t("OO_Scheme", "Color scheme") },
                { type: powerbi.visuals.VisualShortcutType.Picker, ...id("style", "template"), label: this.t("OO_Template", "Template") },
                { type: powerbi.visuals.VisualShortcutType.Divider }, nav("rules", this.t("OO_Rules", "Color rules")), nav("heatmap", mas)] as any;
      case "events":
        return [{ type: powerbi.visuals.VisualShortcutType.Picker, ...id("events", "display"), label: this.t("OO_EventsAs", "Show events as") },
                { type: powerbi.visuals.VisualShortcutType.Toggle, ...id("events", "showEvents"), label: this.t("OO_ShowEvents", "Show events") },
                { type: powerbi.visuals.VisualShortcutType.Divider }, nav("events", mas)] as any;
      case "legend":
        return [{ type: powerbi.visuals.VisualShortcutType.Toggle, ...id("legend", "show"), label: this.t("OO_ShowLegend", "Show legend") },
                { type: powerbi.visuals.VisualShortcutType.Picker, ...id("legend", "position"), label: this.t("OO_Position", "Position") },
                { type: powerbi.visuals.VisualShortcutType.Divider }, nav("legend", mas)] as any;
    }
    return undefined;
  }

  // ─── Asistente de configuración (1.2.0.0) ─────────────────────────────────

  /**
   * Panel flotante que guía la configuración mientras se edita. No puede tocar los pozos (eso
   * solo lo hace el usuario): comprueba lo que hay, explica qué aporta cada campo y aplica la
   * plantilla elegida. Terminar o cerrar guarda style.guide = false; se reabre desde
   * Formato → Style template. persistProperties solo desde un clic del usuario.
   */
  private buildGuide(): HTMLElement {
    const azul = this.hc ? this.hcFgSel : "#2B6CB0";
    const fg = this.hc ? this.hcFg : "#252423";
    const muted = this.hc ? this.hcFg : "#605E5C";
    const g = document.createElement("div");
    g.className = "tcviz-guide";
    g.setAttribute("role", "dialog");
    g.setAttribute("aria-label", this.t("Guide_Title", "Setup guide"));
    g.style.cssText = "position:absolute;left:8px;right:8px;bottom:8px;max-height:calc(100% - 16px);overflow:auto;"
      + `background:${this.hc ? this.hcBg : "#FFFFFF"};border:1px solid ${azul};border-radius:8px;`
      + "box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:10px 12px;box-sizing:border-box;z-index:20;"
      + `font:12px/1.4 'Segoe UI',sans-serif;color:${fg};text-align:left;cursor:default;`;
    g.addEventListener("click", e => e.stopPropagation());
    g.addEventListener("keydown", e => e.stopPropagation());

    const terminar = () => {
      this.guideStep = 2;
      this.host.persistProperties({ merge: [{ objectName: "style", selector: null as any, properties: { guide: false } }] });
    };
    const boton = (texto: string, principal: boolean, accion: () => void): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = texto;
      b.style.cssText = "font:600 12px 'Segoe UI',sans-serif;border-radius:4px;padding:3px 12px;cursor:pointer;"
        + (principal ? `background:${azul};color:${this.hc ? this.hcBg : "#FFFFFF"};border:1px solid ${azul};`
                     : `background:transparent;color:${azul};border:1px solid ${azul};`);
      b.addEventListener("click", accion);
      return b;
    };

    const cab = document.createElement("div");
    cab.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px;";
    const paso = document.createElement("div");
    paso.textContent = this.t("Guide_Step", "Setup · step {0} of 3").replace("{0}", String(this.guideStep));
    paso.style.cssText = `font-weight:700;color:${azul};flex:1;`;
    const cerrar = document.createElement("button");
    cerrar.type = "button";
    cerrar.textContent = "✕";
    cerrar.title = this.t("Guide_Close", "Close the guide");
    cerrar.setAttribute("aria-label", cerrar.title);
    cerrar.style.cssText = `border:none;background:transparent;color:${muted};cursor:pointer;font-size:13px;`;
    cerrar.addEventListener("click", terminar);
    cab.appendChild(paso); cab.appendChild(cerrar);
    g.appendChild(cab);

    const titulo = document.createElement("div");
    titulo.style.cssText = "font-weight:600;font-size:13px;margin-bottom:6px;";
    g.appendChild(titulo);
    const pie = document.createElement("div");
    pie.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:8px;";

    if (this.guideStep !== 3) {
      titulo.textContent = this.t("Guide_Optional", "Add what gives the days context");
      const cols = (this.lastDataView?.table?.columns ?? []) as powerbi.DataViewMetadataColumn[];
      const tiene = (rol: string) => cols.some(c => (c.roles ?? {})[rol]);
      const items: [boolean, string, string][] = [
        [tiene("eventName"), this.t("Guide_Events", "Event Name"), this.t("Guide_EventsWhy", "promotions, campaigns or incidents marked on their day")],
        [tiene("eventCategory"), this.t("Guide_Category", "Event Category"), this.t("Guide_CategoryWhy", "one colour per category, with a legend")],
        [tiene("holidayName"), this.t("Guide_Holidays", "Holiday Name"), this.t("Guide_HolidaysWhy", "public holidays highlighted")],
        [tiene("secondaryMeasures"), this.t("Guide_Tooltips", "Tooltip Measures"), this.t("Guide_TooltipsWhy", "more figures on hover, and switching the measure in the visual (Pro)")],
      ];
      const lista = document.createElement("div");
      lista.setAttribute("role", "list");
      for (const [hecho, nombre, porque] of items) {
        const f = document.createElement("div");
        f.setAttribute("role", "listitem");
        f.style.cssText = "display:flex;gap:6px;align-items:baseline;margin:2px 0;";
        const marca = document.createElement("span");
        marca.textContent = hecho ? "✓" : "○";
        marca.setAttribute("aria-label", hecho ? this.t("Guide_Done", "added") : this.t("Guide_Todo", "not added"));
        marca.style.cssText = `font-weight:700;color:${hecho ? (this.hc ? this.hcFg : "#107C10") : muted};width:12px;flex-shrink:0;`;
        const txt = document.createElement("span");
        const b = document.createElement("b");
        b.textContent = nombre;
        txt.appendChild(b);
        txt.appendChild(document.createTextNode(" — " + porque));
        txt.style.color = hecho ? muted : fg;
        f.appendChild(marca); f.appendChild(txt);
        lista.appendChild(f);
      }
      g.appendChild(lista);
      const nota = document.createElement("div");
      nota.textContent = this.t("Guide_Wells", "Drag the fields into the field wells; this list updates by itself. All optional.");
      nota.style.cssText = `color:${muted};font-size:11px;margin-top:4px;`;
      g.appendChild(nota);
      pie.appendChild(boton(this.t("Guide_Next", "Next"), true, () => { this.guideStep = 3; this.render(); this.updateWatermark(); }));
    } else {
      titulo.textContent = this.t("Guide_Style", "Pick a style");
      const actual = this.rawSettings.style.template;
      const rejilla = document.createElement("div");
      rejilla.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px;";
      for (const nombre of Object.keys(TEMPLATES)) {
        const valor = (card: string, prop: string, def: unknown) =>
          ((TEMPLATES[nombre].find(([c2, p2]) => c2 === card && p2 === prop) || [])[2] ?? def) as any;
        const esquema = SCHEMES[String(valor("heatmap", "scheme", "custom"))] ?? [this.rawSettings.heatmap.colorMin, "#E0A080", this.rawSettings.heatmap.colorMax];
        const radio = Math.min(4, Number(valor("layout", "cellRadius", 4)));
        const chip = document.createElement("button");
        chip.type = "button";
        chip.setAttribute("aria-pressed", String(nombre === actual));
        chip.style.cssText = `border:${nombre === actual ? 2 : 1}px solid ${nombre === actual ? azul : "#C8C6C4"};`
          + "border-radius:6px;padding:6px;cursor:pointer;text-align:left;background:#FFFFFF;";
        const mini = document.createElement("div");
        mini.style.cssText = "display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;";
        [0, 1, 2, 1, 2, 2, 0, 1, 0, 2, 1, 2, 2, 1].forEach(i => {
          const sq = document.createElement("span");
          sq.style.cssText = `display:block;aspect-ratio:1;border-radius:${radio}px;background:${esquema[i]};`;
          mini.appendChild(sq);
        });
        const etq = document.createElement("div");
        etq.textContent = nombre === "tcviz" ? "TCViz" : nombre.charAt(0).toUpperCase() + nombre.slice(1);
        etq.style.cssText = `font:11px 'Segoe UI',sans-serif;color:${fg};`;
        chip.appendChild(mini); chip.appendChild(etq);
        chip.addEventListener("click", () => {
          this.host.persistProperties({ merge: [{ objectName: "style", selector: null as any, properties: { template: nombre } }] });
        });
        rejilla.appendChild(chip);
      }
      g.appendChild(rejilla);
      pie.appendChild(boton(this.t("Guide_Back", "Back"), false, () => { this.guideStep = 2; this.render(); this.updateWatermark(); }));
      pie.appendChild(boton(this.t("Guide_Finish", "Finish"), true, terminar));
    }
    g.appendChild(pie);
    return g;
  }

  // ─── Vistas y navegación (1.2.0.0) ─────────────────────────────────────────

  /** Cambia de vista respetando el plan: semana y año son Pro. Sin licencia y sin vista previa
   *  se avisa con la notificación de Power BI; en vista previa se pinta y se avisa igual. */
  private goTo(view: "year" | "month" | "week"): void {
    if (view !== "month" && !this.isPro) {
      const etiqueta = view === "week" ? "week view" : "year view";
      if (!this.proPreview) { this.notifyProBlocked(etiqueta); return; }
      this.currentView = view;
      this.render();
      this.notifyProBlocked(etiqueta);
      this.updateWatermark();
      return;
    }
    this.currentView = view;
    this.render();
    this.updateWatermark();
  }

  /** Número de semana: ISO 8601 (lunes, la semana con el primer jueves es la 1) o US (domingo,
   *  la semana del 1 de enero es la 1). */
  private weekNumber(d: Date): number {
    if (this.settings.calendar.weekNumbers === "us") {
      const ene1 = new Date(d.getFullYear(), 0, 1);
      const dia = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - ene1.getTime()) / 86400000);
      return Math.floor((dia + ene1.getDay()) / 7) + 1;
    }
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t.getTime() - inicio.getTime()) / 86400000 + 1) / 7);
  }

  // ─── Calendario fiscal (1.2.0.0) ───────────────────────────────────────────

  /** Semanas por periodo en un trimestre (4-4-5, 4-5-4, 5-4-4), o null si el fiscal es por meses. */
  private retailPattern(): number[] | null {
    const c = this.settings.calendar;
    if (!c.fiscalEnabled || !c.fiscalType || c.fiscalType === "months") return null;
    return c.fiscalType === "454" ? [4, 5, 4] : c.fiscalType === "544" ? [5, 4, 4] : [4, 4, 5];
  }

  private fiscalStartIndex(): number {
    return Math.max(1, Math.min(12, this.settings.calendar.fiscalStartMonth || 1)) - 1;
  }

  /**
   * Inicio del año fiscal FY{fy}. El año fiscal se nombra por el año en que termina. En semanas
   * (4-4-5) empieza el día de inicio de semana más cercano al día 1 del mes fiscal: así todos los
   * periodos tienen semanas completas y hay años de 52 y de 53 semanas.
   */
  private fiscalYearStart(fy: number): Date {
    const m = this.fiscalStartIndex();
    const y = m > 0 ? fy - 1 : fy;
    const ancla = new Date(y, m, 1);
    if (!this.retailPattern()) return ancla;
    const dif = (ancla.getDay() - this.settings.calendar.weekStart + 7) % 7;
    return dif <= 3 ? new Date(y, m, 1 - dif) : new Date(y, m, 1 + (7 - dif));
  }

  private fiscalYearOf(d: Date): number {
    let fy = d.getFullYear() + (this.fiscalStartIndex() > 0 && d.getMonth() >= this.fiscalStartIndex() ? 1 : 0);
    while (d < this.fiscalYearStart(fy)) fy--;
    while (d >= this.fiscalYearStart(fy + 1)) fy++;
    return fy;
  }

  /** Mes fiscal (por meses de calendario): año fiscal y número de periodo 1..12. */
  private fiscalMonthOf(d: Date): { fy: number; n: number } {
    return { fy: this.fiscalYearOf(d), n: ((d.getMonth() - this.fiscalStartIndex() + 12) % 12) + 1 };
  }

  /** Los 12 periodos del año fiscal en semanas; en un año de 53, la semana extra va al último. */
  private periods(fy: number): { fy: number; n: number; start: Date; end: Date }[] {
    const pat = this.retailPattern() ?? [4, 4, 5];
    const ini = this.fiscalYearStart(fy), sig = this.fiscalYearStart(fy + 1);
    const semanas = Math.round((sig.getTime() - ini.getTime()) / (7 * 86400000));
    const out: { fy: number; n: number; start: Date; end: Date }[] = [];
    let cursor = new Date(ini);
    for (let i = 0; i < 12; i++) {
      const w = pat[i % 3] + (i === 11 && semanas > 52 ? 1 : 0);
      const fin = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + w * 7 - 1);
      out.push({ fy, n: i + 1, start: cursor, end: fin });
      cursor = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1);
    }
    return out;
  }

  private periodOf(d: Date): { fy: number; n: number; start: Date; end: Date } {
    const ps = this.periods(this.fiscalYearOf(d));
    return ps.find(p => d >= p.start && d <= new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate(), 23, 59)) ?? ps[0];
  }

  /** n periodos consecutivos desde el que contiene d. */
  private periodsFrom(d: Date, n: number): { fy: number; n: number; start: Date; end: Date }[] {
    const out = [this.periodOf(d)];
    while (out.length < n) {
      const u = out[out.length - 1];
      out.push(this.periodOf(new Date(u.end.getFullYear(), u.end.getMonth(), u.end.getDate() + 1)));
    }
    return out;
  }

  private shortRange(a: Date, b: Date): string {
    const f = new Intl.DateTimeFormat(this.loc(), { day: "numeric", month: "short" });
    return `${f.format(a)} – ${f.format(b)}`;
  }

  /** Botón de la cabecera. */
  private chromeButton(attr: string, value: string, text: string, label: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute(attr, value);
    b.setAttribute("aria-label", label);
    b.title = label;
    b.style.cssText = this.navBtnStyle();
    b.textContent = text;
    return b;
  }

  /**
   * Cabecera común: ← título Hoy →, los botones Year / Month / Week y las leyendas. El título
   * sube un nivel (semana → mes → año) cuando `up` lo indica.
   */
  private buildChrome(outer: HTMLElement, label: string, up: "year" | "month" | null): void {
    const v = this.currentView;
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;flex-shrink:0;";
    const prevTxt = v === "year" ? this.t("Cal_PrevYear", "Previous year") : v === "month" ? this.t("Cal_PrevMonth", "Previous month") : this.t("Cal_PrevWeek", "Previous week");
    const nextTxt = v === "year" ? this.t("Cal_NextYear", "Next year") : v === "month" ? this.t("Cal_NextMonth", "Next month") : this.t("Cal_NextWeek", "Next week");
    header.appendChild(this.chromeButton("data-nav", "prev", "←", prevTxt));

    const centro = document.createElement("div");
    centro.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0;";
    const titulo = document.createElement(up ? "button" : "span");
    titulo.setAttribute("aria-live", "polite");
    titulo.style.cssText = `font-weight:600;font-size:14px;color:${this.fg(null, "#3D3929")};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
      + (up ? "background:none;border:none;cursor:pointer;padding:0;text-decoration:underline dotted;text-underline-offset:3px;" : "");
    titulo.textContent = label;
    if (up) {
      (titulo as HTMLButtonElement).type = "button";
      titulo.setAttribute("data-up", up);
      titulo.title = up === "year" ? this.t("Cal_GoYear", "Show the whole year") : this.t("Cal_GoMonth", "Show the month");
    }
    centro.appendChild(titulo);
    const hoy = this.chromeButton("data-today", "1", this.t("Cal_Today", "Today"), this.t("Cal_GoToday", "Go to today"));
    hoy.style.cssText = this.viewBtnStyle(false);
    centro.appendChild(hoy);
    header.appendChild(centro);
    header.appendChild(this.chromeButton("data-nav", "next", "→", nextTxt));
    outer.appendChild(header);

    const viewRow = document.createElement("div");
    viewRow.setAttribute("role", "group");
    viewRow.setAttribute("aria-label", this.t("Cal_ViewGroup", "Calendar view"));
    this.subSelectable(viewRow, "navigation", this.t("OO_Buttons", "View buttons"), powerbi.visuals.SubSelectionStylesType.Text);
    viewRow.style.cssText = "display:flex;gap:4px;margin-bottom:8px;flex-shrink:0;align-items:center;flex-wrap:wrap;";
    const pro = this.isPro || this.proPreview;
    const vistas: ["year" | "month" | "week", string, string, boolean][] = [
      ["year", this.t("Cal_Year", "Year"), this.t("Cal_YearView", "Year view"), true],
      ["month", this.t("Cal_Month", "Month"), this.t("Cal_MonthView", "Month view"), false],
      ["week", this.t("Cal_Week", "Week"), this.t("Cal_WeekView", "Week view"), true]];
    for (const [id, texto, aria, esPro] of vistas) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-view", id);
      b.setAttribute("aria-label", esPro && !pro ? `${aria} (${this.t("Cal_ProFeature", "Pro feature")})` : aria);
      b.setAttribute("aria-pressed", String(v === id));
      b.style.cssText = this.viewBtnStyle(v === id);
      b.textContent = texto;
      viewRow.appendChild(b);
    }
    if (this.measureNames.length > 1) {
      const sep = document.createElement("span");
      sep.style.cssText = "flex:1;";
      viewRow.appendChild(sep);
      const etq = document.createElement("label");
      etq.style.cssText = `font-size:11px;color:${this.fg(this.settings.navigation.textColor, "#535146")};display:flex;align-items:center;gap:4px;`;
      etq.textContent = this.t("Cal_Measure", "Measure");
      const sel = document.createElement("select");
      sel.setAttribute("data-measure", "1");
      sel.setAttribute("aria-label", this.t("Cal_MeasureAria", "Measure shown in the calendar")
        + (pro ? "" : ` (${this.t("Cal_ProFeature", "Pro feature")})`));
      sel.style.cssText = this.viewBtnStyle(false) + "padding:1px 4px;";
      this.measureNames.forEach((n, i) => {
        const o = document.createElement("option");
        o.value = String(i);
        o.textContent = n;
        sel.appendChild(o);
      });
      sel.value = String(pro ? this.activeMeasure : 0);
      etq.appendChild(sel);
      viewRow.appendChild(etq);
    }
    outer.appendChild(viewRow);

    const legend = this.compact() ? null : this.buildCategoryLegend();
    if (legend) {
      this.subSelectable(legend, "events", this.t("OO_Events", "Events"), powerbi.visuals.SubSelectionStylesType.Shape);
      outer.appendChild(legend);
    }
    this.appendScaleLegend(outer, "top");
  }

  /**
   * Leyenda de la escala de color: degradado del mínimo al máximo con sus valores (criterio
   * de leyenda de OKviz). En alto contraste no hay degradado que explicar: no se pinta.
   */
  /**
   * Modo compacto (1.2.0.0): por debajo de 320 px de ancho o de alto se retiran las leyendas y el
   * valor de cada día, y se reduce el margen. Antes la vista de mes exigía 380 px de alto y en un
   * visual más bajo se cortaba.
   */
  private compact(): boolean {
    return this.viewport.width < 320 || this.viewport.height < 320;
  }

  private appendScaleLegend(outer: HTMLElement, where: "top" | "bottom"): void {
    if (this.compact()) return;
    const lg = this.settings.legend;
    if (!lg.show || lg.position !== where || this.hc || this.calendarData.length === 0) return;
    const fila = document.createElement("div");
    this.subSelectable(fila, "legend", this.t("OO_Legend", "Color legend"), powerbi.visuals.SubSelectionStylesType.Shape);
    fila.setAttribute("role", "img");
    const minTxt = this.formatValue(this.valueMin), maxTxt = this.formatValue(this.valueMax);
    fila.setAttribute("aria-label", this.t("Cal_ScaleLegend", "Color scale from {0} to {1}").replace("{0}", minTxt).replace("{1}", maxTxt));
    fila.style.cssText = `display:flex;align-items:center;gap:6px;font-size:9px;color:${this.fg(null, "#83827D")};`
      + (where === "top" ? "margin-bottom:6px;" : "margin-top:6px;") + "flex-shrink:0;";
    const barra = document.createElement("span");
    barra.style.cssText = `display:inline-block;width:110px;height:8px;border-radius:4px;`
      + `background:linear-gradient(90deg,${this.scaleStops().map(c => this.sanitizeColor(c, "#C96442")).join(",")});`;
    if (lg.showValues) { const a = document.createElement("span"); a.textContent = minTxt; fila.appendChild(a); }
    fila.appendChild(barra);
    if (lg.showValues) { const b = document.createElement("span"); b.textContent = maxTxt; fila.appendChild(b); }
    outer.appendChild(fila);
  }

  /**
   * Vista de año (Pro): los doce meses en miniatura, cada día coloreado por la medida. Un clic
   * en el nombre de un mes lo abre (navegación jerárquica). Con calendario fiscal, el año empieza
   * en el mes fiscal.
   */
  private buildYearView(): HTMLElement {
    const fiscal = this.settings.calendar.fiscalEnabled;
    const mesIni = fiscal ? Math.max(1, Math.min(12, this.settings.calendar.fiscalStartMonth || 1)) - 1 : 0;
    const cur = this.currentDate;
    const anioIni = cur.getMonth() >= mesIni ? cur.getFullYear() : cur.getFullYear() - 1;
    const retail = this.retailPattern() ? this.periods(this.fiscalYearOf(cur)) : null;
    const label = retail ? `${this.t("Cal_FY", "FY")}${retail[0].fy}`
      : fiscal && mesIni > 0 ? `${this.t("Cal_FY", "FY")}${anioIni + 1}`
      : String(anioIni);
    const weekStart = this.settings.calendar.weekStart;
    const dayMap = new Map(this.calendarData.map(d => [this.dateKey(d.date), d]));
    const today = this.dateKey(new Date());
    const ac = this.accent(this.settings.navigation.activeColor, "#C96442");
    const hol = this.fg(this.settings.dayNumber.holidayColor, "#C96442");
    const iniciales = new Intl.DateTimeFormat(this.loc(), { weekday: "narrow" });

    const outer = document.createElement("div");
    outer.style.cssText = `display:flex;flex-direction:column;height:100%;padding:${this.compact() ? 4 : 8}px;box-sizing:border-box;overflow:hidden;`;
    this.buildChrome(outer, label, null);

    const cols = Math.max(2, Math.min(6, Math.floor((this.viewport.width - 16) / 170)));
    const rejilla = document.createElement("div");
    rejilla.style.cssText = `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:12px;flex:1;min-height:0;overflow-y:auto;align-content:start;`;

    for (let m = 0; m < 12; m++) {
      const ini = retail ? retail[m].start : new Date(anioIni, mesIni + m, 1);
      const fin = retail ? retail[m].end : new Date(ini.getFullYear(), ini.getMonth() + 1, 0);
      const bloque = document.createElement("div");
      bloque.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;";
      const nombre = retail ? `P${retail[m].n} · ${this.shortRange(ini, fin)}` : ini.toLocaleString(this.loc(), { month: "long" });
      const t = document.createElement("button");
      t.type = "button";
      t.setAttribute("data-drill-month", this.dateKey(ini));
      t.setAttribute("aria-label", this.t("Cal_OpenMonth", "Open {0}").replace("{0}", ini.toLocaleString(this.loc(), { month: "long", year: "numeric" })));
      t.style.cssText = `border:none;background:none;cursor:pointer;padding:0 0 2px;text-align:left;font-size:11px;font-weight:600;`
        + `color:${this.fg(null, "#3D3929")};text-transform:capitalize;`;
      t.textContent = nombre;
      bloque.appendChild(t);

      const g = document.createElement("div");
      g.setAttribute("role", "grid");
      g.setAttribute("aria-label", `${this.t("Cal_Heatmap", "Calendar heatmap")}, ${nombre}`);
      g.style.cssText = "display:grid;grid-template-columns:repeat(7,1fr);gap:2px;";
      for (let i = 0; i < 7; i++) {
        const h = document.createElement("div");
        h.setAttribute("role", "columnheader");
        h.style.cssText = `text-align:center;font-size:8px;color:${this.fg(null, "#83827D")};`;
        h.textContent = iniciales.format(new Date(2024, 0, 7 + ((i + weekStart) % 7)));
        g.appendChild(h);
      }
      const hueco = (ini.getDay() - weekStart + 7) % 7;
      for (let i = 0; i < hueco; i++) { const e = document.createElement("div"); e.setAttribute("aria-hidden", "true"); g.appendChild(e); }
      for (let fecha = new Date(ini); fecha <= fin; fecha = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1)) {
        const key = this.dateKey(fecha);
        const day = dayMap.get(key);
        const chrome = this.cellChrome(day, key === today, day?.isHoliday ?? false, ac, hol);
        const c = document.createElement("div");
        c.setAttribute("data-date", key);
        c.setAttribute("data-has-data", day ? "1" : "0");
        c.setAttribute("role", "gridcell");
        c.setAttribute("tabindex", "-1");
        c.setAttribute("aria-label", this.cellAriaLabel(fecha, day));
        c.setAttribute("aria-selected", "false");
        c.style.cssText = `aspect-ratio:1;border-radius:2px;box-sizing:border-box;background-color:${chrome.bg};border:${chrome.border};`
          + `font-size:7px;line-height:1;color:${this.fg(this.settings.dayNumber.color, "#3D3929")};display:flex;align-items:center;justify-content:center;`
          + `overflow:hidden;cursor:${day ? "pointer" : "default"};`;
        if ((day?.events?.length ?? 0) > 0 && this.settings.events.showEvents) {
          c.style.boxShadow = `inset 0 -2px 0 ${this.sanitizeColor(day!.events[0].color, "#C96442")}`;
        }
        g.appendChild(c);
      }
      bloque.appendChild(g);
      rejilla.appendChild(bloque);
    }
    outer.appendChild(rejilla);
    this.appendScaleLegend(outer, "bottom");
    return outer;
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

  // ─── Panel de formato (modelo de formato, 1.2.0.0) ────────────────────────

  /** Texto en el idioma de Power BI; las claves del panel están en capabilities.json. */
  /**
   * Texto en el idioma de Power BI. Primero la tabla del bundle (src/strings.ts): Desktop solo
   * resuelve con getDisplayName las claves declaradas en capabilities.json, y los textos del
   * propio visual —botones, asistente, avisos— no lo están (visto en KPI Card 2.2). Después el
   * gestor de Power BI (claves del panel) y, si nada responde, el inglés.
   */
  private t(key: string, fallback: string): string {
    const propio = this.stringsFor()?.[key];
    if (propio) return propio;
    try {
      const v = this.localization?.getDisplayName(key);
      return v && v !== key ? v : fallback;
    } catch (_) {
      return fallback;
    }
  }

  private stringsFor(): Record<string, string> | undefined {
    const loc = this.loc();
    if (/^en/i.test(loc)) return undefined;
    if (STRINGS[loc]) return STRINGS[loc];
    const lang = loc.split("-")[0].toLowerCase();
    const k = Object.keys(STRINGS).sort().find(x => x.toLowerCase().startsWith(lang + "-"));
    return k ? STRINGS[k] : undefined;
  }

  /**
   * Sustituye a enumerateObjectInstances (API antigua, sin panel nuevo ni formato sobre el
   * lienzo). Recorre PANEL, generado desde capabilities.json. Muestra lo que eligió el usuario,
   * no los valores efectivos de Free: si mostrara los de Free parecería que el ajuste no se aplica.
   * Las tarjetas Pro se ven también en Free (llevan "[Pro]"): si no, nadie descubre que existen.
   */
  public getFormattingModel(): powerbi.visuals.FormattingModel {
    const s = this.rawSettings ?? defaultSettings;
    const objs: any = this.lastDataView?.metadata?.objects ?? {};
    const cards: powerbi.visuals.FormattingCard[] = [];

    const valor = (o: string, pr: PanelProp): any => {
      if (o === "eventCategoryColors") {
        const i = parseInt(pr.p.slice(1), 10);
        const cat = this.uniqueEventCategories[i] ?? "";
        return (objs?.eventCategoryColors?.[pr.p] as any)?.solid?.color ?? this.categoryColor(cat);
      }
      const regla = /^rule(\d)(On|Op|Value|Color)$/.exec(pr.p);
      if (o === "rules" && regla) {
        const r = s.rules[parseInt(regla[1], 10) - 1];
        return regla[2] === "On" ? r.on : regla[2] === "Op" ? r.op : regla[2] === "Value" ? r.value : r.color;
      }
      const v = (s as any)[o]?.[pr.p];
      if (o === "heatmap" && pr.p === "dayColor") return s.heatmap.colorMax;
      if (o === "events" && pr.p === "eventBgColor") return v ?? "#C96442";
      return v;
    };

    for (const card of PANEL) {
      const slices: powerbi.visuals.FormattingSlice[] = [];
      const reset: powerbi.visuals.FormattingDescriptor[] = [];
      for (const pr of card.props) {
        if (card.o === "events" && pr.p === "eventBgColor" && !s.events.useGlobalColor) continue;
        let nombre = this.t(pr.key, pr.en);
        if (card.o === "eventCategoryColors") {
          const i = parseInt(pr.p.slice(1), 10);
          if (i >= Math.max(1, this.uniqueEventCategories.length)) continue;
          nombre = this.uniqueEventCategories[i] || nombre;
        }
        const descriptor: any = { objectName: card.o, propertyName: pr.p };
        const v = valor(card.o, pr);
        let control: any;
        switch (pr.kind) {
          case "color":
            control = { type: powerbi.visuals.FormattingComponent.ColorPicker, properties: { descriptor, value: { value: v } } };
            break;
          case "toggle":
            control = { type: powerbi.visuals.FormattingComponent.ToggleSwitch, properties: { descriptor, value: !!v } };
            break;
          case "num":
            control = { type: powerbi.visuals.FormattingComponent.NumUpDown, properties: { descriptor, value: Number(v) } };
            break;
          case "drop":
            control = { type: powerbi.visuals.FormattingComponent.Dropdown, properties: { descriptor, value: String(v) } };
            break;
          case "font":
            control = { type: powerbi.visuals.FormattingComponent.FontPicker, properties: { descriptor, value: String(v) } };
            break;
          default:
            control = { type: powerbi.visuals.FormattingComponent.TextInput, properties: { descriptor, value: String(v ?? ""), placeholder: "" } };
        }
        slices.push({ uid: `${card.o}-${pr.p}`, displayName: nombre, control } as any);
        reset.push({ objectName: card.o, propertyName: pr.p });
      }
      if (slices.length === 0) continue;
      cards.push({
        uid: `${card.o}-card`,
        displayName: this.t(card.key, card.en),
        groups: [{ uid: `${card.o}-group`, displayName: undefined as any, slices }],
        revertToDefaultDescriptors: reset,
      } as any);
    }
    return { cards };
  }
}
