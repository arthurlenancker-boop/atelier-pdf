// renderer/app.js — Tâche 10 : visionneuse pdf.js, cinq outils, panneau Équation.
// Module ESM du processus de rendu. Aucune écriture directe de fichier ici :
// tout passe par window.atelier (pont preload) vers le processus principal.
'use strict';

import * as pdfjsLib from 'app://local/libs/pdfjs-dist/build/pdf.min.mjs';
import '../engine/coords.js'; // expose globalThis.AtelierCoords

const { deviceToPdf, quadPointsForRange } = globalThis.AtelierCoords;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'app://local/libs/pdfjs-dist/build/pdf.worker.min.mjs';

/* ============================================================
   Ruban Équation — données de la maquette (structures OneNote)
   ============================================================ */
const PRESETS = [
  { label: 'Carré', src: '(a + b)^2 = a^2 + 2ab + b^2' },
  { label: 'Différence', src: 'a^2 - b^2 = (a - b)(a + b)' },
  { label: 'Racines', src: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { label: 'Somme', src: 'S_n = \\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}' },
  { label: 'Trigonométrie', src: '\\cos^2 x + \\sin^2 x = 1' },
];

const STRUCTS = [
  {
    group: 'Base',
    items: [
      { label: 'Fraction', tex: '\\frac{}{}', viz: '\\frac{x}{y}' },
      { label: 'Exposant', tex: '^{}', viz: 'x^2' },
      { label: 'Indice', tex: '_{}', viz: 'x_i' },
      { label: 'Exp + ind', tex: '^{}_{}', viz: 'x_a^b' },
      { label: 'Racine', tex: '\\sqrt{}', viz: '\\sqrt{x}' },
      { label: 'Racine n', tex: '\\sqrt[n]{}', viz: '\\sqrt[3]{x}' },
    ],
  },
  {
    group: 'Grands opérateurs',
    items: [
      { label: 'Somme', tex: '\\sum_{}^{}', viz: '\\sum_{k=1}^{n} k' },
      { label: 'Produit', tex: '\\prod_{}^{}', viz: '\\prod_{k=1}^{n} k' },
      { label: 'Intégrale', tex: '\\int_{}^{}', viz: '\\int_{0}^{1}' },
      { label: 'Circulaire', tex: '\\oint_{}^{}', viz: '\\oint_{C}' },
    ],
  },
  {
    group: 'Crochets',
    items: [
      { label: '( )', tex: '( )', viz: '(x)' },
      { label: '[ ]', tex: '[ ]', viz: '[x]' },
      { label: '{ }', tex: '{ }', viz: '{x}' },
      { label: '| x |', tex: '| |', viz: '|x|' },
      { label: '‖ x ‖', tex: '\\| \\|', viz: '\\|x\\|' },
      { label: '⟨ x ⟩', tex: '\\langle \\rangle', viz: '\\langle x \\rangle' },
    ],
  },
  {
    group: 'Fonctions & limites',
    items: [
      { label: 'sin', tex: '\\sin()', viz: '\\sin(x)' },
      { label: 'ln', tex: '\\ln()', viz: '\\ln(x)' },
      { label: 'log base', tex: '\\log_{}', viz: '\\log_{2}' },
      { label: 'lim', tex: '\\lim_{}', viz: '\\lim_{x \\to 0}' },
      { label: 'min', tex: '\\min_{}', viz: '\\min_{x}' },
      { label: 'max', tex: '\\max_{}', viz: '\\max_{x}' },
    ],
  },
  {
    group: 'Accents',
    items: [
      { label: 'Vecteur', tex: '\\vec{}', viz: '\\vec{v}' },
      { label: 'Barre', tex: '\\bar{}', viz: '\\bar{x}' },
      { label: 'Chapeau', tex: '\\hat{}', viz: '\\hat{x}' },
      { label: 'Point', tex: '\\dot{}', viz: '\\dot{x}' },
      { label: 'Pt double', tex: '\\ddot{}', viz: '\\ddot{x}' },
      { label: 'Tilde', tex: '\\tilde{}', viz: '\\tilde{x}' },
    ],
  },
  {
    group: 'Matrices',
    items: [
      { label: '2×2', tex: '\\matrix{a & b \\\\ c & d}', viz: '\\matrix{a & b \\\\ c & d}' },
      { label: 'Avec ( )', tex: '\\left(\\matrix{a & b \\\\ c & d}\\right)', viz: '\\left(\\matrix{a & b \\\\ c & d}\\right)' },
    ],
  },
];

const SYMR = [
  {
    name: 'Basiques',
    items: [
      ['\\pm', '±'], ['\\times', '×'], ['\\cdot', '·'], ['\\div', '÷'], ['\\ne', '≠'],
      ['\\le', '≤'], ['\\ge', '≥'], ['\\approx', '≈'], ['\\degree', '°'], ['\\infty', '∞'],
      ['\\partial', '∂'], ['\\forall', '∀'], ['\\exists', '∃'],
    ],
  },
  {
    name: 'Grecques',
    items: [
      ['\\alpha', 'α'], ['\\beta', 'β'], ['\\gamma', 'γ'], ['\\delta', 'δ'], ['\\pi', 'π'],
      ['\\theta', 'θ'], ['\\lambda', 'λ'], ['\\mu', 'μ'], ['\\rho', 'ρ'], ['\\sigma', 'σ'],
      ['\\phi', 'φ'], ['\\omega', 'ω'], ['\\Delta', 'Δ'], ['\\Sigma', 'Σ'], ['\\Omega', 'Ω'], ['\\Pi', 'Π'],
    ],
  },
  {
    name: 'Ensembles & flèches',
    items: [
      ['\\in', '∈'], ['\\notin', '∉'], ['\\subset', '⊂'], ['\\cap', '∩'], ['\\cup', '∪'],
      ['\\rightarrow', '→'], ['\\Rightarrow', '⇒'], ['\\leftrightarrow', '↔'], ['\\parallel', '∥'],
      ['\\perp', '⊥'], ['\\angle', '∠'], ['\\equiv', '≡'], ['\\cdots', '⋯'], ['\\ldots', '…'],
    ],
  },
];

/* Transcodage Linéaire -> LaTeX : symboles tapés au clavier ou collés. */
const LINEAIRE = new Map();
for (const cat of SYMR) {
  for (const [tex, car] of cat.items) LINEAIRE.set(car, tex);
}
LINEAIRE.set('√', '\\sqrt');
function transcoderLineaire(saisie) {
  let hors = '';
  for (const car of saisie) hors += LINEAIRE.get(car) ?? car;
  return hors;
}

/* ============================================================
   État global
   ============================================================ */
const $ = (sel) => document.querySelector(sel);

const etat = {
  chemin: null,
  resume: null,   // { chemin, modifie, pageCount, annots } renvoyé par le main
  pdfjs: null,    // document pdf.js (affichage seulement)
  page: 1,
  zoom: 1,
  outil: 'aucun',
  annotsPdf: [],  // annotations au format PDF de la page courante { ref, subtype, rect, contents, page }
  eqMode: 'pro',
  eqApercu: null, // dernier aperçu { widthPt, heightPt, depthPt, ops }
  eqPoint: null,  // dernier clic Équation : { pageIndex, point }
  eqExPt: 4.5,
  selection: null,
  saisieAttente: null, // { kind, rect, pageIndex } pendant la fenêtre de saisie
  cacheOps: new Map(), // « pageIndex:objectNumber » -> ops d'équation, pour le calque
};

const els = {
  accueil: $('#accueil'),
  visionneuse: $('#visionneuse'),
  conteneur: $('#conteneur-page'),
  calquePdf: $('#calque-pdf'),
  calqueAnnots: $('#calque-annots'),
  calqueTampon: $('#calque-tampon'),
};

/* ============================================================
   Utilitaires
   ============================================================ */
function message(texte, ton = 'info') {
  const p = $('#message-etat');
  p.textContent = texte;
  p.style.color = ton === 'erreur' ? '#FF5C7A'
    : ton === 'reussite' ? '#3DDC97' : '';
}

function majResume(resume) {
  etat.resume = resume;
  etat.chemin = resume ? resume.chemin : null;
  $('#nom-fichier').textContent = resume ? resume.chemin : 'Aucun document ouvert';
  $('#etiquette-page').textContent = resume ? `${etat.page} / ${resume.pageCount}` : '–';
  $('#btn-enregistrer').disabled = !resume;
  $('#btn-copie').disabled = !resume;
  dessinerAnnots();
}

window.atelier.onChanged((infos) => {
  const pastille = $('#pastille-modifie');
  pastille.hidden = !(infos && infos.modifie);
});

/* ============================================================
   Ouverture et rendu pdf.js
   ============================================================ */
async function ouvrirDocument(chemin) {
  const rep = await window.atelier.open(chemin);
  if (rep.annule) return;
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  etat.resume = null;
  etat.annotsPdf = [];
  etat.selection = null;
  etat.eqPoint = null;
  etat.cacheOps.clear();
  etat.chemin = rep.resume.chemin;
  etat.page = 1;
  if (etat.pdfjs) { await etat.pdfjs.destroy(); etat.pdfjs = null; }
  // pdf.js détache le tampon qu'on lui donne : une copie protège l'original.
  etat.pdfjs = await pdfjsLib.getDocument({ data: Uint8Array.from(rep.octets) }).promise;
  els.accueil.hidden = true;
  els.visionneuse.hidden = false;
  majResume(rep.resume);
  await rendPage();
  message(`Document ouvert : ${rep.resume.pageCount} page(s).`, 'reussite');
}

async function rendPage() {
  if (!etat.pdfjs || !etat.resume) return;
  const page = await etat.pdfjs.getPage(etat.page);
  const viewport = page.getViewport({ scale: etat.zoom });
  const { width, height, rotation } = viewport;
  for (const c of [els.calquePdf, els.calqueAnnots, els.calqueTampon]) {
    c.width = Math.max(1, Math.round(width));
    c.height = Math.max(1, Math.round(height));
    c.style.width = `${Math.round(width)}px`;
    c.style.height = `${Math.round(height)}px`;
  }
  els.conteneur.style.width = `${Math.round(width)}px`;
  els.conteneur.style.height = `${Math.round(height)}px`;
  etat.viewport = { scale: etat.zoom, rotation: rotation % 360, pageW: page.view[2], pageH: page.view[3] };
  await page.render({ canvasContext: els.calquePdf.getContext('2d'), viewport }).promise;
  dessinerAnnots();
  $('#etiquette-page').textContent = `${etat.page} / ${etat.resume.pageCount}`;
  $('#etiquette-zoom').textContent = `${Math.round(etat.zoom * 100)} %`;
}

/* ============================================================
   Calque d'apparence des annotations (lectures du /Rect)
   ============================================================ */
function pdfVersEcran(pt) {
  // Inverse exact de deviceToPdf, pour tracer les rectangles du /Rect.
  const { scale, rotation, pageW, pageH } = etat.viewport;
  let u; let v;
  switch (rotation) {
    case 0: u = pt.x; v = pageH - pt.y; break;
    case 90: v = pt.x; u = pt.y; break;
    case 180: u = pageW - pt.x; v = pageH - pt.y; break;
    default: v = pageW - pt.x; u = pageH - pt.y; break;
  }
  return { x: u * scale, y: v * scale };
}

function tracceEquation(ctx, apercu, rect) {
  // Trace les opérateurs vectoriels d'une équation dans son rectangle d'écran.
  const c0 = pdfVersEcran({ x: rect[0], y: rect[1] });
  const c1 = pdfVersEcran({ x: rect[2], y: rect[3] });
  const x0 = Math.min(c0.x, c1.x);
  const y0 = Math.min(c0.y, c1.y);
  const k = Math.abs(c1.x - c0.x) / (apercu.widthPt || 1);
  const px = (x) => x0 + x * k;
  const py = (y) => y0 + (apercu.heightPt - y) * k;
  ctx.save();
  ctx.fillStyle = '#111319';
  ctx.strokeStyle = '#111319';
  ctx.lineWidth = Math.max(0.6, 0.9 * k);
  const p = new Path2D();
  const mots = apercu.ops.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < mots.length) {
    const t = mots[i];
    const attendus = { m: 2, l: 2, c: 6, re: 4 }[t];
    if (attendus !== undefined) {
      const v = [];
      for (let j = 0; j < attendus; j++) v.push(Number(mots[i - attendus + j]));
      if (t === 'm') p.moveTo(px(v[0]), py(v[1]));
      else if (t === 'l') p.lineTo(px(v[0]), py(v[1]));
      else if (t === 'c') p.bezierCurveTo(px(v[0]), py(v[1]), px(v[2]), py(v[3]), px(v[4]), py(v[5]));
      else if (t === 're') p.rect(px(v[0]), py(v[1] + v[3]), v[2] * k, v[3] * k);
      i += 1;
    } else if (t === 'f') { ctx.fill(p); p = new Path2D(); i += 1; }
    else if (t === 'S') { ctx.stroke(p); i += 1; }
    else { i += 1; } // h, rg, w, gs : ignorés pour le calque d'apparence
  }
  ctx.fill(p);
  ctx.stroke(p);
  ctx.restore();
}

