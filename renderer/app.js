// renderer/app.js — Tâche 10 : visionneuse pdf.js, cinq outils, panneau Équation.
// Module ESM du processus de rendu. Aucune écriture directe de fichier ici :
// tout passe par window.atelier (pont preload) vers le processus principal.
'use strict';

import '../engine/coords.js'; // expose globalThis.AtelierCoords
import '../engine/guides.js'; // expose globalThis.AtelierGuides (v0.1.5)
import '../engine/latex.js'; // expose globalThis.AtelierLatex (v0.1.10)
import '../engine/texte.js'; // expose globalThis.AtelierTexte (v0.1.11)
import '../engine/geom.js'; // expose globalThis.AtelierGeom (v0.1.12)

const { deviceToPdf, quadPointsForRange, quadsPourLignes } = globalThis.AtelierCoords;

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
  opsEquation: new Map(), // v0.1.10 : ops de tracé par équation « page:objet »
  opsFiche: new Map(),      // v0.1.11 : ops des formules par fiche mixte « page:objet »
  apercuEditeur: new Map(), // v0.1.11 : aperçus des formules de la fiche en cours d'édition
  formuleFiche: false,      // v0.1.11 : le panneau Équation insère dans la fiche ouverte
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
  calqueTexte: $('#calque-texte'),
  panneauPages: $('#panneau-pages'),
  vignettes: $('#vignettes'),
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
  // v0.1.13 : les boutons d'annulation suivent l'état du journal.
  $('#btn-annuler').disabled = !(resume && resume.peutAnnuler);
  $('#btn-retablir').disabled = !(resume && resume.peutRefaire);
  dessinerAnnots();
}

/* v0.1.13 : annulation et rétablissement, geste par geste. */
async function annulerGeste() {
  if (!etat.resume) return;
  const rep = await window.atelier.undo();
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  majResume(rep.resume);
  etat.selection = null;
  message(rep.rien ? 'Rien à annuler.' : 'Dernier geste annulé.', rep.rien ? 'info' : 'reussite');
}

async function retablirGeste() {
  if (!etat.resume) return;
  const rep = await window.atelier.redo();
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  majResume(rep.resume);
  etat.selection = null;
  message(rep.rien ? 'Rien à rétablir.' : 'Geste rétabli.', rep.rien ? 'info' : 'reussite');
}

$('#btn-annuler').addEventListener('click', annulerGeste);
$('#btn-retablir').addEventListener('click', retablirGeste);

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
  etat.opsEquation.clear(); // v0.1.10
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
  // v0.1.15 : le document s'ouvre sur sa vue d'ensemble, la colonne de
  // vignettes est visible par defaut (c'est l'ouverture demandee par
  // Arthur) ; le bouton Pages la masque ou la remet.
  els.panneauPages.hidden = false;
  $('#btn-pages').classList.add('actif');
  construireVignettes();
  message(`Document ouvert : ${rep.resume.pageCount} page(s).`, 'reussite');
}

/* ============================================================
   v0.1.15 : vignettes des pages, vision d'ensemble du document
   ============================================================
   Retour d'Arthur : l'application « fermait vers le cours », une page
   seule a la fois ; les autres editeurs laissent regarder partout. La
   colonne de miniatures montre TOUT le fichier d'un coup, signale la
   page courante et y amène d'un clic. Les vignettes se construisent
   une a une (un grand document n'attend pas la dernière page pour
   montrer les premières) ; un changement de document annule la
   construction en cours par un simple numero de génération. */
let generationVignettes = 0;

async function construireVignettes() {
  if (!etat.pdfjs || !etat.resume) return;
  const gen = ++generationVignettes;
  const colonne = els.vignettes;
  colonne.replaceChildren();
  const total = etat.resume.pageCount;
  for (let n = 1; n <= total; n += 1) {
    if (gen !== generationVignettes) return; // document changé entre-temps
    try {
      const page = await etat.pdfjs.getPage(n);
      if (gen !== generationVignettes) return;
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 124 / base.width });
      const toile = document.createElement('canvas');
      toile.width = Math.max(1, Math.round(vp.width));
      toile.height = Math.max(1, Math.round(vp.height));
      await page.render({ canvasContext: toile.getContext('2d'), viewport: vp }).promise;
      if (gen !== generationVignettes) return;
      const figure = document.createElement('figure');
      figure.className = 'vignette';
      figure.dataset.page = String(n);
      const etiquette = document.createElement('figcaption');
      etiquette.textContent = String(n);
      figure.append(toile, etiquette);
      colonne.append(figure);
      majVignettesPage();
    } catch (err) {
      // Une vignette manquante n'entrave ni la lecture ni les outils.
    }
  }
}

/* Signale la page courante dans la colonne et la garde visible. */
function majVignettesPage() {
  if (!els.vignettes.children.length) return;
  const colonne = els.vignettes;
  for (const f of colonne.querySelectorAll('.vignette.actif')) {
    f.classList.remove('actif');
  }
  const cible = colonne.querySelector(`.vignette[data-page="${etat.page}"]`);
  if (!cible) return;
  cible.classList.add('actif');
  // Suivre sans secouer : recadrer la colonne seulement si la courante
  // sort du champ.
  const haut = cible.offsetTop;
  const bas = haut + cible.offsetHeight;
  if (haut < colonne.scrollTop || bas > colonne.scrollTop + colonne.clientHeight) {
    colonne.scrollTop = haut - colonne.clientHeight / 2 + cible.offsetHeight / 2;
  }
}

/* Un clic sur une vignette amène à cette page. */
els.vignettes.addEventListener('click', (ev) => {
  const figure = ev.target.closest('.vignette');
  if (!figure || !etat.resume) return;
  const n = Number(figure.dataset.page);
  if (!Number.isInteger(n) || n < 1 || n > etat.resume.pageCount) return;
  if (n === etat.page) return;
  etat.page = n;
  rendPage();
});

/* Le bouton Pages masque ou remet la colonne ; une feuille ouverte sans
   colonne repond aussi a l'envie d'espace. */
$('#btn-pages').addEventListener('click', () => {
  const visible = els.panneauPages.hidden;
  els.panneauPages.hidden = !visible;
  $('#btn-pages').classList.toggle('actif', visible);
});

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
  // v0.1.13 : reconstruction du calque de texte invisible de pdf.js —
  // il porte la sélection native du navigateur à l'outil Texte ; un
  // échec n'entrave ni l'affichage ni les autres outils (diagnostics).
  rendCalqueTexte(page, viewport);
  dessinerAnnots();
  $('#etiquette-page').textContent = `${etat.page} / ${etat.resume.pageCount}`;
  // v0.1.15 : la page courante se signale dans la colonne de vignettes.
  majVignettesPage();
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

/* v0.1.10 : une équation posée se TRACE dans son rectangle. pdf.js ne
   dessine pas l'apparence /AP des /Square : notre calque est le seul
   à les montrer. Les opérateurs sont recalculés depuis le LaTeX
   EMBARQUÉ dans l'annotation (/Contents), via MathJax côté main :
   aucun cache lié à la pose, donc le faux repli pointillé de la
   v0.1.6 (find() par préfixe) ne peut plus se reproduire. */
