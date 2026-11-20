// engine/geom.js — v0.1.12 : géométrie des poignées, moteur PUR.
// Rectangles en points PDF [x0, y0, x1, y1] (y vers le haut). Aucune
// dépendance : partagé entre le rendu navigateur (globalThis.AtelierGeom)
// et les tests Node.

'use strict';

const MIN_L_PAR_DÉFAUT = 24; // largeur minimale d'une annotation redimensionnée
const MIN_H_PAR_DÉFAUT = 10; // hauteur minimale

/** Les huit poignées : coins d'abord (priorité au test de présence), puis
 * milieux des arêtes. Coefficients sur [x0..x1] × [y0..y1]. */
const POIGNEES = [
  ['no', 0, 1], ['ne', 1, 1], ['so', 0, 0], ['se', 1, 0],
  ['n', 0.5, 1], ['e', 1, 0.5], ['s', 0.5, 0], ['o', 0, 0.5],
];

/** Positions des poignées d'un rectangle, en points. */
function poigneesRect(rect) {
  const [x0, y0, x1, y1] = rect;
  return POIGNEES.map(([id, cx, cy]) => ({
    id,
    x: x0 + (x1 - x0) * cx,
    y: y0 + (y1 - y0) * cy,
  }));
}

/** Poignée dont la position est à tolérance du point, ou null.
 * Les coins sont testés d'abord : à distance égale ils gagnent. */
function poigneeSousPoint(rect, point, tolerance = 5) {
  if (!Array.isArray(rect) || !point || typeof point !== 'object') return null;
  const tol = Number(tolerance) || 0;
  for (const p of poigneesRect(rect)) {
    if (Math.abs(p.x - point.x) <= tol && Math.abs(p.y - point.y) <= tol) return p.id;
  }
  return null;
}

/** Rectangle après déplacement d'une poignée vers un point, SÉMANTIQUE
 * D'ANCRAGE : le coin (ou l'arête) opposé ne bouge jamais ; les côté(és)
 * portés par la poignée prend la coordonnée du point ; les minimums
 * minL × minH sont garantis par butée côté ancre. Retourne le rectangle
 * ordonné [min, min, max, max]. */
function rectDepuisPoignee(rect, id, point, { minL = MIN_L_PAR_DÉFAUT, minH = MIN_H_PAR_DÉFAUT } = {}) {
  if (!Array.isArray(rect) || rect.length !== 4) return rect ? rect.slice() : rect;
  if (!point || typeof point !== 'object') return rect.slice();
  const table = {
    no: { x0: true, y1: true }, ne: { x1: true, y1: true },
    so: { x0: true, y0: true }, se: { x1: true, y0: true },
    n: { y1: true }, s: { y0: true }, e: { x1: true }, o: { x0: true },
  };
  const cible = table[id];
  if (!cible) return rect.slice();
  const mL = Math.max(0.5, Number(minL) || MIN_L_PAR_DÉFAUT);
  const mH = Math.max(0.5, Number(minH) || MIN_H_PAR_DÉFAUT);
  let [x0, y0, x1, y1] = rect;
  if (cible.x1) x1 = Math.max(point.x, x0 + mL);
  if (cible.x0) x0 = Math.min(point.x, x1 - mL);
  if (cible.y1) y1 = Math.max(point.y, y0 + mH);
  if (cible.y0) y0 = Math.min(point.y, y1 - mH);
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { poigneesRect, poigneeSousPoint, rectDepuisPoignee };
} else {
  globalThis.AtelierGeom = { poigneesRect, poigneeSousPoint, rectDepuisPoignee };
}
