// engine/bouger.js — v0.1.12 : déplacer et redimensionner les annotations,
// en place, sans changer leur nature. Le /Rect bouge ; /QuadPoints et
// /InkList suivent ; l'apparence /AP est TRANSLATÉE (nos flux utilisent des
// coordonnées absolues), SAUF celle des équations : leur /AP est LOCALE
// (BBox [0 0 w h]) et les lecteurs conformes la calent sur /Rect — écrire
// le nouveau /Rect suffit, et le redimensionnement y met l'apparence à
// l'échelle. Exige pdf-lib (tests en CI uniquement).
'use strict';

const { PDFName, PDFNumber, PDFRawStream, PDFRef } = require('pdf-lib');
const { normalizeRect } = require('./annotcore.js');
const { addMixedFiche } = require('./melange.js');
const { addSquare, lireOptionsCadre } = require('./annots.js'); // v0.1.31
const { addNoteRiche } = require('./riche.js'); // v0.1.31

const PREFIXE_EQUATION = 'Équation LaTeX';
const fmt = (v) => String(Math.round(v * 100) / 100);

/** Référence IPC {objectNumber, generationNumber} ou PDFRef direct. */
function enRef(refBrut) {
  if (refBrut instanceof PDFRef) return refBrut;
  if (refBrut && Number.isInteger(refBrut.objectNumber)) {
    return PDFRef.of(refBrut.objectNumber, refBrut.generationNumber || 0);
  }
  return null;
}

/** Cherche l'annotation dans /Annots de la page : { ctx, annot, tableau, i }.
 * La référence visée peut être reconstruite (IPC) : comparaison par numéro
 * d'objet, jamais par identité d'instance. */
function trouverAnnot(ctx, page, ref) {
  let annots;
  try { annots = page.node.Annots ? page.node.Annots() : null; } catch { annots = null; }
  if (!annots || !ref) return null;
  for (let i = 0; i < annots.size(); i += 1) {
    const refI = annots.get(i);
    if (refI && refI.objectNumber === ref.objectNumber
      && refI.generationNumber === ref.generationNumber) {
      const annot = ctx.lookup(refI);
      if (annot && typeof annot.get === 'function') return { ctx, annot, tableau: annots, i };
    }
  }
  return null;
}

function lireContenu(ctx, annot) {
  try {
    const c = ctx.lookup(annot.get(PDFName.of('Contents')));
    return (c && typeof c.decodeText === 'function') ? c.decodeText() : String(c ?? '');
  } catch { return ''; }
}

function estEquation(ctx, annot) {
  return lireContenu(ctx, annot).startsWith(PREFIXE_EQUATION);
}

/* ---------- Translation des flux d'apparence ---------- */

/** Décale X,Y d'une ligne d'opérateur de NOS apparences (formats émis par
 * engine/annots.js et engine/melange.js uniquement) : `x y … re|m|l|Td`,
 * `1 0 0 1 x y cm|Tm`, et les formes composées `x y w h re S|f`.
 * Toute autre ligne sort inchangée. */
function translaterLigne(ligne, dx, dy) {
  const mots = ligne.trim().split(/\s+/);
  if (!mots[0]) return ligne;
  const op = mots[mots.length - 1];

  // `x y w h re S` et `x y w h re f` (rectangles peints/tracés) :
  // SIX mots, opcode peint en dernière position (`re` en 5e).
  if (op === 'S' || op === 'f' || op === 'B') {
    if (mots.length === 6 && mots[4] === 're') {
      mots[0] = fmt(Number(mots[0]) + dx);
      mots[1] = fmt(Number(mots[1]) + dy);
      return mots.join(' ');
    }
    return ligne;
  }

  // Cubiques a coordonnees absolues (`x1 y1 x2 y2 x3 y3 c`) : SIX
  // nombres, SEPT mots avec l'opcode (la CI a attrape la premiere
  // version qui comptait huit nombres : les cubiques des ellipses,
  // arrondis et nuages n'etaient JAMAIS translatees). Tout se decale.
  // v0.1.32 : la branche DOIT preceder le controle `nombreMots` ci-
  // dessous : `c` n'y figure pas et la ligne etait rendue intacte
  // AVANT d'atteindre cette branche (le test ellipse l'a prouve).
  if (op === 'c') {
    if (mots.length !== 7) return ligne;
    for (let k = 0; k <= 4; k += 2) {
      mots[k] = fmt(Number(mots[k]) + dx);
      mots[k + 1] = fmt(Number(mots[k + 1]) + dy);
    }
    return mots.join(' ');
  }
  const nombreMots = { re: 5, m: 3, l: 3, Td: 3, cm: 6, Tm: 6 }[op];
  if (!nombreMots || mots.length !== nombreMots) return ligne;
  if (op === 'cm' || op === 'Tm') {
    if (Number(mots[0]) !== 1 || Number(mots[1]) !== 0
      || Number(mots[2]) !== 0 || Number(mots[3]) !== 1) return ligne;
    mots[4] = fmt(Number(mots[4]) + dx);
    mots[5] = fmt(Number(mots[5]) + dy);
    return mots.join(' ');
  }
  // re (x y w h), m, l, Td (x y) : le premier couple est une position.
  mots[0] = fmt(Number(mots[0]) + dx);
  mots[1] = fmt(Number(mots[1]) + dy);
  return mots.join(' ');
}

