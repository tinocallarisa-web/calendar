// SP_IDENTIFIER: Plan ID, la última parte del Service ID de Partner Center
export const SP_IDENTIFIER = "calendar-tcviz";

/**
 * spIdentifier es el Service ID completo de Partner Center ("editor.oferta.plan", p.ej.
 * "tino_callarisa.calendar-events-heatmap.calendar-tcviz"), no el Plan ID corto: lo dice
 * la documentación de la licensing API. Comparar solo con el Plan ID dejaba en Free a quien
 * pagaba. Se acepta el Service ID que termina en ".<plan>" y también el Plan ID.
 */
export function matchesPlan(spIdentifier: unknown, planId: string): boolean {
  const sp = String(spIdentifier ?? "");
  return sp === planId || sp.endsWith("." + planId);
}
// La prueba de 30 días la gestiona el plan de Partner Center (se ve como plan Active):
// el visual no lleva lógica de prueba propia.

/** Paletas de tres puntos (bajo, medio, alto). "custom" usa los colores mínimo y máximo del panel. */
export const SCHEMES: Record<string, [string, string, string]> = {
  blues: ["#F7FBFF", "#6BAED6", "#08306B"],
  greens: ["#F7FCF5", "#74C476", "#00441B"],
  purples: ["#FCFBFD", "#9E9AC8", "#3F007D"],
  greys: ["#FFFFFF", "#969696", "#252525"],
  trafficUp: ["#D73027", "#FEE08B", "#1A9850"],
  trafficDown: ["#1A9850", "#FEE08B", "#D73027"],
  viridis: ["#440154", "#21918C", "#FDE725"],
  cividis: ["#00224E", "#7D7C78", "#FEE838"],
  github: ["#EBEDF0", "#40C463", "#216E39"],
  tcviz: ["#EAF2FB", "#5B9BD5", "#1F4E80"],
};

/**
 * Plantillas de estilo (1.2.0.0, gratis): [tarjeta, propiedad, valor]. Solo rellenan lo que el
 * autor no ha tocado (lo que no está en metadata.objects): un ajuste a mano siempre gana.
 * "classic" es el aspecto de siempre, y es el valor por defecto: los informes no cambian.
 */
export const TEMPLATES: Record<string, [string, string, unknown][]> = {
  classic: [],
  clean: [["heatmap", "scheme", "blues"], ["heatmap", "colorNull", "#F3F5F8"], ["layout", "cellRadius", 6], ["layout", "cellGap", 3],
          ["dayNumber", "color", "#1F2937"], ["dayNumber", "weekendColor", "#6B7280"], ["dayNumber", "holidayColor", "#2B6CB0"],
          ["navigation", "activeColor", "#2B6CB0"], ["navigation", "textColor", "#374151"]],
  tiles: [["heatmap", "scheme", "github"], ["heatmap", "colorNull", "#F1F3F5"], ["layout", "cellRadius", 8], ["layout", "cellGap", 4],
          ["dayNumber", "color", "#24292F"], ["dayNumber", "weekendColor", "#57606A"], ["dayNumber", "holidayColor", "#1A7F37"],
          ["navigation", "activeColor", "#216E39"], ["navigation", "textColor", "#24292F"]],
  minimal: [["heatmap", "scheme", "greys"], ["heatmap", "colorNull", "#FFFFFF"], ["layout", "cellRadius", 0], ["layout", "cellGap", 1],
            ["dayNumber", "color", "#3D3D3D"], ["dayNumber", "weekendColor", "#8A8886"], ["dayNumber", "holidayColor", "#3D3D3D"],
            ["navigation", "activeColor", "#3D3D3D"], ["navigation", "textColor", "#3D3D3D"]],
  tcviz: [["heatmap", "scheme", "tcviz"], ["heatmap", "colorNull", "#F4F7FB"], ["layout", "cellRadius", 6], ["layout", "cellGap", 3],
          ["dayNumber", "color", "#1F4E80"], ["dayNumber", "weekendColor", "#3E9C5B"], ["dayNumber", "holidayColor", "#3E9C5B"],
          ["navigation", "activeColor", "#2B6CB0"], ["navigation", "textColor", "#1F4E80"]],
};

