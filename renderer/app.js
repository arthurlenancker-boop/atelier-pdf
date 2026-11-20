// renderer/app.js — Tâche 10 : visionneuse pdf.js, cinq outils, panneau Équation.
// Module ESM du processus de rendu. Aucune écriture directe de fichier ici :
// tout passe par window.atelier (pont preload) vers le processus principal.
'use strict';

import '../engine/coords.js'; // expose globalThis.AtelierCoords
import '../engine/guides.js'; // expose globalThis.AtelierGuides (v0.1.5)

const { deviceToPdf, quadPointsForRange } = globalThis.AtelierCoords;

// v0.1.2 : chargement dynamique de pdf.js. Un import statique qui echoue
// (fichier absent) tuait silencieusement tout le module : plus aucun bouton
// n'etait branche. Ici, l'echec s'affiche dans la barre d'etat.
let pdfjsLib = null;
let erreurPdfjs = null; // dernier message d'echec du chargement (diagnostics)

async function chargerPdfjs() {
  pdfjsLib = await import('app://local/libs/pdfjs-dist/build/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'app://local/libs/pdfjs-dist/build/pdf.worker.min.mjs';
}

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
  saisieAttente: null, // { kind, rect, pageIndex, ref? } pendant l'édition sur la page
  // v0.1.7 : remplacement d'une équation existante (clic sur l'équation) :
  // tant que rempli, « Insérer » remplace au lieu de poser un nouveau objet.
  remplacement: null,   // { ref, pageIndex, latex }
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
  // v0.1.3 : le fichier est demandé d'abord au processus principal (boîte de
  // dialogue ou chemin déposé) ; le moteur d'affichage n'est requis qu'après.
  // Avant, l'absence de pdf.js bloquait même la boîte de dialogue : impossible
  // de distinguer « rien ne se passe » d'un échec de chargement du moteur.
  const rep = await window.atelier.open(chemin);
  if (rep.annule) return;
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  if (!pdfjsLib) {
    etat.chemin = rep.resume.chemin;
    message(`« ${rep.resume.chemin} » est ouvert, mais l'afficheur pdf.js n'a pas pu être chargé`
      + `${erreurPdfjs ? ` : ${erreurPdfjs}` : ''}. Menu Aide → Diagnostics de l'application.`, 'erreur');
    return;
  }
  etat.resume = null;
  etat.annotsPdf = [];
  etat.selection = null;
  etat.eqPoint = null;
  etat.remplacement = null;
  etat.chemin = rep.resume.chemin;
  etat.page = 1;
  resoudreZoom();
  if (etat.pdfjs) { await etat.pdfjs.destroy(); etat.pdfjs = null; }
  // pdf.js détache le tampon qu'on lui donne : une copie protège l'original.
  etat.pdfjs = await pdfjsLib.getDocument({ data: Uint8Array.from(rep.octets) }).promise;
  els.accueil.hidden = true;
  els.visionneuse.hidden = false;
  majResume(rep.resume);
  await rendPage();
  message(`Document ouvert : ${rep.resume.pageCount} page(s).`, 'reussite');
}

/* v0.1.6 : (1) un seul rendu pdf.js à la fois — le RenderTask précédent est
   annulé avant d'en commencer un autre, sinon pdf.js lève
   « Cannot use the same canvas during multiple render() operations », la
   page reste vide et les annotations ne sont plus jamais redessinées
   (cause de « il n'affiche pas le document » et « les modifications ne
   s'affichent pas » après un zoom) ; (2) un numéro de génération ignore
   tout rendu devenu obsolète ; (3) l'échec éventuel est AFFICHÉ (barre
   d'état + Diagnostics) au lieu de rester une promesse rejetée muette. */
let tacheRendu = null;    // RenderTask pdf.js en cours (annulable)
let generationRendu = 0;   // numéro du rendu demandé le plus récent
let erreurRendu = null;    // dernier échec d'affichage (Diagnostics)
let renduNetEnCours = false; // v0.1.6 : la page se prépare ; pas de geste
                            // de zoom pendant ce temps (ancrage faux)

