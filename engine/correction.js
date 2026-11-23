// engine/correction.js — v0.1.29 : la correction d'un bloc reconnu (OCR).
// /Square à bordure invisible dont l'/AP commence par un MASQUE BLANC OPAQUE
// couvrant le rectangle du bloc reconnu, puis recompose le texte corrigé
// (texte vectoriel, formules $...$ rendues par MathJax) : dans tous les
// lecteurs, le scan disparaît sous la correction et le texte devient
// sélectionnable et imprimable. La SOURCE brute voyage dans /Contents
// derrière le marqueur « Correction OCR <taille> <famille> [gras] : »
// (même convention que la fiche mixte, engine/texte.js ; les marqueurs
// anciens, sans famille, restent relus). Contrairement à la fiche mixte,
// source SANS formule est POSÉE telle quelle : la plupart des corrections
// ne sont que du texte. Exige pdf-lib + mathjax-full (tests en CI
// uniquement).
// v0.1.38 : FIDÉLITÉ AU DOCUMENT (retour d'Arthur : « le texte modifié
// change de police et forme un amas de texte »). La correction reçoit du
// rendu la FAMILLE réelle du texte remplacé (serif → police Times,
// sinon Helvetica) et son GRAS au besoin — lus du vrai texte de la page
// par engine/textereel.js ; la famille voyage dans le marqueur pour les
// reprises et le repose au déplacement. ET : une formule que MathJax ne
// peut pas rendre ne fait plus échouer la correction entière — le code
// s'affiche en texte, la pose réussit toujours.
'use strict';

const { StandardFonts } = require('pdf-lib');
const { makeForm, addAnnot, normalizeRect, octetsWinAnsi } = require('./annotcore.js');
const { mjRender } = require('./mjrender.js');
const {
  PREFIXE_CORRECTION, decouperMelange, translitterMathWinAnsi, composerLignes, exPourCorps,
} = require('./texte.js');

const fmt = (v) => String(Math.round(v * 100) / 100);

/* Polices standard par (famille, gras) : les pages nées sous Word ou
 * PowerPoint parlent Times pour leurs textes à empattements ; le texte
 * corrigé prend la famille de la page, plus l'épaisseur du bloc d'après. */
const POLICE_DE = {
  serif: {
    '': { pdf: StandardFonts.TimesRoman, nom: 'Times-Roman' },
    gras: { pdf: StandardFonts.TimesRomanBold, nom: 'Times-Bold' },
  },
  sans: {
    '': { pdf: StandardFonts.Helvetica, nom: 'Helvetica' },
    gras: { pdf: StandardFonts.HelveticaBold, nom: 'Helvetica-Bold' },
  },
};

/* Mêmes mesures que la fiche mixte (engine/melange.js) : l'écran du
 * correctif recompose exactement ce que le fichier contient. */
const ENCRE = [0.078, 0.086, 0.098];
const MARGE = 2;
const MARGE_VERTICALE = 3;
const INTERBASE = 0.45; // × fontSize entre deux lignes

/**
 * Pose la correction d'un bloc reconnu.
 * @param {object} p
 * @param {number[]} p.rect      rectangle du bloc reconnu [x0, y0bas, x1, y1haut]
 * @param {string}   p.source    texte corrigé (formules $...$ inline permises)
 * @param {number}  [p.fontSize=11] taille du corps du bloc reconnu (v0.1.38 :
 *        la taille RÉELLE du texte de la page, pas l'image de reconnaissance)
 * @param {string} [p.famille='sans'] v0.1.38 : famille réelle du texte
 *        remplacé, 'serif' (police à empattements) ou 'sans'
 * @param {boolean} [p.gras=false] v0.1.38 : le texte remplacé était en gras
 * @returns {Promise<{ref: PDFRef, rect: number[]}>} rectangle RÉALISÉ (le
 *          bas descend si le contenu dépasse ; le haut reste fixé sur le
 *          sommet du bloc, le masque couvre le rectangle réalisé entier).
 */
