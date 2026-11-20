// engine/texte.js — v0.1.11 : moteur PUR de la fiche « texte + formules ».
// Balisage $...$ (formules inline), translittération WinAnsi du texte courant,
// composition des lignes avec formules insécables. Aucune dépendance : testé
// sous Node sans pdf-lib ni MathJax.
'use strict';

const PREFIXE_FICHE_MIXTE = 'Fiche mixte';
const MARQUEUR_FICHE = /^Fiche mixte\s*:\s*/;
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
 * Format canonique : « Fiche mixte : <source> ». */
function extraireSourceFiche(contenu) {
  if (typeof contenu !== 'string') return '';
  const m = contenu.match(MARQUEUR_FICHE);
  if (!m) return '';
  return contenu.slice(m[0].length);
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
    const parties = segment.valeur.split(/(\s+)/);
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
  cloreLigne();
  return {
    lignes,
    largeur: (ligne) => ligne.morceaux.reduce((t, m) => t + m.largeur, 0),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PREFIXE_FICHE_MIXTE, extraireSourceFiche, translitterMathWinAnsi,
    decouperMelange, contientFormule, exPourCorps, composerLignes,
  };
} else {
  globalThis.AtelierTexte = {
    PREFIXE_FICHE_MIXTE, extraireSourceFiche, translitterMathWinAnsi,
    decouperMelange, contientFormule, exPourCorps, composerLignes,
  };
}