async function rendPage() {
  if (!etat.pdfjs || !etat.resume) return;
  const ma = generationRendu + 1;
  generationRendu = ma;
  renduNetEnCours = true;
  const page = await etat.pdfjs.getPage(etat.page);
  if (ma !== generationRendu) return; // un rendu plus récent a été demandé
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
  if (tacheRendu) {
    try { await tacheRendu.cancel(); } catch (e) { /* déjà terminée */ }
    tacheRendu = null;
    if (ma !== generationRendu) return;
  }
  try {
    tacheRendu = page.render({ canvasContext: els.calquePdf.getContext('2d'), viewport });
    await tacheRendu.promise;
    tacheRendu = null;
    erreurRendu = null;
  } catch (err) {
    tacheRendu = null;
    renduNetEnCours = false;
    if (err && (err.name === 'RenderingCancelledException' || /cancel/i.test(String(err && err.message)))) return;
    erreurRendu = (err && err.message) ? err.message : String(err);
    message(`Échec de l'affichage de la page : ${erreurRendu}. Menu Aide → Diagnostics de l'application.`, 'erreur');
    return;
  }
  if (ma !== generationRendu) { renduNetEnCours = false; return; }
  renduNetEnCours = false;
  dessinerAnnots();
  $('#etiquette-page').textContent = `${etat.page} / ${etat.resume.pageCount}`;
  $('#etiquette-zoom').textContent = `${Math.round(etat.zoom * 100)} %`;
  // v0.1.7 : une saisie en cours sur la page suit le rendu (zoom, page).
  if (etat.saisieAttente) editeurCaler(etat.saisieAttente);
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

/* v0.1.6 : le TEXTE des commentaires doit être lisible dans l'application,
   pas seulement au survol dans les autres lecteurs. */
function enveloppeTexte(ctx, texte, largeur, maxLignes) {
  const mots = String(texte || '').trim().split(/\s+/);
  const lignes = [];
  let courante = '';
  for (const mot of mots) {
    if (lignes.length >= maxLignes) break;
    const essai = courante ? `${courante} ${mot}` : mot;
    if (ctx.measureText(essai).width > largeur && courante) {
      lignes.push(courante);
      courante = mot;
    } else {
      courante = essai;
    }
  }
  if (courante && lignes.length < maxLignes) lignes.push(courante);
  return lignes;
}

function ecrireCarteCommentaire(ctx, texte, x, y, zoom) {
  if (!texte) return;
  const interligne = 15 * zoom;
  const largeurCarte = 210 * zoom;
  const lignes = enveloppeTexte(ctx, texte, largeurCarte - 12 * zoom, 14);
  if (lignes.length === 0) return;
  const hCarte = lignes.length * interligne + 8 * zoom;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 246, 220, 0.96)';
  ctx.strokeStyle = 'rgba(160, 118, 20, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, largeurCarte, hCarte, 6 * zoom);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3E2E05';
  ctx.textBaseline = 'top';
  lignes.forEach((ligne, i) => {
    const derniere = i === 13 && lignes.length > 14;
    const affichee = derniere ? `${String(ligne).slice(0, 10)}…` : String(ligne);
    ctx.fillText(affichee, x + 6 * zoom, y + 4 * zoom + i * interligne);
  });
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
      // v0.1.7 : les équations ne sont PLUS tracées sur ce calque. Leur
      // apparence /AP (dessin vectoriel MathJax, écrite dans le fichier)
      // est rendue par pdf.js dans la page elle-même : un second tracé
      // superposé doublait les glyphes et un cadre pointillé apparaissait
      // quand le calque ne reconnaissait plus la formule. Il suffit de ne
      // rien dessiner ici ; seule la sélection (liseret bleu, plus bas)
      // marque l'équation choisie.
      if (!(a.contents || '').startsWith('Équation LaTeX')) {
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
      // v0.1.6 : le texte du commentaire est affiché à côté de l'icône.
      if (a.contents) {
        ctx.font = `${11 * etat.zoom}px sans-serif`;
        ecrireCarteCommentaire(ctx, a.contents, x + Math.max(w, 14) + 8 * etat.zoom, y, etat.zoom);
      }
    } else if (a.subtype === 'FreeText') {
      ctx.fillStyle = 'rgba(37, 51, 125, 0.85)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = `${11 * etat.zoom}px sans-serif`;
      ctx.textBaseline = 'top';
      // v0.1.6 : texte intégral avec retour à la ligne dans la zone (les
      // 40 premiers caractères suffisaient rarement).
      const lignes = enveloppeTexte(ctx, a.contents, Math.max(w - 6 * etat.zoom, 10), 30);
      lignes.forEach((ligne, i) => {
        if (i * 13 * etat.zoom < h) {
          ctx.fillText(String(ligne), x + 3 * etat.zoom, y + 2 * etat.zoom + i * 13 * etat.zoom);
        }
      });
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
    // v0.1.6 : pendant le zoom fluide, la page est transformée en CSS :
    // ses coordonnées ne correspondraient pas au calque rendu.
    if (gesteZoomActif()) return;
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
      ouvrirEditeur('note', point);
    } else if (etat.outil === 'equation') {
      // v0.1.7 : cliquer une équation EXISTANTE l'ouvre pour correction.
      const cible = annotationSous(point);
      if (cible && (cible.contents || '').startsWith('Équation LaTeX')) {
        ouvrirRemplacement(cible);
        return;
      }
      annulerRemplacement();
      etat.eqPoint = { pageIndex: etat.page - 1, point };
      $('#eq-inserer').disabled = false;
      const note = $('#eq-note');
      note.textContent = `Point d'insertion posé (page ${etat.page}). Choisissez la formule, puis Insérer.`;
      note.classList.add('ok');
    }
  });

  // v0.1.7 : double-clic sur une équation ou une note avec l'outil Sélection
  // ou Équation : rouvrir l'objet pour le corriger.
  els.calqueTampon.addEventListener('dblclick', (ev) => {
    if (gesteZoomActif()) return;
    const point = pointPdf(ev);
    const cible = annotationSous(point);
    if (!cible) return;
    if ((cible.contents || '').startsWith('Équation LaTeX')) {
      ouvrirRemplacement(cible);
    } else if (cible.subtype === 'Text') {
      ouvrirEditeur('note', null, cible);
    } else if (cible.subtype === 'FreeText') {
      ouvrirEditeur('fiche', null, cible);
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
          ouvrirEditeur('fiche', rect.slice());
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

/** Annotation de la page courante sous le point PDF donné, ou null. */
function annotationSous(point) {
  if (!etat.resume) return null;
  const annots = etat.resume.annots.filter((a) => a.page === etat.page - 1 && a.ref);
  return annots.find((a) => point.x >= a.rect[0] && point.x <= a.rect[2]
    && point.y >= a.rect[1] && point.y <= a.rect[3]) || null;
}

function selectionner(point) {
  const cible = annotationSous(point);
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
   Éditeur sur la page (v0.1.7) — notes et fiches, à la demande
   d'Arthur : plus de panneau modal, la saisie se fait directement
   à l'endroit cliqué, dans une petite zone posée sur la page.
   ============================================================ */
function positionnerEditeur(rectPdf) {
  // Place la carte d'édition aux coordonnées écran du rectangle PDF visé.
  const c0 = pdfVersEcran({ x: rectPdf[0], y: rectPdf[1] });
  const c1 = pdfVersEcran({ x: rectPdf[2], y: rectPdf[3] });
  const x = Math.min(c0.x, c1.x);
  const y = Math.min(c0.y, c1.y);
  const carte = $('#editeur-page');
  carte.style.left = `${Math.round(x)}px`;
  carte.style.top = `${Math.round(y)}px`;
  carte.style.width = `auto`;
  carte.style.height = `auto`;
  return { x, y, largeur: Math.abs(c1.x - c0.x), hauteur: Math.abs(c1.y - c0.y) };
}

/** Cale la carte d'édition sur son rectangle PDF (ouverture et recalage après rendu). */
function editeurCaler(attente) {
  const geom = positionnerEditeur(attente.rect);
  const carte = $('#editeur-page');
  if (attente.kind === 'freeText') {
    // La fiche s'édite DANS sa zone : la carte épouse le rectangle glissé.
    carte.style.width = `${Math.max(160, Math.round(geom.largeur))}px`;
    carte.style.height = `${Math.max(56, Math.round(geom.hauteur))}px`;
  } else {
    // La note s'édite à côté de son icône post-it.
    carte.style.width = '230px';
    carte.style.height = 'auto';
    carte.style.left = `${Math.round(geom.x + 26 * etat.zoom)}px`;
  }
}

function ouvrirEditeur(genre, pointOuRect, cible) {
  if (!etat.resume) return;
  let attente;
  if (cible && (cible.subtype === 'Text' || cible.subtype === 'FreeText')) {
    // Modification d'une annotation existante : retirer puis reposer.
    attente = {
      kind: cible.subtype === 'Text' ? 'textNote' : 'freeText',
      pageIndex: cible.page,
      ref: cible.ref,
      rect: cible.rect.slice(),
      contenu: String(cible.contents || ''),
    };
  } else if (genre === 'note' && pointOuRect) {
    const p = pointOuRect;
    attente = {
      kind: 'textNote',
      pageIndex: etat.page - 1,
      rect: [p.x, p.y, p.x + 18, p.y + 18],
      contenu: '',
    };
  } else if (genre === 'fiche' && pointOuRect) {
    attente = {
      kind: 'freeText',
      pageIndex: etat.page - 1,
      rect: pointOuRect.slice(),
      contenu: '',
    };
  } else {
    return;
  }
  etat.saisieAttente = attente;
  const carte = $('#editeur-page');
  const zone = $('#editeur-texte');
  zone.classList.toggle('fiche', attente.kind === 'freeText');
  editeurCaler(attente);
  const titre = $('#editeur-titre');
  titre.textContent = attente.kind === 'textNote'
    ? (attente.ref ? 'Modifier la note' : 'Note')
    : (attente.ref ? 'Modifier la fiche' : 'Fiche : texte écrit sur la page');
  zone.value = attente.contenu;
  carte.hidden = false;
  zone.focus();
  zone.setSelectionRange(zone.value.length, zone.value.length);
}

function fermerEditeur() {
  $('#editeur-page').hidden = true;
  etat.saisieAttente = null;
}

async function validerEditeur() {
  const attente = etat.saisieAttente;
  const texte = $('#editeur-texte').value;
  fermerEditeur();
  if (!attente) return;
  if (!texte.trim()) {
    message('Texte vide : rien n\'a été posé.');
    return;
  }
  const edits = [];
  if (attente.ref) {
    edits.push({ kind: 'remove', pageIndex: attente.pageIndex, args: { ref: attente.ref } });
  }
  const args = { rect: attente.rect.slice() };
  if (attente.kind === 'textNote') args.contents = texte;
  if (attente.kind === 'freeText') args.text = texte;
  edits.push({ kind: attente.kind, pageIndex: attente.pageIndex, args });
  const rep = await window.atelier.applyEdits(edits);
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  majResume(rep.resume);
  message(attente.ref ? 'Texte modifié.' : 'Texte posé.', 'reussite');
}

$('#editeur-annuler').addEventListener('click', fermerEditeur);
$('#editeur-valider').addEventListener('click', validerEditeur);
$('#editeur-texte').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    validerEditeur();
  } else if (ev.key === 'Escape') {
    ev.stopPropagation();
    fermerEditeur();
  }
});
$('#editeur-page').addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') fermerEditeur();
});
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && etat.remplacement) {
    annulerRemplacement();
    message('Modification d\'équation abandonnée. Le bouton Insérer reprend son rôle.');
  }
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
    // v0.1.7 : chaque catégorie de caractères est un MENU DÉROULANT
    // (demande d'Arthur) : le panneau reste court, on déplie ce qu'on veut.
    const deroulant = document.createElement('details');
    deroulant.className = 'deploi';
    const entete = document.createElement('summary');
    entete.textContent = sec.group;
    deroulant.appendChild(entete);
    const corps = document.createElement('div');
    corps.className = 'deploi-corps';
    deroulant.appendChild(corps);
    structs.appendChild(deroulant);
    const grille = document.createElement('div');
    grille.className = 'grille-struct';
    corps.appendChild(grille);
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
  }
  const syms = $('#eq-symboles');
  for (const cat of SYMR) {
    const deroulant = document.createElement('details');
    deroulant.className = 'deploi';
    const entete = document.createElement('summary');
    entete.textContent = cat.name;
    deroulant.appendChild(entete);
    const corps = document.createElement('div');
    corps.className = 'deploi-corps';
    deroulant.appendChild(corps);
    syms.appendChild(deroulant);
    const grille = document.createElement('div');
    grille.className = 'grille-symboles';
    corps.appendChild(grille);
    for (const [tex, car] of cat.items) {
      const b = document.createElement('button');
      b.className = 'symb';
      b.textContent = car;
      b.title = tex;
      b.addEventListener('click', () => insererAuChamp(tex));
      grille.appendChild(b);
    }
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
  if (!latex) return;
  const remplacer = etat.remplacement;
  if (!remplacer && !etat.eqPoint) return;
  const apercu = etat.eqApercu || (await window.atelier.previewEquation(latex, etat.eqExPt)).apercu;
  let pageIndex;
  let x; let y; // y = bas du rectangle ; la ligne de base de la formule
  let edits;
  if (remplacer) {
    pageIndex = remplacer.pageIndex;
    // v0.1.7 : conserver la ligne de base de l'équation remplacée. Le
    // rectangle stocké [x0, y0bas, x1, y1haut] donnait y0bas = ligne de
    // base - profondeur ; on restitue la même ligne de base en passant
    // l'ancien LaTeX pour mesurer sa profondeur.
    const r = remplacer.rect;
    let profondeurAncienne = 0;
    if (remplacer.latex) {
      try {
        profondeurAncienne = (await window.atelier.previewEquation(remplacer.latex, etat.eqExPt)).apercu.depthPt;
      } catch (e) { profondeurAncienne = 0; }
    }
    const base = r[1] + (Number.isFinite(profondeurAncienne) ? profondeurAncienne : 0);
    x = r[0];
    y = base - apercu.depthPt;
    edits = [
      { kind: 'remove', pageIndex, args: { ref: remplacer.ref } },
      { kind: 'equation', pageIndex, args: { latex, x, y, exPt: etat.eqExPt } },
    ];
  } else {
    const { point } = etat.eqPoint;
    pageIndex = etat.eqPoint.pageIndex;
    // v0.1.7 : le point CLIQUÉ est la ligne de base de la formule, comme
    // un point d'insertion de texte. Auparavant la formule atterrissait
    // une demi-hauteur AU-DESSUS du clic, sans rapport avec le geste.
    x = point.x;
    y = point.y - apercu.depthPt;
    edits = [{ kind: 'equation', pageIndex, args: { latex, x, y, exPt: etat.eqExPt } }];
  }
  const rep = await window.atelier.applyEdits(edits);
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  etat.eqApercu = apercu;
  annulerRemplacement();
  majResume(rep.resume);
  message(remplacer ? 'Équation remplacée sur place.' : 'Équation insérée dans la page.', 'reussite');
}

