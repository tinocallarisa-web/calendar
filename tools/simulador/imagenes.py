# -*- coding: utf-8 -*-
"""
Imágenes de la oferta (1366×768) de Calendar Events Heatmap 1.3 con el visual REAL, sin Power BI Desktop: el bundle de
.tmp/drop (o el que diga DROP=<carpeta con pbiviz.json, visual.js y visual.css>) pintado en Chromium con el host simulado de
harness.py, licencia Pro simulada en el host (sin marca de agua) y la guía de configuración apagada (style.guide false).
Receta de tile-grid-map-pro/tools/simulador/imagenes.py (22-11-2026).

Datos: Begudes Nord (empresa ficticia, datos/demo_rtm): venta neta diaria de fact_sales (solo laborables: es un
distribuidor), promociones de dim_promotion extendidas a una fila por día, lanzamientos y cambios de tarifa de
dim_events, festivos de Cataluña en el pozo Holiday Name. Plantilla TCViz: fondo #FAF9F5, tarjetas blancas radio 10,
Poppins, paleta del tema TCViz.

Escribe en assets/: Screenshot1.png (mes con totales), Screenshot2.png (año, Boardroom), Screenshot3.png (semana con
etiquetas, Aurora), infographic.png (docs/infographic.html) e infographic-styles.png (docs/infographic-styles.html, que
lleva dentro las capturas de los estilos que pinta este script en .tmp/estilos/).

    python tools/simulador/imagenes.py
"""
import asyncio, base64, csv, io, json, os, re, sys
from collections import defaultdict
from datetime import date, timedelta
from playwright.async_api import async_playwright

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DROP = os.environ.get("DROP", H.DROP)
CSV = r"C:\tcviz\datos\demo_rtm\csv_en"
POPPINS = r"C:\tcviz\datos\demo_rtm\tema\Poppins"
LOGO = r"C:\tcviz\web\logos\tcviz-logo-light.svg"
ASSETS = os.path.join(ROOT, "assets")
DOCS = os.path.join(ROOT, "docs")
TMP = os.path.join(ROOT, ".tmp", "estilos")

# Paleta del tema TCViz (datos/demo_rtm/tema/TCViz.json): lo que Power BI daría al visual con ese tema.
PALETA = """colorPalette: { isHighContrast: false, foreground:{value:'#3D3929'}, background:{value:'#FFFFFF'},
    foregroundNeutralSecondary:{value:'#6B6A63'}, negative:{value:'#C0392B'}, positive:{value:'#3E9C5B'},
    foregroundSelected:{value:'#1AEBFF'}, getColor(){ return {value:'#2B6CB0'}; } },"""

# Festivos de Cataluña (calendario laboral 2025-2026): los de dim_events y los propios de Cataluña.
FESTIVOS = {}
LOCALES = {date(2025, 4, 23): ("Sant Jordi", "Local event"), date(2026, 4, 23): ("Sant Jordi", "Local event"),
           date(2025, 9, 24): ("La Mercè (Barcelona)", "Local event"), date(2026, 9, 24): ("La Mercè (Barcelona)", "Local event")}


def leer():
    """Venta neta por día, eventos por día [(nombre, categoría)] y festivos {día: nombre}."""
    venta = defaultdict(float)
    for r in csv.DictReader(io.open(os.path.join(CSV, "fact_sales.csv"), encoding="utf-8-sig")):
        venta[date.fromisoformat(r["date"])] += float(r["net_sales"])
    eventos = defaultdict(list)
    for r in csv.DictReader(io.open(os.path.join(CSV, "dim_promotion.csv"), encoding="utf-8-sig")):
        d, fin = date.fromisoformat(r["start_date"]), date.fromisoformat(r["end_date"])
        nombre = f"{r['family']} promo −{float(r['promo_discount_pct']):.0%}"
        while d <= fin:   # una fila por día: un rango sin expandir solo marca el primero
            eventos[d].append((nombre, "Promotion")); d += timedelta(days=1)
    festivos = {}
    for r in csv.DictReader(io.open(os.path.join(CSV, "dim_events.csv"), encoding="utf-8-sig")):
        d, tipo = date.fromisoformat(r["date"]), r["event_type"]
        if tipo == "Holiday":
            festivos[d] = r["event"]
        elif tipo in ("Launch", "Price list", "Weather"):
            eventos[d].append((r["event"].replace("Price increase", "Price rise"), {"Launch": "Launch", "Weather": "Weather"}.get(tipo, "Pricing")))
    for d, e in LOCALES.items():
        eventos[d].append(e)
    return dict(venta), eventos, festivos


