// engine/markup.js — v0.1.31 : moteur PUR du texte riche.
// Analyse la source canonique des notes riches (sous-ensemble HTML :
// b, i, u, s, sup, sub, span style couleur/fond, div alignement,
// ul, ol, li, br, entities &amp; &lt; &gt; &nbsp; ; formules $...$
// hors des balises) en blocs typés, puis compose les lignes avec retour
// à la ligne, alignements, retrait des listes et formules insécables.
// Le même compositeur sers l'apparence PDF (engine/riche.js, via un
// mesureur Helvetica) et le peintre écran (app.js, via canvas) : les
// deux rendus restent identiques. Aucune dépendance.
'use strict';

/* ————— Réutilitaires d'échappement (partagés avec le sérialiseur du
   processus de rendu) ————— */

function echapperTexte(texte) {
  return String(texte ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decoderEntites(texte) {
  return String(texte ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

/* ————— Analyse de la source canonique ————— */

const OUVRANTES = {
  b: 'gras', i: 'italique', u: 'souligne', s: 'barre',
  sup: 'sup', sub: 'sub',
};

/** Vrai si deux jeux de styles influencent le texte à l'identique. */
function stylesEgaux(a, b) {
  return Boolean(a.gras) === Boolean(b.gras)
    && Boolean(a.italique) === Boolean(b.italique)
    && Boolean(a.souligne) === Boolean(b.souligne)
    && Boolean(a.barre) === Boolean(b.barre)
    && Boolean(a.sup) === Boolean(b.sup)
    && Boolean(a.sub) === Boolean(b.sub)
    && (a.couleur || null) === (b.couleur || null)
    && (a.fond || null) === (b.fond || null);
}

/**
 * Analyse une source canonique en blocs.
 * @returns {{type: 'p'|'puce'|'num', numero: number,
 *            align: 'gauche'|'centre'|'droite',
 *            runs: {styles: object, texte: string}[]}[]}
 * Chaque run porte soit du texte (styles : gras, italique, souligne,
 * barre, sup, sub + couleur + fond au format #hex), soit une formule
 * { type:'formule', valeur }. Les runs de texte sont fusionnés au
 * maximum par styles identiques.
 */
function analyserSource(source) {
  const src = String(source ?? '');
  const blocs = [];
  let bloc = null;
  // Pile des balises en ligne : { flag | 'span', span: {couleur, fond} }.
  const pile = [];
  const runCourant = { texte: '', styles: {} };

  function stylesCourants() {
    const st = {};
    // De l'intérieur vers l'extérieur : le span le plus proche du texte
    // gagne la couleur et le fond.
    for (let k = pile.length - 1; k >= 0; k -= 1) {
      const e = pile[k];
      if (e.flag) st[e.flag] = true;
      if (e.span) {
        if (e.span.couleur && !st.couleur) st.couleur = e.span.couleur;
        if (e.span.fond && !st.fond) st.fond = e.span.fond;
      }
    }
    return st;
  }

  function cloreRun() {
    const t = runCourant.texte;
    if (t) blocsOuverts().runs.push({ type: 'texte', texte: t, styles: runCourant.styles });
    runCourant.texte = '';
    runCourant.styles = null; // forcé : le prochain run repart des styles vus
  }

  function blocsOuverts() {
    if (!bloc) {
      bloc = { type: 'p', numero: 0, align: alignCourant, runs: [] };
      blocs.push(bloc);
    }
    return bloc;
  }

  let alignCourant = 'gauche';
  let contexteListe = 'p'; // 'p' | 'puce' | 'num'
  let numeroListe = 0;

  function cloreBloc() {
    cloreRun();
    bloc = null;
  }

  /** Ouvre un bloc vide, prêt à recevoir du texte (ou à rester vide :
   * les div, li et br vides sont des lignes blanches réelles). */
  function ouvrirBloc(type, numero) {
    cloreBloc();
    bloc = { type, numero: numero || 0, align: alignCourant, runs: [] };
    blocs.push(bloc);
  }

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '<') {
      const fin = src.indexOf('>', i);
      if (fin === -1) { runCourant.texte += src.slice(i); break; }
      const balise = src.slice(i + 1, fin).trim();
      const bas = balise.toLowerCase();
      let m;
      if (OUVRANTES[bas]) {
        cloreRun();
        pile.push({ flag: OUVRANTES[bas] });
      } else if ((m = /^\/(b|i|u|s|sup|sub)$/.exec(bas))) {
        cloreRun();
        const flag = OUVRANTES[m[1]];
        for (let k = pile.length - 1; k >= 0; k -= 1) {
          if (pile[k].flag === flag) { pile.splice(k, 1); break; }
        }
      } else if ((m = /^span\s+style\s*=\s*"([^"]*)"/i.exec(balise))) {
        cloreRun();
        const st = m[1];
        let couleur = null;
        let fond = null;
        const mc = /(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,6})/i.exec(st);
        if (mc) couleur = mc[1].toLowerCase();
        const mf = /(?:^|;)\s*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})/i.exec(st);
        if (mf) fond = mf[1].toLowerCase();
        pile.push({ span: { couleur, fond } });
      } else if (/^\/span$/i.test(bas)) {
        cloreRun();
        for (let k = pile.length - 1; k >= 0; k -= 1) {
          if (pile[k].span) { pile.splice(k, 1); break; }
        }
      } else if ((m = /^div(\s.*)?$/i.exec(bas)) || (m = /^p(\s.*)?$/i.exec(bas))) {
        cloreBloc();
        alignCourant = 'gauche';
        const st = m[1] || '';
        if (/text-align\s*:\s*center/i.test(st)) alignCourant = 'centre';
        else if (/text-align\s*:\s*right/i.test(st)) alignCourant = 'droite';
        ouvrirBloc('p', 0);
      } else if (/^\/(div|p)$/i.test(bas)) {
        cloreBloc();
        alignCourant = 'gauche';
      } else if (/^ul$/i.test(bas)) {
        cloreBloc();
        contexteListe = 'puce';
      } else if (/^ol$/i.test(bas)) {
        cloreBloc();
        contexteListe = 'num';
        numeroListe = 0;
      } else if (/^\/(ul|ol)$/i.test(bas)) {
        cloreBloc();
        contexteListe = 'p';
      } else if (/^li(\s.*)?$/i.test(bas)) {
        cloreBloc();
        if (contexteListe === 'num') numeroListe += 1;
        bloc = {
          type: contexteListe === 'p' ? 'p' : contexteListe,
          numero: numeroListe,
          align: 'gauche',
          runs: [],
        };
        blocs.push(bloc);
      } else if (/^\/li$/i.test(bas)) {
        cloreBloc();
      } else if (/^br\s*\/?$/i.test(bas)) {
        // Saut de ligne nu : ferme le bloc en cours, la suite repart sur
        // un bloc neuf (le sérialiseur canonique émet des <div></div>
        // pour les lignes vides, jamais de <br>).
        cloreBloc();
      } else {
        // Balise hors sous-ensemble : littérale (la source n'est pas la nôtre).
        runCourant.texte += src.slice(i, fin + 1);
      }
      i = fin + 1;
      // Après toute balise, le run repart des styles courants.
      runCourant.styles = stylesCourants();
      continue;
    }
    if (ch === '&') {
      const m = /^&(amp|lt|gt|nbsp);/.exec(src.slice(i));
      if (m) {
        runCourant.texte += { amp: '&', lt: '<', gt: '>', nbsp: ' ' }[m[1]];
        i += m[0].length;
        continue;
      }
    }
    if (ch === '$') {
      // Formule : jusqu'au dollar fermant (corps non vide), sinon texte.
      const j = src.indexOf('$', i + 1);
      const corps = j === -1 ? '' : src.slice(i + 1, j);
      if (j !== -1 && corps.trim() !== '') {
        cloreRun();
        runCourant.styles = stylesCourants();
        blocsOuverts().runs.push({ type: 'formule', valeur: corps.trim(), styles: runCourant.styles });
        i = j + 1;
        continue;
      }
    }
    if (ch === '\n') {
      cloreBloc();
      // Les sauts de ligne nus consécutifs laissent des lignes vides
      // (notes des versions antérieures, texte collé).
      let j = i + 1;
      let k = 1;
      for (;;) {
        const mm = /^[ \t]*(\n)/.exec(src.slice(j));
        if (!mm) break;
        k += 1;
        j += mm[0].length;
      }
      for (let v = 1; v < k; v += 1) ouvrirBloc('p', 0);
      i = j;
      continue;
    }
    if (bloc === null) {
      // Texte nu hors de toute balise : il ouvre son propre paragraphe.
      cloreRun();
      blocsOuverts();
    }
    if (runCourant.styles === null) runCourant.styles = stylesCourants();
    runCourant.texte += ch;
    i += 1;
  }
  cloreBloc();
  // Un texte vide reste un bloc vide (ligne blanche visible).
  if (blocs.length === 0) blocs.push({ type: 'p', numero: 0, align: 'gauche', runs: [] });
  return blocs;
}