async function dessinerAnnots() {
  const ctx = els.calqueAnnots.getContext('2d');
  ctx.clearRect(0, 0, els.calqueAnnots.width, els.calqueAnnots.height);
  if (!etat.resume) return;
  const annots = etat.resume.annots.filter((a) => a.page === etat.page - 1);
  for (const a of annots) {
    const c0 = pdfVersEcran({ x: a.rect[0], y: a.rect[1] });
    const c1 = pdfVersEcran({ x: a.rect[2], y: a.rect[3] });
    const x = Math.min(c0.x, c1.x);
    const y = Math.min(c0.y, c1.y);
    const w = Math.abs(c1.x - c0.x);
    const h = Math.abs(c1.y - c0.y);
    ctx.save();
    if (a.subtype === 'Highlight') {
      ctx.fillStyle = 'rgba(232, 179, 75, 0.42)';
      ctx.fillRect(x, y, w, h);
    } else if (a.subtype === 'Square') {
      const estEq = (a.contents || '').startsWith('Équation LaTeX');
      if (estEq) {
        ctx.strokeStyle = 'rgba(76, 111, 255, 0.0)'; // invisible : l'équation est dans le fichier
        const enCache = etat.cacheOps.get(`${a.page}:${a.ref && a.ref.objectNumber}`);
        if (enCache) {
          tracceEquation(ctx, enCache, a.rect);
        } else {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(167, 175, 192, 0.35)';
          ctx.strokeRect(x, y, w, h);
        }
      } else {
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 1.5 * etat.zoom;
        ctx.strokeRect(x, y, w, h);
      }
    } else if (a.subtype === 'Ink') {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(86, 168, 255, 0.6)';
      ctx.strokeRect(x, y, w, h);
    } else if (a.subtype === 'Text') {
      ctx.fillStyle = '#F0B044';
      ctx.fillRect(x, y, Math.max(w, 14), Math.max(h, 14));
      ctx.strokeStyle = '#8a6a10';
      ctx.strokeRect(x, y, Math.max(w, 14), Math.max(h, 14));
    } else if (a.subtype === 'FreeText') {
      ctx.fillStyle = 'rgba(37, 51, 125, 0.85)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = `${11 * etat.zoom}px sans-serif`;
      ctx.fillText(String(a.contents || '').slice(0, 40), x + 3, y + 14 * etat.zoom);
    }
    // Annotation sans /AP (autrui) : rectangle pointillé gris, lecture seule.
    if (a.hasAP === false) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(107, 115, 134, 0.6)';
      ctx.strokeRect(x, y, w, h);
    }
    // Sélection : liseret accentué.
    if (etat.selection
      && etat.selection.ref && a.ref
      && etat.selection.ref.objectNumber === a.ref.objectNumber) {
      ctx.setLineDash([]);
      ctx.strokeStyle = '#4C6FFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    }
    ctx.restore();
  }
}