function translaterContenu(contenu, dx, dy) {
  return String(contenu)
    .split('\n')
    .map((ligne) => translaterLigne(ligne, dx, dy))
    .join('\n');
}

/** Décale BBox et flux de /AP/N d'une annotation (coordonnées absolues). */
function translaterAP(ctx, annot, dx, dy) {
  let ap;
  try { ap = ctx.lookup(annot.get(PDFName.of('AP'))); } catch { ap = null; }
  if (!ap || typeof ap.get !== 'function') return;
  let form;
  try { form = ctx.lookup(ap.get(PDFName.of('N'))); } catch { form = null; }
  if (!form || !(form instanceof PDFRawStream)) return;
  const bbox = ctx.lookup(form.dict.get(PDFName.of('BBox')));
  if (bbox && typeof bbox.get === 'function') {
    for (const [i, d] of [[0, dx], [1, dy], [2, dx], [3, dy]]) {
      bbox.set(i, PDFNumber.of(bbox.get(i).asNumber() + d));
    }
    form.dict.set(PDFName.of('BBox'), bbox);
  }
  const ancien = Buffer.from(form.contents).toString('latin1');
  form.contents = new Uint8Array(Buffer.from(translaterContenu(ancien, dx, dy), 'latin1'));
}

/* ---------- Déplacements ---------- */

function deplacerNombre(ctx, pdfArray, i, d) {
  pdfArray.set(i, PDFNumber.of(pdfArray.get(i).asNumber() + d));
}

/**
 * Déplace une annotation de (dx, dy) points : /Rect, /QuadPoints, /InkList
 * et l'apparence suivent (les équations : /Rect seul, apparence locale).
 * @returns {{ref: PDFRef}}
 */
function deplacerAnnot(doc, page, { ref: refBrut, dx, dy }) {
  const ref = enRef(refBrut);
  const ddx = Number(dx) || 0;
  const ddy = Number(dy) || 0;
  if (!ref) throw new Error('Aucune annotation désignée pour le déplacement.');
  const cible = trouverAnnot(doc.context, page, ref);
  if (!cible) throw new Error('Annotation introuvable : elle a peut-être été supprimée.');
  const { ctx, annot } = cible;

  const rect = ctx.lookup(annot.get(PDFName.of('Rect')));
  if (rect && typeof rect.get === 'function') {
    deplacerNombre(ctx, rect, 0, ddx); deplacerNombre(ctx, rect, 2, ddx);
    deplacerNombre(ctx, rect, 1, ddy); deplacerNombre(ctx, rect, 3, ddy);
  }

  try {
    const quads = ctx.lookup(annot.get(PDFName.of('QuadPoints')));
    if (quads && typeof quads.get === 'function') {
      for (let i = 0; i < quads.size(); i += 1) {
        deplacerNombre(ctx, quads, i, i % 2 === 0 ? ddx : ddy);
      }
    }
  } catch { /* pas de /QuadPoints */ }

  try {
    const listes = ctx.lookup(annot.get(PDFName.of('InkList')));
    if (listes && typeof listes.get === 'function') {
      for (let l = 0; l < listes.size(); l += 1) {
        const chemin = ctx.lookup(listes.get(l));
        for (let i = 0; i < chemin.size(); i += 1) {
          deplacerNombre(ctx, chemin, i, i % 2 === 0 ? ddx : ddy);
        }
      }
    }
  } catch { /* pas de /InkList */ }

  if (!estEquation(ctx, annot)) translaterAP(ctx, annot, ddx, ddy);
  return { ref };
}

/* ---------- Redimensionnement ---------- */

/** Régénère l'apparence d'un /FreeText à sa NOUVELLE position : texte,
 * taille et couleur relus du /DA et du /Contents existants. */