/* ————— Composition des lignes riches ————— */

/** Facteur de taille des exposants et indices (même valeur à l'écran et
 * dans le fichier). */
const FACTEUR_EXPOSANT = 0.62;

/**
 * Compose les blocs en lignes : retour à la ligne aux espaces (mot trop
 * large coupé caractère par caractère), formules insécables, alignement
 * et retrait des listes portés par chaque ligne.
 * @param {object} p
 * @param {Function} p.mesurer     (styles, texte) -> largeur en points
 * @param {Function} p.dimsFormule (latex) -> {widthPt, heightPt, depthPt}
 * @param {number}   p.largeurMax  largeur utile du texte (points)
 * @param {number}   p.fontSize    corps du texte
 * @returns {{lignes: object[], largeurLigne: Function}}
 */
function composerLignesRiche(blocs, { mesurer, dimsFormule, largeurMax, fontSize }) {
  const RETRAIT_LISTE = Math.max(10, fontSize * 1.3);
  const lignes = [];
  let courante = null;
  let blocCourant = null;
  let premiereLigneDuBloc = true;

  function nouveauBloc(b) {
    blocCourant = b;
    courante = null;
    premiereLigneDuBloc = true;
  }

  function nouvelleLigne() {
    courante = {
      morceaux: [], w: 0, vide: true,
      type: blocCourant.type, numero: blocCourant.numero,
      align: blocCourant.align, debutBloc: premiereLigneDuBloc,
      hDessus: 0.75 * fontSize, hDes: 0.25 * fontSize,
    };
    premiereLigneDuBloc = false;
    lignes.push(courante);
    return courante;
  }

  function largeurUtile() {
    return largeurMax - (blocCourant && blocCourant.type !== 'p' ? RETRAIT_LISTE : 0);
  }

  function ajouterTexte(texte, styles, largeur) {
    const derniers = courante.morceaux;
    const fin = derniers[derniers.length - 1];
    if (fin && fin.type === 'texte' && stylesEgaux(fin.styles, styles)) {
      fin.texte += texte;
      fin.largeur += largeur;
    } else {
      derniers.push({ type: 'texte', texte, styles, largeur });
    }
    courante.w += largeur;
    courante.vide = false;
  }

  function cloreLigne() {
    if (!courante) return;
    courante.hDessus = 0.75 * fontSize;
    courante.hDes = 0.25 * fontSize;
    for (const m of courante.morceaux) {
      if (m.type === 'formule') {
        courante.hDessus = Math.max(courante.hDessus, m.hDessus);
        courante.hDes = Math.max(courante.hDes, m.hDes);
      }
    }
    courante = null;
  }

  for (const bloc of blocs) {
    nouveauBloc(bloc);
    if (bloc.runs.length === 0) { nouvelleLigne(); continue; }
    courante = null;
    let espacePend = '';
    for (const run of bloc.runs) {
      if (run.type === 'formule') {
        const d = dimsFormule(run.valeur) || { widthPt: 0, heightPt: 0, depthPt: 0 };
        const morceau = {
          type: 'formule', valeur: run.valeur, styles: run.styles,
          largeur: d.widthPt, hDessus: d.heightPt - d.depthPt, hDes: d.depthPt,
        };
        espacePend = '';
        if (!courante) nouvelleLigne();
        if (courante.morceaux.length && courante.w + morceau.largeur > largeurUtile()) cloreLigne();
        if (!courante) nouvelleLigne();
        courante.morceaux.push(morceau);
        courante.w += morceau.largeur;
        courante.vide = false;
        continue;
      }
      // Run de texte : mots et espaces, coupure caractère par caractère.
      const parties = String(run.texte).split(/(\s+)/);
      for (const partie of parties) {
        if (partie === '') continue;
        if (/^\s+$/.test(partie)) { espacePend = ' '; continue; }
        let mot = partie;
        while (mot) {
          let largeurMot = mesurer(run.styles, mot);
          if (largeurMot > largeurUtile()) {
            let k = 1;
            while (k < mot.length && mesurer(run.styles, mot.slice(0, k + 1)) <= largeurUtile()) k += 1;
            if (!courante) nouvelleLigne();
            ajouterTexte(mot.slice(0, k), run.styles, mesurer(run.styles, mot.slice(0, k)));
            cloreLigne();
            mot = mot.slice(k);
            espacePend = '';
            continue;
          }
          const largeurEspace = espacePend && courante && courante.morceaux.length
            ? mesurer(run.styles, ' ') : 0;
          if (courante && courante.morceaux.length
            && courante.w + largeurEspace + largeurMot > largeurUtile()) {
            cloreLigne();
            espacePend = '';
          }
          if (!courante) nouvelleLigne();
          if (espacePend && courante.morceaux.length) {
            ajouterTexte(' ', run.styles, mesurer(run.styles, ' '));
            espacePend = '';
          }
          ajouterTexte(mot, run.styles, largeurMot);
          mot = '';
        }
      }
    }
    if (!courante) nouvelleLigne(); // bloc reduit a rien apres coupures
  }
  return {
    lignes,
    largeurLigne: (l) => l.w,
    retraitListe: RETRAIT_LISTE,
    facteurExposant: FACTEUR_EXPOSANT,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    echapperTexte, decoderEntites, analyserSource, composerLignesRiche,
    FACTEUR_EXPOSANT,
  };
} else {
  globalThis.AtelierMarkup = {
    echapperTexte, decoderEntites, analyserSource, composerLignesRiche,
    FACTEUR_EXPOSANT,
  };
}