function cleEquation(a) {
  return `${a.page}:${a.ref && a.ref.objectNumber}`;
}

const opsEnVol = new Set(); // clés en cours de calcul, contre les requêtes en double

/* v0.1.11 : la fiche « texte + formules ». Mêmes valeurs numériques que
   engine/melange.js : l'écran et le fichier doivent composer pareil. */
const FS_FICHE = 11;            // taille du texte de la fiche
const MARGE_FICHE = 2;          // marge horizontale
const MARGE_V_FICHE = 3;        // marge verticale haut/bas
const INTERBASE_FICHE = 0.45;   // × FS entre deux lignes

const mesureCtx = document.createElement('canvas').getContext('2d');
/** Largeur approximative d'un texte de fiche, en points (≈ px à la taille du corps). */
function mesurerFicheTexte(t) {
  mesureCtx.font = `${FS_FICHE}px sans-serif`;
  return mesureCtx.measureText(String(t)).width;
}

async function chargerOpsEquations() {
  if (!etat.resume) return;
  const annots = (etat.resume.annots || []).filter((x) => x.page === etat.page - 1
    && x.ref && (x.contents || '').startsWith(PREFIXE_EQUATION));
  // Nettoyage : supprime les clés des équations disparues de cette page.
  const cles = new Set(annots.map(cleEquation));
  for (const cle of etat.opsEquation.keys()) {
    if (cle.split(':')[0] === String(etat.page - 1) && !cles.has(cle)) {
      etat.opsEquation.delete(cle);
    }
  }
  const manquantes = annots.filter((x) => !etat.opsEquation.has(cleEquation(x))
    && !opsEnVol.has(cleEquation(x)));
  if (manquantes.length === 0) return;
  for (const x of manquantes) opsEnVol.add(cleEquation(x));
  let ajoute = false;
  for (const x of manquantes) {
    const cle = cleEquation(x);
    const latex = extraireLatexEquation(x.contents);
    if (latex) {
      try {
        const rep = await window.atelier.previewEquation(latex, etat.eqExPt);
        if (!rep.erreur) { etat.opsEquation.set(cle, rep.apercu); ajoute = true; }
      } catch (e) { /* repli conservé */ }
    }
    opsEnVol.delete(cle);
  }
  if (ajoute) dessinerAnnots();
}

/** Trace les opérateurs vectoriels d'une équation dans son rectangle
 * d'écran (restauré de la v0.1.6, où il fonctionnait correctement). */
function tracceEquation(ctx, apercu, rect) {
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
  ctx.setLineDash([]);
  let p = new Path2D();
  const mots = apercu.ops.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < mots.length) {
    const t = mots[i];
    const attendus = { m: 2, l: 2, c: 6, re: 4 }[t];
    if (attendus !== undefined) {
      const v = [];
      for (let j = 0; j < attendus; j += 1) v.push(Number(mots[i - attendus + j]));
      if (t === 'm') p.moveTo(px(v[0]), py(v[1]));
      else if (t === 'l') p.lineTo(px(v[0]), py(v[1]));
      else if (t === 'c') p.bezierCurveTo(px(v[0]), py(v[1]), px(v[2]), py(v[3]), px(v[4]), py(v[5]));
      else if (t === 're') p.rect(px(v[0]), py(v[1] + v[3]), v[2] * k, v[3] * k);
      i += 1;
    } else if (t === 'f') { ctx.fill(p); p = new Path2D(); i += 1; }
    else if (t === 'S') { ctx.stroke(p); p = new Path2D(); i += 1; }
    else { i += 1; } // h, rg, w, gs : ignorés pour le calque d'apparence
  }
  ctx.fill(p);
  ctx.stroke(p);
  ctx.restore();
}

/* ============================================================
   v0.1.11 : la fiche « texte + formules » — affichage et édition.
   Comme pour les équations (v0.1.10), pdf.js ne dessine PAS
   l'apparence : NOTRE calque trace texte et formules, calés sur le
   /Rect enregistré, même rendu que les autres lecteurs. Les ops des
   formules sont recalculées depuis la source EMBARQUÉE (/Contents).
   ============================================================ */

/** Trace les opérateurs d'une formule avec la LIGNE DE BASE posée en
 * (xPx, basePx) à l'échelle k (l'apparence fichier fait pareil :
 * translation (penX, base − depthPt) puis XObject). */
function tracerOpsPlacé(ctx, apercu, xPx, basePx, k) {
  if (!apercu || !apercu.ops) return;
  const px = (v) => xPx + v * k;
  const py = (v) => basePx + (apercu.heightPt - v) * k - apercu.depthPt * k;
  ctx.save();
  ctx.fillStyle = '#111319';
  ctx.strokeStyle = '#111319';
  ctx.lineWidth = Math.max(0.6, 0.9 * k);
  ctx.setLineDash([]);
  let p = new Path2D();
  const mots = String(apercu.ops).split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < mots.length) {
    const t = mots[i];
    const attendus = { m: 2, l: 2, c: 6, re: 4 }[t];
    if (attendus !== undefined) {
      const v = [];
      for (let j = 0; j < attendus; j += 1) v.push(Number(mots[i - attendus + j]));
      if (t === 'm') p.moveTo(px(v[0]), py(v[1]));
      else if (t === 'l') p.lineTo(px(v[0]), py(v[1]));
      else if (t === 'c') p.bezierCurveTo(px(v[0]), py(v[1]), px(v[2]), py(v[3]), px(v[4]), py(v[5]));
      else if (t === 're') p.rect(px(v[0]), py(v[1] + v[3]), v[2] * k, v[3] * k);
      i += 1;
    } else if (t === 'f') { ctx.fill(p); p = new Path2D(); i += 1; }
    else if (t === 'S') { ctx.stroke(p); p = new Path2D(); i += 1; }
    else { i += 1; }
  }
  ctx.fill(p);
  ctx.stroke(p);
  ctx.restore();
}

/** Carte claire de la fiche mixte (croquis validé). */
function fondFiche(ctx, x, y, w, h) {
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(253, 253, 255, 0.94)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(103, 122, 168, 0.45)';
  ctx.lineWidth = Math.max(1, etat.zoom);
  ctx.strokeRect(x, y, w, h);
}

/** Trace une fiche mixte posée : la source embarquée est recomposée
 * (texte + formules) dans le rectangle enregistré. */