/** Fait disparaître le mode « remplacer l'équation » et rend au bouton Insérer son rôle. */
function annulerRemplacement() {
  if (!etat.remplacement && $('#eq-inserer').textContent !== 'Remplacer') return;
  etat.remplacement = null;
  const b = $('#eq-inserer');
  b.textContent = 'Insérer dans la page';
  b.disabled = !etat.eqPoint;
  const note = $('#eq-note');
  note.classList.remove('ok');
}

/** Ouvre une équation existante pour correction (clic ou double-clic dessus). */
async function ouvrirRemplacement(a) {
  const latex = String(a.contents || '').replace(/^Équation LaTeX\s*:\s*/, '');
  if (!latex) {
    message('Cette annotation équation ne contient pas de formule lisible.');
    return;
  }
  etat.remplacement = { ref: a.ref, pageIndex: a.page, latex, rect: a.rect.slice() };
  etat.selection = a;
  if (etat.eqMode !== 'pro') $('#eq-pro').click();
  $('#eq-saisie').value = latex;
  $('#panneau-equation').hidden = false;
  const b = $('#eq-inserer');
  b.textContent = 'Remplacer la formule';
  b.disabled = false;
  const note = $('#eq-note');
  note.textContent = 'Modification d\u2019une équation existante : corrigez la formule, puis Remplacer.';
  note.classList.add('ok');
  rafraichirApercu();
  message('Équation ouverte pour correction. Corrigez la formule, puis « Remplacer la formule ».');
  dessinerAnnots();
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
   Fenêtres guidées « à la Dmaths » (v0.1.5)
   Gabarits et composition : engine/guides.js (testé sous Node).
   ============================================================ */
const { GUIDES, composerSysteme } = globalThis.AtelierGuides;

const GUIDE_SYSTEME = { titre: 'Écrire une (in)équation du système' };

/* Bande « Insérer » présente dans chaque fenêtre, comme Dmaths. */
const GUIDE_SNIPPETS = [
  { label: '( )', avant: '\\left(', apres: '\\right)' },
  { label: '[ ]', avant: '\\left[', apres: '\\right]' },
  { label: '{ }', avant: '\\{', apres: '\\}' },
  { label: '√', avant: '\\sqrt{', apres: '}' },
  { label: 'π', avant: '\\pi', apres: '' },
  { label: '∞', avant: '\\infty', apres: '' },
  { label: '·', avant: '\\cdot', apres: '' },
  { label: 'Exp', avant: '^{', apres: '}' },
  { label: 'Index', avant: '_{', apres: '}' },
];

let guideOuvert = null;       // identifiant du gabarit ouvert, ou 'systeme'
let valeursGuide = {};        // contenu des champs texte
let choixGuide = null;        // option radio courante des gabarits à variantes
let cochesGuide = {};         // cases cochées (norme, coordonnées verticales…)
let lignesSysteme = [];        // équations déjà validées du système
let apercuGuide = null;       // dernier aperçu calculé par la fenêtre
let dernierChampGuide = null; // dernier champ actif (cible de la bande « Insérer »)

function construireBoutonsGuides() {
  const cont = $('#eq-guides');
  for (const [id, g] of Object.entries(GUIDES)) {
    const b = document.createElement('button');
    b.className = 'puce';
    b.textContent = g.bouton;
    b.addEventListener('click', () => ouvrirGuide(id));
    cont.appendChild(b);
  }
  const sys = document.createElement('button');
  sys.className = 'puce';
  sys.textContent = 'Système';
  sys.addEventListener('click', () => ouvrirGuide('systeme'));
  cont.appendChild(sys);
  const bande = $('#guide-inserer');
  for (const sn of GUIDE_SNIPPETS) {
    const b = document.createElement('button');
    b.className = 'symb';
    b.textContent = sn.label;
    b.title = 'Insérer dans la case active';
    b.addEventListener('pointerdown', (ev) => ev.preventDefault()); // garder le focus du champ
    b.addEventListener('click', () => insererSnipGuide(sn));
    bande.appendChild(b);
  }
}

function creerChamp(f) {
  const span = document.createElement('span');
  span.className = 'guide-champ';
  const lab = document.createElement('span');
  lab.className = 'lib';
  lab.textContent = f.libelle;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.dataset.gid = f.id;
  inp.placeholder = f.place || '';
  if (f.large) inp.classList.add('vaste');
  if (f.etroit) inp.classList.add('etroit');
  inp.value = f.defaut || '';
  inp.spellcheck = false;
  if (f.defaut) valeursGuide[f.id] = f.defaut;
  inp.addEventListener('input', () => { valeursGuide[f.id] = inp.value; majApercuGuide(); });
  inp.addEventListener('focus', () => { dernierChampGuide = inp; });
  span.appendChild(lab);
  span.appendChild(inp);
  return span;
}

function ouvrirGuide(id) {
  if (!etat.resume) {
    message("Ouvrez d'abord un document PDF (bouton Ouvrir ou glisser-déposer).", 'erreur');
    return;
  }
  guideOuvert = id;
  valeursGuide = {};
  choixGuide = null;
  cochesGuide = {};
  lignesSysteme = [];
  apercuGuide = null;
  dernierChampGuide = null;
  const cont = $('#guide-champs');
  cont.replaceChildren();
  const estSysteme = id === 'systeme';
  const g = estSysteme ? GUIDE_SYSTEME : GUIDES[id];
  $('#guide-titre').textContent = g.titre;
  $('#guide-ecrire').hidden = estSysteme;
  $('#guide-valider').hidden = !estSysteme;
  $('#guide-terminer').hidden = !estSysteme;
  $('#guide-lignes').hidden = true;
  if (estSysteme) {
    for (const f of [
      { id: 'gauche', libelle: 'Gauche', place: '2x + 3', large: true },
      { id: 'symbole', libelle: 'Symbole', defaut: '=', etroit: true },
      { id: 'droite', libelle: 'Droite', place: '5', large: true },
    ]) {
      cont.appendChild(creerChamp(f));
    }
  } else {
    for (const f of g.champs) cont.appendChild(creerChamp(f));
    if (g.radios) {
      const span = document.createElement('span');
      span.className = 'guide-choix';
      for (const opt of g.radios.options) {
        const l = document.createElement('label');
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = `guide-choix-${g.radios.id}`;
        r.value = opt.id;
        r.checked = opt.id === g.radios.defaut;
        r.addEventListener('change', () => { if (r.checked) { choixGuide = opt.id; majApercuGuide(); } });
        l.appendChild(r);
        l.appendChild(document.createTextNode(opt.libelle));
        span.appendChild(l);
      }
      choixGuide = g.radios.defaut;
      cont.appendChild(span);
    }
    if (g.coches) {
      const span = document.createElement('span');
      span.className = 'guide-coche';
      for (const opt of g.coches) {
        const l = document.createElement('label');
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.checked = Boolean(opt.defaut);
        cochesGuide[opt.id] = c.checked;
        c.addEventListener('change', () => { cochesGuide[opt.id] = c.checked; majApercuGuide(); });
        l.appendChild(c);
        l.appendChild(document.createTextNode(opt.libelle));
        span.appendChild(l);
      }
      cont.appendChild(span);
    }
  }
  $('#guide-erreur').hidden = true;
  const ap = $('#guide-apercu');
  ap.getContext('2d').clearRect(0, 0, ap.width, ap.height);
  $('#guide-fond').hidden = false;
  const premier = cont.querySelector('input');
  if (premier) premier.focus();
}

function fermerGuide() {
  $('#guide-fond').hidden = true;
  guideOuvert = null;
}

/** Composition courante de la fenêtre, ou null si rien n'est saisi. */
function composerCourant() {
  if (!guideOuvert) return null;
  const auMoinsUn = Object.values(valeursGuide).some((s) => String(s || '').trim() !== '')
    || lignesSysteme.length > 0;
  if (!auMoinsUn) return null;
  if (guideOuvert === 'systeme') return composerSysteme(lignesSysteme);
  return GUIDES[guideOuvert].composer(valeursGuide, choixGuide, cochesGuide);
}

async function majApercuGuide() {
  if (!guideOuvert) return;
  const canvas = $('#guide-apercu');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  apercuGuide = null;
  const comp = composerCourant();
  const err = $('#guide-erreur');
  if (!comp) { err.hidden = true; return; }
  if (comp.erreur) { err.textContent = comp.erreur; err.hidden = false; return; }
  err.hidden = true;
  const rep = await window.atelier.previewEquation(comp.latex, etat.eqExPt);
  if (rep.erreur) { err.textContent = rep.erreur; err.hidden = false; return; }
  apercuGuide = rep.apercu;
  dessinerOpsCanvas(canvas, rep.apercu);
}

function insererSnipGuide(sn) {
  const champ = dernierChampGuide;
  if (!champ || !document.contains(champ) || champ.closest('#guide-champs') === null) {
    message("Cliquez d'abord dans une case, puis utilisez la bande Insérer.");
    return;
  }
  const d = champ.selectionStart ?? champ.value.length;
  const f = champ.selectionEnd ?? d;
  champ.value = champ.value.slice(0, d) + sn.avant + sn.apres + champ.value.slice(f);
  champ.focus();
  champ.setSelectionRange(d + sn.avant.length, d + sn.avant.length);
  valeursGuide[champ.dataset.gid] = champ.value;
  majApercuGuide();
}

function validerLigneSysteme() {
  const gauche = String(valeursGuide.gauche || '').trim();
  const symbole = String(valeursGuide.symbole || '').trim() || '=';
  const droite = String(valeursGuide.droite || '').trim();
  if (!gauche && !droite) {
    const err = $('#guide-erreur');
    err.textContent = "Complétez au moins un côté de l'équation.";
    err.hidden = false;
    return false;
  }
  lignesSysteme.push({ gauche, symbole, droite });
  const listing = $('#guide-lignes');
  listing.textContent = `Équation n° ${lignesSysteme.length} écrite : `
    + lignesSysteme.map((l) => `${l.gauche} ${l.symbole} ${l.droite}`).join('   ;   ');
  listing.hidden = false;
  for (const inp of $('#guide-champs').querySelectorAll('input')) {
    inp.value = '';
    valeursGuide[inp.dataset.gid] = '';
  }
  $('#guide-erreur').hidden = true;
  const g = $('#guide-champs').querySelector('[data-gid="gauche"]');
  if (g) g.focus();
  return true;
}

async function ecrireGuide() {
  if (guideOuvert === 'systeme' && lignesSysteme.length === 0) {
    if (!validerLigneSysteme()) return;
  }
  const comp = composerCourant();
  if (!comp || comp.erreur) {
    const err = $('#guide-erreur');
    err.textContent = comp && comp.erreur ? comp.erreur : "Complétez la fenêtre avant d'écrire.";
    err.hidden = false;
    return;
  }
  fermerGuide();
  // Le champ principal reçoit le LaTeX composé : mode Professionnel requis
  // pour éviter tout transcodage linéaire.
  if (etat.eqMode !== 'pro') $('#eq-pro').click();
  $('#eq-saisie').value = comp.latex;
  rafraichirApercu();
  if (etat.eqPoint) {
    await insererEquation();
  } else {
    message('Formule prête : cliquez le point d\u2019insertion sur la page, puis « Insérer dans la page ».');
  }
}

$('#guide-annuler').addEventListener('click', fermerGuide);
$('#guide-ecrire').addEventListener('click', ecrireGuide);
$('#guide-valider').addEventListener('click', validerLigneSysteme);
$('#guide-terminer').addEventListener('click', async () => {
  const gauche = String(valeursGuide.gauche || '').trim();
  const droite = String(valeursGuide.droite || '').trim();
  if (gauche || droite) validerLigneSysteme();
  if (lignesSysteme.length === 0) {
    const err = $('#guide-erreur');
    err.textContent = 'Écrivez au moins une équation.';
    err.hidden = false;
    return;
  }
  await ecrireGuide();
});
$('#guide-champs').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  if (guideOuvert === 'systeme') validerLigneSysteme();
  else ecrireGuide();
});
$('#guide-fond').addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') fermerGuide();
});

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

