// engine/coords.js — Tâche 8 : conversions écran -> page PDF.
// Sémantique identique à pdf.js : rotation = rotation d'affichage de la page
// en degrés horaires (0/90/180/270), origine de la page en bas à gauche,
// l'axe Y de l'écran vers le bas. Le canvas peut être décalé de (offsetX, offsetY)
// dans sa visionneuse : px/py sont mesurés depuis le coin supérieur gauche du canvas.
'use strict';

/**
 * Convertit un point du canvas en point utilisateur PDF.
 * @param {number} pxX abscisse écran (px, depuis la gauche du canvas)
 * @param {number} pxY ordonnée écran (px, depuis le haut du canvas)
 * @param {{scale: number, rotation: 0|90|180|270, pageW: number, pageH: number,
 *          offsetX?: number, offsetY?: number}} viewport
 * @returns {{x: number, y: number}}
 */
function deviceToPdf(pxX, pxY, viewport) {
  const { scale, rotation, pageW, pageH } = viewport;
  const offX = viewport.offsetX || 0;
  const offY = viewport.offsetY || 0;
  const u = (pxX - offX) / scale; // pixels -> unités page (axe non retourné)
  const v = (pxY - offY) / scale;
  switch (((rotation % 360) + 360) % 360) {
    case 0:
      return { x: u, y: pageH - v };
    case 90:
      // Page pivotée de 90° horaires : +x page vers le bas, +y page vers la droite.
      return { x: v, y: u };
    case 180:
      return { x: pageW - u, y: pageH - v };
    case 270:
      // Page pivotée de 270° horaires : +y page vers la gauche, +x page vers le haut.
      return { x: pageW - v, y: pageH - u };
    default:
      throw new Error(`Rotation non gérée : ${rotation}`);
  }
}

/**
 * Construit le quadrilatère de surlignage entre deux points page, ordonné
 * (haut-gauche, haut-droit, bas-gauche, bas-droit) quel que soit le sens du glissement.
 * Hauteur minimale de 2 points pour un glissement plat.
 * @returns {number[][]} un quad : [ [x1,y1, x2,y2, x3,y3, x4,y4] ]
 */
function quadPointsForRange(pointA, pointB) {
  const x0 = Math.min(pointA.x, pointB.x);
  const x1 = Math.max(pointA.x, pointB.x);
  const y0 = Math.min(pointA.y, pointB.y);
  const y1 = Math.max(pointA.y, pointB.y);
  const h = y1 - y0 < 2 ? 1 : (y1 - y0) / 2;
  const yc = (y0 + y1) / 2;
  return [[x0, yc + h, x1, yc + h, x0, yc - h, x1, yc - h]];
}

/**
 * Regroupe des fragments de sélection, déjà convertis en repère page,
 * en un quad par ligne de texte : les fragments qui partagent le même
 * yHaut appartiennent à la même ligne (mots séparés par un espace, par
 * exemple) et sont fusionnés — min des x0, max des x1. La sortie est
 * ordonnée de la ligne la plus haute vers la plus basse, chaque quad
 * étant [xTl, yTl, xTr, yTr, xBl, yBl, xBr, yBr], prêt pour QuadPoints.
 * @param {{x0: number, yHaut: number, x1: number, yBas: number}[]} fragments
 * @returns {number[][]}
 */
function quadsPourLignes(fragments) {
  const parLigne = new Map();
  for (const f of fragments) {
    const cle = f.yHaut;
    if (!parLigne.has(cle)) {
      parLigne.set(cle, { x0: f.x0, x1: f.x1, yHaut: f.yHaut, yBas: f.yBas });
    } else {
      const l = parLigne.get(cle);
      l.x0 = Math.min(l.x0, f.x0);
      l.x1 = Math.max(l.x1, f.x1);
      l.yBas = Math.min(l.yBas, f.yBas);
    }
  }
  const lignes = [...parLigne.values()]
    .sort((a, b) => b.yHaut - a.yHaut); // yHaut décroissant = haut de page d'abord
  return lignes.map((l) => [l.x0, l.yHaut, l.x1, l.yHaut, l.x0, l.yBas, l.x1, l.yBas]);
}

// Double en-tête : sous Node (tests, processus principal), CommonJS habituel ;
// dans le navigateur du processus de rendu (module ESM sans « module »),
// les fonctions sont exposées sur globalThis.AtelierCoords — le rendu emploie
// ainsi exactement le même code de conversion que les tests qui le garantissent.
// v0.1.4 : la version inconditionnelle de cette exportation (« module.exports »
// hors garde) tuait le module du rendu dès son import — « module is not
// defined » — et donc TOUTE l'interface (aucun bouton branché) depuis la
// v0.1.0. Seule la forme gardée doit exister.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { deviceToPdf, quadPointsForRange, quadsPourLignes };
} else {
  globalThis.AtelierCoords = { deviceToPdf, quadPointsForRange, quadsPourLignes };
}
