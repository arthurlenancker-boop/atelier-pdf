// engine/texte.js — v0.1.11 : moteur PUR de la fiche « texte + formules ».
// Balisage $...$ (formules inline), translittération WinAnsi du texte courant,
// composition des lignes avec formules insécables. Aucune dépendance : testé
// sous Node sans pdf-lib ni MathJax.
'use strict';

const PREFIXE_FICHE_MIXTE = 'Fiche mixte';
// v0.1.12 : le marqueur porte la taille du corps (« Fiche mixte 11 : … »),
// nécessaire au redimensionnement ; l'ancien format (v0.1.11, toujours 11)
// reste relu.
const MARQUEUR_FICHE = /^Fiche mixte(?: ([0-9]+(?:[.,][0-9]+)?)?)?\s*:\s*/;
const MARQUEUR_FORMULE = /\$\$/; // (documentatif : voir decouperMelange)

/** Symboles hors WinAnsi remplacés dans le TEXTE COURANT. Les symboles
 * riches vivent dans les formules $...$ (rendues en vecteurs MathJax). */
const TRANSLITTERATIONS = new Map([
  ['\u2260', '!='], // ≠
  ['\u2264', '<='], // ≤
  ['\u2265', '>='], // ≥
  ['\u2248', '~'], // ≈
  ['\u2212', '-'], // −
  ['\u2261', '=='], // ≡
  ['\u2200', 'pour tout'], // ∀
  ['\u2203', 'il existe'], // ∃
  ['\u2208', ' dans '], // ∈
  ['\u221d', 'prop. à'], // ∝
]);

function estWinAnsi(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)
    || ch === '\n' || ch === '\r' || ch === '\t';
}

/** Translittère le texte courant pour qu'il tienne en Helvetica WinAnsi,
 * sans perdre les accents français. */
function translitterMathWinAnsi(texte) {
  let sortie = '';
  for (const ch of String(texte ?? '')) {
    if (TRANSLITTERATIONS.has(ch)) { sortie += TRANSLITTERATIONS.get(ch); continue; }
    sortie += estWinAnsi(ch) ? ch : '?';
  }
  return sortie;
}

/** Relit la source d'une fiche mixte stockée dans /Contents.
 * Format canonique : « Fiche mixte [taille] : <source> ». */
function extraireSourceFiche(contenu) {
  if (typeof contenu !== 'string') return '';
  const m = contenu.match(MARQUEUR_FICHE);
  if (!m) return '';
  return contenu.slice(m[0].length);
}

/** Taille du corps embarquée dans le marqueur (v0.1.12), ou null si le
 * marqueur est l'ancien format (v0.1.11) : l'appelant sait alors que toutes
 * les fiches de cette époque ont été posées à 11 pt. */
function extraireTailleFiche(contenu) {
  if (typeof contenu !== 'string') return null;
  const m = contenu.match(MARQUEUR_FICHE);
  if (!m || m[1] === undefined) return null;
  const t = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(t) && t > 0 ? t : null;
}

/* v0.1.29 : la correction d'un bloc reconnu suit la même convention que la
 * fiche mixte — la source brute (avec les $formules$ et l'Unicode) voyage
 * dans /Contents derrière le marqueur « Correction OCR [taille] : », la
 * taille du corps embarquée pour recomposer à l'identique.
 * v0.1.38 : le marqueur porte AUSSI la famille (serif|sans, retours
 * d'Arthur : le texte corrigé changeait de police) et le gras au besoin —
 * tous facultatifs : les corrections posées avant la v0.1.38 restent
 * relues telles quelles (famille « sans » au repose). */
const PREFIXE_CORRECTION = 'Correction OCR';
const MARQUEUR_CORRECTION = /^Correction OCR(?: ([0-9]+(?:[.,][0-9]+)?)?)?(?: (serif|sans))?( gras)?\s*:\s*/;

/** Relit la source d'une correction posée sur un bloc reconnu. */
function extraireSourceCorrection(contenu) {
  if (typeof contenu !== 'string') return '';
  const m = contenu.match(MARQUEUR_CORRECTION);
  if (!m) return '';
  return contenu.slice(m[0].length);
}

/** Taille du corps embarquée dans le marqueur de correction, ou null. */
function extraireTailleCorrection(contenu) {
  if (typeof contenu !== 'string') return null;
  const m = contenu.match(MARQUEUR_CORRECTION);
  if (!m || m[1] === undefined) return null;
  const t = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(t) && t > 0 ? t : null;
}