async function addCorrection(doc, page, { rect, source, fontSize = 11, famille = 'sans', gras = false }) {
  const src = String(source ?? '');
  if (!src.trim()) {
    // Une correction vide n'a pas de sens : elle masquerait le scan pour
    // ne rien écrire. Rien n'est créé, l'erreur remonte telle quelle.
    throw new Error('Une correction doit contenir du texte.');
  }
  const taille = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 11;
  const serif = famille === 'serif';
  const police = POLICE_DE[serif ? 'serif' : 'sans'][gras ? 'gras' : '']
    || POLICE_DE.sans[''];
  const [x0, y0, x1, y1] = normalizeRect(rect);
  const exPt = exPourCorps(taille);
  const font = await doc.embedFont(police.pdf);
  const mesurerTexte = (t) => font.widthOfTextAtSize(String(t), taille);

  // Rendu MathJax une fois par formule distincte, à la taille du corps.
  // v0.1.38 : une formule NON RENDABLE (commande inconnue de MathJax,
  // LaTeX blessé par la reconnaissance) NE FAIT PLUS ÉCHOUER la pose :
  // le code s'affiche en texte translittéré, la correction entière
  // s'applique (plus jamais « les modifications ne s'appliquent pas »).
  const rendus = new Map();
  const dimsFormule = (latex) => {
    if (!rendus.has(latex)) {
      let rendu = null;
      let repli = null;
      try {
        rendu = mjRender(latex, exPt, { rgb: ENCRE });
      } catch (e) {
        repli = translitterMathWinAnsi(latex);
      }
      rendus.set(latex, rendu ? { rendu } : { repli });
    }
    const r = rendus.get(latex);
    if (r.repli !== undefined) {
      return { widthPt: mesurerTexte(r.repli), heightPt: taille, depthPt: 0 };
    }
    return { widthPt: r.rendu.widthPt, heightPt: r.rendu.heightPt, depthPt: r.rendu.depthPt };
  };

  const layout = composerLignes(decouperMelange(src), {
    mesurerTexte, dimsFormule,
    largeurMax: (x1 - x0) - 2 * MARGE,
    fontSize: taille,
  });

  const interbase = INTERBASE * taille;
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

  // Composition de l'apparence : MASQUE BLANC OPAQUE d'abord (couvre le
  // scan du bloc, exactement comme promis à l'écran), puis le texte et
  // les formules au-dessus.
  const ops = [
    '1 1 1 rg',
    `${fmt(x0)} ${fmt(yBas)} ${fmt(x1 - x0)} ${fmt(y1 - yBas)} re f`,
  ];
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
            `/F1 ${fmt(taille)} Tf`,
            `${fmt(ENCRE[0])} ${fmt(ENCRE[1])} ${fmt(ENCRE[2])} rg`,
            `1 0 0 1 ${fmt(penX)} ${fmt(baselines[li])} Tm`,
            `<${hex}> Tj`,
            'ET',
          );
        }
      } else {
        const r = rendus.get(m.valeur);
        // v0.1.38 : une formule non rendable s'écrit en TEXTe translittéré
        // sur sa propre ligne de base : la pose réussit, le lecteur voit le
        // code. Une formule rendable garde son Form XObject vectoriel.
        const rendu = r && r.rendu;
        if (!rendu) {
          const affiche = translitterMathWinAnsi(r && r.repli ? r.repli : m.valeur);
          const hex = Array.from(octetsWinAnsi(affiche), (b) => b.toString(16).padStart(2, '0')).join('');
          if (hex) {
            ops.push(
              'BT',
              `/F1 ${fmt(taille)} Tf`,
              `${fmt(ENCRE[0])} ${fmt(ENCRE[1])} ${fmt(ENCRE[2])} rg`,
              `1 0 0 1 ${fmt(penX)} ${fmt(baselines[li])} Tm`,
              `<${hex}> Tj`,
              'ET',
            );
          }
        } else {
          let f = formes.get(m.valeur);
          if (!f) {
            iForm += 1;
            f = {
              nom: `Fx${iForm}`,
              ref: doc.context.register(makeForm(doc.context, {
                bbox: [0, 0, rendu.widthPt, rendu.heightPt],
                resources: { ProcSet: doc.context.obj(['PDF']) },
                content: rendu.ops,
              })),
            };
            formes.set(m.valeur, f);
          }
          ops.push(
            'q',
            `1 0 0 1 ${fmt(penX)} ${fmt(baselines[li] - rendu.depthPt)} cm`,
            `/${f.nom} Do`,
            'Q',
          );
        }
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
      // v0.1.38 : la police de la correction est celle du DOCUMENT :
      // Times pour un texte à empattements, Helvetica sinon, l'épaisseur
      // suivant le bloc. La ressource est la RÉFÉRENCE de la police
      // EMBARQUÉE (le fichier reste valide pour tout lecteur).
      Font: { F1: font.ref },
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
    // La taille du corps ET la famille ET le gras voyagent dans le
    // marqueur : le rectangle de la correction se recompose à l'identique
    // à l'écran comme dans le fichier, y compris repris et reposées
    // (déplacement, redimensionnement). Les anciens marqueurs (sans
    // famille) restent relus par engine/texte.js.
    Contents: `${PREFIXE_CORRECTION} ${fmt(taille)} ${serif ? 'serif' : 'sans'}${gras ? ' gras' : ''} : ${src}`,
    Subject: 'Correction',
  });
  return { ref, rect: [x0, yBas, x1, y1] };
}

module.exports = { addCorrection };
