// engine/annots.js — les annotations standard.
// Chaque annotation reçoit son /AP/N pour un rendu identique partout.
// v0.1.31 : Surligner gagne ses quatre formes (Plein /Highlight,
// Soulignement /Underline, Barré /StrikeOut, Ondulé /Squiggly) et sa
// couleur ; Encadrer gagne ses formes (rectangle, arrondi, ellipse
// /Circle, nuage /BE Cloudy), ses traits (continu, tirets, pointillés),
// ses épaisseurs et son remplissage teinté (/IC, ca 0.13 dans l'AP).
'use strict';

const { PDFName, PDFNumber, PDFArray } = require('pdf-lib');
const { makeForm, addAnnot, normalizeRect, sanitizeWinAnsi, octetsWinAnsi } = require('./annotcore.js');
const { hexVersRgb01 } = require('./couleurs.js');

const fmt = (v) => String(Math.round(v * 100) / 100);

/** Une arrive en tableau 0..1 ou en hexadécimal « #RRGGBB »
 * (palettes et cercle chromatique de la maquette validée). */
function couleur01(c, defaut) {
  if (typeof c === 'string') {
    const t = hexVersRgb01(c);
    if (t) return t;
  }
  if (Array.isArray(c) && c.length >= 3
    && c.every((v) => Number.isFinite(Number(v)))) {
    return [Number(c[0]), Number(c[1]), Number(c[2])].map((v) => Math.min(1, Math.max(0, v)));
  }
  return defaut;
}

/* ---------- v0.1.31 : arcs de Bézier pour les formes ----------
   Le PDF n'a que des cubiques : chaque arc (ellipse, coins arrondis,
   bosss du nuage) se compose d'une ou deux cubiques de précision
   k = 4/3·tan(θ/4), θ étant l'ouverture. */

/** Cubique d'un arc d'ellipse centré (cx, cy), de rayons rx/ry, de a0 à
 * a1 en radians (repère Y du PDF, vers le haut). Retourne la ligne
 * d'opérateurs SANS le point de départ (`m` posé par l'appelant). */
function arcCubique(cx, cy, rx, ry, a0, a1) {
  const k = (4 / 3) * Math.tan((a1 - a0) / 4);
  const px = (a) => cx + rx * Math.cos(a);
  const py = (a) => cy + ry * Math.sin(a);
  const dx = (a) => -rx * Math.sin(a);
  const dy = (a) => ry * Math.cos(a);
  return `${fmt(px(a0) + k * dx(a0))} ${fmt(py(a0) + k * dy(a0))} `
    + `${fmt(px(a1) - k * dx(a1))} ${fmt(py(a1) - k * dy(a1))} `
    + `${fmt(px(a1))} ${fmt(py(a1))} c`;
}

/**
 * Surlignage selon la forme choisie (maquette validée v0.1.31).
 * @param {object} p
 * @param {string} [p.forme='plein'] plein | souligne | barre | ondule
 * Les quatre formes sont des annotations STANDARD distinctes :
 * /Highlight, /Underline, /StrikeOut, /Squiggly ; la couleur voyage
 * dans /C, les rectangles dans /QuadPoints.
 */
function addHighlight(doc, page, { rect, quadPoints, color = [1, 1, 0], contents = '', forme = 'plein' }) {
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const c = couleur01(color, [1, 1, 0]);
  const quads = (quadPoints || [[x0, y1, x1, y1, x0, y0, x1, y0]]);
  const aplati = [];
  for (const q of quads) aplati.push(...q.map((v) => PDFNumber.of(v)));

  const nomForme = { plein: 'Highlight', souligne: 'Underline', barre: 'StrikeOut', ondule: 'Squiggly' }[forme]
    || 'Highlight';
  const ops = [];
  const resources = { ProcSet: ['PDF', 'Text'] };

  if (nomForme === 'Highlight') {
    // Aplat semi-transparent (/ca 0.35) comme depuis toujours.
    resources.ExtGState = { G0: { ca: 0.35, CA: 0.35 } };
    ops.push('/G0 gs', `${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])} rg`);
    ops.push(...quads.flatMap((q) => [
      `${fmt(q[0])} ${fmt(q[1])} m`,
      `${fmt(q[2])} ${fmt(q[3])} l`,
      `${fmt(q[6])} ${fmt(q[7])} l`,
      `${fmt(q[4])} ${fmt(q[5])} l`,
      'h f',
    ]));
  } else if (nomForme === 'Underline') {
    // Trait plein dans le bas de chaque rectangle.
    ops.push(`${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])} rg`);
    for (const q of quads) {
      const gx = Math.min(q[0], q[4]);
      const gw = Math.max(q[2], q[6]) - gx;
      const gy = Math.min(q[5], q[7]);
      ops.push(`${fmt(gx)} ${fmt(gy)} ${fmt(gw)} 1.8 re f`);
    }
  } else if (nomForme === 'StrikeOut') {
    // Trait plein au milieu de chaque rectangle.
    ops.push(`${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])} rg`);
    for (const q of quads) {
      const gx = Math.min(q[0], q[4]);
      const gw = Math.max(q[2], q[6]) - gx;
      const gy = (Math.max(q[1], q[3]) + Math.min(q[5], q[7])) / 2 - 0.7;
      ops.push(`${fmt(gx)} ${fmt(gy)} ${fmt(gw)} 1.4 re f`);
    }
  } else {
    // Ondulé : sinusoïde régulière sous la ligne, tracée en points.
    ops.push(`${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])} RG`, '0.9 w', '1 J');
    for (const q of quads) {
      const gx = Math.min(q[0], q[4]);
      const gw = Math.max(q[2], q[6]) - gx;
      const gy = Math.min(q[5], q[7]) + 1.5;
      const pas = 0.8;
      for (let t = 0; gx + t <= gx + gw + 1e-9; t += pas) {
        const y = gy + Math.sin((t / 5) * 2 * Math.PI) * 1.0;
        ops.push(`${fmt(gx + t)} ${fmt(y)} ${t === 0 ? 'm' : 'l'}`);
      }
      ops.push('S');
    }
  }

  const form = makeForm(doc.context, {
    bbox: [x0, y0, x1, y1],
    resources,
    content: ops.join('\n'),
  });
  const formRef = doc.context.register(form);

  return addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: nomForme,
    Rect: [x0, y0, x1, y1],
    QuadPoints: aplati,
    C: c,
    Contents: contents || undefined,
    AP: { N: formRef },
  });
}