/** v0.1.38 : famille embarquée dans le marqueur (« serif » ou « sans »),
 * null si le marqueur est l'ancien format (v0.1.29-37 : toujours « sans »). */
function extraireFamilleCorrection(contenu) {
  if (typeof contenu !== 'string') return null;
  const m = contenu.match(MARQUEUR_CORRECTION);
  if (!m || !m[2]) return null;
  return m[2];
}

/** v0.1.38 : gras embarqué dans le marqueur (le texte corrigé avait été
 * repéré en gras sur la page), faux sinon. */
function extraireGrasCorrection(contenu) {
  if (typeof contenu !== 'string') return false;
  const m = contenu.match(MARQUEUR_CORRECTION);
  return !!(m && m[3]);
}

/* v0.1.31 : la note riche suit la même convention — la mise en forme
 * canonique (sous-ensemble HTML, formules $...$ comprises) voyage dans
 * /Contents derrière le marqueur « Note riche [taille] : », la taille du
 * corps embarquée pour recomposer à l'identique (édition, déplacement,
 * redimensionnement, relecture des autres lecteurs). */
const PREFIXE_NOTE_RICHE = 'Note riche';
const MARQUEUR_NOTE_RICHE = /^Note riche(?: ([0-9]+(?:[.,][0-9]+)?)?)?\s*:\s*/;

/** Relit la source (mise en forme canonique) d'une note riche posée. */
function extraireSourceNoteRiche(contenu) {
  if (typeof contenu !== 'string') return '';
  const m = contenu.match(MARQUEUR_NOTE_RICHE);
  if (!m) return '';
  return contenu.slice(m[0].length);
}

/** Taille du corps embarquée dans le marqueur de la note riche, ou null. */
function extraireTailleNoteRiche(contenu) {
  if (typeof contenu !== 'string') return null;
  const m = contenu.match(MARQUEUR_NOTE_RICHE);
  if (!m || m[1] === undefined) return null;
  const t = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(t) && t > 0 ? t : null;
}

/** Découpe une source en segments texte / formule.
 * Seuls des $ APPARIÉS délimitent une formule ; un contenu vide ou
 * blanc ($ $) reste du texte littéral. Retourne [] pour une entrée vide. */
function decouperMelange(source) {
  if (typeof source !== 'string' || source === '') return [];
  const segments = [];
  let texte = '';
  let i = 0;
  while (i < source.length) {
    if (source[i] === '$') {
      const j = source.indexOf('$', i + 1);
      if (j !== -1) {
        const corps = source.slice(i + 1, j);
        if (corps.trim() !== '') {
          if (texte) { segments.push({ type: 'texte', valeur: texte }); texte = ''; }
          segments.push({ type: 'formule', valeur: corps.trim() });
          i = j + 1;
          continue;
        }
      } else {
        // Aucun dollar fermant : tout le reste est du texte.
        texte += source.slice(i);
        break;
      }
    }
    texte += source[i];
    i += 1;
  }
  if (texte) segments.push({ type: 'texte', valeur: texte });
  return segments;
}

/** Vrai si la source contient au moins une formule $...$ appariée. */
function contientFormule(source) {
  return decouperMelange(source).some((s) => s.type === 'formule');
}

/** Taille d'un « ex » MathJax alignée sur le corps Helvetica
 * (x-height ≈ 0,52 em). */
function exPourCorps(fontSize) {
  return Math.round(fontSize * 0.52 * 100) / 100;
}

/* Composition des lignes : les mots texte se coupent aux espaces (et,
 * au pire, caractère par caractère), les formules sont INSÉCABLES ;
 * une formule plus large que la zone part seule sur sa ligne. */
