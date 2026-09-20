/*
 * Liest pizzateig.md (unveränderte Blog-Datei) und leitet daraus Methoden ab:
 * Zutaten, Schritte, Dauern, Varianten. Keine Sonderzeichen in der md nötig,
 * alles wird heuristisch aus dem Freitext erkannt. Läuft im Browser und in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PizzaParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NUM = '\\d+(?:[.,]\\d+)?';
  const RANGE_SEP = '(?:-|–|bis)';
  const toNum = (s) => parseFloat(String(s).replace(',', '.'));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /* ---------- Markdown → Blöcke ---------- */

  function tokenize(md) {
    md = md.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
    const blocks = [];
    let cur = null;
    const flush = () => { if (cur) blocks.push(cur); cur = null; };
    for (const raw of md.split('\n')) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flush(); continue; }
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flush(); blocks.push({ type: 'h', level: m[1].length, text: m[2].trim() }); continue; }
      if (/^-{3,}$/.test(line.trim())) { flush(); blocks.push({ type: 'hr' }); continue; }
      if ((m = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)$/))) {
        const kind = m[1] ? 'ol' : 'ul';
        if (!cur || cur.type !== kind) { flush(); cur = { type: kind, items: [] }; }
        cur.items.push(m[2].trim());
        continue;
      }
      if (cur && cur.type === 'p') cur.text += ' ' + line.trim();
      else if (cur && cur.items && /^\s+/.test(raw)) cur.items[cur.items.length - 1] += ' ' + line.trim();
      else { flush(); cur = { type: 'p', text: line.trim() }; }
    }
    flush();
    return blocks;
  }

  function groupBy(blocks, level) {
    const groups = [{ title: null, blocks: [] }];
    for (const b of blocks) {
      if (b.type === 'h' && b.level === level) groups.push({ title: b.text, blocks: [] });
      else groups[groups.length - 1].blocks.push(b);
    }
    return groups.filter((g) => g.title !== null || g.blocks.length);
  }

  /* ---------- Zutaten ---------- */

  const ING_START = new RegExp(`^(ca\\.?\\s*)?(${NUM})(?:\\s*${RANGE_SEP}\\s*(${NUM}))?\\s*g\\s+(.*)$`, 'i');

  function isIngredientList(b) {
    if (b.type !== 'ul') return false;
    return b.items.filter((i) => ING_START.test(i)).length >= b.items.length * 0.6;
  }

  function parseIngredient(text) {
    const m = text.match(ING_START);
    if (!m) return { kind: 'text', raw: text };
    const amount = toNum(m[2]);
    const max = m[3] ? toNum(m[3]) : null;
    const rest = m[4];
    const ing = { raw: text, amount, approx: !!m[1], perUnit: /\bpro\s+\w+/i.test(rest) };
    if (max) { ing.min = amount; ing.max = max; }

    if (/hefe/i.test(rest)) {
      const alt = rest.match(new RegExp(`oder\\s+(${NUM})\\s*g\\s+(.*)`, 'i'));
      const firstIsDry = /trocken/i.test(rest.split(/\boder\b/i)[0]);
      let fresh, dry;
      if (alt) {
        if (firstIsDry) { dry = amount; fresh = toNum(alt[1]); } else { fresh = amount; dry = toNum(alt[1]); }
      } else if (firstIsDry) { dry = amount; fresh = amount * 3; } else { fresh = amount; dry = amount / 3; }
      return Object.assign(ing, { kind: 'yeast', label: 'Hefe', fresh, dry });
    }
    if (/wasser/i.test(rest)) {
      ing.kind = 'water';
      ing.label = cap(rest.split(/[(,]/)[0].trim());
      ing.alts = [];
      const re = new RegExp(`bei\\s+(\\S+)\\s+(${NUM})\\s*g\\s*\\((${NUM})\\s*%\\)`, 'gi');
      let a;
      while ((a = re.exec(rest))) ing.alts.push({ name: a[1], amount: toNum(a[2]), pct: toNum(a[3]) });
      return ing;
    }
    ing.label = cap(rest.replace(/\s+pro\s+\w+$/i, '').trim());
    if (ing.perUnit) ing.label += ' ' + (rest.match(/pro\s+\w+/i) || [''])[0];
    if (/salz/i.test(rest)) ing.kind = 'salt';
    else if (/öl\b/i.test(rest)) ing.kind = 'oil';
    else if (/mehl|caputo|farina/i.test(rest)) ing.kind = 'flour';
    else ing.kind = 'other';
    return ing;
  }

  /* ---------- Schritte und Dauern ---------- */

  const DUR_RE = new RegExp(`(${NUM})\\s*(?:${RANGE_SEP}\\s*(${NUM}))?\\s*(h|stunden?|min(?:uten?)?)\\b`, 'i');
  const INTERVAL_RE = /(\d+)\s*[×x]\s+[^.]*?alle\s+(\d+)\s*(min\w*|h)\b/i;
  const DUR_AHEAD = new RegExp(`,\\s+(?=${NUM}\\s*(?:${RANGE_SEP}\\s*${NUM}\\s*)?(?:h|stunden?|min\\w*)\\b)`, 'i');

  function findDuration(seg) {
    let m = seg.match(INTERVAL_RE);
    if (m) return { min: toNum(m[1]) * toNum(m[2]) * (/^h/i.test(m[3]) ? 60 : 1), max: toNum(m[1]) * toNum(m[2]) * (/^h/i.test(m[3]) ? 60 : 1) };
    const outer = seg.replace(/\([^)]*\)/g, (x) => ' '.repeat(x.length));
    m = outer.match(DUR_RE) || seg.match(DUR_RE);
    if (!m) return null;
    const mult = /^(h|stunde)/i.test(m[3]) ? 60 : 1;
    const a = toNum(m[1]) * mult;
    return { min: a, max: m[2] ? toNum(m[2]) * mult : a };
  }

  function classify(seg) {
    const s = seg.toLowerCase();
    if (/vorheizen/.test(s)) return 'preheat';
    if (/vorbacken|fertigbacken/.test(s)) return 'bake';
    if (/gitter/.test(s)) return 'after';
    if (/kühlschrank/.test(s) && !/aus dem kühlschrank/.test(s)) return 'fridge';
    if (/fermentolyse|autolyse|ruhen/.test(s)) return 'rest';
    if (/raumtemperatur|stockgare|gehen lassen|gare\b/.test(s)) return 'room';
    if (/dehnen|falten/.test(s)) return 'fold';
    if (/knet/.test(s)) return 'knead';
    if (/teilen|schleifen|formen|ausziehen/.test(s)) return 'shape';
    if (/mischen|lösen|einarbeiten|zugeben|zurückhalten/.test(s)) return 'mix';
    return 'other';
  }

  const ACTIVE = new Set(['mix', 'knead', 'shape', 'fold', 'bake', 'other']);

  function estimate(kind, seg) {
    const s = seg.toLowerCase();
    if (kind === 'mix') return /zugeben|gegen ende/.test(s) ? 0 : 5;
    if (kind === 'knead') return 10;
    if (kind === 'shape') return 10;
    if (kind === 'after') return 0;
    if (kind === 'other') return 5;
    if (kind === 'preheat') return 30;
    if (kind === 'bake') return 8;
    if (kind === 'rest') return 30;
    if (kind === 'room') return 60;
    if (kind === 'fridge') return 720;
    return 10;
  }

  function segmentsOf(text) {
    const t = text.replace(/\.\s*$/, '');
    const out = [];
    for (const piece of t.split(/,?\s*\b(?:dann|nochmals)\s+/i)) {
      const idx = piece.search(DUR_AHEAD);
      if (idx > 0 && /teilen|schleifen|vorformen|formen/i.test(piece.slice(0, idx))) {
        out.push(piece.slice(0, idx).trim(), piece.slice(idx).replace(/^,\s*/, '').trim());
      } else out.push(piece.trim());
    }
    return out.filter(Boolean);
  }

  function makeSteps(texts, report) {
    const steps = texts.map((text, i) => ({
      text,
      phases: segmentsOf(text).map((seg, j) => {
        const kind = classify(seg);
        // „4-6h vor Backen … teilen“ ist ein Zeitpunkt, die Dauer steht im Folgeschritt (Stückgare)
        const lead = kind === 'shape' && /vor\s+(dem\s+)?backen/i.test(seg);
        const d = lead ? null : findDuration(seg);
        const est = !d;
        const min = d ? d.min : estimate(kind, seg);
        const max = d ? d.max : min;
        if (est && ['room', 'fridge', 'rest', 'preheat', 'bake'].includes(kind)) {
          report.warnings.push(`Keine Dauer erkannt: „${seg}“ (geschätzt ${min} Min)`);
        } else if (est && min > 0) report.estimated.push(`${seg} (${min} Min)`);
        return { id: `${i}.${j}`, kind, text: seg, min, max, est, active: ACTIVE.has(kind) };
      }),
    }));

    // Beschriftung und Phase (vor/nach Ofen) über die ganze Abfolge bestimmen
    let seenShape = false;
    let inOven = false;
    for (const step of steps) {
      for (const p of step.phases) {
        const s = p.text.toLowerCase();
        p.labelIsText = false;
        switch (p.kind) {
          case 'preheat': p.label = 'Ofen vorheizen'; p.parallel = true; break;
          case 'bake': inOven = true; p.label = /belegen/.test(s) ? 'Belegen, fertigbacken' : /fertigbacken/.test(s) ? 'Fertigbacken' : 'Vorbacken'; break;
          case 'after': p.label = 'Auf Gitter'; break;
          case 'fridge': p.label = /biga/.test(s) ? 'Biga im Kühlschrank' : seenShape ? 'Stückgare im Kühlschrank' : 'Stockgare im Kühlschrank'; break;
          case 'rest': p.label = 'Fermentolyse'; break;
          case 'room': p.label = seenShape ? 'Stückgare bei Raumtemperatur' : 'Stockgare bei Raumtemperatur'; break;
          case 'fold': p.label = 'Dehnen und Falten'; break;
          case 'knead': p.label = 'Kneten'; break;
          case 'shape': p.label = /ausziehen/.test(s) ? 'Im Blech ausziehen' : 'Teilen, Ballen formen'; seenShape = true; break;
          default: {
            if (p.kind === 'mix' && /biga/.test(s)) { p.label = 'Biga ansetzen'; break; }
            const first = p.text.split(',')[0];
            const base = cap(first.length < 15 ? p.text : first);
            p.label = base.length > 48 ? base.slice(0, 47) + '…' : base;
            p.labelIsText = true;
          }
        }
        p.post = inOven;
      }
    }
    return steps;
  }

  /* ---------- Methoden ---------- */

  function slurpMethod(blocks) {
    const info = { steps: null, variant: null, notes: [] };
    let pendingTitle = null;
    for (const b of blocks) {
      if (b.type === 'p') {
        const bold = b.text.match(/^\*\*(.+)\*\*$/);
        if (bold) pendingTitle = bold[1];
        else info.notes.push(b.text.replace(/^\*(.+)\*$/, '$1'));
      } else if ((b.type === 'ul' || b.type === 'ol') && !isIngredientList(b)) {
        if (pendingTitle && info.steps) {
          const th = pendingTitle.match(/ab\s+(\d+)\s*%/i);
          info.variant = { name: (pendingTitle.split(':')[1] || pendingTitle).trim(), title: pendingTitle, threshold: th ? toNum(th[1]) : null, items: b.items };
          pendingTitle = null;
        } else if (!info.steps) info.steps = b.items;
      }
    }
    return info;
  }

  function parse(md) {
    const report = { warnings: [], estimated: [] };
    const blocks = tokenize(md);
    const hr = blocks.findIndex((b) => b.type === 'hr');
    const recipeBlocks = hr < 0 ? blocks : blocks.slice(0, hr);
    const noteBlocks = hr < 0 ? [] : blocks.slice(hr + 1);

    const methods = [];
    for (const group of groupBy(recipeBlocks, 2).filter((g) => g.title)) {
      const subs = groupBy(group.blocks, 3);
      const ingSub = subs.find((s) => s.blocks.some(isIngredientList));
      const ingBlock = ingSub && ingSub.blocks.find(isIngredientList);
      const ingredients = ingBlock ? ingBlock.items.map(parseIngredient).filter((i) => i.kind !== 'text') : [];
      if (!ingredients.length) report.warnings.push(`Keine Zutatenliste in „${group.title}“ gefunden`);

      const methodSubs = subs.filter((s) => s.title && /^methode/i.test(s.title));
      const sources = methodSubs.length
        ? methodSubs.map((s) => ({ name: `${group.title} – ${s.title.replace(/^methode\s*\d+\s*[–-]\s*/i, '')}`, blocks: s.blocks }))
        : [{ name: group.title, blocks: group.blocks }];

      const groupMethods = [];
      for (const src of sources) {
        const info = slurpMethod(src.blocks);
        if (!info.steps) { report.warnings.push(`Keine Schritte in „${src.name}“ gefunden`); continue; }
        const baseSteps = makeSteps(info.steps, report);
        let variant = null;
        if (info.variant) {
          const kneadIdx = baseSteps.findIndex((s) => s.phases.some((p) => p.kind === 'knead'));
          const own = info.variant.items.filter((t) => !/rest identisch/i.test(t));
          const tail = own.length < info.variant.items.length && kneadIdx >= 0 ? info.steps.slice(kneadIdx + 1) : [];
          variant = { name: info.variant.name, title: info.variant.title, threshold: info.variant.threshold, steps: makeSteps([...own, ...tail], { warnings: [], estimated: [] }) };
        }
        const text = info.steps.join(' ');
        const y = text.match(/In\s+(\d+)\s+(Kugeln|Portionen|Stücke|Ballen)/i);
        groupMethods.push({
          id: slug(src.name), name: src.name, family: group.title, ingredients, steps: baseSteps, variant,
          notes: info.notes.filter((n) => n !== 'Rest identisch'),
          yield: y ? { count: toNum(y[1]), unit: y[2] } : null,
        });
      }
      for (const m of groupMethods) {
        if (!m.yield) {
          const sib = groupMethods.find((o) => o.yield);
          m.yield = sib ? { count: sib.yield.count, unit: sib.yield.unit, assumed: true } : { count: 6, unit: 'Kugeln', assumed: true };
          report.warnings.push(`Keine Stückzahl in „${m.name}“ erkannt, ${m.yield.count} ${m.yield.unit} angenommen`);
        }
      }
      methods.push(...groupMethods);
    }

    const notes = groupBy(noteBlocks.map((b) => (b.type === 'h' ? { ...b, level: 2 } : b)), 2)
      .map((g) => ({ title: (g.title || 'Weiteres').replace(/:\s*$/, ''), blocks: g.blocks }))
      .filter((g) => g.blocks.length);

    return { methods, notes, warnings: report.warnings, estimated: report.estimated };
  }

  return { parse, tokenize, toNum };
});
