// engine/latex.js — v0.1.10 : lecture du LaTeX embarqué (pur, testé Node).
'use strict';

const PREFIXE_EQUATION = 'Équation LaTeX';
const MARQUEUR_EQUATION = /^Équation LaTeX\s*:\s*/;

/** Relit le LaTeX embarqué dans le /Contents d'une annotation équation.
 * Format canonique écrit par engine/equation.js : « Équation LaTeX : … ».
 * Le deux-points est exigé : un contenu qui commence par le marqueur sans
 * séparateur (une phrase d'utilisateur) n'est pas une équation posée. */
function extraireLatexEquation(contenu) {
  if (typeof contenu !== 'string') return '';
  const m = contenu.match(MARQUEUR_EQUATION);
  if (!m) return '';
  return contenu.slice(m[0].length).trim();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PREFIXE_EQUATION, extraireLatexEquation };
} else {
  globalThis.AtelierLatex = { PREFIXE_EQUATION, extraireLatexEquation };
}