function dessinerFicheMixte(ctx, a, x, y, w, h) {
  const source = extraireSourceFiche(a.contents);
  fondFiche(ctx, x, y, w, h);
  if (!source) return;
  const segments = decouperMelange(source);
  const formules = segments.filter((sg) => sg.type === 'formule');
  const carte = etat.opsFiche.get(cleEquation(a));
  const pret = !!(carte && formules.every((sg) => carte.has(sg.valeur)));
  if (!pret) {
    // Ops pas encore chargées (ou formule illisible) : la source reste
    // lisible en attendant, et le calcul se fait au fond.
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(167, 175, 192, 0.35)';
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.font = `${11 * etat.zoom}px sans-serif`;
    ecrireCarteCommentaire(ctx, source, x + w + 8 * etat.zoom, y, etat.zoom);
    chargerOpsFiches();
    return;
  }
  const dims = (latex) => {
    const ap = carte.get(latex);
    return ap ? { widthPt: ap.widthPt, heightPt: ap.heightPt, depthPt: ap.depthPt }
      : { widthPt: 0, heightPt: 0, depthPt: 0 };
  };
  const layout = composerLignes(segments, {
    mesurerTexte: mesurerFicheTexte,
    dimsFormule: dims,
    largeurMax: (a.rect[2] - a.rect[0]) - 2 * MARGE_FICHE,
    fontSize: FS_FICHE,
  });
  const interbase = INTERBASE_FICHE * FS_FICHE;
  ctx.font = `${FS_FICHE * etat.zoom}px sans-serif`;
  ctx.fillStyle = '#14161c';
  ctx.textBaseline = 'alphabetic';
  let curseur = a.rect[3] - MARGE_V_FICHE; // haut du rectangle, en points PDF
  for (const ligne of layout.lignes) {
    const base = curseur - ligne.hDessus;
    let penX = a.rect[0] + MARGE_FICHE;
    for (const m of ligne.morceaux) {
      const ecran = pdfVersEcran({ x: penX, y: base });
      if (m.type === 'texte') {
        const affiche = translitterMathWinAnsi(m.valeur);
        if (affiche) ctx.fillText(affiche, ecran.x, ecran.y);
      } else {
        tracerOpsPlacé(ctx, carte.get(m.valeur), ecran.x, ecran.y, etat.zoom);
      }
      penX += m.largeur;
    }
    curseur = base - ligne.hDes - interbase;
  }
}

const opsFicheEnVol = new Set(); // « cle|latex » en cours de calcul

/** Charge les ops des formules des fiches mixtes de la page courante,
 * depuis le LaTeX embarqué (aucun cache lié à la pose). */
async function chargerOpsFiches() {
  if (!etat.resume) return;
  const cibles = (etat.resume.annots || []).filter((x) => x.page === etat.page - 1
    && x.ref && (x.contents || '').startsWith(PREFIXE_FICHE_MIXTE));
  const exPt = exPourCorps(FS_FICHE);
  let change = false;
  for (const x of cibles) {
    const cle = cleEquation(x);
    let carte = etat.opsFiche.get(cle);
    if (!carte) { carte = new Map(); etat.opsFiche.set(cle, carte); }
    for (const seg of decouperMelange(extraireSourceFiche(x.contents))) {
      if (seg.type !== 'formule' || carte.has(seg.valeur)) continue;
      const cleVol = `${cle}|${seg.valeur}`;
      if (opsFicheEnVol.has(cleVol)) continue;
      opsFicheEnVol.add(cleVol);
      try {
        const rep = await window.atelier.previewEquation(seg.valeur, exPt);
        carte.set(seg.valeur, rep.erreur ? null : rep.apercu);
        change = true;
      } catch (e) {
        carte.set(seg.valeur, null); // échec nettoyé : la fiche reste lisible
        change = true;
      }
      opsFicheEnVol.delete(cleVol);
    }
  }
  // Nettoyage des fiches disparues de la page courante.
  const cles = new Set(cibles.map(cleEquation));
  for (const cle of etat.opsFiche.keys()) {
    if (cle.split(':')[0] === String(etat.page - 1) && !cles.has(cle)) {
      etat.opsFiche.delete(cle);
    }
  }
  if (change) dessinerAnnots();
}

/** Bouton « ƒ Insérer une formule » de la fiche (ou Ctrl+M) : le panneau
 * Équation passe en mode insertion-dans-la-fiche. */
function ouvrirInsertionFormule() {
  const attente = etat.saisieAttente;
  if (!attente || (attente.kind !== 'freeText' && attente.kind !== 'ficheMelangee')) return;
  // v0.1.12 : les formules appartiennent aux fiches ; la note nue reste du
  // texte simple (ses $...$ ne seraient jamais rendus dans le fichier).
  if (attente.kind === 'freeText' && attente.sujet === 'Note') {
    message('Les formules s\u2019écrivent dans une fiche : reprenez l\u2019outil Fiche pour mêler texte et calculs.');
    return;
  }
  etat.formuleFiche = true;
  $('#panneau-equation').hidden = false;
  const b = $('#eq-inserer');
  b.textContent = 'Insérer dans la fiche';
  b.disabled = false;
  const note = $('#eq-note');
  note.textContent = 'La formule s\u2019insérera à la position du curseur dans la fiche.';
  note.classList.remove('ok');
  $('#eq-saisie').focus();
}

/** Rétablit le panneau Équation en mode pose-sur-la-page. */
function retablirBoutonEquation() {
  etat.formuleFiche = false;
  const b = $('#eq-inserer');
  if (b.textContent === 'Insérer dans la fiche') {
    b.textContent = etat.remplacement ? 'Remplacer la formule' : 'Insérer dans la page';
    b.disabled = !etat.remplacement && !etat.eqPoint;
    const note = $('#eq-note');
    note.textContent = "Cliquez d'abord sur la page à l'outil Équation.";
    note.classList.remove('ok');
  }
}

/** Aperçu RENDU en direct de la fiche en cours d'édition (sous le champ). */
let sablierFiche = null;
function rafraichirApercuFiche() {
  if (sablierFiche) clearTimeout(sablierFiche);
  sablierFiche = setTimeout(async () => {
    sablierFiche = null;
    const attente = etat.saisieAttente;
    if (!attente || (attente.kind !== 'freeText' && attente.kind !== 'ficheMelangee')) {
      $('#editeur-apercu').hidden = true;
      return;
    }
    const source = $('#editeur-texte').value;
    if (!contientFormule(source)) {
      $('#editeur-apercu').hidden = true;
      return;
    }
    const manquantes = [];
    for (const sg of decouperMelange(source)) {
      if (sg.type === 'formule' && !etat.apercuEditeur.has(sg.valeur)) manquantes.push(sg.valeur);
    }
    if (manquantes.length) {
      for (const latex of manquantes) {
        etat.apercuEditeur.set(latex, null);
        try {
          const rep = await window.atelier.previewEquation(latex, exPourCorps(FS_FICHE));
          etat.apercuEditeur.set(latex, rep.erreur ? null : rep.apercu);
        } catch (e) { /* reste null */ }
      }
    }
    dessinerApercuFiche(source);
  }, 250);
}

