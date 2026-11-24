// v0.1.44 : l'équation À LA FRAPPE — moteur pur de la séquence et des
// transformations de texte (engine/frappe.js), maquette validée
// (« Équations à la frappe, principe OneNote »). Le DOM, la teinte et
// les curseurs vivent dans renderer/app.js ; TOUT ce qui est décidable
// sans navigateur est prouvé ICI.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
require('../engine/unicodemath.js'); // expose globalThis.AtelierUniMath (v0.1.24)
const { transcoder } = globalThis.AtelierUniMath;

const {
  SÉQUENCE_FRAPPE, tamisFrappe, séquenceArmée, cranSuivant,
  monterTexte, poserTexte, monterRiche, poserRiche,
} = require('../engine/frappe.js');

/* Un transcodage DÉTERMINISTE pour les transformations (le vrai
 * transcoder UnicodeMath est prouvé par test/unicodemath.test.js ;
 * ici, monter « x^2 » doit remplacer le linéaire par le LaTeX rendu). */
const majuscules = (l) => l.toUpperCase();
const vraiTranscoder = (l) => transcoder(l);

test('la séquence est Alt puis S, 0, 0, Q (valeur de touche, jamais position)', () => {
  assert.deepStrictEqual(SÉQUENCE_FRAPPE, ['alt', 's', '0', '0', 'q']);
});

test("tamisFrappe : Alt arme, Maj est ignorée (AZERTY), la séquence complète s\u2019arme", () => {
  let t = [];
  t = tamisFrappe(t, 'Alt');
  assert.deepStrictEqual(t, ['alt'], 'Alt arme le tampon');
  t = tamisFrappe(t, 'Shift');
  assert.deepStrictEqual(t, ['alt'], 'Maj ne nourrit pas (les chiffres l\u2019exigent)');
  t = tamisFrappe(t, 's');
  assert.deepStrictEqual(t, ['alt', 's']);
  t = tamisFrappe(t, '0');
  t = tamisFrappe(t, '0');
  t = tamisFrappe(t, 'q');
  assert.deepStrictEqual(t, SÉQUENCE_FRAPPE, 'le tampon porte la séquence entière');
  assert.ok(séquenceArmée(t), 'la séquence est COMPLETE et CONSÉCUTIVE');
});

test('tamisFrappe : une touche parasite au milieu casse la séquence', () => {
  // AltGr d'un AZERTY : Alt, puis '~' — puis la frappe ordinaire continue.
  let t = tamisFrappe([], 'Alt');
  t = tamisFrappe(t, '~');
  t = tamisFrappe(t, 's');
  t = tamisFrappe(t, '0');
  t = tamisFrappe(t, '0');
  t = tamisFrappe(t, 'q');
  assert.strictEqual(séquenceArmée(t), false,
    '« alt ~ s 0 0 q » n\u2019ouvre RIEN : la séquence doit être consécutive');
});

test('tamisFrappe : désarmé, une simple touche ne réarme rien', () => {
  assert.deepStrictEqual(tamisFrappe([], 's'), []);
  assert.deepStrictEqual(tamisFrappe(['alt', 's'], 'x'), ['alt', 's', 'x']);
  assert.strictEqual(cranSuivant(['alt', 's'], '0'), true,
    'le cran suivant du tampon armé est connu (preventDefault ciblé)');
  assert.strictEqual(cranSuivant(['alt', 's'], 'z'), false,
    'une touche hors séquence n\u2019est JAMAIS interceptée');
});

test('monterTexte : le linéaire tapé dans la zone est REPLACÉ par son LaTeX', () => {
  const avant = 'Pour tout $\\sqrt(5&a^2)$ ...';
  const rep = monterTexte(avant, 10, 23, vraiTranscoder);
  assert.ok(rep.valeur.startsWith('Pour tout $'),
    'le texte AVANT la zone est intact');
  assert.ok(rep.valeur.includes('\\sqrt[5]{a^2}'),
    'la commande linéaire \\sqrt(5&a^2) est transcodée en LaTeX monté : '
    + JSON.stringify(rep.valeur));
  assert.ok(rep.curseur > 10 && rep.curseur <= rep.valeur.length,
    'le curseur suit la montée, DANS la zone');
});

test('monterTexte : transcodeur muet, la frappe reste telle quelle', () => {
  const casse = (l) => { throw new Error('moteur muet'); };
  const rep = monterTexte('a $x^2 b', 2, 6, casse);
  assert.strictEqual(rep.valeur, 'a $x^2 b', 'rien ne bouge quand le moteur échoue');
});

test('poserTexte : le $ de fermeture s\u2019inscrit au curseur ; zone vide retirée', () => {
  const rep = poserTexte('si $AC coupe', 3, 6);
  assert.strictEqual(rep.valeur, 'si $AC$ coupe');
  assert.strictEqual(rep.vide, false);
  assert.strictEqual(rep.curseur, 7, 'le curseur repart APRÈS le $ fermé');
  const vide = poserTexte('si $ coupe', 3, 4);
  assert.deepStrictEqual(
    { valeur: vide.valeur, vide: vide.vide },
    { valeur: 'si  coupe', vide: true },
    'l\u2019équation VIDE disparaît tout entière (croquis)',
  );
});

test('monterRiche / poserRiche : zone pleine et zone vide', () => {
  assert.deepStrictEqual(monterRiche('a/b', vraiTranscoder).contenu, '\\frac{a}{b}',
    'la montée riche rend le LaTeX, le $ d\u2019ouverture restant au span');
  assert.deepStrictEqual(poserRiche('x^2+1'), { texte: '$x^2+1$', vide: false },
    'la pose riche rend le $...$ FERMÉ, prêt à remplacer la teinte');
  assert.deepStrictEqual(poserRiche(''), { texte: '', vide: true });
  assert.deepStrictEqual(poserRiche('  '), { texte: '', vide: true },
    'une zone riche blanche est vide');
});
