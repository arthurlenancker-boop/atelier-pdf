// engine/riche.js — v0.1.31 : la note riche « texte mis en forme + formules ».
// /FreeText dont l'/AP compose paragraphes, alignements, listes (puces et
// numéros), gras, italique, souligné, barré, exposant, indice, couleurs de
// texte et de fond, à la taille enregistrée, avec les formules $...$ rendues
// par MathJax en XObjects alignées sur la ligne de base. La SOURCE canonique
// (sous-ensemble HTML, formules comprises) voyage dans /Contents derrière le
// marqueur « Note riche [taille] : » (engine/texte.js) : la relecture au
// double-clic est fidèle, comme celle des fiches mixtes. Exige pdf-lib +
// mathjax-full (tests en CI uniquement).
// v0.1.44 : la COULEUR des formules suit leur run — la formule composée
// dans un span coloré est rendue DANS cette couleur (données nécessaires
// aux équations à la frappe, maquette validée) ; sans couleur de run,
// l'encre du corps reste, comme avant.
'use strict';

const { PDFName, StandardFonts } = require('pdf-lib');
const { makeForm, addAnnot, normalizeRect, octetsWinAnsi, sanitizeWinAnsi } = require('./annotcore.js');
const { mjRender } = require('./mjrender.js');
const {
  PREFIXE_NOTE_RICHE, translitterMathWinAnsi, exPourCorps,
} = require('./texte.js');
const {
  analyserSource, composerLignesRiche, FACTEUR_EXPOSANT,
} = require('./markup.js');

const fmt = (v) => String(Math.round(v * 100) / 100);
const { hexVersRgb01 } = require('./couleurs.js');

/** Encre par défaut du texte nu (croquis validé : #14161c). */
const ENCRE_DEFAUT = [0.078, 0.086, 0.098];
const MARGE = 2;
const MARGE_VERTICALE = 3;
const INTERBASE = 0.45; // × fontSize entre deux lignes

const POLICES = [
  { cle: 'F1', nom: StandardFonts.Helvetica, gras: false, italique: false },
  { cle: 'F2', nom: StandardFonts.HelveticaBold, gras: true, italique: false },
  { cle: 'F3', nom: StandardFonts.HelveticaOblique, gras: false, italique: true },
  { cle: 'F4', nom: StandardFonts.HelveticaBoldOblique, gras: true, italique: true },
];

/** Couleur d'un run : sa couleur, sinon l'encre du corps. */
function couleurRun(styles, defaut) {
  const c = styles && styles.couleur ? hexVersRgb01(styles.couleur) : null;
  return c || defaut;
}

/**
 * Pose une note riche : texte mis en forme (b, i, u, s, sup, sub, couleurs,
 * alignements, listes) et formules $...$, composées dans /AP.
 * @param {object} p
 * @param {number[]} p.rect      zone posée [x0, y0bas, x1, y1haut]
 * @param {string}   p.source    mise en forme canonique (markup.js)
 * @param {number}  [p.fontSize=11]
 * @param {string}  [p.sujet='Note'] « Note » (posée à même la page) ou
 *        « Fiche » (glissée en zone) : /Subject, lu par l'écran.
 * @returns {Promise<{ref: PDFRef, rect: number[]}>} rectangle RÉALISÉ (le
 *          bas descend si le contenu dépasse la zone ; le haut reste fixe).
 */