function dessinerApercuFiche(source) {
  const canvas = $('#editeur-apercu');
  const c = canvas.getContext('2d');
  const FS = 12;                      // taille d'affichage de l'aperçu
  const k = FS / FS_FICHE;            // échelle des formules
  const segments = decouperMelange(source);
  const apercuDe = (latex) => etat.apercuEditeur.get(latex);
  const dims = (latex) => {
    const ap = apercuDe(latex);
    return ap ? { widthPt: ap.widthPt, heightPt: ap.heightPt, depthPt: ap.depthPt }
      : { widthPt: mesurerFicheTexte(`$${latex}$`), heightPt: FS_FICHE * 0.75, depthPt: 0 };
  };
  const mesurer = (t) => {
    c.font = `${FS}px sans-serif`;
    return c.measureText(String(t)).width / k;
  };
  const layout = composerLignes(segments, {
    mesurerTexte: mesurer,
    dimsFormule: dims,
    largeurMax: (canvas.width - 12) / k,
    fontSize: FS_FICHE,
  });
  const interbase = INTERBASE_FICHE * FS_FICHE;
  let hauteur = 16;
  for (let li = 0; li < layout.lignes.length; li += 1) {
    hauteur += (layout.lignes[li].hDessus + layout.lignes[li].hDes
      + (li ? interbase : 0)) * k;
  }
  canvas.height = Math.max(24, Math.round(hauteur));
  canvas.hidden = false;
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.font = `${FS}px sans-serif`;
  c.textBaseline = 'alphabetic';
  let basePx = 9 + layout.lignes[0].hDessus * k;
  for (const ligne of layout.lignes) {
    basePx += ligne.hDessus * k - (layout.lignes[0] === ligne ? layout.lignes[0].hDessus * k : 0);
    let penX = 6;
    for (const m of ligne.morceaux) {
      if (m.type === 'texte') {
        c.fillStyle = '#14161c';
        c.fillText(translitterMathWinAnsi(m.valeur), penX, basePx);
      } else {
        const ap = apercuDe(m.valeur);
        if (ap) {
          tracerOpsPlacé(c, ap, penX, basePx, k);
        } else {
          c.fillStyle = '#b04a2e';
          c.fillText(translitterMathWinAnsi(`$${m.valeur}$`), penX, basePx);
        }
      }
      penX += m.largeur * k;
    }
    basePx += (ligne.hDes + interbase) * k;
  }
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
      /* v0.1.10 : pdf.js ne dessine PAS l'apparence des /Square (vérifié
         dans son source : la couche d'annotations n'y met qu'une zone
         invisible de déclencheur de pop-up). Le tracé des équations
         revient donc à CE calque, calé sur le /Rect enregistré, qui est
         celui de l'apparence écrite dans le fichier : l'écran montre la
         même chose que les autres lecteurs. La « correction » de la
         v0.1.7 (suppression du tracé) rendait les équations posées
         totalement invisibles à l'écran. */
      if ((a.contents || '').startsWith(PREFIXE_FICHE_MIXTE)) {
        dessinerFicheMixte(ctx, a, x, y, w, h);
      } else if (!(a.contents || '').startsWith(PREFIXE_EQUATION)) {
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 1.5 * etat.zoom;
        ctx.strokeRect(x, y, w, h);
      } else {
        const apercu = etat.opsEquation.get(cleEquation(a));
        if (apercu) {
          tracceEquation(ctx, apercu, a.rect);
        } else {
          // Ops pas encore chargées (ou formule illisible) : montrons au
          // moins la source, et demandons le tracé au fond.
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(167, 175, 192, 0.35)';
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
          const latex = extraireLatexEquation(a.contents);
          if (latex) {
            ctx.font = `${11 * etat.zoom}px sans-serif`;
            ecrireCarteCommentaire(ctx, latex, x + w + 8 * etat.zoom, y, etat.zoom);
          }
          chargerOpsEquations();
        }
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
      // v0.1.12 : une note nue (Subject « Note », posée par un clic de
      // l'outil Note) s'écrit DIRECTEMENT sur la page — texte sombre, sans
      // fond ni icône, comme demandé (« texte écrit directement sur la
      // page, partout où je clique »). Les autres /FreeText restent des
      // fiches-cartes. Le texte n'est jamais coupé : la hauteur du /Rect
      // n'oblige pas la note à tenir dedans (elle se redimensionne).
      if (a.subject === 'Note') {
        ctx.fillStyle = '#14161c';
        ctx.font = `${11 * etat.zoom}px sans-serif`;
        ctx.textBaseline = 'top';
        const lignes = enveloppeTexte(ctx, a.contents, Math.max(w - 2 * etat.zoom, 10), 60);
        lignes.forEach((ligne, i) => {
          ctx.fillText(String(ligne), x + etat.zoom, y + i * 13 * etat.zoom);
        });
      } else {
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
      // v0.1.12 : poignées de redimensionnement (croquis validé) — petits
      // carrés blancs liserés d'accent sur le pourtour du rectangle.
      if (redimensionnable(a)) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#4C6FFF';
        ctx.lineWidth = 1.25;
        for (const p of poigneesRect(a.rect)) {
          const e = pdfVersEcran(p);
          const c = 3.5;
          ctx.fillRect(e.x - c, e.y - c, c * 2, c * 2);
          ctx.strokeRect(e.x - c, e.y - c, c * 2, c * 2);
        }
      }
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

/* ============================================================
   v0.1.13 : sélection de texte (calque pdf.js + mini-barre)
   ============================================================ */
let erreurCalqueTexte = null; // dernier échec du calque (diagnostics)

/* Reconstruit la couche de texte invisible de la page courante. Sans
   elle, le navigateur ne peut pas sélectionner le texte avec la souris.
   pdf.js v4 expose TextLayer ; en son absence, l'ancienne fonction
   renderTextLayer fait office de repli ; en cas d'échec, l'outil Texte
   se contente de le signaler mais le reste de l'application vit. */
async function rendCalqueTexte(page, viewport) {
  erreurCalqueTexte = null;
  els.calqueTexte.replaceChildren();
  els.calqueTexte.style.width = `${Math.round(viewport.width)}px`;
  els.calqueTexte.style.height = `${Math.round(viewport.height)}px`;
  if (!pdfjsLib) return;
  try {
    const contenu = await page.getTextContent();
    els.calqueTexte.style.setProperty("--scale-factor", String(viewport.scale));
    els.calqueTexte.style.setProperty("--total-scale-factor", String(viewport.scale));
    if (typeof pdfjsLib.TextLayer === 'function') {
      await new pdfjsLib.TextLayer({
        textContentSource: contenu,
        container: els.calqueTexte,
        viewport,
      }).render();
    } else {
      // Repli pdf.js antérieur à v4 (renderTextLayer, dépréciée).
      await pdfjsLib.renderTextLayer({
        textContentSource: contenu,
        textContent: contenu,
        container: els.calqueTexte,
        viewport,
        textDivs: [],
      });
    }
  } catch (err) {
    erreurCalqueTexte = (err && err.message) ? err.message : String(err);
  }
}

/* État de la sélection en cours : les quads et le texte retenus au
   relâchement de la souris, pour Surligner et Copier. */
const selectionTexte = { quads: null, rect: null, page: null, texte: '' };

function fermerBarreSelection() {
  $('#barre-selection').hidden = true;
  selectionTexte.quads = null;
  selectionTexte.rect = null;
  selectionTexte.page = null;
  selectionTexte.texte = '';
}

/* Convertit la sélection native du navigateur en fragments de page
   ({x0, yHaut, x1, yBas} en points PDF), un par rectangle du texte
   réellement sélectionné — le navigateur fournit déjà le découpage par
   ligne de texte via getClientRects. */
function fragmentsDeSelection() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const ancre = els.calqueTexte.getBoundingClientRect();
  const fragments = [];
  for (let i = 0; i < sel.rangeCount; i += 1) {
    for (const r of sel.getRangeAt(i).getClientRects()) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      const a = deviceToPdf(r.left - ancre.left, r.top - ancre.top, etat.viewport);
      const b = deviceToPdf(r.right - ancre.left, r.bottom - ancre.top, etat.viewport);
      fragments.push({
        x0: Math.min(a.x, b.x),
        x1: Math.max(a.x, b.x),
        yHaut: Math.max(a.y, b.y),
        yBas: Math.min(a.y, b.y),
      });
    }
  }
  if (!fragments.length) return null;
  return { fragments, texte: sel.toString() };
}

