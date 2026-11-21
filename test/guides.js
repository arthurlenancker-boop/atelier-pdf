// Tâche 11 (v0.1.5) : fenêtres guidées « à la Dmaths » — composition LaTeX.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { GUIDES, composerSysteme, composerMatrice } = require('../engine/guides.js');

const ok = (r) => { assert.ok(r.latex, JSON.stringify(r)); return r.latex; };

test('quotient : composition et refus des champs vides', () => {
  const g = GUIDES.quotient;
  assert.strictEqual(ok(g.composer({ num: 'a + b', den: '2c' })), '\\frac{a + b}{2c}');
  assert.strictEqual(ok(g.composer({ num: ' 1 ', den: ' x ' })), '\\frac{1}{x}');
  assert.match(g.composer({ num: '', den: 'x' }).erreur, /numérateur/i);
  assert.match(g.composer({ num: 'x', den: '' }).erreur, /numérateur/i);
});

test('racine : avec et sans index', () => {
  const g = GUIDES.racine;
  assert.strictEqual(ok(g.composer({ radicande: 'b^2 - 4ac' })), '\\sqrt{b^2 - 4ac}');
  assert.strictEqual(ok(g.composer({ index: 'n', radicande: 'x' })), '\\sqrt[n]{x}');
  assert.match(g.composer({ radicande: '' }).erreur, /radicande/i);
});

test('limite : symbole seul quand l\u2019expression manque', () => {
  const g = GUIDES.limite;
  assert.strictEqual(ok(g.composer({ variable: 'x', but: '0', expression: 'f(x)' })),
    '\\lim\\limits_{x \\to 0} f(x)');
  assert.ok(ok(g.composer({ but: '+\\infty' })).startsWith('\\lim\\limits_{x \\to +\\infty}'));
  assert.match(g.composer({ but: '' }).erreur, /approche/i);
});

test('borne : intégrale, somme et produit, bornes optionnelles', () => {
  const g = GUIDES.borne;
  assert.strictEqual(ok(g.composer({ variable: 'x', de: '0', a: '1', expr: 'x^2' }, 'int')),
    '\\int_{0}^{1} x^2 \\, dx');
  assert.strictEqual(ok(g.composer({ expr: 'f(x)' }, 'int')), '\\int f(x) \\, dk');
  assert.strictEqual(ok(g.composer({ variable: 'k', de: '1', a: 'n', expr: 'k' }, 'somme')),
    '\\sum_{k=1}^{n} k');
  assert.strictEqual(ok(g.composer({ de: '1', a: 'n', expr: 'k' }, 'prod')),
    '\\prod_{k=1}^{n} k');
  // Somme sans borne supérieure : l'indice seul.
  assert.strictEqual(ok(g.composer({ expr: 'k' }, 'somme')), '\\sum_{k} k');
});

test('vecteur : nom seul, coordonnées, coefficient et norme', () => {
  const g = GUIDES.vecteur;
  assert.strictEqual(ok(g.composer({ nom: 'u' }, null, {})), '\\vec{u}');
  assert.strictEqual(ok(g.composer({ coeff: '2', nom: 'u' }, null, {})), '2\\vec{u}');
  // Coordonnées verticales (choix Dmaths par défaut) : colonne matricielle.
  assert.strictEqual(ok(g.composer({ x: '3', y: '-1' }, null, { verticale: true })),
    '\\left(\\begin{matrix}3 \\\\ -1\\end{matrix}\\right)');
  // Coordonnées en ligne : « (3 ; -1) ».
  assert.strictEqual(ok(g.composer({ x: '3', y: '-1' }, null, { verticale: false })),
    '\\left(3 ;\\, -1\\right)');
  assert.match(ok(g.composer({ nom: 'u' }, null, { norme: true })), /\\left\\| \\vec\{u\} \\right\|/);
  assert.match(g.composer({ nom: '', x: '', y: '', z: '' }, null, {}).erreur, /nom|coordonnées/i);
});

test('angle : les trois variantes de produits et l\u2019angle orienté', () => {
  const g = GUIDES.angle;
  assert.strictEqual(ok(g.composer({ nom1: 'u', nom2: 'v' }, 'angle')),
    '\\left( \\vec{u} ;\\, \\vec{v} \\right)');
  assert.strictEqual(ok(g.composer({ coeff1: '2', nom1: 'u', nom2: 'v' }, 'scalaire')),
    '2\\vec{u} \\cdot \\vec{v}');
  assert.strictEqual(ok(g.composer({ nom1: 'u', coeff2: '-1', nom2: 'v' }, 'vectoriel')),
    '\\vec{u} \\wedge -1\\vec{v}');
  assert.match(g.composer({ nom1: 'u', nom2: '' }, 'angle').erreur, /deux noms/i);
});

