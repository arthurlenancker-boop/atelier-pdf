// renderer/app.js — Tâche 10 : visionneuse pdf.js, cinq outils, panneau Équation.
// Module ESM du processus de rendu. Aucune écriture directe de fichier ici :
// tout passe par window.atelier (pont preload) vers le processus principal.
'use strict';

import '../engine/coords.js'; // expose globalThis.AtelierCoords
import '../engine/guides.js'; // expose globalThis.AtelierGuides (v0.1.5)
import '../engine/latex.js'; // expose globalThis.AtelierLatex (v0.1.10)
import '../engine/texte.js'; // expose globalThis.AtelierTexte (v0.1.11)
import '../engine/geom.js'; // expose globalThis.AtelierGeom (v0.1.12)
import '../engine/ocr.js'; // expose globalThis.AtelierOcr (v0.1.22)
import '../engine/unicodemath.js'; // expose globalThis.AtelierUniMath (v0.1.24)
import '../engine/couleurs.js'; // expose globalThis.AtelierCouleurs (v0.1.31)
import '../engine/markup.js'; // expose globalThis.AtelierMarkup (v0.1.31)
import '../engine/surlignage.js'; // expose globalThis.AtelierSurlignage (v0.1.35)
import '../engine/textereel.js'; // expose globalThis.AtelierTexteReel (v0.1.38)

const { deviceToPdf, quadPointsForRange, quadsPourLignes } = globalThis.AtelierCoords;
const { motsDepuisBlocs, nettoyerCle, nettoyerUrlServeur, estHttpsLocal } = globalThis.AtelierOcr;

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

/* v0.1.24 : MathLive, la zone d'équation structurée (édition en place,
   validée sur la démo « demo-equation-gestes »). Chargement DYNAMIQUE
   obligatoire (leçon v0.1.2/v0.1.4 : un import statique raté tue tout le
   module sans un symptôme) : en cas d'échec, le champ LaTeX de toujours
   (textarea) prend le relais et l'application reste entièrement usable.
   Le rendu final du PDF, lui, reste le pipeline MathJax existant, inchangé :
   l'édition et le rendu sont deux moteurs distincts. */
let mathlive = null;         // module MathLive chargé ({ MathfieldElement })
let erreurMathlive = null;   // dernier message d'échec (diagnostics)

function champMath() { return $('#eq-mathfield'); }

async function chargerMathlive() {
  if (mathlive || erreurMathlive) return;
  try {
    const mod = await import('app://local/libs/mathlive/dist/mathlive.min.mjs');
    try { mod.MathfieldElement.fontsDirectory = 'app://local/libs/mathlive/dist/fonts/'; } catch (e) { /* réglage absent */ }
    try { mod.MathfieldElement.soundsDirectory = null; } catch (e) { /* pas de sons */ }
    mathlive = mod;
    installerMathfield();
  } catch (err) {
    erreurMathlive = (err && err.message) ? err.message : String(err);
    message('Zone d\u2019équation structurée indisponible : ' + erreurMathlive, 'erreur');
  }
}

/** Branche la zone structurée une fois le module chargé. */
function installerMathfield() {
  const mf = champMath();
  // Le champ peut déjà contenir du LaTeX saisi avant le chargement.
  if (!mf.value) mf.value = $('#eq-saisie').value;
  mf.addEventListener('input', rafraichirApercu);
  // v0.1.32 (retour d'Arthur : « je voulais mettre delta ») : le geste
  // OneNote « commande puis Espace » vaut aussi pour la zone structurée.
  // Par défaut MathLive n'insère RIEN sur la barre d'espace en mode math
  // (documenté) et son mode d'édition de commandes LaTeX (\delta… entré par
  // \ ou Échap) ne se quitte QUE par Échap : la commande tapée restait
  // affichée en lettres droites et la formule paraissait cassée. Ici,
  // Espace quitte le mode commande : \delta puis Espace compose δ, comme
  // OneNote. En dehors du mode commande, Espace reste sans effet.
  mf.addEventListener('keydown', (ev) => {
    if (ev.key !== ' ') return;
    try {
      if (mf.mode !== 'latex') return;
      ev.preventDefault();
      mf.mode = 'math';
      rafraichirApercu();
    } catch (e) { /* geste indisponible : Échap reste le repli */ }
  }, { capture: true });
  majVisibiliteChamps();
  if (etat.eqMode === 'pro') {
    $('#eq-libelle').textContent = 'Zone d\u2019équation, corrigez sur place';
    mf.focus();
  }
  rafraichirApercu();
}

/** Lequel des deux champs est visible : zone structurée en Professionnel
    (si MathLive est là), champ de toujours sinon et en Linéaire. */
function majVisibiliteChamps() {
  const struct = Boolean(mathlive) && etat.eqMode === 'pro';
  $('#eq-saisie').hidden = struct;
  champMath().hidden = !struct;
}

/** Contenu courant du champ d'équation ACTIF (LaTeX brut, non transcodé). */
function lireChampEquation() {
  if (mathlive && etat.eqMode === 'pro') {
    try { return champMath().getValue('latex'); } catch (e) { return ''; }
  }
  return $('#eq-saisie').value;
}

/** Remplace le contenu du champ d'équation actif (LaTeX brut). */
function poserChampEquation(latex) {
  const texte = latex ?? '';
  if (mathlive && etat.eqMode === 'pro') {
    try { champMath().value = texte; } catch (e) { $('#eq-saisie').value = texte; }
  } else {
    $('#eq-saisie').value = texte;
  }
}

/** Donne le focus au champ d'équation actif. */
function focusChampEquation() {
  if (mathlive && etat.eqMode === 'pro') champMath().focus();
  else $('#eq-saisie').focus();
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
      { label: 'Préscripts', tex: '{}_{}^{}', viz: '{}_a^b x' },
    ],
  },
  {
    group: 'Grands opérateurs',
    items: [
      { label: 'Somme', tex: '\\sum_{}^{}', viz: '\\sum_{k=1}^{n} k' },
      { label: 'Produit', tex: '\\prod_{}^{}', viz: '\\prod_{k=1}^{n} k' },
      { label: 'Intégrale', tex: '\\int_{}^{}', viz: '\\int_{0}^{1}' },
      { label: 'Circulaire', tex: '\\oint_{}^{}', viz: '\\oint_{C}' },
      { label: '∬ double', tex: '\\iint_{}^{}', viz: '\\iint_{0}^{1}' },
      { label: '∭ triple', tex: '\\iiint_{}^{}', viz: '\\iiint_{0}^{1}' },
      { label: '⋂ inter', tex: '\\bigcap_{}^{}', viz: '\\bigcap_{i}' },
      { label: '⋃ union', tex: '\\bigcup_{}^{}', viz: '\\bigcup_{i}' },
    ],
  },
  {
    group: 'Crochets',
    items: [
      { label: '( )', tex: '( )', viz: '(x)' },
      { label: '[ ]', tex: '[ ]', viz: '[x]' },
      { label: '{ }', tex: '{ }', viz: '{x}' },
      { label: '| x |', tex: '\\left| \\right|', viz: '\\left|x\\right|' },
      { label: '‖ x ‖', tex: '\\left\\| \\right\\|', viz: '\\left\\|x\\right\\|' },
      { label: '⟨ x ⟩', tex: '\\langle \\rangle', viz: '\\langle x \\rangle' },
      { label: 'Encadrer', tex: '\\boxed{}', viz: '\\boxed{x}' },
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
      // v0.1.32 : l'alphabet grec complet (retour d'Arthur sur delta).
      ['\\epsilon', 'ε'], ['\\varepsilon', 'ε'], ['\\zeta', 'ζ'], ['\\eta', 'η'], ['\\iota', 'ι'],
      ['\\kappa', 'κ'], ['\\nu', 'ν'], ['\\xi', 'ξ'], ['\\tau', 'τ'], ['\\upsilon', 'υ'],
      ['\\chi', 'χ'], ['\\psi', 'ψ'], ['\\Gamma', 'Γ'], ['\\Theta', 'Θ'], ['\\Lambda', 'Λ'],
      ['\\Xi', 'Ξ'], ['\\Phi', 'Φ'], ['\\Psi', 'Ψ'], ['\\vartheta', 'ϑ'], ['\\varphi', 'ϕ'],
    ],
  },
  {
    name: 'Ensembles & flèches',
    items: [
      ['\\in', '∈'], ['\\notin', '∉'], ['\\subset', '⊂'], ['\\cap', '∩'], ['\\cup', '∪'],
      ['\\rightarrow', '→'], ['\\Rightarrow', '⇒'], ['\\leftrightarrow', '↔'],
      // v0.1.27 (retour d'Arthur) : la double flèche ⇔ et ses sœurs.
      ['\\leftarrow', '←'], ['\\Leftarrow', '⇐'], ['\\Leftrightarrow', '⇔'],
      ['\\Longleftrightarrow', '⟺'],
      ['\\parallel', '∥'], ['\\perp', '⊥'], ['\\angle', '∠'], ['\\equiv', '≡'],
      ['\\cdots', '⋯'], ['\\ldots', '…'],
    ],
  },
  {
    name: 'Grands opérateurs',
    items: [
      ['\\iint', '∬'], ['\\iiint', '∭'], ['\\oint', '∮'],
      ['\\bigcap', '⋂'], ['\\bigcup', '⋃'], ['\\coprod', '∐'],
    ],
  },
];

const LINEAIRE = new Map();
for (const cat of SYMR) {
  for (const [tex, car] of cat.items) LINEAIRE.set(car, tex);
}
LINEAIRE.set('√', '\\sqrt');

/* Transcodage Linéaire -> LaTeX : depuis la v0.1.24, le MOTEUR COMPLET
   UnicodeMath (engine/unicodemath.js, le « Linéaire » de OneNote, UTN28)
   décode fractions, scripts, radicaux avec degré, n-aires, accents,
   matrices, systèmes. La table LINEAIRE reste en FILET : tout symbole
   encore littéral après le moteur (α, ⋯…) reçoit sa forme LaTeX. */
const { transcoder: transcoderUniMath } = globalThis.AtelierUniMath;
function transcoderLineaire(saisie) {
  let base = saisie;
  try {
    base = transcoderUniMath(saisie);
  } catch (e) {
    base = saisie; // moteur muet : l'aperçu MathJax signalera la formule
  }
  let hors = '';
  for (const car of base) hors += LINEAIRE.get(car) ?? car;
  return hors;
}

/* ============================================================
   État global
   ============================================================ */
const $ = (sel) => document.querySelector(sel);

const etat = {
  chemin: null,
  resume: null,   // { chemin, modifie, pageCount, annots } renvoyé par le main
  idOnglet: null, // v0.1.30 : identifiant de l'onglet affiché
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
  formuleCible: null, // v0.1.36 : image de formule double-cliquée pour remplacement
  formuleFiche: false,      // v0.1.11 : le panneau Équation insère dans la fiche ouverte
  eqPoint: null,  // dernier clic Équation : { pageIndex, point }
  eqExPt: 4.5,
  selection: null,
  saisieAttente: null, // { kind, rect, pageIndex, ref? } pendant l'édition sur la page
  annotationMasquee: null, // v0.1.18 : annotation rééditée, retirée du calque le temps d'écrire
  // v0.1.7 : remplacement d'une équation existante (clic sur l'équation) :
  // tant que rempli, « Insérer » remplace au lieu de poser un nouveau objet.
  remplacement: null,   // { ref, pageIndex, latex }
  // v0.1.31 : options de pose de chaque outil (croquis validé) —
  // conservées d'une annotation à l'autre pendant la session.
  options: {
    surligner: { forme: 'plein', couleur: '#FFDF3A' },
    encadrer: { forme: 'rect', trait: 'continu', ep: 'moyen', teinte: false, couleur: '#0067C0' },
    ecrire: { taille: 11, couleur: null, styles: {} }, // v0.1.40 : styles et couleur armés
  },
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
  calqueReco: $('#calque-reco'), // v0.1.29 : blocs reconnus de la page affichée
};

/* ============================================================
   Utilitaires
   ============================================================ */
function message(texte, ton = 'info') {
  const p = $('#message-etat');
  p.textContent = texte;
  p.style.color = ton === 'erreur' ? '#A4262C'
    : ton === 'reussite' ? '#107C10' : '';
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
  majRecoVue(); // v0.1.29 : les états « corrigé » des blocs suivent le document
  majOnglets(); // v0.1.30 : pastilles et active de la bande d'onglets
}

/* ============================================================
   v0.1.30 : onglets. Chaque PDF ouvert vit dans un onglet ; le
   processus principal garde l'état complet (document, journal des
   gestes, « modifié »), ici ne vit que la présentation : nom du
   fichier, pastille, et la vue mémorisée (page, zoom) pour rendre
   la bascule instantanée à l'identique.
   ============================================================ */
const ongletsOuverts = new Map(); // id → { id, chemin, modifie, vue: { page, zoom } }

function nomCourt(chemin) {
  const parties = String(chemin || '').split(/[\\/]/).filter(Boolean);
  return parties.length ? parties[parties.length - 1] : chemin;
}

function majOnglets() {
  const bande = $('#onglets');
  if (!bande) return;
  if (ongletsOuverts.size === 0) {
    bande.hidden = true;
    bande.replaceChildren();
    return;
  }
  bande.hidden = false;
  bande.replaceChildren();
  for (const o of ongletsOuverts.values()) {
    const onglet = document.createElement('button');
    onglet.type = 'button';
    onglet.className = 'onglet' + (o.id === etat.idOnglet ? ' actif' : '');
    onglet.role = 'tab';
    onglet.title = o.chemin;
    const nom = document.createElement('span');
    nom.className = 'onglet-nom';
    nom.textContent = nomCourt(o.chemin);
    onglet.append(nom);
    if (o.modifie) {
      const point = document.createElement('span');
      point.className = 'onglet-modifie';
      point.textContent = '●';
      point.title = 'Modifications non enregistrées';
      onglet.append(point);
    }
    const croix = document.createElement('span');
    croix.className = 'onglet-croix';
    croix.textContent = '×';
    croix.title = 'Fermer cet onglet';
    onglet.append(croix);
    onglet.addEventListener('click', (ev) => {
      if (ev.target === croix) {
        ev.stopPropagation();
        fermerOnglet(o.id);
        return;
      }
      if (o.id !== etat.idOnglet) activerOnglet(o.id);
    });
    bande.append(onglet);
  }
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
  // v0.1.30 : la pastille vit aussi dans la bande d'onglets (celle de
  // l'onglet concerné, pas seulement du document affiché au moment du clic).
  if (infos && infos.idOnglet != null) {
    const tab = ongletsOuverts.get(infos.idOnglet);
    if (tab) tab.modifie = !!infos.modifie;
  }
  majOnglets();
});

/* ============================================================
   v0.1.30 : ouverture, onglets et rendu pdf.js. Un PDF ouvert = un
   onglet ; le processus principal porte l'état de CHACUN (document,
   journal des gestes, « modifié »), celui-ci n'affiche que l'actif.
   Bascule = réaffichage depuis le résumé du main ; la vue mémorisée
   (page, zoom, mots reconnus) voyage dans l'onglet pour une reprise
   à l'identique.
   ============================================================ */
async function ouvrirDocument(chemin) {
  // v0.1.3 : le fichier est demandé d'abord au processus principal (boîte de
  // dialogue ou chemin déposé) ; le moteur d'affichage n'est requis qu'après.
  // Avant, l'absence de pdf.js bloquait même la boîte de dialogue : impossible
  // de distinguer « rien ne se passe » d'un échec de chargement du moteur.
  const rep = await window.atelier.open(chemin);
  if (rep.annule) return;
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  // v0.1.30 : déjà ouvert ? Le main renvoie l'onglet existant, on l'active
  // (un document n'est jamais édité en double).
  if (rep.dejaOuvert) {
    memoriserVueOnglet();
    await activerOnglet(rep.idOnglet);
    message('Ce document était déjà ouvert : son onglet est réactivé.', 'info');
    return;
  }
  const tab = {
    id: rep.idOnglet,
    chemin: rep.resume.chemin,
    modifie: false,
    vue: null,
    ocrMots: null,
    ocrPages: null,
  };
  ongletsOuverts.set(tab.id, tab);
  await afficherDocument(rep);
  // v0.1.28 : la reconnaissance du document part à l'ouverture (serveur OCR
  // configuré, décision d'Arthur : MinerU). v0.1.30 : à l'OUVERTURE seule —
  // basculer d'onglet ne relance pas une passe déjà faite ; les résultats
  // mémorisés de l'onglet ont été restaurés par afficherDocument.
  reconnaitreDocument();
  if (!pdfjsLib) {
    // Le message d'afficherDocument mentionnera pdf.js au rebond : ici le
    // tab existe quand même, la bande montre le fichier.
    majOnglets();
  }
}

/** Affiche (ou réaffiche) le document d'une réponse open/activate :
 *  réinitialise tout l'état du rendu propre à un document, restaure la
 *  vue mémorisée (page, zoom) quand il y en a une. */
async function afficherDocument(rep, vueMemorisee) {
  const tab = ongletsOuverts.get(rep.idOnglet) || ongletsOuverts.get(rep.idOngletActif);
  if (!pdfjsLib) {
    etat.chemin = rep.resume.chemin;
    etat.idOnglet = rep.idOnglet ?? rep.idOngletActif ?? null;
    message(`« ${rep.resume.chemin} » est ouvert, mais l'afficheur pdf.js n'a pas pu être chargé`
      + `${erreurPdfjs ? ` : ${erreurPdfjs}` : ''}. Menu Aide → Diagnostics de l'application.`, 'erreur');
    return;
  }
  etat.idOnglet = rep.idOnglet ?? rep.idOngletActif ?? null;
  etat.resume = null;
  etat.annotsPdf = [];
  etat.selection = null;
  etat.eqPoint = null;
  etat.remplacement = null;
  etat.opsEquation.clear(); // v0.1.10
  etat.opsFiche.clear();    // v0.1.30 : les ops de l'onglet précédé ne servent plus
  cacheItemsTexte.clear();  // v0.1.38 : le vrai texte appartient au document ouvert
  motsOcrPages.clear();     // v0.1.22 : une autre reconnaissance tout autre document
  couperReconnaissanceDocument(); // v0.1.28 : idem reconnaissance serveur du document
  pageMuette = false;
  // v0.1.30 : reprise des reconnaissances mémorisées de l'onglet.
  if (tab) {
    if (tab.ocrMots) { for (const [n, v] of tab.ocrMots) motsOcrPages.set(n, v); }
    if (tab.ocrPages) { for (const [n, v] of tab.ocrPages) recoDocument.pages.set(n, v); }
  }
  etat.chemin = rep.resume.chemin;
  etat.page = 1;
  resoudreZoom();
  const vue = vueMemorisee || (tab && tab.vue) || null;
  if (vue && vue.page >= 1 && vue.page <= rep.resume.pageCount) {
    etat.page = vue.page;
    if (Number.isFinite(vue.zoom) && vue.zoom > 0) etat.zoom = vue.zoom;
  }
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
  // v0.1.16 (leçon de la capture d'Arthur) : le message d'ouverture
  // écrasait aussitôt un éventuel échec de rendu de la page, qui
  // restait invisible pour l'utilisateur alors que tout semblait aller.
  if (erreurRendu) {
    message(`Document ouvert, mais l'affichage de la page a échoué : ${erreurRendu}. `
      + 'Menu Aide → Diagnostics de l’application.', 'erreur');
  } else {
    message(`Document ouvert : ${rep.resume.pageCount} page(s).`, 'reussite');
  }
}

/** Range dans l'onglet courant la vue actuelle et les reconnaissances en
 *  mémoire (appelée AVANT de basculer vers un autre onglet). */
function memoriserVueOnglet() {
  const tab = ongletsOuverts.get(etat.idOnglet);
  if (!tab) return;
  tab.vue = { page: etat.page, zoom: etat.zoom };
  tab.ocrMots = new Map(motsOcrPages);
  tab.ocrPages = new Map(recoDocument.pages);
}

/** Bascule vers l'onglet indiqué : le main change l'état actif et rend le
 *  résumé + les octets ; la vue mémorisée de l'onglet reprend sa place. */
async function activerOnglet(id) {
  const cible = ongletsOuverts.get(id);
  if (!cible) return;
  // v0.1.30 : une écriture en cours sur la page de l'onglet quitté ne
  // traverse pas la bascule — le cadre vit dans LE conteneur de page.
  if (etat.idOnglet !== id && etat.saisieAttente) fermerEditeur();
  if (etat.idOnglet != null && etat.idOnglet !== id) memoriserVueOnglet();
  const rep = await window.atelier.activer(id);
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  await afficherDocument(rep);
  message(`Onglet activé : « ${nomCourt(cible.chemin)} » (page ${etat.page}).`, 'info');
}

/** Ferme l'onglet indiqué (l'avis « enregistrer avant de fermer » est posé
 *  par le PROCESSUS PRINCIPAL : boîte native Enregistrer / Fermer sans
 *  enregistrer / Annuler quand le document est modifié). */
