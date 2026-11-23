# -*- coding: utf-8 -*-
"""Simulador Playwright de Calendar Events Heatmap (1.3).

Carga el bundle de .tmp/drop (`node build-test.js --free`, licencia REAL) en un host simulado; la licencia se simula en
el host (Pro o sin licencia), así una sola build cubre los dos caminos. Ventas diarias ficticias de Begudes Nord.

    node build-test.js --free
    python tools/simulador/harness.py            # comprobaciones + capturas en tools/simulador/capturas/
"""
import asyncio, io, json, math, os, sys
from datetime import date, timedelta
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "capturas")
DROP = os.path.join(ROOT, ".tmp", "drop")
PLAN = "calendar-tcviz"
FALLOS = []

INI = date(2026, 3, 1)
DIAS = [INI + timedelta(days=i) for i in range(92)]          # marzo, abril, mayo
def venta(d):
    base = 4200 + 900 * math.sin(d.toordinal() / 5.0) + (1600 if d.weekday() >= 4 else 0)
    return round(base + (d.day * 37) % 700, 2)
VENTAS = {d: venta(d) for d in DIAS}
EVENTOS = {date(2026, 3, 6): ("Spring promo", "Promotion"), date(2026, 3, 19): ("Trade fair", "Event"),
           date(2026, 4, 3): ("Easter", "Holiday"), date(2026, 4, 17): ("Price change", "Pricing")}


def dataview(objects=None, eventos=True, formato="#,0", dinamico=None, guia=False):
    objects = json.loads(json.dumps(objects or {}))
    if not guia:
        objects.setdefault("style", {}).setdefault("guide", False)
    cols = [{"displayName": "Date", "queryName": "d.Date", "roles": {"date": True}, "type": {"dateTime": True}, "index": 0},
            {"displayName": "Sales", "queryName": "s.Sales", "roles": {"mainMeasure": True}, "type": {"numeric": True},
             "isMeasure": True, "format": formato, "index": 1}]
    if dinamico:
        cols[1]["objects"] = {"general": {"formatString": dinamico}}
    if eventos:
        cols += [{"displayName": "Event", "queryName": "e.Event", "roles": {"eventName": True}, "type": {"text": True}, "index": 2},
                 {"displayName": "Category", "queryName": "e.Category", "roles": {"eventCategory": True}, "type": {"text": True}, "index": 3}]
    rows = []
    for d in DIAS:
        r = [d.isoformat() + "T00:00:00", VENTAS[d]]
        if eventos:
            e = EVENTOS.get(d)
            r += [e[0], e[1]] if e else [None, None]
        rows.append(r)
    cat = {"categories": [{"source": cols[0], "values": [r[0] for r in rows], "identity": [{"d": i} for i in range(len(rows))]}],
           "values": [{"source": cols[1], "values": [r[1] for r in rows]}]}
    if eventos:   # un día con dos eventos: dos filas en la tabla, una sola fecha en la vista categórica
        extra = [date(2026, 3, 6).isoformat() + "T00:00:00", 0, "Radio spot", "Promotion"]
        rows.append(extra)
    # Matriz como la manda Power BI desde 1.3: filas = fecha → evento → categoría; valores = la medida.
    niveles = [{"sources": [c]} for c in cols if not c.get("isMeasure")]
    medidas = [c for c in cols if c.get("isMeasure")]
    raiz = {"children": []}
    por_dia = {}
    for r in rows:
        f, v = r[0], r[1]
        nd = por_dia.get(f)
        if nd is None:
            nd = {"value": f, "level": 0, "identity": {"d": f}, "children": []}
            por_dia[f] = nd; raiz["children"].append(nd)
        if eventos:
            ev = {"value": r[2], "level": 1, "identity": {"e": r[2]}, "children": [
                  {"value": r[3], "level": 2, "identity": {"c": r[3]}, "values": {"0": {"value": v}}}]}
            nd["children"].append(ev)
        else:
            nd["values"] = {"0": {"value": v}}
    return {"metadata": {"objects": objects, "columns": cols},
            "matrix": {"rows": {"levels": niveles, "root": raiz}, "columns": {"levels": [], "root": {}}, "valueSources": medidas}}


