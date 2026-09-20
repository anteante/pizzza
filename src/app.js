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
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>');
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

  function calc(m) {
    const f = state.flour / baseFlour(m);
    const h = hyd(m);
    const rows = m.ingredients.map((i) => {
      let amount, label = i.label;
      if (i.kind === 'flour') { amount = state.flour; const par = (i.label.match(/\(([^)]*)\)/) || [])[1]; label = par ? `Mehl (${par})` : 'Mehl'; }
      else if (i.kind === 'water') amount = (state.flour * h) / 100;
      else if (i.kind === 'yeast') { amount = (state.yeast === 'dry' ? i.dry : i.fresh) * f; label = state.yeast === 'dry' ? 'Trockenhefe' : 'Frischhefe'; }
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

  /* ---------- Text mit angepassten Mengen ---------- */

  function scaleText(text, m, c) {
    const w = ing(m, 'water');
    const totals = w ? [w.amount, w.max].filter(Boolean) : [];
    const re = new RegExp('(\\d+(?:[.,]\\d+)?)(?:\\s*(?:-|–|bis)\\s*(\\d+(?:[.,]\\d+)?))?(\\s*g\\b)', 'g');
    return text.replace(re, (all, a, b, g) => {
      const x = P.toNum(a);
      if (b) return `${grams(x * c.f)}–${grams(P.toNum(b) * c.f)}${g}`;
      if (x === baseFlour(m)) return `${grams(state.flour)}${g}`;
      if (totals.includes(x)) return `${grams(state.flour * (hyd(m) / 100))}${g}`;
      return `${grams(x * c.f)}${g}`;
    });
  }

  // „Mit ca. 600g Wasser starten, Rest bis zur Ziel-Hydration zurückhalten (mind. 60g)“:
  // konkrete Mengen für die aktuelle Hydration ausrechnen
  function bassinageHint(text, m, c) {
    const start = text.match(/ca\.\s*(\d+(?:[.,]\d+)?)\s*g\s+Wasser\s+starten/i);
    if (!start || !/Ziel-Hydration/i.test(text)) return '';
    const minRest = (text.match(/mind\.\s*(\d+(?:[.,]\d+)?)\s*g/i) ? P.toNum(RegExp.$1) : 60) * c.f;
    const total = (state.flour * hyd(m)) / 100;
    let rest = total - P.toNum(start[1]) * c.f;
    if (rest < minRest) rest = minRest;
    const first = total - rest;
    return first > 0 ? `. Bei ${de(hyd(m), 1)} % Hydration: ${grams(first)}g starten, ${grams(rest)}g zurückhalten.` : '';
  }

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
      return `<div class="ing"><span class="mono">${r.approx ? 'ca. ' : ''}${grams(r.amount)} g</span><span>${esc(r.label)}</span><span class="mono muted">${pct}</span></div>`;
    }).join('') + `<div class="ing"><span class="mono">${de(c.dough)} g</span><span class="muted">Teig gesamt</span><span></span></div>`;
    const y = c.rows.find((r) => r.kind === 'yeast');
    $('#ing-note').textContent = y && y.amount < 1 ? 'Unter 1 g Hefe: Feinwaage nötig, oder Hefe vorher in etwas Wasser lösen und anteilig abmessen.' : '';
  }

  /* ---------- Anleitung ---------- */

  function renderSteps() {
    const m = method();
    const c = calc(m);
    const bass = useBass(m);
    $('#steps-lead').textContent = bass ? `Mit Variante: ${m.variant.name}` : '';
    $('#steps-list').innerHTML = (bass ? m.variant.steps : m.steps).map((s) => `<li><span>${inline(scaleText(s.text, m, c) + (bass ? bassinageHint(s.text, m, c) : ''))}</span></li>`).join('');
    $('#steps-notes').innerHTML = m.notes.length ? m.notes.map((n) => `<p class="mono note">${inline(scaleText(n, m, c))}</p>`).join('') : '';
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

  function renderPlan() {
    const m = method();
    const steps = activeSteps(m);
    $('#temp-hint').textContent = state.temp === 'normal' ? '' : `Gare bei Raumtemperatur × ${de(factor(), 2)}`;

    if (state.startTime == null) initTimes();
    setVal($('#start-day'), state.startDay);
    setVal($('#start-time'), state.startTime);
    setVal($('#oven-day'), state.ovenDay);
    setVal($('#oven-time'), state.ovenTime);

    const start = resolve(state.startDay, state.startTime), oven = resolve(state.ovenDay, state.ovenTime);
    if (oven <= start) { $('#plan-list').innerHTML = ''; $('#plan-warn').textContent = 'Der Ofenzeitpunkt muss nach dem Start liegen.'; return; }

    const plan = Pl.build(steps, { start, oven, factor: factor(), fridgeShrinkH: SETTINGS.fridgeShrinkH });
    $('#plan-warn').textContent = planWarnings(plan);

    let day = '';
    $('#plan-list').innerHTML = plan.rows.map((r) => {
      const d = relDay(r.start);
      const head = d !== day ? `<p class="label day">${esc(d)}</p>` : '';
      day = d;
      const time = `<span class="mono">${Pl.fmtTime(r.start)}</span>`;
      const lines = (r.milestone ? r.details : r.lines).map((t) => `<p class="detail">${esc(t)}</p>`).join('');
      return `${head}<div class="prow">${time}<div><span>${esc(r.title)}</span>${lines}</div></div>`;
    }).join('');
  }

  /* ---------- Notizen und Quelle ---------- */

  function renderBlock(b) {
    if (b.type === 'p') return `<p>${inline(b.text)}</p>`;
    if (b.type === 'ul' || b.type === 'ol') return `<${b.type}>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${b.type}>`;
    if (b.type === 'h') return `<p class="label">${inline(b.text)}</p>`;
    return '';
  }

  function renderNotes() {
    $('#notes-list').innerHTML = data.notes.map((n) => `<details><summary class="mono">${esc(n.title)}</summary>${n.blocks.map(renderBlock).join('')}</details>`).join('');
    $('#notes').hidden = !data.notes.length;
  }

  function renderSource() {
    $('#reset-btn').hidden = !usingCustom;
  }

  /* ---------- Ablauf ---------- */

  function update() {
    persist();
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

    $('#import-btn').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
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
    renderNotes();
    renderSource();
    update();
  }

  bind();
  reload();
})();