/* ============================================================
   Aiguillage des outils vers le moteur (session.apply)
   ============================================================ */
async function appliquer(edit) {
  const rep = await window.atelier.applyEdits([edit]);
  if (rep.erreur) { message(rep.erreur, 'erreur'); return null; }
  majResume(rep.resume);
  return rep;
}

function pointPdf(ev) {
  const r = els.calqueTampon.getBoundingClientRect();
  return deviceToPdf(ev.clientX - r.left, ev.clientY - r.top, etat.viewport);
}

function ecouterSouris() {
  let geste = null; // { outil, depart, point, points[] }

  els.calqueTampon.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    els.calqueTampon.setPointerCapture(ev.pointerId);
    const point = pointPdf(ev);
    if (etat.outil === 'aucun') {
      selectionner(point);
      return;
    }
    if (etat.outil === 'surligner' || etat.outil === 'encadrer' || etat.outil === 'fiche') {
      geste = { outil: etat.outil, depart: point };
    } else if (etat.outil === 'encre') {
      geste = { outil: 'encre', points: [point] };
    } else if (etat.outil === 'note') {
      ouvrirSaisie('note', point);
    } else if (etat.outil === 'equation') {
      etat.eqPoint = { pageIndex: etat.page - 1, point };
      $('#eq-inserer').disabled = false;
      const note = $('#eq-note');
      note.textContent = `Point d'insertion posé (page ${etat.page}). Choisissez la formule, puis Insérer.`;
      note.classList.add('ok');
    }
  });

  els.calqueTampon.addEventListener('pointermove', (ev) => {
    if (!geste) return;
    const point = pointPdf(ev);
    const ctx = els.calqueTampon.getContext('2d');
    ctx.clearRect(0, 0, els.calqueTampon.width, els.calqueTampon.height);
    const a = pdfVersEcran(geste.depart);
    const b = pdfVersEcran(point);
    if (geste.outil === 'encre') {
      geste.points.push(point);
      ctx.strokeStyle = '#56A8FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      geste.points.forEach((p, i) => {
        const e = pdfVersEcran(p);
        if (i === 0) ctx.moveTo(e.x, e.y); else ctx.lineTo(e.x, e.y);
      });
      ctx.stroke();
    } else {
      ctx.fillStyle = geste.outil === 'surligner' ? 'rgba(232, 179, 75, 0.35)' : 'rgba(76, 111, 255, 0.15)';
      ctx.strokeStyle = 'rgba(76, 111, 255, 0.8)';
      const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y);
      ctx.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      if (geste.outil !== 'surligner') ctx.strokeRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      geste.point = point;
    }
  });

  els.calqueTampon.addEventListener('pointerup', async (ev) => {
    if (!geste) return;
    const pageIndex = etat.page - 1;
    try {
      if (geste.outil === 'encre') {
        if (geste.points.length >= 2) {
          await appliquer({ kind: 'ink', pageIndex, args: { points: geste.points } });
          message('Trait d\'encre posé.', 'reussite');
        }
      } else if (geste.point) {
        const A = geste.depart; const B = geste.point;
        const rect = [Math.min(A.x, B.x), Math.min(A.y, B.y), Math.max(A.x, B.x), Math.max(A.y, B.y)];
        if (geste.outil === 'surligner') {
          const quadPoints = quadPointsForRange(A, B);
          await appliquer({ kind: 'highlight', pageIndex, args: { rect, quadPoints } });
          message('Surlignage posé.', 'reussite');
        } else if (geste.outil === 'encadrer') {
          await appliquer({ kind: 'square', pageIndex, args: { rect } });
          message('Encadré posé.', 'reussite');
        } else if (geste.outil === 'fiche') {
          ouvrirSaisie('fiche', null, { kind: 'freeText', pageIndex, args: { rect } });
        }
      }
    } finally {
      geste = null;
      const ctx = els.calqueTampon.getContext('2d');
      ctx.clearRect(0, 0, els.calqueTampon.width, els.calqueTampon.height);
    }
    void ev;
  });
}