async function fermerOnglet(id) {
  const cible = id == null ? etat.idOnglet : id;
  // v0.1.30 : un cadre d'écriture en cours sur CET onglet ne survit pas à sa
  // fermeture — on le referme proprement (abandon du brouillon non posé).
  if (cible === etat.idOnglet && etat.saisieAttente) fermerEditeur();
  const rep = await window.atelier.fermer(id);
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  if (!rep.ferme) return; // l'utilisateur a annulé : rien ne bouge
  ongletsOuverts.delete(cible);
  if (rep.idOngletActif == null) {
    // Plus aucun document : retour à l'accueil, tout est remis à plat.
    etat.idOnglet = null;
    etat.resume = null;
    etat.chemin = null;
    etat.annotsPdf = [];
    etat.selection = null;
    etat.eqPoint = null;
    etat.remplacement = null;
    etat.opsEquation.clear();
    etat.opsFiche.clear();
    cacheItemsTexte.clear();
    motsOcrPages.clear();
    couperReconnaissanceDocument();
    if (etat.pdfjs) { await etat.pdfjs.destroy(); etat.pdfjs = null; }
    els.visionneuse.hidden = true;
    els.accueil.hidden = false;
    els.vignettes.replaceChildren();
    majResume(null);
    message('Tous les documents sont fermés.', 'info');
    return;
  }
  // Le main a déjà activé le remplaçant : on l'affiche.
  await afficherDocument({
    idOnglet: rep.idOngletActif,
    resume: rep.resume,
    octets: rep.octets,
  });
  message(`Onglet fermé. Document courant : « ${nomCourt(etat.chemin)} ».`, 'info');
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
      appliquerEtatRecoVignette(figure, n); // v0.1.28 : page déjà reconnue/en cours
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
    // v0.1.35 : le rendu principal ne peint PLUS les annotations dans le
    // canevas de la page (annotationMode DISABLE). pdf.js peignait les
    // apparences — surlignage d'origine, encre, formes tierces — SOUS le
    // calque applicatif, qui est déjà l'unique source visible des
    // annotations : une suppression à l'écran laisse donc une peinture
    // orpheline au fond de page, « un retrait qui ne se voit pas ».
    // Vignettes et captures gardent le rendu complet : elles n'ont pas
    // de calque. Repli prudent : si AnnotationMode manque (pdf.js très
    // ancien), 0 EST la valeur DISABLE de la norme du module.
    const modeAnnot = (pdfjsLib && pdfjsLib.AnnotationMode
      && Number.isInteger(pdfjsLib.AnnotationMode.DISABLE))
      ? pdfjsLib.AnnotationMode.DISABLE : 0;
    tacheRendu = page.render({ canvasContext: els.calquePdf.getContext('2d'), viewport, annotationMode: modeAnnot });
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
  majRecoVue(); // v0.1.29 : l'aperçu suit la page affichée
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
  // v0.1.19 : la note mixte (Subject « Note ») reste posée À MÊME LA PAGE,
  // sans carte ni liseret — même allure que la note texte nue.
  if (a.subject !== 'Note') fondFiche(ctx, x, y, w, h);
  if (!source) return;
  const segments = decouperMelange(source);
  const formules = segments.filter((sg) => sg.type === 'formule');
  const carte = etat.opsFiche.get(cleEquation(a));
  const pret = !!(carte && formules.every((sg) => carte.has(sg.valeur)));
  if (!pret) {
    // Ops pas encore chargées (ou formule illisible) : la source reste
    // lisible en attendant, et le calcul se fait au fond.
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.55)';
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

/** v0.1.29 : trace une correction posée — masque blanc opaque du fichier,
 * recomposé à l'écran, puis la source (texte + formules) à la taille
 * embarquée du marqueur. Le rendu suit dessinerFicheMixte, à corps variable. */
function dessinerCorrection(ctx, a, x, y, w, h) {
  const fs = extraireTailleCorrection(a.contents) || FS_FICHE;
  const k = fs / FS_FICHE; // les mesures d'Helvétique sont linéaires en corps
  // v0.1.38 : la famille du MARQUEUR gouverne le tracé écran — le fichier
  // et l'aperçu recomposent dans la même (Times pour une correction d'une
  // page à empattements). Les marqueurs anciens, sans famille, étaient
  // posés en Helvetica : le repli « sans » est fidèle.
  const serif = extraireFamilleCorrection(a.contents) === 'serif';
  const gras = Boolean(extraireGrasCorrection(a.contents));
  const policeEcran = `${gras ? 'bold ' : ''}${serif ? '"Times New Roman", Times, serif' : 'sans-serif'}`;
  const mesurer = (t) => {
    mesureCtx.font = `${gras ? 'bold ' : ''}${FS_FICHE}px ${serif ? '"Times New Roman", Times, serif' : 'sans-serif'}`;
    return mesureCtx.measureText(String(t)).width;
  };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  const source = extraireSourceCorrection(a.contents);
  if (!source) return;
  const segments = decouperMelange(source);
  const formules = segments.filter((sg) => sg.type === 'formule');
  const carte = etat.opsFiche.get(cleEquation(a));
  const pret = !!(carte && formules.every((sg) => carte.has(sg.valeur)));
  if (!pret) {
    // Ops pas encore chargées (ou formule illisible) : la source reste
    // lisible en attendant, et le calcul se fait au fond.
    ctx.font = `${fs * etat.zoom}px ${policeEcran}`;
    ctx.fillStyle = '#14161c';
    ctx.textBaseline = 'alphabetic';
    const ligne = source.replace(/\n/g, ' ');
    ctx.fillText(ligne.slice(0, 90), x + 2 * etat.zoom, y + h / 2);
    chargerOpsFiches();
    return;
  }
  const dims = (latex) => {
    const ap = carte.get(latex);
    return ap ? { widthPt: ap.widthPt, heightPt: ap.heightPt, depthPt: ap.depthPt }
      : { widthPt: 0, heightPt: 0, depthPt: 0 };
  };
  const layout = composerLignes(segments, {
    mesurerTexte: (t) => mesurer(t) * k,
    dimsFormule: dims,
    largeurMax: (a.rect[2] - a.rect[0]) - 2 * MARGE_FICHE,
    fontSize: fs,
  });
  const interbase = INTERBASE_FICHE * fs;
  ctx.font = `${fs * etat.zoom}px ${policeEcran}`;
  ctx.fillStyle = '#14161c';
  ctx.textBaseline = 'alphabetic';
  let curseur = a.rect[3] - MARGE_V_FICHE * k; // haut du rectangle, points PDF
  for (const ligne of layout.lignes) {
    const base = curseur - ligne.hDessus;
    let penX = a.rect[0] + MARGE_FICHE;
    for (const m of ligne.morceaux) {
      const ecran = pdfVersEcran({ x: penX, y: base });
      if (m.type === 'texte') {
        const affiche = translitterMathWinAnsi(m.valeur);
        if (affiche) ctx.fillText(affiche, ecran.x, ecran.y);
      } else {
        // Ops chargées au CORPS de CETTE correction (chargerOpsFiches)
        // comme les fiches le sont au leur : le tracé suit, zoomé.
        const ap = carte.get(m.valeur);
        if (ap) tracerOpsPlacé(ctx, ap, ecran.x, ecran.y, etat.zoom);
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
  // v0.1.29 : les CORRECTIONS suivent le même chemin que les fiches,
  // mais leurs formules se composent au CORPS de leur marqueur (le bloc
  // reconnu), pas au corps fixe des fiches.
  // v0.1.31 : les NOTES RICHES suivent le même chemin, au corps de leur
  // marqueur (la taille posée à l'écriture), leur source étant canonique
  // (seules les formules $...$ sont découpées ; les balises restent).
  const cibles = (etat.resume.annots || []).filter((x) => x.page === etat.page - 1
    && x.ref && ((x.contents || '').startsWith(PREFIXE_FICHE_MIXTE)
      || (x.contents || '').startsWith(PREFIXE_CORRECTION)
      || (x.contents || '').startsWith(PREFIXE_NOTE_RICHE)));
  let change = false;
  for (const x of cibles) {
    const cle = cleEquation(x);
    let carte = etat.opsFiche.get(cle);
    if (!carte) { carte = new Map(); etat.opsFiche.set(cle, carte); }
    const estCorrection = (x.contents || '').startsWith(PREFIXE_CORRECTION);
    const estRiche = (x.contents || '').startsWith(PREFIXE_NOTE_RICHE);
    const source = estCorrection ? extraireSourceCorrection(x.contents)
      : estRiche ? extraireSourceNoteRiche(x.contents)
        : extraireSourceFiche(x.contents);
    const exCible = estCorrection
      ? exPourCorps(extraireTailleCorrection(x.contents) || FS_FICHE)
      : estRiche
        ? exPourCorps(extraireTailleNoteRiche(x.contents) || FS_FICHE)
        : exPourCorps(FS_FICHE);
    for (const seg of decouperMelange(source)) {
      if (seg.type !== 'formule' || carte.has(seg.valeur)) continue;
      const cleVol = `${cle}|${seg.valeur}`;
      if (opsFicheEnVol.has(cleVol)) continue;
      opsFicheEnVol.add(cleVol);
      try {
        const rep = await window.atelier.previewEquation(seg.valeur, exCible);
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
  if (!attente || (attente.kind !== 'freeText' && attente.kind !== 'ficheMelangee'
    && attente.kind !== 'noteRiche')) return;
  // v0.1.19 : la machine à écrire accepte les formules — une note
  // (outil Écrire) devient une note mixte, posée sans fond, comme la
  // fiche mixte l'est sur carte. Plus de renvoi vers l'outil Fiche.
  etat.formuleFiche = true;
  $('#panneau-equation').hidden = false;
  const b = $('#eq-inserer');
  const dansNote = attente.sujet === 'Note';
  b.textContent = dansNote ? 'Insérer dans la note' : 'Insérer dans la fiche';
  b.disabled = false;
  const note = $('#eq-note');
  note.textContent = dansNote
    ? "La formule s\u2019insérera à la position du curseur dans la note."
    : "La formule s\u2019insérera à la position du curseur dans la fiche.";
  note.classList.remove('ok');
  focusChampEquation(); // v0.1.24 : zone structurée ou champ de toujours
}

/** Rétablit le panneau Équation en mode pose-sur-la-page. */
function retablirBoutonEquation() {
  etat.formuleFiche = false;
  const b = $('#eq-inserer');
  if (b.textContent.startsWith('Insérer dans la ')) {
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
    const estRiche = !!(attente && (attente.kind === 'freeText'
      || attente.kind === 'ficheMelangee' || attente.kind === 'noteRiche'));
    if (!estRiche && !(attente && attente.kind === 'correction')) {
      $('#editeur-apercu').hidden = true;
      return;
    }
    // v0.1.31 : le texte riche se relit depuis le contenteditable, le
    // textarea ne porte plus que les corrections des blocs reconnus.
    const zone = $('#editeur-texte');
    const riche = $('#editeur-riche');
    const estEditeurRiche = !riche.hidden;
    const source = estEditeurRiche ? serialiserEditeurRiche() : zone.value;
    if (!source || !contientFormule(source)) {
      $('#editeur-apercu').hidden = true;
      return;
    }
    const manquantes = [];
    for (const sg of decouperMelange(estEditeurRiche ? source : zone.value)) {
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
    if (estEditeurRiche) {
      dessinerApercuRiche(source);
    } else {
      dessinerApercuFiche(estEditeurRiche ? source : zone.value);
    }
    calerAccessoiresEditeur();
  }, 250);
}

function dessinerApercuFiche(source) {
  const canvas = $('#editeur-apercu');
  const c = canvas.getContext('2d');
  const FS = 12;                      // taille d'affichage de l'aperçu
  const k = FS / FS_FICHE;            // échelle des formules
  // v0.1.38 : l'aperçu d'une CORRECTION se compose dans la famille et
  // l'épaisseur du texte remplacé (le fichier suivra la même).
  const att = etat.saisieAttente;
  const serif = !!(att && att.kind === 'correction' && att.famille === 'serif');
  const gras = !!(att && att.kind === 'correction' && att.gras);
  const policeEcran = `${gras ? 'bold ' : ''}${serif ? '"Times New Roman", Times, serif' : 'sans-serif'}`;
  const segments = decouperMelange(source);
  const apercuDe = (latex) => etat.apercuEditeur.get(latex);
  const dims = (latex) => {
    const ap = apercuDe(latex);
    return ap ? { widthPt: ap.widthPt, heightPt: ap.heightPt, depthPt: ap.depthPt }
      : { widthPt: mesurerFicheTexte(`$${latex}$`), heightPt: FS_FICHE * 0.75, depthPt: 0 };
  };
  const mesurer = (t) => {
    c.font = `${FS}px ${policeEcran}`;
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
  c.font = `${FS}px ${policeEcran}`;
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

/* ============================================================
   v0.1.31 : peintres écran des annotations riches — chaque note est
   repeinte comme elle est dans le fichier (couleurs, formes, traits,
   teintes), à partir de ce que listAnnots relit (/C, /IC, /BS, quads,
   marqueur des options).
   ============================================================ */

/** Couleur en rgba() depuis un triplet {c: [r,g,b]} de fractions, sinon défaut. */
function rgbaCouleurAnnot(c01, alpha, defaut) {
  const c = (Array.isArray(c01) && c01.length === 3
    && c01.every((v) => Number.isFinite(v)))
    ? c01.map((v) => Math.min(1, Math.max(0, v)))
    : defaut;
  return `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, `
    + `${Math.round(c[2] * 255)}, ${alpha})`;
}

/** Rectangles de texte (points PDF) des QuadPoints d'un surlignage —
 * chaque quad vaut [gx1, yHaut1, gx2, yHaut2, gx1, yBas1, gx2, yBas2] —
 * sinon le /Rect entier (annotation sans /QuadPoints). */
function zonesSurlignage(a) {
  if (Array.isArray(a.quads) && a.quads.length >= 8 && a.quads.length % 8 === 0) {
    const zones = [];
    for (let i = 0; i < a.quads.length; i += 8) {
      const q = a.quads.slice(i, i + 8);
      zones.push({
        gx: Math.min(q[0], q[4]),
        gw: Math.max(q[2], q[6]) - Math.min(q[0], q[4]),
        gy: Math.min(q[5], q[7]),
        hc: Math.max(q[1], q[3]) - Math.min(q[5], q[7]),
      });
    }
    return zones;
  }
  return [{
    gx: a.rect[0],
    gw: a.rect[2] - a.rect[0],
    gy: a.rect[1],
    hc: a.rect[3] - a.rect[1],
  }];
}

/** Repeint un surlignage (plein, soulignement, barré ou ondulé) comme
 * son apparence est composée dans le fichier (engine/annots.js). */
function dessinerSurlignage(ctx, a) {
  const zones = zonesSurlignage(a);
  const st = a.subtype || 'Highlight';
  for (const z of zones) {
    if (z.gw <= 0) continue;
    const bas = pdfVersEcran({ x: z.gx, y: z.gy });
    const haut = pdfVersEcran({ x: z.gx + z.gw, y: z.gy + Math.max(z.hc, 1) });
    const x = Math.min(bas.x, haut.x);
    const w = Math.abs(haut.x - bas.x);
    if (st === 'Underline') {
      // Trait plein dans le bas du rectangle (hauteur 1.8 pt dans le fichier).
      const ep = Math.max(1, 1.8 * etat.zoom);
      ctx.fillStyle = rgbaCouleurAnnot(a.c, 1, [0.91, 0.7, 0.29]);
      ctx.fillRect(x, bas.y - ep, w, ep);
    } else if (st === 'StrikeOut') {
      // Trait plein au milieu du rectangle (hauteur 1.4 pt dans le fichier).
      const ep = Math.max(1, 1.4 * etat.zoom);
      const yc = bas.y - (Math.max(z.hc, 1) / 2) * etat.zoom;
      ctx.fillStyle = rgbaCouleurAnnot(a.c, 1, [0.91, 0.7, 0.29]);
      ctx.fillRect(x, yc - ep / 2, w, ep);
    } else if (st === 'Squiggly') {
      // Sinusoïde régulière sous la ligne (pas 0.8 pt, amplitude 1 pt).
      ctx.strokeStyle = rgbaCouleurAnnot(a.c, 1, [0.91, 0.7, 0.29]);
      ctx.lineWidth = Math.max(0.75, 0.9 * etat.zoom);
      ctx.lineCap = 'round';
      ctx.beginPath();
      const y0 = bas.y - 1.5 * etat.zoom;
      const pas = 0.8 * etat.zoom;
      for (let px = 0; px <= w + 1e-6; px += pas) {
        const y = y0 + Math.sin((px / (5 * etat.zoom)) * 2 * Math.PI) * 1.0 * etat.zoom;
        if (px === 0) ctx.moveTo(x + px, y); else ctx.lineTo(x + px, y);
      }
      ctx.stroke();
    } else {
      // Highlight plein : aplat semi-transparent (0.42 à l'écran, comme
      // le rendu historique ; le fichier écrit 0.35 dans l'apparence).
      ctx.fillStyle = rgbaCouleurAnnot(a.c, 0.42, [0.91, 0.7, 0.29]);
      ctx.fillRect(x, Math.min(bas.y, haut.y), w, Math.abs(bas.y - haut.y));
    }
  }
}

/** Options de pose relues du marqueur « Cadre forme,trait,ep[,teinte] »
 * (miroir exact de engine/annots.js), ou null si le cadre est nu. */
function optionsCadreEcran(a) {
  const m = (a.contents || '')
    .match(/^Cadre (rect|arrondi|ellipse|nuage),(continu|tirets|points),([0-9]+(?:[.,][0-9]+)?)(,teinte)?(?:\s|$)/);
  if (!m) return null;
  return {
    forme: m[1],
    trait: m[2],
    borderWidth: Number(m[3].replace(',', '.')) || 1.5,
    teinte: !!m[4],
  };
}

/** Repeint un cadre (rect, arrondi, ellipse, nuage) comme son apparence
 * est composée dans le fichier : couleur de /C, épaisseur et tirets de
 * /BS, teinte de /IC. L'équation et la correction restent à part. */
function dessinerCadreEcran(ctx, a, x, y, w, h) {
  const opts = optionsCadreEcran(a);
  const forme = opts ? opts.forme : (a.subtype === 'Circle' ? 'ellipse' : 'rect');
  const bwPdf = (a.bs && Number.isFinite(a.bs.w) && a.bs.w > 0) ? a.bs.w
    : (opts ? opts.borderWidth : 1.5);
  const bw = bwPdf * etat.zoom;
  const coul = rgbaCouleurAnnot(a.c, 1, [0.75, 0.22, 0.17]);
  const teinte = a.ic || (opts && opts.teinte);
  // Nettoyage des plumes pour éviter que le nuage garde les tirets.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (a.bs && Array.isArray(a.bs.d) && a.bs.d.length >= 2) {
    ctx.setLineDash(a.bs.d.map((v) => v * etat.zoom));
  } else {
    ctx.setLineDash([]);
  }
  ctx.lineWidth = Math.max(0.5, bw);
  ctx.strokeStyle = coul;
  const teinteFill = teinte
    ? rgbaCouleurAnnot(a.ic || a.c, 0.13, [0, 0.4, 0.75]) : null;
  function tracer(pas) {
    if (teinteFill) {
      ctx.fillStyle = teinteFill;
      pas(true);
      ctx.fill();
      pas(false);
      ctx.stroke();
    } else {
      pas(false);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (forme === 'ellipse') {
    // Ellipse inscrite, comme dans le fichier : demi-axes réduits de la
    // moitié du trait.
    const rx = Math.max(2, w / 2 - bw / 2);
    const ry = Math.max(2, h / 2 - bw / 2);
    tracer((rempl) => {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, rx, ry, 0, 0, Math.PI * 2);
    });
  } else if (forme === 'arrondi') {
    const r = Math.min(12, w / 4, h / 4) * etat.zoom;
    tracer(() => {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, r)
        : ctx.rect(x, y, w, h);
    });
  } else if (forme === 'nuage') {
    // Bosses en arcs le long d'un rectangle rentré, comme engine/annots.js
    // (marge proportionnelle au trait, cordes d'environ 15 pt). Les
    // quadratiques avec contrôle au milieu poussé vers l'extérieur
    // donnent des bosses de demi-cercle, comme dans le fichier.
    tracer(() => {
      const m = Math.max(6, bwPdf * 2.4) * etat.zoom;
      const nx = x + m;
      const ny = y + m;
      const nw = Math.max(4, w - 2 * m);
      const nh = Math.max(4, h - 2 * m);
      const pas = 15 * etat.zoom;
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      const cote = (ax, ay, bx, by, ox, oy) => {
        const dx = bx - ax; const dy = by - ay;
        const L = Math.hypot(dx, dy);
        const n = Math.max(2, Math.round(L / pas));
        const r = L / (n * 2);
        for (let i = 1; i <= n; i += 1) {
          const px = ax + (dx * (i - 1)) / n;
          const py = ay + (dy * (i - 1)) / n;
          const qx = ax + (dx * i) / n;
          const qy = ay + (dy * i) / n;
          ctx.quadraticCurveTo((px + qx) / 2 + ox * 2 * r,
            (py + qy) / 2 + oy * 2 * r, qx, qy);
        }
      };
      cote(nx, ny, nx + nw, ny, 0, 1);                // bas, bosse vers le bas
      cote(nx + nw, ny, nx + nw, ny + nh, 1, 0);      // droite
      cote(nx + nw, ny + nh, nx, ny + nh, 0, -1);     // haut
      cote(nx, ny + nh, nx, ny, -1, 0);               // gauche
      ctx.closePath();
    });
  } else {
    tracer(() => {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
    });
  }
  ctx.setLineDash([]);
}

/** Repeint une note riche (« Note riche taille : source ») comme son
 * apparence est composée dans le fichier : même analyse, même
 * compositeur (engine/markup.js), formules rendues par le moteur
 * d'équations comme les fiches mixtes. */
function dessinerNoteRiche(ctx, a, x, y, w, h) {
  const source = extraireSourceNoteRiche(a.contents);
  if (!source) return;
  const fs = extraireTailleNoteRiche(a.contents) || 11;
  const blocs = analyserSource(source);
  const formules = new Set();
  for (const b of blocs) {
    for (const r of b.runs) {
      if (r.type === 'formule') formules.add(r.valeur);
    }
  }
  const carte = etat.opsFiche.get(cleEquation(a));
  const pret = [...formules].every((v) => carte && carte.has(v));
  if (!pret) {
    // Ops pas encore chargées (ou formule illisible) : la source reste
    // lisible en attendant, et le calcul se fait au fond.
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.55)';
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.font = `${fs * etat.zoom}px sans-serif`;
    ecrireCarteCommentaire(ctx, source.replace(/<[^>]+>/g, ''),
      x + w + 8 * etat.zoom, y, etat.zoom);
    chargerOpsFiches();
    return;
  }
  const dims = (latex) => {
    const ap = carte.get(latex);
    return ap ? { widthPt: ap.widthPt, heightPt: ap.heightPt, depthPt: ap.depthPt }
      : { widthPt: 0, heightPt: 0, depthPt: 0 };
  };
  const policeDe = (styles) => `${styles.gras ? 'bold ' : ''}${styles.italique ? 'italic ' : ''}`;
  const tailleDe = (styles) => (styles && (styles.sup || styles.sub)
    ? fs * FACTEUR_EXPOSANT : fs);
  const mesurer = (styles, texte) => {
    mesureCtx.font = `${policeDe(styles)}${tailleDe(styles)}px sans-serif`;
    return mesureCtx.measureText(String(texte)).width / etat.zoom;
  };
  const layout = composerLignesRiche(blocs, {
    mesurer,
    dimsFormule: dims,
    largeurMax: (a.rect[2] - a.rect[0]) - 4, // MARGE 2 pt de chaque côté
    fontSize: fs,
  });
  const retraitListe = layout.retraitListe;
  const interbase = 0.45 * fs; // INTERBASE du moteur
  ctx.textBaseline = 'alphabetic';
  let curseur = a.rect[3] - 3; // MARGE_VERTICALE du moteur
  for (let li = 0; li < layout.lignes.length; li += 1) {
    const ligne = layout.lignes[li];
    if (!ligne.vide) {
      const utileLigne = (a.rect[2] - a.rect[0]) - 4
        - (ligne.type === 'p' ? 0 : retraitListe);
      const decal = ligne.align === 'centre' ? (utileLigne - ligne.w) / 2
        : ligne.align === 'droite' ? (utileLigne - ligne.w) : 0;
      let penX = a.rect[0] + 2 + (ligne.type === 'p' ? 0 : retraitListe)
        + Math.max(0, decal);
      if (ligne.type !== 'p' && ligne.debutBloc) {
        // Puce ou numéro : posé dans le retrait, sur la première ligne du bloc.
        const etiquette = ligne.type === 'puce' ? '\u2022' : `${ligne.numero}.`;
        ctx.font = `${fs * etat.zoom}px sans-serif`;
        ctx.fillStyle = '#14161c';
        const ePuce = pdfVersEcran({
          x: a.rect[0] + 2 + retraitListe - 10,
          y: curseur - ligne.hDessus - fs * 0.05,
        });
        ctx.fillText(etiquette, ePuce.x, ePuce.y);
      }
      for (const m of ligne.morceaux) {
        const base = curseur - ligne.hDessus;
        if (m.type === 'formule') {
          const ap = carte.get(m.valeur);
          if (ap) {
            const ecr = pdfVersEcran({ x: penX, y: base });
            tracerOpsPlacé(ctx, ap, ecr.x, ecr.y, etat.zoom);
          }
        } else {
          const taille = (m.styles.sup || m.styles.sub) ? fs * FACTEUR_EXPOSANT : fs;
          let basePos = base;
          if (m.styles.sup) basePos += fs * 0.35;
          if (m.styles.sub) basePos -= fs * 0.12;
          const ecr = pdfVersEcran({ x: penX, y: basePos });
          ctx.font = `${policeDe(m.styles)}${taille * etat.zoom}px "Aptos", "Calibri", sans-serif`;
          const affiche = decoderEntites(m.texte);
          if (affiche) {
            // Fond du morceau d'abord (0.6 d'alpha comme le fichier) :
            // de base - 0.25 taille à + 0.95 corps, comme engine/riche.js.
            if (m.styles.fond) {
              ctx.fillStyle = rgbaHex(m.styles.fond, 0.6);
              const eHaut = pdfVersEcran({
                x: penX, y: base - taille * 0.25 + fs * 0.95,
              });
              ctx.fillRect(eHaut.x, eHaut.y, m.largeur * etat.zoom,
                fs * 0.95 * etat.zoom);
            }
            ctx.fillStyle = m.styles.couleur ? m.styles.couleur : '#14161c';
            ctx.fillText(affiche, ecr.x, ecr.y);
            if (m.styles.souligne || m.styles.barre) {
              ctx.fillStyle = m.styles.couleur ? m.styles.couleur : '#14161c';
              const eBas = pdfVersEcran({ x: penX, y: base });
              if (m.styles.souligne) {
                ctx.fillRect(ecr.x, eBas.y - taille * 0.12 * etat.zoom,
                  m.largeur * etat.zoom, Math.max(0.4, fs * 0.055) * etat.zoom);
              }
              if (m.styles.barre) {
                const eMil = pdfVersEcran({ x: penX, y: base + taille * 0.24 });
                ctx.fillRect(ecr.x, eMil.y, m.largeur * etat.zoom,
                  Math.max(0.4, fs * 0.06) * etat.zoom);
              }
            }
          }
        }
        penX += m.largeur;
      }
    }
    curseur -= ligne.hDessus + ligne.hDes + interbase;
  }
}

/** #hex + alpha -> rgba(), repli sombre. */
function rgbaHex(hex, alpha) {
  const v = hexVersRgb01(String(hex || ''));
  return `rgba(${Math.round((v ? v[0] : 0.08) * 255)}, `
    + `${Math.round((v ? v[1] : 0.09) * 255)}, `
    + `${Math.round((v ? v[2] : 0.1) * 255)}, ${alpha})`;
}

const { analyserSource, composerLignesRiche, FACTEUR_EXPOSANT,
  echapperTexte } = globalThis.AtelierMarkup;
const { decoderEntites } = globalThis.AtelierMarkup;
const { cadrerImageFormule, PAD_IMAGE_FORMULE } = globalThis.AtelierMarkup; // v0.1.36

/** v0.1.31 : aperçu du texte riche en cours de saisie — mêmes analyse
 * et compositeur que la pose (styles simplifiés : gras, italique,
 * couleurs ; les listes et alignements suivent le compositeur). */
function dessinerApercuRiche(source) {
  const canvas = $('#editeur-apercu');
  const c = canvas.getContext('2d');
  const FS = 12;                      // taille d'affichage de l'aperçu
  const fsCorps = (etat.saisieAttente && etat.saisieAttente.fontSize)
    || etat.options.ecrire.taille || 11;
  const k = FS / fsCorps;             // échelle du corps réel -> aperçu
  const blocs = analyserSource(source);
  const dims = (latex) => {
    const ap = etat.apercuEditeur.get(latex);
    return ap ? { widthPt: ap.widthPt, heightPt: ap.heightPt, depthPt: ap.depthPt }
      : { widthPt: 10, heightPt: fsCorps * 0.75, depthPt: 0 };
  };
  const mesurer = (styles, t) => {
    c.font = `${styles.gras ? 'bold ' : ''}${styles.italique ? 'italic ' : ''}`
      + `${(styles.sup || styles.sub ? fsCorps * FACTEUR_EXPOSANT : fsCorps)}px sans-serif`;
    return c.measureText(String(t)).width / k;
  };
  const layout = composerLignesRiche(blocs, {
    mesurer,
    dimsFormule: dims,
    largeurMax: (canvas.width - 12) / k,
    fontSize: fsCorps,
  });
  const interbase = 0.45 * fsCorps;
  let hauteur = 16;
  for (let li = 0; li < layout.lignes.length; li += 1) {
    hauteur += (layout.lignes[li].hDessus + layout.lignes[li].hDes
      + (li ? interbase : 0)) * k;
  }
  canvas.height = Math.max(24, Math.round(hauteur));
  canvas.hidden = false;
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.textBaseline = 'alphabetic';
  let basePx = 12 + layout.lignes[0].hDessus * k;
  for (const ligne of layout.lignes) {
    if (!ligne.vide) {
      let penX = 6;
      for (const m of ligne.morceaux) {
        if (m.type === 'formule') {
          const ap = etat.apercuEditeur.get(m.valeur);
          c.font = `${FS}px sans-serif`;
          if (ap) {
            tracerOpsPlacé(c, ap, penX, basePx, k);
          } else {
            c.fillStyle = '#b04a2e';
            c.font = `${FS}px sans-serif`;
            c.fillText(`$${m.valeur}$`, penX, basePx);
          }
        } else {
          const taille = (m.styles.sup || m.styles.sub)
            ? fsCorps * FACTEUR_EXPOSANT : fsCorps;
          c.font = `${m.styles.gras ? 'bold ' : ''}${m.styles.italique ? 'italic ' : ''}`
            + `${taille * k}px "Aptos", "Calibri", sans-serif`;
          c.fillStyle = m.styles.couleur || '#14161c';
          if (m.styles.fond) {
            c.fillStyle = m.styles.fond;
            c.fillRect(penX - 1, basePx - ligne.hDessus * k,
              m.largeur * k + 2, (ligne.hDessus + ligne.hDes) * k);
            c.fillStyle = m.styles.couleur || '#14161c';
          }
          c.fillText(decoderEntites(m.texte), penX, basePx);
        }
        penX += m.largeur * k;
      }
    }
    basePx += (ligne.hDes + interbase) * k;
  }
}

/* v0.1.35 : annotations tierces visibles par nature (trait, polygone,
   tampon…). pdf.js ne peint plus leur apparence au fond de page : le
   calque les marque d'un liseré pointillé pour qu'elles restent visibles
   et sélectionnables (l'apparence, elle, n'est jamais retouchée).
   Les liens et les champs de formulaire sont invisibles par nature :
   jamais marqués. */
const SORTES_ANNOTS_TIERCES = ['Line', 'PolyLine', 'Polygon', 'Stamp',
  'Caret', 'FileAttachment', 'Redact'];

async function dessinerAnnots() {
  const ctx = els.calqueAnnots.getContext('2d');
  ctx.clearRect(0, 0, els.calqueAnnots.width, els.calqueAnnots.height);
  if (!etat.resume) return;
  // v0.1.42 : pendant l'édition d'une correction, l'ORIGINAL disparaît
  // sous un masque blanc au rectangle exact de la zone en cours. La
  // translucidité du cadre (v0.1.41) laissait paraître l'encre d'origine
  // SOUS la frappe : sur un vrai cours, la ligne se lisait en double
  // (captures d'Arthur). Le masque est celui que la pose applique déjà
  // (dessinerCorrection) : l'écran montre la même chose.
  if (etat.saisieAttente && etat.saisieAttente.kind === 'correction'
    && Array.isArray(etat.saisieAttente.rect)) {
    const m0 = pdfVersEcran({ x: etat.saisieAttente.rect[0], y: etat.saisieAttente.rect[1] });
    const m1 = pdfVersEcran({ x: etat.saisieAttente.rect[2], y: etat.saisieAttente.rect[3] });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.min(m0.x, m1.x), Math.min(m0.y, m1.y),
      Math.abs(m1.x - m0.x), Math.abs(m1.y - m0.y));
  }
  // v0.1.18 : l'annotation rééditée sur place disparaît du calque le temps
  // de l'écriture : le cadre d'édition EST le futur.
  const annots = etat.resume.annots.filter((a) => a.page === etat.page - 1
    && !(etat.annotationMasquee && a.ref
      && a.ref.objectNumber === etat.annotationMasquee.objectNumber));
  for (const a of annots) {
    const c0 = pdfVersEcran({ x: a.rect[0], y: a.rect[1] });
    const c1 = pdfVersEcran({ x: a.rect[2], y: a.rect[3] });
    const x = Math.min(c0.x, c1.x);
    const y = Math.min(c0.y, c1.y);
    const w = Math.abs(c1.x - c0.x);
    const h = Math.abs(c1.y - c0.y);
    ctx.save();
    if (a.subtype === 'Highlight' || a.subtype === 'Underline'
      || a.subtype === 'StrikeOut' || a.subtype === 'Squiggly') {
      // v0.1.31 : les quatre formes de surlignage (plein, soulignement,
      // barré, ondulé), repeintes avec LEUR couleur (/C) et leurs
      // rectangles (/QuadPoints), comme le fichier les compose.
      dessinerSurlignage(ctx, a);
    } else if (a.subtype === 'Square' || a.subtype === 'Circle') {
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
      if ((a.contents || '').startsWith(PREFIXE_CORRECTION)) {
        // v0.1.29 : une correction posée se recompose comme la fiche mixte
        // (source embarquée + formules), mais sur son MASQUE BLANC OPAQUE :
        // l'écran montre ce que les autres lecteurs liront — le scan du
        // bloc a disparu sous le texte corrigé.
        dessinerCorrection(ctx, a, x, y, w, h);
      } else if ((a.contents || '').startsWith(PREFIXE_FICHE_MIXTE)) {
        dessinerFicheMixte(ctx, a, x, y, w, h);
      } else if (!(a.contents || '').startsWith(PREFIXE_EQUATION)) {
        // v0.1.31 : le cadre est repeint comme il est dans le fichier :
        // forme du marqueur (rect, arrondi, ellipse, nuage), couleur
        // de /C, épaisseur et tirets de /BS, teinte de /IC. Les cadres
        // des versions antérieures restent des rectangles.
        dessinerCadreEcran(ctx, a, x, y, w, h);
      } else {
        const apercu = etat.opsEquation.get(cleEquation(a));
        if (apercu) {
          tracceEquation(ctx, apercu, a.rect);
        } else {
          // Ops pas encore chargées (ou formule illisible) : montrons au
          // moins la source, et demandons le tracé au fond.
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(128, 128, 128, 0.55)';
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
      // v0.1.35 : pdf.js ne peint plus l'encre au fond de page ; le calque
      // dessine les traits eux-mêmes, relus du /InkList du fichier, avec
      // la couleur /C et l'épaisseur /BS W. Silhouette pointillée en
      // repli si un trait est illisible (l'annotation reste sélectionnable).
      const traits = Array.isArray(a.inkList) ? a.inkList
        .filter((t) => Array.isArray(t) && t.length >= 4 && t.length % 2 === 0
          && !t.some((n) => typeof n !== 'number' || !Number.isFinite(n))) : [];
      if (traits.length > 0) {
        ctx.strokeStyle = rgbaCouleurAnnot(a.c, 1, [0, 0.15, 0.75]);
        ctx.lineWidth = Math.max(1, ((a.bs && a.bs.w) || 1.5) * etat.zoom);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const t of traits) {
          ctx.beginPath();
          for (let k = 0; k < t.length; k += 2) {
            const e = pdfVersEcran({ x: t[k], y: t[k + 1] });
            if (k === 0) ctx.moveTo(e.x, e.y); else ctx.lineTo(e.x, e.y);
          }
          ctx.stroke();
        }
      } else {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(86, 168, 255, 0.6)';
        ctx.strokeRect(x, y, w, h);
      }
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
    } else if (a.subtype === 'FreeText'
      && (a.contents || '').startsWith(PREFIXE_NOTE_RICHE)) {
      // v0.1.31 : la note riche se recompose à l'écran depuis sa source
      // embarquée (même analyse, même compositeur que le fichier), les
      // formules rendues par le moteur d'équations comme les fiches.
      dessinerNoteRiche(ctx, a, x, y, w, h);
    } else if (a.subtype === 'FreeText') {
      // v0.1.12 : une note nue (Subject « Note », posée par un clic de
      // l'outil Note) s'écrit DIRECTEMENT sur la page — texte sombre, sans
      // fond ni icône, comme demandé (« texte écrit directement sur la
      // page, partout où je clique »). Les autres /FreeText restent des
      // fiches-cartes. Le texte n'est jamais coupé : la hauteur du /Rect
      // n'oblige pas la note à tenir dedans (elle se redimensionne).
      if (a.subject === 'Note') {
        ctx.fillStyle = '#14161c';
        // v0.1.20 : la note posée affiche la police CORPS de OneNote
        // (Aptos/Calibri), comme le cadre de saisie ; les formules $...$
        // de la note restent composées par le moteur d'équations, en
        // italique mathématique, exactement comme sous OneNote.
        ctx.font = `${11 * etat.zoom}px "Aptos", "Calibri", "Segoe UI", sans-serif`;
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
    } else if (SORTES_ANNOTS_TIERCES.includes(a.subtype)) {
      // v0.1.35 : annotation tierce (trait, polygone, tampon…) : sans le
      // liseré, elle serait invisible depuis que pdf.js ne peint plus les
      // apparences au fond de page. Le liseré marque la place ; l'apparence
      // écrite dans le fichier n'est jamais retouchée.
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(120, 120, 120, 0.7)';
      ctx.strokeRect(x, y, Math.max(w, 6), Math.max(h, 6));
    }
    // Annotation sans /AP (autrui) : rectangle pointillé gris, lecture seule.
    if (a.hasAP === false && !SORTES_ANNOTS_TIERCES.includes(a.subtype)) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(120, 120, 120, 0.6)';
      ctx.strokeRect(x, y, w, h);
    }
    // Sélection : liseret accentué.
    if (etat.selection
      && etat.selection.ref && a.ref
      && etat.selection.ref.objectNumber === a.ref.objectNumber) {
      ctx.setLineDash([]);
      ctx.strokeStyle = '#0067C0';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
      // v0.1.12 : poignées de redimensionnement (croquis validé) — petits
      // carrés blancs liserés d'accent sur le pourtour du rectangle.
      if (redimensionnable(a)) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#0067C0';
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
  calquePage = page; // v0.1.22 : une OCR arrivée pourra reposer les mots
  calqueViewport = viewport;
  els.calqueTexte.replaceChildren();
  els.calqueTexte.style.width = `${Math.round(viewport.width)}px`;
  els.calqueTexte.style.height = `${Math.round(viewport.height)}px`;
  if (!pdfjsLib) return;
  try {
    const contenu = await page.getTextContent();
    // v0.1.22 : une page sans couche de texte (scan, photo) reçoit les
    // mots reconnus par l'OCR locale, posés en fractions de page : ils
    // héritent de la sélection native, donc de Surligner et Copier.
    if (!Array.isArray(contenu.items) || contenu.items.length === 0) {
      await gererPageMuette(page, viewport);
      return;
    }
    pageMuette = false;
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
  // v0.1.31 : le surlignage du VRAI texte suit les mêmes formes et couleurs
  // que l'outil Surligner (plein, soulignement, barré, ondulé ; palette
  // ou cercle chromatique).
  const opts = etat.options.surligner;
  const rep = await appliquer({
    kind: 'highlight',
    pageIndex: page,
    args: {
      rect: rect.map((v) => Math.round(v * 100) / 100),
      quadPoints: quads.map((q) => q.map((v) => Math.round(v * 100) / 100)),
      forme: opts.forme,
      couleur: opts.couleur,
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

/* ============================================================
   v0.1.22 : reconnaissance des pages scannées (OCR locale)
   ============================================================ */
/* Les scans de cours n'ont AUCUNE couche de texte : l'outil Texte ne
   pouvait rien sélectionner. Une reconnaissance locale (tesseract.js,
   WASM, embarquée — aucun téléchargement, aucun service en ligne) est
   déclenchée À LA DEMANDE, page par page, quand l'outil Texte arme une
   page muette. Les mots deviennent des <span> invisibles posés en
   fractions de page dans le calque de texte : la sélection native
   existe alors, et les boutons Surligner / Copier d'origine, puis le
   bouton ƒ LaTeX ci-dessous, fonctionnent sans autre changement. */
let pageMuette = false;       // la page courante n'a pas de couche de texte
let tesseractModule = null;   // module tesseract chargé au premier besoin
let erreurTesseract = null;  // dernier échec de chargement (diagnostics)
let workerOcr = null;         // worker persistant (modèle français en mémoire)
let ocrEnCours = false;       // une seule reconnaissance à la fois
let generationOcr = 0;        // invalide un résultat si la page a changé
let erreurOcr = null;        // dernier échec de reconnaissance (diagnostics)
const motsOcrPages = new Map(); // n° de page -> mots reconnus (fractions)
let calquePage = null;        // dernières (page, viewport) passées au calque
let calqueViewport = null;    // → pour reposer les mots après une OCR

async function chargerTesseract() {
  // Discipline pdf.js (leçon v0.1.2) : jamais d'import statique pour une
  // pièce dont dépend un outil ; l'échec s'affiche au lieu de tuer la page.
  tesseractModule = (await import('app://local/libs/tesseract.js/dist/tesseract.esm.min.js')).default;
}

async function prendreWorkerOcr() {
  if (workerOcr) return workerOcr;
  if (!tesseractModule) {
    try {
      await chargerTesseract();
      erreurTesseract = null;
    } catch (err) {
      erreurTesseract = (err && err.message) ? err.message : String(err);
      throw new Error(`moteur de reconnaissance introuvable (${erreurTesseract})`);
    }
  }
  workerOcr = await tesseractModule.createWorker('fra', 1, {
    // Tout est servi par le protocole app:// depuis les ressources locales.
    workerPath: 'app://local/libs/tesseract.js/dist/worker.min.js',
    // Dossier du cœur WASM : le script choisit seul la variante SIMD.
    corePath: 'app://local/libs/tesseract.js-core',
    // Modèle de langue français EMBARQUÉ — aucun téléchargement.
    langPath: 'app://local/ocr',
    workerBlobURL: false,
  });
  return workerOcr;
}

/* Pose les mots reconnus dans le calque de texte : des <span> invisibles
   positionnés en fractions de la page affichée — au zoom près, chaque
   mot est là où tesseract l'a lu. */
function poserMotsOcr(mots, viewport) {
  for (const m of mots) {
    const s = document.createElement('span');
    s.textContent = m.t;
    s.className = 'ocr-mot';
    const haut = Math.round(m.y * viewport.height);
    const hauteur = Math.max(6, Math.round(m.h * viewport.height));
    s.style.left = `${Math.round(m.x * viewport.width)}px`;
    s.style.top = `${haut}px`;
    s.style.height = `${hauteur}px`;
    s.style.fontSize = `${Math.max(7, Math.round(hauteur * 0.92))}px`;
    els.calqueTexte.appendChild(s);
  }
}

/* Page sans couche de texte : mots déjà reconnus posés tels quels ;
   sinon la reconnaissance part, mais seulement si l'outil Texte est
   actif — jamais de travail lourd que l'utilisateur n'a pas demandé. */
async function gererPageMuette(page, viewport) {
  pageMuette = true;
  const mots = motsOcrPages.get(page.pageNumber);
  if (mots) {
    poserMotsOcr(mots, viewport);
    if (etat.outil === 'texte') {
      message('Texte reconnu : sélectionnez, surlignez ou copiez.', 'reussite');
    }
    return;
  }
  if (etat.outil !== 'texte') return;
  if (ocrEnCours) {
    message('Reconnaissance déjà en cours : un instant, elle se pose d\'elle-même.');
    return;
  }
  message('Page scannée sans texte : reconnaissance en cours (quelques secondes)…');
  lancerOcrPage(page);
}

async function lancerOcrPage(page) {
  if (ocrEnCours || !pdfjsLib) return;
  ocrEnCours = true;
  generationOcr += 1;
  const ma = generationOcr;
  const numero = page.pageNumber;
  try {
    const worker = await prendreWorkerOcr();
    // Rendu hors écran de la page entière à ~1700 px de large : assez
    // fin pour le texte imprimé d'un cours, pas trop lourd pour un
    // ordinateur modeste (quelques secondes).
    const base = page.getViewport({ scale: 1 });
    const echelle = Math.min(3, Math.max(1, 1700 / base.width));
    const vp = page.getViewport({ scale: echelle });
    const toile = document.createElement('canvas');
    toile.width = Math.max(1, Math.round(vp.width));
    toile.height = Math.max(1, Math.round(vp.height));
    const tache = page.render({ canvasContext: toile.getContext('2d'), viewport: vp });
    await tache.promise;
    const { data } = await worker.recognize(toile, {}, { blocks: true });
    if (ma !== generationOcr) return; // la page attendue a changé
    const mots = motsDepuisBlocs(data.blocks || [], toile.width, toile.height);
    motsOcrPages.set(numero, mots);
    erreurOcr = null;
    // Si l'utilisateur regarde toujours cette page à l'outil Texte,
    // la couche est reposée avec les mots reconnus.
    if (calquePage && calquePage.pageNumber === numero && calqueViewport
        && etat.resume && etat.page === numero && etat.outil === 'texte') {
      await rendCalqueTexte(calquePage, calqueViewport);
      message('Texte reconnu : sélectionnez, surlignez ou copiez.', 'reussite');
    }
  } catch (err) {
    erreurOcr = (err && err.message) ? err.message : String(err);
    if (ma === generationOcr) {
      message(`Échec de la reconnaissance : ${erreurOcr}. Menu Aide → Diagnostics de l'application.`, 'erreur');
    }
  } finally {
    ocrEnCours = false;
  }
}

/* v0.1.22/v0.1.23 : bouton ƒ LaTeX de la barre de sélection. La zone retenue
   est redessinée NETTEMENT hors écran (jusqu'à 6× le zoom), l'image part
   à l'OCR Latin en vigueur (serveur personnel tout local, ou OCR Mistral)
   par le processus principal, et les formules extraites sont copiées. */
let latexEnCours = false;

/* Inverse exact de deviceToPdf (même structure que pdfVersEcran) mais
   pour un viewport FOURNI : le redécoupage hors écran ne connaît pas
   etat.viewport. */
function pdfVersEcranDans(pt, page, vp) {
  const rotation = ((vp.rotation % 360) + 360) % 360;
  const pageW = page.view[2];
  const pageH = page.view[3];
  const s = vp.scale;
  let u; let v;
  switch (rotation) {
    case 0: u = pt.x; v = pageH - pt.y; break;
    case 90: v = pt.x; u = pt.y; break;
    case 180: u = pageW - pt.x; v = pageH - pt.y; break;
    default: v = pageW - pt.x; u = pageH - pt.y; break;
  }
  return { x: u * s, y: v * s };
}

$('#sel-latex').addEventListener('click', async () => {
  if (latexEnCours || !selectionTexte.quads) return;
  const { rect, page } = selectionTexte;
  const bouton = $('#sel-latex');
  latexEnCours = true;
  bouton.disabled = true;
  fermerBarreSelection();
  viderSelectionNative();
  try {
    if (!etat.pdfjs) { message('Aucun document ouvert.', 'erreur'); return; }
    const pg = await etat.pdfjs.getPage(page + 1);
    // Échelle : la zone coupée doit faire ~1400 px de large pour que
    // l'OCR Mistral lise les indices et les radicaux ; bornée 1,5–6.
    const largeurRect = Math.max(rect[2] - rect[0], 1);
    const echelle = Math.min(6, Math.max(1.5, 1400 / largeurRect));
    const vp = pg.getViewport({ scale: echelle });
    const toile = document.createElement('canvas');
    toile.width = Math.max(1, Math.round(vp.width));
    toile.height = Math.max(1, Math.round(vp.height));
    const tache = pg.render({ canvasContext: toile.getContext('2d'), viewport: vp });
    await tache.promise;
    // La zone sélectionnée, en pixels du rendu hors écran.
    const coinA = pdfVersEcranDans({ x: rect[0], y: rect[3] }, pg, vp);
    const coinB = pdfVersEcranDans({ x: rect[2], y: rect[1] }, pg, vp);
    const x0 = Math.max(0, Math.floor(Math.min(coinA.x, coinB.x)));
    const y0 = Math.max(0, Math.floor(Math.min(coinA.y, coinB.y)));
    const x1 = Math.min(toile.width, Math.ceil(Math.max(coinA.x, coinB.x)));
    const y1 = Math.min(toile.height, Math.ceil(Math.max(coinA.y, coinB.y)));
    if (x1 - x0 < 4 || y1 - y0 < 4) {
      message('La zone lue est trop étroite : sélectionnez davantage autour de la formule.', 'erreur');
      return;
    }
    const coupe = document.createElement('canvas');
    coupe.width = x1 - x0;
    coupe.height = y1 - y0;
    coupe.getContext('2d').drawImage(toile, x0, y0, coupe.width, coupe.height, 0, 0, coupe.width, coupe.height);
    const dataUrl = coupe.toDataURL('image/png');
    bouton.textContent = 'ƒ…';
    const rep = await window.atelier.latexOcr(dataUrl);
    if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
    if (!rep.latex) {
      message('Aucune formule détectée dans la zone sélectionnée.', 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(rep.latex);
      const apercu = rep.latex.length > 70 ? `${rep.latex.slice(0, 70)}…` : rep.latex;
      message(`LaTeX copié dans le presse-papiers : ${apercu}`, 'reussite');
    } catch (err) {
      message('Formule lue, mais copie impossible : le presse-papiers a refusé l\'accès.', 'erreur');
    }
  } catch (err) {
    message(`Conversion LaTeX impossible : ${(err && err.message) || err}`, 'erreur');
  } finally {
    latexEnCours = false;
    bouton.disabled = false;
    bouton.textContent = 'ƒ LaTeX';
  }
});

/* v0.1.23 : options de la lecture LaTeX. Deux chemins, un seul réglage :
   le serveur OCR personnel (tout local : son URL suffit, le jour où elle
   est enregistrée le bouton ƒ LaTeX l'utilise) ou l'OCR Mistral (clé
   API conservée sur cet ordinateur). Menu Fichier → Options OCR LaTeX… */
let optionsOcrEtat = { mode: 'mistral', serveurUrl: '', clePresente: false, jetonPresent: false };

function basculerChampsOptionsOcr() {
  const serveur = $('#opt-serveur').checked;
  $('#aide-serveur').hidden = !serveur;
  $('#serveur-url').hidden = !serveur;
  $('#serveur-jeton').hidden = !serveur; // v0.1.25 : jeton déclaré au serveur
  $('#aide-jeton').hidden = !serveur;
  $('#essai-page').hidden = !serveur; // v0.1.26 : le test /page n'existe qu'en mode serveur
  $('#aide-mistral').hidden = serveur;
  $('#cle-saisie').hidden = serveur;
  const messageErreur = $('#cle-erreur');
  messageErreur.hidden = true;
  if (serveur) $('#serveur-url').focus();
  else $('#cle-saisie').focus();
}

function ouvrirOptionsOcr() {
  $('#cle-erreur').hidden = true;
  $('#page-resume').hidden = true; // v0.1.26 : chaque ouverture repart d'un essai vierge
  window.atelier.optionsOcr().then((etatOptions) => {
    optionsOcrEtat = etatOptions || optionsOcrEtat;
    $('#opt-serveur').checked = optionsOcrEtat.mode === 'serveur';
    $('#opt-mistral').checked = optionsOcrEtat.mode !== 'serveur';
    $('#serveur-url').value = optionsOcrEtat.serveurUrl || '';
    $('#serveur-jeton').value = ''; // jamais rappelé : un jeton ne s'affiche pas
    basculerChampsOptionsOcr();
    $('#cle-fond').hidden = false;
  });
}

function fermerOptionsOcr() {
  $('#cle-fond').hidden = true;
}

$('#opt-serveur').addEventListener('change', basculerChampsOptionsOcr);
$('#opt-mistral').addEventListener('change', basculerChampsOptionsOcr);
$('#cle-annuler').addEventListener('click', fermerOptionsOcr);
$('#cle-valider').addEventListener('click', validerOptionsOcr);
$('#serveur-url').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') validerOptionsOcr();
});
$('#serveur-jeton').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') validerOptionsOcr();
});

/* v0.1.26 : bouton « Tester la reconnaissance ». La page COURANTE est
   rendue hors écran en JPEG ~200 points par pouce (qualité 0,85), envoyée
   au endpoint /page du serveur personnel, et le résumé lisible s'affiche
   sous le bouton. Le bouton se désactive pendant l'essai (jusqu'à
   10 minutes) et se restaure dans TOUS les cas. */
let pageEssaiEnCours = false;
$('#tester-page').addEventListener('click', async () => {
  if (pageEssaiEnCours) return;
  const bouton = $('#tester-page');
  const resume = $('#page-resume');
  if (!etat.pdfjs || !etat.resume) {
    resume.textContent = "Ouvrez d'abord un document : la page affichée sera reconnue.";
    resume.className = 'essai-erreur'; // v0.1.28 : styles propres au bloc
    resume.hidden = false;
    return;
  }
  pageEssaiEnCours = true;
  bouton.disabled = true;
  bouton.textContent = 'Reconnaissance en cours…';
  resume.hidden = true;
  try {
    const page = await etat.pdfjs.getPage(etat.page);
    const vp = page.getViewport({ scale: 200 / 72 }); // ~200 points par pouce
    const toile = document.createElement('canvas');
    toile.width = Math.max(1, Math.floor(vp.width));
    toile.height = Math.max(1, Math.floor(vp.height));
    await page.render({ canvasContext: toile.getContext('2d'), viewport: vp }).promise;
    const dataUrl = toile.toDataURL('image/jpeg', 0.85);
    const rep = await window.atelier.testerPage(dataUrl);
    if (rep.erreur) {
      resume.textContent = rep.erreur;
      resume.className = 'essai-erreur'; // v0.1.28
    } else {
      const blocs = rep.page && Array.isArray(rep.page.blocs) ? rep.page.blocs : [];
      if (!blocs.length) {
        resume.textContent = "La page a été reconnue mais aucun bloc exploitable n'a été trouvé.";
      } else {
        resume.textContent = rep.resume || 'Page reconnue.';
      }
      resume.className = 'essai-info'; // v0.1.28
    }
  } catch (err) {
    resume.textContent = `Reconnaissance impossible : ${(err && err.message) || err}`;
    resume.className = 'eq-erreur';
  } finally {
    resume.hidden = false;
    pageEssaiEnCours = false;
    bouton.disabled = false;
    bouton.textContent = 'Tester la reconnaissance';
  }
});
$('#cle-saisie').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') validerOptionsOcr();
  else if (ev.key === 'Escape') { ev.stopPropagation(); fermerOptionsOcr(); }
});

async function validerOptionsOcr() {
  const erreur = $('#cle-erreur');
  const options = {};
  if ($('#opt-serveur').checked) {
    const saisie = $('#serveur-url').value;
    const url = nettoyerUrlServeur(saisie);
    if (!url) {
      // v0.1.28 (correctif approuvé) : le https sur un hôte local obtient
      // son message à lui, au lieu d'une erreur de connexion au clic.
      erreur.textContent = estHttpsLocal(saisie)
        ? "Le serveur personnel écoute en HTTP : retirez le « s » de https:// (ex. : http://127.0.0.1:8642/ocr)."
        : 'Indiquez l\'adresse du serveur (ex. : http://100.x.y.z:8642/ocr — elle se lit sur le PC qui le fait tourner avec « tailscale ip -4 »).';
      erreur.hidden = false;
      return;
    }
    options.url = url;
    // v0.1.25 : le jeton ne part QUE si l'utilisateur a tapé quelque
    // chose ; le champ vide laisse le jeton en place (jamais rappelé).
    const jeton = $('#serveur-jeton').value.trim();
    if (jeton) options.jeton = jeton;
  } else {
    // Retour au mode Mistral : l'URL du serveur est retirée ; la clé
    // saisie remplace l'existante (le champ vide garde la clé en place).
    options.url = '';
    const cle = nettoyerCle($('#cle-saisie').value);
    if (cle) options.cle = cle;
    else if (!optionsOcrEtat.clePresente) {
      erreur.textContent = 'Indiquez la clé (elle se trouve sur console.mistral.ai, page « Clés API »).';
      erreur.hidden = false;
      return;
    }
  }
  const rep = await window.atelier.enregistrerOptionsOcr(options);
  if (rep.erreur) {
    erreur.textContent = rep.erreur;
    erreur.hidden = false;
    return;
  }
  // v0.1.37 : l'état des options suit AUSSITÔT la validation, sans
  // attendre une nouvelle ouverture de la carte — sinon le réglage
  // fraîchement enregistré n'agissait sur l'ouverture qu'après un
  // passage par la carte (même cause que le bouton Reco grisé).
  try {
    const apres = await window.atelier.optionsOcr();
    if (apres) optionsOcrEtat = apres;
  } catch { /* l'état lisible suivra à la prochaine ouverture de carte */ }
  fermerOptionsOcr();
  message($('#opt-serveur').checked
    ? `Serveur OCR enregistré : ${options.url}. Le bouton ƒ LaTeX lit désormais chez vous.${options.jeton ? ' Jeton enregistré.' : ''}`
    : 'OCR Mistral enregistré pour la lecture LaTeX.', 'reussite');
}

/* ============================================================
   v0.1.28 : reconnaissance du document à l'ouverture (styles A et D)
   ============================================================ */
/* À l'ouverture, si le serveur OCR personnel est configuré, toutes les
   pages partent L'UNE APRÈS L'AUTRE au endpoint /page par le MÊME
   chemin que le bouton « Tester la reconnaissance » (page:tester :
   aucune duplication du pipeline, leçon v0.1.26.2). La barre fine
   sous la barre d'outils (style A validé) avance par page terminée,
   en navette tant qu'aucune page n'est revenue (le premier appel
   emporte le chargement du moteur, sans pourcentage mesurable). La
   colonne de vignettes (style D) cercle la page en vol et coche les
   reconnues. Le lien « Arrêter » de la barre d'état laisse achever la
   page en vol puis n'envoie plus rien. Les pages reconnues restent en
   mémoire (rien n'écrit dans le PDF) : recherche et clic ƒ ensuite. */
const recoDocument = {
  generation: 0,        // un changement de document coupe la boucle
  arretDemande: false,  // lien « Arrêter » de la barre d'état
  pageEnCours: 0,       // n° de la page en vol (vignettes, diagnostics)
  pages: new Map(),     // n° -> page reconnue { largeur, hauteur, blocs }
};

function progressionCacher() {
  $('#barre-progression').hidden = true;
  const empli = $('#barre-progression-empli');
  empli.classList.remove('navette');
  empli.style.width = '0';
  const zone = $('#progression-etat');
  zone.hidden = true;
  zone.textContent = '';
}

function majProgressionReco(faites, total, pageEnVol) {
  $('#barre-progression').hidden = false;
  const empli = $('#barre-progression-empli');
  if (faites === 0) {
    // Navette : la première page emporte le chargement du moteur, aucun
    // pourcentage honnête n'est mesurable avant elle.
    empli.style.width = '';
    empli.classList.add('navette');
  } else {
    empli.classList.remove('navette');
    empli.style.width = Math.round((faites / total) * 100) + '%';
  }
  const zone = $('#progression-etat');
  zone.hidden = false;
  zone.innerHTML = 'Reconnaissance : page ' + pageEnVol + ' sur ' + total + ', '
    + faites + (faites > 1 ? ' pages reconnues' : ' page reconnue')
    + ' (' + Math.round((faites / total) * 100) + ' %)'
    + ' <a data-role="arreter" href="#">Arrêter</a>';
}

function marquerVignetteReco(n, etat) {
  const figure = els.vignettes.querySelector('.vignette[data-page="' + n + '"]');
  if (!figure) return;
  if (etat === 'cours') figure.classList.add('ocr-cours');
  else {
    figure.classList.remove('ocr-cours');
    if (etat === 'fait') figure.classList.add('ocr-fait');
  }
}

/* Posée au fil de construireVignettes : une page reconnue pendant que
   sa vignette n'existait pas encore retrouve son état. */
function appliquerEtatRecoVignette(figure, n) {
  if (recoDocument.pageEnCours === n) figure.classList.add('ocr-cours');
  if (recoDocument.pages.has(n)) figure.classList.add('ocr-fait');
}

function couperReconnaissanceDocument() {
  recoDocument.generation += 1;
  recoDocument.arretDemande = false;
  recoDocument.pageEnCours = 0;
  recoDocument.pages.clear();
  progressionCacher();
  majRecoVue(); // v0.1.29 : plus de blocs à corriger sur cette vue
}

/* Le lien « Arrêter » est dans la zone d'état : délégation simple. */
$('#progression-etat').addEventListener('click', (ev) => {
  if (!ev.target.dataset || ev.target.dataset.role !== 'arreter') return;
  ev.preventDefault();
  recoDocument.arretDemande = true;
  $('#progression-etat').textContent = "La page en cours s'achève, puis la reconnaissance s'arrête…";
});

async function reconnaitreDocument() {
  if (!etat.pdfjs || !etat.resume) return;
  // Rien en mode OCR Mistral : le bouton ƒ garde son rôle, l'ouverture
  // n'envoie le document à personne sans serveur personnel déclaré.
  // v0.1.37 : la garde vit DANS le moteur (reconnaissanceServeurActif,
  // testée) ; l'état des options est tenu à jour au démarrage et à la
  // validation de la carte (init et validerOptionsOcr), sinon l'ouverture
  // croyait au mode « mistral » tant que la carte n'était pas ouverte.
  if (!AtelierOcr.reconnaissanceServeurActif(optionsOcrEtat)) return;
  const gen = ++recoDocument.generation;
  recoDocument.arretDemande = false;
  const total = etat.resume.pageCount;
  let faites = 0;
  for (let n = 1; n <= total; n += 1) {
    if (gen !== recoDocument.generation) return; // document changé
    if (recoDocument.arretDemande) {
      recoDocument.pageEnCours = 0;
      marquerVignetteReco(n, 'attente');
      progressionCacher();
      message('Reconnaissance arrêtée : ' + faites + ' page' + (faites > 1 ? 's' : '')
        + ' reconnue' + (faites > 1 ? 's' : '') + ' sur ' + total + '.');
      return;
    }
    recoDocument.pageEnCours = n;
    marquerVignetteReco(n, 'cours');
    majProgressionReco(faites, total, n);
    try {
      const page = await etat.pdfjs.getPage(n);
      const vp = page.getViewport({ scale: 200 / 72 }); // ~200 points par pouce
      const toile = document.createElement('canvas');
      toile.width = Math.max(1, Math.floor(vp.width));
      toile.height = Math.max(1, Math.floor(vp.height));
      await page.render({ canvasContext: toile.getContext('2d'), viewport: vp }).promise;
      if (gen !== recoDocument.generation) return;
      const dataUrl = toile.toDataURL('image/jpeg', 0.85);
      const rep = await window.atelier.testerPage(dataUrl);
      if (gen !== recoDocument.generation) return;
      if (rep.erreur) {
        recoDocument.pageEnCours = 0;
        marquerVignetteReco(n, 'attente');
        progressionCacher();
        message(faites === 0
          ? 'Reconnaissance du document impossible : ' + rep.erreur
          : 'Reconnaissance arrêtée à la page ' + n + ' : ' + rep.erreur, 'erreur');
        return;
      }
      recoDocument.pages.set(n, rep.page);
      faites += 1;
      marquerVignetteReco(n, 'fait');
      if (n === etat.page) majRecoVue(); // v0.1.29 : la page affichée devient éditable
    } catch (err) {
      if (gen !== recoDocument.generation) return;
      recoDocument.pageEnCours = 0;
      progressionCacher();
      message('Reconnaissance arrêtée à la page ' + n + ' : ' + ((err && err.message) || err), 'erreur');
      return;
    }
  }
  if (gen !== recoDocument.generation) return;
  recoDocument.pageEnCours = 0;
  const empli = $('#barre-progression-empli');
  empli.classList.remove('navette');
  empli.style.width = '100%';
  $('#progression-etat').hidden = true;
  message('Reconnaissance terminée : ' + total + ' page' + (total > 1 ? 's' : '')
    + ' reconnue' + (total > 1 ? 's' : '') + '.', 'reussite');
  setTimeout(() => {
    if (gen !== recoDocument.generation) return;
    $('#barre-progression').hidden = true;
    empli.style.width = '0';
  }, 900);
}

/* ============================================================
   v0.1.29 : la page reconnue éditable en place
   ============================================================
   Geste validé sur maquette : un clic sur un bloc reconnu (contour
   discret à la Sélection) ouvre la correction EXACTEMENT à sa place,
   préremplie du texte reconnu, à la taille estimée du bloc ; un clic
   à côté pose, Échap pose aussi, un texte vide abandonne. À
   l'enregistrement (engine/correction.js), la correction MASQUE le
   scan du bloc par un rectangle blanc opaque et écrit le texte
   vectoriel (les $formules$ composées par le moteur d'équations) :
   lisible et imprimable partout. Les blocs intacts restent l'image du
   scan, sans perte. Le bouton Reco masque l'aperçu : les annotations
   posées redeviennent alors saisissables à la Sélection (déplacer,
   redimensionner, Suppr). */
const recoVue = { visible: true };

/** Page reconnue affichable (celle de la page courante), ou null. */
function blocsReconnus() {
  if (!etat.pdfjs || !etat.resume || !etat.viewport || !recoDocument.pages) return null;
  const page = recoDocument.pages.get(etat.page);
  return page && Array.isArray(page.blocs) ? page : null;
}

/** Rectangle PDF [x0, bas, x1, haut] du bloc reconnu, converti depuis
 * l'image de reconnaissance (rendue à ~200 points par pouce : la page
 * PDF de L×L tient dans largeur×hauteur pixels). */
function rectPdfDeBloc(b, page) {
  const pageW = etat.viewport.pageW;
  const pageH = etat.viewport.pageH;
  const kx = pageW / (page.largeur || 1);
  const ky = pageH / (page.hauteur || 1);
  return [
    b.bbox[0] * kx,
    pageH - b.bbox[3] * ky, // le bas de l'image devient le bas du PDF
    b.bbox[2] * kx,
    pageH - b.bbox[1] * ky, // idem, origine en haut à gauche pour l'une
  ];
}

/** Source de correction d'un bloc : le texte reconnu mot à mot (lignes
 * séparées par \n), ou $latex$ pour une formule. Vide si non corrigeable. */
function sourceDeBloc(b) {
  if (b.type === 'formule') {
    const tex = String(b.latex || '')
      .replace(/^[\s$]+/, '').replace(/[\s$]+$/, '')
      .trim();
    return tex ? `$${tex}$` : '';
  }
  if (b.type === 'titre') return String(b.texte || '');
  if (b.type === 'texte') {
    return (Array.isArray(b.lignes) ? b.lignes : [])
      .map((l) => (l && Array.isArray(l.mots) ? l.mots : []).map((m) => m.texte).join(' '))
      .join('\n');
  }
  return '';
}

/** Taille du corps du bloc, estimée de la hauteur d'UNE ligne de
 * l'image de reconnaissance (72/200 ramène les pixels en points ; le
 * cadre utile d'une ligne vaut à peu près 1,4 corps). */
function tailleEstimeeDeBloc(b) {
  const nbLignes = b.type === 'texte' && Array.isArray(b.lignes) && b.lignes.length
    ? b.lignes.length : 1;
  const hLigne = Math.max(1, b.bbox[3] - b.bbox[1]) / nbLignes;
  const fs = hLigne * (72 / 200) / 1.4;
  return Math.min(28, Math.max(6, Math.round(fs * 2) / 2));
}

/* v0.1.38 : le VRAI texte de la page ouverte. Un getTextContent par
   page, PROMIS en cache le temps du document : la correction en place
   lit la source, la taille, la famille et le gras réels du texte qu'elle
   remplace (retour d'Arthur : le texte modifié changeait de police et
   formait un amas — la page était à texte réel, la reconnaissance n'y
   était pour rien). Null si la page n'a pas de couche de texte : un scan
   garde le chemin de la reconnaissance. */
const cacheItemsTexte = new Map(); // n° de page -> Promise<{items, styles} | null>

function itemsTexteDePage(numPage) {
  if (!etat.pdfjs || !Number.isInteger(numPage) || numPage < 1) return Promise.resolve(null);
  if (!cacheItemsTexte.has(numPage)) {
    cacheItemsTexte.set(numPage, (async () => {
      try {
        const page = await etat.pdfjs.getPage(numPage);
        const contenu = await page.getTextContent();
        return (contenu && Array.isArray(contenu.items) && contenu.items.length)
          ? { items: contenu.items, styles: contenu.styles || {} } : null;
      } catch (e) {
        return null; // page détruite entre-temps : la correction repliera
      }
    })());
  }
  return cacheItemsTexte.get(numPage);
}

/** Texte réel tombant dans un rectangle [x0, yBas, x1, yHaut] de la page
 *  affichée : {source, taille, famille, gras, rect} ou null. */
async function texteReelDeRect(rect) {
  if (!Array.isArray(rect) || rect.length < 4 || !etat.page) return null;
  const contenu = await itemsTexteDePage(etat.page);
  if (!contenu) return null;
  try {
    return AtelierTexteReel.analyserItemsTexte(contenu.items, contenu.styles, rect);
  } catch (e) {
    return null; // jamais bloquer la correction sur une lecture de texte
  }
}

/** Correction posée qui recouvre le mieux le rectangle : le clic sur un
 * bloc corrigé REPREND la correction (au lieu d'en empiler une seconde). */
function correctionSurRect(rect) {
  let meilleur = null;
  let aire = 0;
  for (const a of (etat.resume ? etat.resume.annots : [])) {
    if (a.page !== etat.page - 1 || a.subtype !== 'Square' || !a.ref) continue;
    if (!(a.contents || '').startsWith(PREFIXE_CORRECTION)) continue;
    const ix = Math.max(0, Math.min(rect[2], a.rect[2]) - Math.max(rect[0], a.rect[0]));
    const iy = Math.max(0, Math.min(rect[3], a.rect[3]) - Math.max(rect[1], a.rect[1]));
    if (ix * iy > aire) { aire = ix * iy; meilleur = a; }
  }
  return aire > 0 ? meilleur : null;
}

/** Reconstruit l'aperçu des blocs reconnus de la page affichée.
 * Calé sur le conteneur en pourcentages, il suit le zoom sans calcul
 * (le conteneur ET l'image de reconnaissance voient tous deux la page
 * entière dans le même sens). */
function majRecoVue() {
  const calque = els.calqueReco;
  if (!calque) return;
  const bouton = $('#btn-reco');
  if (!bouton) return;
  const page = blocsReconnus();
  const montrer = !!page && recoVue.visible && etat.outil === 'aucun' && !etat.saisieAttente;
  bouton.disabled = !page;
  // v0.1.37 : un bouton grisé EN DIT LA RAISON au survol, au lieu de
  // demeurer muet (retour d'Arthur : « je ne peux plus cocher la case
  // scan » — la reconnaissance ne partait pas, le bouton ne l'expliquait pas).
  if (!page) {
    bouton.title = AtelierOcr.reconnaissanceServeurActif(optionsOcrEtat)
      ? "Reconnaissance absente sur cette page : elle n'a pas (encore) été reconnue. Le bouton s'active dès qu'une page revient (ouverture du document, ou « Tester la reconnaissance » dans Fichier → Options OCR LaTeX…)."
      : "Reconnaissance inactive : aucun serveur OCR personnel n'est configuré (Fichier → Options OCR LaTeX…). Sans lui, l'ouverture n'envoie le document à personne.";
  } else {
    bouton.title = "Reconnaissance : montrer ou cacher les blocs reconnus de la page affichée (un clic sur un bloc ouvre sa correction en place, formules comprises)";
  }
  bouton.classList.toggle('actif', !!page && recoVue.visible);
  if (!montrer) {
    calque.hidden = true;
    calque.replaceChildren();
    return;
  }
  calque.hidden = false;
  calque.replaceChildren();
  page.blocs.forEach((b, i) => {
    if (!b || !Array.isArray(b.bbox) || b.bbox.length < 4) return;
    const div = document.createElement('div');
    const source = sourceDeBloc(b);
    const corrigeable = source.trim() !== '';
    div.className = 'reco-bloc'
      + (b.type === 'titre' ? ' reco-titre' : '')
      + (corrigeable ? '' : ' reco-tranquille');
    div.style.left = `${(b.bbox[0] / (page.largeur || 1)) * 100}%`;
    div.style.top = `${(b.bbox[1] / (page.hauteur || 1)) * 100}%`;
    div.style.width = `${((b.bbox[2] - b.bbox[0]) / (page.largeur || 1)) * 100}%`;
    div.style.height = `${((b.bbox[3] - b.bbox[1]) / (page.hauteur || 1)) * 100}%`;
    div.dataset.i = String(i);
    if (corrigeable) {
      const cible = correctionSurRect(rectPdfDeBloc(b, page));
      if (cible) {
        div.classList.add('reco-fait');
        div.title = 'Bloc corrigé : cliquez pour reprendre la correction.';
      } else {
        div.title = b.type === 'formule'
          ? `Formule reconnue ($ ou LaTeX, corrigeable) : ${source.slice(0, 100)}`
          : `Bloc reconnu (cliquez pour corriger en place) : ${source.slice(0, 100)}`;
      }
    } else {
      div.title = b.type === 'tableau'
        ? 'Tableau reconnu : non corrigible dans cette version.'
        : b.type === 'image'
          ? 'Image reconnue : rien à corriger.'
          : 'Bloc reconnu.';
      // Un bloc de texte, un titre ou une formule sans texte reconnu
      // reste CORRIGEABLE : la reconnaissance a raté, l'écriture
      // manuelle reprend la main.
      if (b.type === 'texte' || b.type === 'titre' || b.type === 'formule') {
        div.classList.remove('reco-tranquille');
        div.title = 'Bloc reconnu sans texte : cliquez pour en écrire un.';
      }
    }
    calque.append(div);
  });
}

/* Un clic sur un bloc reconnu ouvre sa correction en place, préremplie
 * du texte reconnu ; sur un bloc déjà corrigé, la correction existante
 * est REPRISE (et reposée à la validation).
 * v0.1.38 : FIDÉLITÉ AU DOCUMENT — si un VRAI texte vit sous le rectangle
 * (page née sous Word, LibreOffice, PowerPoint…), la correction part de
 * LUI : source réelle, taille réelle mesurée sur place, famille (Times
 * ou Helvetica), gras au besoin. Une page scannée garde la source de la
 * reconnaissance et sa taille estimée, comme toujours. */
/* v0.1.41 : le chemin PARTAGÉ de la correction d'un bloc reconnu — le
 * clic sur l'aperçu (outil Sélection, depuis la v0.1.29) et l'outil
 * Modifier l'empruntent l'un comme l'autre : reprise d'une correction
 * déjà posée, sinon le VRAI texte du document quand il vit sous le
 * rectangle, sinon le texte reconnu du scan. */
async function ouvrirCorrectionDeBloc(b, page) {
  const rect = rectPdfDeBloc(b, page);
  const existante = correctionSurRect(rect);
  if (existante) {
    const famille = extraireFamilleCorrection(existante.contents) === 'serif' ? 'serif' : 'sans';
    const gras = Boolean(extraireGrasCorrection(existante.contents));
    ouvrirEditeur('correction', null, existante, { famille, gras });
    return;
  }
  let donnees = { rect, source: sourceDeBloc(b), fontSize: tailleEstimeeDeBloc(b) };
  const reel = await texteReelDeRect(donnees.rect);
  if (reel && reel.source.trim()) {
    // Le rectangle COUVE le vrai texte (union) : l'encre réelle dépasse
    // parfois la boîte mesurée sur l'image de reconnaissance.
    donnees = {
      rect: [
        Math.min(rect[0], reel.rect[0]), Math.min(rect[1], reel.rect[1]),
        Math.max(rect[2], reel.rect[2]), Math.max(rect[3], reel.rect[3]),
      ],
      source: reel.source,
      fontSize: reel.taille,
      famille: reel.famille,
      gras: reel.gras,
    };
  }
  ouvrirEditeur('correction', donnees);
}

/* v0.1.41 : l'outil Modifier (croquis validé) — le clic ouvre la
 * correction au point demandé : (1) une correction DÉJÀ POSÉE à cet
 * endroit se reprend telle quelle ; (2) le VRAI texte de la page (née
 * sous Word, LibreOffice, PowerPoint…) fournit LA LIGNE cliquée, sa
 * source, sa taille, sa famille et son gras ; (3) sur une page scannée
 * et reconnue, le bloc qui contient le point suit le chemin de la
 * reconnaissance ; (4) sinon, le clic était dans une marge : on
 * l'oriente plutôt que de laisser un clic muet. */
async function ouvrirModificationAuPoint(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !etat.resume) return;
  // (1) Reprise : la correction posée qui couvre le point.
  const existante = correctionSurRect([x - 1, y - 1, x + 1, y + 1]);
  if (existante) {
    const famille = extraireFamilleCorrection(existante.contents) === 'serif' ? 'serif' : 'sans';
    const gras = Boolean(extraireGrasCorrection(existante.contents));
    ouvrirEditeur('correction', null, existante, { famille, gras });
    return;
  }
  // (2) Le vrai texte : la ligne sous le point.
  const contenu = await itemsTexteDePage(etat.page);
  if (contenu) {
    let ligne = null;
    try {
      ligne = AtelierTexteReel.ligneAuPoint(contenu.items, x, y);
    } catch (e) {
      ligne = null; // jamais bloquer la correction sur une lecture de ligne
    }
    if (ligne) {
      let zone = null;
      try {
        zone = AtelierTexteReel.zoneDeLigne(ligne, contenu.styles);
      } catch (e) {
        zone = null;
      }
      if (zone && zone.source.trim()) {
        ouvrirEditeur('correction', zone);
        placerCurseurModification(x, zone.rect);
        return;
      }
    }
  }
  // (3) Un scan : le bloc reconnu qui contient le point.
  const page = blocsReconnus();
  if (page && Array.isArray(page.blocs)) {
    for (const b of page.blocs) {
      if (!b || !Array.isArray(b.bbox) || b.bbox.length < 4) continue;
      if (sourceDeBloc(b).trim() === '') continue;
      const rect = rectPdfDeBloc(b, page);
      if (x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3]) {
        await ouvrirCorrectionDeBloc(b, page);
        return;
      }
    }
  }
  // (4) Marge ou page muette : orienter, comme toujours dans l'atelier.
  message(pageMuette
    ? 'Aucun texte à cet endroit. Sur une page scannée, armez l\u2019outil Texte pour lancer la reconnaissance, puis cliquez un bloc reconnu.'
    : 'Aucun texte à cet endroit : cliquez dans une phrase du document.');
}

/* v0.1.41 : le caret part du caractère le PLUS PROCHE du clic, comme
 * dans Word — la fraction horizontale du clic dans la ligne donne la
 * position dans la source (ligne unique, mesurée sur l'encre réelle). */
function placerCurseurModification(x, rect) {
  const attente = etat.saisieAttente;
  if (!attente || attente.kind !== 'correction' || attente.ref) return;
  const zone = $('#editeur-texte');
  const longueur = (zone.value || '').length;
  const largeur = rect[2] - rect[0];
  const fraction = largeur > 0 ? Math.min(1, Math.max(0, (x - rect[0]) / largeur)) : 1;
  const pos = Math.round(longueur * fraction);
  zone.focus();
  zone.setSelectionRange(pos, pos);
}

els.calqueReco.addEventListener('click', async (ev) => {
  const div = ev.target.closest('.reco-bloc');
  if (!div || div.classList.contains('reco-tranquille')) return;
  const page = blocsReconnus();
  if (!page) return;
  const b = page.blocs[Number(div.dataset.i)];
  if (!b || !Array.isArray(b.bbox)) return;
  await ouvrirCorrectionDeBloc(b, page);
});

/* Le bouton Reconnaissance masque ou remet l'aperçu : masqué, les
 * annotations posées (corrections comprises) redeviennent saisissables
 * à la Sélection — déplacer, redimensionner, retirer. */
$('#btn-reco').addEventListener('click', () => {
  recoVue.visible = !recoVue.visible;
  majRecoVue();
  if (etat.outil === 'aucun' && recoVue.visible) {
    message('Aperçu de la reconnaissance affiché : cliquez un bloc pour le corriger en place.');
  }
});

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
    if (etat.outil === 'modifier') {
      // v0.1.41 : l'outil Modifier (croquis validé) — un clic dans une
      // phrase ouvre la correction EN PLACE au point cliqué. Pas de
      // geste : la pose se fait par Entrée (ou clic à côté), l'abandon
      // par Échap.
      ouvrirModificationAuPoint(point.x, point.y);
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
      if (cible && ((cible.contents || '').startsWith(PREFIXE_FICHE_MIXTE)
        || (cible.contents || '').startsWith(PREFIXE_NOTE_RICHE))) {
        // v0.1.11/v0.1.31 : cliquer une note riche (ou une fiche mixte
        // des versions antérieures) l'ouvre pour correction.
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
    } else if (cible.subtype === 'Square' && (cible.contents || '').startsWith(PREFIXE_CORRECTION)) {
      // v0.1.29 : reprise d'une correction posée (l'aperçu de la
      // reconnaissance est masqué : la Sélection voit l'annotation).
      // v0.1.38 : la famille et le gras du marqueur suivent la reprise.
      const famille = extraireFamilleCorrection(cible.contents) === 'serif' ? 'serif' : 'sans';
      const gras = Boolean(extraireGrasCorrection(cible.contents));
      ouvrirEditeur('correction', null, cible, { famille, gras });
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
      ctx.strokeStyle = '#0067C0';
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
      ctx.fillStyle = 'rgba(0, 103, 192, 0.12)';
      ctx.strokeStyle = 'rgba(0, 103, 192, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.fillRect(Math.min(r0.x, r1.x), Math.min(r0.y, r1.y),
        Math.abs(r1.x - r0.x), Math.abs(r1.y - r0.y));
      ctx.strokeRect(Math.min(r0.x, r1.x), Math.min(r0.y, r1.y),
        Math.abs(r1.x - r0.x), Math.abs(r1.y - r0.y));
      ctx.setLineDash([]);
    } else if (geste.outil === 'encre') {
      geste.points.push(point);
      ctx.strokeStyle = '#0067C0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      geste.points.forEach((p, i) => {
        const e = pdfVersEcran(p);
        if (i === 0) ctx.moveTo(e.x, e.y); else ctx.lineTo(e.x, e.y);
      });
      ctx.stroke();
    } else {
      ctx.fillStyle = geste.outil === 'surligner' ? 'rgba(232, 179, 75, 0.35)' : 'rgba(0, 103, 192, 0.15)';
      ctx.strokeStyle = 'rgba(0, 103, 192, 0.8)';
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
          // v0.1.31 : la forme (plein, soulignement, barré, ondulé) et la
          // couleur choisies voyagent avec la pose (croquis validé).
          const opts = etat.options.surligner;
          const quadPoints = quadPointsForRange(A, B);
          await appliquer({
            kind: 'highlight', pageIndex,
            args: { rect, quadPoints, forme: opts.forme, couleur: opts.couleur },
          });
          message('Surlignage posé.', 'reussite');
        } else if (geste.outil === 'encadrer') {
          // v0.1.31 : forme, trait, épaisseur, teinte et couleur du cadre.
          const opts = etat.options.encadrer;
          await appliquer({
            kind: 'square', pageIndex,
            args: {
              rect, forme: opts.forme, trait: opts.trait,
              borderWidth: EPAISSEURS_CADRE[opts.ep] || 2.2,
              teinte: opts.teinte, couleur: opts.couleur,
            },
          });
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

/* v0.1.35 : « Ôter tous les surlignages de la page » — demande d'Arthur
   après un retrait à la main qui « ne se voyait pas » (le surlignage
   restait peint au fond de page par pdf.js). Le lot retire d'un coup
   les quatre formes de surlignage de la page affichée et forme UN SEUL
   geste : une annulation les ramène toutes ensemble. */
async function oterSurlignagesPage() {
  if (!etat.resume) return;
  const cibles = globalThis.AtelierSurlignage
    .selectionSurlignagesPage(etat.resume.annots, etat.page - 1);
  if (cibles.length === 0) {
    message('Aucune annotation de surlignage sur cette page.', 'info');
    return;
  }
  const edits = cibles.filter((a) => a.ref)
    .map((a) => ({ kind: 'remove', pageIndex: a.page, args: { ref: a.ref } }));
  if (edits.length === 0) {
    message('Aucun surlignage supprimable sur cette page.', 'info');
    return;
  }
  const rep = await window.atelier.applyEdits(edits);
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  const numeros = new Set(edits.map((e) => e.args.ref.objectNumber));
  if (etat.selection && numeros.has(etat.selection.ref.objectNumber)) {
    etat.selection = null;
  }
  majResume(rep.resume);
  message(`${edits.length} surlignage(s) ôté(s) de la page.`, 'reussite');
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
  // v0.1.18 : le cadre s'installe sur le rectangle de l'annotation même,
  // à sa taille définitive — on écrit à la place exacte du texte posé.
  const geom = positionnerEditeur(attente.rect);
  const carte = $('#editeur-page');
  // v0.1.29 : la correction écrit DANS le bloc reconnu, à SA largeur
  // réelle (aucun minimum) : ce qu'on tape est ce qui sera composé.
  if (attente.kind === 'correction') {
    carte.style.width = `${Math.round(Math.max(36, geom.largeur))}px`;
  } else {
    carte.style.width = `${Math.round(Math.max(120, geom.largeur))}px`;
  }
  carte.style.height = 'auto';
  carte.style.minHeight = `${Math.round(Math.max(26, geom.hauteur))}px`;
  if (attente.kind === 'textNote') {
    // Le commentaire sur icône n'a pas de carré : la zone d'écriture
    // reste posée à droite de l'icône.
    carte.style.left = `${Math.round(geom.x + 26 * etat.zoom)}px`;
    carte.style.width = '230px';
  }
}

function calerAccessoiresEditeur() {
  // Barre et aperçu flottent sous le cadre, à sa largeur.
  const carte = $('#editeur-page');
  if (carte.hidden) return;
  const barre = $('#editeur-barre');
  barre.style.left = carte.style.left;
  barre.style.top = `${Math.round(carte.offsetTop + carte.offsetHeight + 8)}px`;
  const apercu = $('#editeur-apercu');
  if (!apercu.hidden) {
    apercu.style.left = carte.style.left;
    apercu.style.width = carte.style.width;
    apercu.style.top = `${Math.round(carte.offsetTop + carte.offsetHeight + 8 + barre.offsetHeight + 6)}px`;
  }
}

function clicHorsEditeur(ev) {
  // v0.1.18 : tout clic à l'extérieur pose le texte (façon PDF-XChange)
  // — mais PAS le panneau Équation ni ses fenêtres guidées : composer une
  // formule FAIT PARTIE de la saisie de la note. Jusqu'ici, chacun de ces
  // clics refermait le cadre et perdait l'insertion (rapporté en v0.1.21).
  const carte = $('#editeur-page');
  if (carte.hidden) return;
  for (const el of [carte, $('#editeur-barre'), $('#editeur-apercu'),
    $('#panneau-equation'), $('.saisie-fond:not([hidden])')]) {
    if (el && el.contains(ev.target)) return;
  }
  validerEditeur();
}

/* ============================================================
   v0.1.31 : sérialiseur du texte riche — le contenteditable parle le
   sous-ensemble HTML canonique du moteur (b, i, u, s, sup, sub, span
   style couleur/fond, div text-align, ul, ol, li). Chaque édition
   existante revisite ce chemin : la source relue au double-clic est
   IDENTIQUE au caractère près.
   ============================================================ */

/** Texte nu existant (note ou fiche d'avant la v0.1.31) vers le
 * canonique : entités échappées, une div par ligne. */
function texteNuveVersSource(texte) {
  const t = String(texte ?? '');
  if (!t) return '';
  const lignes = t.replace(/\r\n?/g, '\n').split('\n');
  return lignes.map((l) => `<div>${echapperTexte(l)}</div>`).join('');
}

/** Couleur CSS (rgb(...) ou #hex) vers #hex, sinon ''. */
function cssVersHex(coul) {
  const t = String(coul || '').trim();
  if (!t) return '';
  if (t[0] === '#') {
    if (t.length === 4) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toLowerCase();
    return t.toLowerCase().slice(0, 7);
  }
  const m = t.match(/rgba?\(([^)]+)\)/);
  if (!m) return '';
  const v = m[1].split(',').map((x) => parseFloat(x));
  if (v.length < 3) return '';
  const hex = (i) => Math.max(0, Math.min(255, Math.round(v[i])))
    .toString(16).padStart(2, '0');
  return `#${hex(0)}${hex(1)}${hex(2)}`;
}

/** Sérialise le contenu EN LIGNE d'un noeud en canonique. */
function serialiserInlineRiche(node) {
  // v0.1.36 : une formule composée de l'éditeur (image) se restitue en
  // $...$ brut, identique à la formule frappée à la main : la source
  // canonique, le fichier et les autres lecteurs ne voient AUCUNE
  // différence avec un texte écrit au clavier.
  if (node.nodeType === 1 && (node.tagName || '').toLowerCase() === 'img') {
    const latex = node.getAttribute && node.getAttribute('data-latex');
    return latex ? `$${latex}$` : '';
  }
  let out = '';
  node.childNodes.forEach((enfant) => {
    if (enfant.nodeType === 3) { out += echapperTexte(enfant.data); return; }
    if (enfant.nodeType !== 1) return;
    const bas = (enfant.tagName || '').toLowerCase();
    if (bas === 'br') return; // traité au niveau des blocs
    const style = enfant.style || {};
    const coul = cssVersHex(style.color) || cssVersHex(enfant.getAttribute && enfant.getAttribute('color'));
    const fond = cssVersHex(style.backgroundColor)
      || cssVersHex(style.getPropertyValue && style.getPropertyValue('background-color'));
    if (bas === 'b' || bas === 'strong') {
      out += `<b>${serialiserInlineRiche(enfant)}</b>`;
    } else if (bas === 'i' || bas === 'em') {
      out += `<i>${serialiserInlineRiche(enfant)}</i>`;
    } else if (bas === 'u') {
      out += `<u>${serialiserInlineRiche(enfant)}</u>`;
    } else if (bas === 's' || bas === 'strike' || bas === 'del') {
      out += `<s>${serialiserInlineRiche(enfant)}</s>`;
    } else if (bas === 'sup') {
      out += `<sup>${serialiserInlineRiche(enfant)}</sup>`;
    } else if (bas === 'sub') {
      out += `<sub>${serialiserInlineRiche(enfant)}</sub>`;
    } else if ((bas === 'span' || bas === 'font') && (coul || fond)) {
      const morceaux = [];
      if (coul) morceaux.push(`color:${coul}`);
      if (fond) morceaux.push(`background-color:${fond}`);
      out += `<span style="${morceaux.join(';')}">${serialiserInlineRiche(enfant)}</span>`;
    } else {
      out += serialiserInlineRiche(enfant); // conteneur sans style utile
    }
  });
  return out;
}

/** Alignement porté par un div (style.text-align ou attribut align). */
function alignDeBloc(el) {
  let a = '';
  try { a = String(el.style.textAlign || '').toLowerCase(); } catch (e) { a = ''; }
  if (!a && el.getAttribute) a = String(el.getAttribute('align') || '').toLowerCase();
  if (a === 'center' || a === 'centre') return 'center';
  if (a === 'right' || a === 'droite') return 'right';
  if (a === 'justify') return 'left';
  return ''; // gauche (par défaut) : rien dans le canonique
}

/** Le contenu du contenteditable SEREIALISE en source canonique :
 * une div par bloc (alignement porté), ul/ol pour les listes, br = fin
 * de bloc, lignes vides conservées (<div></div>). */
function serialiserEditeurRiche() {
  const racine = $('#editeur-riche');
  const blocs = [];
  let courante = null;

  function ouvrirBloc() {
    if (courante === null) courante = { liste: null, align: '', html: '' };
    return courante;
  }
  function cloreBloc() {
    if (courante !== null) {
      // les listes ne passent jamais par ici (ul/ol sont émises telles
      // quelles dans parcourir) : ce bloc est donc un bloc de texte.
      blocs.push(courante);
    }
    courante = null;
  }

  function parcourir(conteneur, alignHerite) {
    conteneur.childNodes.forEach((enfant) => {
      if (enfant.nodeType === 3) {
        ouvrirBloc().html += echapperTexte(enfant.data);
        ouvrirBloc().align = ouvrirBloc().align || alignHerite;
        return;
      }
      if (enfant.nodeType !== 1) return;
      const bas = (enfant.tagName || '').toLowerCase();
      if (bas === 'br') {
        cloreBloc();
        return;
      }
      if (bas === 'ul' || bas === 'ol') {
        cloreBloc();
        const items = [];
        enfant.childNodes.forEach((li) => {
          if (li.nodeType !== 1 || (li.tagName || '').toLowerCase() !== 'li') return;
          // Item de liste : br y vaut aussi fin de sous-bloc (rare) ; on
          // garde le contenu inline, du canonique plat.
          items.push(serialiserInlineRiche(li));
        });
        blocs.push({ liste: bas, items });
        return;
      }
      if (bas === 'div' || bas === 'p') {
        cloreBloc();
        const sous = String(alignDeBloc(enfant) || alignHerite || '');
        const htmlAvant = blocs.length;
        parcourir(enfant, sous);
        // L'alignement du div s'applique aux blocs qu'il contient.
        for (let k = htmlAvant; k < blocs.length; k += 1) {
          if (!blocs[k].liste) blocs[k].align = blocs[k].align || sous;
        }
        cloreBloc();
        return;
      }
      ouvrirBloc().html += serialiserInlineRiche(enfant);
      ouvrirBloc().align = ouvrirBloc().align || alignHerite;
    });
  }

  parcourir(racine, '');
  cloreBloc();

  let source = '';
  for (const b of blocs) {
    if (b.liste) {
      source += `<${b.liste}>`
        + b.items.map((it) => `<li>${it}</li>`).join('')
        + `</${b.liste}>`;
    } else {
      const align = b.align ? ` style="text-align:${b.align}"` : '';
      source += `<div${align}>${b.html}</div>`;
    }
  }
  return source;
}

/** La source canonique réaffichée dans le contenteditable : elle est
 * déjà le sous-ensemble HTML du moteur (aucune réécriture), entités
 * comprises — l'analyseur la relit à l'identique à la pose. */
function sourceVersHtml(source) {
  const t = String(source ?? '').trim();
  if (!t) return '';
  return t;
}

/* v0.1.36 : composer une formule EN IMAGE pour le cadre d'édition.
 * « Modifier la note avec la mise en forme reconnue, pas avec cet amas
 * de caractères » : à la reprise comme à l'insertion, chaque $...$ se
 * compose exactement comme la page le posera (mêmes ops MathJax, même
 * corps, ligne de base et profondeur alignées). La SÉRIALISATION
 * restitue l'image en $...$ brut : le format du fichier ne change
 * pas d'un caractère. Retour null si la composition échoue : l'appelant
 * garde alors le code $...$ visible (repli intégral d'avant v0.1.36). */
async function composerImageFormule(latex, fsCorpsPx, apPresse) {
  let ap = apPresse || null;
  if (!ap) {
    if (etat.apercuEditeur.has(latex)) {
      ap = etat.apercuEditeur.get(latex);
    } else {
      etat.apercuEditeur.set(latex, null); // en vol (même convention que l'aperçu)
      try {
        const rep = await window.atelier.previewEquation(latex, exPourCorps(FS_FICHE));
        ap = (rep && !rep.erreur && rep.apercu) ? rep.apercu : null;
      } catch (e) { ap = null; }
      etat.apercuEditeur.set(latex, ap);
    }
  }
  if (!ap || !ap.ops) return null;
  const k = Math.max(0.05, (Number(fsCorpsPx) || FS_FICHE) / FS_FICHE);
  const geom = cadrerImageFormule(ap, k);
  const cv = document.createElement('canvas');
  cv.width = geom.largeurPx;
  cv.height = geom.hauteurPx;
  tracerOpsPlacé(cv.getContext('2d'), ap, PAD_IMAGE_FORMULE, geom.basePx, k);
  const img = document.createElement('img');
  img.className = 'eq-editeur';
  img.src = cv.toDataURL();
  img.alt = `$${latex}$`;
  img.setAttribute('data-latex', latex); // brut : identique à la frappe manuelle
  img.title = 'Double-clic : modifier la formule';
  img.style.width = `${geom.largeurPx}px`;
  img.style.height = `${geom.hauteurPx}px`;
  img.style.verticalAlign = `${geom.alignementCss}px`;
  return img;
}

/* Habille la note reprise : chaque segment $...$ du texte devient une
 * formule composée, à sa place, dans la mise en forme existante. Le
 * parcours est ASYNCHRONE (composition MathJax une à une) mais PRUDENT :
 * si l'utilisateur a déjà refermé le cadre, changé d'onglet ou modifié
 * le texte sous la composition, l'habillage s'arrête net — jamais une
 * image ne remplace un texte qui a bougé. */
async function habillerFormulesEditeur() {
  const riche = $('#editeur-riche');
  const attente = etat.saisieAttente;
  if (riche.hidden || !attente) return;
  if (attente.kind !== 'freeText' && attente.kind !== 'ficheMelangee'
    && attente.kind !== 'noteRiche') return;
  const fsCorps = (attente.fontSize || etat.options.ecrire.taille || 11) * etat.zoom;
  const marcheur = document.createTreeWalker(riche, NodeFilter.SHOW_TEXT);
  const noeuds = [];
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) noeuds.push(n);
  for (const noeud of noeuds) {
    let cur = noeud;
    for (;;) {
      if (!cur || !cur.isConnected || etat.saisieAttente !== attente) return;
      const prem = decouperMelange(cur.data).find((s) => s.type === 'formule');
      if (!prem) break;
      const img = await composerImageFormule(prem.valeur, fsCorps);
      if (!img) break; // composition impossible : le code $...$ reste visible
      if (!cur.isConnected || etat.saisieAttente !== attente) return;
      const brut = `$${prem.valeur}$`;
      const pos = cur.data.indexOf(brut);
      if (pos === -1) break; // le texte a changé pendant la composition
      const apres = cur.splitText(pos);
      apres.deleteData(0, brut.length);
      cur.parentNode.insertBefore(img, apres);
      cur = apres; // le fragment restant peut porter d'autres formules
    }
  }
}

function ouvrirEditeur(genre, pointOuRect, cible, supplement) {
  if (!etat.resume) return;
  let attente;
  const mixte = !!(cible && cible.subtype === 'Square'
    && (cible.contents || '').startsWith(PREFIXE_FICHE_MIXTE));
  if (genre === 'correction') {
    // v0.1.29 : reprise d'une correction posée (cible = annotation) ou
    // correction neuve d'un bloc reconnu (pointOuRect = le bloc).
    // v0.1.38 : la FAMILLE et le GRAS voyagent avec la correction (lus
    // du vrai texte de la page à la pose, du marqueur à la reprise).
    const reprise = !!(cible && cible.ref && (cible.contents || '').startsWith(PREFIXE_CORRECTION));
    const bloc = reprise ? cible : pointOuRect;
    if (!bloc || !bloc.rect) return;
    const famille = (supplement && supplement.famille) === 'serif'
      || (!reprise && bloc.famille === 'serif') ? 'serif' : 'sans';
    const gras = reprise
      ? Boolean((supplement && supplement.gras) || extraireGrasCorrection(cible.contents))
      : Boolean((supplement && supplement.gras) || bloc.gras);
    attente = {
      kind: 'correction',
      sujet: 'Correction',
      pageIndex: reprise ? cible.page : etat.page - 1,
      rect: bloc.rect.slice(),
      contenu: reprise ? extraireSourceCorrection(cible.contents) : String(bloc.source || ''),
      fontSize: reprise
        ? (extraireTailleCorrection(cible.contents) || 11)
        : (Number.isFinite(bloc.fontSize) && bloc.fontSize > 0 ? bloc.fontSize : 11),
      famille,
      gras,
      ref: reprise ? cible.ref : null,
    };
  } else if (cible && cible.subtype === 'FreeText'
    && (cible.contents || '').startsWith(PREFIXE_NOTE_RICHE)) {
    // v0.1.31 : reprise d'une note riche — la source canonique repart
    // telle quelle (styles, couleurs, listes, formules), la taille du
    // marqueur recompose à l'identique.
    attente = {
      kind: 'noteRiche',
      sujet: cible.subject === 'Fiche' ? 'Fiche' : 'Note',
      pageIndex: cible.page,
      ref: cible.ref,
      rect: cible.rect.slice(),
      contenu: extraireSourceNoteRiche(cible.contents),
      fontSize: extraireTailleNoteRiche(cible.contents) || 11,
    };
  } else if (cible && (cible.subtype === 'Text' || cible.subtype === 'FreeText' || mixte)) {
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
  const riche = $('#editeur-riche');
  // v0.1.31 : la machine à écrire est RICHE — notes et fiches s'écrivent
  // dans le contenteditable (gras, couleurs, listes, tailles, formules) ;
  // le textarea ne subsiste que pour le commentaire sur icône et la
  // correction des blocs reconnus.
  const estRiche = attente.kind === 'freeText' || attente.kind === 'ficheMelangee'
    || attente.kind === 'noteRiche';
  const estNoteNue = attente.kind === 'freeText' && attente.sujet === 'Note';
  // v0.1.19 : les formules $...$ vivent aussi dans la machine à écrire,
  // et depuis la v0.1.29 dans la correction des blocs reconnus.
  const avecFormules = estRiche || attente.kind === 'correction';
  // v0.1.18 : le cadre PREND la mise en forme de l'annotation finale —
  // c'est le futur texte qu'on écrit, à sa place, sous sa forme définitive.
  // v0.1.31 : la note riche (et la future pose de toute note ou fiche)
  // s'écrit À MÊME LA PAGE : texte sombre, sans fond ni icône.
  carte.className = 'editeur-page ' + (attente.kind === 'textNote' ? 'commentaire'
    : attente.kind === 'correction' ? 'correction'
      : attente.kind === 'noteRiche' ? 'note'
        : estRiche ? 'note'
          : (estNoteNue ? 'note' : 'fiche'));
  editeurCaler(attente);
  // La typographie du cadre est celle du RENDU FINAL, zoom compris. La
  // correction (v0.1.29) écrit à la taille ESTIMÉE du bloc reconnu ;
  // la note riche à la taille du marqueur ou du stepper (v0.1.31).
  const fsCadre = attente.kind === 'correction' ? attente.fontSize
    : estRiche ? (attente.fontSize || etat.options.ecrire.taille || 11) : 11;
  if (estRiche) {
    // Le stepper suit le corps de la note reprise (la validation posera
    // exactement ce que l'écran montre).
    etat.options.ecrire.taille = fsCadre;
    majTailleVal();
  }
  zone.style.fontSize = `${fsCadre * etat.zoom}px`;
  zone.style.lineHeight = `${Math.round(fsCadre * 1.3 * etat.zoom)}px`;
  // v0.1.38 : la correction écrit dans la FAMILLE du texte remplacé — le
  // cadre montre déjà ce que la validation posera (Times pour une page à
  // empattements, sinon la sans empattement d'origine).
  zone.style.fontFamily = attente.kind === 'correction' && attente.famille === 'serif'
    ? '"Times New Roman", Times, serif' : '';
  if (attente.kind === 'correction' && attente.gras) zone.style.fontWeight = '600';
  else zone.style.fontWeight = '';
  // v0.1.41 : la correction est POSÉE sur la page (croquis validé) :
  // padding vertical nul, le texte calé sur l'original ; les autres
  // cadres gardent leur matelas.
  zone.style.padding = attente.kind === 'correction'
    ? `0 ${Math.round(3 * etat.zoom)}px 0`
    : `${Math.round((estNoteNue ? 1 : 2) * etat.zoom)}px ${Math.round(3 * etat.zoom)}px ${Math.round(etat.zoom)}px`;
  zone.style.height = 'auto';
  zone.value = estRiche ? '' : attente.contenu;
  zone.hidden = estRiche;
  riche.hidden = !estRiche;
  if (estRiche) {
    riche.style.fontSize = `${fsCadre * etat.zoom}px`;
    riche.style.lineHeight = `${Math.round(fsCadre * 1.3 * etat.zoom)}px`;
    riche.style.padding = `${Math.round(etat.zoom)}px ${Math.round(3 * etat.zoom)}px`;
    // Contenu : la source canonique repart telle quelle (elle EST un
    // sous-ensemble HTML sûr, écrit par le sérialiseur ou le moteur) ;
    // un texte nu existant devient des blocs div ligne à ligne.
    riche.innerHTML = sourceVersHtml(
      attente.kind === 'noteRiche' || attente.kind === 'ficheMelangee'
        ? String(attente.contenu || '') : texteNuveVersSource(String(attente.contenu || '')));
    // v0.1.36 : les formules $...$ se composent en place — l'édition
    // montre la note telle que la page la pose, plus le code brut.
    habillerFormulesEditeur();
  }
  carte.hidden = false;
  // v0.1.18 : l'original réédité s'efface du calque : le cadre montre le
  // futur, pas le doublon (façon PDF-XChange).
  etat.annotationMasquee = attente.ref || null;
  dessinerAnnots();
  $('#editeur-formule').hidden = !avecFormules;
  $('#editeur-barre').hidden = false;
  $('#editeur-apercu').hidden = !avecFormules || !contientFormule(attente.contenu);
  if (avecFormules && contientFormule(attente.contenu)) rafraichirApercuFiche();
  calerAccessoiresEditeur();
  if (estRiche) {
    // Curseur à la fin du contenu repris.
    riche.focus();
    const sel = window.getSelection();
    if (sel) {
      const r = document.createRange();
      r.selectNodeContents(riche);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    // v0.1.40 : sur une note NEUVE, les styles et la couleur ARMÉS au
    // panneau Écrire (cliqué sans note ouverte) s'appliquent au départ
    // de la saisie, comme dans la maquette validée. La reprise d'une
    // note posée garde sa mise en forme propre : rien n'y est réarmé.
    if (attente.kind === 'freeText' && !attente.ref) {
      try {
        riche.focus();
        document.execCommand('styleWithCSS', false, true);
        Object.keys(etat.options.ecrire.styles).forEach((cle) => {
          if (CMDS_RICHE[cle]) document.execCommand(CMDS_RICHE[cle], false, null);
        });
        if (etat.options.ecrire.couleur) {
          document.execCommand('foreColor', false, etat.options.ecrire.couleur);
        }
      } catch (e) { /* navigateur sans execCommand : la pose reste texte */ }
    }
  } else {
    zone.focus();
    zone.setSelectionRange(zone.value.length, zone.value.length);
    zone.style.height = `${zone.scrollHeight}px`;
  }
  // Le clic qui vient d'ouvrir le cadre ne doit pas aussitôt poser :
  // l'écouteur s'arme au tour suivant.
  setTimeout(() => document.addEventListener('pointerdown', clicHorsEditeur, true), 0);
}

function fermerEditeur() {
  document.removeEventListener('pointerdown', clicHorsEditeur, true);
  $('#editeur-page').hidden = true;
  const riche = $('#editeur-riche');
  riche.hidden = true; // v0.1.31 : l'écriture riche se range aussi
  riche.innerHTML = '';
  $('#editeur-texte').hidden = false;
  $('#editeur-barre').hidden = true;
  $('#editeur-apercu').hidden = true;
  etat.saisieAttente = null;
  etat.apercuEditeur.clear();
  etat.formuleCible = null; // v0.1.36 : la formule double-cliquée suit le cadre
  // L'original masqué pendant l'édition réapparaît tel quel (abandon,
  // ou pose d'un texte neuf : l'annotation remplacée est retirée par
  // le fil d'édition lui-même).
  if (etat.annotationMasquee) {
    etat.annotationMasquee = null;
    dessinerAnnots();
  }
  if (etat.formuleFiche) retablirBoutonEquation();
  majRecoVue(); // v0.1.29 : l'aperçu revient (pose, reprise ou abandon)
}

async function validerEditeur() {
  const attente = etat.saisieAttente;
  if (!attente) return;
  // v0.1.31 : l'écriture riche (notes, fiches, notes riches) se lit dans
  // le contenteditable et se SEREIALISE en source canonique ; le
  // textarea ne subsiste que pour le commentaire sur icône et la
  // correction des blocs reconnus.
  const estRiche = attente.kind === 'freeText' || attente.kind === 'ficheMelangee'
    || attente.kind === 'noteRiche';
  const texte = estRiche ? ($('#editeur-riche').innerText || '') : $('#editeur-texte').value;
  const source = estRiche ? serialiserEditeurRiche() : texte;
  fermerEditeur();
  // v0.1.18 : un texte vide NE DÉTRUIT PLUS l'annotation rééditée et ne
  // toaste pas : abandon silencieux du brouillon vide.
  // v0.1.36 : une note réduite à des formules n'a plus de innerText
  // (les formules composées sont des images) : la SOURCE fait foi,
  // elle porte les $...$ restitués par le sérialiseur.
  if (!texte.trim() && !contientFormule(source)) {
    return;
  }
  const edits = [];
  if (attente.ref) {
    edits.push({ kind: 'remove', pageIndex: attente.pageIndex, args: { ref: attente.ref } });
  }
  const args = { rect: attente.rect.slice() };
  let kind = attente.kind;
  const estNoteNue = attente.kind === 'freeText' && attente.sujet === 'Note';
  if (attente.kind === 'correction') {
    // v0.1.29 : le bloc corrigé est REPOSA tel quel — le moteur (engine/
    // correction.js) masque le scan du bloc par un rectangle blanc
    // opaque et écrit le texte vectoriel, les $formules$ composées.
    // v0.1.38 : la famille (Times ou Helvetica) et le gras suivent, lus
    // du vrai texte de la page à la première pose, du marqueur ensuite.
    kind = 'correction';
    args.source = texte;
    args.fontSize = attente.fontSize;
    args.famille = attente.famille === 'serif' ? 'serif' : 'sans';
    args.gras = Boolean(attente.gras);
  } else if (estRiche) {
    // v0.1.31 : notes et fiches se posent en NOTE RICHE — texte mis en
    // forme (gras, couleurs, listes, alignements) et formules $...$,
    // composés ensemble dans une seule annotation /FreeText.
    kind = 'noteRiche';
    args.source = source;
    args.fontSize = etat.options.ecrire.taille || 11;
    args.sujet = attente.sujet || 'Note';
  } else if (attente.kind === 'textNote') {
    args.contents = texte;
  } else {
    args.text = texte; // texte simple hors machine à écrire riche
    args.subject = attente.sujet || 'Fiche';
  }
  edits.push({ kind, pageIndex: attente.pageIndex, args });
  const rep = await window.atelier.applyEdits(edits);
  if (rep.erreur) { message(rep.erreur, 'erreur'); return; }
  majResume(rep.resume);
  if (attente.kind === 'correction') {
    // v0.1.29 : le geste attendu depuis la maquette validée.
    // v0.1.42 : le libellé dit L'ORIGINAL, pas « le scan » : la
    // correction s'applique aussi aux lignes à texte réel (v0.1.41),
    // où le mot scan n'a pas de sens (retour des captures d'Arthur).
    message(attente.ref ? 'Correction reprise : à l\'enregistrement, l\'original est remplacé par le texte.'
      : 'Texte modifié : à l\'enregistrement, l\'original est remplacé par le texte.', 'reussite');
    return;
  }
  message(attente.ref ? 'Texte modifié.'
    : (estNoteNue ? 'Note posée sur la page.' : 'Texte posé.'), 'reussite');
}

/** v0.1.21 : l'étiquette clavier du cadre, à la demande d'Arthur —
 * Échap POSE le texte (plus besoin de viser ailleurs) ; Ctrl+Échap
 * passe à la ligne. Pour abandonner un brouillon non vide : effacer le
 * texte puis Échap (l'original réédité reste intact).
 * v0.1.41 : dans une CORRECTION, l'étiquette est celle du croquis
 * validé — Échap ABANDONNE et rend l'original intact (l'annotation
 * masquée réapparaît), Maj+Entrée (ou Ctrl+Échap) passe la ligne,
 * Entrée pose. */
function toucheEchapEditeur(ev) {
  const riche = $('#editeur-riche');
  if (ev.ctrlKey || ev.metaKey) {
    // Ctrl+Échap : nouvelle ligne (retour à la ligne explicite, le
    // brouillon reste ouvert jusqu'au « pose »).
    ev.preventDefault();
    if (riche.hidden) {
      const zone = $('#editeur-texte');
      const d = zone.selectionStart ?? zone.value.length;
      const f = zone.selectionEnd ?? d;
      zone.value = `${zone.value.slice(0, d)}\n${zone.value.slice(f)}`;
      const apres = d + 1;
      zone.focus();
      zone.setSelectionRange(apres, apres);
      zone.style.height = 'auto';
      zone.style.height = `${zone.scrollHeight}px`;
    } else {
      riche.focus();
      try {
        document.execCommand('insertLineBreak');
      } catch (e) { /* repli : le navigateur garde son comportement */ }
    }
    calerAccessoiresEditeur();
    rafraichirApercuFiche();
  } else if (etat.saisieAttente && etat.saisieAttente.kind === 'correction') {
    // v0.1.41 : Échap abandonne la correction — croquis validé.
    ev.preventDefault();
    fermerEditeur();
  } else {
    ev.preventDefault();
    validerEditeur();
  }
}

$('#editeur-texte').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    validerEditeur();
  } else if (ev.key === 'Enter' && etat.saisieAttente
    && etat.saisieAttente.kind === 'correction') {
    // v0.1.41 : dans la correction en place, ENTRÉE POSE (croquis
    // validé) ; Maj+Entrée garde le retour à la ligne explicite.
    if (!ev.shiftKey) {
      ev.preventDefault();
      validerEditeur();
    }
  } else if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'm' || ev.key === 'M')) {
    // v0.1.11 : insertion d'une formule à la position du curseur.
    ev.preventDefault();
    ouvrirInsertionFormule();
  } else if (ev.key === 'Escape') {
    ev.stopPropagation();
    toucheEchapEditeur(ev);
  }
});
$('#editeur-formule').addEventListener('click', ouvrirInsertionFormule);
$('#editeur-texte').addEventListener('input', () => {
  const zone = $('#editeur-texte');
  zone.style.height = 'auto';
  zone.style.height = `${zone.scrollHeight}px`;
  calerAccessoiresEditeur();
  rafraichirApercuFiche();
});
$('#editeur-riche').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    validerEditeur();
  } else if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'm' || ev.key === 'M')) {
    // v0.1.11/v0.1.31 : insertion d'une formule à la position du curseur.
    ev.preventDefault();
    ouvrirInsertionFormule();
  } else if (ev.key === 'Escape') {
    ev.stopPropagation();
    toucheEchapEditeur(ev);
  }
});
$('#editeur-page').addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') toucheEchapEditeur(ev);
});