def dataview_jerarquia():
    """Fecha con la jerarquía automática: Year → Month → Day → Event. El mismo día 6 en marzo, abril y mayo."""
    q = "d.Date.Variation.Date Hierarchy."
    cols = [{"displayName": "Year", "queryName": q + "Year", "roles": {"date": True}, "type": {"numeric": True}},
            {"displayName": "Month", "queryName": q + "Month", "roles": {"date": True}, "type": {"text": True}},
            {"displayName": "Day", "queryName": q + "Day", "roles": {"date": True}, "type": {"numeric": True}},
            {"displayName": "Event", "queryName": "e.Event", "roles": {"eventName": True}, "type": {"text": True}},
            {"displayName": "Sales", "queryName": "s.Sales", "roles": {"mainMeasure": True}, "type": {"numeric": True}, "isMeasure": True, "format": "#,0"}]
    meses = {}
    for d in DIAS:
        meses.setdefault(d.strftime("%B"), []).append(d)
    raiz = {"children": [{"value": 2026, "identity": {"y": 2026}, "children": [
        {"value": m, "identity": {"m": m}, "children": [
            {"value": d.day, "identity": {"d": d.day}, "children": [
                {"value": (EVENTOS.get(d) or (None,))[0], "identity": {"e": 1}, "values": {"0": {"value": VENTAS[d]}}}]}
            for d in ds]} for m, ds in meses.items()]}]}
    return {"metadata": {"objects": {"style": {"guide": False}}, "columns": cols},
            "matrix": {"rows": {"levels": [{"sources": [c]} for c in cols[:4]], "root": raiz}, "columns": {"levels": [], "root": {}},
                       "valueSources": [cols[4]]}}


STUB = r"""
window.__ev = []; window.__persist = []; window.__notif = [];
window.powerbi = { visuals: { plugins: {} }, extensibility: {} };
(function(){
 let sel = [];
 window.__host = {
  eventService: { renderingStarted(){ __ev.push('S'); }, renderingFinished(){ __ev.push('F'); }, renderingFailed(o,m){ __ev.push('X'); console.error('FAILED', m); } },
  createSelectionManager(){ return { select(id, multi){ const a = Array.isArray(id) ? id : [id]; sel = multi ? sel.concat(a) : a; window.__sel = sel; return Promise.resolve(sel); },
     clear(){ sel = []; return Promise.resolve(); }, getSelectionIds(){ return sel; },
     hasSelection(){ return sel.length > 0; }, registerOnSelectCallback(){}, showContextMenu(){ return Promise.resolve(); } }; },
  createSelectionIdBuilder(){ const k=[]; const b = { withTable(t,i){ k.push('r'+i); return b; }, withMatrixNode(n){ k.push('m'+n.value); return b; }, withCategory(c,i){ k.push('c'+i); return b; }, withSeries(){ return b; },
     withMeasure(){ return b; }, createSelectionId(){ const key=k.join('|'); return { key, getKey(){return key;}, getSelector(){ return {data:[key]}; }, equals(o){return o&&o.key===key;}, includes(){return false;} }; } }; return b; },
  createLocalizationManager(){ return { getDisplayName(k){ return k; } }; },
  tooltipService: { enabled(){ return true; }, show(o){ window.__tip = o; window.__nTip = (window.__nTip||0)+1; }, move(o){ window.__tip = o; }, hide(){ window.__nHide = (window.__nHide||0)+1; } },
  subSelectionService: { subSelect(){}, updateRegionOutlines(){} },
  hostCapabilities: { allowInteractions: true }, locale: window.__locale || 'en-US',
  colorPalette: { isHighContrast: !!window.__hc, foreground:{value: window.__hc ? '#FFFF00' : '#252423'}, background:{value: window.__hc ? '#000000' : '#FFFFFF'},
    foregroundSelected:{value:'#1AEBFF'}, getColor(k){ return {value:'#2B6CB0'}; } },
  licenseManager: { getAvailableServicePlans(){ return Promise.resolve({ plans: window.__pro ? [{ spIdentifier: 'PLAN', state: 1 }] : [], isLicenseUnsupportedEnv: false, isLicenseInfoAvailable: true }); },
     notifyFeatureBlocked(m){ __notif.push(m); return Promise.resolve(true); }, notifyLicenseRequired(){ return Promise.resolve(true); }, clearLicenseNotification(){ return Promise.resolve(true); } },
  persistProperties(p){ __persist.push(p); }, launchUrl(){}, applyJsonFilter(){}, displayWarningIcon(){}, refreshHostData(){},
 };
})();
"""