function reaparaitreFreeText(ctx, annot, [x0, y0, x1, y1]) {
  let texte = lireContenu(ctx, annot);
  let taille = 11;
  let couleur = [0.13, 0.29, 0.53];
  try {
    const da = ctx.lookup(annot.get(PDFName.of('DA')));
    const source = String((da && da.asString && da.asString()) || '');
    const m = source.match(/\/Helv\s+([0-9.]+)\s+Tf\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/);
    if (m) {
      taille = Number(m[1]) || 11;
      couleur = [Number(m[2]), Number(m[3]), Number(m[4])];
    }
  } catch { /* DA illisible : valeurs par défaut */ }
  let hex = '';
  try {
    const octets = texte.split('').map((ch) => ch.charCodeAt(0));
    // WinAnsi ligne par ligne : chaque code ≤ 0xff passe, sinon « ? ».
    hex = octets.map((c) => ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)
      ? c : 0x3f).toString(16).padStart(2, '0')).join('');
    texte = texte.replace(/[\r\n]+/g, ' ');
  } catch { return; }
  const ops = [
    'BT',
    `/F1 ${taille} Tf`,
    `${fmt(couleur[0])} ${fmt(couleur[1])} ${fmt(couleur[2])} rg`,
    `${fmt(x0 + 2)} ${fmt(y0 + 2)} Td`,
    `<${hex}> Tj`,
    'ET',
  ];
  let ap;
  try { ap = ctx.lookup(annot.get(PDFName.of('AP'))); } catch { ap = null; }
  if (!ap || typeof ap.get !== 'function') return;
  const form = ctx.lookup(ap.get(PDFName.of('N')));
  if (!form || !(form instanceof PDFRawStream)) return;
  const bbox = ctx.lookup(form.dict.get(PDFName.of('BBox')));
  if (bbox && typeof bbox.get === 'function') {
    [x0, y0, x1, y1].forEach((v, i) => bbox.set(i, PDFNumber.of(v)));
  }
  form.contents = new Uint8Array(Buffer.from(ops.join('\n'), 'latin1'));
}

/**
 * Redimensionne une annotation vers un rectangle cible (drag d'une
 * poignée) : textes et cadres régénèrent leur apparence, les fiches à
 * formules sont reposées depuis leur source embarquée (asynchrone), les
 * équations ne changent que /Rect (apparence locale mise à l'échelle par
 * le lecteur). Surlignage, trait et icône-note refusent.
 * @returns {Promise<{ref: PDFRef, rect: number[]}>}
 */