/* v0.1.36 : double-clic sur une formule composée du texte riche : elle
 * s'ouvre dans le panneau Équation pour correction (source posée au
 * champ), le bouton devient « Remplacer la formule » ; la correction
 * remplace l'image EN PLACE, la frappe continue dans la note. */
$('#editeur-riche').addEventListener('dblclick', (ev) => {
  const t = ev.target;
  if (!t || !t.closest) return;
  const img = t.closest('img.eq-editeur');
  if (!img || !img.isConnected) return;
  ev.preventDefault();
  const latex = String(img.getAttribute('data-latex') || '');
  const attente = etat.saisieAttente;
  if (!attente) return;
  etat.formuleCible = img;
  etat.formuleFiche = true;
  $('#panneau-equation').hidden = false;
  const b = $('#eq-inserer');
  b.textContent = 'Remplacer la formule';
  b.disabled = false;
  const note = $('#eq-note');
  note.textContent = 'Correction de la formule de la note : ajustez, puis « Remplacer la formule ».';
  note.classList.add('ok');
  if (etat.eqMode !== 'pro') $('#eq-pro').click();
  poserChampEquation(latex);
  focusChampEquation();
  rafraichirApercu();
});
window.addEventListener('keydown', (ev) => {
  // v0.1.21 : le focus peut être dans le panneau Équation pendant la
  // saisie de la note (composition d'une formule) ; Échap y vaut
  // toujours « poser la note », pas « annuler le remplacement ».
  if (ev.key === 'Escape' && !$('#editeur-page').hidden) {
    toucheEchapEditeur(ev);
    return;
  }
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
  // v0.1.24 : en mode Professionnel avec MathLive, l'insertion se fait DANS
  // la zone structurée, à la position du curseur (le geste validé sur la
  // démo) ; le repli reste la chirurgie du champ de toujours.
  if (mathlive && etat.eqMode === 'pro') {
    const mf = champMath();
    try {
      mf.insert(tex, { focus: true });
      rafraichirApercu();
      return;
    } catch (e) { /* repli ci-dessous */ }
  }
  const champ = $('#eq-saisie');
  const debut = champ.selectionStart ?? champ.value.length;
  const fin = champ.selectionEnd ?? debut;
  champ.value = champ.value.slice(0, debut) + tex + champ.value.slice(fin);
  champ.focus();
  champ.selectionStart = champ.selectionEnd = debut + tex.length;
  rafraichirApercu();
}

function latexCourant() {
  const brut = lireChampEquation().trim();
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
  ctx.fillStyle = '#1A1A1A';
  ctx.strokeStyle = '#1A1A1A';
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
    const estRiche = !!(attente && (attente.kind === 'freeText' || attente.kind === 'ficheMelangee'
      || attente.kind === 'noteRiche' || attente.kind === 'correction'));
    if (!estRiche) {
      retablirBoutonEquation();
      message('La saisie n\u2019est plus ouverte : la formule n\u2019a pas été insérée.');
      return;
    }
    const repF = await window.atelier.previewEquation(latex, exPourCorps(FS_FICHE));
    if (repF.erreur || !repF.apercu) {
      message(repF.erreur || 'La formule n\u2019a pas pu être calculée.');
      return;
    }
    const riche = $('#editeur-riche');
    if (!riche.hidden && attente.kind !== 'correction') {
      // v0.1.36 : la formule validée se compose EN DIRECT dans le texte
      // riche (image alignée sur la ligne de base, comme la page la
      // posera) ; le code $...$ n'apparaît plus à l'écran. L'aperçu
      // précalculé (repF) sert tel quel, sans recomposition.
      const fsCorps = (attente.fontSize || etat.options.ecrire.taille || 11) * etat.zoom;
      const img = await composerImageFormule(latex, fsCorps, repF.apercu);
      riche.focus();
      if (img) {
        if (etat.formuleCible && etat.formuleCible.isConnected) {
          // Double-clic sur une formule composée : remplacer sur place.
          const cible = etat.formuleCible;
          etat.formuleCible = null;
          cible.replaceWith(img);
          const b = $('#eq-inserer');
          b.textContent = attente.sujet === 'Note' ? 'Insérer dans la note' : 'Insérer dans la fiche';
          const noteEq = $('#eq-note');
          noteEq.textContent = attente.sujet === 'Note'
            ? 'La formule s\u2019insérera à la position du curseur dans la note.'
            : 'La formule s\u2019insérera à la position du curseur dans la fiche.';
          noteEq.classList.remove('ok');
          rafraichirApercuFiche();
          message('Formule remplacée dans le texte.', 'reussite');
          return;
        }
        const sel = window.getSelection();
        if (sel && sel.rangeCount && riche.contains(sel.anchorNode)) {
          const r = sel.getRangeAt(0);
          r.deleteContents();
          r.insertNode(img);
          r.setStartAfter(img);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        } else {
          riche.appendChild(img);
        }
        rafraichirApercuFiche();
        message('Formule insérée dans le texte.', 'reussite');
        return;
      }
      // Repli intégral (composition impossible) : le code $...$ nu,
      // comportement d'avant la v0.1.36.
      const insere = document.execCommand('insertText', false, `$${latex}$`);
      if (!insere) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const n = document.createTextNode(`$${latex}$`);
          sel.getRangeAt(0).deleteContents();
          sel.getRangeAt(0).insertNode(n);
          sel.getRangeAt(0).setStartAfter(n);
          sel.getRangeAt(0).collapse(true);
        }
      }
      rafraichirApercuFiche();
      message('Formule insérée dans le texte (code visible : composition impossible).', 'reussite');
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
    message(attente.sujet === 'Note' ? 'Formule insérée dans la note.' : 'Formule insérée dans la fiche.', 'reussite');
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
  poserChampEquation(latex); // v0.1.24 : zone structurée ou champ de toujours
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
// v0.1.24 : la zone structurée déclenche le même aperçu ; l'écoute se pose
// d'emblée, avant même que l'élément personnalisé ne soit surclassé.
champMath().addEventListener('input', rafraichirApercu);

/* v0.1.24 : la MONTÉE À LA FRAPPE, le geste signature de OneNote (validé
   sur la démo). En saisie linéaire, la barre d'espace transcode la frappe
   (UnicodeMath -> LaTeX) et monte la formule dans la zone structurée ;
   la frappe continue ensuite dans la structure. */
$('#eq-saisie').addEventListener('keydown', (ev) => {
  if (etat.eqMode !== 'lin' || ev.key !== ' ') return;
  if (!$('#eq-saisie').value.trim()) return; // premier espace : ordinaire
  ev.preventDefault();
  effectuerMontee();
});

async function effectuerMontee() {
  const latex = latexCourant();
  if (!latex) return;
  // La formule doit être calculable AVANT de monter : on la vérifie.
  const rep = await window.atelier.previewEquation(latex, etat.eqExPt);
  if (rep.erreur) {
    const err = $('#eq-erreur');
    err.textContent = rep.erreur;
    err.hidden = false;
    return;
  }
  $('#eq-erreur').hidden = true;
  if (mathlive) $('#eq-pro').click(); // monte : la saisie devient la zone
  rafraichirApercu();
}

for (const [id, mode] of [['#eq-pro', 'pro'], ['#eq-lin', 'lin']]) {
  $(id).addEventListener('click', () => {
    // v0.1.24 : le CONTENU suit la bascule — la zone structurée reçoit le
    // LaTeX (monté si l'on venait du Linéaire), le champ de toujours le
    // conserve sinon ; plus jamais de formule perdue en route.
    const latAvant = latexCourant();
    etat.eqMode = mode;
    $('#eq-pro').classList.toggle('actif', mode === 'pro');
    $('#eq-lin').classList.toggle('actif', mode === 'lin');
    $('#eq-libelle').textContent = mode === 'pro'
      ? (mathlive ? 'Zone d\u2019équation, corrigez sur place' : 'LaTeX')
      : 'Saisie linéaire (Espace pour monter)';
    $('#eq-saisie').placeholder = mode === 'pro'
      ? 'Ex. : x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'
      : 'Ex. : a/b puis Espace — \\sqrt(5&a^2) — \\int_0^1 x\\dd x';
    majVisibiliteChamps();
    if (mode === 'pro' && mathlive) champMath().value = latAvant;
    else if (mode === 'lin') $('#eq-saisie').value = latAvant;
    focusChampEquation();
    rafraichirApercu();
  });
}

/* ============================================================
   Fenêtres guidées « à la Dmaths » (v0.1.5)
   Gabarits et composition : engine/guides.js (testé sous Node).
   ============================================================ */
const { PREFIXE_EQUATION, extraireLatexEquation } = globalThis.AtelierLatex;
const { PREFIXE_FICHE_MIXTE, extraireSourceFiche, translitterMathWinAnsi,
  decouperMelange, contientFormule, exPourCorps, composerLignes,
  PREFIXE_CORRECTION, extraireSourceCorrection, extraireTailleCorrection,
  extraireFamilleCorrection, extraireGrasCorrection,
  PREFIXE_NOTE_RICHE, extraireSourceNoteRiche, extraireTailleNoteRiche } = globalThis.AtelierTexte;
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

/* v0.1.9 : fenêtre matrice — après validation des dimensions, les deux
   cases de réglage sont remplacées par la grille des cellules (v0.1.24 :
   jusqu'à 6 lignes et colonnes, la parité OneNote du ruban). */
function validerDimensionsMatrice() {
  const l = Math.min(6, Math.max(1, parseInt(valeursGuide.lignes, 10) || 2));
  const c = Math.min(6, Math.max(1, parseInt(valeursGuide.colonnes, 10) || 2));
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
  // v0.1.21 : Échap ferme la fenêtre guidée SEULE — il ne pose pas la
  // note en dessous : la composition de la formule poursuit son cours.
  if (ev.key === 'Escape') {
    ev.stopPropagation();
    fermerGuide();
  }
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
    : (outil === 'surligner' || outil === 'encadrer' || outil === 'ecrire'
      || outil === 'modifier') ? 'texte'
      : outil === 'equation' ? 'viseur'
        : outil === 'main' ? 'main'
          : outil === 'texte' ? 'texte'
            : 'defaut';
  corps.dataset.curseur = curseur;
  // v0.1.13 : le calque de texte ne devient visible et cliquable qu'à
  // l'outil Texte ; ailleurs, il laisserait le tampon passer.
  els.conteneur.classList.toggle('outil-texte', outil === 'texte');
  els.calqueTexte.hidden = outil !== 'texte';
  majRecoVue(); // v0.1.29 : les blocs reconnus ne répondent qu'à la Sélection
  fermerBarreSelection();
  $('#panneau-equation').hidden = outil !== 'equation';
  // v0.1.31 : le panneau d'options suit l'outil (croquis validé) :
  // Surligner, Encadrer et Écrire ont leurs commandes ; les autres
  // outils n'en ont pas et le panneau se range.
  const sectionsOptions = {
    surligner: 'pan-opt-surligner', encadrer: 'pan-opt-encadrer', ecrire: 'pan-opt-ecrire',
  };
  $('#panneau-options').hidden = !sectionsOptions[outil];
  if (sectionsOptions[outil]) {
    Object.values(sectionsOptions).forEach((id) => {
      $(`#${id}`).hidden = id !== sectionsOptions[outil];
    });
  }
  const notes = {
    main: 'Faites glisser la page pour la faire défiler.',
    aucun: 'Cliquez une annotation : glissez-la pour la déplacer, tirez une poignée pour la redimensionner (Suppr pour retirer).',
    texte: 'Faites glisser sur le texte du document, puis Surligner ou Copier.',
    surligner: 'Glissez sur une ligne de texte : le surlignage prend la forme et la couleur choisies.',
    encadrer: 'Glissez pour tracer le cadre : il prend la forme, le trait, l\u2019épaisseur et la couleur choisies.',
    encre: 'Tracez à main levée.',
    ecrire: 'Machine à écrire : cliquez pour écrire à cet endroit, ou glissez pour tracer la zone ; gras, couleurs, listes et formules au panneau de droite.',
    modifier: 'Modifier : cliquez dans une phrase du document — elle s\u2019ouvre sur place, teinte légère, curseur au point cliqué. Tapez, supprimez, complétez ; Entrée pose, Échap abandonne. Une correction posée se reprend par un nouveau clic.',
    equation: 'Cliquez le point d\'insertion sur la page.',
  };
  message(notes[outil] || 'Prêt.');
  // v0.1.22 : armer l'outil Texte sur une page scannée sans texte, jamais
  // encore reconnue, lance la reconnaissance — quelques secondes, puis
  // la page devient sélectionnable. Rien n'est lancé sur les pages qui
  // ont déjà leur texte, ni tant que l'utilisateur n'a pas demandé.
  if (outil === 'texte' && etat.resume && pageMuette
      && !motsOcrPages.has(etat.page) && !ocrEnCours && etat.pdfjs) {
    message('Page scannée sans texte : reconnaissance en cours (quelques secondes)…');
    etat.pdfjs.getPage(etat.page).then((p) => lancerOcrPage(p)).catch(() => {});
  }
}

document.querySelectorAll('.outil').forEach((b) => {
  b.addEventListener('click', () => choisirOutil(b.dataset.outil));
});

/* ============================================================
   v0.1.31 : Panneau d'options de l'outil actif (croquis validé) —
   formes et couleurs du surlignage, formes, traits, épaisseurs et
   teinte des cadres, tailles et mise en forme de l'écriture. Chaque
   palette porte sa pastille de couleur personnalisée, ouverte au
   cercle chromatique (teinte à la roue, clarté au curseur).
   ============================================================ */
const COULEURS_SURLIGNER = ['#FFDF3A', '#FFA53A', '#FF7A6B', '#FF7AD9', '#7BE37B', '#7BC8FF', '#B39CFF', '#7BE3D0'];
const COULEURS_ENCADER = ['#1A1A1A', '#7A7A7A', '#D13438', '#CA5010', '#107C10', '#0067C0', '#8764B8'];
const TAILLES_ECRITURE = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];
const EPAISSEURS_CADRE = { fin: 1.3, moyen: 2.2, epais: 3.4 };
const { hsvVersRgb, hexVersRgb01 } = globalThis.AtelierCouleurs;

