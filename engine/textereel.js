// engine/textereel.js — v0.1.38 : le VRAI texte d'une page, lu pour la
// correction en place. Sur une page à texte réel (née sous Word, LibreOffice,
// PowerPoint…), pdf.js donne les fragments de texte avec leur taille et
// leur famille : la correction peut alors REPRENDRE l'apparence du document
// au lieu de réécrire le bloc en Helvetica à une taille estimée (retour
// d'Arthur : le texte modifié change de police et forme un amas de texte).
// Moteur PUR : aucune dépendance, testé sous Node ; le rendu passe les
// items de pdf.js tels quels, l'écran et la CI partagent le même parcours.
'use strict';

/* Taille du corps d'un fragment pdf.js (transform = [a, b, c, d, e, f] :
 * pour un texte horizontal, hypot(c, d) est la taille en points). */
function tailleDItem(it) {
  const t = it && it.transform;
  if (Array.isArray(t) && t.length >= 4) {
    const n = Math.hypot(Number(t[2]) || 0, Number(t[3]) || 0);
    if (n > 0 && Number.isFinite(n)) return n;
  }
  const h = Number(it && it.height) || 0;
  return h > 0 ? h : 0;
}

/* Famille générique d'un style pdf.js : « serif » (Times, Garamond…) ou
 * « sans » (Helvetica, Arial…). L'ordre des tests compte : « sans-serif »
 * CONTIENT « serif », il est tranché d'abord — familleDeStyle teste le
 * nom donné par pdf.js, jamais l'inverse. */
function familleDeStyle(style) {
  const f = String((style && (style.fontFamily || style.family)) || '');
  if (/sans/i.test(f)) return 'sans';
  if (/serif|times|roman|georgia|garamond|book|minion/i.test(f)) return 'serif';
  return 'sans'; // familles monospace et inconnues : repli sans empattement
}

/* Gras au mieux du style (pdf.js expose parfois fontWeight, parfois le nom
 * de la police ; souvent aucun des deux — le repli est « faux »). */
function grasDeStyle(style) {
  if (!style) return false;
  const p = Number(style.fontWeight);
  if (p >= 600) return true;
  return /bold|black|heavy|semib|demi/i.test(String(style.fontFamily || style.family || ''));
}

/* Fragments pdf.js qui tombent dans le rectangle du bloc reconnu (avec
 * une garde verticale : une ligne de texte dépasse toujours un peu la
 * boîte que la reconnaissance a mesurée sur son image). */
function selectionnerItemsDans(items, rect) {
  if (!Array.isArray(items) || !Array.isArray(rect) || rect.length < 4) return [];
  const dans = [];
  for (const it of items) {
    if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
    const t = it.transform;
    if (!Array.isArray(t) || t.length < 6) continue;
    const taille = tailleDItem(it) || 11;
    const x0 = Number(t[4]) || 0;
    const x1 = x0 + (Number(it.width) || 0);
    const base = Number(t[5]) || 0;
    if (Math.min(x1, rect[2]) - Math.max(x0, rect[0]) <= 0) continue;
    const garde = Math.max(2, taille * 0.65);
    if (base > rect[3] + garde || base - taille < rect[1] - garde) continue;
    dans.push(it);
  }
  return dans;
}

/* Les fragments retenus, regroupés en LIGNES réelles : fragments alignés
 * sur la même ligne de base (à la tolérance près), du haut de la page
 * vers le bas puis de gauche à droite, recollés mot à mot. Un espace est
 * inséré entre deux fragments éloignés ; collés (crénage), ils restent
 * collés. */
