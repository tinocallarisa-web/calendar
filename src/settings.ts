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

export interface CalendarSettings {
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
    colorMin: string;
    colorMax: string;
    colorNull: string;
    /** Constant side of the "Day Color" conditional-formatting property. Null = use the gradient. */
    dayColor: string | null;
  };
  /** Leyenda de la escala de color (1.2.0.0). */
  legend: {
    show: boolean;
    position: "top" | "bottom";
    showValues: boolean;
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
    maxEventsVisible: number;
    useGlobalColor: boolean;   // false = per-category colors; true = single global color
    eventBgColor: string | null;
    eventFontColor: string;
    eventFontSize: number;
  };
}

export const defaultSettings: CalendarSettings = {
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
    colorMin: "#EDE9DE",
    colorMax: "#C96442",
    colorNull: "#F5F3ED",
    dayColor: null,
  },
  legend: {
    show: true,
    position: "top",
    showValues: true,
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
  if (!dataView?.metadata?.objects) return defaultSettings;
  const obj = dataView.metadata.objects;

  return {
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
      colorMin: (obj["heatmap"]?.["colorMin"] as any)?.solid?.color ?? defaultSettings.heatmap.colorMin,
      colorMax: (obj["heatmap"]?.["colorMax"] as any)?.solid?.color ?? defaultSettings.heatmap.colorMax,
      colorNull: (obj["heatmap"]?.["colorNull"] as any)?.solid?.color ?? defaultSettings.heatmap.colorNull,
      dayColor: (obj["heatmap"]?.["dayColor"] as any)?.solid?.color ?? null,
    },
    legend: {
      show: (obj["legend"]?.["show"] as boolean) ?? defaultSettings.legend.show,
      position: (obj["legend"]?.["position"] as "top" | "bottom") ?? defaultSettings.legend.position,
      showValues: (obj["legend"]?.["showValues"] as boolean) ?? defaultSettings.legend.showValues,
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
      maxEventsVisible: (obj["events"]?.["maxEventsVisible"] as number) ?? defaultSettings.events.maxEventsVisible,
      useGlobalColor: (obj["events"]?.["useGlobalColor"] as boolean) ?? defaultSettings.events.useGlobalColor,
      eventBgColor: (obj["events"]?.["eventBgColor"] as any)?.solid?.color ?? null,
      eventFontColor: (obj["events"]?.["eventFontColor"] as any)?.solid?.color ?? defaultSettings.events.eventFontColor,
      eventFontSize: (obj["events"]?.["eventFontSize"] as number) ?? defaultSettings.events.eventFontSize,
    },
  };
}
