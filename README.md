# Pizzateig-Rechner

Statische Seite ohne Build. `index.html` per Doppelklick öffnen.

## pizzateig.md aktualisieren

`pizzateig.md` kommt unverändert aus dem 11ty-Blog. Die App liest Zutaten, Schritte und Dauern aus dem Freitext.

```
node sync.mjs /pfad/zum/blog/pizzateig.md   # einmalig: Quelle merken, kopieren, einbetten
node sync.mjs                               # danach: erneut aus derselben Quelle
```

Alternativ im Browser über „pizzateig.md laden“ oder per Drag & Drop. Das gilt nur für diesen Browser und lässt sich zurücksetzen.

Was die App nicht eindeutig erkennt (fehlende Dauer, Stückzahl), steht unter „Quelle“ im Erkennungsprotokoll und in der Ausgabe von `sync.mjs`.

## Was die App in der md zusätzlich erkennt

- „Kneten wie Methode 1, …“: übernimmt die Schritte von Methode 1 bis zum letzten Kneten vor der ersten Gare. Was nach dem Komma folgt, erscheint als Hinweis unter dem Zeitplan.
- Schritte, die mit „Falls/Wenn/Sind/Ist/Sollte … :“ beginnen, sind Ausweichwege. Sie bekommen keine Zeit im Zeitplan und stehen als Hinweis darunter.
- „Hefe erhöhen: 2g Trockenhefe oder 6g Frischhefe für 8h, 1,5g oder 4,5g für 10h“ im Text einer Methode ersetzt die Hefe aus dem Basisrezept. Die Menge wird passend zur Gärdauer im Zeitplan interpoliert.

## Abweichungen von der md

`pizzateig.md` bleibt unverändert. Eigene Werte stehen in `SETTINGS` am Anfang von `src/app.js`:

- Kühlschrank darf bei knapper Zeit bis zu 3 h kürzer sein als der Idealwert aus der md (`fridgeShrinkH`).
- Standard-Hydration 63 % für alle Neapolitanisch-Methoden (md: 65 %). Der Schlüssel ist der Anfang der Methoden-ID, also auch nach Umbenennen einzelner Methoden gültig, solange die Überschrift „Neapolitanisch“ heißt.

## Aufbau

- `src/parser.js`: md → Methoden (Zutaten, Schritte, Dauern, Variante). Läuft in Browser und Node.
- `src/planner.js`: Zeitplan rückwärts ab Ofenzeitpunkt, Raumtemperatur-Faktoren.
- `src/app.js`, `style.css`, `index.html`: Oberfläche nach `_ref/stilvorgabe-webapps.md`.
- `_ref/stilvorgabe-feedback.md`: Protokoll zur Stilvorgabe (Testfall).
