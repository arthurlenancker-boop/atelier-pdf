// scripts/check-licenses.js — Tâche 13 : aucune dépendance à licence problématique.
// Échoue si une dépendance directe du package.json n'est pas sous une licences
// MIT, Apache-2.0, BSD, ISC, 0BSD ou AGPL (le dépôt lui-même est AGPL-3.0).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AUTORISEES = /^(MIT|ISC|MIT\/X11|Apache-2\.0|Apache\s*2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|BSD)$/;
const RACINE = path.join(__dirname, '..');

let echecs = 0;

function verifier(nomPaquet) {
  const dossier = path.join(RACINE, 'node_modules', nomPaquet, 'package.json');
  if (!fs.existsSync(dossier)) {
    console.error(`  (absent : ${nomPaquet} non installé)`);
    return;
  }
  const pkg = JSON.parse(fs.readFileSync(dossier, 'utf8'));
  const licence = String(pkg.license || (pkg.licenses && pkg.licenses[0]?.type) || '');
  if (AUTORISEES.test(licence)) {
    console.log(`  ok    ${nomPaquet} (${licence})`);
  } else {
    console.error(`  NON   ${nomPaquet} licence « ${licence} » non approuvée`);
    echecs += 1;
  }
}

console.log('Contrôle des licences des dépendances directes :');
const pkgRacine = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
const dependances = [...Object.keys(pkgRacine.dependencies || {}),
  ...Object.keys(pkgRacine.devDependencies || {})];
if (dependances.length === 0) {
  console.log('  (aucune dépendance déclarée)');
}
for (const nom of dependances) verifier(nom);

// Le dépôt lui-même doit rester AGPL-3.0 (clause du kit Glass on Charcoal).
if (pkgRacine.license !== 'AGPL-3.0-only') {
  console.error(`  NON   atelier-pdf licence « ${pkgRacine.license} » ≠ AGPL-3.0-only`);
  echecs += 1;
} else {
  console.log('  ok    atelier-pdf (AGPL-3.0-only)');
}

if (echecs > 0) {
  console.error(`Échec : ${echecs} licence(s) non conforme(s).`);
  process.exit(1);
} else {
  console.log('Toutes les licences sont conformes.');
}