async function redimensionnerAnnot(doc, page, { ref: refBrut, rect }) {
  const ref = enRef(refBrut);
  if (!ref) throw new Error('Aucune annotation désignée pour le redimensionnement.');
  const cible = trouverAnnot(doc.context, page, ref);
  if (!cible) throw new Error('Annotation introuvable : elle a peut-être été supprimée.');
  const { ctx, annot, tableau, i } = cible;
  const contenu = lireContenu(ctx, annot);

  let subtype = '';
  try { subtype = String(ctx.lookup(annot.get(PDFName.of('Subtype')))).replace(/^\//, ''); } catch { subtype = ''; }

  const mixte = subtype === 'Square' && contenu.startsWith('Fiche mixte');
  const equation = subtype === 'Square' && contenu.startsWith(PREFIXE_EQUATION);
  // v0.1.29 : une correction se REPOSE depuis sa source embarquée, comme
  // une fiche mixte (le masque blanc doit suivre le nouveau rectangle).
  const correction = subtype === 'Square' && contenu.startsWith('Correction OCR');

  if (subtype === 'Text' || subtype === 'Highlight' || subtype === 'Ink') {
    throw new Error('Ce type d\u2019annotation ne se redimensionne pas.');
  }
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const minL = equation ? 6 : 24;
  const minH = equation ? 6 : 12;
  const nx1 = Math.max(x1, x0 + minL);
  const ny1 = Math.max(y1, y0 + minH);
  const nouveau = [x0, y0, nx1, ny1];

  if (mixte) {
    // La fiche se recompose toute seule depuis sa source : le bas descend
    // si le contenu dépasse, comme à la pose (moteur de la v0.1.11).
    const { extraireSourceFiche, extraireTailleFiche } = require('./texte.js');
    const source = extraireSourceFiche(contenu);
    const fontSize = extraireTailleFiche(contenu) || 11;
    tableau.remove(i);
    const rep = await addMixedFiche(doc, page, { rect: nouveau, source, fontSize });
    return { ref: rep.ref, rect: rep.rect };
  }

  if (correction) {
    const {
      extraireSourceCorrection, extraireTailleCorrection,
    } = require('./texte.js');
    const { addCorrection } = require('./correction.js');
    const source = extraireSourceCorrection(contenu);
    const fontSize = extraireTailleCorrection(contenu) || 11;
    tableau.remove(i);
    const rep = await addCorrection(doc, page, { rect: nouveau, source, fontSize });
    return { ref: rep.ref, rect: rep.rect };
  }

  // v0.1.31 : la note riche se REPOSE depuis sa source embarquée, comme
  // la fiche mixte ; le sujet est conservé (note posée ou fiche glissée)
  // et la couleur du corps relue du /DA.
  if (subtype === 'FreeText' && contenu.startsWith('Note riche')) {
    const { extraireSourceNoteRiche, extraireTailleNoteRiche } = require('./texte.js');
    const source = extraireSourceNoteRiche(contenu);
    const fontSize = extraireTailleNoteRiche(contenu) || 11;
    let sujet = 'Note';
    try {
      const su = ctx.lookup(annot.get(PDFName.of('Subject')));
      if (su && typeof su.decodeText === 'function' && su.decodeText()) sujet = su.decodeText();
    } catch { /* sans sujet : note */ }
    let couleur = null;
    try {
      const da = ctx.lookup(annot.get(PDFName.of('DA')));
      const texteDa = String((da && da.asString && da.asString()) || '');
      const m = /([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+rg\s*$/.exec(texteDa);
      if (m) {
        const { rgb01VersHex } = require('./couleurs.js');
        const hex = rgb01VersHex([Number(m[1]), Number(m[2]), Number(m[3])]);
        if (hex) couleur = hex;
      }
    } catch { /* couleur par defaut */ }
    tableau.remove(i);
    const rep = await addNoteRiche(doc, page, { rect: nouveau, source, fontSize, couleur, sujet });
    return { ref: rep.ref, rect: rep.rect };
  }

  // v0.1.31 : un cadre pose avec ses options se REPOSE avec elles (la
  // regeneration generique l'aurait efface en rectangle nu).
  if (subtype === 'Square' && !equation) {
    const optionsPose = lireOptionsCadre(contenu);
    if (optionsPose) {
      let couleur = [1, 0, 0];
      try {
        const cv = ctx.lookup(annot.get(PDFName.of('C')));
        if (cv && typeof cv.get === 'function' && cv.size() >= 3) {
          couleur = [0, 1, 2].map((j) => cv.get(j).asNumber());
        }
      } catch { /* couleur du cadre par defaut */ }
      tableau.remove(i);
      const nouveauRef = addSquare(doc, page, {
        rect: nouveau, color: couleur,
        borderWidth: optionsPose.borderWidth,
        forme: optionsPose.forme, trait: optionsPose.trait,
        teinte: optionsPose.teinte,
      });
      return { ref: nouveauRef, rect: nouveau };
    }
  }

  const ancien = ctx.lookup(annot.get(PDFName.of('Rect')));
  nouveau.forEach((v, j) => ancien.set(j, PDFNumber.of(v)));
  if (subtype === 'FreeText') reaparaitreFreeText(ctx, annot, nouveau);
  if (subtype === 'Square' && !equation) reaparaitreCadre(ctx, annot, nouveau);
  return { ref, rect: nouveau };
}

/** Régénère l'apparence d'un cadre : couleur et épaisseur relues du flux. */
function reaparaitreCadre(ctx, annot, [x0, y0, x1, y1]) {
  let ap;
  try { ap = ctx.lookup(annot.get(PDFName.of('AP'))); } catch { ap = null; }
  if (!ap || typeof ap.get !== 'function') return;
  const form = ctx.lookup(ap.get(PDFName.of('N')));
  if (!form || !(form instanceof PDFRawStream)) return;
  const ancien = Buffer.from(form.contents).toString('latin1').split('\n');
  const w = x1 - x0;
  const h = y1 - y0;
  if (ancien[0] && / RG$/.test(ancien[0]) && ancien[1] && / w$/.test(ancien[1])) {
    const rempli = ancien.length >= 5 && / rg$/.test(ancien[3]) && / re f$/.test(ancien[4]);
    const ops = [
      ancien[0],
      ancien[1],
      `${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)} re S`,
    ];
    if (rempli) {
      ops.push(ancien[3], `${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)} re f`);
    }
    form.contents = new Uint8Array(Buffer.from(ops.join('\n'), 'latin1'));
    const bbox = ctx.lookup(form.dict.get(PDFName.of('BBox')));
    if (bbox && typeof bbox.get === 'function') {
      [x0, y0, x1, y1].forEach((v, j) => bbox.set(j, PDFNumber.of(v)));
    }
  }
}

module.exports = { deplacerAnnot, redimensionnerAnnot };