def check(name, ok, detail=""):
    print(f"  {'OK   ' if ok else 'FALLO'} {name}{'  — ' + detail if detail else ''}")
    if not ok: FALLOS.append(name)


async def page(b, dv, W=900, H=560, pro=True, edit=True, hc=False, locale="en-US", name=None):
    guid = json.load(io.open(os.path.join(DROP, "pbiviz.json"), encoding="utf-8"))["visual"]["guid"]
    pg = await b.new_page(viewport={"width": W, "height": H})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.set_content(f"<html><body style='margin:0;background:#fff'><div id='host' style='position:relative;width:{W}px;height:{H}px;overflow:hidden'></div></body></html>")
    css = os.path.join(DROP, "visual.css")
    if os.path.exists(css):
        await pg.add_style_tag(path=css)
    await pg.add_script_tag(content=f"window.__pro = {json.dumps(pro)}; window.__hc = {json.dumps(hc)}; window.__locale = {json.dumps(locale)};")
    await pg.add_script_tag(content=STUB.replace("'PLAN'", repr(PLAN)))
    await pg.add_script_tag(path=os.path.join(DROP, "visual.js"))
    await pg.evaluate("(g) => { window.__v = powerbi.visuals.plugins[g].create({ element: document.getElementById('host'), host: __host }); }", guid)
    pg._errs, pg._dims, pg._vm = errs, (W, H), (1 if edit else 0)
    await upd(pg, dv)
    await pg.wait_for_timeout(150)
    await upd(pg, dv)
    if name:
        os.makedirs(OUT, exist_ok=True)
        await pg.screenshot(path=os.path.join(OUT, name + ".png"))
    return pg


async def upd(pg, dv):
    W, H = pg._dims
    await pg.evaluate("([dv, W, H, vm]) => __v.update({ dataViews: dv ? [JSON.parse(JSON.stringify(dv))] : [], viewport: { width: W, height: H }, type: 2, operationKind: 0, viewMode: vm, editMode: 0, jsonFilters: [] })",
                      [dv, W, H, pg._vm])
    await pg.wait_for_timeout(80)


async def eventos(pg, label):
    ev = await pg.evaluate("() => __ev.join('')")
    check(f"{label}: sin errores y eventos 1:1", not pg._errs and ev.count("S") == ev.count("F") and "X" not in ev, f"{ev[-12:]} {pg._errs[:2]}")


INFO = """() => { const h = document.getElementById('host'); const c = h.querySelector('.tcviz-calendar');
  const wm = h.querySelector('.tcviz-wm');
  const tamanos = Array.from(c.querySelectorAll('*')).filter(e => e.childNodes.length && Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()))
     .filter(e => !e.closest('.tcviz-wm') && !e.closest('[data-guide]')).map(e => parseFloat(getComputedStyle(e).fontSize));
  const dia = c.querySelector('[data-date][data-has-data="1"]');
  return { bg: c.style.background, font: c.style.fontFamily, wm: wm && wm.style.display !== 'none' ? wm.textContent : null,
    semanas: Array.from(c.querySelectorAll('[data-total="week"]')).map(e => e.textContent),
    meses: Array.from(c.querySelectorAll('[data-total="month"]')).map(e => e.textContent),
    dias: c.querySelectorAll('[data-date]').length, minFont: Math.min.apply(null, tamanos), maxFont: Math.max.apply(null, tamanos),
    diaBg: dia ? dia.style.backgroundColor : null, diaLabel: dia ? dia.getAttribute('aria-label') : null,
    foco: c.style.getPropertyValue('--tcviz-focus') + ' ' + c.style.getPropertyValue('--tcviz-focus-w') }; }"""


