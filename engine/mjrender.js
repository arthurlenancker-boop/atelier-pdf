// engine/mjrender.js — Tâche 5 : LaTeX -> opérateurs PDF (via MathJax SVG).
// Portage complet du convertisseur svg2pdf validé par le prototype :
// glyphes <defs>/<use> en chemins, rectangles en m/l/h f, composition des
// matrices transform (translate/scale/matrix), chemins M m L l H h V v C c
// Q q T t S s Z z avec quadratiques converties en cubiques.
'use strict';

const { mathjax } = require('mathjax-full/js/mathjax.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { SVG } = require('mathjax-full/js/output/svg.js');

// Configurations TeX chargées explicitement (mhchem écarté : il exige le
// module externe mhchemparser).
require('mathjax-full/js/input/tex/base/BaseConfiguration.js');
require('mathjax-full/js/input/tex/ams/AmsConfiguration.js');
require('mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js');
require('mathjax-full/js/input/tex/color/ColorConfiguration.js');
require('mathjax-full/js/input/tex/mathtools/MathtoolsConfiguration.js');

const IDENT = [1, 0, 0, 1, 0, 0];

// Instance MathJax unique : liteAdaptor, sortie SVG, cache de polices local
// (les glyphes sont dans <defs> du même <svg>).
const adaptateur = liteAdaptor();
RegisterHTMLHandler(adaptateur);
const texJax = new TeX({ packages: ['base', 'ams', 'newcommand', 'color', 'mathtools'] });
const svgJax = new SVG({ fontCache: 'local' });
const MJDOC = mathjax.document('', { InputJax: texJax, OutputJax: svgJax });

/** Erreur de mise en forme, toujours explicite pour l'utilisateur. */
class MjrenderError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'MjrenderError';
    this.cause = cause;
  }
}

/* ---------- Matrices affines 2D [a, b, c, d, e, f] ---------- */

function matMul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyM(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Analyse un attribut transform SVG : matrix, translate, scale. */
function parseTransform(str) {
  let m = IDENT;
  if (!str) return m;
  const re = /(matrix|translate|scale)\s*\(([^)]*)\)/g;
  let t;
  while ((t = re.exec(String(str)))) {
    const nums = t[2].trim().split(/[\s,]+/).map(Number);
    if (t[1] === 'matrix') m = matMul(m, nums);
    else if (t[1] === 'translate') m = matMul(m, [1, 0, 0, 1, nums[0], nums[1] || 0]);
    else if (t[1] === 'scale') m = matMul(m, [nums[0], 0, 0, nums.length > 1 ? nums[1] : nums[0], 0, 0]);
  }
  return m;
}

/* ---------- Chemins SVG : tout est converti en L et C ---------- */

/**
 * Analyse un attribut d en sous-chemins : { start:[x,y], segs:[{L}|{C}], closed }.
 * Les commandes Q/q/T/t (quadratiques) et S/s sont converties en cubiques.
 */
