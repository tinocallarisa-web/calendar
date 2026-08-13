// SP_IDENTIFIER must match Plan ID in Partner Center exactly
export const SP_IDENTIFIER = "calendar-tcviz";

export const TRIAL_DAYS = 30;

export interface CalendarSettings {
  calendar: {
    view: "month" | "week";
    monthsToShow: number;
    fiscalEnabled: boolean;
    fiscalStartMonth: number;
    weekStart: 0 | 1;
  };
  heatmap: {
    colorMin: string;
    colorMax: string;
    colorNull: string;
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
    weekStart: 1,
  },
  heatmap: {
    colorMin: "#EDE9DE",
    colorMax: "#C96442",
    colorNull: "#F5F3ED",
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

export function parseSettings(dataView: powerbi.DataView): CalendarSettings {
  if (!dataView?.metadata?.objects) return defaultSettings;
  const obj = dataView.metadata.objects;

  return {
    calendar: {
      view: (obj["calendar"]?.["view"] as "month" | "week") ?? defaultSettings.calendar.view,
      monthsToShow: parseInt(String(obj["calendar"]?.["monthsToShow"] ?? defaultSettings.calendar.monthsToShow), 10) || defaultSettings.calendar.monthsToShow,
      fiscalEnabled: (obj["calendar"]?.["fiscalEnabled"] as boolean) ?? defaultSettings.calendar.fiscalEnabled,
      fiscalStartMonth: (obj["calendar"]?.["fiscalStartMonth"] as number) ?? defaultSettings.calendar.fiscalStartMonth,
      weekStart: (parseInt(String(obj["calendar"]?.["weekStart"] ?? defaultSettings.calendar.weekStart), 10) || 0) as 0 | 1,
    },
    heatmap: {
      colorMin: (obj["heatmap"]?.["colorMin"] as any)?.solid?.color ?? defaultSettings.heatmap.colorMin,
      colorMax: (obj["heatmap"]?.["colorMax"] as any)?.solid?.color ?? defaultSettings.heatmap.colorMax,
      colorNull: (obj["heatmap"]?.["colorNull"] as any)?.solid?.color ?? defaultSettings.heatmap.colorNull,
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