/**
 * Paletas categóricas para los eventos: colores muy distintos entre sí, para que cada categoría
 * se reconozca de un vistazo en una franja de 3 px. Vivid es la de Okabe-Ito (apta para daltonismo),
 * con el amarillo al final porque sobre fondos claros es el que menos se ve.
 */
export const EVENT_PALETTES: Record<string, string[]> = {
  vivid: ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#D55E00", "#56B4E9", "#000000", "#F0E442"],
  bold: ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7"],
  bright: ["#E41A1C", "#377EB8", "#4DAF4A", "#984EA3", "#FF7F00", "#A65628", "#F781BF", "#999999"],
  dark: ["#1B9E77", "#D95F02", "#7570B3", "#E7298A", "#66A61E", "#E6AB02", "#A6761D", "#666666"],
  classic: ["#9C87F5", "#4BA3C3", "#E8A838", "#5BAD6F", "#D06E8C", "#2B6CB0", "#8C8C3E", "#6B4E9B"],
};

export interface CalendarSettings {
  style: { template: string; guide: boolean };
  layout: { cellRadius: number; cellGap: number };
  calendar: {
    view: "year" | "month" | "week";
    monthsToShow: number;
    fiscalEnabled: boolean;
    fiscalStartMonth: number;
    /** Periodos fiscales: meses de calendario o semanas 4-4-5 y variantes (1.2.0.0). */
    fiscalType: "months" | "445" | "454" | "544";
    weekStart: 0 | 1;
    /** Número de semana a la izquierda de cada fila del mes (1.2.0.0). */
    weekNumbers: "none" | "iso" | "us";
  };
  heatmap: {
    scheme: string;
    colorMin: string;
    colorMax: string;
    colorNull: string;
    /** Constant side of the "Day Color" conditional-formatting property. Null = use the gradient. */
    dayColor: string | null;
    /** Cómo se combinan varias filas del mismo día (1.2.0.0): suma, promedio o máximo. */
    dayAggregation: "auto" | "sum" | "avg" | "max";
  };
  /** Reglas de color (1.2.0.0, gratis): umbrales sobre el valor del día, cada uno con su color.
   *  Sustituyen al fx, que Power BI no ofrece a visuales que leen los datos como tabla. */
  rules: { on: boolean; op: "gte" | "lte"; value: number; color: string }[];
  /** Leyenda de la escala de color (1.2.0.0). */
  legend: {
    show: boolean;
    position: "top" | "bottom";
    showValues: boolean;
    fontSize: number;
    color: string;
  };
  dayNumber: {
    fontSize: number;
    fontFamily: string;
    color: string;
    weekendColor: string;
    holidayColor: string;
  };
  labels: {
    fontSize: number;
    fontFamily: string;
    color: string;
  };
  navigation: {
    activeColor: string;
    textColor: string;
  };
  events: {
    showEvents: boolean;
    /** Qué filtra la leyenda (1.2.0.0): solo las marcas de este visual, o el informe (filtro de Power BI). */
    legendFilter: "visual" | "report";
    /** Eventos como etiquetas o como marcas de color (auto: marcas en mes y año, etiquetas en semana). */
    display: "auto" | "marks" | "labels";
    /** Paleta categórica de los eventos (1.2.0.0, gratis). */
    palette: string;
    maxEventsVisible: number;
    useGlobalColor: boolean;   // false = per-category colors; true = single global color
    eventBgColor: string | null;
    eventFontColor: string;
    eventFontSize: number;
  };
}