test('mesure : mesure algébrique et angle géométrique, coefficient', () => {
  const g = GUIDES.mesure;
  assert.strictEqual(ok(g.composer({ nom: 'AB' }, 'mesure')), '\\overline{AB}');
  assert.strictEqual(ok(g.composer({ nom: 'ABC' }, 'angle')), '\\widehat{ABC}');
  assert.strictEqual(ok(g.composer({ coeff: 'k', nom: 'AB' }, 'mesure')), 'k \\, \\overline{AB}');
  assert.match(g.composer({ nom: '' }, 'mesure').erreur, /nom/i);
});

test('système : une seule ligne sans matrice, plusieurs lignes entre accolades', () => {
  assert.strictEqual(ok(composerSysteme([{ gauche: '2x + 3', symbole: '=', droite: '5' }])),
    '2x + 3 = 5');
  assert.strictEqual(ok(composerSysteme([
    { gauche: '2x + 3', symbole: '=', droite: '5' },
    { gauche: 'x - y', symbole: '\\leq', droite: '1' },
  ])), '\\left\\{\\begin{matrix}2x + 3 = 5 \\\\ x - y \\leq 1\\end{matrix}\\right.');
  // Symbole absent : « = » par défaut ; lignes vides ignorées.
  assert.strictEqual(ok(composerSysteme([
    { gauche: '', symbole: '', droite: '' },
    { gauche: 'x' , symbole: '', droite: '2' },
  ])), 'x = 2');
  assert.match(composerSysteme([]).erreur, /au moins une/i);
});

test('dérivée : une, deux puis n apostrophes, évaluée ou non (v0.1.9)', () => {
  const g = GUIDES.derivee;
  assert.strictEqual(ok(g.composer({ nom: 'f', ordre: '1' })), "f'");
  assert.strictEqual(ok(g.composer({ ordre: '2', en: 'a' })), "f''\\left(a\\right)");
  assert.strictEqual(ok(g.composer({ ordre: '5' })), 'f^{(5)}');
  assert.strictEqual(ok(g.composer({ nom: 'g', ordre: '' })), "g'");
});

test('primitive : intégrale sans bornes (v0.1.9)', () => {
  const g = GUIDES.primitive;
  assert.strictEqual(ok(g.composer({ expr: 'f(x)', variable: 't' })), '\\int f(x) \\, dt');
  assert.strictEqual(ok(g.composer({ expr: 'x^2' })), '\\int x^2 \\, dx');
  assert.match(g.composer({ expr: '' }).erreur, /fonction/i);
});

test('binôme : k parmi n (v0.1.9)', () => {
  const g = GUIDES.binome;
  assert.strictEqual(ok(g.composer({ n: 'n', k: 'k' })), '\\binom{n}{k}');
  assert.strictEqual(ok(g.composer({ n: '5', k: '2' })), '\\binom{5}{2}');
  assert.match(g.composer({ n: '5', k: '' }).erreur, /deux nombres/i);
});

test('matrice : composition et bornes des dimensions (v0.1.9)', () => {
  const m = composerMatrice({ lignes: '2', colonnes: '3', c11: '1', c12: '0', c13: '-2', c21: 'a', c22: 'b', c23: 'c' });
  assert.strictEqual(ok(m), '\\begin{pmatrix}1 & 0 & -2 \\\\ a & b & c\\end{pmatrix}');
  assert.strictEqual(m.dims.lignes, 2);
  assert.strictEqual(m.dims.colonnes, 3);
  // Dimensions absentes : 2 par défaut ; hors bornes : ramenées dans [1 ; 3].
  assert.strictEqual(composerMatrice({}).dims.lignes, 2);
  assert.strictEqual(composerMatrice({ lignes: '9', colonnes: '0' }).dims.colonnes, 1);
  // v0.1.24 : matrices étendues, jusqu'à 6 lignes et colonnes (parité
  // OneNote du ruban) ; au-delà, ramenées dans [1 ; 6].
  const grande = composerMatrice({ lignes: '4', colonnes: '2', c11: 'a', c12: 'b', c41: 'c', c42: 'd' });
  assert.strictEqual(ok(grande), '\\begin{pmatrix}a & b \\\\  &  \\\\  &  \\\\ c & d\\end{pmatrix}');
  assert.strictEqual(grande.dims.lignes, 4);
  assert.strictEqual(composerMatrice({ lignes: '9' }).dims.lignes, 6);
  // Gabarit déclaratif branché sur la même fonction.
  assert.strictEqual(ok(GUIDES.matrice.composer({ lignes: '1', colonnes: '1', c11: '7' })),
    '\\begin{pmatrix}7\\end{pmatrix}');
  // Case vide : matrice squelette conservée.
  assert.match(ok(composerMatrice({ lignes: '2', colonnes: '2' })), /^\\begin\{pmatrix\} &  \\\\  & \\end\{pmatrix\}$/);
});