def dataview(venta, eventos, festivos, desde, hasta, objects=None):
    """Matriz como la manda Power BI: filas = fecha → evento → categoría → festivo; valores = venta neta.
    El día lleva su venta en cada hoja (eventos en la tabla de fechas): el modo automático no la suma dos veces."""
    objects = json.loads(json.dumps(objects or {}))
    objects.setdefault("style", {}).setdefault("guide", False)
    cols = [{"displayName": "Date", "queryName": "dim_date.date", "roles": {"date": True}, "type": {"dateTime": True}},
            {"displayName": "Event", "queryName": "dim_events.event", "roles": {"eventName": True}, "type": {"text": True}},
            {"displayName": "Category", "queryName": "dim_events.event_type", "roles": {"eventCategory": True}, "type": {"text": True}},
            {"displayName": "Holiday", "queryName": "dim_date.holiday", "roles": {"holidayName": True}, "type": {"text": True}},
            {"displayName": "Net sales", "queryName": "Sum(fact_sales.net_sales)", "roles": {"mainMeasure": True},
             "type": {"numeric": True}, "isMeasure": True, "format": "€#,0"}]
    raiz = {"children": []}
    d = desde
    while d <= hasta:
        v = round(venta[d], 2) if d in venta else None
        evs = eventos.get(d) or [(None, None)]
        fest = festivos.get(d)
        if v is not None or evs[0][0] or fest:   # Power BI quita las fechas sin venta, evento ni festivo
            f = d.isoformat() + "T00:00:00"
            raiz["children"].append({"value": f, "level": 0, "identity": {"d": f}, "children": [
                {"value": n, "level": 1, "identity": {"e": n}, "children": [
                    {"value": c, "level": 2, "identity": {"c": c}, "children": [
                        {"value": fest, "level": 3, "identity": {"h": fest}, "values": {"0": {"value": v}}}]}]} for n, c in evs]})
        d += timedelta(days=1)
    return {"metadata": {"objects": objects, "columns": cols},
            "matrix": {"rows": {"levels": [{"sources": [c]} for c in cols[:4]], "root": raiz},
                       "columns": {"levels": [], "root": {}}, "valueSources": [cols[4]]}}


def uri(path, mime):
    return f"data:{mime};base64," + base64.b64encode(open(path, "rb").read()).decode()


def fuentes():
    return "".join(f"@font-face{{font-family:'Poppins';font-weight:{w};src:url('{uri(os.path.join(POPPINS, f), 'font/ttf')}')}}"
                   for w, f in ((400, "Poppins-Regular.ttf"), (500, "Poppins-Medium.ttf"), (600, "Poppins-SemiBold.ttf")))


def plantilla(pregunta, subtitulo, cuerpo, lateral, ancho_lat=300):
    return f"""<html><head><style>{fuentes()}
body{{margin:0;background:#FAF9F5;font-family:'Segoe UI',sans-serif;color:#3D3929}}
#lienzo{{width:1366px;height:768px;box-sizing:border-box;padding:22px 30px;display:flex;flex-direction:column;gap:16px}}
.cab{{display:flex;align-items:center;gap:20px}} .cab img{{height:40px}} .sep{{width:1px;height:40px;background:#DAD9D4}}
.cab h1{{font-family:Poppins;font-weight:600;font-size:25px;margin:0;line-height:1.15}}
.cab p{{margin:2px 0 0;font-size:13px;color:#6B6A63}}
.fila{{display:flex;gap:16px;flex:1;min-height:0}}
.tarjeta{{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(61,57,41,.10);padding:14px;box-sizing:border-box}}
.lat{{width:{ancho_lat}px;display:flex;flex-direction:column;gap:14px}}
.lat h3{{font-family:Poppins;font-weight:600;font-size:14px;margin:0 0 6px;color:#2B6CB0}}
.lat p{{margin:0;font-size:13.5px;line-height:1.5;color:#535146}} .lat b{{color:#3D3929}}
.pro{{font-family:Poppins;font-size:10px;font-weight:600;color:#fff;background:#2B6CB0;border-radius:4px;padding:1px 5px;margin-left:6px;vertical-align:2px}}
.kpi .n{{font-family:Poppins;font-weight:600;font-size:30px;line-height:1.1}} .kpi .t{{font-size:12.5px;color:#6B6A63}}
.host{{position:relative;overflow:hidden}}
</style></head><body><div id="lienzo">
<div class="cab"><img src="{uri(LOGO, 'image/svg+xml')}"><div class="sep"></div><div><h1>{pregunta}</h1><p>{subtitulo}</p></div></div>
<div class="fila">{cuerpo}<div class="lat">{lateral}</div></div></div></body></html>"""