function selectionner(point) {
  if (!etat.resume) return;
  const annots = etat.resume.annots.filter((a) => a.page === etat.page - 1 && a.ref);
  const cible = annots.find((a) => point.x >= a.rect[0] && point.x <= a.rect[2]
    && point.y >= a.rect[1] && point.y <= a.rect[3]);
  etat.selection = cible || null;
  dessinerAnnots();
  if (cible) {
    message(`Annotation ${cible.subtype} sélectionnée. Touche Suppr pour retirer.`);
  } else {
    message('Aucune annotation sous le curseur.');
  }
}

async function supprimerSelection() {
  if (!etat.selection || !etat.selection.ref) return;
  const rep = await window.atelier.applyEdits([{
    kind: 'remove',
    pageIndex: etat.selection.page,
    args: { ref: etat.selection.ref },
  }]);
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  etat.selection = null;
  majResume(rep.resume);
  message('Annotation supprimée.', 'reussite');
}

/* ============================================================
   Fenêtre de saisie (note et fiche)
   ============================================================ */
function ouvrirSaisie(genre, point, attente) {
  const fond = $('#saisie-fond');
  const titre = $('#saisie-titre');
  const champ = $('#saisie-texte');
  if (genre === 'note' && point) {
    const rect = [point.x, point.y, point.x + 18, point.y + 18];
    etat.saisieAttente = { kind: 'textNote', pageIndex: etat.page - 1, args: { rect } };
    titre.textContent = 'Note (icône post-it, texte au survol dans Adobe)';
  } else if (attente) {
    etat.saisieAttente = attente;
    titre.textContent = 'Fiche : texte écrit sur la page';
  }
  champ.value = '';
  fond.hidden = false;
  champ.focus();
}

