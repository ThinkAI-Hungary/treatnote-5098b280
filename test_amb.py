import json
import re

def html_escape(szoveg: str) -> str:
    szoveg = szoveg.replace("&", "&amp;")
    szoveg = szoveg.replace("<", "&lt;")
    szoveg = szoveg.replace(">", "&gt;")
    szoveg = szoveg.replace('"', "&quot;")
    return szoveg

def szoveg_json_string_kibontasa(szoveg: str) -> str:
    if not isinstance(szoveg, str):
        return ""
    s = szoveg.strip()
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        try:
            return json.loads(s)
        except Exception:
            return szoveg
    if len(s) >= 3 and s[0] == '"' and s[-2:] == '",':
        try:
            return json.loads(s[:-1])
        except Exception:
            return szoveg
    return szoveg

def szoveg_json_maradek_takaritas(szoveg: str) -> str:
    if not isinstance(szoveg, str):
        return ""
    s = szoveg.strip()
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        s = s[1:-1].strip()
    elif len(s) >= 3 and s[0] == '"' and s[-2:] == '",':
        s = s[1:-2].strip()
    s = s.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\t", "\t")
    return s

def szoveg_elokeszitese_tinymcehez(szoveg: str) -> str:
    s = szoveg_json_string_kibontasa(szoveg)
    s = szoveg_json_maradek_takaritas(s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    return s.strip()

def markdown_alap_html(markdown_szoveg: str) -> str:
    s = markdown_szoveg or ""
    if not s.strip():
        return "<p></p>"
    s = html_escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    sorok = s.split("\n")
    out = []
    ul_nyitva = False
    def ul_zaras():
        nonlocal ul_nyitva
        if ul_nyitva:
            out.append("</ul>")
            ul_nyitva = False
    for sor in sorok:
        line = sor.rstrip()
        if not line.strip():
            ul_zaras()
            out.append("")
            continue
        if line.startswith("## "):
            ul_zaras()
            out.append(f"<h2>{line[3:].strip()}</h2>")
            continue
        if line.startswith("# "):
            ul_zaras()
            out.append(f"<h1>{line[2:].strip()}</h1>")
            continue
        m = re.match(r"^(\-|\*)\s+(.*)$", line)
        if m:
            if not ul_nyitva:
                out.append("<ul>")
                ul_nyitva = True
            out.append(f"<li>{m.group(2).strip()}</li>")
            continue
        ul_zaras()
        out.append(line)
    ul_zaras()
    vegleges = []
    puffer = []
    def p_flush():
        nonlocal puffer
        if puffer:
            vegleges.append("<p>" + "<br>".join(puffer) + "</p>")
            puffer = []
    for elem in out:
        if elem == "":
            p_flush()
            continue
        if elem.startswith("<h1>") or elem.startswith("<h2>") or elem.startswith("<ul>") or elem.startswith("</ul>") or elem.startswith("<li>"):
            p_flush()
            vegleges.append(elem)
        else:
            puffer.append(elem)
    p_flush()
    return "\n".join(vegleges)

s = r"""Családban előforduló lényeges megbetegedések:\nNincs adat.\n\nGyermekkori megbetegedések (idült betegségek, kórházi kezelések, örökletes megbetegedések):\nNincs adat.\n\nIsmert betegségek (fertőző betegségek, vérzékenység, véralvadási zavar, anaemia, anyagcsere betegségek, terhesség, szív- és érrendszeri megbetegedések, immunszupresszív megbetegedések, pajzsmirigy-mellékvese betegség, tüdőbetegség, mozgásszervi-reumatológiai betegség, vesebetegség, idegrendszeri betegség, egyéb idült betegségek):\nKrónikus köhögés (2-3 hétnél tovább tartó)\nTüdőbetegségre utaló tünetek: véres váladék felköhögése, mellkasi és hátfájdalom, nehézlégzés\nDélutáni hőemelkedés vagy láz\nGyakran visszatérő meghűlések, amelyek nem gyógyulnak\nVizeletrendszeri érintettség: gennyes vizelet\n\nKorábbi műtétek:\nNincs adat.\n\nFogászati anamnézis, korábbi fogászati beavatkozások, szájhigiéné, táplálkozási szokások:\nNincs adat.\n\nKorábbi sérülések (pl. csonttörések):\nNincs adat.\n\nRendszeresen szedett gyógyszerek (véravadásgátló, antibiotikum, szteroid, immunszupresszív hatású gyógyszerek, sugárkezelés, immunterápia, cytostatikus kezelés, pszichiátriai gyógyszeres kezelés, stb. ...):\nNincs adat.\n\nGyógyszerérzékenység (pl.: antibiotikum, lidocain, fájdallmcsillapítók):\nNincs adat.\n\nAllergia (pl. fémallergia, akrilát, amalgám, latex):\nNincs adat.\n\nBeültetett eszközök (protézis pacemaker, stb. ...):\nNincs adat.\n\nJelen panaszok (panasz jellege, helye, lefolyása, panasz kezdetének ideje) (hőinger, ráharapási inger, ozmotikus inger, fájdalom, esztétikai panasz, ételbeékelődés):\nKezdet: Krónikus, 2-3 hétnél tovább tartó\nLégzőszervi tünetek: Köhögés, véres vagy váladékos köpet, nehézlégzés\nFájdalom: Mellkasi és hátfájdalom\nHőmérséklet-szabályozási zavar: Délutáni hőemelkedés vagy láz, erős éjszakai izzadás, hidegrázás\nÁltalános tünetek: Étvágytalanság, megmagyarázhatatlan fogyás, fáradékonyság, kimerültség, gyengeség\nFertőzésre utaló jelek: Gyakori, nem gyógyuló meghűlések\nVizeletrendszeri tünet: Időnként gennyes vizelet\n\nStátusz:\nExtraoralis vizsgálat:\nÁltalános állapot: A leírt tünetek súlyos általános állapotromlásra utalnak. Nincs részletezve a bemeneti szövegben.\nIntraoralis vizsgálat:\nNincs részletezve a bemeneti szövegben.\n\nVizsgálati leletek (labor, képalkotó vizsgálatok, konzíliumok):\nNincs adat."""

print("1. BEFORE:", len(s))
content_norm = szoveg_elokeszitese_tinymcehez(s)
print("2. NORM:", len(content_norm))
html = markdown_alap_html(content_norm)
print("3. HTML LEN:", len(html))
print("4. HTML:", repr(html[:100]))