function regrouperEnLignes(items) {
  const tries = items.slice().sort((a, b) => ((b.transform[5] || 0) - (a.transform[5] || 0))
    || ((a.transform[4] || 0) - (b.transform[4] || 0)));
  const lignes = [];
  let courante = null;
  for (const it of tries) {
    const taille = tailleDItem(it) || 11;
    const base = Number(it.transform[5]) || 0;
    if (courante && Math.abs(courante.base - base) <= Math.max(1.5, taille * 0.2)) {
      courante.items.push(it);
      courante.taille = Math.max(courante.taille, taille);
    } else {
      courante = { base, taille, items: [it] };
      lignes.push(courante);
    }
  }
  for (const l of lignes) {
    l.items.sort((a, b) => (Number(a.transform[4]) || 0) - (Number(b.transform[4]) || 0));
    let texte = '';
    let finPrecedent = 0;
    let taillePrecedente = 11;
    for (const it of l.items) {
      const taille = tailleDItem(it) || 11;
      const x0 = Number(it.transform[4]) || 0;
      const morceau = String(it.str).replace(/\s+/g, ' ').trim();
      if (!morceau) continue;
      if (texte !== '' && x0 - finPrecedent > Math.max(1, taillePrecedente * 0.14)) {
        texte += ' ';
      }
      texte += morceau;
      finPrecedent = x0 + (Number(it.width) || taille * morceau.length * 0.5);
      taillePrecedente = taille;
    }
    l.texte = texte.trim();
  }
  return lignes;
}

/** Le texte réel d'une zone : source recollée ligne à ligne, TAILLE
 * réelle dominante, FAMILLE et GRAS dominants (au poids du texte),
 * rectangle exact de l'encre réelle. Null si la zone ne porte aucun
 * texte réel (page scannée : la reconnaissance garde son rôle).
 * @param {object[]} items fragments pdf.js {str, transform, width, fontName}
 * @param {object} styles styles pdf.js {fontName -> {fontFamily, …}}
 * @param {number[]} rect [x0, yBas, x1, yHaut] de la zone reconnue
 * @returns {?{source: string, taille: number, famille: 'serif'|'sans',
 *             gras: boolean, rect: number[]}} */
function analyserItemsTexte(items, styles, rect) {
  const dans = selectionnerItemsDans(items, rect);
  if (!dans.length) return null;
  const lignes = regrouperEnLignes(dans).filter((l) => l.texte);
  if (!lignes.length) return null;
  let pSerif = 0; let pSans = 0; let pGras = 0;
  const pTailles = new Map();
  let x0 = Infinity; let x1 = -Infinity; let yBas = Infinity; let yHaut = -Infinity;
  let source = '';
  for (const l of lignes) {
    for (const it of l.items) {
      const st = (styles && it.fontName && styles[it.fontName]) || null;
      const n = String(it.str || '').length;
      if (familleDeStyle(st) === 'serif') pSerif += n; else pSans += n;
      if (grasDeStyle(st)) pGras += n;
    }
    const t = Math.round(l.taille * 2) / 2;
    pTailles.set(t, (pTailles.get(t) || 0) + l.texte.length);
    for (const it of l.items) {
      const ix0 = Number(it.transform[4]) || 0;
      const ix1 = ix0 + (Number(it.width) || 0);
      const taille = tailleDItem(it) || l.taille;
      x0 = Math.min(x0, ix0); x1 = Math.max(x1, ix1);
      yBas = Math.min(yBas, l.base - taille * 0.32);
      yHaut = Math.max(yHaut, l.base + taille * 0.82);
    }
  }
  let taille = 11; let poidsMax = -1;
  for (const [t, p] of pTailles) {
    if (p > poidsMax) { poidsMax = p; taille = t; }
  }
  const famille = pSerif > pSans ? 'serif' : 'sans';
  const gras = pGras > (pSerif + pSans) / 2;
  let src = '';
  for (const l of lignes) src += (src ? '\n' : '') + l.texte;
  return { source: src, taille, famille, gras, rect: [x0, yBas, x1, yHaut] };
}

/* v0.1.41 : la LIGNE réelle sous un point (x, y) de la page — l'outil
 * Modifier clique dans une phrase et corrige CETTE ligne. Est retenue
 * celle dont la bande verticale [base − 0,32·t, base + 0,82·t] accueille
 * y (la hauteur d'encre d'une ligne, celle d'analyserItemsTexte) ;
 * sinon la ligne la plus proche dans un rayon borné : un demi-corps à
 * la verticale, max(10, 1,5·t) à l'horizontale — de quoi cliquer un peu
 * après la fin de la ligne sans viser au pixel. La ligne retenue est
 * la plus proche verticalement, puis horizontalement à égalité. Null
 * si le clic tombe dans une marge : rien n'y est éditable. */
