// v0.1.31 : conversions de couleurs (engine/couleurs.js).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { hexVersRgb, rgbVersHex, hexVersRgb01, rgb01VersHex, hsvVersRgb }
  = require('../engine/couleurs.js');

test('hexVersRgb lit les couleurs à six et trois chiffres', () => {
  assert.deepStrictEqual(hexVersRgb('#FFDF3A'), [255, 223, 58]);
  assert.deepStrictEqual(hexVersRgb('#f0a'), [255, 0, 170]);
  assert.strictEqual(hexVersRgb('FFDF3A'), null, 'le dièse est obligatoire');
  assert.strictEqual(hexVersRgb('#12G45'), null, 'lettres hors hexa refusées');
  assert.strictEqual(hexVersRgb('#12345'), null, 'cinq chiffres refusés');
});

test('rgbVersHex compose la forme canonique', () => {
  assert.strictEqual(rgbVersHex([255, 223, 58]), '#ffdf3a');
  assert.strictEqual(rgbVersHex([0, 0, 0]), '#000000');
  assert.strictEqual(rgbVersHex(null), '#000000', 'absence : noir franc');
  assert.strictEqual(rgbVersHex([300, -4, 58]), '#ff003a', 'composants bornés');
});

test('hex et fractions PDF font l' + 'aller-retour', () => {
  assert.deepStrictEqual(hexVersRgb01('#000000'), [0, 0, 0]);
  const c = hexVersRgb01('#0067C0');
  assert.ok(Math.abs(c[0] - 0) < 1e-9);
  assert.ok(Math.abs(c[1] - 0x67 / 255) < 1e-9);
  assert.ok(Math.abs(c[2] - 0xC0 / 255) < 1e-9);
  assert.strictEqual(rgb01VersHex(c), '#0067c0');
  assert.strictEqual(hexVersRgb01('pas une couleur'), null);
  assert.strictEqual(rgb01VersHex(undefined), null);
});

test('hsvVersRgb couvre la roue validée', () => {
  // Rouge de la maquette : h=0, s=0.85, v=0.9 -> #E61515 environ.
  assert.deepStrictEqual(hsvVersRgb(0, 0.85, 0.9), [230, 34, 34]);
  // Jaune : h=60, pleine saturation et valeur.
  assert.deepStrictEqual(hsvVersRgb(60, 1, 1), [255, 255, 0]);
  // Blanc au centre : saturation nulle.
  assert.deepStrictEqual(hsvVersRgb(210, 0, 1), [255, 255, 255]);
  // Les angles négatifs et au-delà de 360 tournent sur la roue.
  assert.deepStrictEqual(hsvVersRgb(-360, 1, 1), [255, 0, 0]);
  assert.deepStrictEqual(hsvVersRgb(420, 1, 1), [255, 255, 0]);
  // Saturation et valeur bornées.
  assert.deepStrictEqual(hsvVersRgb(300, 2, 2), hsvVersRgb(300, 1, 1));
});