function hsvVersHex(h, s, v) {
  const [r, g, b] = hsvVersRgb(h, s, v);
  return `#${[r, g, b].map((x) => `0${x.toString(16)}`.slice(-2)).join('')}`;
}

function choisirOpt(cont, b) {
  cont.querySelectorAll('.opt').forEach((x) => x.classList.remove('actif'));
  b.classList.add('actif');
}

/* Cercle chromatique : une roue dessinée au pixel, la clarté au curseur.
   Une seule roue à la fois, sous la palette qui l'a demandée. */
let roueChromatique = null;
function dessinerRoue(cv, v) {
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(148, 148);
  const d = img.data;
  const R = 74;
  let i = 0;
  for (let y = 0; y < 148; y += 1) {
    for (let x = 0; x < 148; x += 1) {
      const dx = x - 74 + 0.5;
      const dy = y - 74 + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const a = Math.max(0, Math.min(1, (R - dist) / 1.5));
      if (a > 0) {
        const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const rgb = hsvVersRgb(h, Math.min(1, dist / R), v);
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
        d[i + 3] = Math.round(a * 255);
      } else {
        d[i + 3] = 0;
      }
      i += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function creerRoue() {
  const boite = document.createElement('div');
  boite.className = 'sel-coul';
  const cv = document.createElement('canvas');
  cv.width = 148; cv.height = 148;
  cv.className = 'roue';
  const ligne1 = document.createElement('div');
  ligne1.className = 'sel-ligne';
  const lab = document.createElement('span');
  lab.textContent = 'Clarté';
  const lum = document.createElement('input');
  lum.type = 'range'; lum.min = '10'; lum.max = '100'; lum.value = '90';
  ligne1.appendChild(lab); ligne1.appendChild(lum);
  const ligne2 = document.createElement('div');
  ligne2.className = 'sel-ligne';
  const apercu = document.createElement('span');
  apercu.className = 'apercu-coul';
  const hex = document.createElement('span');
  hex.className = 'sel-hex';
  ligne2.appendChild(apercu); ligne2.appendChild(hex);
  boite.appendChild(cv); boite.appendChild(ligne1); boite.appendChild(ligne2);
  const pos = { h: 40, s: 0.85, v: 0.9 };
  dessinerRoue(cv, pos.v);
  function maj() {
    const coul = hsvVersHex(pos.h, pos.s, pos.v);
    apercu.style.background = coul;
    hex.textContent = coul;
    if (boite._surChoix) boite._surChoix(coul);
  }
  function depuis(e) {
    const r = cv.getBoundingClientRect();
    const k = 148 / (r.width || 1);
    const dx = (e.clientX - r.left) * k - 74;
    const dy = (e.clientY - r.top) * k - 74;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 74) dist = 74;
    pos.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    pos.s = Math.min(1, dist / 74);
    maj();
  }
  let actif = false;
  cv.addEventListener('pointerdown', (e) => {
    actif = true;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* capture absente */ }
    depuis(e);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => { if (actif) depuis(e); });
  cv.addEventListener('pointerup', () => { actif = false; });
  cv.addEventListener('pointercancel', () => { actif = false; });
  lum.addEventListener('input', () => {
    pos.v = lum.value / 100;
    dessinerRoue(cv, pos.v);
    maj();
  });
  maj();
  return boite;
}

function montrerRoue(cont, surChoix) {
  if (!roueChromatique) roueChromatique = creerRoue();
  if (roueChromatique._cible === cont) { roueChromatique.remove(); roueChromatique._cible = null; return; }
  roueChromatique._surChoix = surChoix;
  roueChromatique._cible = cont;
  cont.parentElement.insertBefore(roueChromatique, cont.nextSibling);
}

/** Peuple une palette : pastilles cliquables, pastille personnalisée et
 * bouton du cercle chromatique. surChoix(hex) reçoit la couleur choisie. */
function peuplerSw(id, couleurs, actuelle, surChoix) {
  const cont = $(`#${id}`);
  couleurs.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sw'; b.dataset.coul = c;
    b.style.backgroundColor = c;
    b.title = c;
    if (actuelle && c.toLowerCase() === actuelle.toLowerCase()) b.classList.add('actif');
    b.addEventListener('mousedown', (e) => e.preventDefault()); // garder la sélection
    b.addEventListener('click', () => {
      cont.querySelectorAll('.sw').forEach((x) => x.classList.remove('actif'));
      b.classList.add('actif');
      surChoix(c);
    });
    cont.appendChild(b);
  });
  const perso = document.createElement('button');
  perso.type = 'button'; perso.className = 'sw perso';
  perso.title = 'Couleur personnalisée (cercle chromatique)';
  cont.appendChild(perso);
  function choisirPerso(coul) {
    cont.dataset.perso = coul;
    perso.style.background = coul;
    cont.querySelectorAll('.sw').forEach((x) => x.classList.remove('actif'));
    perso.classList.add('actif');
    surChoix(coul);
  }
  perso.addEventListener('click', () => {
    if (cont.dataset.perso) choisirPerso(cont.dataset.perso);
    else montrerRoue(cont, choisirPerso);
  });
  const boutonRoue = document.createElement('button');
  boutonRoue.type = 'button'; boutonRoue.className = 'opt';
  boutonRoue.style.width = '100%';
  boutonRoue.style.marginTop = '6px';
  boutonRoue.textContent = 'Cercle chromatique';
  boutonRoue.addEventListener('click', () => montrerRoue(cont, choisirPerso));
  cont.appendChild(boutonRoue);
  return { choisirPerso };
}