/* ————— Zoom fluide (v0.1.6) —————
   Avant : chaque cran de molette relançait un rendu pdf.js complet, d'où
   des saccades puis un écran vide (rendus concurrents). Désormais :
   - pendant le geste, la page est mise à l'échelle par une transformation
     CSS dont le pivot est LE POINTEUR (le point sous la souris ne bouge
     pas, comme dans les visionneuses habituelles) ;
   - un SEUL rendu net a lieu, 180 ms après le dernier cran ;
   - à l'arrivée, le défilement est réajusté pour garder le point
     désigné sous le curseur. */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
let zoomDepart = null;      // zoom du rendu affiché au début du geste
let zoomCible = null;       // zoom demandé par le geste en cours
let ancrageGeste = null;    // { px, py } point du conteneur sous le curseur
let curseurGeste = null;    // { x, y } position écran du dernier cran
let zoomMinuteur = null;    // reports du rendu net

function gesteZoomActif() {
  return zoomDepart !== null;
}

function zoomer(facteur, clientX, clientY) {
  if (!etat.resume) return;
  if (renduNetEnCours) return; // le rendu net arrive ; ancrage impossible
  if (zoomDepart === null) {
    const rect = els.conteneur.getBoundingClientRect();
    zoomDepart = etat.zoom;
    ancrageGeste = { px: clientX - rect.left, py: clientY - rect.top };
    els.conteneur.classList.add('zoom-fluide');
  }
  curseurGeste = { x: clientX, y: clientY };
  zoomCible = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (zoomCible ?? zoomDepart) * facteur));
  els.conteneur.style.transformOrigin = `${Math.round(ancrageGeste.px)}px ${Math.round(ancrageGeste.py)}px`;
  els.conteneur.style.transform = `scale(${zoomCible / zoomDepart})`;
  $('#etiquette-zoom').textContent = `${Math.round(zoomCible * 100)} %`;
  if (zoomCible === zoomDepart) {
    // Retour au zoom du rendu actuel : ne rien recalculer, juste démêler.
    finirZoom();
    return;
  }
  if (zoomMinuteur) clearTimeout(zoomMinuteur);
  zoomMinuteur = setTimeout(finirZoom, 180);
}

