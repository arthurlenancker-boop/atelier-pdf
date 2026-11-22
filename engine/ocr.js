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

/**
 * v0.1.23 : vérifie l'URL d'un serveur OCR personnel. La chaîne est
 * épurée (espaces, barres finales) puis doit être une URL http ou https
 * sans espace. Renvoie '' si la valeur n'est pas utilisable — le
 * réglage n'est alors pas enregistré.
 * @param {*} url
 * @returns {string}
 */
function nettoyerUrlServeur(url) {
  if (typeof url !== 'string') return '';
  const u = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/i.test(u)) return '';
  return u;
}

/**
 * v0.1.23 : lit le LaTeX de la réponse JSON d'un serveur OCR personnel.
 * - { latex: "…" } : la valeur TELLE QUELLE (le serveur a déjà extrait la
 *   formule, la repasser par extractionLatex la déformerait) ;
 * - { text: "…" } ou { markdown: "…" } : les formules y sont repérées
 *   par extractionLatex ($$…$$ puis $…$).
 * Renvoie null si la réponse ne contient aucune formule exploitable.
 * @param {*} contenu réponse JSON déjà analysée
 * @returns {string|null}
 */
function latexDepuisReponseServeur(contenu) {
  if (!contenu || typeof contenu !== 'object' || Array.isArray(contenu)) return null;
  if (typeof contenu.latex === 'string' && contenu.latex.trim()) {
    return contenu.latex.trim();
  }
  let source = null;
  if (typeof contenu.text === 'string' && contenu.text.trim()) source = contenu.text;
  else if (typeof contenu.markdown === 'string' && contenu.markdown.trim()) source = contenu.markdown;
  if (source === null) return null;
  return extractionLatex(source);
}

/**
 * v0.1.25 : compose l'en-tête d'autorisation d'un jeton de service.
 * Chaîne vide, nulle, non-chaîne ou blanches → {} (aucun en-tête :
 * un serveur sans jeton ignore l'en-tête, rétrocompatible) ; sinon
 * { "Authorization": "Bearer <jeton épuré>" }.
 * @param {*} jeton
 * @returns {{Authorization: string}|{}}
 */
function enteteJeton(jeton) {
  if (typeof jeton !== 'string') return {};
  const propre = jeton.trim();
  if (!propre) return {};
  return { 'Authorization': 'Bearer ' + propre };
}

/**
 * v0.1.25 : message français d'échec selon le statut HTTP du serveur
 * OCR personnel. 401 = refus de jeton (message distinct, l'utilisateur
 * doit comprendre que le serveur répond mais exige le jeton), 0 =
 * injoignable (délai, réseau), tout autre statut = erreur citée.
 * @param {number} statut
 * @returns {string}
 */
function messageErreurOcr(statut) {
  if (statut === 401) {
    return "Le serveur exige un jeton : jeton absent ou refusé. "
      + "Vérifiez le jeton dans Fichier → Options OCR LaTeX…";
  }
  if (!statut) {
    return "Le serveur OCR est injoignable (réseau ou délai dépassé).";
  }
  return "Le serveur OCR a répondu une erreur (code " + statut + ").";
}

/**
 * v0.1.26 : URL du endpoint /page d'un serveur OCR déjà enregistré.
 * Un suffixe « /ocr » devient « /page » ; une URL nue reçoit « /page » ;
 * une URL déjà en « /page » est renvoyée telle quelle (jamais doublée).
 * Renvoie '' si l'entrée n'est pas une URL http(s) utilisable.
 * @param {*} url
 * @returns {string}
 */
function pageUrlDepuis(url) {
  if (typeof url !== 'string') return '';
  const u = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/i.test(u)) return '';
  if (u.endsWith('/page')) return u;
  if (u.endsWith('/ocr')) return u.slice(0, -4) + '/page';
  return u + '/page';
}

/**
 * v0.1.26 : résumé lisible d'une page reconnue (POST /page du serveur),
 * affiché dans la carte des options OCR. Les lignes de texte se comptent
 * en LIGNES (pas en blocs) ; les types absents sont omis ; une page vide
 * ou tordue donne « aucun bloc » — jamais une exception.
 * @param {*} page contrat {largeur, hauteur, blocs} du serveur
 * @returns {string}
 */
function resumePage(page) {
  const blocs = [];
  if (page && typeof page === 'object' && Array.isArray(page.blocs)) {
    for (const bloc of page.blocs) {
      if (bloc && typeof bloc === 'object' && typeof bloc.type === 'string') {
        blocs.push(bloc);
      }
    }
  }
  if (!blocs.length) return 'Page reconnue : aucun bloc.';
  let titres = 0, lignes = 0, formules = 0, tableaux = 0, images = 0;
  for (const bloc of blocs) {
    if (bloc.type === 'titre') titres++;
    else if (bloc.type === 'texte') {
      lignes += Array.isArray(bloc.lignes) ? bloc.lignes.length : 0;
    } else if (bloc.type === 'formule') formules++;
    else if (bloc.type === 'tableau') tableaux++;
    else if (bloc.type === 'image') images++;
  }
  const pluriel = (n, singulier, formePluriel) =>
    n === 1 ? '1 ' + singulier : n + ' ' + formePluriel;
  const parties = [];
  if (titres) parties.push(pluriel(titres, 'titre', 'titres'));
  if (lignes) parties.push(pluriel(lignes, 'ligne de texte', 'lignes de texte'));
  if (formules) parties.push(pluriel(formules, 'formule', 'formules'));
  if (tableaux) parties.push(pluriel(tableaux, 'tableau', 'tableaux'));
  if (images) parties.push(pluriel(images, 'image', 'images'));
  if (!parties.length) {
    return 'Page reconnue : ' + blocs.length + (blocs.length === 1 ? ' bloc.' : ' blocs.');
  }
  return 'Page reconnue : ' + blocs.length + (blocs.length === 1 ? ' bloc (' : ' blocs (')
    + parties.join(', ') + ').';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    borner, nettoyerCle, motsDepuisBlocs, extractionLatex,
    nettoyerUrlServeur, latexDepuisReponseServeur,
    enteteJeton, messageErreurOcr,
    pageUrlDepuis, resumePage,
  };
} else {
  globalThis.AtelierOcr = {
    borner, nettoyerCle, motsDepuisBlocs, extractionLatex,
    nettoyerUrlServeur, latexDepuisReponseServeur,
    enteteJeton, messageErreurOcr,
    pageUrlDepuis, resumePage,
  };
}