/* Surligner : la forme choisie voyage avec chaque pose. */
document.querySelectorAll('#pan-opt-surligner [data-forme]').forEach((b) => {
  b.addEventListener('click', () => {
    choisirOpt(b.parentElement, b);
    etat.options.surligner.forme = b.dataset.forme;
  });
});
peuplerSw('sw-surligner', COULEURS_SURLIGNER, etat.options.surligner.couleur,
  (c) => { etat.options.surligner.couleur = c; });

/* Encadrer : formes, traits, épaisseurs et remplissage, aperçus SVG
   dessinés comme dans le croquis validé (rectangles, ellipse, nuage). */
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function nuagePasD(x, y, w, h, pas) {
  let d = `M ${x} ${y}`;
  const nx = Math.max(2, Math.round(w / pas));
  const ny = Math.max(2, Math.round(h / pas));
  let r;
  for (let i = 0; i < nx; i += 1) {
    r = (w / nx) / 2 + 1;
    d += ` A ${r} ${r} 0 0 1 ${x + w * (i + 1) / nx} ${y}`;
  }
  for (let i = 0; i < ny; i += 1) {
    r = (h / ny) / 2 + 1;
    d += ` A ${r} ${r} 0 0 1 ${x + w} ${y + h * (i + 1) / ny}`;
  }
  for (let i = 0; i < nx; i += 1) {
    r = (w / nx) / 2 + 1;
    d += ` A ${r} ${r} 0 0 1 ${x + w - w * (i + 1) / nx} ${y + h}`;
  }
  for (let i = 0; i < ny; i += 1) {
    r = (h / ny) / 2 + 1;
    d += ` A ${r} ${r} 0 0 1 ${x} ${y + h - h * (i + 1) / ny}`;
  }
  return `${d} Z`;
}
function miniCadre(forme) {
  const s = svgEl('svg', { width: 38, height: 22, viewBox: '0 0 38 22' });
  const attrs = { fill: 'none', stroke: '#575757', 'stroke-width': 1.4 };
  if (forme === 'ellipse') {
    s.appendChild(svgEl('ellipse', { cx: 19, cy: 11, rx: 16, ry: 8.5, ...attrs }));
  } else if (forme === 'nuage') {
    s.appendChild(svgEl('path', { d: nuagePasD(4, 4, 30, 14, 8), ...attrs }));
  } else if (forme === 'arrondi') {
    s.appendChild(svgEl('rect', { x: 2, y: 2, width: 34, height: 18, rx: 6, ...attrs }));
  } else {
    s.appendChild(svgEl('rect', { x: 2, y: 2, width: 34, height: 18, ...attrs }));
  }
  return s;
}
(function construireOptionsCadre() {
  const formes = [
    { id: 'rect', nom: 'Rectangle' }, { id: 'arrondi', nom: 'Arrondi' },
    { id: 'ellipse', nom: 'Ellipse' }, { id: 'nuage', nom: 'Nuage' },
  ];
  const contFormes = $('#opt-formes-cadre');
  formes.forEach((f, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `opt${i === 0 ? ' actif' : ''}`;
    b.dataset.forme = f.id;
    b.title = f.nom;
    b.appendChild(miniCadre(f.id));
    b.appendChild(document.createTextNode(` ${f.nom}`));
    b.addEventListener('click', () => {
      choisirOpt(contFormes, b);
      etat.options.encadrer.forme = f.id;
    });
    contFormes.appendChild(b);
  });
  const contTrait = $('#opt-trait-cadre');
  [['continu', 'Continu'], ['tirets', 'Tirets'], ['points', 'Pointillés']].forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `opt${i === 0 ? ' actif' : ''}`;
    b.dataset.trait = p[0];
    const s = svgEl('svg', { width: 34, height: 10, viewBox: '0 0 34 10' });
    const l = svgEl('line', {
      x1: 1, y1: 5, x2: 33, y2: 5, stroke: '#575757',
      'stroke-width': 1.6, 'stroke-linecap': 'round',
    });
    if (p[0] === 'tirets') l.setAttribute('stroke-dasharray', '5 4');
    if (p[0] === 'points') {
      l.setAttribute('stroke-dasharray', '0.2 4.5');
      l.setAttribute('stroke-width', 2.4);
    }
    s.appendChild(l);
    b.appendChild(s);
    b.appendChild(document.createTextNode(` ${p[1]}`));
    b.addEventListener('click', () => {
      choisirOpt(contTrait, b);
      etat.options.encadrer.trait = p[0];
    });
    contTrait.appendChild(b);
  });
  const contEp = $('#opt-ep-cadre');
  [['fin', 'Fin'], ['moyen', 'Moyen'], ['epais', 'Épais']].forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `opt${p[0] === 'moyen' ? ' actif' : ''}`;
    b.dataset.ep = p[0];
    const s = svgEl('svg', { width: 30, height: 12, viewBox: '0 0 30 12' });
    s.appendChild(svgEl('line', {
      x1: 1, y1: 6, x2: 29, y2: 6, stroke: '#575757',
      'stroke-width': EPAISSEURS_CADRE[p[0]], 'stroke-linecap': 'round',
    }));
    b.appendChild(s);
    b.appendChild(document.createTextNode(` ${p[1]}`));
    b.addEventListener('click', () => {
      choisirOpt(contEp, b);
      etat.options.encadrer.ep = p[0];
    });
    contEp.appendChild(b);
  });
  const contRempl = $('#opt-remplissage-cadre');
  [['transparent', 'Transparent', false], ['teinte', 'Teinté', true]].forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `opt${i === 0 ? ' actif' : ''}`;
    b.dataset.remplissage = p[0];
    b.appendChild(document.createTextNode(p[1]));
    b.addEventListener('click', () => {
      choisirOpt(contRempl, b);
      etat.options.encadrer.teinte = p[2];
    });
    contRempl.appendChild(b);
  });
})();
peuplerSw('sw-encadrer', COULEURS_ENCADER, etat.options.encadrer.couleur,
  (c) => { etat.options.encadrer.couleur = c; });

