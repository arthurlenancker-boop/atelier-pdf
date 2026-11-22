// engine/surlignage.js — v0.1.35 : sélection des surlignages d'une page.
// Moteur PUR, aucune dépendance (testable sous Node sans pdf-lib) :
// l'outil « Ôter tous les surlignages de la page » s'appuie sur la même
// définition du surlignage que le calque d'affichage — les quatre
// formes prévues par la norme PDF (plein /Highlight, souligné
// /Underline, barré /StrikeOut, ondulé /Squiggly), et rien d'autre.
'use strict';

const SORTES_SURLIGNAGE = ['Highlight', 'Underline', 'Squiggly', 'StrikeOut'];

/** true si l'entrée du résumé (engine/reread.js) décrit une des quatre
 *  formes de surlignage. Toute autre annotation (cadre, encre, note,
 *  fiche, lien…) est refusée. */
function estSurlignage(a) {
  return !!(a && SORTES_SURLIGNAGE.includes(a.subtype));
}

/** Entrées du résumé des surlignages portés par la page pageIndex
 *  (0 par défaut), dans l'ordre de lecture du résumé. Renvoie [] quand
 *  la page n'en porte aucun ou que le résumé est absent : l'appelant
 *  n'a jamais à distinguer « rien » d'« illisible ». */
function selectionSurlignagesPage(annots, pageIndex = 0) {
  if (!Array.isArray(annots)) return [];
  return annots.filter((a) => a && a.page === pageIndex && estSurlignage(a));
}

// Même modèle d'export que engine/couleurs.js : module Node pour les
// tests, globalThis pour le processus de rendu (import ESM sans bundler).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SORTES_SURLIGNAGE, estSurlignage, selectionSurlignagesPage };
} else {
  globalThis.AtelierSurlignage = { SORTES_SURLIGNAGE, estSurlignage, selectionSurlignagesPage };
}