/* ---------- v0.1.31 : marqueur des options de pose d'un cadre ----------
   « Cadre forme,trait,épaisseur[,teinte] » voyage dans /Contents : le
   redimensionnement REPOSE le cadre avec ses options (comme la fiche
   mixte repose sa source) au lieu de l'écraser en rectangle nu. */
const PREFIXE_CADRE = 'Cadre';
const MARQUEUR_CADRE = /^Cadre (rect|arrondi|ellipse|nuage),(continu|tirets|points),([0-9]+(?:[.,][0-9]+)?)(,teinte)?(?:\s|$)/;

/** Relit les options de pose d'un cadre depuis son /Contents, ou null. */
function lireOptionsCadre(contenu) {
  if (typeof contenu !== 'string') return null;
  const m = contenu.match(MARQUEUR_CADRE);
  if (!m) return null;
  return {
    forme: m[1],
    trait: m[2],
    borderWidth: Number(String(m[3]).replace(',', '.')) || 1.5,
    teinte: !!m[4],
  };
}

/**
 * Cadre selon la forme et le trait choisis (maquette validée v0.1.31).
 * @param {object} p
 * @param {string} [p.forme='rect']    rect | arrondi | ellipse | nuage
 * @param {string} [p.trait='continu'] continu | tirets | points
 * @param {boolean} [p.teinte=false]  remplissage de la couleur à 13 %
 * Le marqueur des options est posé dans /Contents ; l'ellipse est un
 * /Circle standard ; le nuage porte /BE { S /Cloudy } ; le trait voyage
 * dans /BS { W, D, Cap } ET dans l'AP.
 */