FALLOS = []


async def montar(b, html, hosts, W=1366, Hh=768, escala=1):
    """hosts: [(id, dataview, w, h)] → un visual en cada uno, con licencia Pro simulada."""
    guid = json.load(io.open(os.path.join(DROP, "pbiviz.json"), encoding="utf-8"))["visual"]["guid"]
    pg = await b.new_page(viewport={"width": W, "height": Hh}, device_scale_factor=escala)
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.set_content(html)
    await pg.add_style_tag(path=os.path.join(DROP, "visual.css"))
    await pg.add_script_tag(content="window.__pro = true; window.__hc = false; window.__locale = 'en-US';")
    stub = H.STUB.replace("'PLAN'", repr(H.PLAN))
    stub = stub[:stub.index("  colorPalette:")] + "  " + PALETA + "\n" + stub[stub.index("  licenseManager:"):]
    await pg.add_script_tag(content=stub)
    await pg.add_script_tag(path=os.path.join(DROP, "visual.js"))
    for hid, dv, w, h in hosts:
        await pg.evaluate("""([g, id, dv, w, h]) => { const v = powerbi.visuals.plugins[g].create({ element: document.getElementById(id), host: __host });
            window['v_' + id] = v; const o = () => ({ dataViews: [JSON.parse(JSON.stringify(dv))], viewport: {width: w, height: h}, type: 2, operationKind: 0, viewMode: 0, editMode: 0, jsonFilters: [] });
            v.update(o()); window['u_' + id] = () => v.update(o()); }""", [guid, hid, dv, w, h])
    await pg.wait_for_timeout(300)
    for hid, *_ in hosts:   # segunda pasada: la licencia ya está resuelta
        await pg.evaluate(f"() => window['u_{hid}']()")
    await pg.wait_for_timeout(400)
    for hid, *_ in hosts:
        wm = await pg.evaluate(f"() => {{ const w = document.querySelector('#{hid} .tcviz-wm'); return w && w.style.display !== 'none' && getComputedStyle(w).display !== 'none' ? w.textContent : ''; }}")
        if wm:
            FALLOS.append(f"{hid}: marca de agua visible con Pro ({wm})")
    if errs:
        FALLOS.append("errores de consola: " + " | ".join(errs[:3]))
    pg._errs = errs
    return pg


def eur(v):
    """Como el visual: €452K, €1.73M."""
    return f"€{v / 1e6:.2f}M".replace(".00M", "M") if v >= 1e6 else f"€{v / 1e3:,.0f}K"


