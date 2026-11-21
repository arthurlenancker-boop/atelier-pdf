// engine/ocr.js — Prototype OCR (21 nov. 2026) : transformer une page scannée
// (image sans texte) en page interrogeable, en posant une COUCHE DE TEXTE
// INVISIBLE (mode de rendu 3, « 3 Tr ») à la position exacte de chaque mot
// reconnu par Tesseract. Format PDF standard pur : la recherche, la sélection
// et la copie fonctionnent dans tout lecteur conforme, sans toucher à
// l'image du scan. Exige pdf-lib (tests en CI uniquement).
// Préparation des mots : tesseract.js (createWorker 'fra', recognize
// {blocks:true}, bboxes en pixels, origine en haut à gauche).
'use strict';

// pdf-lib est requis paresseusement (seule poseCoucheInvisible en a besoin) :
// le reste du module reste testable en local, node_modules absent.

/** Substitutions pour les graphies hors WinAnsi rencontrées en OCR. */
const SUBSTS = {
  '\u00A0': ' ', '\u2019': "'", '\u2018': "'", '\u201C': '"', '\u201D': '"',
  '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u2212': '-',
  '\uFB01': 'fi', '\uFB02': 'fl', '\u02C2': '^',
};

// Caractères Unicode au-delà de U+00FF que WinAnsiEncoding sait encoder
// (table WinAnsi, hors plage ASCII/Latin-1 déjà conservée) : tout autre
// caractère > U+00FF est écarté d'office, pour que encodeText ne lève jamais.
const WINANSI_ETENDUS = new Set(
  '\u0152\u0153\u0160\u0161\u017D\u017E\u0178\u0192\u02C6\u02DC\u201A\u201E'
  + '\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2013\u2014\u2018\u2019'
  + '\u201C\u201D\u2122'.split(''),
);

/** Nettoyage déterministe : ne garder que ce que Helvetica WinAnsi sait
 *  encoder.  Les caractères exotiques sont écartés : le mot reste
 *  sélectionnable via ses voisins et le reste de sa propre écriture. */
function versWinAnsi(s) {
  let r = '';
  for (const ch of String(s)) {
    if (SUBSTS[ch]) { r += SUBSTS[ch]; continue; }
    const c = ch.codePointAt(0);
    if (c < 32 || c === 127) continue;
    if (c > 255 && !WINANSI_ETENDUS.has(ch)) continue;
    r += ch;
  }
  return r;
}

/** Encoder un mot pour showText, avec repli ASCII si un caractère dépasse
 *  la table WinAnsi d'Helvetica (encodeText lève dans ce cas). */
function encoderMot(police, mot) {
  const propre = versWinAnsi(mot);
  try {
    return police.encodeText(propre);
  } catch (_e) {
    return police.encodeText(propre.replace(/[^\x20-\x7E]/g, ''));
  }
}

/** Aplatir la sortie `blocks` de tesseract.js en lignes de mots.
 *  `blocks` : blocs → paragraphes → lignes → mots, bbox en pixels
 *  (x0,y0 en haut-gauche ; y croît vers le bas). Defensive sur chaque
 *  étage : toute reconnaissance vide donne un tableau vide, jamais d'exception. */
function lignesOCR(blocks) {
  const lignes = [];
  for (const bloc of blocks || []) {
    for (const para of (bloc && bloc.paragraphs) || []) {
      for (const ligne of (para && para.lines) || []) {
        const mots = [];
        for (const m of (ligne && ligne.words) || []) {
          if (typeof m.text === 'string' && m.text.trim() !== '' && m.bbox) {
            mots.push({ texte: m.text, bbox: m.bbox });
          }
        }
        if (mots.length === 0) continue;
        lignes.push({ mots, bbox: ligne.bbox || bboxUnion(mots) });
      }
    }
  }
  return lignes;
}

function bboxUnion(mots) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of mots) {
    x0 = Math.min(x0, m.bbox.x0); y0 = Math.min(y0, m.bbox.y0);
    x1 = Math.max(x1, m.bbox.x1); y1 = Math.max(y1, m.bbox.y1);
  }
  return { x0, y0, x1, y1 };
}

/** Paramètres de pose d'une ligne : taille de police et ligne de base,
 *  en points PDF, à partir de la bbox OCR (pixels, origine en haut à
 *  gauche) et des échelles px→pt. Taille = hauteur d'encre / 0,95 em ;
 *  ligne de base calée sur le bas d'encre + une demi-descente (0,10 em).
 *  PURE : testable sans pdf-lib. */
function calculerLigne(bbox, echY, hPt) {
  const hEncre = Math.max(2, (bbox.y1 - bbox.y0) * echY);
  const taille = Math.min(42, Math.max(4, hEncre / 0.95));
  const yBase = hPt - bbox.y1 * echY + 0.10 * taille;
  return { taille, yBase };
}

/** Poser la couche de texte invisible sur `page` (pdf-lib).
 *  - `police` : police pdf-lib déjà embarquée (embedFont).
 *  - `lignes` : sortie de lignesOCR (bboxes en pixels OCR).
 *  - `dims` : { largeurPx, hauteurPx } de l'image OCRée. */
function poserCoucheInvisible(page, police, lignes, dims) {
  const {
    beginText, endText, setFontAndSize, setTextRenderingMode, TextRenderingMode,
    moveText, showText,
  } = require('pdf-lib');
  const lPt = page.getWidth();
  const hPt = page.getHeight();
  if (!dims.largeurPx || !dims.hauteurPx) {
    throw new Error('Dimensions d\'image OCR manquantes.');
  }
  const echX = lPt / dims.largeurPx;
  const echY = hPt / dims.hauteurPx;
  const cle = page.node.newFontDictionary(police.name, police.ref);
  const ops = [];
  let nbMots = 0;
  for (const ligne of lignes) {
    const mots = ligne.mots.filter((m) => versWinAnsi(m.texte).trim() !== '');
    if (mots.length === 0) continue;
    const { taille, yBase } = calculerLigne(ligne.bbox, echY, hPt);
    ops.push(beginText(),
      setFontAndSize(cle, Math.round(taille * 100) / 100),
      setTextRenderingMode(TextRenderingMode.Invisible));
    let xPrec = null;
    for (const m of mots) {
      const x = m.bbox.x0 * echX;
      // Premier Td d'un BT frais : absolu. Les suivants : écart au mot
      // précédent (Td est relatif à l'origine de la ligne courante ;
      // Tj ne la déplace pas).
      ops.push(moveText(xPrec === null ? x : x - xPrec, 0));
      ops.push(showText(encoderMot(police, m.texte.trim())));
      xPrec = x;
      nbMots += 1;
    }
    ops.push(endText());
  }
  if (nbMots > 0) page.pushOperators(...ops);
  return { nbMots, cle };
}

module.exports = { versWinAnsi, encoderMot, lignesOCR, calculerLigne, poserCoucheInvisible };
