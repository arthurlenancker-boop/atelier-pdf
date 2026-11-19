// Tâche 8 : conversions écran -> page PDF.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { deviceToPdf, quadPointsForRange } = require('../engine/coords.js');

const V0 = { scale: 1, rotation: 0, pageW: 595.28, pageH: 841.89 };

test('rot 0 : l\'axe Y écran vers le bas devient Y page vers le haut', () => {
  const p = deviceToPdf(100, 141.89, V0);
  assert.deepStrictEqual(p, { x: 100, y: 700 });
  // Coin haut-gauche du canvas = coin haut de la page.
  const coin = deviceToPdf(0, 0, V0);
  assert.deepStrictEqual(coin, { x: 0, y: 841.89 });
});

test('rot 90 : le canvas est tourné (w = pageH, h = pageW)', () => {
  const vp = { ...V0, rotation: 90 };
  const p = deviceToPdf(120, 130, vp);
  assert.deepStrictEqual(p, { x: 130, y: 120 }, 'x=v, y=u');
  // Les deux coins du canvas : contrôle croisé.
  assert.deepStrictEqual(deviceToPdf(0, 0, vp), { x: 0, y: 0 });
  assert.deepStrictEqual(deviceToPdf(841.89, 595.28, vp), { x: 595.28, y: 841.89 });
});

test('rot 180 : miroir sur les deux axes', () => {
  const vp = { ...V0, rotation: 180 };
  assert.deepStrictEqual(deviceToPdf(100, 41.89, vp), { x: 495.28, y: 800 });
  assert.deepStrictEqual(deviceToPdf(0, 0, vp), { x: 595.28, y: 841.89 });
});

test('rot 270 : le second sens de rotation, contrôle des deux coins', () => {
  const vp = { ...V0, rotation: 270 };
  assert.deepStrictEqual(deviceToPdf(120, 130, vp),
    { x: 595.28 - 130, y: 841.89 - 120 }, 'x=pageW-v, y=pageH-u');
  // Contrôles croisés des coins : le coin haut-gauche du canvas est le coin
  // haut-droit de la page (feuille pivotée de 90° antihoraires).
  assert.deepStrictEqual(deviceToPdf(0, 0, vp), { x: 595.28, y: 841.89 });
  // c270b : le coin bas-gauche du canvas retombe sur le coin haut-gauche page.
  const c270b = deviceToPdf(0, 595.28, vp);
  assert.deepStrictEqual(c270b, { x: 0, y: 841.89 });
  // Le coin bas-droit du canvas est l'origine page.
  assert.deepStrictEqual(deviceToPdf(841.89, 595.28, vp), { x: 0, y: 0 });
});

test('les décalages et l\'échelle s\'appliquent avant la rotation', () => {
  const vp = { scale: 2, rotation: 0, pageW: 595.28, pageH: 841.89, offsetX: 10, offsetY: 20 };
  const p = deviceToPdf(210, 303.78, vp);
  assert.deepStrictEqual(p, { x: 100, y: 700 });
});

test('quadPointsForRange ordonne [ul, ur, ll, lr] avec hauteur minimale', () => {
  const q = quadPointsForRange({ x: 100, y: 720 }, { x: 200, y: 700 })[0];
  assert.deepStrictEqual([q[0], q[1]], [100, 720], 'haut-gauche');
  assert.deepStrictEqual([q[2], q[3]], [200, 720], 'haut-droit');
  assert.deepStrictEqual([q[4], q[5]], [100, 700], 'bas-gauche');
  assert.deepStrictEqual([q[6], q[7]], [200, 700], 'bas-droit');
  // Glissement plat : hauteur forcée à 2 points au total.
  const plat = quadPointsForRange({ x: 100, y: 700 }, { x: 200, y: 700 })[0];
  assert.strictEqual(plat[1] - plat[5], 2, 'écart de 2 points');
  // Sens inversé du glissement : résultat identique.
  const inv = quadPointsForRange({ x: 200, y: 700 }, { x: 100, y: 720 })[0];
  assert.deepStrictEqual(inv, q);
  assert.throws(() => deviceToPdf(0, 0, { ...V0, rotation: 45 }),
    /Rotation non gérée/, 'seules 0/90/180/270 sont admises');
});