/* Écrire : le stepper de taille règle l'éditeur OUVERT (et la future
   pose) ; les boutons de mise en forme s'appliquent à la sélection de
   l'éditeur riche, ou arment le style de la prochaine saisie. */
function majTailleVal() {
  $('#taille-val').textContent = `${etat.options.ecrire.taille} pt`;
}
function changerTailleEcriture(sens) {
  const i = TAILLES_ECRITURE.indexOf(etat.options.ecrire.taille);
  if (i < 0) return;
  const j = Math.max(0, Math.min(TAILLES_ECRITURE.length - 1, i + sens));
  etat.options.ecrire.taille = TAILLES_ECRITURE[j];
  majTailleVal();
  const riche = $('#editeur-riche');
  // Comme le marqueur « Note riche taille : », la note n'a QU'UN corps :
  // le stepper règle l'éditeur entier (la maquette fait de même) ; les
  // exposants et indices gardent leur facteur propre à la pose.
  if (!riche.hidden) {
    riche.style.fontSize = `${etat.options.ecrire.taille * etat.zoom}px`;
    riche.style.lineHeight = `${Math.round(etat.options.ecrire.taille * 1.3 * etat.zoom)}px`;
    calerAccessoiresEditeur();
  }
}
$('#taille-moins').addEventListener('mousedown', (e) => e.preventDefault());
$('#taille-plus').addEventListener('mousedown', (e) => e.preventDefault());
$('#taille-moins').addEventListener('click', () => changerTailleEcriture(-1));
$('#taille-plus').addEventListener('click', () => changerTailleEcriture(1));


