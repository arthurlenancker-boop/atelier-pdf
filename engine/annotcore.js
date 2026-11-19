// engine/annotcore.js — Tâche 3 : briques communes de toutes les annotations.
'use strict';

const {
  PDFName, PDFNumber, PDFHexString, PDFString, PDFArray, PDFDict, PDFRawStream, PDFRef,
} = require('pdf-lib');

// Clés dont la valeur est un TEXTE lisible (chaîne PDF), pas un nom.
// Toute autre valeur chaîne devient un PDFName (« Comment », « Helvetica »…).
const CLES_TEXTE = new Set(['Contents', 'DA', 'M', 'T', 'Subject', 'NM', 'RC']);

/**
 * Encode une chaîne JavaScript en octets WinAnsi (CP1252 étendu au latin 1),
 * avec repli « ? » pour les caractères non représentables.
 * @returns {Uint8Array}
 */
function octetsWinAnsi(texte) {
  const source = String(texte ?? '');
  const sortie = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7e) sortie[i] = c; // ASCII imprimable
    else if (c >= 0xa0 && c <= 0xff) sortie[i] = c; // latin 1 étendu
    else {
      // Quelquesmappages CP1252 usuels (guillemets, traits d'union…).
      const c1252 = { 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2013: 0x96, 0x2014: 0x97, 0x20ac: 0x80, 0x2026: 0x85 }[c];
      sortie[i] = c1252 !== undefined ? c1252 : 0x3f; // repli « ? »
    }
  }
  return sortie;
}

/**
 * Chaîne PDF hexadécimale WinAnsi : « Bibliothèque » s'encode en un octet par
 * caractère, lisible par tout lecteur PDF.
 * @returns {PDFHexString}
 */
function hexWinAnsi(texte) {
  const octets = octetsWinAnsi(texte);
  let hex = '';
  for (const o of octets) hex += o.toString(16).padStart(2, '0');
  return PDFHexString.of(hex);
}

/**
 * Remplace les caractères non représentables en WinAnsi par « ? ».
 * @returns {string}
 */
function sanitizeWinAnsi(texte) {
  const source = String(texte ?? '');
  let sortie = '';
  for (const ch of source) {
    const c = ch.codePointAt(0);
    sortie += (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || ch === '\n' || ch === '\r' || ch === '\t'
      ? ch : '?';
  }
  return sortie;
}

/**
 * Ordonne un rectangle : [x0, y0, x1, y1] avec x0 < x1 et y0 < y1,
 * quel que soit le sens du glissement (vigilance n° 4).
 */
function normalizeRect(rect) {
  const [xa, ya, xb, yb] = rect;
  return [Math.min(xa, xb), Math.min(ya, yb), Math.max(xa, xb), Math.max(ya, yb)];
}

/**
 * Convertit une valeur JavaScript en objet pdf-lib pour le dictionnaire
 * d'annotation (règle de la tâche 3 : les clés texte deviennent des chaînes,
 * les autres chaînes des noms).
 */
function convertir(ctx, cle, valeur) {
  if (valeur === null || valeur === undefined) return null;
  if (valeur instanceof PDFHexString || valeur instanceof PDFString
    || valeur instanceof PDFName || valeur instanceof PDFNumber
    || valeur instanceof PDFArray || valeur instanceof PDFDict
    || valeur instanceof PDFRef) {
    return valeur;
  }
  if (typeof valeur === 'number') return PDFNumber.of(valeur);
  if (Array.isArray(valeur)) return ctx.obj(valeur.map((v) => (typeof v === 'number' ? PDFNumber.of(v) : v)));
  if (typeof valeur === 'object') return convertirObjet(ctx, valeur);
  if (typeof valeur === 'string') {
    if (cle === 'DA') return PDFString.of(valeur); // littérale, lue par Acrobat
    return CLES_TEXTE.has(cle) ? PDFHexString.fromText(valeur) : PDFName.of(valeur);
  }
  return null;
}

function convertirObjet(ctx, objet) {
  const dict = ctx.obj({});
  for (const [cle, valeur] of Object.entries(objet)) {
    const v = convertir(ctx, cle, valeur);
    if (v !== null) dict.set(PDFName.of(cle), v);
  }
  return dict;
}

/**
 * Crée un Form XObject (apparence d'annotation).
 * @param {object} p
 * @param {number[]} p.bbox    rectangles d'origine [x0, y0, x1, y1]
 * @param {object}   p.resources ressources (ProcSet, Font, ExtGState…)
 * @param {string}   p.content  opérateurs du flux
 * @returns {PDFRawStream}
 */
function makeForm(ctx, { bbox, resources = {}, content }) {
  const dict = ctx.obj({
    Type: PDFName.of('XObject'),
    Subtype: PDFName.of('Form'),
    BBox: ctx.obj(bbox.map((v) => PDFNumber.of(v))),
    Resources: convertirObjet(ctx, resources),
  });
  const octets = new Uint8Array(Buffer.from(String(content), 'latin1'));
  return new PDFRawStream(dict, octets);
}

/**
 * Ajoute une annotation à une page : dictionnaire, /P, /F 4 (impression),
 * entrée dans le tableau /Annots de la page.
 * @param {object} spec entrées du dictionnaire : Type, Subtype, Rect, C, BS…
 * @param {string|PDFHexString} spec.Contents texte lisible (chaîne PDF)
 * @returns {PDFRef} référence de l'annotation dans le document
 */
function addAnnot(doc, page, spec) {
  const ctx = doc.context;
  const dict = ctx.obj({});

  for (const [cle, valeur] of Object.entries(spec || {})) {
    const v = convertir(ctx, cle, valeur);
    if (v !== null) dict.set(PDFName.of(cle), v);
  }
  dict.set(PDFName.of('P'), page.ref);
  if (!dict.get(PDFName.of('F'))) dict.set(PDFName.of('F'), PDFNumber.of(4));
  if (!dict.get(PDFName.of('M'))) {
    dict.set(PDFName.of('M'), PDFString.fromDate(new Date()));
  }

  const ref = doc.context.register(dict);
  let Annots;
  try { Annots = page.node.Annots(); } catch { Annots = null; }
  if (!Annots) Annots = ctx.obj([]);
  Annots.push(ref);
  page.node.set(PDFName.of('Annots'), Annots);
  return ref;
}

module.exports = { makeForm, addAnnot, hexWinAnsi, sanitizeWinAnsi, normalizeRect, octetsWinAnsi };