async def main():
    if not os.path.exists(os.path.join(DROP, "visual.js")):
        print("Falta el bundle:", DROP); sys.exit(2)
    venta, eventos, festivos = leer()
    os.makedirs(ASSETS, exist_ok=True); os.makedirs(TMP, exist_ok=True)
    sub = "Calendar Events Heatmap 1.3 · Begudes Nord · fictitious beverage distributor, Catalonia · net sales per day"
    W, Hh = 1000, 610

    # Cifras de los textos, calculadas de los datos.
    abr = {d: v for d, v in venta.items() if d.year == 2026 and d.month == 4}
    mar = sum(v for d, v in venta.items() if d.year == 2026 and d.month == 3)
    semanas = defaultdict(float)
    for d, v in abr.items():
        semanas[d - timedelta(days=d.weekday())] += v
    lun_mejor = max(semanas, key=semanas.get)
    pascua = date(2026, 3, 30)
    ano = defaultdict(float)
    for d, v in venta.items():
        if d.year == 2025:
            ano[d.month] += v
    mes_top = max(ano, key=ano.get); mes_low = min(ano, key=ano.get)

    async with async_playwright() as p:
        b = await p.chromium.launch()

        # 1 · Mes: heatmap, eventos con su categoría, festivos, Σ por semana y total del mes.
        cuerpo = f'<div class="tarjeta host" id="c1" style="width:{W}px;height:{Hh}px;padding:0"></div>'
        lat = (f'<div class="tarjeta kpi"><div class="n">{eur(sum(abr.values()))}</div><div class="t">Net sales, April 2026 '
               f'({sum(abr.values()) / mar - 1:+.0%} vs March)</div></div>'
               f'<div class="tarjeta kpi"><div class="n">{eur(semanas[pascua])}</div><div class="t">Easter week: Good Friday and '
               f'Easter Monday are holidays — {1 - semanas[pascua] / semanas[lun_mejor]:.0%} below the best week</div></div>'
               '<div class="tarjeta"><h3>Totals<span class="pro">PRO</span></h3><p>A <b>Σ column</b> closes every week and the '
               '<b>month total</b> sits under the grid — sum or daily average, in the measure\'s own format.</p>'
               '<p style="margin-top:8px">Promotions and Sant Jordi are colour marks on their day, with a legend; '
               'holidays get a badge and their name in the tooltip.</p></div>')
        pg = await montar(b, plantilla("Why was Easter week so quiet?", sub, cuerpo, lat),
                          [("c1", dataview(venta, eventos, festivos, date(2026, 4, 1), date(2026, 4, 30),
                                           {"totals": {"show": True}, "style": {"template": "tcviz"}}), W, Hh)])
        await ir_a(pg, "c1", 2026, 4)
        await pg.screenshot(path=os.path.join(ASSETS, "Screenshot1.png"))
        await revisar(pg, "c1", "Screenshot1")
        await pg.close()

        # 2 · Año (Pro) con el total bajo cada mes, estilo Boardroom. A todo el ancho: el visual pone floor((ancho − 16) / 170)
        # columnas (máximo 6) y el alto de cada mes sale del ancho, así que con 6 columnas caben las dos filas sin desplazar.
        W2, H2 = 1306, 540
        cuerpo = f'<div class="tarjeta host" id="c2" style="width:{W2}px;height:{H2}px;padding:0;flex:none"></div>'
        lat = (f'<div class="tarjeta kpi" style="flex:1"><div class="n">{eur(sum(ano.values()))}</div>'
               f'<div class="t">Net sales 2025 — twelve months, one view</div></div>'
               f'<div class="tarjeta kpi" style="flex:1"><div class="n">{date(2025, mes_top, 1):%B} {eur(ano[mes_top])}</div><div class="t">'
               f'Heatwave and summer promotions: {ano[mes_top] / ano[mes_low]:.1f}× {date(2025, mes_low, 1):%B}</div></div>'
               '<div class="tarjeta" style="flex:1.6"><h3>Year view<span class="pro">PRO</span> · style Boardroom<span class="pro">PRO</span></h3>'
               '<p>A <b>total under each month</b>; click a month title to open it. <b>Promotion</b> is switched off in the legend, '
               'so launches, price rises, the heatwave and holidays stand out.</p></div>')
        html = plantilla("Which months carry the year?", sub, cuerpo, lat).replace(
            ".fila{display:flex;gap:16px;", ".fila{display:flex;flex-direction:column;gap:14px;").replace(
            ".lat{width:300px;display:flex;flex-direction:column;", ".lat{display:flex;flex-direction:row;flex:1;")
        pg = await montar(b, html,
                          [("c2", dataview(venta, eventos, festivos, date(2025, 1, 1), date(2025, 12, 31),
                                           {"totals": {"show": True}, "calendar": {"view": "year"}, "style": {"template": "boardroom"},
                                            "state": {"hiddenCategories": json.dumps(["Promotion"])}}), W2, H2)])
        await ir_a(pg, "c2", 2025, 1)
        await pg.screenshot(path=os.path.join(ASSETS, "Screenshot2.png"))
        await revisar(pg, "c2", "Screenshot2")
        await pg.close()

        # 3 · Semana (Pro) con etiquetas de evento y total de la semana, estilo Aurora.
        cuerpo = f'<div class="tarjeta host" id="c3" style="width:{W}px;height:{Hh}px;padding:0"></div>'
        s3 = date(2026, 4, 20)
        tot3 = sum(venta.get(s3 + timedelta(days=i), 0) for i in range(7))
        lat = (f'<div class="tarjeta kpi"><div class="n">{eur(tot3)}</div><div class="t">Week total, 20–26 April 2026</div></div>'
               '<div class="tarjeta"><h3>Week view<span class="pro">PRO</span></h3><p>Each day as a column, with the <b>names of its '
               'events</b>: the Sports &amp; energy promotion runs all week and Sant Jordi falls on Thursday.</p>'
               '<p style="margin-top:8px">Hover a day for its report page tooltip, filtered to that whole day.</p></div>'
               '<div class="tarjeta"><h3>Style: Aurora<span class="pro">PRO</span></h3><p>Background, text, empty days, lines and '
               'type in one click. A colour you set yourself always wins.</p></div>')
        pg = await montar(b, plantilla("What happened in the week of Sant Jordi?", sub, cuerpo, lat),
                          [("c3", dataview(venta, eventos, festivos, date(2026, 3, 1), date(2026, 5, 31),
                                           {"totals": {"show": True}, "calendar": {"view": "week"}, "style": {"template": "aurora"},
                                            "events": {"maxEventsVisible": 3}}), W, Hh)])
        await ir_a(pg, "c3", 2026, 4, 20)
        await pg.screenshot(path=os.path.join(ASSETS, "Screenshot3.png"))
        await revisar(pg, "c3", "Screenshot3")
        await pg.close()

        # 4 · Estilos para la infografía: el mismo abril en Report theme, las 5 plantillas y los 6 estilos Pro. Sin totales (son
        # Pro y quitarían ancho); a doble resolución, porque la infografía los muestra a unos 200 px de ancho.
        ew, eh = 300, 300
        estilos = ["report", "classic", "clean", "tiles", "minimal", "tcviz", "boardroom", "ledger", "editorial", "signal", "aurora", "terrace"]
        celdas = "".join(f'<div class="host" id="e_{t}" style="width:{ew}px;height:{eh}px;background:#fff"></div>' for t in estilos)
        html = f"<html><body style='margin:0;background:#fff'><div style='display:grid;grid-template-columns:repeat(4,{ew}px);gap:10px'>{celdas}</div></body></html>"
        pg = await montar(b, html, [(f"e_{t}", dataview(venta, eventos, festivos, date(2026, 4, 1), date(2026, 4, 30),
                                                         {"style": {"template": t}}), ew, eh) for t in estilos], escala=2)
        for t in estilos:
            await (await pg.query_selector(f"#e_{t}")).screenshot(path=os.path.join(TMP, f"{t}.png"))
        await pg.close()

        if os.environ.get("SOLO") == "capturas":
            await b.close(); return
        # 5 · Infografías: docs/*.html → assets/*.png. La de estilos lleva las capturas de arriba incrustadas.
        incrustar_estilos(estilos)
        for nombre in ("infographic", "infographic-styles"):
            pg = await b.new_page(viewport={"width": 1366, "height": 768}, device_scale_factor=1)
            await pg.goto("file:///" + os.path.join(DOCS, nombre + ".html").replace("\\", "/"))
            await pg.wait_for_load_state("networkidle")
            await pg.evaluate("() => document.fonts.ready")
            await pg.add_style_tag(content="#dl-bar,#fit-check{display:none!important}")
            await pg.wait_for_timeout(400)
            await (await pg.query_selector("#infographic")).screenshot(path=os.path.join(ASSETS, nombre + ".png"))
            await pg.close()
        await b.close()
    print("assets/Screenshot1-3.png, infographic.png, infographic-styles.png")
    for f in FALLOS:
        print("  FALLO", f)


