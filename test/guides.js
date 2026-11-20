// Tâche 11 (v0.1.5) : fenêtres guidées « à la Dmaths » — composition LaTeX.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { GUIDES, composerSysteme } = require('../engine/guides.js');

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
  assert.strictEqual(keys.length, 7);
  for (const k of keys) {
    assert.strictEqual(typeof GUIDES[k].composer, 'function');
    assert.strictEqual(typeof GUIDES[k].titre, 'string');
  }
});
