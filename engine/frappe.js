// engine/frappe.js — v0.1.44 : l'équation À LA FRAPPE, maquette validée.
// Alt puis S, 0, 0, Q ouvre une zone d'équation AU CURSEUR (croquis
// « Équations à la frappe, principe OneNote », validé par Arthur) dans
// le cadre d'écriture (note riche) et dans la ligne modifiée (correction).
// La barre d'espace MONTE la formule (transcodage UnicodeMath du
// v0.1.24 réutilisé tel quel) ; Échap ou Entrée POSE l'équation et
// efface la teinte. Aucun bouton, aucun panneau.
// MOTEUR PUR : la séquence clavier et les transformations du texte
// sont testables sans DOM (test/frappe.test.js) ; le rendu, les
// curseurs et la teinte restent dans renderer/app.js.
'use strict';

/** La séquence d'armement : Alt, puis S, 0, 0, Q. AZERTY oblige, les
 * chiffres exigent Maj : le tamis compare la VALEUR de la touche ('0'),
 * jamais sa position physique. Maj et Ctrl sont donc ignorés. */
const SÉQUENCE_FRAPPE = ['alt', 's', '0', '0', 'q'];

/** Filtre une frappe dans le tampon de séquence.
 * @param {string[]} tampon  l'état AVANT (['alt','s']…) ou [] si désarmé
 * @param {string}   touche  ev.key tel quel ('Alt', 's', 'Shift', '0'…
 * @returns {string[]} le tampon APRÈS ; ['alt'] réarme, une dérive
 *          s'insère dans le tampon (et casse la séquence au contrôle).
 */function tamisFrappe(tampon, touche) {
  const k = String(touche || '').toLowerCase();
  if (k === 'shift' || k === 'control' || k === '') return Array.isArray(tampon) ? tampon.slice() : [];
  if (k === 'alt') return ['alt'];
  const suivant = Array.isArray(tampon) ? tampon.slice() : [];
  // Désarmé : rien ne départ la séquence hors d'un premier Alt.
  if (!suivant.length || suivant[0] !== 'alt') return [];
  suivant.push(k);
  if (suivant.length > SÉQUENCE_FRAPPE.length) suivant.shift();
  return suivant;
}

/** La séquence est-elle COMPLÈTE et CONSÉCUTIVE dans ce tampon ?
 * (une touche parasite au milieu arme un tampon qui ne coïncide pas). */
function séquenceArmée(tampon) {
  if (!Array.isArray(tampon) || tampon.length !== SÉQUENCE_FRAPPE.length) return false;
  return SÉQUENCE_FRAPPE.every((v, i) => tampon[i] === v);
}

/** La touche correspond-elle au prochain cran attendu du tampon ?
 * Le rendu ne fait preventDefault QUE sur les crans qui avancent : la
 * séquence ne doit JAMAIS avaler la frappe ordinaire (AltGr d'un
 * clavier AZERTY, majuscules des chiffres). */
function cranSuivant(tampon, touche) {
  const k = String(touche || '').toLowerCase();
  if (!Array.isArray(tampon) || !tampon.length || tampon[0] !== 'alt') return false;
  if (tampon.length >= SÉQUENCE_FRAPPE.length) return false; // déjà complète
  return k === SÉQUENCE_FRAPPE[tampon.length];
}

/** Monte la zone de texte du CORRECTEUR (textarea de correction) :
 * le linéaire tapé depuis le '$' d'ouverture jusqu'au curseur est
 * transcodé en LaTeX ; le texte est REMPLACÉ par le résultat monté.
 * @param {string}   valeur     le contenu AVANT
 * @param {number}   debut      position du '$' d'ouverture
 * @param {number}   curseur    position du curseur (fin du linéaire)
 * @param {Function} transcoder (linéaire) → LaTeX (engine/unicodemath.js)
 * @returns {{valeur: string, curseur: number}} le contenu APRÈS
 */
function monterTexte(valeur, debut, curseur, transcoder) {
  const s = String(valeur ?? '');
  const d = Math.max(0, Math.min(debut + 1, s.length));
  const f = Math.max(d, Math.min(Number.isFinite(curseur) ? curseur : s.length, s.length));
  const linéaire = s.slice(d, f);
  let latex = linéaire;
  try {
    latex = transcoder(linéaire);
  } catch (e) {
    latex = linéaire; // moteur muet : la frappe reste, l'aperçu dira
  }
  return { valeur: s.slice(0, d) + latex + s.slice(f), curseur: d + latex.length };
}

/** Pose la zone du textarea : insère le '$' de fermeture au curseur ;
 * une zone VIDE est retirée tout entière (croquis : « l'équation vide
 * disparaît »).
 * @returns {{valeur: string, curseur: number, vide: boolean}}
 */
function poserTexte(valeur, debut, curseur) {
  const s = String(valeur ?? '');
  const d = Math.max(0, Math.min(debut, s.length));
  const f = Math.max(d, Math.min(Number.isFinite(curseur) ? curseur : s.length, s.length));
  const linéaire = s.slice(d + 1, f).trim();
  if (linéaire === '') {
    return { valeur: s.slice(0, d) + s.slice(f), curseur: d, vide: true };
  }
  return { valeur: s.slice(0, f) + '$' + s.slice(f), curseur: f + 1, vide: false };
}

/** Monte la zone du TEXTE RICHE : le contenu de la zone ouverte (le
 * texte du span teinté, sans le '$' d'ouverture) est transcodé ; la
 * fonction rend le NOUVEAU contenu texte de la zone (le '$' d'ouverture
 * repart à l'identique).
 * @returns {{contenu: string}} texte de la zone APRÈS montée, '$' exclu
 */
function monterRiche(contenu, transcoder) {
  const linéaire = String(contenu ?? '');
  let latex = linéaire;
  try {
    latex = transcoder(linéaire);
  } catch (e) {
    latex = linéaire;
  }
  return { contenu: latex };
}

/** Pose la zone du texte riche : rend le TEXTE final transcription
 * ($…$ fermé) prête à remplacer le span teinté ; une zone vide rend
 * '' (le rendu retirera le span tout entier).
 * @returns {{texte: string, vide: boolean}}
 */
function poserRiche(contenu) {
  const linéaire = String(contenu ?? '');
  if (linéaire.trim() === '') return { texte: '', vide: true };
  return { texte: `$${linéaire}$`, vide: false };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SÉQUENCE_FRAPPE, tamisFrappe, séquenceArmée, cranSuivant,
    monterTexte, poserTexte, monterRiche, poserRiche,
  };
} else {
  globalThis.AtelierFrappe = {
    SÉQUENCE_FRAPPE, tamisFrappe, séquenceArmée, cranSuivant,
    monterTexte, poserTexte, monterRiche, poserRiche,
  };
}
