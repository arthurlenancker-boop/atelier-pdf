'use strict';

// test/unicodemath.test.js — v0.1.24 : le transcodeur UnicodeMath→LaTeX
// (engine/unicodemath.js, le « Linéaire » de OneNote) doit couvrir toutes
// les structures de la spécification UTN28 v3.3 ancrées ci-dessous.

const { test } = require('node:test');
const assert = require('node:assert');
const { transcoder } = require('../engine/unicodemath.js');

function t(entrée, attendu) {
  test(`« ${entrée} »`, () => {
    assert.strictEqual(transcoder(entrée), attendu);
  });
}

// Fractions (UTN28 §2.1)
t('a/b', '\\frac{a}{b}');
t('abc/d', '\\frac{abc}{d}');
t('(a+c)/d', '\\frac{a + c}{d}');
t('((a+c))/d', '\\frac{(a + c)}{d}');
t('a/(b+c)', '\\frac{a}{b + c}');
t('1/3.1416', '\\frac{1}{3.1416}');
t('a/b/c', '\\frac{\\frac{a}{b}}{c}');
t('1+a/b/c', '1 + \\frac{\\frac{a}{b}}{c}');

// Scripts (UTN28 §2.2)
t('a_1', 'a_1');
t('a^2', 'a^2');
t('a_1^2', 'a_1^2');
t('x_(i+1)', 'x_{i + 1}');
t('a_1 b_2', 'a_1b_2');
t('\\_a^b x', '{}_a^b x');

// Radicaux
t('√(x+1)', '\\sqrt{x + 1}');
t('√(5&a^2)', '\\sqrt[5]{a^2}');
t('\\sqrt(5&a^2)', '\\sqrt[5]{a^2}');
t('\\cbrt(x)', '\\sqrt[3]{x}');
t('\\qdrt(x)', '\\sqrt[4]{x}');
t('√x', '\\sqrt{x}');

// Opérateurs n-aires
t('∫_a^b xⅆx', '\\int_a^b x\\,\\mathrm{d}x');
t('∑_(k=0)^n a_k b^(n-k)', '\\sum_{k = 0}^n a_kb^{n - k}');
t('\\iint_(a=0)^\\infty a', '\\iint_{a = 0}^{\\infty} a');
t('∫_0^∞ xⅆx/(x^2+a^2)', '\\int_0^{\\infty} \\frac{x\\,\\mathrm{d}x}{x^2 + a^2}');
t('∏_i x_i', '\\prod_i x_i');

// Fonctions et limites
t('sin x', '\\sin x');
t('sin^2 x', '\\sin^2 x');
t('lim_(n->\\infty) n', '\\lim_{n \\to \\infty} n');
t('ln x', '\\ln x');

// Accents
t('(abc)\\vec', '\\vec{abc}');
t('x\\bar', '\\bar{x}');
t('\\hat(x)', '\\hat{x}');
t('\\overbar(abc)', '\\overline{abc}');
t('\\overbrace(a+b)', '\\overbrace{a + b}');

// Crochets et séparateurs
t('{a/b\\vbar x+y}', '\\left\\{\\frac{a}{b} \\middle\\vert x + y\\right\\}');
t('(a+b/c)', '\\left(a + \\frac{b}{c}\\right)');
t('|x|', '\\lvert x\\rvert');
t('\\norm(x)', '\\lVert x\\rVert');

// Empilements
t('(n¦k)', '\\left(\\genfrac{}{}{0pt}{}{n}{k}\\right)');
t('(n\\choose k)', '\\left(\\binom{n}{k}\\right)');

// Matrices
t('\\matrix(a&b@c&d)', '\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}');
t('(\\matrix(a&b@c&d))', '\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}');
t('[\\matrix(1&2)]', '\\begin{bmatrix}1 & 2\\end{bmatrix}');

// Tableaux d'équations
t('\\eqarray(x+1&=2@1+2+3+y&=z@3/x&=6)',
  '\\begin{aligned}x + 1&= 2\\\\1 + 2 + 3 + y&= z\\\\\\frac{3}{x}&= 6\\end{aligned}');

// Systèmes
t('{█(x+y@x-y)┤', '\\left\\{\\begin{matrix}x + y\\\\x - y\\end{matrix}\\right.');
t('█(&x"si"x≥0@−&x"si"x<0)',
  '\\begin{matrix}&x \\text{si} x \\geq 0\\\\&-x \\text{si} x < 0\\end{matrix}');
t('Ⓒ(&x"si"x≥0@−&x"si"x<0)',
  '\\begin{cases}&x \\text{si} x \\geq 0\\\\&-x \\text{si} x < 0\\end{cases}');

// Relations et négations
t('a/=b', 'a \\neq b');
t('x<=y', 'x \\leq y');
t('x>=y', 'x \\geq y');
t('x→∞', 'x \\to \\infty');

// Enceintes
t('\\abs(x)', '\\lvert x\\rvert');
t('\\rect(a/b)', '\\boxed{\\frac{a}{b}}');

// Mots-clés et divers
t('\\alpha+\\beta', '\\alpha + \\beta');
t('a×b', 'a \\times b');
t('xⅆx', 'x\\,\\mathrm{d}x');
t('\\dd', '\\mathrm{d}');

// Équation complète
t('(a+b)^n=∑_(k=0)^n (n\\choose k) a^k b^(n-k)',
  '(a + b)^n = \\sum_{k = 0}^n \\left(\\binom{n}{k}\\right) a^kb^{n - k}')
;