$('#saisie-annuler').addEventListener('click', () => { $('#saisie-fond').hidden = true; etat.saisieAttente = null; });

$('#saisie-valider').addEventListener('click', async () => {
  const texte = $('#saisie-texte').value;
  $('#saisie-fond').hidden = true;
  const attente = etat.saisieAttente;
  etat.saisieAttente = null;
  if (!attente || !texte.trim()) return;
  const args = { ...attente.args };
  if (attente.kind === 'textNote') args.contents = texte;
  if (attente.kind === 'freeText') args.text = texte;
  await appliquer({ kind: attente.kind, pageIndex: attente.pageIndex, args });
  message('Texte posé.', 'reussite');
});

$('#saisie-texte').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) $('#saisie-valider').click();
});

/* ============================================================
   Panneau Équation
   ============================================================ */
function construirePanneauEquation() {
  const presets = $('#eq-presets');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.className = 'puce';
    b.textContent = p.label;
    b.addEventListener('click', () => { $('#eq-saisie').value = p.src; rafraichirApercu(); });
    presets.appendChild(b);
  }
  const structs = $('#eq-structs');
  for (const sec of STRUCTS) {
    const titre = document.createElement('div');
    titre.className = 'groupe-title';
    titre.textContent = sec.group;
    structs.appendChild(titre);
    const grille = document.createElement('div');
    grille.className = 'grille-struct';
    for (const it of sec.items) {
      const b = document.createElement('button');
      b.className = 'case-struct';
      const viz = document.createElement('span');
      viz.className = 'viz';
      viz.textContent = it.label;
      const lab = document.createElement('span');
      lab.textContent = it.label;
      b.appendChild(viz);
      b.appendChild(lab);
      b.title = it.viz;
      b.addEventListener('click', () => insererAuChamp(it.tex));
      grille.appendChild(b);
    }
    structs.appendChild(grille);
  }
  const syms = $('#eq-symboles');
  for (const cat of SYMR) {
    const titre = document.createElement('div');
    titre.className = 'groupe-title';
    titre.textContent = cat.name;
    syms.appendChild(titre);
    const grille = document.createElement('div');
    grille.className = 'grille-symboles';
    for (const [tex, car] of cat.items) {
      const b = document.createElement('button');
      b.className = 'symb';
      b.textContent = car;
      b.title = tex;
      b.addEventListener('click', () => insererAuChamp(tex));
      grille.appendChild(b);
    }
    syms.appendChild(grille);
  }
}

