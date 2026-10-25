# -*- coding: utf-8 -*-
"""Calendar Events Heatmap — idiomas (desde 1.2.1.0, dentro del repo).

Parte de los 12 stringResources/*/resources.resjson ya publicados (la fuente de verdad de lo traducido hasta 1.2.0.0)
y añade las claves nuevas de NUEVAS. Regenera src/strings.ts con lo que Power BI Desktop no resuelve (las claves que no
están en capabilities.json: Desktop solo traduce esas con getDisplayName). Ejecutar desde la raíz del repo:
    python tools/i18n/i18n.py
Una clave nueva del código sin traducir aquí sale en inglés y el script la lista.
"""
import io, json, os, re

R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LANGS = ["es-ES", "fr-FR", "de-DE", "it-IT", "pt-BR", "nl-NL", "pl-PL", "ja-JP", "zh-CN", "ko-KR"]   # orden de columnas
PT_PT = [("Usuário", "Utilizador"), ("Dicas de ferramenta", "Descrições"), ("em um", "num"), ("Rótulos", "Etiquetas"),
         ("rótulos", "etiquetas"), ("Rótulo", "Etiqueta"), ("rótulo", "etiqueta"), ("controles", "controlos"),
         ("Controles", "Controlos"), ("Plano de fundo", "Fundo"), ("exibição", "apresentação"), ("Exibição", "Apresentação")]