async function finirZoom() {
  if (zoomMinuteur) { clearTimeout(zoomMinuteur); zoomMinuteur = null; }
  if (zoomDepart === null) return;
  const k = (zoomCible ?? zoomDepart) / zoomDepart; // facteur total du geste
  const memoAncrage = ancrageGeste;
  const memoCurseur = curseurGeste;
  etat.zoom = zoomCible ?? zoomDepart;
  zoomDepart = zoomCible = ancrageGeste = curseurGeste = null;
  await rendPage();
  els.conteneur.classList.remove('zoom-fluide');
  els.conteneur.style.transform = '';
  els.conteneur.style.transformOrigin = '';
  if (memoAncrage && memoCurseur && k !== 1) {
    // Garder le point désigné sous le curseur une fois le rendu net posé.
    const rect = els.conteneur.getBoundingClientRect();
    els.visionneuse.scrollLeft += Math.round((rect.left + memoAncrage.px * k) - memoCurseur.x);
    els.visionneuse.scrollTop += Math.round((rect.top + memoAncrage.py * k) - memoCurseur.y);
  }
}

function resoudreZoom() {
  // Applique aussitôt le zoom demandé, sans re-rendre : avant un changement
  // de page ou l'ouverture d'un autre document (le rendu suit de toute façon).
  if (zoomMinuteur) { clearTimeout(zoomMinuteur); zoomMinuteur = null; }
  if (zoomDepart !== null) {
    etat.zoom = zoomCible ?? zoomDepart;
    zoomDepart = zoomCible = ancrageGeste = curseurGeste = null;
    els.conteneur.classList.remove('zoom-fluide');
    els.conteneur.style.transform = '';
    els.conteneur.style.transformOrigin = '';
    $('#etiquette-zoom').textContent = `${Math.round(etat.zoom * 100)} %`;
  }
}