function composerLignes(segments, { mesurerTexte, dimsFormule, largeurMax, fontSize }) {
  const lignes = [];
  let courante = { morceaux: [], w: 0 };
  let espacePend = '';

  function ajouterTexte(valeur, largeur) {
    const derniers = courante.morceaux;
    if (derniers.length && derniers[derniers.length - 1].type === 'texte') {
      derniers[derniers.length - 1].valeur += valeur;
      derniers[derniers.length - 1].largeur += largeur;
    } else {
      derniers.push({ type: 'texte', valeur, largeur });
    }
    courante.w += largeur;
  }

  function cloreLigne() {
    if (!courante.morceaux.length) return;
    let hDessus = 0.75 * fontSize;
    let hDes = 0.25 * fontSize;
    for (const m of courante.morceaux) {
      if (m.type === 'formule') {
        hDessus = Math.max(hDessus, m.hDessus);
        hDes = Math.max(hDes, m.hDes);
      }
    }
    courante.hDessus = hDessus;
    courante.hDes = hDes;
    lignes.push(courante);
    courante = { morceaux: [], w: 0 };
  }

  for (const segment of segments) {
    if (segment.type === 'formule') {
      const d = dimsFormule(segment.valeur) || { widthPt: 0, heightPt: 0, depthPt: 0 };
      const morceau = {
        type: 'formule', valeur: segment.valeur, largeur: d.widthPt,
        hDessus: d.heightPt - d.depthPt, hDes: d.depthPt,
      };
      espacePend = '';
      if (courante.morceaux.length && courante.w + morceau.largeur > largeurMax) cloreLigne();
      courante.morceaux.push(morceau);
      courante.w += morceau.largeur;
      continue;
    }

    // Segment texte : mots et espaces, mots trop larges coupés par caractères.
    // v0.1.39 : un SAUT DE LIGNE de la source est un RETOUR à la ligne
    // RÉEL (pas une espace de plus) — le compositeur coupait la ligne
    // seulement à débordement, alors la mesure pdf-lib recevait « \n »
    // et rejetait la pose entière (« WinAnsi cannot encode 0x000a »,
    // retour d'Arthur : les modifications ne s'appliquaient pas).
    const souslignes = String(segment.valeur).split(/\r?\n/);
    for (let si = 0; si < souslignes.length; si += 1) {
      if (si > 0) {
        espacePend = '';
        cloreLigne();
      }
      const parties = souslignes[si].split(/(\s+)/);
      for (const partie of parties) {
        if (partie === '') continue;
        if (/^\s+$/.test(partie)) { espacePend = partie; continue; }
        let mot = partie;
        while (mot) {
          let largeurMot = mesurerTexte(mot);
          if (largeurMot > largeurMax) {
            // Coupe caractère par caractère : le plus long préfixe qui tient.
            let k = 1;
            while (k < mot.length && mesurerTexte(mot.slice(0, k + 1)) <= largeurMax) k += 1;
            const morceau = mot.slice(0, k);
            const l = mesurerTexte(morceau);
            if (courante.morceaux.length && courante.w + l > largeurMax) cloreLigne();
            ajouterTexte(morceau, l);
            cloreLigne(); // ce morceau remplit la ligne : ligne suivante.
            mot = mot.slice(k);
            espacePend = '';
            continue;
          }
          const largeurEspace = espacePend && courante.morceaux.length ? mesurerTexte(espacePend) : 0;
          if (courante.morceaux.length && courante.w + largeurEspace + largeurMot > largeurMax) {
            cloreLigne();
            espacePend = '';
          }
          const jointure = espacePend && courante.morceaux.length ? espacePend : '';
          ajouterTexte(jointure + mot, mesurerTexte(jointure) + largeurMot);
          espacePend = '';
          mot = '';
        }
      }
    }
  }
  cloreLigne();
  return {
    lignes,
    largeur: (ligne) => ligne.morceaux.reduce((t, m) => t + m.largeur, 0),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PREFIXE_FICHE_MIXTE, extraireSourceFiche, extraireTailleFiche, translitterMathWinAnsi,
    decouperMelange, contientFormule, exPourCorps, composerLignes,
    PREFIXE_CORRECTION, extraireSourceCorrection, extraireTailleCorrection,
    extraireFamilleCorrection, extraireGrasCorrection,
    PREFIXE_NOTE_RICHE, extraireSourceNoteRiche, extraireTailleNoteRiche,
  };
} else {
  globalThis.AtelierTexte = {
    PREFIXE_FICHE_MIXTE, extraireSourceFiche, extraireTailleFiche, translitterMathWinAnsi,
    decouperMelange, contientFormule, exPourCorps, composerLignes,
    PREFIXE_CORRECTION, extraireSourceCorrection, extraireTailleCorrection,
    extraireFamilleCorrection, extraireGrasCorrection,
    PREFIXE_NOTE_RICHE, extraireSourceNoteRiche, extraireTailleNoteRiche,
  };
}
