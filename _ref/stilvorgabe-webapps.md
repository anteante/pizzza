# Stilvorgabe für Webapps (abgeleitet von lucasdietrich.art)

Gilt für jede Webapp, jedes Tool und jede Seite, die du für mich baust. Diese Vorgabe hat Vorrang vor deinen Standard-Stilen.

## Haltung

Ruhig, zurückhaltend, typografisch. Hierarchie entsteht über Schriftgröße, Schriftgewicht und Abstand, nicht über Farbe, Flächen oder Effekte. Viel Weißraum und linksbündiger Satz. Eine einzige Akzentfarbe, die ausschließlich für interaktive Elemente verwendet wird.

## Tokens

```css
:root {
  --bg: #F0F0F0;          /* hellgrau, nicht weiß */
  --surface: #F0F0F0;     /* keine abgesetzten Flächen, Ausnahme: Eingabefelder #FFF */
  --text: #333;
  --muted: #666;
  --line: #DDD;
  --accent: #234297;      /* Links, Buttons, Fokus, Auswahl */

  --ff-base: 'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif;
  --ff-mono: 'IBM Plex Mono', ui-monospace, monospace;

  --fs-small: 13px;       /* Mono-Labels */
  --fs-body: 18px;
  --fs-h3: 22px;
  --fs-h1: clamp(28px, 2.4rem + 1.5vw, 40px);
  --lh-body: 1.4;
  --lh-head: 1.2;

  --s1: 12px; --s2: 24px; --s4: 48px; --s8: 96px; --s16: 192px;
  --radius: 4px;
  --t: 0.2s;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #1A1A1A; --surface: #1A1A1A; --text: #D6D6D6;
    --muted: #8A8A8A; --line: #333; --accent: #8FA4E6;
  }
}
```

Schriften: Die Originale (Lars Condensed, Suisse Intl Mono) sind lizenziert und nicht verfügbar. IBM Plex Sans Condensed (Google Fonts) ist ein Ersatz, keine Entsprechung. Gewichte: 300 für Fließtext, 500 für Überschriften, nichts dazwischen, kein Bold.

## Typografie

- Fließtext in Gewicht 300. Überschriften in Gewicht 500 mit leicht negativem Laufweitenwert (-0.02em).
- Abschnittslabels in Mono, Versalien, `--fs-small`, Laufweite 0.05em, Farbe `--text`. Sparsam einsetzen: nur, wo ein Abschnitt wirklich benannt werden muss.
- Zeilenlänge für Fließtext höchstens 66ch.
- Links in `--accent`, 1px Unterstreichung, `text-underline-offset: 0.25em`. Navigationslinks ohne Unterstreichung, beim Hover 1px Linie unten.
- Textauswahl: weiß auf `--accent`.

## Layout

- Linksbündig. Inhaltsspalte 650–750px, Gesamtcontainer maximal 1000–1440px, Seitenrand `--s2`.
- Abstände nur aus der Skala (12/24/48/96/192). Große Abschnitte getrennt durch `--s8` oder `--s16`, nicht durch Linien oder Flächen.
- Listen und Tabellen: Zeilen durch 1px `--line` getrennt, großzügiges Padding (24px oben, 12px unten).
- Label/Wert-Paare als zweispaltiges Raster: Label 25 %, Wert Rest.

## Komponenten

- Button primär: gefüllt `--accent`, weißer Text, Radius 4px, Padding 12px 48px, Hover 10 % dunkler. Sekundär: nur Textlink.
- Eingabefelder: weißer Hintergrund, 1px `--line`, Radius 4px, Höhe 48px, Fokus = Rahmen in `--accent`, kein Glow.
- Fokus-Stil für Tastatur: 2px Outline in `--accent`, 2px Offset.

## Nicht verwenden

- Karten, Schatten, Verläufe, Glassmorphism, farbige Hintergrundflächen
- Radien über 4px, Pillen-Buttons, Badges oder Chips mit Farbfüllung
- Icons als Dekoration, Emojis in der Oberfläche, Pfeile an Buttontexten
- Weitere Farben außer `--accent` (Fehlerzustände ausgenommen: gedämpftes Rot #9B2C2C, nur als Text)
- Zentrierte Hero-Bereiche, große Kennzahlen mit kleinem Label, Einblend-Animationen
- Inter, Roboto, System-UI als sichtbare Schrift, Tailwind-/shadcn-Standardoptik