/* Boîte englobante de tous les quads, pour le /Rect de l'annotation. */
function boiteQuads(quads) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const q of quads) {
    x0 = Math.min(x0, q[0], q[4]);
    y0 = Math.min(y0, q[5], q[7]);
    x1 = Math.max(x1, q[2], q[6]);
    y1 = Math.max(y1, q[1], q[3]);
  }
  return [x0, y0, x1, y1];
}

function placerBarreSelection(x, y) {
  const barre = $('#barre-selection');
  barre.hidden = false;
  const largeur = barre.offsetWidth || 180;
  const hauteur = barre.offsetHeight || 36;
  const gauche = Math.min(window.innerWidth - largeur - 8, Math.max(8, x - largeur / 2));
  const haut = Math.min(window.innerHeight - hauteur - 8, Math.max(8, y - hauteur - 14));
  barre.style.left = `${Math.round(gauche)}px`;
  barre.style.top = `${Math.round(haut)}px`;
}

/* Au relâchement d'un geste de sélection avec l'outil Texte : la
   mini-barre flottante Surligner / Copier apparaît au curseur. */
document.addEventListener('mouseup', (ev) => {
  if (etat.outil !== 'texte' || gesteZoomActif() || !etat.resume) {
    if (etat.outil !== 'texte') fermerBarreSelection();
    return;
  }
  // Un clic sur la barre elle-même n'efface pas la sélection en cours :
  // ses boutons en ont besoin pour agir juste après.
  if (ev.target && ev.target.closest && ev.target.closest('#barre-selection')) return;
  const infos = fragmentsDeSelection();
  if (!infos) { fermerBarreSelection(); return; }
  const quads = quadsPourLignes(infos.fragments);
  if (!quads.length) { fermerBarreSelection(); return; }
  selectionTexte.quads = quads;
  selectionTexte.rect = boiteQuads(quads);
  selectionTexte.page = etat.page - 1;
  selectionTexte.texte = infos.texte;
  placerBarreSelection(ev.clientX, ev.clientY);
});

function viderSelectionNative() {
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
}

$('#sel-surligner').addEventListener('click', async () => {
  if (!selectionTexte.quads) return;
  const { quads, rect, page } = selectionTexte;
  fermerBarreSelection();
  viderSelectionNative();
  const rep = await appliquer({
    kind: 'highlight',
    pageIndex: page,
    args: {
      rect: rect.map((v) => Math.round(v * 100) / 100),
      quadPoints: quads.map((q) => q.map((v) => Math.round(v * 100) / 100)),
    },
  });
  if (rep) message('Texte sélectionné surligné.', 'reussite');
});

$('#sel-copier').addEventListener('click', async () => {
  const texte = selectionTexte.texte || '';
  fermerBarreSelection();
  viderSelectionNative();
  try {
    await navigator.clipboard.writeText(texte);
    message('Texte copié dans le presse-papiers.', 'reussite');
  } catch (err) {
    message('Copie impossible : le presse-papiers a refusé l\'accès.', 'erreur');
  }
});

/* Échap referme la barre ; le moindre défilement la fait disparaître
   (elle serait désynchronisée de la page). */
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') fermerBarreSelection();
});
els.visionneuse.addEventListener('scroll', fermerBarreSelection);