const CMDS_RICHE = {
  gras: 'bold', italique: 'italic', souligne: 'underline', barre: 'strikeThrough',
  exposant: 'superscript', indice: 'subscript',
};
document.querySelectorAll('#pan-opt-ecrire [data-style]').forEach((b) => {
  b.addEventListener('mousedown', (e) => e.preventDefault()); // garder la sélection
  b.addEventListener('click', () => {
    const riche = $('#editeur-riche');
    if (riche.hidden) {
      // v0.1.40 : l'armement est VRAI — l'état est relu à l'ouverture de
      // la prochaine note (comme dans la maquette validée, où cliquer
      // Gras puis écrire produit du gras).
      const cle = b.dataset.style;
      if (etat.options.ecrire.styles[cle]) {
        delete etat.options.ecrire.styles[cle];
        b.classList.remove('actif');
      } else {
        etat.options.ecrire.styles[cle] = true;
        b.classList.add('actif');
      }
      return;
    }
    riche.focus();
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(CMDS_RICHE[b.dataset.style], false, null);
    } catch (e) { /* navigateur sans execCommand : la pose reste texte */ }
  });
});
const CMDS_ALIGN = { gauche: 'justifyLeft', centre: 'justifyCenter', droite: 'justifyRight' };
document.querySelectorAll('#pan-opt-ecrire [data-align]').forEach((b) => {
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    const riche = $('#editeur-riche');
    if (riche.hidden) return;
    riche.focus();
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(CMDS_ALIGN[b.dataset.align], false, null);
    } catch (e) { /* idem */ }
  });
});
const CMDS_LISTES = { puces: 'insertUnorderedList', numeros: 'insertOrderedList' };
document.querySelectorAll('#pan-opt-ecrire [data-liste]').forEach((b) => {
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => {
    const riche = $('#editeur-riche');
    if (riche.hidden) return;
    riche.focus();
    try {
      document.execCommand(CMDS_LISTES[b.dataset.liste], false, null);
    } catch (e) { /* idem */ }
  });
});
peuplerSw('sw-fond', COULEURS_SURLIGNER, null, (c) => {
  const riche = $('#editeur-riche');
  if (riche.hidden) return;
  riche.focus();
  try {
    document.execCommand('styleWithCSS', false, true);
    const v = hexVersRgb01(c);
    document.execCommand('hiliteColor', false,
      `rgba(${Math.round(v[0] * 255)}, ${Math.round(v[1] * 255)}, ${Math.round(v[2] * 255)}, 0.6)`);
  } catch (e) { /* idem */ }
});
/* v0.1.40 : la palette « Couleur du texte » est ENFIN branchée — la
   maquette validée la prévoyait, la v0.1.31 l'a livrée vide : la
   section existait dans le panneau mais aucune pastille n'y était
   jamais ajoutée et aucun geste ne colorait le texte. La couleur
   s'applique à la sélection de l'éditeur ouvert (foreColor en span de
   style, le sérialiseur et le moteur le posent tel quel dans le
   fichier) ; sans éditeur ouvert, elle s'ARME pour la prochaine note. */
