#!/usr/bin/env node
// Kopiert pizzateig.md (z. B. aus dem 11ty-Blog) nach data/ und bettet sie für die Seite ein.
//   node sync.mjs /pfad/zum/blog/pizzateig.md   Quelle merken und kopieren
//   node sync.mjs                               zuletzt genutzte Quelle (data/.source) bzw. data/pizzateig.md
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, 'data');
const target = join(dataDir, 'pizzateig.md');
const sourceFile = join(dataDir, '.source');
const { parse } = createRequire(import.meta.url)('./src/parser.js');

let src = process.argv[2] ? resolve(process.argv[2]) : existsSync(sourceFile) ? readFileSync(sourceFile, 'utf8').trim() : target;
if (!existsSync(src)) { console.error(`Quelle nicht gefunden: ${src}`); process.exit(1); }

const md = readFileSync(src, 'utf8');
const result = parse(md);
if (!result.methods.length) { console.error('Keine Methoden erkannt, nichts geschrieben.'); process.exit(1); }

if (src !== target) writeFileSync(target, md);
if (process.argv[2]) writeFileSync(sourceFile, src + '\n');
writeFileSync(join(dataDir, 'pizzateig.js'),
  `window.PIZZATEIG_MD = ${JSON.stringify(md)};\nwindow.PIZZATEIG_SYNCED = ${JSON.stringify(new Date().toISOString())};\n`);

console.log(`${result.methods.length} Methoden, ${result.notes.length} Notizabschnitte aus ${src}`);
for (const m of result.methods) console.log(`  · ${m.name}${m.variant ? ` (+ ${m.variant.name})` : ''}`);
for (const w of result.warnings) console.log(`  ! ${w}`);