function ligneAuPoint(items, x, y) {
  if (!Array.isArray(items) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  let lignes;
  try {
    lignes = regrouperEnLignes(items).filter((l) => l.texte);
  } catch (e) {
    return null;
  }
  if (!lignes.length) return null;
  let meilleur = null;
  let cleMin = Infinity;
  for (const l of lignes) {
    const t = l.taille || 11;
    let x0 = Infinity; let x1 = -Infinity;
    for (const it of l.items) {
      if (!it || !Array.isArray(it.transform)) continue;
      const ix0 = Number(it.transform[4]) || 0;
      const ix1 = ix0 + (Number(it.width) || 0);
      if (ix0 < x0) x0 = ix0;
      if (ix1 > x1) x1 = ix1;
    }
    if (!Number.isFinite(x0) || !Number.isFinite(x1)) continue;
    const bas = (Number(l.base) || 0) - t * 0.32;
    const haut = (Number(l.base) || 0) + t * 0.82;
    const dv = y < bas ? bas - y : (y > haut ? y - haut : 0);
    if (dv > Math.max(4, t * 0.5)) continue; // rayon vertical borné
    const dH = x < x0 ? x0 - x : (x > x1 ? x - x1 : 0);
    if (dH > Math.max(10, t * 1.5)) continue; // marge de fin de ligne
    const cle = dv * 1000 + dH; // la verticale l'emporte, l'horizontale départage
    if (cle < cleMin) { cleMin = cle; meilleur = l; }
  }
  return meilleur;
}

/* v0.1.41 : la ZONE d'UNE seule ligne — source, taille, famille, gras et
 * rectangle exact de l'encre, mêmes dominantes et mêmes bandes
 * qu'analyserItemsTexte, mais SANS fusionner les lignes voisines : l'outil
 * Modifier corrige la ligne cliquée, pas le paragraphe entier. Null si
 * la ligne est vide. */
function zoneDeLigne(ligne, styles) {
  if (!ligne || !Array.isArray(ligne.items) || !ligne.items.length) return null;
  const texte = String(ligne.texte || '').trim();
  if (!texte) return null;
  const tailleLigne = Math.round((ligne.taille || 11) * 2) / 2;
  let pSerif = 0; let pSans = 0; let pGras = 0;
  let x0 = Infinity; let x1 = -Infinity;
  let base = Infinity; let taille = 0;
  for (const it of ligne.items) {
    if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
    const st = (styles && it.fontName && styles[it.fontName]) || null;
    const n = it.str.length;
    if (familleDeStyle(st) === 'serif') pSerif += n; else pSans += n;
    if (grasDeStyle(st)) pGras += n;
    const ix0 = Number(it.transform && it.transform[4]) || 0;
    const ix1 = ix0 + (Number(it.width) || 0);
    if (ix0 < x0) x0 = ix0;
    if (ix1 > x1) x1 = ix1;
    const ibase = Number(it.transform && it.transform[5]) || 0;
    const itaille = tailleDItem(it) || tailleLigne;
    if (ibase < base) base = ibase;
    if (itaille > taille) taille = itaille;
  }
  if (!Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(base)) return null;
  const t = taille || tailleLigne;
  return {
    source: texte,
    taille: Math.round(t * 2) / 2,
    famille: pSerif > pSans ? 'serif' : 'sans',
    gras: pGras > (pSerif + pSans) / 2,
    rect: [x0, base - t * 0.32, x1, base + t * 0.82],
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tailleDItem, familleDeStyle, grasDeStyle, selectionnerItemsDans, regrouperEnLignes, analyserItemsTexte, ligneAuPoint, zoneDeLigne };
} else {
  globalThis.AtelierTexteReel = { tailleDItem, familleDeStyle, grasDeStyle, selectionnerItemsDans, regrouperEnLignes, analyserItemsTexte, ligneAuPoint, zoneDeLigne };
}