function parsePath(d) {
  const subpaths = [];
  let cur = [0, 0];
  let start = null;
  let segs = [];
  let lastC2 = null; // dernier contrôle cubique 2 (pour S)
  let lastQ = null;  // dernier contrôle quadratique (pour T)

  const jetons = String(d).match(/[MmLlHhVvCcSsQqTtZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const num = () => parseFloat(jetons[i++]);

  const cubicVers = (p1, p2, p3) => {
    segs.push({ C: [p1, p2, p3] });
    cur = p3;
    lastC2 = p2;
    lastQ = null;
  };
  const lineVers = (p) => {
    segs.push({ L: [p] });
    cur = p;
    lastC2 = null;
    lastQ = null;
  };
  const fermeSousChemin = () => {
    if (segs.length) subpaths.push({ start, segs, closed: true });
    segs = [];
    cur = start;
  };

  let i = 0;
  while (i < jetons.length) {
    const t = jetons[i++];
    switch (t) {
      case 'M': case 'm': {
        const x = num(); const y = num();
        if (segs.length) subpaths.push({ start, segs, closed: false });
        cur = t === 'M' ? [x, y] : [cur[0] + x, cur[1] + y];
        start = cur;
        segs = [];
        break;
      }
      case 'L': lineVers([num(), num()]); break;
      case 'l': lineVers([cur[0] + num(), cur[1] + num()]); break;
      case 'H': lineVers([num(), cur[1]]); break;
      case 'h': lineVers([cur[0] + num(), cur[1]]); break;
      case 'V': lineVers([cur[0], num()]); break;
      case 'v': lineVers([cur[0], cur[1] + num()]); break;
      case 'C': cubicVers([num(), num()], [num(), num()], [num(), num()]); break;
      case 'c': {
        const [dx1, dy1] = [num(), num()];
        const [dx2, dy2] = [num(), num()];
        const [dx, dy] = [num(), num()];
        cubicVers([cur[0] + dx1, cur[1] + dy1], [cur[0] + dx2, cur[1] + dy2], [cur[0] + dx, cur[1] + dy]);
        break;
      }
      case 'S': {
        const reflexe = lastC2 ? [2 * cur[0] - lastC2[0], 2 * cur[1] - lastC2[1]] : [cur[0], cur[1]];
        cubicVers(reflexe, [num(), num()], [num(), num()]);
        break;
      }
      case 's': {
        const reflexe = lastC2 ? [2 * cur[0] - lastC2[0], 2 * cur[1] - lastC2[1]] : [cur[0], cur[1]];
        const [dx2, dy2] = [num(), num()];
        const [dx, dy] = [num(), num()];
        cubicVers(reflexe, [cur[0] + dx2, cur[1] + dy2], [cur[0] + dx, cur[1] + dy]);
        break;
      }
      case 'Q': {
        const [qx, qy] = [num(), num()];
        const [x, y] = [num(), num()];
        const c1 = [cur[0] + 2 / 3 * (qx - cur[0]), cur[1] + 2 / 3 * (qy - cur[1])];
        const c2 = [x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y)];
        lastQ = [qx, qy];
        cubicVers(c1, c2, [x, y]);
        break;
      }
      case 'q': {
        const [dqx, dqy] = [num(), num()];
        const [dx, dy] = [num(), num()];
        const q = [cur[0] + dqx, cur[1] + dqy];
        const p = [cur[0] + dx, cur[1] + dy];
        const c1 = [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])];
        const c2 = [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])];
        lastQ = q;
        cubicVers(c1, c2, p);
        break;
      }
      case 'T': {
        const [x, y] = [num(), num()];
        const q = lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur;
        const c1 = [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])];
        const c2 = [x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y)];
        lastQ = q;
        cubicVers(c1, c2, [x, y]);
        break;
      }
      case 't': {
        const [dx, dy] = [num(), num()];
        const p = [cur[0] + dx, cur[1] + dy];
        const q = lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur;
        const c1 = [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])];
        const c2 = [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])];
        lastQ = q;
        cubicVers(c1, c2, p);
        break;
      }
      case 'Z': case 'z': fermeSousChemin(); break;
      default:
        throw new Error(`Commande de chemin non gérée : ${t}`);
    }
  }
  if (segs.length) subpaths.push({ start, segs, closed: false });
  return subpaths;
}