export const defaultSettings: CalendarSettings = {
  style: { template: "classic", guide: true },
  layout: { cellRadius: 4, cellGap: 2 },
  calendar: {
    view: "month",
    monthsToShow: 1,
    fiscalEnabled: false,
    fiscalStartMonth: 1,
    fiscalType: "months",
    weekStart: 1,
    weekNumbers: "none",
  },
  heatmap: {
    scheme: "custom",
    colorMin: "#EDE9DE",
    colorMax: "#C96442",
    colorNull: "#F5F3ED",
    dayColor: null,
    dayAggregation: "auto",
  },
  rules: [
    { on: false, op: "gte", value: 0, color: "#1A9850" },
    { on: false, op: "lte", value: 0, color: "#D73027" },
    { on: false, op: "gte", value: 0, color: "#FEE08B" },
  ],
  legend: {
    show: true,
    position: "top",
    showValues: true,
    fontSize: 9,
    color: "#83827D",
  },
  dayNumber: {
    fontSize: 11,
    fontFamily: "Segoe UI, system-ui, sans-serif",
    color: "#3D3929",
    weekendColor: "#C96442",
    holidayColor: "#C96442",
  },
  labels: {
    fontSize: 9,
    fontFamily: "Segoe UI, system-ui, sans-serif",
    color: "#535146",
  },
  navigation: {
    activeColor: "#C96442",
    textColor: "#535146",
  },
  events: {
    showEvents: true,
    legendFilter: "visual",
    display: "auto",
    palette: "vivid",
    maxEventsVisible: 1,
    useGlobalColor: false,
    eventBgColor: null,
    eventFontColor: "#ffffff",
    eventFontSize: 8,
  },
};

/**
 * Ajustes efectivos sin licencia: las opciones Pro vuelven a su valor por defecto.
 * El panel de formato sigue mostrando lo que eligió el usuario (parseSettings).
 */
export function freeSettings(s: CalendarSettings): CalendarSettings {
  return {
    ...s,
    calendar: { ...s.calendar, view: "month", monthsToShow: 1 },
    labels: { ...defaultSettings.labels },
    navigation: { ...defaultSettings.navigation },
    events: {
      ...s.events,
      maxEventsVisible: 1,
      useGlobalColor: defaultSettings.events.useGlobalColor,
      eventBgColor: defaultSettings.events.eventBgColor,
      eventFontColor: defaultSettings.events.eventFontColor,
      eventFontSize: defaultSettings.events.eventFontSize,
    },
  };
}

