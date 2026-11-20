// v0.1.10 : extraction du LaTeX embarqué dans une annotation équation.
// Le préfixe « Équation LaTeX » est le canon unique partagé par le tracé à
// l'écran et la correction au clic (le bug du cadre pointillé de la v0.1.6
// venait de deux lectures divergentes du même préfixe).
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { PREFIXE_EQUATION, extraireLatexEquation } = require('../engine/latex.js');

test('PREFIXE_EQUATION est le marqueur canonique', () => {
  assert.strictEqual(PREFIXE_EQUATION, 'Équation LaTeX');
});

test('extrait le LaTeX après le marqueur (espacement variable autour du deux-points)', () => {
  assert.strictEqual(extraireLatexEquation('Équation LaTeX : \\frac{2}{4}'), '\\frac{2}{4}');
  assert.strictEqual(extraireLatexEquation('Équation LaTeX : 2 + 2'), '2 + 2');
  assert.strictEqual(extraireLatexEquation('Équation LaTeX: x'), 'x');
  assert.strictEqual(extraireLatexEquation('Équation LaTeX:\\frac{1}{2}'), '\\frac{1}{2}');
});

test('returned vide hors du cadre équation, jamais de contenu parasite', () => {
  assert.strictEqual(extraireLatexEquation('Commentaire ordinaire'), '');
  assert.strictEqual(extraireLatexEquation(''), '');
  assert.strictEqual(extraireLatexEquation(undefined), '');
  assert.strictEqual(extraireLatexEquation(null), '');
  assert.strictEqual(extraireLatexEquation(42), '');
});

test('marqueur seul ou suivi de blancs : rien à tracer', () => {
  assert.strictEqual(extraireLatexEquation('Équation LaTeX'), '');
  assert.strictEqual(extraireLatexEquation('Équation LaTeX :   '), '');
});

test('un LaTeX qui COMMENCE par le marqueur reste entier (pas de coupure)', () => {
  // Cas limite : le contenu commence par le mot « Équation LaTeX » mais
  // n'est PAS une annotation équation… si le préfixe exact est là, on
  // extrait, sinon on ne touche à rien.
  assert.strictEqual(extraireLatexEquation('Équation LaTeX dans un texte'), '');
});
