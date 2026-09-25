# Feedback zu stilvorgabe-webapps.md (Testfall: Pizzateig-Rechner)

Stand: erster Durchlauf. Alles, was beim Umsetzen unklar war, fehlte oder angepasst werden musste.

**Eingearbeitet:** Die Entscheidungen dieses Protokolls stehen jetzt im eigenständigen Projekt `_tools/_webapp-style` (`SKILL.md` mit den Regeln, `base.css`, `reference.html`). Die `base.css` dieser App ist eine Kopie davon. Dieses Protokoll bleibt als Historie stehen. `_ref/stilvorgabe-webapps.md` ist die ursprüngliche Vorgabe des Testfalls.

## Fehler in der Vorgabe

- **Dark Mode, Kontrast:** Weißer Text auf `--accent` `#8FA4E6` (Button, Textauswahl) hat etwa 2,4:1. Umgesetzt: Token `--on-accent` (`#FFF` hell, `#1A1A1A` dunkel). Bitte in die Vorgabe übernehmen.
- **Dark Mode, Fehlerfarbe:** `#9B2C2C` auf `#1A1A1A` hat etwa 2,2:1. Umgesetzt: `#D98A8A` im Dunkeln.
- **Dark Mode, Eingabefelder:** „Eingabefelder #FFF“ blendet auf `#1A1A1A`. Umgesetzt: `--field` (`#FFF` hell, `#242424` dunkel).
- **Skala:** `--s3` fehlt (Lücke zwischen 24 und 48). `--s8` (96) und `--s16` (192) sind auf Mobile zu groß. Umgesetzt: Abschnittsabstand 48 px unter 600 px Breite.

## Fehlende Komponenten (frei entschieden, bitte festlegen)

- **Umschalter** (Trocken-/Frischhefe): zwei Textoptionen, aktive in `--text` mit Gewicht 500 ohne Unterstreichung, inaktive als Link.
- **Select:** wie Eingabefeld, native Darstellung mit eigenem Chevron (Pfeil-Verbot gilt für Buttontexte, ein Select braucht aber einen Hinweis).
- **Regler** (`input[type=range]`): nur `accent-color`, sonst nativ.
- **Checkbox:** nur `accent-color`.
- **Zeitplan-Zeile:** Zeit in Mono 25 %, rechts Titel (300, `--text`), Detail (`--muted`), Meta in Mono-Versalien. Tageswechsel als Abschnittslabel.
- **Aufklappbereich** (`details`): Summary im Fließtext-Stil, Trennlinien oben.
- **Fehlerzustand:** nur Text in Rot, kein Rahmen.
- **Theme-Toggle:** `data-theme` ist definiert, aber nie beschrieben. Nicht umgesetzt, nur `prefers-color-scheme`.

## Unklar

- **Fett im Fließtext:** Mit nur 300 und 500 (nur h1/h2) gibt es kein Fett. `strong`/`em` aus der md werden deshalb ohne Auszeichnung dargestellt. Falls Hervorhebung nötig ist, braucht es eine Regel (Vorschlag: Textfarbe statt Muted).
- **Schriften:** Google-Fonts-Einbindung ist datenschutzrechtlich nicht ideal. Vorschlag: Vorgabe soll lokales Hosting verlangen.
- **Primärer Button:** In dieser App kein Einsatz gefunden, alles sind Textlinks. Ob die Vorgabe für Werkzeuge mit Berechnung ohne Absenden-Aktion einen Hinweis braucht („Live-Berechnung statt Button“)?
- **Zahlenspalten:** Mono für Beträge ist naheliegend, aber nicht erwähnt.
- **Print:** Ein Zeitplan wird gerne ausgedruckt. Keine Vorgabe.

## Typografie-System (Stand 2. Durchlauf, entschieden)

- Drei Größen, als `clamp()` mit rem (Werte von lucasdietrich.art): `--fs-sml: clamp(0.9rem, 0.72rem + 1vw, 1.4rem)` (max 14 px), `--fs-med: clamp(1.7rem, 1.25rem + 2vw, 2.65rem)` (max 26,5 px), `--fs-max: clamp(2rem, 2.5rem + 2vw, 4rem)` (max 40 px).
- **Ursache der Abweichung im ersten Durchlauf:** Die Referenzseite setzt `html { font-size: 62.5% }`, also 1rem = 10 px. Die Vorgabe nennt das nicht und führt statt der Clamps feste px-Werte (13/18 px) und einen `--fs-h1` mit rem-Werten, die ohne die 62.5 % anders rechnen. Folge: Ein Testfall nach Vorgabe sieht kleiner aus als die Referenz. Bitte in die Vorgabe: `html { font-size: 62.5% }` und die Clamp-Tokens oben.
- Wirkt auch auf `letter-spacing: 0.05rem`: das sind mit 62.5 % nur 0,5 px, ohne 0,8 px.
- Drei Schnitte: Mono 400, Plex Sans Condensed 300, Plex Sans Condensed 500 (nur h1/h2).
- Mono hat genau einen Stil (Versalien, `letter-spacing: 0.05rem`) und gilt für alle Labels und Mengen. Dazu zählen Zeilenlabels, Zutatenmengen, Anteile, Uhrzeiten, Schrittnummern und die Meta-Zeile im Zeitplan.
- Folge der Versalien: Einheiten erscheinen als „1000 G“, „21 H“. Das ist konsequent, aber ungewohnt. Falls stören, Einheiten in Fließtext setzen.

## Entscheidungen aus der Design-Runde (bitte in die Vorgabe übernehmen)

- **Abschnittstitel sind h2** (`--fs-max`, 500), nicht Mono-Labels. Mono bleibt Daten und Zeilenlabels vorbehalten (Label-Spalte, Mengen, Zeiten, Nummern, Meta-Zeilen, Zusätze, Summary).
- **Eine Textfarbe:** `--muted` entfällt, alles `--text` (#333). Hierarchie nur über Größe, Abstand und Mono/Fließtext. Ausnahme: Akzent für Interaktives, Rot für Fehler.
- **Zusätze** unter Tabellen und Listen (Hinweise, Warnungen, Notizen zur Methode): Mono, eine Zeilenhöhe Abstand nach oben (`calc(var(--fs-med) * var(--lh-body))`).
- **Zeilen mit Eingabefeldern:** Padding oben und unten gleich (12 px), damit das Feld mittig sitzt. Die Regel „24 px oben, 12 px unten“ gilt nur für reine Textzeilen. Feldzeilen sind mindestens 48 px hoch, das Label ist auf die Feldmitte zentriert.
- **Aufklappbereiche:** Summary in Mono-Versalien, Inhalt eine Zeilenhöhe darunter, Padding oben und unten gleich (12 px).
- **`html { font-size: 62.5% }` und Clamp-Tokens** siehe Typografie-System.

## Was gut funktioniert hat

- Zeilen mit 1px-Linien und 25/75-Raster tragen die ganze Seite ohne Karten oder Flächen.
- Hierarchie nur über Größe, Abstand und Mono/Fließtext reicht auch für eine dichte Werkzeugseite.