async function addNoteRiche(doc, page, { rect, source, fontSize = 11, couleur = null, sujet = 'Note' }) {
  const src = String(source ?? '');
  if (!src.trim()) {
    throw new Error('Une note riche ne peut pas être vide.');
  }
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const fs = Number(fontSize) > 0 ? fontSize : 11;
  const encre = (typeof couleur === 'string' ? hexVersRgb01(couleur) : null) || ENCRE_DEFAUT;
  const largeurTexte = (x1 - x0) - 2 * MARGE;

  // Les blocs et la composition viennent du moteur PUR partagé avec
  // l'écran (engine/markup.js) : les deux rendus restent identiques.
  const blocs = analyserSource(src);
  // Polices embarquées : seulement celles que le texte emploie.
  const besoins = new Set(['F1']);
  for (const b of blocs) {
    for (const r of b.runs) {
      if (r.type !== 'texte') continue;
      if (r.styles.gras && r.styles.italique) besoins.add('F4');
      else if (r.styles.gras) besoins.add('F2');
      else if (r.styles.italique) besoins.add('F3');
    }
  }
  const polices = new Map();
  for (const p of POLICES) {
    if (besoins.has(p.cle)) polices.set(p.cle, await doc.embedFont(p.nom));
  }

  // Formules MathJax une fois par (formule, couleur) distincte, au corps
  // du texte. v0.1.44 : la formule suit la COULEUR de SON run (« les
  // données nécessaires pour les couleurs ») — une même formule posée
  // en deux couleurs compose deux apparences.
  const rendus = new Map();
  const renduPour = (latex, coulHex) => {
    const cle = coulHex ? `${latex}|${coulHex}` : latex;
    if (!rendus.has(cle)) {
      const encreFormule = coulHex ? (hexVersRgb01(coulHex) || encre) : encre;
      rendus.set(cle, mjRender(latex, exPourCorps(fs), { rgb: encreFormule }));
    }
    return rendus.get(cle);
  };
  const dimsFormule = (latex) => {
    // la métrique est identique quelle que soit l'encre : la première
    // variante rendue suffit (rendu neutre si la formule n'est pas
    // encore composée pour sa couleur).
    const r = rendus.get(latex) || renduPour(latex, null);
    return { widthPt: r.widthPt, heightPt: r.heightPt, depthPt: r.depthPt };
  };

  const tailleMorc = (styles) => (styles && (styles.sup || styles.sub) ? fs * FACTEUR_EXPOSANT : fs);
  const mesure = (styles, texte) => {
    const police = polices.get(styles && styles.gras && styles.italique ? 'F4'
      : styles && styles.gras ? 'F2'
        : styles && styles.italique ? 'F3' : 'F1');
    // Liste des morceaux composés : mesurés comme la fiche mixte, sur le
    // texte AFFICHÉ (v0.1.39) : pdf-lib rejette tout caractère hors
    // WinAnsi, la mesure du texte brut pouvait faire échouer toute la note.
    return police.widthOfTextAtSize(
      sanitizeWinAnsi(translitterMathWinAnsi(String(texte).replace(/[\n\r]+/g, ' '))),
      tailleMorc(styles),
    );
  };

  const layout = composerLignesRiche(blocs, {
    mesurer: mesure, dimsFormule,
    largeurMax: largeurTexte, fontSize: fs,
  });
  const lignes = layout.lignes;
  const retraitListe = layout.retraitListe;

  // Lignes de base : le sommet utile reste y1 ; le bas descend si besoin.
  const interbase = INTERBASE * fs;
  const baselines = [];
  let curseur = y1 - MARGE_VERTICALE;
  let sommeHauteurs = 0;
  for (const ligne of lignes) {
    baselines.push(curseur - ligne.hDessus);
    curseur -= ligne.hDessus + ligne.hDes + interbase;
    sommeHauteurs += ligne.hDessus + ligne.hDes;
  }
  const hauteurTotale = 2 * MARGE_VERTICALE + sommeHauteurs + interbase * Math.max(0, lignes.length - 1);
  const yBas = Math.min(y0, y1 - hauteurTotale);

  // Composition du flux d'apparence.
  const ops = [];
  const formes = new Map(); // latex -> { nom, ref }
  let iForm = 0;
  const aDesFonds = lignes.some((l) => l.morceaux.some((m) => m.type === 'texte' && m.styles.fond));

  for (let li = 0; li < lignes.length; li += 1) {
    const ligne = lignes[li];
    if (ligne.vide) continue;
    // Alignement : décalage de la ligne dans la zone de texte.
    const wLigne = ligne.morceaux.reduce((t, m) => t + m.largeur, 0);
    const utile = ligne.type === 'p' ? largeurTexte : largeurTexte - retraitListe;
    const decal = ligne.align === 'centre' ? (utile - wLigne) / 2
      : ligne.align === 'droite' ? (utile - wLigne) : 0;
    const debutX = x0 + MARGE + (ligne.type === 'p' ? 0 : retraitListe) + Math.max(0, decal);
    // Puce ou numéro : posé dans le retrait, sur la première ligne du bloc.
    if (ligne.type !== 'p' && ligne.debutBloc) {
      const etiquette = ligne.type === 'puce' ? '\u2022' : `${ligne.numero}.`;
      ops.push('BT',
        `/F1 ${fmt(fs)} Tf`,
        `${fmt(encre[0])} ${fmt(encre[1])} ${fmt(encre[2])} rg`,
        `1 0 0 1 ${fmt(x0 + MARGE + retraitListe - 10)} ${fmt(baselines[li] - fs * 0.05)} Tm`,
        `<${hex(etiquette)}> Tj`, 'ET');
    }
    // Fonds d'abord : rectangles derrière le texte, semi-transparents.
    if (aDesFonds) {
      for (const m of ligne.morceaux) {
        if (m.type !== 'texte' || !m.styles.fond) continue;
        const fc = hexVersRgb01(m.styles.fond);
        ops.push('/Gf gs',
          `${fmt(fc[0])} ${fmt(fc[1])} ${fmt(fc[2])} rg`,
          `${fmt(debutXLigne(ligne, m))} ${fmt(baselines[li] - tailleMorc(m.styles) * 0.25)} ${fmt(m.largeur)} ${fmt(fs * 0.95)} re f`);
        ops.push('/G1 gs');
      }
    }
    let penX = debutX;
    for (const m of ligne.morceaux) {
      if (m.type === 'formule') {
        // v0.1.44 : la formule compose dans l'encre de SON run — la
        // clé du rendu et du XObject porte la couleur.
        const coulFormule = (m.styles && m.styles.couleur) ? m.styles.couleur : null;
        const cleFormule = coulFormule ? `${m.valeur}|${coulFormule}` : m.valeur;
        const r = renduPour(m.valeur, coulFormule);
        let f = formes.get(cleFormule);
        if (!f) {
          iForm += 1;
          f = {
            nom: `Fx${iForm}`,
            ref: doc.context.register(makeForm(doc.context, {
              bbox: [0, 0, r.widthPt, r.heightPt],
              resources: { ProcSet: doc.context.obj([PDFName.of('PDF')]) },
              content: r.ops,
            })),
          };
          formes.set(cleFormule, f);
        }
        ops.push('q',
          `1 0 0 1 ${fmt(penX)} ${fmt(baselines[li] - r.depthPt)} cm`,
          `/${f.nom} Do`, 'Q');
        penX += m.largeur;
        continue;
      }
      const affiche = translitterMathWinAnsi(m.texte);
      if (affiche) {
        const c = couleurRun(m.styles, encre);
        const cle = m.styles.gras && m.styles.italique ? 'F4' : m.styles.gras ? 'F2' : m.styles.italique ? 'F3' : 'F1';
        const taille = tailleMorc(m.styles);
        // Exposant / indice : la ligne de base bouge, la taille réduit.
        let base = baselines[li];
        if (m.styles.sup) base += fs * 0.35;
        if (m.styles.sub) base -= fs * 0.12;
        ops.push('BT',
          `/${cle} ${fmt(taille)} Tf`,
          `${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])} rg`,
          `1 0 0 1 ${fmt(penX)} ${fmt(base)} Tm`,
          `<${hex(affiche)}> Tj`, 'ET');
        // Soulignement et barré : traits posés par morceau, à sa couleur.
        if (m.styles.souligne || m.styles.barre) {
          ops.push(`${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])} rg`);
          if (m.styles.souligne) {
            ops.push(`${fmt(penX)} ${fmt(baselines[li] - taille * 0.14)} ${fmt(m.largeur)} ${fmt(Math.max(0.4, fs * 0.055))} re f`);
          }
          if (m.styles.barre) {
            ops.push(`${fmt(penX)} ${fmt(baselines[li] + taille * 0.24)} ${fmt(m.largeur)} ${fmt(Math.max(0.4, fs * 0.06))} re f`);
          }
        }
      }
      penX += m.largeur;
    }
  }

  function debutXLigne(ligne, m) {
    // Largeur occupée avant le morceau m dans sa ligne (pour le fond).
    let w = 0;
    for (const autre of ligne.morceaux) {
      if (autre === m) break;
      w += autre.largeur;
    }
    const wLigne = ligne.morceaux.reduce((t, x) => t + x.largeur, 0);
    const utile = ligne.type === 'p' ? largeurTexte : largeurTexte - retraitListe;
    const decal = ligne.align === 'centre' ? (utile - wLigne) / 2
      : ligne.align === 'droite' ? (utile - wLigne) : 0;
    return x0 + MARGE + (ligne.type === 'p' ? 0 : retraitListe) + Math.max(0, decal) + w;
  }

  function hex(t) {
    return Array.from(octetsWinAnsi(String(t)), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const xObjects = {};
  for (const [, f] of formes) xObjects[f.nom] = f.ref;
  const resources = {
    ProcSet: ['PDF', 'Text'],
    Font: {},
    XObject: xObjects,
  };
  for (const [cle] of polices) resources.Font[cle] = cle === 'F1' ? 'Helvetica'
    : cle === 'F2' ? 'Helvetica-Bold' : cle === 'F3' ? 'Helvetica-Oblique' : 'Helvetica-BoldOblique';
  if (aDesFonds) resources.ExtGState = {
    Gf: { ca: 0.6, CA: 0.6 }, G1: { ca: 1, CA: 1 },
  };

  const formRef = doc.context.register(makeForm(doc.context, {
    bbox: [x0, yBas, x1, y1],
    resources,
    content: ops.join('\n'),
  }));

  const da = `/Helv ${fmt(fs)} Tf ${fmt(encre[0])} ${fmt(encre[1])} ${fmt(encre[2])} rg`;
  const ref = addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: 'FreeText',
    Rect: [x0, yBas, x1, y1],
    DA: da,
    C: encre,
    Contents: `${PREFIXE_NOTE_RICHE} ${fmt(fs)} : ${src}`,
    Subject: sujet || 'Note',
    AP: { N: formRef },
  });
  return { ref, rect: [x0, yBas, x1, y1] };
}

module.exports = { addNoteRiche, ENCRE_DEFAUT };