function insererAuChamp(tex) {
  const champ = $('#eq-saisie');
  const debut = champ.selectionStart ?? champ.value.length;
  const fin = champ.selectionEnd ?? debut;
  champ.value = champ.value.slice(0, debut) + tex + champ.value.slice(fin);
  champ.focus();
  champ.selectionStart = champ.selectionEnd = debut + tex.length;
  rafraichirApercu();
}

function latexCourant() {
  const brut = $('#eq-saisie').value.trim();
  if (!brut) return '';
  return etat.eqMode === 'lin' ? transcoderLineaire(brut) : brut;
}

let sablierApercu = null;
async function rafraichirApercu() {
  const latex = latexCourant();
  const err = $('#eq-erreur');
  err.hidden = true;
  const canvas = $('#eq-apercu');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  etat.eqApercu = null;
  $('#eq-inserer').disabled = !etat.eqPoint || !latex;
  if (!latex) return;
  if (sablierApercu) clearTimeout(sablierApercu);
  sablierApercu = setTimeout(async () => {
    const rep = await window.atelier.previewEquation(latex, etat.eqExPt);
    if (rep.erreur) {
      err.textContent = rep.erreur;
      err.hidden = false;
      $('#eq-inserer').disabled = true;
      return;
    }
    etat.eqApercu = rep.apercu;
    $('#eq-inserer').disabled = !etat.eqPoint;
    dessinerOpsCanvas(canvas, rep.apercu);
  }, 250);
}