async def ir_a(pg, hid, y, m, d=1):
    """Lleva el visual al periodo (abre en el primer mes con datos): fija su fecha actual y repinta, como las flechas."""
    await pg.evaluate(f"([y, m, d]) => {{ window['v_{hid}'].currentDate = new Date(y, m - 1, d); window['u_{hid}'](); }}", [y, m, d])
    await pg.wait_for_timeout(300)


async def revisar(pg, hid, nombre):
    r = await pg.evaluate(f"""() => {{ const h = document.getElementById('{hid}');
        const corto = Array.from(h.querySelectorAll('*')).filter(e => e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map(e => e.textContent.trim()).slice(0, 8);
        return {{ semanas: Array.from(h.querySelectorAll('[data-total="week"]')).map(e => e.textContent),
                 meses: Array.from(h.querySelectorAll('[data-total="month"]')).map(e => e.textContent), cortados: corto }}; }}""")
    print(nombre, json.dumps(r, ensure_ascii=False))


def incrustar_estilos(estilos):
    """Sustituye en docs/infographic-styles.html cada <img data-estilo="x"> por la captura de .tmp/estilos/x.png."""
    p = os.path.join(DOCS, "infographic-styles.html")
    s = io.open(p, encoding="utf-8").read()
    for t in estilos:
        s = re.sub(rf'(<img data-estilo="{t}" src=")[^"]*(")', lambda m: m.group(1) + uri(os.path.join(TMP, t + ".png"), "image/png") + m.group(2), s)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)


if __name__ == "__main__":
    asyncio.run(main())