function addSquare(doc, page, {
  rect, color = [1, 0, 0], borderWidth = 1.5, fill = null,
  forme = 'rect', trait = 'continu', teinte = false,
}) {
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const w = x1 - x0;
  const h = y1 - y0;
  const c = couleur01(color, [1, 0, 0]);
  const bw = Number.isFinite(Number(borderWidth)) && borderWidth > 0 ? borderWidth : 1.5;

  const ops = [
    `${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])} RG`,
    `${fmt(bw)} w`,
  ];
  if (trait === 'tirets') ops.push('[7 5] 0 d');
  else if (trait === 'points') ops.push('[0.2 6] 0 d', '1 J');

  if (forme === 'ellipse') {
    const rx = Math.max(0.5, w / 2 - bw / 2);
    const ry = Math.max(0.5, h / 2 - bw / 2);
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    ops.push(`${fmt(cx - rx)} ${fmt(cy)} m`,
      arcCubique(cx, cy, rx, ry, Math.PI, Math.PI / 2),
      arcCubique(cx, cy, rx, ry, Math.PI / 2, 0),
      arcCubique(cx, cy, rx, ry, 0, -Math.PI / 2),
      arcCubique(cx, cy, rx, ry, -Math.PI / 2, -Math.PI));
  } else if (forme === 'arrondi') {
    const r = Math.min(12, w / 4, h / 4);
    const ax = x0 + r; // coins : quart de cercle
    const bx = x1 - r;
    const ay = y0 + r;
    const by = y1 - r;
    ops.push(`${fmt(ax)} ${fmt(y0)} m`,
      `${fmt(bx)} ${fmt(y0)} l`,
      arcCubique(bx, y0 + r, r, r, -Math.PI / 2, 0),
      `${fmt(x1)} ${fmt(by)} l`,
      arcCubique(x1 - r, by, r, r, 0, Math.PI / 2),
      `${fmt(ax)} ${fmt(y1)} l`,
      arcCubique(ax, by, r, r, Math.PI / 2, Math.PI),
      `${fmt(x0)} ${fmt(ay)} l`,
      arcCubique(ax, ay, r, r, Math.PI, Math.PI * 1.5));
  } else if (forme === 'nuage') {
    // Bosses en arcs de cercle le long d'un rectangle rentré, comme la
    // maquette : marge proportionnelle à l'épaisseur, cordes d'environ 15 pt.
    const m = Math.max(6, bw * 2.4);
    const nx = x0 + m; const ny = y0 + m;
    const nw = Math.max(4, w - 2 * m); const nh = Math.max(4, h - 2 * m);
    const pas = 15;
    // Chaque côté : cordes de longueur nw/nh, bosse vers l'extérieur.
    const cote = (ax, ay, bx, by, ox, oy) => {
      const dx = bx - ax; const dy = by - ay;
      const L = Math.hypot(dx, dy);
      const n = Math.max(2, Math.round(L / pas));
      const ux = dx / L; const uy = dy / L;
      let px = ax; let py = ay;
      ops.push(`${fmt(px)} ${fmt(py)} m`);
      for (let i = 1; i <= n; i += 1) {
        const qx2 = ax + (dx * i) / n;
        const qy2 = ay + (dy * i) / n;
        const mx2 = (px + qx2) / 2; const my2 = (py + qy2) / 2;
        const r = L / (n * 2);
        const a0 = Math.atan2(py - my2, px - mx2);
        const a1 = Math.atan2(qy2 - my2, qx2 - mx2);
        let sweep = a1 - a0;
        while (sweep > Math.PI) sweep -= 2 * Math.PI;
        while (sweep < -Math.PI) sweep += 2 * Math.PI;
        // Le sens se règle pour que la bosse sorte vers (ox, oy).
        const versExt = (Math.cos(a0 + sweep / 2) * ox + Math.sin(a0 + sweep / 2) * oy) > 0;
        const s = versExt ? sweep : -sweep;
        ops.push(arcCubique(mx2, my2, r, r, a0, a0 + s / 2),
          arcCubique(mx2, my2, r, r, a0 + s / 2, a0 + s));
        px = qx2; py = qy2;
      }
    };
    cote(nx, ny, nx + nw, ny, 0, -1);   // bas, bosse vers le bas
    cote(nx + nw, ny, nx + nw, ny + nh, 1, 0); // droite
    cote(nx + nw, ny + nh, nx, ny + nh, 0, 1); // haut
    cote(nx, ny + nh, nx, ny, -1, 0);   // gauche
  } else {
    ops.push(`${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)} re`);
  }

  // Fermeture : tracé seul (S) ou remplissage + tracé (B). Le rectangle
  // garde son opérateur mono-ligne historique (« x y w h re S »), que la
  // translation des apparences (engine/bouger.js) sait relire.
  const remplit = !!teinte || !!fill;
  if (remplit) ops.push(`${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])} rg`);
  if (forme === 'rect') {
    ops.push(`${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)} re ${remplit ? 'B' : 'S'}`);
  } else if (forme === 'ellipse' || forme === 'arrondi' || forme === 'nuage') {
    // Les chemins en cubiques sont déjà posés ; h referme le nuage.
    if (forme === 'nuage') ops.push('h');
    ops.push(remplit ? 'B' : 'S');
  } else {
    ops.push('S');
  }

  const resources = { ProcSet: ['PDF'] };
  if (teinte) resources.ExtGState = { G0: { ca: 0.13, CA: 0.13 } };
  const form = makeForm(doc.context, {
    bbox: [x0, y0, x1, y1],
    resources,
    content: (teinte ? ['/G0 gs'] : []).concat(ops).join('\n'),
  });
  const formRef = doc.context.register(form);

  const bs = { W: bw };
  if (trait === 'tirets') bs.D = [7, 5];
  else if (trait === 'points') { bs.D = [0.2, 6]; bs.Cap = 1; }

  return addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: forme === 'ellipse' ? 'Circle' : 'Square',
    Rect: [x0, y0, x1, y1],
    C: c,
    BS: bs,
    ...(remplit ? { IC: teinte ? c : (Array.isArray(fill) && fill.length >= 3 ? couleur01(fill, c) : c) } : {}),
    ...(forme === 'nuage' ? { BE: { S: 'Cloudy', IW: Math.min(2, bw / 1.7) } } : {}),
    // v0.1.31 : les options de pose voyagent derrière le marqueur.
    Contents: `Cadre ${forme},${trait},${String(bw).replace('.', ',')}${teinte ? ',teinte' : ''}`,
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
function addFreeText(doc, page, { rect, text, fontSize = 11, color = [0.13, 0.29, 0.53], contents = null, subject = 'Fiche' }) {
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
    // v0.1.12 : « Note » (texte nu) ou « Fiche » (carte) ; les fiches des
    // versions antérieures, sans sujet, restent des cartes.
    Subject: subject,
    AP: { N: formRef },
  });
}

module.exports = {
  addHighlight, addSquare, addInk, addTextNote, addFreeText,
  sanitizeWinAnsi, octetsWinAnsi, couleur01, lireOptionsCadre, PREFIXE_CADRE,
};
