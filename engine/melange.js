// engine/melange.js — v0.1.11 : la fiche « texte + formules ».
// /Square à bordure invisible dont l'/AP mélange du texte Helvetica et des
// formules MathJax en XObjects, alignées sur la ligne de base du texte.
// La SOURCE brute (avec $...$ et l'Unicode d'origine) voyage dans /Contents
// derrière le marqueur « Fiche mixte : » : la relecture au double-clic est
// fidèle. Exige pdf-lib + mathjax-full (tests en CI uniquement).
'use strict';

const { PDFName, StandardFonts } = require('pdf-lib');
const { makeForm, addAnnot, normalizeRect, octetsWinAnsi } = require('./annotcore.js');
const { mjRender } = require('./mjrender.js');
const {
  PREFIXE_FICHE_MIXTE, contientFormule, decouperMelange, translitterMathWinAnsi,
  composerLignes, exPourCorps,
} = require('./texte.js');

const fmt = (v) => String(Math.round(v * 100) / 100);

/** Encre du texte (croquis validé : carte claire, texte #14161c). */
const ENCRE = [0.078, 0.086, 0.098];
const MARGE = 2;
const MARGE_VERTICALE = 3;
const INTERBASE = 0.45; // × fontSize entre deux lignes

/**
 * Pose une fiche mélangeant texte et formules $...$.
 * @param {object} p
 * @param {number[]} p.rect     zone glissée [x0, y0bas, x1, y1haut]
 * @param {string}   p.source  texte avec formules $latex$ inline
 * @param {number}  [p.fontSize=11]
 * @returns {Promise<{ref: PDFRef, rect: number[]}>} rectangle RÉALISÉ (le bas
 *          descend si le contenu dépasse la zone ; le haut reste fixe).
 * PREUVÉ (échec CI v0.1.11, source pdf-lib 1.17.1) : embedFont est
 * asynchrone. La pose attend donc la police avant de mesurer le texte ;
 * le refus « sans formule » reste une erreur levée de façon synchrone.
 */
function addMixedFiche(doc, page, { rect, source, fontSize = 11 }) {
  const src = String(source ?? '');
  if (!contientFormule(src)) {
    throw new Error('Une fiche mixte doit contenir au moins une formule $...$.');
  }
  return poserFiche(doc, page, { rect, source: src, fontSize });
}

async function poserFiche(doc, page, { rect, source, fontSize }) {
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const exPt = exPourCorps(fontSize);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const mesurerTexte = (t) => font.widthOfTextAtSize(String(t), fontSize);

  // Rendu MathJax une fois par formule distincte, à la taille du corps.
  const rendus = new Map();
  const dimsFormule = (latex) => {
    if (!rendus.has(latex)) {
      rendus.set(latex, mjRender(latex, exPt, { rgb: ENCRE }));
    }
    const r = rendus.get(latex);
    return { widthPt: r.widthPt, heightPt: r.heightPt, depthPt: r.depthPt };
  };

  const layout = composerLignes(decouperMelange(source), {
    mesurerTexte, dimsFormule,
    largeurMax: (x1 - x0) - 2 * MARGE,
    fontSize,
  });

  // Lignes de base : le sommet utile reste y1 ; le bas descend si besoin.
  const interbase = INTERBASE * fontSize;
  const lignes = layout.lignes;
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

  // Composition du flux d'apparence : texte BT/Tj + formules q cm Do Q.
  const ops = [];
  const formes = new Map(); // latex -> { nom, ref }
  let iForm = 0;
  for (let li = 0; li < lignes.length; li += 1) {
    let penX = x0 + MARGE;
    for (const m of lignes[li].morceaux) {
      if (m.type === 'texte') {
        const affiche = translitterMathWinAnsi(m.valeur);
        const hex = Array.from(octetsWinAnsi(affiche), (b) => b.toString(16).padStart(2, '0')).join('');
        if (hex) {
          ops.push(
            'BT',
            `/F1 ${fontSize} Tf`,
            `${fmt(ENCRE[0])} ${fmt(ENCRE[1])} ${fmt(ENCRE[2])} rg`,
            `1 0 0 1 ${fmt(penX)} ${fmt(baselines[li])} Tm`,
            `<${hex}> Tj`,
            'ET',
          );
        }
      } else {
        const r = rendus.get(m.valeur);
        let f = formes.get(m.valeur);
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
          formes.set(m.valeur, f);
        }
        ops.push(
          'q',
          `1 0 0 1 ${fmt(penX)} ${fmt(baselines[li] - r.depthPt)} cm`,
          `/${f.nom} Do`,
          'Q',
        );
      }
      penX += m.largeur;
    }
  }

  const xObjects = {};
  for (const [, f] of formes) xObjects[f.nom] = f.ref;

  const formRef = doc.context.register(makeForm(doc.context, {
    bbox: [x0, yBas, x1, y1],
    resources: {
      ProcSet: ['PDF', 'Text'],
      Font: { F1: 'Helvetica' },
      XObject: xObjects,
    },
    content: ops.join('\n'),
  }));

  const ref = addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: 'Square',
    Rect: [x0, yBas, x1, y1],
    C: [0, 0, 0],
    BS: { W: 0 },
    AP: { N: formRef },
    Contents: `${PREFIXE_FICHE_MIXTE} : ${source}`,
  });
  return { ref, rect: [x0, yBas, x1, y1] };
}

module.exports = { addMixedFiche };
