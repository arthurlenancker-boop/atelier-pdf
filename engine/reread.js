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

      // v0.1.12 : /Subject distingue la note nue (Subject « Note ») de la
      // fiche carte (Subject « Fiche ») à l'écran.
      let subject = '';
      try { subject = decoderContenu(a.get(PDFName.of('Subject')), ctx); } catch { subject = ''; }

      // v0.1.31 : couleur (/C), fond (/IC), trait (/BS W et D) et
      // rectangles (/QuadPoints), pour repeindre à l'écran chaque
      // surlignage et chaque cadre comme ils sont dans le fichier.
      let c = null;
      try {
        const v = ctx.lookup(a.get(PDFName.of('C')));
        if (v && typeof v.get === 'function') {
          c = [0, 1, 2].map((j) => {
            const n = nombre(v.get(j), ctx);
            return n === null ? null : n;
          });
          if (c.some((x) => x === null)) c = null;
        }
      } catch { c = null; }
      let ic = null;
      try {
        const v = ctx.lookup(a.get(PDFName.of('IC')));
        if (v && typeof v.get === 'function') {
          ic = [0, 1, 2].map((j) => nombre(v.get(j), ctx));
          if (ic.some((x) => x === null)) ic = null;
        }
      } catch { ic = null; }
      let bs = null;
      try {
        const v = ctx.lookup(a.get(PDFName.of('BS')));
        if (v && typeof v.get === 'function') {
          bs = {};
          const w = nombre(v.get(PDFName.of('W')), ctx);
          if (w !== null) bs.w = w;
          const d = ctx.lookup(v.get(PDFName.of('D')));
          if (d && typeof d.size === 'function' && d.size() > 0) {
            bs.d = [];
            for (let j = 0; j < d.size(); j += 1) {
              const n = nombre(d.get(j), ctx);
              if (n !== null) bs.d.push(n);
            }
            if (bs.d.length === 0) delete bs.d;
          }
        }
      } catch { bs = null; }
      let quads = null;
      try {
        const v = ctx.lookup(a.get(PDFName.of('QuadPoints')));
        if (v && typeof v.size === 'function' && v.size() >= 8 && v.size() % 8 === 0) {
          quads = [];
          for (let j = 0; j < v.size(); j += 1) quads.push(nombre(v.get(j), ctx));
          if (quads.some((x) => x === null)) quads = null;
        }
      } catch { quads = null; }
      // v0.1.35 : /InkList, les traits d'encre point par point. pdf.js ne
      // peint plus aucune annotation dans la page (annotationMode DISABLE
      // au rendu principal) : le calque applicatif redessine l'encre depuis
      // ces points, avec la couleur /C et l'épaisseur /BS W du fichier.
      let inkList = null;
      try {
        const v = ctx.lookup(a.get(PDFName.of('InkList')));
        if (v && typeof v.size === 'function' && v.size() > 0) {
          inkList = [];
          for (let j = 0; j < v.size(); j++) {
            const chemin = ctx.lookup(v.get(j));
            if (!chemin || typeof chemin.size !== 'function'
              || chemin.size() < 4 || chemin.size() % 2 !== 0) continue;
            const pts = [];
            for (let k = 0; k < chemin.size(); k++) pts.push(nombre(chemin.get(k), ctx));
            if (pts.some((x) => x === null)) continue;
            inkList.push(pts);
          }
          if (inkList.length === 0) inkList = null;
        }
      } catch { inkList = null; }

      sortie.push({ page: pageIndex, subtype, rect, hasAP, contents, subject, ref,
        ...(c ? { c } : {}), ...(ic ? { ic } : {}), ...(bs ? { bs } : {}),
        ...(quads ? { quads } : {}), ...(inkList ? { inkList } : {}) });
    }
  });
  return sortie;
}

module.exports = { listAnnots };