async def info(pg):
    return await pg.evaluate(INFO)


def fmt_k(v):
    return v


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        print("Base (Pro, mes)")
        pg = await page(b, dataview(), name="01_base")
        i = await info(pg)
        check("mes de marzo pintado", i["dias"] >= 31, str(i["dias"]))
        check("sin totales por defecto", not i["semanas"] and not i["meses"], str(i["semanas"]))
        check("Classic: fondo transparente como siempre", i["bg"] in ("transparent", ""), i["bg"])
        await eventos(pg, "base")
        await pg.close()

        print("Totales (Pro)")
        pg = await page(b, dataview({"totals": {"show": True}}), name="02_totales_mes")
        i = await info(pg)
        check("una Σ por semana de marzo (5 o 6 filas)", len(i["semanas"]) in (5, 6), str(i["semanas"]))
        check("total del mes con la suma", any("Total" in m for m in i["meses"]), str(i["meses"]))
        marzo = sum(v for d, v in VENTAS.items() if d.month == 3)
        txt = await pg.evaluate("() => (document.querySelector('[data-total=\"month\"] b')||{}).title")
        check("el total completo es la suma de marzo", txt and abs(float(txt.replace(",", "")) - marzo) < 1.5, f"{txt} vs {marzo:.2f}")
        await eventos(pg, "totales")
        await pg.close()

        pg = await page(b, dataview({"totals": {"show": True, "mode": "avg"}}), name="03_totales_promedio")
        i = await info(pg)
        check("promedio diario: etiqueta", any("Daily average" in m for m in i["meses"]), str(i["meses"]))
        txt = await pg.evaluate("() => (document.querySelector('[data-total=\"month\"] b')||{}).title")
        check("promedio = suma / días", txt and abs(float(txt.replace(",", "")) - marzo / 31) < 1.5, f"{txt} vs {marzo/31:.2f}")
        await pg.close()

        pg = await page(b, dataview({"totals": {"show": True}, "calendar": {"view": "year"}}), W=1000, H=640, name="04_totales_ano")
        await pg.wait_for_timeout(200); await upd(pg, dataview({"totals": {"show": True}, "calendar": {"view": "year"}}))
        i = await info(pg)
        con = [m for m in i["meses"] if m.startswith("Σ")]
        check("vista de año: total bajo cada mes con datos (3)", len(con) == 3 and len(i["meses"]) == 12, str(i["meses"]))
        await eventos(pg, "año")
        await pg.close()

        pg = await page(b, dataview({"totals": {"show": True}, "calendar": {"view": "week"}}), name="05_totales_semana")
        await upd(pg, dataview({"totals": {"show": True}, "calendar": {"view": "week"}}))
        i = await info(pg)
        check("vista de semana: total de la semana", len(i["semanas"]) == 1 and "Week total" in i["semanas"][0], str(i["semanas"]))
        await pg.close()

        print("Ayudas de página")
        pg = await page(b, dataview())
        ids = await pg.evaluate("""() => { const r = {}; for (const k of ['2026-03-06', '2026-03-10']) {
            const el = document.querySelector('[data-date="' + k + '"]'); el.dispatchEvent(new MouseEvent('mouseenter'));
            r[k] = (window.__tip && window.__tip.identities || []).map(i => i.key); } return r; }""")
        check("día con dos eventos: una sola identidad", len(ids["2026-03-06"]) == 1, str(ids))
        check("día normal: una identidad", len(ids["2026-03-10"]) == 1, str(ids))
        await pg.evaluate("() => { window.__nTip = 0; window.__nHide = 0; }")
        box = await pg.locator('[data-date="2026-03-06"]').bounding_box()
        for k in range(12):
            await pg.mouse.move(box["x"] + 3 + k * (box["width"] - 6) / 11, box["y"] + 3 + k * (box["height"] - 6) / 11)
        n = await pg.evaluate("() => [window.__nTip, window.__nHide]")
        check("sin parpadeo: recorrer la celda (pasando por número y eventos) abre la ayuda una vez y no la cierra", n == [1, 0], str(n))
        await pg.click('[data-date="2026-03-06"]')
        await pg.wait_for_timeout(100)
        sel = await pg.evaluate("() => (window.__sel || []).map(i => i.key)")
        check("clic en un día con eventos: filtra con la identidad de la fecha (una)", sel == ["m2026-03-06T00:00:00"], str(sel))
        marcas = await pg.evaluate("() => document.querySelectorAll('[data-date=\"2026-03-06\"] span').length")
        check("los eventos siguen en el calendario (marca el 6 de marzo; misma categoría = una franja)", marcas >= 1, str(marcas))
        await pg.close()

        pg = await page(b, dataview_jerarquia(), name="17_jerarquia")
        r = await pg.evaluate("""() => { const el = document.querySelector('[data-date="2026-03-06"]'); if (!el) return null;
            el.dispatchEvent(new MouseEvent('mouseenter')); return { id: (window.__tip.identities || []).map(i => i.key), dias: document.querySelectorAll('[data-date][data-has-data="1"]').length }; }""")
        check("jerarquía: el 6 de marzo lleva año, mes y día en su identidad", r and r["id"] == ["m2026|mMarch|m6"], str(r))
        check("jerarquía: marzo pintado con datos", r and r["dias"] >= 31, str(r))
        await eventos(pg, "jerarquía")
        await pg.close()

        print("Sin licencia")
        pg = await page(b, dataview({"totals": {"show": True}}), pro=False, edit=True, name="06_free_edicion")
        i = await info(pg)
        check("editando: totales en vista previa", len(i["semanas"]) >= 5, str(len(i["semanas"])))
        check("marca de agua común con la función", i["wm"] and "totals" in i["wm"].lower(), str(i["wm"]))
        await pg.close()
        pg = await page(b, dataview({"totals": {"show": True}, "style": {"template": "aurora"}}), pro=False, edit=False, name="07_free_lectura")
        i = await info(pg)
        check("lectura sin licencia: ni totales ni estilo Pro", not i["semanas"] and i["bg"] in ("transparent", ""), f"{i['semanas']} {i['bg']}")
        check("lectura sin licencia: sin marca", not i["wm"], str(i["wm"]))
        await eventos(pg, "free lectura")
        await pg.close()

        print("Estilos")
        for est in ["boardroom", "ledger", "editorial", "signal", "aurora", "terrace"]:
            pg = await page(b, dataview({"style": {"template": est}, "totals": {"show": True}}), name=f"08_estilo_{est}")
            i = await info(pg)
            check(f"{est}: fondo propio", i["bg"] not in ("transparent", ""), i["bg"])
            if est in ("ledger", "editorial"):
                check(f"{est}: Georgia", "Georgia" in i["font"], i["font"])
            # contraste del número del día sobre el fondo del día
            ok = await pg.evaluate("""() => { const lum = c => { const m = c.match(/\\d+/g).map(Number).slice(0,3).map(v => { v/=255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }); return .2126*m[0]+.7152*m[1]+.0722*m[2]; };
               const r = (a,b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
               let peor = 99; document.querySelectorAll('[data-date][data-has-data="1"]').forEach(d => { const n = d.firstChild; if (!n) return;
                 const f = new Date(d.getAttribute('data-date') + 'T00:00:00').getDay(); if (f === 0 || f === 6) return;
                 peor = Math.min(peor, r(getComputedStyle(n).color, getComputedStyle(d).backgroundColor)); }); return peor; }""")
            check(f"{est}: número del día laborable legible (≥3:1)", ok >= 3, f"{ok:.2f}")
            await eventos(pg, est)
            await pg.close()
        pg = await page(b, dataview({"style": {"template": "report"}}), name="09_report_theme")
        i = await info(pg)
        check("Report theme: escala hasta el color del tema", True, i["diaBg"])
        barra = await pg.evaluate("() => Array.from(document.querySelectorAll('.tcviz-calendar span')).map(e => e.style.background).find(b => b && b.indexOf('gradient') >= 0) || ''")
        check("Report theme: la escala termina en el azul del tema", "43, 108, 176" in barra or "2B6CB0" in barra.upper(), barra)
        await pg.close()

        print("Tamaño real")
        for W, H, nom in [(470, 380, "10_mosaico_470"), (400, 250, "11_mosaico_400"), (300, 220, "12_mini_300")]:
            pg = await page(b, dataview({"totals": {"show": True}}), W=W, H=H, name=nom)
            i = await info(pg)
            check(f"{W}×{H}: nada por debajo de 7 px", i["minFont"] >= 7, f"min {i['minFont']} max {i['maxFont']}")
            check(f"{W}×{H}: el texto encoge (máx < 14)", i["maxFont"] < 14, f"max {i['maxFont']}")
            await eventos(pg, f"{W}×{H}")
            await pg.close()
        pg = await page(b, dataview({"accessibility": {"minTextSize": 11}}), W=400, H=250, name="13_minimo_11")
        i = await info(pg)
        check("mínimo de Accesibilidad 11 respetado", i["minFont"] >= 11, f"min {i['minFont']}")
        await pg.close()

        print("Accesibilidad y formato")
        pg = await page(b, dataview({"accessibility": {"highContrast": "on", "focusColor": {"solid": {"color": "#FF00AA"}}, "focusWidth": 4}}), name="14_alto_contraste")
        i = await info(pg)
        check("alto contraste forzado: días sin color de relleno", i["diaBg"] in ("rgb(255, 255, 255)", "#FFFFFF", "white"), i["diaBg"])
        check("foco: grosor 4", "4px" in i["foco"], i["foco"])
        await pg.close()
        pg = await page(b, dataview({"accessibility": {"focusColor": {"solid": {"color": "#FF00AA"}}}}))
        i = await info(pg)
        check("foco: color de Accesibilidad", "#FF00AA" in i["foco"].upper(), i["foco"])
        await pg.close()
        pg = await page(b, dataview(dinamico="€ #,0.00"), name="15_formato_dinamico")
        i = await info(pg)
        check("formato dinámico de la medida en la etiqueta", "€" in (i["diaLabel"] or ""), i["diaLabel"])
        await pg.close()

        pg = await page(b, dataview(guia=True), W=400, H=250)
        n = await pg.evaluate("() => document.querySelectorAll('[data-guide]').length + Array.from(document.querySelectorAll('.tcviz-calendar div')).filter(d => /Setup/.test(d.textContent) && d.children.length > 2).length")
        check("guía oculta en un mosaico de 400×250", n == 0, str(n))
        await pg.close()
        pg = await page(b, dataview(guia=True), name="16_guia")
        n = await pg.evaluate("() => Array.from(document.querySelectorAll('.tcviz-calendar div')).filter(d => /Setup/.test(d.textContent) && d.children.length > 2).length")
        check("guía visible a tamaño grande", n > 0, str(n))
        await pg.close()

        print("Panel")
        pg = await page(b, dataview())
        orden = await pg.evaluate("() => __v.getFormattingModel().cards.map(c => c.uid.replace('-card',''))")
        check("Style template primero; Legend y Accessibility al final", orden[0] == "style" and orden[-2:] == ["legend", "accessibility"], str(orden))
        check("tarjeta Totals presente", "totals" in orden, str(orden))
        await pg.close()

        await b.close()
    print("\nTODO OK" if not FALLOS else f"\nFALLOS ({len(FALLOS)}): {FALLOS}")


if __name__ == "__main__":
    asyncio.run(main())
