/**
 * Esquema del panel de formato, generado desde capabilities.json (panel_gen.py): tarjeta ->
 * propiedades con su tipo de control y su clave de traducción. getFormattingModel() lo recorre.
 * No editar a mano; regenerar si cambian los objetos de capabilities.
 */
export type PanelKind = "color" | "toggle" | "num" | "drop" | "font" | "text";
export interface PanelProp { p: string; kind: PanelKind; key: string; en: string; }
export interface PanelCard { o: string; key: string; en: string; props: PanelProp[]; }
export const PANEL: PanelCard[] = [
    {
        "o": "style",
        "key": "Visual_Style",
        "en": "Style template",
        "props": [
            {
                "p": "template",
                "kind": "drop",
                "key": "Visual_Style_Template",
                "en": "Template"
            }
        ]
    },
    {
        "o": "calendar",
        "key": "Visual_Calendar",
        "en": "Calendar",
        "props": [
            {
                "p": "view",
                "kind": "drop",
                "key": "Visual_Calendar_View",
                "en": "Default View"
            },
            {
                "p": "monthsToShow",
                "kind": "drop",
                "key": "Visual_Calendar_MonthsToShow",
                "en": "Months to Display [Pro]"
            },
            {
                "p": "fiscalEnabled",
                "kind": "toggle",
                "key": "Visual_Calendar_FiscalEnabled",
                "en": "Fiscal Calendar"
            },
            {
                "p": "fiscalStartMonth",
                "kind": "num",
                "key": "Visual_Calendar_FiscalStartMonth",
                "en": "Fiscal Year Start Month"
            },
            {
                "p": "fiscalType",
                "kind": "drop",
                "key": "Visual_Calendar_FiscalType",
                "en": "Fiscal Periods"
            },
            {
                "p": "weekStart",
                "kind": "drop",
                "key": "Visual_Calendar_WeekStart",
                "en": "Week Starts On"
            },
            {
                "p": "weekNumbers",
                "kind": "drop",
                "key": "Visual_Calendar_WeekNumbers",
                "en": "Week Numbers"
            }
        ]
    },
    {
        "o": "heatmap",
        "key": "Visual_Heatmap",
        "en": "Heatmap Colors",
        "props": [
            {
                "p": "scheme",
                "kind": "drop",
                "key": "Visual_Heatmap_Scheme",
                "en": "Color scheme"
            },
            {
                "p": "colorMin",
                "kind": "color",
                "key": "Visual_Heatmap_ColorMin",
                "en": "Min Color"
            },
            {
                "p": "colorMax",
                "kind": "color",
                "key": "Visual_Heatmap_ColorMax",
                "en": "Max Color"
            },
            {
                "p": "colorNull",
                "kind": "color",
                "key": "Visual_Heatmap_ColorNull",
                "en": "No Data Color"
            },
            {
                "p": "dayColor",
                "kind": "color",
                "key": "Visual_Heatmap_DayColor",
                "en": "Day Color"
            }
        ]
    },
    {
        "o": "rules",
        "key": "Visual_Rules",
        "en": "Color Rules",
        "props": [
            {
                "p": "rule1On",
                "kind": "toggle",
                "key": "Visual_Rules_Rule1",
                "en": "Rule 1"
            },
            {
                "p": "rule1Op",
                "kind": "drop",
                "key": "Visual_Rules_Op",
                "en": "Condition"
            },
            {
                "p": "rule1Value",
                "kind": "num",
                "key": "Visual_Rules_Value",
                "en": "Value"
            },
            {
                "p": "rule1Color",
                "kind": "color",
                "key": "Visual_Rules_Color",
                "en": "Color"
            },
            {
                "p": "rule2On",
                "kind": "toggle",
                "key": "Visual_Rules_Rule2",
                "en": "Rule 2"
            },
            {
                "p": "rule2Op",
                "kind": "drop",
                "key": "Visual_Rules_Op",
                "en": "Condition"
            },
            {
                "p": "rule2Value",
                "kind": "num",
                "key": "Visual_Rules_Value",
                "en": "Value"
            },
            {
                "p": "rule2Color",
                "kind": "color",
                "key": "Visual_Rules_Color",
                "en": "Color"
            },
            {
                "p": "rule3On",
                "kind": "toggle",
                "key": "Visual_Rules_Rule3",
                "en": "Rule 3"
            },
            {
                "p": "rule3Op",
                "kind": "drop",
                "key": "Visual_Rules_Op",
                "en": "Condition"
            },
            {
                "p": "rule3Value",
                "kind": "num",
                "key": "Visual_Rules_Value",
                "en": "Value"
            },
            {
                "p": "rule3Color",
                "kind": "color",
                "key": "Visual_Rules_Color",
                "en": "Color"
            }
        ]
    },
    {
        "o": "legend",
        "key": "Visual_Legend",
        "en": "Color Legend",
        "props": [
            {
                "p": "show",
                "kind": "toggle",
                "key": "Visual_Legend_Show",
                "en": "Show"
            },
            {
                "p": "position",
                "kind": "drop",
                "key": "Visual_Legend_Position",
                "en": "Position"
            },
            {
                "p": "showValues",
                "kind": "toggle",
                "key": "Visual_Legend_ShowValues",
                "en": "Show min and max"
            }
        ]
    },
    {
        "o": "layout",
        "key": "Visual_Layout",
        "en": "Layout",
        "props": [
            {
                "p": "cellRadius",
                "kind": "num",
                "key": "Visual_Layout_CellRadius",
                "en": "Day corner radius (px)"
            },
            {
                "p": "cellGap",
                "kind": "num",
                "key": "Visual_Layout_CellGap",
                "en": "Space between days (px)"
            }
        ]
    },
    {
        "o": "dayNumber",
        "key": "Visual_DayNumber",
        "en": "Day Number",
        "props": [
            {
                "p": "fontSize",
                "kind": "num",
                "key": "Visual_DayNumber_FontSize",
                "en": "Font Size"
            },
            {
                "p": "fontFamily",
                "kind": "font",
                "key": "Visual_DayNumber_FontFamily",
                "en": "Font Family"
            },
            {
                "p": "color",
                "kind": "color",
                "key": "Visual_DayNumber_Color",
                "en": "Color"
            },
            {
                "p": "weekendColor",
                "kind": "color",
                "key": "Visual_DayNumber_WeekendColor",
                "en": "Weekend Color"
            },
            {
                "p": "holidayColor",
                "kind": "color",
                "key": "Visual_DayNumber_HolidayColor",
                "en": "Holiday Color"
            }
        ]
    },
    {
        "o": "labels",
        "key": "Visual_Labels",
        "en": "Measure Labels [Pro]",
        "props": [
            {
                "p": "fontSize",
                "kind": "num",
                "key": "Visual_Labels_FontSize",
                "en": "Font Size"
            },
            {
                "p": "fontFamily",
                "kind": "font",
                "key": "Visual_Labels_FontFamily",
                "en": "Font Family"
            },
            {
                "p": "color",
                "kind": "color",
                "key": "Visual_Labels_Color",
                "en": "Color"
            }
        ]
    },
    {
        "o": "navigation",
        "key": "Visual_Navigation",
        "en": "View Buttons [Pro]",
        "props": [
            {
                "p": "activeColor",
                "kind": "color",
                "key": "Visual_Navigation_ActiveColor",
                "en": "Active Button Color"
            },
            {
                "p": "textColor",
                "kind": "color",
                "key": "Visual_Navigation_TextColor",
                "en": "Button Text Color"
            }
        ]
    },
    {
        "o": "events",
        "key": "Visual_Events",
        "en": "Events",
        "props": [
            {
                "p": "showEvents",
                "kind": "toggle",
                "key": "Visual_Events_ShowEvents",
                "en": "Show Events"
            },
            {
                "p": "display",
                "kind": "drop",
                "key": "Visual_Events_Display",
                "en": "Show events as"
            },
            {
                "p": "maxEventsVisible",
                "kind": "num",
                "key": "Visual_Events_MaxEventsVisible",
                "en": "Max Events per Day (month view) [Pro]"
            },
            {
                "p": "useGlobalColor",
                "kind": "toggle",
                "key": "Visual_Events_UseGlobalColor",
                "en": "Single color for all events [Pro]"
            },
            {
                "p": "eventBgColor",
                "kind": "color",
                "key": "Visual_Events_EventBgColor",
                "en": "Event Color [Pro]"
            },
            {
                "p": "eventFontColor",
                "kind": "color",
                "key": "Visual_Events_EventFontColor",
                "en": "Event Text Color [Pro]"
            },
            {
                "p": "eventFontSize",
                "kind": "num",
                "key": "Visual_Events_EventFontSize",
                "en": "Event Font Size [Pro]"
            }
        ]
    },
    {
        "o": "eventCategoryColors",
        "key": "Visual_EventCategoryColors",
        "en": "Event Category Colors [Pro]",
        "props": [
            {
                "p": "c0",
                "kind": "color",
                "key": "Visual_EventCategoryColors_C0",
                "en": "Category 1"
            },
            {
                "p": "c1",
                "kind": "color",
                "key": "Visual_EventCategoryColors_C1",
                "en": "Category 2"
            },
            {
                "p": "c2",
                "kind": "color",
                "key": "Visual_EventCategoryColors_C2",
                "en": "Category 3"
            },
            {
                "p": "c3",
                "kind": "color",
                "key": "Visual_EventCategoryColors_C3",
                "en": "Category 4"
            },
            {
                "p": "c4",
                "kind": "color",
                "key": "Visual_EventCategoryColors_C4",
                "en": "Category 5"
            },
            {
                "p": "c5",
                "kind": "color",
                "key": "Visual_EventCategoryColors_C5",
                "en": "Category 6"
            },
            {
                "p": "c6",
                "kind": "color",
                "key": "Visual_EventCategoryColors_C6",
                "en": "Category 7"
            },
            {
                "p": "c7",
                "kind": "color",
                "key": "Visual_EventCategoryColors_C7",
                "en": "Category 8"
            }
        ]
    }
];
