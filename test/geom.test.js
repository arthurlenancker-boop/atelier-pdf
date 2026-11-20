// v0.1.12 : moteur PUR des poignées — déplacer et redimensionner les
// annotations. Aucune dépendance : testé sous Node sans pdf-lib.
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { poigneesRect, poigneeSousPoint, rectDepuisPoignee } = require('../engine/geom.js');

const RECT = [0, 0, 100, 50]; // [x0, y0, x1, y1] en points, y vers le haut

test('poigneesRect : huit poignées, coins et milieux, en points', () => {
  const ps = poigneesRect(RECT);
  assert.strictEqual(ps.length, 8);
  const parId = Object.fromEntries(ps.map((p) => [p.id, p]));
  assert.deepStrictEqual(parId.no, { id: 'no', x: 0, y: 50 });
  assert.deepStrictEqual(parId.n, { id: 'n', x: 50, y: 50 });
  assert.deepStrictEqual(parId.ne, { id: 'ne', x: 100, y: 50 });
  assert.deepStrictEqual(parId.e, { id: 'e', x: 100, y: 25 });
  assert.deepStrictEqual(parId.se, { id: 'se', x: 100, y: 0 });
  assert.deepStrictEqual(parId.s, { id: 's', x: 50, y: 0 });
  assert.deepStrictEqual(parId.so, { id: 'so', x: 0, y: 0 });
  assert.deepStrictEqual(parId.o, { id: 'o', x: 0, y: 25 });
});

test('poigneeSousPoint : trouve la poignée à tolerance près, sinon null', () => {
  assert.strictEqual(poigneeSousPoint(RECT, { x: 101, y: -1 }, 2), 'se');
  assert.strictEqual(poigneeSousPoint(RECT, { x: 100, y: 50 }, 3), 'ne');
  assert.strictEqual(poigneeSousPoint(RECT, { x: 50, y: 48 }, 3), 'n');
  assert.strictEqual(poigneeSousPoint(RECT, { x: 12, y: 25 }, 2), null);
  // Le coin gagne sur le milieu quand les deux sont à portée.
  assert.strictEqual(poigneeSousPoint([0, 0, 4, 4], { x: 3, y: 1 }, 2), 'se');
});

test('rectDepuisPoignee : coin sud-est, ancrage nord-ouest conservé', () => {
  assert.deepStrictEqual(rectDepuisPoignee(RECT, 'se', { x: 150, y: -20 }), [0, -20, 150, 50]);
});

test('rectDepuisPoignee : coin nord-ouest, ancrage sud-est conservé', () => {
  assert.deepStrictEqual(rectDepuisPoignee(RECT, 'no', { x: 30, y: 80 }), [30, 0, 100, 80]);
});

test('rectDepuisPoignee : arêtes — une seule dimension bouge', () => {
  assert.deepStrictEqual(rectDepuisPoignee(RECT, 'e', { x: 130, y: 25 }), [0, 0, 130, 50]);
  assert.deepStrictEqual(rectDepuisPoignee(RECT, 'n', { x: 50, y: 70 }), [0, 0, 100, 70]);
  assert.deepStrictEqual(rectDepuisPoignee(RECT, 'o', { x: -30, y: 25 }), [-30, 0, 100, 50]);
  assert.deepStrictEqual(rectDepuisPoignee(RECT, 's', { x: 50, y: -30 }), [0, -30, 100, 50]);
});

test('rectDepuisPoignee : minimums garantis, le coin opposé ne bouge jamais', () => {
  // 'se' tiré vers l'ancre nord-ouest (0,50) : les deux butées s'engagent.
  assert.deepStrictEqual(rectDepuisPoignee(RECT, 'se', { x: 10, y: 48 }), [0, 40, 24, 50]);
  // 'no' tiré au-delà de l'ancre sud-est (100,0) : idem, ancre fixe.
  assert.deepStrictEqual(rectDepuisPoignee(RECT, 'no', { x: 130, y: 80 }), [76, 0, 100, 80]);
  // Minimums personnalisés.
  assert.deepStrictEqual(rectDepuisPoignee(RECT, 'se', { x: 4, y: 47 }, { minL: 8, minH: 6 }), [0, 44, 8, 50]);
});

test('rectDepuisPoignee : poignée inconnue ou point manquant = rect inchangé', () => {
  assert.deepStrictEqual(rectDepuisPoignee(RECT, 'zz', { x: 9, y: 9 }), RECT);
  assert.deepStrictEqual(rectDepuisPoignee(RECT, 'se', null), RECT);
});