function zoomVersCentre(facteur) {
  const r = els.visionneuse.getBoundingClientRect();
  zoomer(facteur, r.left + r.width / 2, r.top + r.height / 2);
}

$('#btn-zoom-plus').addEventListener('click', () => zoomVersCentre(1.25));
$('#btn-zoom-moins').addEventListener('click', () => zoomVersCentre(1 / 1.25));
$('#btn-zoom-net').addEventListener('click', () => {
  zoomVersCentre(1 / (zoomCible ?? etat.zoom));
});
$('#btn-page-avant').addEventListener('click', () => changerPage(etat.page - 1));
$('#btn-page-apres').addEventListener('click', () => changerPage(etat.page + 1));

async function changerPage(n) {
  if (!etat.resume) return;
  resoudreZoom();
  const cible = Math.min(etat.resume.pageCount, Math.max(1, n));
  if (cible === etat.page) return;
  etat.page = cible;
  await rendPage();
}

/* Ctrl + molette : zoom fluide sur le point sous le curseur. */
els.visionneuse.addEventListener('wheel', (ev) => {
  if (!ev.ctrlKey) return;
  ev.preventDefault();
  zoomer(ev.deltaY < 0 ? 1.15 : 1 / 1.15, ev.clientX, ev.clientY);
}, { passive: false });