export function parseSettings(dataView: powerbi.DataView): CalendarSettings {
  if (!dataView?.metadata?.objects) return JSON.parse(JSON.stringify(defaultSettings));
  const obj = dataView.metadata.objects;

  return {
    style: {
      template: (obj["style"]?.["template"] as string) ?? defaultSettings.style.template,
      guide: (obj["style"]?.["guide"] as boolean) ?? defaultSettings.style.guide,
    },
    layout: {
      cellRadius: (obj["layout"]?.["cellRadius"] as number) ?? defaultSettings.layout.cellRadius,
      cellGap: (obj["layout"]?.["cellGap"] as number) ?? defaultSettings.layout.cellGap,
    },
    calendar: {
      view: (obj["calendar"]?.["view"] as "year" | "month" | "week") ?? defaultSettings.calendar.view,
      monthsToShow: parseInt(String(obj["calendar"]?.["monthsToShow"] ?? defaultSettings.calendar.monthsToShow), 10) || defaultSettings.calendar.monthsToShow,
      fiscalEnabled: (obj["calendar"]?.["fiscalEnabled"] as boolean) ?? defaultSettings.calendar.fiscalEnabled,
      fiscalStartMonth: (obj["calendar"]?.["fiscalStartMonth"] as number) ?? defaultSettings.calendar.fiscalStartMonth,
      fiscalType: (obj["calendar"]?.["fiscalType"] as "months" | "445" | "454" | "544") ?? defaultSettings.calendar.fiscalType,
      weekStart: (parseInt(String(obj["calendar"]?.["weekStart"] ?? defaultSettings.calendar.weekStart), 10) || 0) as 0 | 1,
      weekNumbers: (obj["calendar"]?.["weekNumbers"] as "none" | "iso" | "us") ?? defaultSettings.calendar.weekNumbers,
    },
    heatmap: {
      scheme: (obj["heatmap"]?.["scheme"] as string) ?? defaultSettings.heatmap.scheme,
      colorMin: (obj["heatmap"]?.["colorMin"] as any)?.solid?.color ?? defaultSettings.heatmap.colorMin,
      colorMax: (obj["heatmap"]?.["colorMax"] as any)?.solid?.color ?? defaultSettings.heatmap.colorMax,
      colorNull: (obj["heatmap"]?.["colorNull"] as any)?.solid?.color ?? defaultSettings.heatmap.colorNull,
      dayColor: (obj["heatmap"]?.["dayColor"] as any)?.solid?.color ?? null,
      dayAggregation: ((obj["heatmap"]?.["dayAggregation"] as string) ?? defaultSettings.heatmap.dayAggregation) as "auto" | "sum" | "avg" | "max",
    },
    rules: [1, 2, 3].map(n => ({
      on: (obj["rules"]?.[`rule${n}On`] as boolean) ?? false,
      op: ((obj["rules"]?.[`rule${n}Op`] as string) ?? defaultSettings.rules[n - 1].op) as "gte" | "lte",
      value: (obj["rules"]?.[`rule${n}Value`] as number) ?? 0,
      color: (obj["rules"]?.[`rule${n}Color`] as any)?.solid?.color ?? defaultSettings.rules[n - 1].color,
    })),
    legend: {
      show: (obj["legend"]?.["show"] as boolean) ?? defaultSettings.legend.show,
      position: (obj["legend"]?.["position"] as "top" | "bottom") ?? defaultSettings.legend.position,
      showValues: (obj["legend"]?.["showValues"] as boolean) ?? defaultSettings.legend.showValues,
      fontSize: (obj["legend"]?.["fontSize"] as number) ?? defaultSettings.legend.fontSize,
      color: (obj["legend"]?.["color"] as any)?.solid?.color ?? defaultSettings.legend.color,
    },
    dayNumber: {
      fontSize: (obj["dayNumber"]?.["fontSize"] as number) ?? defaultSettings.dayNumber.fontSize,
      fontFamily: (obj["dayNumber"]?.["fontFamily"] as string) ?? defaultSettings.dayNumber.fontFamily,
      color: (obj["dayNumber"]?.["color"] as any)?.solid?.color ?? defaultSettings.dayNumber.color,
      weekendColor: (obj["dayNumber"]?.["weekendColor"] as any)?.solid?.color ?? defaultSettings.dayNumber.weekendColor,
      holidayColor: (obj["dayNumber"]?.["holidayColor"] as any)?.solid?.color ?? defaultSettings.dayNumber.holidayColor,
    },
    labels: {
      fontSize: (obj["labels"]?.["fontSize"] as number) ?? defaultSettings.labels.fontSize,
      fontFamily: (obj["labels"]?.["fontFamily"] as string) ?? defaultSettings.labels.fontFamily,
      color: (obj["labels"]?.["color"] as any)?.solid?.color ?? defaultSettings.labels.color,
    },
    navigation: {
      activeColor: (obj["navigation"]?.["activeColor"] as any)?.solid?.color ?? defaultSettings.navigation.activeColor,
      textColor: (obj["navigation"]?.["textColor"] as any)?.solid?.color ?? defaultSettings.navigation.textColor,
    },
    events: {
      showEvents: (obj["events"]?.["showEvents"] as boolean) ?? defaultSettings.events.showEvents,
      legendFilter: ((obj["events"]?.["legendFilter"] as string) === "report" ? "report" : "visual"),
      display: (obj["events"]?.["display"] as "auto" | "marks" | "labels") ?? defaultSettings.events.display,
      palette: (obj["events"]?.["palette"] as string) ?? defaultSettings.events.palette,
      maxEventsVisible: (obj["events"]?.["maxEventsVisible"] as number) ?? defaultSettings.events.maxEventsVisible,
      useGlobalColor: (obj["events"]?.["useGlobalColor"] as boolean) ?? defaultSettings.events.useGlobalColor,
      eventBgColor: (obj["events"]?.["eventBgColor"] as any)?.solid?.color ?? null,
      eventFontColor: (obj["events"]?.["eventFontColor"] as any)?.solid?.color ?? defaultSettings.events.eventFontColor,
      eventFontSize: (obj["events"]?.["eventFontSize"] as number) ?? defaultSettings.events.eventFontSize,
    },
  };
}

/** Aplica la plantilla elegida a lo que el autor no ha fijado en el panel. */
export function applyTemplate(s: CalendarSettings, objects: powerbi.DataViewObjects | undefined): CalendarSettings {
  const out: any = JSON.parse(JSON.stringify(s));
  for (const [card, prop, val] of TEMPLATES[s.style.template] ?? []) {
    if ((objects as any)?.[card]?.[prop] !== undefined) continue;
    if (out[card]) out[card][prop] = val;
  }
  return out as CalendarSettings;
}
