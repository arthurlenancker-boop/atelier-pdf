// engine/annots.js — Tâche 4 : les cinq annotations standard.
// Chaque annotation reçoit son /AP/N pour un rendu identique partout.
'use strict';

const { PDFName, PDFNumber, PDFArray } = require('pdf-lib');
const { makeForm, addAnnot, normalizeRect, sanitizeWinAnsi, octetsWinAnsi } = require('./annotcore.js');

const fmt = (v) => String(Math.round(v * 100) / 100);

/**
 * Surlignage jaune par défaut, semi-transparent (/ca 0.35) par ExtGState,
 * /QuadPoints aplatis [8 valeurs par quad].
 */
function addHighlight(doc, page, { rect, quadPoints, color = [1, 1, 0], contents = '' }) {
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const quads = (quadPoints || [[x0, y1, x1, y1, x0, y0, x1, y0]]);
  const aplati = [];
  for (const q of quads) aplati.push(...q.map((v) => PDFNumber.of(v)));

  const ops = [
    '/G0 gs',
    `${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])} rg`];
  ops.push(...quads.flatMap((q) => [
    `${fmt(q[0])} ${fmt(q[1])} m`,
    `${fmt(q[2])} ${fmt(q[3])} l`,
    `${fmt(q[6])} ${fmt(q[7])} l`,
    `${fmt(q[4])} ${fmt(q[5])} l`,
    'h f',
  ]));

  const form = makeForm(doc.context, {
    bbox: [x0, y0, x1, y1],
    resources: {
      ProcSet: ['PDF', 'Text'],
      // Transparence du surlignage : /ca 0.35, ressource propre au Form XObject.
      ExtGState: { G0: { ca: 0.35, CA: 0.35 } },
    },
    content: ops.join('\n'),
  });
  const formRef = doc.context.register(form);

  return addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: 'Highlight',
    Rect: [x0, y0, x1, y1],
    QuadPoints: aplati,
    C: color,
    Contents: contents || undefined,
    AP: { N: formRef },
  });
}

/** Cadre rectangulaire (encadré rouge par défaut). */
function addSquare(doc, page, { rect, color = [1, 0, 0], borderWidth = 1.5, fill = null }) {
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const w = x1 - x0;
  const h = y1 - y0;
  const ops = [
    `${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])} RG`,
    `${fmt(borderWidth)} w`,
    `${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)} re S`,
  ];
  if (fill) {
    ops.push(`${fmt(fill[0])} ${fmt(fill[1])} ${fmt(fill[2])} rg`,
      `${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)} re f`);
  }
  const form = makeForm(doc.context, {
    bbox: [x0, y0, x1, y1],
    resources: { ProcSet: ['PDF'] },
    content: ops.join('\n'),
  });
  const formRef = doc.context.register(form);

  return addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: 'Square',
    Rect: [x0, y0, x1, y1],
    C: color,
    BS: { W: borderWidth },
    AP: { N: formRef },
  });
}

/** Encre à main levée : /InkList en points page + apparence polyline. */
function addInk(doc, page, { points, color = [0, 0, 1], width = 1.5, contents = '' }) {
  const xs = points.map((p) => p[0] ?? p.x);
  const ys = points.map((p) => p[1] ?? p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const x1 = Math.max(...xs);
  const y1 = Math.max(...ys);

  const inkList = PDFArray.withContext(doc.context);
  const chemin = PDFArray.withContext(doc.context);
  for (const [x, y] of points.map((p) => [p[0] ?? p.x, p[1] ?? p.y])) {
    inkList.push(PDFNumber.of(x));
    inkList.push(PDFNumber.of(y));
    chemin.push(PDFNumber.of(x));
    chemin.push(PDFNumber.of(y));
  }
  const inkLists = PDFArray.withContext(doc.context);
  inkLists.push(chemin);

  const ops = [
    `${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])} RG`,
    `${fmt(width)} w`,
    `${fmt(xs[0])} ${fmt(ys[0])} m`,
    ...points.slice(1).map((p) => `${fmt(p[0] ?? p.x)} ${fmt(p[1] ?? p.y)} l`),
    'S',
  ];
  const form = makeForm(doc.context, {
    bbox: [x0, y0, x1, y1],
    resources: { ProcSet: ['PDF'] },
    content: ops.join('\n'),
  });
  const formRef = doc.context.register(form);

  return addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: 'Ink',
    Rect: [x0, y0, x1, y1],
    InkList: inkLists,
    C: color,
    BS: { W: width },
    Contents: contents || undefined,
    AP: { N: formRef },
  });
}

/** Note post-it : icône /Comment, texte dans /Contents. */
function addTextNote(doc, page, { rect, contents, name = 'Comment', color = [0.94, 0.69, 0.13] }) {
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const w = x1 - x0;
  const h = y1 - y0;
  const ops = [
    `${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])} rg`,
    `${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)} re f`,
    `${fmt(0)} ${fmt(0)} ${fmt(0)} rg`,
    `${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)} re S`,
  ];
  const form = makeForm(doc.context, {
    bbox: [x0, y0, x1, y1],
    resources: { ProcSet: ['PDF'] },
    content: ops.join('\n'),
  });
  const formRef = doc.context.register(form);

  return addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [x0, y0, x1, y1],
    C: color,
    Name: name,
    Contents: contents,
    AP: { N: formRef },
  });
}

/** Zone de texte : /DA par défaut + apparence texte WinAnsi. */
function addFreeText(doc, page, { rect, text, fontSize = 11, color = [0.13, 0.29, 0.53], contents = null }) {
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const propre = sanitizeWinAnsi(text ?? contents ?? '');
  const hexTexte = Array.from(octetsWinAnsi(propre), (b) => b.toString(16).padStart(2, '0')).join('');

  const da = `/Helv ${fontSize} Tf ${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])} rg`;
  const ops = [
    'BT',
    `/F1 ${fontSize} Tf`,
    `${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])} rg`,
    `${fmt(x0 + 2)} ${fmt(y0 + 2)} Td`,
    `<${hexTexte}> Tj`,
    'ET',
  ];
  const form = makeForm(doc.context, {
    bbox: [x0, y0, x1, y1],
    resources: {
      ProcSet: ['PDF', 'Text'],
      Font: { F1: 'Helvetica' },
    },
    content: ops.join('\n'),
  });
  const formRef = doc.context.register(form);

  return addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: 'FreeText',
    Rect: [x0, y0, x1, y1],
    DA: da,
    C: color,
    Contents: contents ?? propre,
    AP: { N: formRef },
  });
}

module.exports = { addHighlight, addSquare, addInk, addTextNote, addFreeText, sanitizeWinAnsi, octetsWinAnsi };
