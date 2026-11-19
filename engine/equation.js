// engine/equation.js — Tâche 6 : l'annotation équation.
// /Square à bordure invisible dont l'apparence /AP/N est le rendu vectoriel
// MathJax : déplaçable et imprimable par tout lecteur standard.
'use strict';

const { PDFName } = require('pdf-lib');
const { makeForm, addAnnot } = require('./annotcore.js');
const { mjRender } = require('./mjrender.js');

/**
 * Pose une équation LaTeX rendue en vecteurs.
 * @param {object} p
 * @param {string} p.latex      source LaTeX (voyage dans /Contents pour l'atelier)
 * @param {number} p.x          coin inférieur gauche, x en points
 * @param {number} p.y          coin inférieur gauche, y en points (origen en bas)
 * @param {number} [p.exPt=4.5] taille d'un « ex » en points
 * @returns {{ref: PDFRef, rect: number[]}}
 */
function addEquation(doc, page, { latex, x, y, exPt = 4.5, rgb, display = false }) {
  const r = mjRender(latex, exPt, { display, rgb });
  const rect = [x, y, x + r.widthPt, y + r.heightPt];
  const formRef = doc.context.register(makeForm(doc.context, {
    bbox: [0, 0, r.widthPt, r.heightPt],
    resources: { ProcSet: doc.context.obj([PDFName.of('PDF')]) },
    content: r.ops,
  }));
  const ref = addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: 'Square',
    Rect: rect,
    C: [0, 0, 0],
    BS: { W: 0 },
    AP: { N: formRef },
    Contents: `Équation LaTeX : ${latex}`,
  });
  return { ref, rect };
}

module.exports = { addEquation };