/** Trace des opérateurs PDF (m/l/c/re + f) sur un canvas HTML. */
function dessinerOpsCanvas(canvas, apercu) {
  const ctx = canvas.getContext('2d');
  const { ops, widthPt, heightPt } = apercu;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const marge = 8;
  const k = Math.min(
    (canvas.width - marge * 2) / widthPt,
    (canvas.height - marge * 2) / heightPt,
  );
  const px = (x) => marge + x * k;
  const py = (y) => canvas.height / 2 - ((y - apercu.heightPt / 2) * k);
  ctx.fillStyle = '#F3F5FA';
  ctx.strokeStyle = '#F3F5FA';
  let p = new Path2D();
  const mots = ops.split(/\s+/).filter(Boolean);
  let i = 0;
  const pile = [];
  while (i < mots.length) {
    const t = mots[i];
    const attendus = { m: 2, l: 2, c: 6, re: 4 }[t];
    if (attendus !== undefined) {
      const vals = [];
      for (let j = 0; j < attendus; j++) vals.push(Number(mots[i - attendus + j]));
      if (t === 'm') p.moveTo(px(vals[0]), py(vals[1]));
      else if (t === 'l') p.lineTo(px(vals[0]), py(vals[1]));
      else if (t === 'c') p.bezierCurveTo(px(vals[0]), py(vals[1]), px(vals[2]), py(vals[3]), px(vals[4]), py(vals[5]));
      else if (t === 're') p.rect(px(vals[0]), py(vals[1] + vals[3]), vals[2] * k, vals[3] * k);
      i += 1;
    } else if (t === 'f') { ctx.fill(p); p = new Path2D(); i += 1; }
    else if (t === 'S') { ctx.stroke(p); i += 1; }
    else if (t === 'h') { i += 1; }
    else if (t === 'rg' || t.endsWith('rg')) {
      const r = Math.round(Number(mots[i - 3]) * 255);
      const g = Math.round(Number(mots[i - 2]) * 255);
      const b = Math.round(Number(mots[i - 1]) * 255);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.strokeStyle = ctx.fillStyle;
      i += 1;
    } else if (!Number.isNaN(Number(t))) {
      pile.push(t);
      void pile;
      i += 1;
    } else {
      i += 1; // w, gs, BT… ignorés pour l'aperçu
    }
  }
  ctx.fill(p);
  ctx.stroke(p);
}

async function insererEquation() {
  const latex = latexCourant();
  if (!latex || !etat.eqPoint) return;
  const apercu = etat.eqApercu || (await window.atelier.previewEquation(latex, etat.eqExPt)).apercu;
  const { point, pageIndex } = etat.eqPoint;
  // Le clic désigne le bas-gauche de l'équation, centré horizontalement sur lui.
  const x = point.x; const y = point.y + (apercu.heightPt / 2) - apercu.depthPt;
  const rep = await window.atelier.applyEdits([{
    kind: 'equation',
    pageIndex,
    args: { latex, x, y, exPt: etat.eqExPt },
  }]);
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  // Conserver les opérateurs pour le calque d'apparence de cette équation.
  const nouvelle = rep.resume.annots.find((a) => a.page === pageIndex
    && (a.contents || '').includes(latex.slice(0, 12)));
  if (nouvelle && nouvelle.ref) {
    etat.cacheOps.set(`${pageIndex}:${nouvelle.ref.objectNumber}`, apercu);
  }
  etat.eqApercu = apercu;
  majResume(rep.resume);
  message('Équation insérée dans la page.', 'reussite');
}

$('#eq-inserer').addEventListener('click', insererEquation);
$('#eq-saisie').addEventListener('input', rafraichirApercu);

for (const [id, mode] of [['#eq-pro', 'pro'], ['#eq-lin', 'lin']]) {
  $(id).addEventListener('click', () => {
    etat.eqMode = mode;
    $('#eq-pro').classList.toggle('actif', mode === 'pro');
    $('#eq-lin').classList.toggle('actif', mode === 'lin');
    $('#eq-libelle').textContent = mode === 'pro' ? 'LaTeX' : 'Saisie linéaire (symboles convertis)';
    $('#eq-saisie').placeholder = mode === 'pro'
      ? 'Ex. : x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'
      : 'Ex. : x^2 + α ≥ 3×5';
    rafraichirApercu();
  });
}

/* ============================================================
   Barre d'outils, zoom, pages, glisser-déposer, menu
   ============================================================ */