test('intervalle : les quatre types de crochets (v0.1.9)', () => {
  const g = GUIDES.intervalle;
  assert.strictEqual(ok(g.composer({ gauche: '0', droite: '1' }, 'ff')), '\\left[0 \\, ;\\, 1\\right]');
  assert.strictEqual(ok(g.composer({ gauche: 'a', droite: 'b' }, 'oo')), '\\left]a \\, ;\\, b\\right[');
  assert.strictEqual(ok(g.composer({ gauche: 'a', droite: 'b' }, 'fo')), '\\left[a \\, ;\\, b\\right[');
  assert.strictEqual(ok(g.composer({ gauche: 'a', droite: 'b' }, 'of')), '\\left]a \\, ;\\, b\\right]');
  assert.match(g.composer({ gauche: '0', droite: '' }, 'ff').erreur, /bornes/i);
});

test('ensemble : appartenance, inclusion, ensemble en compréhension (v0.1.9)', () => {
  const g = GUIDES.ensemble;
  assert.strictEqual(ok(g.composer({ element: 'x', ens: '\\mathbb{R}' }, 'in')), 'x \\in \\mathbb{R}');
  assert.strictEqual(ok(g.composer({ element: 'A', ens: '\\mathbb{R}' }, 'subset')), 'A \\subset \\mathbb{R}');
  assert.strictEqual(ok(g.composer({ ens: '\\mathbb{N}' })), '\\mathbb{N}');
  assert.strictEqual(ok(g.composer({ element: 'x', ens: '\\mathbb{R}', cond: 'x > 1' }, 'in')),
    '\\left\\{ x \\in \\mathbb{R} \\,\\middle|\\, x > 1 \\right\\}');
  // Condition sans élément : x par défaut.
  assert.match(ok(g.composer({ ens: '\\mathbb{R}', cond: 't < 5' })), /\\middle\|\\, t < 5/);
  assert.match(g.composer({ ens: '' }).erreur, /ensemble/i);
});

test('complexe : formes algébrique, exponentielle, trigonométrique (v0.1.9)', () => {
  const g = GUIDES.complexe;
  assert.strictEqual(ok(g.composer({ nom: 'z', re: 'a', im: 'b' }, 'alg')), 'z = a + \\mathrm{i}b');
  assert.strictEqual(ok(g.composer({ re: '3', im: '' }, 'alg')), 'z = 3');
  assert.strictEqual(ok(g.composer({ im: '-2' }, 'alg')), 'z = \\mathrm{i}-2');
  assert.strictEqual(ok(g.composer({ module: 'r', argument: '\\theta' }, 'expo')),
    'z = r\\,\\mathrm{e}^{\\mathrm{i}\\theta}');
  assert.strictEqual(ok(g.composer({ module: '2', argument: '\\frac{\\pi}{4}' }, 'trig')),
    'z = 2\\left(\\cos \\frac{\\pi}{4} + \\mathrm{i}\\,\\sin \\frac{\\pi}{4}\\right)');
  assert.match(g.composer({ re: '', im: '' }, 'alg').erreur, /réelle|imaginaire/i);
  assert.match(g.composer({ module: '2', argument: '' }, 'expo').erreur, /module|argument/i);
});

test('pourcentage : symbole et fraction sur 100 (v0.1.9)', () => {
  const g = GUIDES.pourcentage;
  assert.strictEqual(ok(g.composer({ valeur: '15' }, 'symbole')), '15\\,\\%');
  assert.strictEqual(ok(g.composer({ valeur: 't' }, 'fraction')), '\\frac{t}{100}');
  assert.match(g.composer({ valeur: '' }, 'symbole').erreur, /valeur/i);
});

test('module exporté en CommonJS sans référence nue à « module »', () => {
  // Leçon v0.1.4 : dans le rendu (ESM), « module » n'existe pas. Toute
  // référence doit rester sous garde typeof. On vérifie ici que le fichier
  // source ne contient l'exportation que sous sa forme gardée.
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'engine', 'guides.js'), 'utf8');
  assert.ok(source.includes("typeof module !== 'undefined'"), 'garde typeof présente');
  const guardes = source.match(/^module\./gm) || [];
  assert.strictEqual(guardes.length, 0, 'aucune exportation inconditionnelle en tête de ligne');
  const keys = Object.keys(GUIDES);
  assert.strictEqual(keys.length, 15); // v0.1.9 : 7 + 8 nouveaux gabarits
  for (const k of keys) {
    assert.strictEqual(typeof GUIDES[k].composer, 'function');
    assert.strictEqual(typeof GUIDES[k].titre, 'string');
  }
});
