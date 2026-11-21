// engine/ocr.js — v0.1.22 : reconnaissance optique, partie PURE.
// Deux usages distincts, sans dépendance :
// - motsDepuisBlocs : au rendu, convertir les blocs de mots reconnus par
//   tesseract.js (boîtes en pixels d'image) en mots positionnés en FRACTIONS
//   de page ({ t, x, y, w, h } tous dans 0..1, origine en haut à gauche) —
//   indépendants du zoom, la couche de texte les recale à chaque rendu ;
// - extractionLatex : dans le processus principal, tirer les formules du
//   Markdown renvoyé par l'OCR Mistral ($$…$$ d'abord, puis $…$ inline).
// Double en-tête comme coords.js : CommonJS sous Node (tests, processus
// principal), globalThis.AtelierOcr dans le module du rendu.
'use strict';

/** Bornage sur l'intervalle [min, max]. */
function borner(v, min, max) {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/**
 * Vérifie une clé API candidate : une chaîne, débarrassée des espaces,
 * non vide. Renvoie '' si la valeur n'est pas utilisable.
 * @param {*} cle
 * @returns {string}
 */
function nettoyerCle(cle) {
  if (typeof cle !== 'string') return '';
  return cle.trim();
}

/**
 * Convertit la sortie « blocks » de tesseract.js (worker.recognize(image,
 * {}, { blocks: true }) → data.blocks[].paragraphs[].lines[].words[]) en
 * mots simplifiés, en fractions de page : bornage 0..1 (tesseract peut
 * laisser déborder d'un pixel), tri lecture (y, puis x).
 * @param {Array} blocks blocs tesseract (peut être null)
 * @param {number} largeur largeur de l'image reconnue, en pixels (> 0)
 * @param {number} hauteur hauteur de l'image, en pixels (> 0)
 * @returns {Array<{t: string, x: number, y: number, w: number, h: number}>}
 */
function motsDepuisBlocs(blocks, largeur, hauteur) {
  const mots = [];
  if (!Array.isArray(blocks)) return mots;
  const L = largeur > 0 ? largeur : 1;
  const H = hauteur > 0 ? hauteur : 1;
  for (const bloc of blocks) {
    for (const parag of (bloc.paragraphs || [])) {
      for (const ligne of (parag.lines || [])) {
        for (const mot of (ligne.words || [])) {
          const b = mot && mot.bbox;
          const texte = mot ? String(mot.text || '').trim() : '';
          if (!b || !texte) continue;
          mots.push({
            t: texte,
            x: borner(b.x0 / L, 0, 1),
            y: borner(b.y0 / H, 0, 1),
            w: borner((b.x1 - b.x0) / L, 0, 1),
            h: borner((b.y1 - b.y0) / H, 0, 1),
          });
        }
      }
    }
  }
  mots.sort((a, m) => (Math.abs(a.y - m.y) > 0.005 ? a.y - m.y : a.x - m.x));
  return mots;
}

/**
 * Extrait les formules LaTeX du Markdown renvoyé par l'OCR Mistral.
 * Les blocs $$…$$ d'abord (dans l'ordre), puis les $…$ inline appariés ;
 * une formule vide est ignorée. Renvoie null si le Markdown n'en
 * contient aucune, sinon une chaîne (les formules, séparées par \n ;
 * chacune SANS ses dollars, prête à coller dans le panneau Équation).
 * @param {string} markdown
 * @returns {string|null}
 */
function extractionLatex(markdown) {
  if (typeof markdown !== 'string') return null;
  const formules = [];
  // « \$ » est un dollar LITTÉRAL en Markdown : il n'ouvre ni ne ferme
  // une formule. On saute donc toute godille précédée d'une barre oblique
  // inverse.
  const indexGodille = (src, depuis) => {
    for (let i = depuis; ;) {
      const j = src.indexOf('$$', i);
      if (j === -1) return -1;
      if (j === 0 || src[j - 1] !== '\\') return j;
      i = j + 1;
    }
  };
  const indexSimple = (src, depuis) => {
    for (let i = depuis; ;) {
      const j = src.indexOf('$', i);
      if (j === -1) return -1;
      if (j === 0 || src[j - 1] !== '\\') return j;
      i = j + 1;
    }
  };
  const parcours = (src, taille, prochain) => {
    let i = 0;
    while (i < src.length) {
      const ouverture = prochain(src, i);
      if (ouverture === -1) break;
      const fermeture = prochain(src, ouverture + taille);
      if (fermeture === -1) break;
      const corps = src.slice(ouverture + taille, fermeture).trim();
      if (corps) formules.push(corps);
      i = fermeture + taille;
    }
  };
  parcours(markdown, 2, indexGodille);
  // Les $…$ inline ne doivent pas recoller les restes des $$…$$ déjà
  // cueillis : on retire d'abord les blocs $$…$$ du texte à parcourir.
  let restant = markdown;
  for (;;) {
    const debut = indexGodille(restant, 0);
    if (debut === -1) break;
    const fin = indexGodille(restant, debut + 2);
    if (fin === -1) break;
    restant = restant.slice(0, debut) + ' ' + restant.slice(fin + 2);
  }
  parcours(restant, 1, indexSimple);
  if (!formules.length) return null;
  return formules.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { borner, nettoyerCle, motsDepuisBlocs, extractionLatex };
} else {
  globalThis.AtelierOcr = { borner, nettoyerCle, motsDepuisBlocs, extractionLatex };
}