function ecouterSouris() {
  let geste = null; // { outil, depart, point, points[] }

  els.calqueTampon.addEventListener('pointerdown', (ev) => {
    // v0.1.6 : pendant le zoom fluide, la page est transformée en CSS :
    // ses coordonnées ne correspondraient pas au calque rendu.
    if (gesteZoomActif()) return;
    ev.preventDefault();
    els.calqueTampon.setPointerCapture(ev.pointerId);
    const point = pointPdf(ev);
    if (etat.outil === 'main') {
      // v0.1.13 : à la Main, la page se PREND et se fait glisser ; le
      // défilement suit le geste écran, sans conversion en points PDF.
      geste = {
        outil: 'main',
        ecran: { x: ev.clientX, y: ev.clientY },
        defile: { gauche: els.visionneuse.scrollLeft, haut: els.visionneuse.scrollTop },
      };
      document.body.classList.add('page-tenue');
      return;
    }
    if (etat.outil === 'aucun') {
      // v0.1.12 (croquis validé) : l'outil Sélection saisit l'annotation.
      // Une POIGNÉE (si l'annotation s'y prête et que le clic tombe dessus)
      // entame un redimensionnement ; sinon, un clic sur une annotation la
      // sélectionne ET permet de la faire glisser sur place ; un clic dans
      // le vide désélectionne.
      const sel = etat.selection;
      if (sel && sel.ref && sel.rect && redimensionnable(sel)) {
        const poignee = poigneeSousPoint(sel.rect, point, 6 / etat.zoom);
        if (poignee) {
          geste = { outil: 'poignee', id: poignee, ref: sel.ref, page: sel.page,
            rect0: sel.rect.slice(), depart: point };
          return;
        }
      }
      const cible = annotationSous(point);
      if (cible) {
        etat.selection = cible;
        dessinerAnnots();
        if (redimensionnable(cible)) {
          const poignee = poigneeSousPoint(cible.rect, point, 6 / etat.zoom);
          if (poignee) {
            geste = { outil: 'poignee', id: poignee, ref: cible.ref, page: cible.page,
              rect0: cible.rect.slice(), depart: point };
            return;
          }
        }
        geste = { outil: 'deplacement', ref: cible.ref, page: cible.page, depart: point };
        message(`Annotation ${cible.subtype} sélectionnée : glissez pour la déplacer`
          + `${redimensionnable(cible) ? ', tirez une poignée pour la redimensionner' : ''}`
          + ', Suppr pour retirer.');
      } else {
        if (etat.selection) {
          etat.selection = null;
          dessinerAnnots();
        }
        message('Aucune annotation sous le curseur.');
      }
      return;
    }
    if (etat.outil === 'surligner' || etat.outil === 'encadrer' || etat.outil === 'ecrire') {
      geste = { outil: etat.outil, depart: point };
    } else if (etat.outil === 'encre') {
      geste = { outil: 'encre', points: [point] };
    } else if (etat.outil === 'equation') {
      // v0.1.11 : cliquer une FICHE MIXTE l'ouvre pour correction ; la
      // v0.1.7 : cliquer une équation EXISTANTE l'ouvre pour correction.
      const cible = annotationSous(point);
      if (cible && (cible.contents || '').startsWith(PREFIXE_FICHE_MIXTE)) {
        ouvrirEditeur('fiche', null, cible);
        return;
      }
      if (cible && (cible.contents || '').startsWith(PREFIXE_EQUATION)) {
        ouvrirRemplacement(cible);
        return;
      }
      annulerRemplacement();
      if (etat.formuleFiche) retablirBoutonEquation();
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
    if ((cible.contents || '').startsWith(PREFIXE_EQUATION)) {
      ouvrirRemplacement(cible);
    } else if (cible.subtype === 'Text') {
      ouvrirEditeur('note', null, cible);
    } else if (cible.subtype === 'FreeText') {
      ouvrirEditeur('fiche', null, cible);
    } else if (cible.subtype === 'Square' && (cible.contents || '').startsWith(PREFIXE_FICHE_MIXTE)) {
      ouvrirEditeur('fiche', null, cible);
    }
  });

  els.calqueTampon.addEventListener('pointermove', (ev) => {
    if (!geste) return;
    if (geste.outil === 'main') {
      // v0.1.13 : la page suit le pointeur, pixel pour pixel.
      els.visionneuse.scrollLeft = geste.defile.gauche - (ev.clientX - geste.ecran.x);
      els.visionneuse.scrollTop = geste.defile.haut - (ev.clientY - geste.ecran.y);
      return;
    }
    const point = pointPdf(ev);
    const ctx = els.calqueTampon.getContext('2d');
    ctx.clearRect(0, 0, els.calqueTampon.width, els.calqueTampon.height);
    const a = pdfVersEcran(geste.depart);
    const b = pdfVersEcran(point);
    // v0.1.12 : aperçus du déplacement et du redimensionnement.
    if (geste.outil === 'poignee') {
      geste.point = point;
      const rect = rectDepuisPoignee(geste.rect0, geste.id, point);
      const r0 = pdfVersEcran({ x: rect[0], y: rect[1] });
      const r1 = pdfVersEcran({ x: rect[2], y: rect[3] });
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#4C6FFF';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.min(r0.x, r1.x), Math.min(r0.y, r1.y),
        Math.abs(r1.x - r0.x), Math.abs(r1.y - r0.y));
      ctx.setLineDash([]);
    } else if (geste.outil === 'deplacement') {
      geste.point = point;
      const sel = etat.selection;
      if (!sel) return;
      const dx = point.x - geste.depart.x;
      const dy = point.y - geste.depart.y;
      const r = sel.rect;
      const rectPdf = [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
      const r0 = pdfVersEcran({ x: rectPdf[0], y: rectPdf[1] });
      const r1 = pdfVersEcran({ x: rectPdf[2], y: rectPdf[3] });
      ctx.fillStyle = 'rgba(76, 111, 255, 0.12)';
      ctx.strokeStyle = 'rgba(76, 111, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.fillRect(Math.min(r0.x, r1.x), Math.min(r0.y, r1.y),
        Math.abs(r1.x - r0.x), Math.abs(r1.y - r0.y));
      ctx.strokeRect(Math.min(r0.x, r1.x), Math.min(r0.y, r1.y),
        Math.abs(r1.x - r0.x), Math.abs(r1.y - r0.y));
      ctx.setLineDash([]);
    } else if (geste.outil === 'encre') {
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
      if (geste.outil === 'poignee') {
        // v0.1.12 : redimensionner = UN SEUL edit final avec le rectangle
        // total, appliqué au relâchement (le moteur régénère l'apparence).
        const rect = rectDepuisPoignee(geste.rect0, geste.id, geste.point || geste.depart);
        const rep = await appliquer({
          kind: 'redimensionner', pageIndex: geste.page,
          args: { ref: geste.ref, rect: rect.map((v) => Math.round(v * 100) / 100) },
        });
        if (rep) {
          recollerSelection(rep);
          message('Annotation redimensionnée.', 'reussite');
        }
      } else if (geste.outil === 'deplacement') {
        // v0.1.12 : déplacement = UN SEUL edit final (dx, dy totaux), le
        // journal d'annulation n'enregistre pas chaque intermédiaire.
        const fin = geste.point || geste.depart;
        const dx = Math.round((fin.x - geste.depart.x) * 100) / 100;
        const dy = Math.round((fin.y - geste.depart.y) * 100) / 100;
        if (dx !== 0 || dy !== 0) {
          const rep = await appliquer({
            kind: 'deplacer', pageIndex: geste.page,
            args: { ref: geste.ref, dx, dy },
          });
          if (rep) {
            recollerSelection(rep);
            message('Annotation déplacée.', 'reussite');
          }
        }
      } else if (geste.outil === 'encre') {
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
        } else if (geste.outil === 'ecrire') {
          // v0.1.14 : machine à écrire. Un VRAI glissement (plus de 5 pt
          // en largeur et en hauteur) trace une zone ; un micro-glissement
          // de clic tremblé reste un clic, texte nu à l'endroit cliqué.
          const dx = Math.abs(geste.point.x - geste.depart.x);
          const dy = Math.abs(geste.point.y - geste.depart.y);
          if (dx > 5 && dy > 5) {
            ouvrirEditeur('fiche', rect.slice());
          } else {
            ouvrirEditeur('note', geste.depart);
          }
        }
      } else if (geste.outil === 'ecrire') {
        // v0.1.14 : un SIMPLE CLIC à la machine à écrire ouvre la saisie
        // du texte nu, exactement à l'endroit cliqué (ancien outil Note).
        ouvrirEditeur('note', geste.depart);
      }
    } finally {
      geste = null;
      document.body.classList.remove('page-tenue');
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

/** Une annotation peut-elle être redimensionnée à la poignée ?
 * Textes (notes et fiches), cadres et équations oui ; surlignage, trait
 * et icône-note non (le moteur les refuse) ; une annotation d'origine
 * externe (sans /AP) n'est pas retouchée : elle reste ce qu'elle est. */
function redimensionnable(a) {
  if (!a || !a.ref || a.hasAP === false) return false;
  return a.subtype === 'FreeText' || a.subtype === 'Square';
}

/** Recolle la sélection sur l'annotation FRAÎCHE après un déplacement ou
 * un redimensionnement : le résumé doit fournir le nouveau /Rect, et une
 * fiche mixte redimensionnée change de référence (elle est reposée). */
function recollerSelection(rep) {
  const fait = rep && rep.faits && rep.faits[0];
  const num = fait && fait.ref ? fait.ref.objectNumber : null;
  if (!Number.isInteger(num)) { etat.selection = null; return; }
  etat.selection = (rep.resume.annots || []).find((a) => a.ref
    && a.ref.objectNumber === num && a.page === etat.page - 1) || null;
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
  if (attente.kind === 'freeText' || attente.kind === 'ficheMelangee') {
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
  const mixte = !!(cible && cible.subtype === 'Square'
    && (cible.contents || '').startsWith(PREFIXE_FICHE_MIXTE));
  if (cible && (cible.subtype === 'Text' || cible.subtype === 'FreeText' || mixte)) {
    // Modification d'une annotation existante : retirer puis reposer.
    attente = {
      kind: cible.subtype === 'Text' ? 'textNote' : (mixte ? 'ficheMelangee' : 'freeText'),
      // v0.1.12 : une note nue (Subject « Note ») se réédite comme une note,
      // une fiche carte reste une fiche ; les fiches des versions
      // antérieures, sans /Subject, restent des cartes.
      sujet: cible.subject === 'Note' ? 'Note' : 'Fiche',
      pageIndex: cible.page,
      ref: cible.ref,
      rect: cible.rect.slice(),
      contenu: mixte ? extraireSourceFiche(cible.contents) : String(cible.contents || ''),
    };
  } else if (genre === 'note' && pointOuRect) {
    const p = pointOuRect;
    // v0.1.12 : la note s'écrit À L'ENDROIT CLIQUÉ (croquis validé), texte
    // nu sur la page, sans icône post-it : le clic marque le coin
    // supérieur gauche de la zone de texte (240 × 24 pt par défaut).
    attente = {
      kind: 'freeText',
      sujet: 'Note',
      pageIndex: etat.page - 1,
      rect: [p.x, p.y - 24, p.x + 240, p.y],
      contenu: '',
    };
  } else if (genre === 'fiche' && pointOuRect) {
    attente = {
      kind: 'freeText',
      sujet: 'Fiche',
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
  const estFiche = attente.kind === 'freeText' || attente.kind === 'ficheMelangee';
  // v0.1.12 : une note nue s'édite comme une note : pas de barre à formules
  // (les formules $...$ appartiennent aux fiches), titre et style à elle.
  const estNoteNue = attente.kind === 'freeText' && attente.sujet === 'Note';
  zone.classList.toggle('fiche', estFiche && !estNoteNue);
  editeurCaler(attente);
  const titre = $('#editeur-titre');
  titre.textContent = attente.kind === 'textNote' || estNoteNue
    ? (attente.ref ? 'Modifier la note' : 'Note')
    : (attente.ref ? 'Modifier la fiche' : 'Fiche : texte écrit sur la page');
  zone.value = attente.contenu;
  carte.hidden = false;
  $('#editeur-barre').hidden = !estFiche || estNoteNue;
  $('#editeur-apercu').hidden = !contientFormule(attente.contenu);
  if (estFiche && !estNoteNue && contientFormule(attente.contenu)) rafraichirApercuFiche();
  zone.focus();
  zone.setSelectionRange(zone.value.length, zone.value.length);
}

function fermerEditeur() {
  $('#editeur-page').hidden = true;
  $('#editeur-barre').hidden = true;
  $('#editeur-apercu').hidden = true;
  etat.saisieAttente = null;
  etat.apercuEditeur.clear();
  if (etat.formuleFiche) retablirBoutonEquation();
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
  let kind = attente.kind;
  const estFiche = attente.kind === 'freeText' || attente.kind === 'ficheMelangee';
  // v0.1.12 : une note nue n'absorbe jamais les $...$ : elle reste du texte
  // simple posé (les formules se mêlent aux FICHES seulement).
  const estNoteNue = attente.kind === 'freeText' && attente.sujet === 'Note';
  if (estFiche && !estNoteNue && contientFormule(texte)) {
    // v0.1.11 : une fiche qui contient des formules $...$ devient une
    // fiche mixte : texte et équations rendus ensemble, une seule annotation.
    kind = 'ficheMelangee';
    args.source = texte;
    args.fontSize = FS_FICHE;
  } else if (attente.kind === 'textNote') {
    args.contents = texte;
  } else {
    args.text = texte; // note nue ou fiche (ou ex-mixte redevenue texte seul)
    // v0.1.12 : « Note » (texte nu) ou « Fiche » (carte), relu dans le
    // /Subject par l'écran, les tests et le moteur de déplacement.
    args.subject = attente.sujet || 'Fiche';
  }
  edits.push({ kind, pageIndex: attente.pageIndex, args });
  const rep = await window.atelier.applyEdits(edits);
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  majResume(rep.resume);
  message(attente.ref ? 'Texte modifié.'
    : (estNoteNue ? 'Note posée sur la page.' : 'Texte posé.'), 'reussite');
}

$('#editeur-annuler').addEventListener('click', fermerEditeur);
$('#editeur-valider').addEventListener('click', validerEditeur);
$('#editeur-texte').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    validerEditeur();
  } else if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'm' || ev.key === 'M')) {
    // v0.1.11 : insertion d'une formule à la position du curseur.
    ev.preventDefault();
    ouvrirInsertionFormule();
  } else if (ev.key === 'Escape') {
    ev.stopPropagation();
    fermerEditeur();
  }
});
$('#editeur-formule').addEventListener('click', ouvrirInsertionFormule);
$('#editeur-texte').addEventListener('input', rafraichirApercuFiche);
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
    b.addEventListener('click', () => { insererAuChamp(p.src); rafraichirApercu(); }); // v0.1.11 : au curseur
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
    $('#eq-inserer').disabled = etat.formuleFiche ? false : !etat.eqPoint;
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
  // v0.1.11 : mode « insertion dans la fiche » : la formule VALIDÉE se
  // glisse à la position exacte du curseur de la fiche, entre $...$ ; la
  // frappe continue juste après. Rien ne se pose sur la page ici.
  if (etat.formuleFiche) {
    const attente = etat.saisieAttente;
    if (!attente || (attente.kind !== 'freeText' && attente.kind !== 'ficheMelangee')) {
      retablirBoutonEquation();
      message('La fiche n\u2019est plus ouverte : la formule n\u2019a pas été insérée.');
      return;
    }
    const repF = await window.atelier.previewEquation(latex, exPourCorps(FS_FICHE));
    if (repF.erreur || !repF.apercu) {
      message(repF.erreur || 'La formule n\u2019a pas pu être calculée.');
      return;
    }
    const zone = $('#editeur-texte');
    const debut = zone.selectionStart ?? zone.value.length;
    const fin = zone.selectionEnd ?? debut;
    zone.value = `${zone.value.slice(0, debut)}$${latex}$${zone.value.slice(fin)}`;
    const apres = debut + latex.length + 2;
    zone.focus();
    zone.setSelectionRange(apres, apres);
    rafraichirApercuFiche();
    message('Formule insérée dans la fiche.', 'reussite');
    return;
  }
  const remplacer = etat.remplacement;
  if (!remplacer && !etat.eqPoint) return;
  // v0.1.10 : aperçu TOUJOURS recalculé. Celui du panneau peut être périmé
  // (la fenêtre guidée vient d'écrire la saisie) et donnait une mauvaise
  // profondeur de pose : la formule se posait au mauvais endroit.
  const repApercu = await window.atelier.previewEquation(latex, etat.eqExPt);
  if (repApercu.erreur || !repApercu.apercu) {
    message(repApercu.erreur || 'La formule n\u2019a pas pu être calculée.');
    return;
  }
  const apercu = repApercu.apercu;
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
  const latex = extraireLatexEquation(a.contents); // v0.1.10 : marqueur canonique
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
const { PREFIXE_EQUATION, extraireLatexEquation } = globalThis.AtelierLatex;
const { PREFIXE_FICHE_MIXTE, extraireSourceFiche, translitterMathWinAnsi,
  decouperMelange, contientFormule, exPourCorps, composerLignes } = globalThis.AtelierTexte;
const { poigneesRect, poigneeSousPoint, rectDepuisPoignee } = globalThis.AtelierGeom;
const { GUIDES, composerSysteme, composerMatrice } = globalThis.AtelierGuides;

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

/* v0.1.9 : fenêtre matrice — après validation des dimensions (1 à 3),
   les deux cases de réglage sont remplacées par la grille des cellules. */
function validerDimensionsMatrice() {
  const l = Math.min(3, Math.max(1, parseInt(valeursGuide.lignes, 10) || 2));
  const c = Math.min(3, Math.max(1, parseInt(valeursGuide.colonnes, 10) || 2));
  valeursGuide.lignes = String(l);
  valeursGuide.colonnes = String(c);
  const cont = $('#guide-champs');
  cont.replaceChildren();
  for (let i = 1; i <= l; i += 1) {
    for (let j = 1; j <= c; j += 1) {
      cont.appendChild(creerChamp({
        id: `c${i}${j}`,
        libelle: `Ligne ${i}, colonne ${j}`,
        place: '0',
      }));
    }
  }
  $('#guide-erreur').hidden = true;
  $('#guide-valider').hidden = true;
  const premier = cont.querySelector('input');
  if (premier) premier.focus();
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
  dernierChampGuide = null;
  const cont = $('#guide-champs');
  cont.replaceChildren();
  const estSysteme = id === 'systeme';
  const estMatrice = id === 'matrice'; // v0.1.9 : dimensions puis cases
  const g = estSysteme ? GUIDE_SYSTEME : GUIDES[id];
  $('#guide-titre').textContent = g.titre;
  $('#guide-ecrire').hidden = estSysteme;
  $('#guide-valider').hidden = !estSysteme && !estMatrice;
  $('#guide-valider').textContent = estMatrice ? 'Créer les cases' : 'Valider';
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
  if (guideOuvert === 'matrice') return composerMatrice(valeursGuide); // v0.1.9
  return GUIDES[guideOuvert].composer(valeursGuide, choixGuide, cochesGuide);
}

/* v0.1.8 : la fenêtre guidée n'affiche PLUS de zone d'aperçu (demande
   d'Arthur). La composition est seulement vérifiée en silence afin de
   signaler toute erreur AVANT le bouton Écrire. */
async function majApercuGuide() {
  if (!guideOuvert) return;
  const comp = composerCourant();
  const err = $('#guide-erreur');
  if (!comp) { err.hidden = true; return; }
  if (comp.erreur) { err.textContent = comp.erreur; err.hidden = false; return; }
  err.hidden = true;
  const rep = await window.atelier.previewEquation(comp.latex, etat.eqExPt);
  if (rep.erreur) { err.textContent = rep.erreur; err.hidden = false; return; }
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
  // v0.1.11 : le gabarit composé s'insère à la position du curseur du champ
  // (comme la boîte de formule de Dmaths) au lieu d'écraser la saisie.
  insererAuChamp(comp.latex);
  rafraichirApercu();
  if (etat.formuleFiche) {
    await insererEquation();
    return;
  }
  if (etat.eqPoint) {
    await insererEquation();
  } else {
    message('Formule prête : cliquez le point d\u2019insertion sur la page, puis « Insérer dans la page ».');
  }
}

$('#guide-annuler').addEventListener('click', fermerGuide);
$('#guide-ecrire').addEventListener('click', ecrireGuide);
$('#guide-valider').addEventListener('click', () => {
  if (guideOuvert === 'matrice') validerDimensionsMatrice();
  else validerLigneSysteme();
});
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
  else if (guideOuvert === 'matrice' && !$('#guide-valider').hidden) validerDimensionsMatrice(); // v0.1.9
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
    : (outil === 'surligner' || outil === 'encadrer' || outil === 'ecrire') ? 'texte'
      : outil === 'equation' ? 'viseur'
        : outil === 'main' ? 'main'
          : outil === 'texte' ? 'texte'
            : 'defaut';
  corps.dataset.curseur = curseur;
  // v0.1.13 : le calque de texte ne devient visible et cliquable qu'à
  // l'outil Texte ; ailleurs, il laisserait le tampon passer.
  els.conteneur.classList.toggle('outil-texte', outil === 'texte');
  els.calqueTexte.hidden = outil !== 'texte';
  fermerBarreSelection();
  $('#panneau-equation').hidden = outil !== 'equation';
  const notes = {
    main: 'Faites glisser la page pour la faire défiler.',
    aucun: 'Cliquez une annotation : glissez-la pour la déplacer, tirez une poignée pour la redimensionner (Suppr pour retirer).',
    texte: 'Faites glisser sur le texte du document, puis Surligner ou Copier.',
    surligner: 'Glissez sur une ligne de texte.',
    encadrer: 'Glissez pour tracer un cadre.',
    encre: 'Tracez à main levée.',
    ecrire: 'Machine à écrire : cliquez pour écrire à cet endroit, ou glissez pour tracer une zone ; Ctrl+Entrée pose.',
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
  // v0.1.13 : pendant la saisie d'une note ou d'une formule, Ctrl+Z reste
  // l'annulation NATURE du champ ; le document ne bouge pas. Hors des champs,
  // il annule le dernier GESTE d'annotation, Ctrl+Maj+Z le rétablit.
  if (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'INPUT') return;
  if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) {
    ev.preventDefault();
    if (ev.shiftKey) retablirGeste(); else annulerGeste();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'y' || ev.key === 'Y')) {
    ev.preventDefault();
    retablirGeste();
    return;
  }
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
  if (cmd.nom === 'annuler') annulerGeste();      // v0.1.13 : menu Édition
  if (cmd.nom === 'retablir') retablirGeste();
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