function choisirOutil(outil) {
  // v0.1.1 : sans document ouvert, les outils d'annotation n'ont pas de page
  // où agir ; on le dit plutôt que de laisser des clics sans effet.
  if (outil !== 'aucun' && !etat.resume) {
    message('Ouvrez d\'abord un document PDF (bouton Ouvrir ou glisser-déposer).', 'erreur');
    return;
  }
  etat.outil = outil;
  document.querySelectorAll('.outil').forEach((b) => {
    b.classList.toggle('actif', b.dataset.outil === outil);
  });
  const corps = document.body;
  const curseur = outil === 'encre' ? 'crayon'
    : (outil === 'surligner' || outil === 'encadrer' || outil === 'fiche') ? 'texte'
      : outil === 'equation' ? 'viseur' : 'defaut';
  corps.dataset.curseur = curseur;
  $('#panneau-equation').hidden = outil !== 'equation';
  const notes = {
    aucun: 'Cliquez une annotation pour la sélectionner (Suppr pour retirer).',
    surligner: 'Glissez sur une ligne de texte.',
    encadrer: 'Glissez pour tracer un cadre.',
    encre: 'Tracez à main levée.',
    note: 'Cliquez où poser la note.',
    fiche: 'Glissez la zone de texte, puis écrivez.',
    equation: 'Cliquez le point d\'insertion sur la page.',
  };
  message(notes[outil] || 'Prêt.');
}

document.querySelectorAll('.outil').forEach((b) => {
  b.addEventListener('click', () => choisirOutil(b.dataset.outil));
});

function fixerZoom(z) {
  etat.zoom = Math.min(4, Math.max(0.25, z));
  rendPage();
}

$('#btn-zoom-plus').addEventListener('click', () => fixerZoom(etat.zoom * 1.25));
$('#btn-zoom-moins').addEventListener('click', () => fixerZoom(etat.zoom / 1.25));
$('#btn-zoom-net').addEventListener('click', () => fixerZoom(1));
$('#btn-page-avant').addEventListener('click', () => changerPage(etat.page - 1));
$('#btn-page-apres').addEventListener('click', () => changerPage(etat.page + 1));

async function changerPage(n) {
  if (!etat.resume) return;
  const cible = Math.min(etat.resume.pageCount, Math.max(1, n));
  if (cible === etat.page) return;
  etat.page = cible;
  await rendPage();
}

els.visionneuse.addEventListener('wheel', (ev) => {
  if (ev.ctrlKey) {
    ev.preventDefault();
    fixerZoom(etat.zoom * (ev.deltaY < 0 ? 1.12 : 0.9));
  }
});

window.addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'INPUT') return;
  if (ev.key === '+' || ev.key === '=') fixerZoom(etat.zoom * 1.25);
  else if (ev.key === '-') fixerZoom(etat.zoom / 1.25);
  else if (ev.key === '0') fixerZoom(1);
  else if (ev.key === 'Home') changerPage(1);
  else if (ev.key === 'End') { if (etat.resume) changerPage(etat.resume.pageCount); }
  else if (ev.key === 'PageUp') changerPage(etat.page - 1);
  else if (ev.key === 'PageDown') changerPage(etat.page + 1);
  else if (ev.key === 'Delete' || ev.key === 'Backspace') supprimerSelection();
});

/* Glisser-déposer de fichier PDF sur la fenêtre. */
window.addEventListener('dragover', (ev) => ev.preventDefault());
window.addEventListener('drop', (ev) => {
  ev.preventDefault();
  const fichier = ev.dataTransfer.files && ev.dataTransfer.files[0];
  if (fichier && fichier.name.toLowerCase().endsWith('.pdf')) {
    ouvrirDocument(window.atelier.cheminFichier(fichier));
  } else {
    message('Déposez un fichier PDF.', 'erreur');
  }
});

/* Menu natif redirigé. */
window.atelier.onCommande(async (cmd) => {
  if (cmd.nom === 'ouvrir') ouvrirDocument();
  if (cmd.nom === 'enregistrer') enregistrer('overwrite');
  if (cmd.nom === 'copie') enregistrer('timestamped');
});

$('#btn-ouvrir').addEventListener('click', () => ouvrirDocument());
$('#btn-enregistrer').addEventListener('click', () => enregistrer('overwrite'));
$('#btn-copie').addEventListener('click', () => enregistrer('timestamped'));

async function enregistrer(mode) {
  if (!etat.resume) return;
  const rep = await window.atelier.save(mode);
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  message(mode === 'timestamped'
    ? `Copie horodatée créée : ${rep.chemin}`
    : `Enregistré : ${rep.chemin}`, 'reussite');
  etat.resume = { ...etat.resume, chemin: rep.chemin, modifie: false };
  majResume(etat.resume);
  $('#pastille-modifie').hidden = true;
}

/* ============================================================
   Démarrage
   ============================================================ */
(async function init() {
  construirePanneauEquation();
  ecouterSouris();
  choisirOutil('aucun');
  $('#version-etat').textContent = `Atelier PDF ${await window.atelier.version()}`;
})();