# clave: [inglés, es, fr, de, it, pt-BR, nl, pl, ja, zh, ko]
NUEVAS = {
    "Landing_Tagline": ["Each day coloured by your measure, with the events that explain it on the same day.",
        "Cada día coloreado por tu medida, con los eventos que lo explican en el mismo día.",
        "Chaque jour coloré par votre mesure, avec les événements qui l'expliquent le même jour.",
        "Jeder Tag nach Ihrem Measure eingefärbt, mit den Ereignissen, die ihn erklären, am selben Tag.",
        "Ogni giorno colorato dalla tua misura, con gli eventi che lo spiegano nello stesso giorno.",
        "Cada dia colorido pela sua medida, com os eventos que o explicam no mesmo dia.",
        "Elke dag gekleurd op basis van je meting, met de gebeurtenissen die hem verklaren op dezelfde dag.",
        "Każdy dzień pokolorowany według miary, z wydarzeniami, które go wyjaśniają, tego samego dnia.",
        "各日をメジャーで色分けし、その日を説明するイベントを同じ日に表示します。",
        "每天按度量着色，并在同一天显示解释它的事件。",
        "각 날짜를 측정값으로 색칠하고, 그날을 설명하는 이벤트를 같은 날에 표시합니다."],
    "Landing_Steps": ["Get started", "Primeros pasos", "Pour commencer", "Erste Schritte", "Per iniziare", "Primeiros passos",
        "Aan de slag", "Pierwsze kroki", "はじめに", "入门", "시작하기"],
    "Landing_Step1": ["one row per day; the Auto date/time hierarchy also works",
        "una fila por día; también sirve la jerarquía automática de fecha",
        "une ligne par jour ; la hiérarchie automatique de date fonctionne aussi",
        "eine Zeile pro Tag; die automatische Datumshierarchie funktioniert auch",
        "una riga per giorno; funziona anche la gerarchia automatica di data",
        "uma linha por dia; a hierarquia automática de data também funciona",
        "één rij per dag; de automatische datumhiërarchie werkt ook",
        "jeden wiersz na dzień; automatyczna hierarchia dat też działa",
        "1 日 1 行。自動の日付階層も使えます",
        "每天一行；自动日期层次结构也可用",
        "하루에 한 행. 자동 날짜 계층 구조도 사용할 수 있습니다"],
    "Landing_Step2": ["colours each day", "colorea cada día", "colore chaque jour", "färbt jeden Tag ein", "colora ogni giorno",
        "colore cada dia", "kleurt elke dag", "koloruje każdy dzień", "各日を色分けします", "为每天着色", "각 날짜를 색칠합니다"],
    "Landing_Step3": ["optional: promotions, campaigns or incidents on their day",
        "opcional: promociones, campañas o incidencias en su día",
        "facultatif : promotions, campagnes ou incidents le jour où ils ont lieu",
        "optional: Aktionen, Kampagnen oder Vorfälle an ihrem Tag",
        "facoltativo: promozioni, campagne o incidenti nel loro giorno",
        "opcional: promoções, campanhas ou incidentes no seu dia",
        "optioneel: acties, campagnes of incidenten op hun dag",
        "opcjonalnie: promocje, kampanie lub incydenty w ich dniu",
        "省略可: プロモーション、キャンペーン、インシデントをその日に表示",
        "可选：在当天显示促销、活动或事件",
        "선택 사항: 프로모션, 캠페인 또는 사고를 해당 날짜에 표시"],
    "Landing_Pro": ["Year and week views, several months side by side and switching the measure — try them on your data while you edit.",
        "Vistas de año y semana, varios meses a la vez y cambio de medida: pruébalos con tus datos mientras editas.",
        "Vues année et semaine, plusieurs mois côte à côte et changement de mesure — essayez-les sur vos données pendant l'édition.",
        "Jahres- und Wochenansicht, mehrere Monate nebeneinander und Measure-Wechsel – testen Sie sie beim Bearbeiten mit Ihren Daten.",
        "Viste anno e settimana, più mesi affiancati e cambio di misura: provali sui tuoi dati mentre modifichi.",
        "Vistas de ano e semana, vários meses lado a lado e troca de medida — experimente com seus dados enquanto edita.",
        "Jaar- en weekweergave, meerdere maanden naast elkaar en meting wisselen — probeer ze tijdens het bewerken op je eigen gegevens.",
        "Widok roku i tygodnia, kilka miesięcy obok siebie i zmiana miary — wypróbuj je na swoich danych podczas edycji.",
        "年と週のビュー、複数月の並列表示、メジャーの切り替え — 編集中に自分のデータで試せます。",
        "年视图和周视图、多个月并排显示、切换度量 — 编辑时可用你的数据试用。",
        "연도 및 주 보기, 여러 달 나란히 표시, 측정값 전환 — 편집하는 동안 내 데이터로 사용해 보세요."],
    "Landing_Help": ["Help", "Ayuda", "Aide", "Hilfe", "Guida", "Ajuda", "Help", "Pomoc", "ヘルプ", "帮助", "도움말"],
    "Landing_Guide": ["Guide", "Guía", "Guide", "Anleitung", "Guida", "Guia", "Handleiding", "Przewodnik", "ガイド", "指南", "가이드"],
    "Landing_GuideSub": ["support page", "página de soporte", "page d'assistance", "Supportseite", "pagina di supporto",
        "página de suporte", "ondersteuningspagina", "strona pomocy", "サポート ページ", "支持页面", "지원 페이지"],
    "Landing_Product": ["Product page", "Página del producto", "Page produit", "Produktseite", "Pagina del prodotto",
        "Página do produto", "Productpagina", "Strona produktu", "製品ページ", "产品页面", "제품 페이지"],
    "Landing_Video": ["Video", "Vídeo", "Vidéo", "Video", "Video", "Vídeo", "Video", "Wideo", "動画", "视频", "동영상"],
    "Guide_ProOn": ["Pro:", "Pro:", "Pro :", "Pro:", "Pro:", "Pro:", "Pro:", "Pro:", "Pro:", "Pro:", "Pro:"],
    "Guide_TryPro": ["Try Pro:", "Prueba Pro:", "Essayez Pro :", "Pro ausprobieren:", "Prova Pro:", "Experimente o Pro:",
        "Probeer Pro:", "Wypróbuj Pro:", "Pro を試す:", "试用 Pro:", "Pro 사용해 보기:"],
    "Guide_ProYear": ["Year view", "Vista de año", "Vue année", "Jahresansicht", "Vista anno", "Visão de ano", "Jaarweergave",
        "Widok roku", "年ビュー", "年视图", "연도 보기"],
    "Guide_ProWeek": ["Week view", "Vista de semana", "Vue semaine", "Wochenansicht", "Vista settimana", "Visão de semana",
        "Weekweergave", "Widok tygodnia", "週ビュー", "周视图", "주 보기"],
    "Guide_ProMonths": ["3 months", "3 meses", "3 mois", "3 Monate", "3 mesi", "3 meses", "3 maanden", "3 miesiące", "3 か月",
        "3 个月", "3개월"],
    "Msg_DateMonthUnknown": ["Month not recognised: \"{0}\". Use Date instead of Date Hierarchy.",
        "No se reconoce el mes: «{0}». Usa Date en lugar de Date Hierarchy.",
        "Mois non reconnu : « {0} ». Utilisez Date au lieu de Date Hierarchy.",
        "Monat nicht erkannt: „{0}“. Verwenden Sie Date statt Date Hierarchy.",
        "Mese non riconosciuto: «{0}». Usa Date invece di Date Hierarchy.",
        "Mês não reconhecido: “{0}”. Use Date em vez de Date Hierarchy.",
        "Maand niet herkend: ‘{0}’. Gebruik Date in plaats van Date Hierarchy.",
        "Nie rozpoznano miesiąca: „{0}”. Użyj Date zamiast Date Hierarchy.",
        "月を認識できません:「{0}」。Date Hierarchy ではなく Date を使ってください。",
        "无法识别月份:“{0}”。请使用 Date 而不是 Date Hierarchy。",
        "월을 인식할 수 없습니다: \"{0}\". Date Hierarchy 대신 Date를 사용하세요."],
    "Guide_ProMeasure": ["Switch measure", "Cambiar de medida", "Changer de mesure", "Measure wechseln", "Cambia misura",
        "Trocar de medida", "Meting wisselen", "Zmień miarę", "メジャーを切り替え", "切换度量", "측정값 전환"],
}


