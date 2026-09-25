(function () {
  'use strict';
  const P = window.PizzaParser;
  const Pl = window.PizzaPlanner;
  const $ = (s) => document.querySelector(s);

  // Abweichungen von pizzateig.md (die md bleibt unverändert, siehe README)
  const SETTINGS = {
    fridgeShrinkH: 3, // Kühlschrank darf bei knapper Zeit bis zu 3 h kürzer sein als der Idealwert aus der md
    hydrationDefault: { neapolitanisch: 63 }, // Präfix der Methoden-ID (alle Neapolitanisch-Methoden), md: 65 %
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ohne Speicher weiter */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignorieren */ } },
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const de = (n, d = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: 0, useGrouping: false });
  const grams = (n) => (n < 10 ? de(n, 1) : de(n, 0));

  /* ---------- Daten ---------- */

  let data;
  let usingCustom = false;

  function loadData() {
    const custom = store.get('pizza.md');
    if (custom) {
      try {
        const d = P.parse(custom);
        if (d.methods.length) { data = d; usingCustom = true; return; }
      } catch (e) { /* fällt auf eingebettete Version zurück */ }
    }
    data = P.parse(window.PIZZATEIG_MD || '');
    usingCustom = false;
  }

  /* ---------- Zustand ---------- */

  const saved = (() => { try { return JSON.parse(store.get('pizza.state') || '{}'); } catch (e) { return {}; } })();
  const state = {
    methodId: saved.methodId || null,
    flour: saved.flour > 0 ? saved.flour : 1000,
    yeast: saved.yeast === 'fresh' ? 'fresh' : 'dry',
    temp: Pl.TEMPS.some((t) => t.id === saved.temp) ? saved.temp : 'normal',
    hyd: null, bass: null, startDay: 0, startTime: null, ovenDay: 1, ovenTime: '18:00',
  };
  const persist = () => store.set('pizza.state', JSON.stringify({ methodId: state.methodId, flour: state.flour, yeast: state.yeast, temp: state.temp }));

  const method = () => data.methods.find((m) => m.id === state.methodId) || data.methods[0];
  const ing = (m, kind) => m.ingredients.find((i) => i.kind === kind);
  const baseFlour = (m) => (ing(m, 'flour') || { amount: 1000 }).amount;

  function hydDefault(m) {
    const key = Object.keys(SETTINGS.hydrationDefault).find((k) => m.id.startsWith(k + '-'));
    if (key) return SETTINGS.hydrationDefault[key];
    const w = ing(m, 'water');
    return w ? Math.round(((w.max || w.amount) / baseFlour(m)) * 1000) / 10 : null;
  }
  const hyd = (m) => (state.hyd != null ? state.hyd : hydDefault(m));

  // Hefe je Gärdauer aus der md („2g … für 8h, 1,5g … für 10h“): passend zum Zeitplan interpolieren.
  // Maßgeblich ist die Dauer bei normaler Raumtemperatur, die Temperaturkorrektur steckt schon im Zeitplan.
  function yeastFor(m) {
    const opts = m.yeastByHours;
    let h = opts[0].hours;
    if (plan) {
      const min = plan.rows.filter((r) => !r.milestone && r.group !== 'fridge')
        .reduce((s, r) => s + (r.group === 'prep' ? r.dur : r.dur / factor()), 0);
      h = Math.min(opts[opts.length - 1].hours, Math.max(opts[0].hours, min / 60));
    }
    const i = Math.max(0, opts.findIndex((o) => o.hours >= h) - 1);
    const a = opts[i], b = opts[Math.min(i + 1, opts.length - 1)];
    const t = b.hours === a.hours ? 0 : (h - a.hours) / (b.hours - a.hours);
    return { hours: h, dry: a.dry + t * (b.dry - a.dry), fresh: a.fresh + t * (b.fresh - a.fresh) };
  }

  function calc(m) {
    const f = state.flour / baseFlour(m);
    const h = hyd(m);
    const rows = m.ingredients.map((i) => {
      let amount, label = i.label;
      if (i.kind === 'flour') { amount = state.flour; const par = (i.label.match(/\(([^)]*)\)/) || [])[1]; label = par ? `Mehl (${par})` : 'Mehl'; }
      else if (i.kind === 'water') amount = (state.flour * h) / 100;
      else if (i.kind === 'yeast') { const y = m.yeastByHours ? yeastFor(m) : i; amount = (state.yeast === 'dry' ? y.dry : y.fresh) * f; label = state.yeast === 'dry' ? 'Trockenhefe' : 'Frischhefe'; }
      else amount = i.amount * f;
      return { kind: i.kind, label, amount, ing: i, perUnit: i.perUnit, approx: i.approx };
    });
    const dough = rows.filter((r) => !r.perUnit).reduce((s, r) => s + r.amount, 0);
    return { rows, dough, f, h };
  }

  function basePerBall(m) {
    const base = m.ingredients.filter((i) => !i.perUnit).reduce((s, i) => s + (i.kind === 'yeast' ? i.dry : i.max || i.amount), 0);
    return base / m.yield.count;
  }

  const threshold = (m) => m.variant.threshold;
  const useBass = (m) => !!m.variant && (state.bass != null ? state.bass : threshold(m) != null && hyd(m) >= threshold(m));
  const activeSteps = (m) => (useBass(m) ? m.variant.steps : m.steps);

  /* ---------- Eingaben ---------- */

  function fillOptions() {
    $('#method').innerHTML = data.methods.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
    $('#temp').innerHTML = Pl.TEMPS.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
    if (!data.methods.some((m) => m.id === state.methodId)) state.methodId = data.methods[0].id;
  }

  const setVal = (el, v) => { if (document.activeElement !== el) el.value = v; };

  function renderControls() {
    const m = method();
    const c = calc(m);
    $('#method').value = m.id;
    setVal($('#flour'), Math.round(state.flour * 10) / 10);
    const n = Math.max(1, Math.round((state.flour / baseFlour(m)) * m.yield.count));
    const unit = m.yield.unit === 'Kugeln' ? 'Ballen' : m.yield.unit;
    $('#balls-note').textContent = `${n} ${unit} je ${de(c.dough / n)} g Teig${m.yield.assumed ? ' (Anzahl angenommen)' : ''}`;

    const h = hyd(m);
    const w = ing(m, 'water');
    setVal($('#hydration'), h == null ? '' : Math.round(h * 10) / 10);
    $('#hydration').disabled = !w;
    const hints = [];
    if (w && w.min) hints.push(`laut Rezept ${de((w.min / baseFlour(m)) * 100)}–${de((w.max / baseFlour(m)) * 100)} %`);
    $('#hydration-hint').textContent = hints.join(' ');

    document.querySelectorAll('input[name=yeast]').forEach((r) => { r.checked = r.value === state.yeast; });
    $('#bass-row').hidden = !m.variant;
    if (m.variant) {
      $('#bass').checked = useBass(m);
      $('#bass-name').textContent = m.variant.name;
      $('#bass-hint').textContent = threshold(m) != null ? `ab ${threshold(m)} % Hydration` : '';
    }
    $('#temp').value = state.temp;
  }

  /* ---------- Zutaten ---------- */

  function renderIngredients() {
    const m = method();
    const c = calc(m);
    $('#ing-rows').innerHTML = c.rows.map((r) => {
      const pct = r.kind === 'flour' || r.perUnit ? '' : `${de((r.amount / state.flour) * 100, r.kind === 'yeast' ? 2 : 1)} %`;
      return `<div class="item item--3"><span class="mono">${r.approx ? 'ca. ' : ''}${grams(r.amount)} g</span><span>${esc(r.label)}</span><span class="mono muted">${pct}</span></div>`;
    }).join('') + `<div class="item item--3"><span class="mono">${de(c.dough)} g</span><span class="muted">Teig gesamt</span><span></span></div>`;
    const y = c.rows.find((r) => r.kind === 'yeast');
    const notes = [];
    if (y && m.yeastByHours) {
      const key = state.yeast === 'dry' ? 'dry' : 'fresh';
      notes.push(`Hefe passend zu ${de(yeastFor(m).hours, 1)} h Gare laut Zeitplan. Rezept: ${m.yeastByHours.map((o) => `${de(o[key] * c.f, 1)} g bei ${de(o.hours)} h`).join(', ')}.`);
    }
    $('#ing-note').textContent = notes.join(' ');
  }

  /* ---------- Anleitung ---------- */

  // Text der Methode wie in der md: Einleitung als Fließtext, Schritte nummeriert, Zusätze nach der Liste in Mono.
  // Die md ist für das Basisrezept geschrieben (meist 1000 g Mehl): Grammangaben und Stückzahl werden
  // auf die aktuelle Mehlmenge umgerechnet. Im Schreibstil der md („600g“) und ohne Mono: Mono hat nur die
  // kleine Größe und wirkt mitten im Fließtext zu klein.
  const plain = (s) => esc(s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1'));
  const NUM = '\\d+(?:[.,]\\d+)?';
  const GRAMS = new RegExp(`(${NUM})(?:\\s*(?:-|–|bis)\\s*(${NUM}))?\\s*g\\b`, 'g');
  const BASS = '\u0000'; // Platzhalter für die Bassinage-Ergänzung, damit sie nicht mitskaliert wird

  // „Mit 600g Wasser starten … (bei 65%: 50g, bei 67%: 70g)“: Rest für die aktuelle Hydration ergänzen
  function withBassinage(text, m, c) {
    const start = text.match(new RegExp(`(${NUM})\\s*g\\s+Wasser\\s+starten`, 'i'));
    const list = text.match(new RegExp(`\\((bei\\s+${NUM}\\s*%:\\s*${NUM}\\s*g(?:,\\s*)?)+\\)`, 'i'));
    if (!start || !list) return { text, extra: '' };
    const h = hyd(m);
    const listed = [...list[0].matchAll(new RegExp(`bei\\s+(${NUM})\\s*%`, 'gi'))].map((x) => P.toNum(x[1]));
    if (listed.includes(h)) return { text, extra: '' };
    const rest = Math.max(0, (state.flour * h) / 100 - P.toNum(start[1]) * c.f);
    const at = list.index + list[0].length - 1;
    return { text: text.slice(0, at) + BASS + text.slice(at), extra: `, bei ${de(h, 1)}%: ${grams(rest)}g` };
  }

  function scaled(text, m, c) {
    const b = withBassinage(text, m, c);
    const count = Math.max(1, Math.round(c.f * m.yield.count));
    return plain(b.text)
      .replace(GRAMS, (all, x, y) => `${grams(P.toNum(x) * c.f)}${y ? `–${grams(P.toNum(y) * c.f)}` : ''}g`)
      .replace(/(In\s+)(\d+)(\s+(?:Kugeln|Portionen|Stücke|Ballen))/i, (all, pre, n, post) => (+n === m.yield.count ? `${pre}${count}${post}` : all))
      .replace(BASS, b.extra);
  }

  function renderSteps() {
    const m = method();
    const c = calc(m);
    let afterList = false;
    $('#steps-text').innerHTML = m.blocks.map((b) => {
      if (b.type === 'ul' || b.type === 'ol') {
        afterList = true;
        return `<ol class="steps">${b.items.map((i) => `<li><span>${scaled(i, m, c)}</span></li>`).join('')}</ol>`;
      }
      if (b.type !== 'p') return '';
      if (/^\*\*.+\*\*$/.test(b.text)) return `<p class="label note">${scaled(b.text, m, c)}</p>`;
      return afterList ? `<p class="mono note">${scaled(b.text, m, c)}</p>` : `<p>${scaled(b.text, m, c)}</p>`;
    }).join('');
  }

  /* ---------- Zeitplan ---------- */

  const DAYS = 5; // Heute bis in vier Tagen
  const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' });
  const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const dayOffset = (d) => Math.round((midnight(d) - midnight(new Date())) / 86400000);
  const relDay = (d) => ({ '-1': 'Gestern', 0: 'Heute', 1: 'Morgen', 2: 'Übermorgen' }[dayOffset(d)] || weekday.format(d));
  const at = (d) => `${relDay(d)}, ${Pl.fmtTime(d)}`;
  const factor = () => Pl.TEMPS.find((t) => t.id === state.temp).factor;

  function resolve(offset, time) {
    const [h, m] = (time || '00:00').split(':').map(Number);
    const d = midnight(new Date());
    d.setDate(d.getDate() + offset);
    d.setHours(h, m, 0, 0);
    return d;
  }

  // Standard: Start heute 18:00, Ofen morgen 18:00
  function initTimes() {
    state.startDay = 0;
    state.startTime = '18:00';
    state.ovenDay = 1;
    state.ovenTime = '18:00';
  }

  function fillDays() {
    const opts = Array.from({ length: DAYS }, (_, i) => `<option value="${i}">${esc(relDay(resolve(i, '12:00')))}</option>`).join('');
    $('#start-day').innerHTML = opts;
    $('#oven-day').innerHTML = opts;
  }

  function planWarnings(plan) {
    const w = [];
    if (plan.status === 'short') {
      w.push(`Zu knapp: mindestens ${Pl.fmtLong(plan.minMin)} nötig, verfügbar sind ${Pl.fmtLong(plan.availMin)}. Start spätestens ${at(plan.latestStart)} oder Ofen frühestens ${at(plan.earliestOven)}.`);
    } else if (plan.status === 'long') {
      w.push(`Mehr Zeit als nötig: längstens ${Pl.fmtLong(plan.maxMin)} sinnvoll, verfügbar sind ${Pl.fmtLong(plan.availMin)}. Start ab ${at(plan.bestStart)} oder Ofen bis ${at(plan.latestOven)}.`);
    }
    if (plan.start < new Date()) w.push('Der Start liegt in der Vergangenheit.');
    const nightly = plan.rows.filter((r) => r.active && !r.milestone && r.dur > 0 && (r.start.getHours() >= 23 || r.start.getHours() < 6));
    if (nightly.length) w.push(`Aktive Schritte zwischen 23 und 6 Uhr: ${nightly.map((r) => r.title).join(', ')}.`);
    return w.join(' ');
  }

  // Der Zeitplan wird vor den Zutaten berechnet, weil manche Methoden die Hefe nach der Gärdauer richten
  let plan = null;

  function makePlan() {
    if (state.startTime == null) initTimes();
    const start = resolve(state.startDay, state.startTime), oven = resolve(state.ovenDay, state.ovenTime);
    plan = oven > start ? Pl.build(activeSteps(method()), { start, oven, factor: factor(), fridgeShrinkH: SETTINGS.fridgeShrinkH }) : null;
  }

  function renderPlan() {
    const m = method();
    $('#temp-hint').textContent = state.temp === 'normal' ? '' : `Gare bei Raumtemperatur × ${de(factor(), 2)}`;
    setVal($('#start-day'), state.startDay);
    setVal($('#start-time'), state.startTime);
    setVal($('#oven-day'), state.ovenDay);
    setVal($('#oven-time'), state.ovenTime);
    $('#plan-hints').innerHTML = m.hints.map((h) => `<p class="mono note">${esc(h)}</p>`).join('');

    if (!plan) { $('#plan-list').innerHTML = ''; $('#plan-warn').textContent = 'Der Ofenzeitpunkt muss nach dem Start liegen.'; return; }
    $('#plan-warn').textContent = planWarnings(plan);

    let day = '';
    $('#plan-list').innerHTML = plan.rows.map((r) => {
      const d = relDay(r.start);
      const head = d !== day ? `<p class="label day">${esc(d)}</p>` : '';
      day = d;
      const time = `<span class="mono">${Pl.fmtTime(r.start)}</span>`;
      const lines = (r.milestone ? r.details : r.lines).map((t) => `<p class="detail">${esc(t)}</p>`).join('');
      return `${head}<div class="item">${time}<div><span>${esc(r.title)}</span>${lines}</div></div>`;
    }).join('');
  }

  /* ---------- Quelle ---------- */

  function renderSource() {
    $('#reset-btn').hidden = !usingCustom;
  }

  /* ---------- Ablauf ---------- */

  function update() {
    persist();
    makePlan();
    renderControls();
    renderIngredients();
    renderSteps();
    renderPlan();
  }

  function changeMethod(id) {
    state.methodId = id; state.hyd = null; state.bass = null;
    update();
  }

  function bind() {
    $('#method').addEventListener('change', (e) => changeMethod(e.target.value));
    $('#flour').addEventListener('input', (e) => { const v = parseFloat(e.target.value); if (v > 0) { state.flour = v; update(); } });
    $('#hydration').addEventListener('input', (e) => { const v = parseFloat(e.target.value); if (v > 0) { state.hyd = v; update(); } });
    document.querySelectorAll('input[name=yeast]').forEach((r) => r.addEventListener('change', () => { state.yeast = r.value; update(); }));
    $('#bass').addEventListener('change', (e) => { state.bass = e.target.checked; update(); });
    $('#temp').addEventListener('change', (e) => { state.temp = e.target.value; update(); });
    $('#start-day').addEventListener('change', (e) => { state.startDay = +e.target.value; update(); });
    $('#start-time').addEventListener('input', (e) => { if (e.target.value) { state.startTime = e.target.value; update(); } });
    $('#oven-day').addEventListener('change', (e) => { state.ovenDay = +e.target.value; update(); });
    $('#oven-time').addEventListener('input', (e) => { if (e.target.value) { state.ovenTime = e.target.value; update(); } });

    $('#reset-btn').addEventListener('click', () => { store.del('pizza.md'); reload(); });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) importFile(f); });
  }

  function importFile(file) {
    $('#import-error').textContent = '';
    file.text().then((text) => {
      let d;
      try { d = P.parse(text); } catch (err) { d = null; }
      if (!d || !d.methods.length) { $('#import-error').textContent = `„${file.name}“ enthält keine erkennbaren Rezepte. Es wurde nichts geändert.`; return; }
      store.set('pizza.md', text);
      reload();
    });
  }

  function reload() {
    loadData();
    fillOptions();
    fillDays();
    state.hyd = null; state.bass = null;
    renderSource();
    update();
  }

  bind();
  reload();
})();