/* ---------- Conteneur MathJax -> opérateurs PDF dans [0..widthPt]x[0..heightPt] */
function mjContainerToPdf(container, exPt, rgb) {
  const r = rgb || [0, 0, 0];
  const svgNode = container.children.find((n) => n.kind === 'svg');
  if (!svgNode) throw new Error('Pas de <svg> dans le conteneur MathJax');

  const vb = (svgNode.attributes.viewBox || '').split(/\s+/).map(Number);
  if (vb.length !== 4) throw new Error('viewBox absent');
  const [vbx, vby, vbw, vbh] = vb;

  const styleDepthEx = parseFloat(
    (String(svgNode.attributes.style || '').match(/-\d[\d.]*/) || ['0'])[0]) || 0;
  const wEx = parseFloat(svgNode.attributes.width) || vbw / 441.955;
  const hEx = parseFloat(svgNode.attributes.height) || vbh / 441.955;
  const widthPt = wEx * exPt;
  const heightPt = hEx * exPt;
  const depthPt = -styleDepthEx * exPt;

  const k = widthPt / vbw;

  const glyphs = new Map();
  const defs = svgNode.children.find((n) => n.kind === 'defs');
  if (defs) {
    for (const p of defs.children) {
      if (p.kind === 'path' && p.attributes.id && p.attributes.d) {
        glyphs.set('#' + p.attributes.id, parsePath(p.attributes.d));
      }
    }
  }

  const ops = [];
  const fmt = (v) => String(Math.round(v * 100) / 100);

  /** viewBox (y vers le bas) -> points PDF du Form XObject (y vers le haut). */
  function toPdf(p) {
    return [(p[0] - vbx) * k, (vbh + vby - p[1]) * k];
  }

  function dessineSousChemins(subpaths, m) {
    for (const sp of subpaths) {
      const pts = [toPdf(applyM(m, sp.start[0], sp.start[1]))];
      ops.push(`${fmt(pts[0][0])} ${fmt(pts[0][1])} m`);
      for (const seg of sp.segs) {
        if (seg.L) {
          const pt = toPdf(applyM(m, seg.L[0][0], seg.L[0][1]));
          ops.push(`${fmt(pt[0])} ${fmt(pt[1])} l`);
        } else if (seg.C) {
          const a = toPdf(applyM(m, seg.C[0][0], seg.C[0][1]));
          const b = toPdf(applyM(m, seg.C[1][0], seg.C[1][1]));
          const c = toPdf(applyM(m, seg.C[2][0], seg.C[2][1]));
          ops.push(`${fmt(a[0])} ${fmt(a[1])} ${fmt(b[0])} ${fmt(b[1])} ${fmt(c[0])} ${fmt(c[1])} c`);
        }
      }
      ops.push('h f');
    }
  }

  function walk(node, m) {
    for (const enfant of (node.children || [])) {
      const mEnfant = matMul(m, parseTransform(enfant.attributes && enfant.attributes.transform));
      if (enfant.kind === 'use') {
        const href = enfant.attributes['xlink:href'] || enfant.attributes.href;
        const subpaths = glyphs.get(href);
        if (subpaths) dessineSousChemins(subpaths, mEnfant);
      } else if (enfant.kind === 'path' && enfant.attributes.d) {
        dessineSousChemins(parsePath(enfant.attributes.d), mEnfant);
      } else if (enfant.kind === 'rect') {
        const rx = parseFloat(enfant.attributes.x || 0);
        const ry = parseFloat(enfant.attributes.y || 0);
        const rw = parseFloat(enfant.attributes.width || 0);
        const rh = parseFloat(enfant.attributes.height || 0);
        const corners = [[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]];
        const pts = corners.map((c) => toPdf(applyM(mEnfant, c[0], c[1])));
        ops.push(`${fmt(pts[0][0])} ${fmt(pts[0][1])} m`);
        for (let ci = 1; ci < 4; ci++) ops.push(`${fmt(pts[ci][0])} ${fmt(pts[ci][1])} l`);
        ops.push('h f');
      } else {
        walk(enfant, mEnfant);
      }
    }
  }

  const startG = svgNode.children.find((n) => n.kind === 'g');
  if (startG) walk({ children: [startG] }, IDENT);

  const body = ops.join('\n');
  const header = `${fmt(r[0])} ${fmt(r[1])} ${fmt(r[2])} rg`;
  return { widthPt, heightPt, depthPt, ops: `${header}\n${body}` };
}

/** Détecte un marqueur d'erreur MathJax dans l'arbre rendu (data-mjx-error). */
function chercherErreur(node) {
  if (node.attributes && node.attributes['data-mjx-error']) {
    return String(node.attributes['data-mjx-error']);
  }
  for (const child of node.children || []) {
    const msg = chercherErreur(child);
    if (msg) return msg;
  }
  return null;
}

/** LaTeX -> { widthPt, heightPt, depthPt, ops } prêts pour un Form XObject. */
function mjRender(latex, exPt, opts) {
  const o = opts || {};
  try {
    const node = MJDOC.convert(String(latex), { display: !!o.display });
    const erreur = chercherErreur(node);
    if (erreur) {
      throw new MjrenderError(
        `Cette équation n'a pas pu être mise en forme (${erreur}) : ${latex}`
      );
    }
    return mjContainerToPdf(node, exPt, o.rgb);
  } catch (err) {
    if (err instanceof MjrenderError) throw err;
    throw new MjrenderError(
      `Cette équation n'a pas pu être mise en forme : ${latex} (${err.message})`,
      err
    );
  }
}

module.exports = { mjRender, MjrenderError };