window.addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'INPUT') return;
  if (ev.key === '+' || ev.key === '=') zoomVersCentre(1.25);
  else if (ev.key === '-') zoomVersCentre(1 / 1.25);
  else if (ev.key === '0') zoomVersCentre(1 / (zoomCible ?? etat.zoom));
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
// v0.1.3 : texte de diagnostic assemblé pour le menu Aide → Diagnostics
// (récupéré par le processus principal via executeJavaScript).
globalThis.__atelierDiagnostics = () => [
  `Version : ${$('#version-etat').textContent || 'inconnue'}`,
  `Moteur d'affichage pdf.js : ${pdfjsLib ? 'chargé' : `NON chargé${erreurPdfjs ? ` (${erreurPdfjs})` : ''}`}`,
  (pdfjsLib && typeof pdfjsLib.GlobalWorkerOptions !== 'undefined')
    ? `Emplacement du worker : ${pdfjsLib.GlobalWorkerOptions.workerSrc || '(non défini)'}`
    : 'Emplacement du worker : indisponible (moteur non chargé)',
  `Fichier ouvert : ${etat.chemin || 'aucun'}`,
  `Page affichée : ${etat.resume ? `${etat.page} / ${etat.resume.pageCount}` : '–'}`,
  `Zoom : ${Math.round(etat.zoom * 100)} % (rendu en cours : ${gesteZoomActif() ? 'transformation CSS en attendant le rendu net' : 'posé'})`,
  `Dernier échec d'affichage : ${erreurRendu || 'aucun'}`,
  `Annotations connues : ${etat.resume ? etat.resume.annots.length : 0}`,
].join('\n');

(async function init() {
  try {
    await chargerPdfjs();
  } catch (err) {
    erreurPdfjs = (err && err.message) ? err.message : String(err);
    message(`Impossible de charger le moteur d'affichage pdf.js : ${erreurPdfjs}. Menu Aide → Diagnostics de l'application.`, 'erreur');
  }
  construirePanneauEquation();
  construireBoutonsGuides();
  ecouterSouris();
  choisirOutil('aucun');
  $('#version-etat').textContent = `Atelier PDF ${await window.atelier.version()}`;
})();