def leer(lang):
    p = os.path.join(R, "stringResources", lang, "resources.resjson")
    return json.load(io.open(p, encoding="utf-8-sig")) if os.path.exists(p) else {}


def escribir(lang, d):
    p = os.path.join(R, "stringResources", lang, "resources.resjson")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    io.open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(dict(sorted(d.items())), ensure_ascii=False, indent=2) + "\n")


def main():
    en = leer("en-US")
    for k, v in NUEVAS.items():
        en[k] = v[0]
    src = io.open(os.path.join(R, "src", "visual.ts"), encoding="utf-8").read()
    codigo = dict(re.findall(r'(?:this|self)\.t\(\s*"([A-Za-z0-9_]+)"\s*,\s*"((?:[^"\\]|\\.)*)"', src))
    for k, v in codigo.items():
        en.setdefault(k, json.loads('"' + v + '"'))
    escribir("en-US", en)
    todas = {}
    sin = set()
    for i, lang in enumerate(LANGS):
        d = leer(lang)
        for k, e in en.items():
            if k in NUEVAS:
                d[k] = NUEVAS[k][i + 1]
            elif k not in d:
                d[k] = e
                sin.add(k)
        escribir(lang, d)
        todas[lang] = d
    pt = dict(todas["pt-BR"])
    for k in NUEVAS:
        s = pt[k]
        for a, b in PT_PT:
            s = re.sub(r"\b" + re.escape(a) + r"\b", b, s)
        pt[k] = s
    viejo_pt = leer("pt-PT")
    viejo_pt.update({k: pt[k] for k in pt if k not in viejo_pt or k in NUEVAS})
    escribir("pt-PT", viejo_pt)
    todas["pt-PT"] = viejo_pt
    caps = io.open(os.path.join(R, "capabilities.json"), encoding="utf-8").read()
    runtime = sorted(k for k in en if f'"{k}"' not in caps)
    tabla = {l: {k: d[k] for k in runtime if d.get(k) and d[k] != en[k]} for l, d in todas.items()}
    io.open(os.path.join(R, "src", "strings.ts"), "w", encoding="utf-8", newline="\n").write(
        "/**\n * Traducciones de los textos que escribe el propio visual (botones, asistente, avisos, ayudas).\n"
        " * Power BI Desktop solo resuelve con getDisplayName las claves declaradas en capabilities.json, así\n"
        " * que estas viajan en el bundle. Generado por tools/i18n/i18n.py: no editar a mano.\n */\n"
        "export const STRINGS: Record<string, Record<string, string>> = " + json.dumps(tabla, ensure_ascii=False, indent=2) + ";\n")
    print("claves", len(en), "| en el bundle", len(runtime), "| sin traducir (en inglés):", sorted(sin))


if __name__ == "__main__":
    main()
