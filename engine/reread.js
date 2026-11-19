// engine/reread.js — Tâche 7 : relecture des annotations.
// Ne lève jamais sur une annotation inconnue ou incomplète (vigilance n° 5) :
// chaque champ est lu par dérobades successives.
'use strict';

const { PDFName, PDFHexString, PDFString } = require('pdf-lib');

function nombre(v, ctx) {
  try { return ctx.lookup(v).asNumber(); } catch { return null; }
}

function decoderContenu(v, ctx) {
  if (!v) return '';
  try {
    const obj = ctx.lookup(v);
    if (obj instanceof PDFHexString) return obj.decodeText();
    if (obj instanceof PDFString) return obj.decodeText ? obj.decodeText() : obj.asString();
    return String(obj);
  } catch { return ''; }
}

/**
 * Liste toutes les annotations d'un document, page par page.
 * @returns {{page: number, subtype: string, rect: number[], hasAP: boolean,
 *            contents: string, ref: PDFRef}[]}
 */
function listAnnots(doc) {
  const ctx = doc.context;
  const sortie = [];
  doc.getPages().forEach((page, pageIndex) => {
    let annots;
    try {
      annots = page.node.Annots ? page.node.Annots() : page.node.get(PDFName.of('Annots'));
    } catch { annots = null; }
    if (!annots) return;
    let taille = 0;
    try { taille = annots.size(); } catch { return; }
    for (let i = 0; i < taille; i++) {
      let a = null;
      let ref = null;
      try { a = ctx.lookup(annots.get(i)); } catch { continue; }
      try { ref = annots.get(i); } catch { ref = null; }
      if (!a || typeof a.get !== 'function') continue;

      let subtype = '';
      try {
        subtype = ctx.lookup(a.get(PDFName.of('Subtype'))).asString
          ? ctx.lookup(a.get(PDFName.of('Subtype'))).asString()
          : String(ctx.lookup(a.get(PDFName.of('Subtype'))));
        subtype = subtype.replace(/^\//, ''); // '/Highlight' -> 'Highlight'
      } catch { subtype = ''; }

      let rect = [0, 0, 0, 0];
      try {
        const r = ctx.lookup(a.get(PDFName.of('Rect')));
        rect = [0, 1, 2, 3].map((j) => nombre(r.get(j), ctx));
      } catch { rect = [0, 0, 0, 0]; }

      let hasAP = false;
      try {
        const ap = ctx.lookup(a.get(PDFName.of('AP')));
        hasAP = !!(ap && ap.get && ap.get(PDFName.of('N')));
      } catch { hasAP = false; }

      let contents = '';
      try { contents = decoderContenu(a.get(PDFName.of('Contents')), ctx); } catch { contents = ''; }

      sortie.push({ page: pageIndex, subtype, rect, hasAP, contents, ref });
    }
  });
  return sortie;
}

module.exports = { listAnnots };