peuplerSw('sw-ecrire', COULEURS_ENCADER, etat.options.ecrire.couleur, (c) => {
  etat.options.ecrire.couleur = c;
  const riche = $('#editeur-riche');
  if (riche.hidden) return; // armée : appliquée au départ de la prochaine note
  riche.focus();
  try {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, c);
  } catch (e) { /* navigateur sans execCommand : la pose reste texte */ }
});
majTailleVal();

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
  if (cmd.nom === 'fermer') { if (etat.idOnglet != null) fermerOnglet(etat.idOnglet); } // v0.1.30
  if (cmd.nom === 'annuler') annulerGeste();      // v0.1.13 : menu Édition
  if (cmd.nom === 'retablir') retablirGeste();
  if (cmd.nom === 'oter-surlignages') oterSurlignagesPage(); // v0.1.35 : Édition
  if (cmd.nom === 'cle-api' || cmd.nom === 'options-ocr') ouvrirOptionsOcr();   // v0.1.22/v0.1.23 : Fichier → Options OCR LaTeX
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
  // v0.1.30 : la pastille d'onglet suit l'enregistrement (la copie horodatée
  // écrit un NOUVEAU fichier : l'onglet garde son chemin, la version d'origine
  // reste ouverte telle quelle — comportement inchangé depuis l'origine).
  const tab = ongletsOuverts.get(etat.idOnglet);
  if (tab && mode !== 'timestamped') tab.modifie = false;
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
  `Onglets ouverts : ${ongletsOuverts.size || 'aucun'}${etat.idOnglet != null ? ` (actif : ${nomCourt(etat.chemin)})` : ''}`,
  `Page affichée : ${etat.resume ? `${etat.page} / ${etat.resume.pageCount}` : '–'}`,
  `Zoom : ${Math.round(etat.zoom * 100)} % (rendu en cours : ${gesteZoomActif() ? 'transformation CSS en attendant le rendu net' : 'posé'})`,
  `Zone d\u2019équation : ${mathlive ? 'structurée (MathLive chargé)' : `champ LaTeX${erreurMathlive ? ` (MathLive manquant : ${erreurMathlive})` : ''}`}`,
  `Dernier échec d'affichage : ${erreurRendu || 'aucun'}`,
  `Annotations connues : ${etat.resume ? etat.resume.annots.length : 0}`,
  `Reconnaissance des scans : ${tesseractModule ? 'moteur chargé' : 'moteur non chargé (le sera au premier besoin)'}, pages reconnues : ${motsOcrPages.size === 0 ? 'aucune' : [...motsOcrPages.keys()].sort((a, b) => a - b).join(', ')}`,
  `Reconnaissance du document (serveur OCR) : ${recoDocument.pages.size === 0 ? 'aucune page reconnue' : [...recoDocument.pages.keys()].sort((a, b) => a - b).join(', ')}${recoDocument.pageEnCours ? ` (page en vol : ${recoDocument.pageEnCours})` : ''}`,
  `Dernier échec de reconnaissance : ${erreurOcr || erreurTesseract || 'aucun'}`,
].join('\n');

(async function init() {
  // v0.1.37 : les options OCR MÉMORISÉES sont relues AU DÉMARRAGE, en
  // PREMIER. Sans cela, optionsOcrEtat restait au mode « mistral » de sa
  // déclaration tant que la carte des options n'était pas ouverte : la
  // reconnaissance du document ne partait jamais à l'ouverture et le
  // bouton Reco demeurait grisé même avec un serveur personnel
  // correctement réglé (retour d'Arthur — « je ne peux plus cocher la
  // case scan »).
  try {
    const etatOptions = await window.atelier.optionsOcr();
    if (etatOptions) optionsOcrEtat = etatOptions;
  } catch { /* sans état lisible, le mode mistral par défaut tient lieu */ }
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
  // v0.1.24 : la zone d'équation structurée se charge en parallèle ; si
  // elle échoue, le champ LaTeX de toujours prend le relais (message en
  // barre d'état + Diagnostics).
  chargerMathlive();
  $('#version-etat').textContent = `Atelier PDF ${await window.atelier.version()}`;
})();
