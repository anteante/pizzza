/*
 * Zeitplaner: rechnet ab dem Ofenzeitpunkt rückwärts (Schritte vor dem Ofen)
 * und vorwärts (Backschritte). Raumtemperatur skaliert nur Schritte bei Raumtemperatur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PizzaPlanner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Faktor relativ zu „normal“; Basis sind die Zeiten aus pizzateig.md
  const TEMPS = [
    { id: 'cold', label: 'Kalt (unter 18 °C)', factor: 1.6 },
    { id: 'cool', label: 'Kühl (18–21 °C)', factor: 1.25 },
    { id: 'normal', label: 'Normal (21–24 °C)', factor: 1 },
    { id: 'warm', label: 'Warm (24–28 °C)', factor: 0.75 },
    { id: 'hot', label: 'Heiß (über 28 °C)', factor: 0.55 },
  ];

  function flatten(steps) {
    return steps.flatMap((s) => s.phases);
  }

  // Auf volle Viertelstunden runden, jede echte Dauer mindestens 15 Min
  const q15 = (m) => (m <= 0 ? 0 : Math.max(15, Math.round(m / 15) * 15));

  /*
   * Grobe Abschnitte: prep (Teigzubereitung), stock (Stockgare Raumtemperatur), fridge,
   * stueck (Ballen und Stückgare), dazu Start und Ofen.
   *
   * Start und Ofenzeit sind vorgegeben. Die Zeit dazwischen wird auf die Abschnitte verteilt:
   * feste Arbeiten (Teigzubereitung) bleiben, die Gare-Abschnitte (Stockgare, Kühlschrank,
   * Stückgare) werden innerhalb ihrer Spannen aus pizzateig.md gleichmäßig gedehnt oder gekürzt.
   */
  function build(steps, { start, oven, factor = 1, fridgeShrinkH = 3 }) {
    const items = flatten(steps).map((p, i) => {
      const f = p.kind === 'room' ? factor : 1;
      return { ...p, order: i, rmin: p.min * f, rmax: p.max * f, rdur: ((p.min + p.max) / 2) * f };
    });
    const pre = items.filter((p) => !p.post && !p.parallel);

    // 1. Jede Phase einer Gruppe zuordnen
    let seenShape = false, last = null, shapeGroup = null;
    const groups = pre.map(() => null);
    const nextKind = (from) => {
      for (let j = from + 1; j < pre.length; j++) if (pre[j].kind !== 'shape' && pre[j].rdur > 0) return pre[j].kind;
      return null;
    };
    pre.forEach((p, i) => {
      let g = null;
      switch (p.kind) {
        case 'rest': case 'knead': case 'fold': g = 'prep'; break;
        case 'mix': g = p.rdur === 0 ? null : 'prep'; break;
        case 'room': g = seenShape ? 'stueck' : 'stock'; break;
        case 'fridge': g = 'fridge'; break;
        case 'shape': {
          g = nextKind(i) === 'room' ? 'stueck' : last || 'stock';
          shapeGroup = g;
          seenShape = true;
          break;
        }
        default: g = last;
      }
      groups[i] = g;
      if (g) last = g;
    });
    for (let i = groups.length - 1; i >= 0; i--) if (!groups[i]) groups[i] = groups[i + 1] || 'prep';

    // 2. Aufeinanderfolgende Phasen einer Gruppe zusammenfassen
    const rows = [];
    pre.forEach((p, i) => {
      let r = rows[rows.length - 1];
      if (!r || r.group !== groups[i]) { r = { group: groups[i], phases: [] }; rows.push(r); }
      r.phases.push(p);
    });
    const preps = rows.filter((r) => r.group === 'prep');
    for (const r of rows) {
      const sum = (k) => r.phases.reduce((s, p) => s + p[k], 0);
      r.min = q15(sum('rmin'));
      r.max = Math.max(r.min, q15(sum('rmax')));
      const activeMin = r.phases.filter((p) => p.active).reduce((s, p) => s + p.rdur, 0);
      r.active = activeMin * 2 >= sum('rdur') && activeMin > 0;
      r.title = {
        prep: preps.length > 1 && r === preps[0] ? 'Teigzubereitung (Vorteig)' : 'Teigzubereitung',
        stock: 'Stockgare Raumtemperatur',
        fridge: 'Kühlschrank',
        stueck: shapeGroup === 'stueck' ? 'Ballen und Stückgare' : 'Stückgare',
      }[r.group];
    }

    // 3. Zeit zwischen Start und Ofen auf die Abschnitte verteilen
    const startD = q15Date(start), ovenD = q15Date(oven);
    const avail = Math.round((ovenD - startD) / 60000);
    // Der Kühlschrank darf kürzer sein als der Idealwert (Untergrenze der Spanne), aber höchstens um fridgeShrinkH
    rows.forEach((r) => { r.floor = r.group === 'fridge' ? Math.max(15, r.min - fridgeShrinkH * 60) : r.min; });
    const minSum = rows.reduce((s, r) => s + r.min, 0);       // Idealwerte
    const floorSum = rows.reduce((s, r) => s + r.floor, 0);   // absolutes Minimum
    const maxSum = rows.reduce((s, r) => s + r.max, 0);
    let status = 'ok';
    if (avail >= maxSum) {
      rows.forEach((r) => { r.dur = r.max; });
      if (avail > maxSum) status = 'long';
    } else if (avail >= minSum) {
      const t = (avail - minSum) / (maxSum - minSum);
      rows.forEach((r) => { r.dur = Math.min(r.max, Math.max(r.min, Math.round((r.min + t * (r.max - r.min)) / 15) * 15)); });
      // Rundungsrest auf die Abschnitte mit dem größten Spielraum verteilen
      let diff = avail - rows.reduce((s, r) => s + r.dur, 0);
      const byFlex = [...rows].sort((x, y) => (y.max - y.min) - (x.max - x.min));
      for (let guard = 0; diff !== 0 && guard < 200; guard++) {
        const stepMin = diff > 0 ? 15 : -15;
        const r = byFlex.find((x) => x.dur + stepMin >= x.min && x.dur + stepMin <= x.max);
        if (!r) break;
        r.dur += stepMin;
        diff -= stepMin;
      }
    } else if (avail >= floorSum) {
      // Etwas knapp: der Kühlschrank fängt die Lücke auf
      rows.forEach((r) => { r.dur = r.min; });
      let need = minSum - avail;
      for (const r of rows.filter((x) => x.group === 'fridge')) {
        const cut = Math.min(need, r.min - r.floor);
        r.dur -= cut;
        need -= cut;
      }
    } else {
      rows.forEach((r) => { r.dur = r.floor; });
      status = 'short';
    }

    // 4. Rückwärts ab dem Ofen auslegen (weicht der Start ab, meldet status das)
    const total = rows.reduce((s, r) => s + r.dur, 0);
    let t = ovenD.getTime();
    for (let i = rows.length - 1; i >= 0; i--) {
      rows[i].end = new Date(t);
      t -= rows[i].dur * 60000;
      rows[i].start = new Date(t);
    }
    const actualStart = new Date(t);

    // Beschreibung je Abschnitt: „30 Minuten Autolyse“, „15 Minuten kneten“ …
    const five = (m) => Math.max(5, Math.round(m / 5) * 5);
    for (const r of rows) {
      if (r.group === 'prep') {
        r.lines = r.phases.flatMap((p) => {
          const d = fmtLong(five(p.rdur));
          if (p.kind === 'rest') return [`${d} Autolyse`];
          if (p.kind === 'knead') return [`${d} kneten`];
          if (p.kind === 'fold') return [`${d} dehnen und falten`];
          return [];
        });
        if (!r.lines.length) r.lines = [r.phases[0].label];
      } else {
        if (r.group === 'stueck') {
          const room = r.phases.filter((x) => x.kind === 'room');
          const lo = room.reduce((s, x) => s + x.rmin, 0), hi = room.reduce((s, x) => s + x.rmax, 0);
          r.lines = [`${fmtHours(lo, hi)} bei Raumtemperatur`];
        } else if (r.group === 'fridge' && r.dur < r.min) r.lines = [fmtLong(r.dur), `ideal ${fmtLong(r.min)}`];
        else r.lines = [fmtLong(r.dur)];
      }
    }

    // 5. Start- und Ofenzeile
    const first = { milestone: true, title: 'Start', start: actualStart, dur: 0, details: [`Gesamtdauer ${fmtDur(total)}`] };
    const details = [];
    const preheat = items.find((p) => p.parallel);
    if (preheat) details.push(`Ofen ab ${fmtTime(new Date(ovenD.getTime() - q15(preheat.rdur) * 60000))} vorheizen`);
    const bake = items.filter((p) => p.post && p.rdur > 0).map((p) => `${p.label} ${fmtRange(Math.round(p.rmin), Math.round(p.rmax))}`);
    if (bake.length) details.push(bake.join(', '));
    const last2 = { milestone: true, title: 'Pizza in den Ofen', start: ovenD, dur: 0, details };

    return {
      rows: [first, ...rows, last2],
      start: actualStart,
      totalMin: total,
      status,                       // ok | short (zu wenig Zeit) | long (mehr Zeit als nötig)
      availMin: avail,
      minMin: floorSum,
      idealMin: minSum,
      maxMin: maxSum,
      latestStart: new Date(ovenD.getTime() - floorSum * 60000),   // bei Zeitmangel: spätester Start
      earliestOven: new Date(startD.getTime() + floorSum * 60000), // bei Zeitmangel: frühester Ofen
      bestStart: new Date(ovenD.getTime() - maxSum * 60000),     // bei Zeitüberschuss: frühester sinnvoller Start
      latestOven: new Date(startD.getTime() + maxSum * 60000),   // bei Zeitüberschuss: spätester Ofen
    };
  }

  function q15Date(d) {
    const x = new Date(d);
    x.setSeconds(0, 0);
    x.setMinutes(Math.round(x.getMinutes() / 15) * 15);
    return x;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  function fmtDur(min) {
    if (min < 60) return `${min} Min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} Min` : `${h} h`;
  }

  function fmtLong(min) {
    const h = Math.floor(min / 60), m = min % 60;
    const parts = [];
    if (h) parts.push(`${h} ${h === 1 ? 'Stunde' : 'Stunden'}`);
    if (m) parts.push(`${m} ${m === 1 ? 'Minute' : 'Minuten'}`);
    return parts.join(' ');
  }

  // Spanne in halben Stunden: „5-6 Stunden“, „6,5-7,5 Stunden“
  function fmtHours(min, max) {
    const h = (m) => String(Math.round(m / 30) / 2).replace('.', ',');
    const a = h(min), b = h(max);
    return a === b ? `${a} ${a === '1' ? 'Stunde' : 'Stunden'}` : `${a}-${b} Stunden`;
  }

  function fmtRange(min, max) {
    if (min === max) return fmtDur(min);
    if (min >= 60 && max >= 60 && min % 60 === 0 && max % 60 === 0) return `${min / 60}–${max / 60} h`;
    if (max < 60) return `${min}–${max} Min`;
    return `${fmtDur(min)} – ${fmtDur(max)}`;
  }

  return { TEMPS, build, q15Date, fmtTime, fmtDur, fmtLong, fmtRange };
});
