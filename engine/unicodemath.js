'use strict';

/*
 * engine/unicodemath.js — v0.1.24/25 : transcodage UnicodeMath (le « Linéaire »
 * de OneNote, spécification UTN28 v3.3) vers LaTeX. Fractions a/b associées
 * à gauche, scripts et préscripts, radicaux avec degré, n-aires avec bornes,
 * accents préfixés et postfixés, fonctions et limites, \matrix, \eqarray,
 * piles █/Ⓒ, \abs \norm \rect. v0.1.25 (retour d'Arthur sur \times et
 * \Leftrightarrow) : garde anti-collage des commandes suivi d'un atome
 * (fini \timesb affiché « timesb »), filet anti-perte en sériation (un
 * symbole inconnu n'efface plus la fin de la frappe), couverture des
 * flèches doubles, ∉ ∖ ∧ ∨ ⊕ ⊗ ⊙ ± ∓ · ∘ • et \supset/\supseteq corrigés.
 * Moteur pur, aucune dépendance. Double en-tête gardé (leçon v0.1.4).
 * Tests : test/unicodemath.test.js.
 */

const FONCTIONS = new Set([
  'sin', 'cos', 'tan', 'csc', 'sec', 'cot', 'sinh', 'cosh', 'tanh', 'coth',
  'ln', 'log', 'lg', 'exp', 'max', 'min', 'sup', 'inf', 'arg', 'det', 'dim',
  'gcd', 'hom', 'ker', 'mod', 'Pr', 'deg', 'limsup', 'liminf'
]);

const ACCENTS = new Set([
  'hat', 'bar', 'vec', 'dot', 'ddot', 'dddot', 'ddddot', 'tilde', 'check',
  'breve', 'acute', 'grave', 'overbar', 'underbar', 'overbrace', 'underbrace'
]);
const ACCENT_LA = new Map([
  ['overbar', 'overline'], ['underbar', 'underline'],
  ['overbrace', 'overbrace'], ['underbrace', 'underbrace']
]);

const NARY = new Map([
  ['\u222B', '\\int'], ['\u222C', '\\iint'], ['\u222D', '\\iiint'],
  ['\u222E', '\\oint'], ['\u222F', '\\oiint'], ['\u2230', '\\oiiint'],
  ['\u2211', '\\sum'], ['\u220F', '\\prod'], ['\u2210', '\\coprod'],
  ['\u22C3', '\\bigcup'], ['\u22C2', '\\bigcap']
]);

const RADICAUX = new Map([
  ['\u221A', null], ['\u221B', '3'], ['\u221C', '4']
]);

const ATOP = '\u00A6';       // ¦
const CASES = '\u24B8';      // Ⓒ
const STACK = '\u2588';      // █
const VBAR = '\u2502';       // │
const OPEN_D = '\u251C';     // ├
const CLOSE_D = '\u2524';    // ┤
const DD = '\u2146';         // ⅆ
const II = '\u2148';         // ⅈ
const EE = '\u2149';         // ⅇ
const PIPE = '|';
const NORM = '\u2016';

const OUVRANTS = new Set(['(', '[', '{', PIPE, NORM, OPEN_D]);
const FERMANTS = new Map([
  ['(', ')'], ['[', ']'], ['{', '}'],
  [PIPE, PIPE], [NORM, NORM], [OPEN_D, CLOSE_D]
]);
const ENV_MATRICE = new Map([
  ['(', 'pmatrix'], ['[', 'bmatrix'], ['{', 'Bmatrix'],
  [PIPE, 'vmatrix'], [NORM, 'Vmatrix']
]);

// v0.1.25 : produits et seconds opérateurs → leur COMMANDE LaTeX propre
// (∘ = \circ, • = \bullet…), fini le \cdot approximatif d'avant la v0.1.25.
const MULT_LA = new Map([
  ['\u00D7', '\\times'], ['\u00F7', '\\div'], ['\u22C5', '\\cdot'], ['\u00B7', '\\cdot'],
  ['\u2218', '\\circ'], ['\u2217', '\\ast'], ['\u22C6', '\\star'],
  ['\u2219', '\\bullet'], ['\u2022', '\\bullet']
]);

// ---------- Pré-substitutions ----------

function preSubstituer(s) {
  let t = s;
  t = t.replace(/\/=/g, '\u2260');
  t = t.replace(/<=/g, '\u2264');
  t = t.replace(/>=/g, '\u2265');
  t = t.replace(/->/g, '\u2192');
  t = t.replace(/\\dd(?![a-zA-Z])/g, DD);
  t = t.replace(/\\ii(?![a-zA-Z])/g, II);
  t = t.replace(/\\ee(?![a-zA-Z])/g, EE);
  t = t.replace(/\\vbar/g, VBAR);
  t = t.replace(/\\open(?![a-zA-Z])/g, OPEN_D);
  t = t.replace(/\\close(?![a-zA-Z])/g, CLOSE_D);
  t = t.replace(/\\cases(?![a-zA-Z])/g, CASES);
  t = t.replace(/\\cbrt/g, '\u221B');
  t = t.replace(/\\qdrt/g, '\u221C');
  return t;
}

// ---------- Analyseur lexical ----------

function lexer(srcPre) {
  const t = srcPre;
  const toks = [];
  let i = 0;
  const estLettre = (c) => /\p{L}/u.test(c);
  const estChiffre = (c) => /\p{Nd}/u.test(c);
  const SPE = new Set([DD, II, EE]);
  while (i < t.length) {
    const c = t[i];
    if (/\s/.test(c)) { i++; continue; }
    if (SPE.has(c)) { toks.push({ type: 'op', val: c, deb: i, fin: i + 1 }); i++; continue; }
    if (c === '\\') {
      let j = i + 1;
      let mot = '';
      while (j < t.length && /[a-zA-Z]/.test(t[j])) { mot += t[j]; j++; }
      if (mot === '') { mot = t[j]; j++; }
      toks.push({ type: 'ctrl', val: mot, deb: i, fin: j });
      i = j;
      continue;
    }
    if (estLettre(c) || estChiffre(c)) {
      let j = i;
      let mot = '';
      while (j < t.length && (estLettre(t[j]) || estChiffre(t[j])) && !SPE.has(t[j])) {
        mot += t[j]; j++;
        if (t[j] === '.' && j + 1 < t.length && estChiffre(t[j + 1])) {
          mot += '.'; j++;
        }
      }
      toks.push({ type: 'mot', val: mot, deb: i, fin: j });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let mot = '';
      while (j < t.length && t[j] !== '"') { mot += t[j]; j++; }
      toks.push({ type: 'texte', val: mot, deb: i, fin: j + 1 });
      i = j + 1;
      continue;
    }
    toks.push({ type: 'op', val: c, deb: i, fin: i + 1 });
    i++;
  }
  toks.push({ type: 'fin', val: '', deb: t.length, fin: t.length });
  return toks;
}

// ---------- Analyseur syntaxique ----------

function parseur(toks, src) {
  let p = 0;
  const voir = () => toks[p];
  const avancer = () => toks[p++];

  function deparer(n) {
    if (n && n.sorte === 'delim' && n.ouvrant === '(') return n.contenu;
    return n;
  }

  function argsBruts() {
    // jeton courant : '(' — renvoie le contenu brut et consomme le ')'
    avancer();
    const deb = toks[p].deb;
    let prof = 1;
    while (p < toks.length && toks[p].type !== 'fin') {
      const t = toks[p];
      if (t.type === 'op' && t.val === '(') prof++;
      if (t.type === 'op' && t.val === ')') {
        prof--;
        if (prof === 0) {
          const brut = src.slice(deb, t.deb);
          p++;
          return brut;
        }
      }
      p++;
    }
    return src.slice(deb, toks[toks.length - 1].deb);
  }

  function transcoderSub(s) {
    if (typeof s !== 'string' || s.trim() === '') return '';
    const t = preSubstituer(s);
    const sous = new parseur(lexer(t), t);
    return ser(sous.serie());
  }

  function couper(brut) {
    // découpé en lignes (@) et cellules (&) au niveau 0 de la parenthèse
    const lignes = [];
    let cell = '', prof = 0, courante = [];
    for (const c of brut) {
      if (c === '(') prof++;
      if (c === ')') prof--;
      if (prof === 0 && c === '&') { courante.push(cell.trim()); cell = ''; continue; }
      if (prof === 0 && c === '@') {
        courante.push(cell.trim()); lignes.push(courante);
        courante = []; cell = ''; continue;
      }
      cell += c;
    }
    courante.push(cell.trim());
    lignes.push(courante);
    return lignes;
  }

  function parseSerieToFermant(ouvrant) {
    const fermant = FERMANTS.get(ouvrant);
    const contenu = parseExpr(0, fermant);
    if (voir().type === 'op' && voir().val === fermant) avancer();
    return contenu;
  }

  // v0.1.25 : · (U+00B7) et • ∗ ⋆ rejoignent les produits.
  const MULT = new Set(['\u00D7', '\u00F7', '\u22C5', '\u00B7', '\u2219', '\u2218', '\u2217', '\u22C6', '\u2022']);

  function estBinaireRel(c) {
    if (c === '+' || c === '-' || c === '\u2212' || c === '=' || c === '<' || c === '>') return true;
    return ('\u00B1\u2264\u2265\u2260\u2248\u2261\u226A\u226B\u2192\u2194\u2208\u2209\u220B\u2282\u2283\u2286\u2287\u221D\u2245\u222A\u2229'
      // v0.1.25 : flèches doubles, ensembles négés (∉), logique, anneaux…
      + '\u21D2\u21D0\u21D4\u27FA\u27F7\u2213\u2216\u2227\u2228\u2295\u2296\u2297\u2299'
      + '\u2223\u22A5\u2225\u223C\u2243\u22A2\u22A3\u2235\u2234').includes(c)
      || c === VBAR;
  }

  function estCtrlBinaire(w) {
    return ['leq', 'le', 'geq', 'ge', 'neq', 'ne', 'approx', 'cong', 'equiv',
      'll', 'gg', 'propto', 'to', 'gets', 'leftarrow', 'rightarrow',
      'leftrightarrow', 'mapsto', 'pm', 'mp', 'times', 'div', 'cdot', 'ast',
      'oplus', 'ominus', 'otimes', 'cup', 'cap', 'in', 'ni'].includes(w);
  }

  function peutDébuterFacteur(t) {
    if (t.type === 'mot' || t.type === 'texte') return true;
    if (t.type === 'ctrl') return !ACCENTS.has(t.val);
    if (t.type !== 'op') return false;
    return OUVRANTS.has(t.val) || NARY.has(t.val) || RADICAUX.has(t.val)
      || t.val === DD || t.val === II || t.val === EE;
  }

  function parseExpr(precMin, arret) {
    let gauche = parseTerme(arret);
    for (;;) {
      const t = voir();
      if (arret !== undefined && t.type === 'op' && t.val === arret) break;
      if (t.type === 'fin') break;
      if (t.type === 'ctrl' && ACCENTS.has(t.val)) {
        const nom = avancer().val;
        gauche = accent(deparer(gauche), nom);
        continue;
      }
      if (t.type === 'op' && MULT.has(t.val)) {
        if (precMin > 2) break;
        avancer();
        const dr = parseTerme(arret);
        gauche = bin(gauche, MULT_LA.get(t.val) || '\\cdot', dr);
        continue;
      }
      if (t.type === 'op' && estBinaireRel(t.val)) {
        if (precMin > 1) break;
        avancer();
        const dr = parseExpr(2, arret);
        gauche = bin(gauche, opVersLaTeX(t.val), dr);
        continue;
      }
      if (t.type === 'ctrl' && estCtrlBinaire(t.val)) {
        if (precMin > 1) break;
        avancer();
        const dr = parseExpr(2, arret);
        gauche = bin(gauche, '\\' + t.val, dr);
        continue;
      }
      break;
    }
    return gauche;
  }

  function parseTerme(arret) {
    let gauche = parseFacteur(arret);
    for (;;) {
      const t = voir();
      if (arret !== undefined && t.type === 'op' && t.val === arret) break;
      if (t.type === 'fin') break;
      if (t.type === 'op' && t.val === '/') {
        avancer();
        const { node: den } = parseBase();
        gauche = frac(deparer(gauche), den);
        continue;
      }
      if (t.type === 'op' && t.val === ATOP) {
        avancer();
        const { node: haut } = parseBase();
        gauche = empilement(deparer(gauche), deparer(haut), false);
        continue;
      }
      if (t.type === 'ctrl' && (t.val === 'atop' || t.val === 'choose')) {
        avancer();
        const { node: haut } = parseBase();
        gauche = empilement(deparer(gauche), deparer(haut), t.val === 'choose');
        continue;
      }
      if (t.type === 'ctrl' && ACCENTS.has(t.val)) {
        const nom = avancer().val;
        gauche = accent(deparer(gauche), nom);
        continue;
      }
      if (t.type === 'op' && MULT.has(t.val)) {
        avancer();
        const dr = parseFacteur(arret);
        gauche = bin(gauche, MULT_LA.get(t.val) || '\\cdot', dr);
        continue;
      }
      if (peutDébuterFacteur(t)) {
        const dr = parseFacteur(arret);
        gauche = juxt(gauche, dr);
        continue;
      }
      break;
    }
    return gauche;
  }

  function parseFacteur(arret) {
    let base = parseAtome(arret);
    for (;;) {
      const t = voir();
      if (t.type === 'op' && (t.val === '_' || t.val === '^')) {
        const k = avancer().val;
        const r = parseBaseScript();
        if (k === '_') base = script(base, r.node, null);
        else base = script(base, null, r.node);
        continue;
      }
      break;
    }
    return base;
  }

  function parseBaseScript() {
    const t = voir();
    if (t.type === 'op' && OUVRANTS.has(t.val)) {
      const ouvrant = avancer().val;
      const contenu = parseSerieToFermant(ouvrant);
      return { node: contenu };
    }
    if (t.type === 'mot') { avancer(); return { node: mot(t.val) }; }
    if (t.type === 'ctrl') { avancer(); return { node: ctrlAtom(t.val) }; }
    if (t.type === 'op') { avancer(); return { node: motOp(t.val) }; }
    return { node: null };
  }

  function parseBase() { return parseBaseScript(); }

  function parseAtome(arret) {
    const t = voir();
    if (t.type === 'fin') return motOp('');
    if (t.type === 'texte') { avancer(); return texte(t.val); }
    if (t.type === 'mot') {
      avancer();
      if (t.val === 'lim') return limite();
      if (FONCTIONS.has(t.val)) return { sorte: 'fonction', nom: t.val };
      return mot(t.val);
    }
    if (t.type === 'ctrl') {
      const w = t.val;
      if (w === '_') {
        avancer();
        const r1 = parseBaseScript();
        let sup = null;
        if (voir().type === 'op' && voir().val === '^') {
          avancer();
          const r2 = parseBaseScript();
          sup = r2.node;
        }
        const b = parseFacteur(arret);
        return prescript(r1.node, sup, b);
      }
      if (ACCENTS.has(w)) {
        avancer();
        const { node } = parseBase();
        return accent(deparer(node), w);
      }
      if (w === 'sqrt') { avancer(); return radical(null); }
      if (w === 'matrix') { avancer(); return matrice(argsBruts()); }
      if (w === 'eqarray') { avancer(); return eqarray(argsBruts()); }
      if (['abs', 'norm', 'rect', 'det', 'box', 'card'].includes(w)) {
        avancer();
        return enceinte(w, argsBruts());
      }
      avancer();
      return ctrlAtom(w);
    }
    if (t.type === 'op') {
      const c = t.val;
      if (OUVRANTS.has(c)) {
        const ouvrant = avancer().val;
        if (ouvrant === OPEN_D) {
          const reel = avancer().val;
          const contenu = parseSerieToFermant(OPEN_D);
          return openClose(reel, contenu);
        }
        const contenu = parseSerieToFermant(ouvrant);
        return delim(ouvrant, contenu);
      }
      if (NARY.has(c)) { avancer(); return nary(c); }
      if (RADICAUX.has(c)) {
        avancer();
        return radical(RADICAUX.get(c));
      }
      if (c === STACK || c === CASES) {
        avancer();
        return pile(argsBruts(), c === CASES);
      }
      if (c === DD || c === II || c === EE) { avancer(); return motOp(c); }
      avancer();
      return motOp(c);
    }
    avancer();
    return motOp(String(t.val));
  }

  function nary(c) {
    let sous = null, sup = null;
    while (voir().type === 'op' && (voir().val === '_' || voir().val === '^')) {
      const k = avancer().val;
      const r = parseBaseScript();
      if (k === '_') sous = r.node;
      else sup = r.node;
    }
    const operande = parseTerme();
    return { sorte: 'nary', cmd: NARY.get(c), sous, sup, operande };
  }

  function radical(degre) {
    if (voir().type === 'op' && voir().val === '(') {
      const brut = argsBruts();
      const amp = brut.indexOf('&');
      if (amp >= 0) {
        return {
          sorte: 'radical',
          degre: degre ? mot(degre) : (amp > 0 ? { sorte: 'brut', val: transcoderSub(brut.slice(0, amp)) } : null),
          corps: { sorte: 'brut', val: transcoderSub(brut.slice(amp + 1)) }
        };
      }
      return { sorte: 'radical', degre: degre ? mot(degre) : null, corps: { sorte: 'brut', val: transcoderSub(brut) } };
    }
    const { node: corps } = parseBase();
    return { sorte: 'radical', degre: degre ? mot(degre) : null, corps };
  }

  function limite() {
    let sous = null;
    if (voir().type === 'op' && voir().val === '_') {
      avancer();
      const r = parseBaseScript();
      sous = r.node;
    }
    return { sorte: 'lim', sous };
  }

  function matrice(brut) {
    return { sorte: 'matrice', lignes: couper(brut).map(l => l.map(transcoderSub)) };
  }

  function eqarray(brut) {
    const lignes = couper(brut).map(l => l.map(c => {
      const m = c.trim().match(/^([=<>~≤≥≠≈≡])\s*(.*)$/);
      if (m && m[2] !== '') return opVersLaTeX(m[1]) + ' ' + transcoderSub(m[2]);
      if (m) return opVersLaTeX(m[1]);
      return transcoderSub(c);
    }));
    return { sorte: 'eqarray', lignes };
  }

  function enceinte(nom, brut) {
    return { sorte: 'enceinte', nom, corps: transcoderSub(brut) };
  }

  function pile(brut, cases) {
    const lignesBrutes = [];
    let prof = 0, cell = '';
    for (const c of brut) {
      if (c === '(') prof++;
      if (c === ')') prof--;
      if (prof === 0 && c === '@') { lignesBrutes.push(cell.trim()); cell = ''; continue; }
      cell += c;
    }
    lignesBrutes.push(cell.trim());
    const lignes = lignesBrutes.map(lb => {
      let prefixe = '';
      let corps = lb;
      const amp = corps.indexOf('&');
      if (amp >= 0) { prefixe = '&'; corps = corps.slice(0, amp) + corps.slice(amp + 1); }
      return prefixe + transcoderSub(corps.trim());
    });
    return { sorte: 'pile', cases, lignes };
  }

  function serie() {
    let n = parseExpr(0, undefined);
    for (;;) {
      const t = voir();
      if (t.type === 'fin') break;
      if (t.type === 'op' && (t.val === OPEN_D || t.val === CLOSE_D)) {
        avancer();
        if (voir().type === 'fin') break;
        const suite = parseExpr(0, undefined);
        if (!(suite && suite.sorte === 'mot' && suite.op && suite.val === '')) n = suite;
        continue;
      }
      /* v0.1.25 : FILET ANTI-PERTE. Avant, « a⇔b » donnait « a » : le
         symbole ⇔ inconnu interrompait l'analyse et TOUTE la suite de la
         frappe était perdue sans un mot. Désormais un jeton que l'analyse
         n'a pas consommé est juxtaposé tel quel (ou reprise par une vraie
         suite si c'est un mot) : la saisie n'est JAMAIS avalée. */
      if (t.type === 'op') { avancer(); n = juxt(n, motOp(t.val)); continue; }
      if (t.type === 'ctrl') { avancer(); n = juxt(n, ctrlAtom(t.val)); continue; }
      if (t.type === 'mot' || t.type === 'texte') {
        const suite = parseExpr(0, undefined);
        n = juxt(n, suite);
        continue;
      }
      break;
    }
    return n;
  }

  return { serie };
}

// ---------- Fabriques ----------

function mot(v) { return { sorte: 'mot', val: v }; }
function motOp(v) { return { sorte: 'mot', val: v, op: true }; }
function texte(v) { return { sorte: 'texte', val: v }; }
function frac(h, b) { return { sorte: 'frac', haut: h, bas: b }; }
function empilement(h, b, choose) { return { sorte: 'atop', haut: h, bas: b, choose }; }
function bin(g, op, d) { return { sorte: 'bin', gauche: g, op, droite: d }; }
function juxt(g, d) { return { sorte: 'juxt', gauche: g, droite: d }; }
function script(base, sous, sup) { return { sorte: 'scripte', base, sous, sup }; }
function accent(x, nom) { return { sorte: 'accent', corps: x, nom }; }
function delim(ouvrant, contenu) { return { sorte: 'delim', ouvrant, contenu }; }
function openClose(ouvrant, contenu) { return { sorte: 'openclose', ouvrant, contenu }; }
function ctrlAtom(w) { return { sorte: 'ctrl', val: w }; }
function prescript(sous, sup, base) { return { sorte: 'prescript', sous, sup, base }; }

// ---------- Sérialisation ----------

function bracesOuPas(s) { return s.length === 1 ? s : '{' + s + '}'; }

const MOT_MAP = new Map([
  ['\u2212', '-'], ['\u221E', '\\infty'],
  [DD, '\\mathrm{d}'], [II, '\\mathrm{i}'], [EE, '\\mathrm{e}']
]);

function estFonctionCote(n) {
  if (!n || typeof n !== 'object') return false;
  if (n.sorte === 'fonction') return true;
  if (n.sorte === 'scripte') return estFonctionCote(n.base);
  return false;
}

function sepJuxt(g, d, noeudDroite, noeudGauche) {
  if (d === '' || g === '') return '';
  if (g.endsWith('\\mathrm{d}')) return '';
  if (g === '-') return '';
  /* v0.1.25 : GARDE ANTI-COLLAGE. La gauche se termine par une commande
     LaTeX (\times, \Leftrightarrow, \alpha…) : la coller au mot suivant
     forgeait une commande invalide (\timesb) que MathLive affichait en
     lettres droites, « timesb » au lieu du symbole attendu. */
  if (/\\[A-Za-z]+$/.test(g)) return ' ';
  if (estFonctionCote(noeudGauche)) return ' ';
  if (d.startsWith('\\mathrm{d}')) return '\\,';
  if (d[0] === '\\' || d[0] === '(' || d[0] === '[') return ' ';
  if (/[)\]]$/.test(g)) return ' ';
  if (g.endsWith('}')) return ' ';
  return '';
}

function contientGrand(n) {
  if (!n || typeof n !== 'object') return false;
  switch (n.sorte) {
    case 'frac': case 'atop': case 'nary': case 'radical': case 'pile':
    case 'matrice': case 'eqarray': case 'enceinte':
      return true;
    case 'bin': return contientGrand(n.gauche) || contientGrand(n.droite);
    case 'juxt': return contientGrand(n.gauche) || contientGrand(n.droite);
    case 'scripte': return contientGrand(n.base);
    case 'accent': return contientGrand(n.corps);
    case 'delim': return true;
    default: return false;
  }
}

function ser(n) {
  if (typeof n === 'string') return n;
  if (!n) return '';
  switch (n.sorte) {
    case 'mot': return MOT_MAP.has(n.val) ? MOT_MAP.get(n.val) : opVersLaTeX(n.val);
    case 'brut': return n.val;
    case 'texte': return '\\text{' + n.val + '}';
    case 'ctrl': return '\\' + n.val;
    case 'fonction': return '\\' + n.nom;
    case 'lim': return '\\lim' + (n.sous ? '_' + bracesOuPas(ser(n.sous)) : '');
    case 'frac': return '\\frac{' + ser(n.haut) + '}{' + ser(n.bas) + '}';
    case 'atop': {
      if (n.choose) return '\\binom{' + ser(n.haut) + '}{' + ser(n.bas) + '}';
      return '\\genfrac{}{}{0pt}{}{' + ser(n.haut) + '}{' + ser(n.bas) + '}';
    }
    case 'bin': {
      const op = (n.op === '=') ? '=' : n.op;
      return ser(n.gauche) + ' ' + op + ' ' + ser(n.droite);
    }
    case 'juxt': {
      const g = ser(n.gauche), d = ser(n.droite);
      return g + sepJuxt(g, d, n.droite, n.gauche) + d;
    }
    case 'scripte': {
      let s = ser(n.base);
      if (n.sous) s += '_' + bracesOuPas(ser(n.sous));
      if (n.sup) s += '^' + bracesOuPas(ser(n.sup));
      return s;
    }
    case 'accent': return '\\' + (ACCENT_LA.get(n.nom) || n.nom) + '{' + ser(n.corps) + '}';
    case 'delim': {
      // [(\matrix…)] : les parenthèses en trop autour d'une matrice disparaissent
      let c = n.contenu;
      while (c && c.sorte === 'delim' && c.ouvrant === '(') c = c.contenu;
      if (c && c.sorte === 'matrice') {
        const env = ENV_MATRICE.get(n.ouvrant) || 'pmatrix';
        return '\\begin{' + env + '}' + serMatriceContenu(c) + '\\end{' + env + '}';
      }
      if (c && c.sorte === 'pile' && !c.cases) {
        return '\\left\\{' + ser(c) + '\\right.';
      }
      const grand = contientGrand(c) || n.ouvrant === '{';
      if (!grand && (n.ouvrant === '(' || n.ouvrant === '[')) {
        const ferm = (n.ouvrant === '(') ? ')' : ']';
        return n.ouvrant + ser(c) + ferm;
      }
      const ouvr = OUVR_LA.get(n.ouvrant) || n.ouvrant;
      const fermN = FERMANTS.get(n.ouvrant) || n.ouvrant;
      const ferm = OUVR_FERM_LA.get(n.ouvrant) || fermN;
      return ouvr + ser(c) + ferm;
    }
    case 'openclose': {
      const ouvr = OUVR_LA.get(n.ouvrant) || '\\left.';
      return ouvr + ser(n.contenu) + '\\right.';
    }
    case 'radical': {
      let s = '\\sqrt';
      if (n.degre) s += '[' + ser(n.degre) + ']';
      return s + '{' + ser(n.corps) + '}';
    }
    case 'nary': {
      let s = n.cmd;
      if (n.sous) s += '_' + bracesOuPas(ser(n.sous));
      if (n.sup) s += '^' + bracesOuPas(ser(n.sup));
      return s + ' ' + ser(n.operande);
    }
    case 'matrice':
      return '\\begin{pmatrix}' + serMatriceContenu(n) + '\\end{pmatrix}';
    case 'eqarray':
      return '\\begin{aligned}' + n.lignes.map(l => l.join('&')).join('\\\\') + '\\end{aligned}';
    case 'pile': {
      const env = n.cases ? 'cases' : 'matrix';
      return '\\begin{' + env + '}' + n.lignes.join('\\\\') + '\\end{' + env + '}';
    }
    case 'enceinte': {
      if (n.nom === 'abs') return '\\lvert ' + n.corps + '\\rvert ';
      if (n.nom === 'norm') return '\\lVert ' + n.corps + '\\rVert ';
      if (n.nom === 'rect' || n.nom === 'box') return '\\boxed{' + n.corps + '}';
      if (n.nom === 'det') return '\\det\\left(' + n.corps + '\\right)';
      if (n.nom === 'card') return '\\left|' + n.corps + '\\right|';
      return n.corps;
    }
    case 'prescript': {
      let s = '{}';
      if (n.sous) s += '_' + bracesOuPas(ser(n.sous));
      if (n.sup) s += '^' + bracesOuPas(ser(n.sup));
      return s + ' ' + ser(n.base);
    }
    default: return '';
  }
}

const OUVR_LA = new Map([
  ['(', '\\left('], ['[', '\\left['], ['{', '\\left\\{'],
  [PIPE, '\\lvert '], [NORM, '\\lVert ']
]);
const OUVR_FERM_LA = new Map([
  ['(', '\\right)'], ['[', '\\right]'], ['{', '\\right\\}'],
  [PIPE, '\\rvert '], [NORM, '\\rVert ']
]);

function serMatriceContenu(n) {
  return n.lignes.map(l => l.join(' & ')).join(' \\\\ ');
}

function opVersLaTeX(c) {
  const M = {
    '\u2264': '\\leq', '\u2265': '\\geq', '\u2260': '\\neq', '\u2192': '\\to',
    '\u2194': '\\leftrightarrow', '\u2248': '\\approx', '\u2261': '\\equiv',
    '\u226A': '\\ll', '\u226B': '\\gg', '\u221D': '\\propto', '\u2208': '\\in',
    '\u220B': '\\ni', '\u2282': '\\subset',
    // v0.1.25 : \superset et \superseteq n'existent pas en LaTeX
    // (MathLive les affichait en mots) ; les vrais noms ont été rétablis.
    '\u2283': '\\supset',
    '\u2286': '\\subseteq', '\u2287': '\\supseteq', '\u222A': '\\cup',
    '\u2229': '\\cap', '\u2245': '\\cong', '\u2212': '-',
    // v0.1.25 : couverture des symboles qu'OneNote admet en Linéaire.
    '\u00B1': '\\pm', '\u2213': '\\mp',
    '\u21D2': '\\Rightarrow', '\u21D0': '\\Leftarrow', '\u21D4': '\\Leftrightarrow',
    '\u27FA': '\\Longleftrightarrow', '\u27F7': '\\longleftrightarrow',
    '\u2209': '\\notin', '\u2216': '\\setminus',
    '\u2227': '\\wedge', '\u2228': '\\vee',
    '\u2295': '\\oplus', '\u2296': '\\ominus', '\u2297': '\\otimes', '\u2299': '\\odot',
    '\u2223': '\\mid', '\u22A5': '\\perp', '\u2225': '\\parallel',
    '\u223C': '\\sim', '\u2243': '\\simeq', '\u22A2': '\\vdash', '\u22A3': '\\dashv',
    '\u2235': '\\because', '\u2234': '\\therefore',
    '\u2191': '\\uparrow', '\u2193': '\\downarrow', '\u21A6': '\\mapsto',
    '\u2195': '\\updownarrow', '\u21D5': '\\Updownarrow',
    '\u2207': '\\nabla', '\u00AC': '\\neg', '\u2205': '\\emptyset',
    '\u2220': '\\angle', '\u25B3': '\\triangle', '\u22A4': '\\top',
    '\u00B0': '\\degree', '\u2032': "'",
    '\u22EF': '\\cdots', '\u2026': '\\ldots'
  };
  if (c === VBAR) return '\\middle\\vert';
  const m = MULT_LA.get(c);
  if (m) return m;
  return M[c] || c;
}

// ---------- API ----------

function transcoder(s) {
  if (typeof s !== 'string' || s.trim() === '') return s;
  const t = preSubstituer(s);
  const pr = new parseur(lexer(t), t);
  return ser(pr.serie()).replace(/\s+/g, ' ').trim();
}

const UniMath = { transcoder };
if (typeof module !== 'undefined' && module.exports) module.exports = UniMath;
if (typeof globalThis !== 'undefined') globalThis.AtelierUniMath = UniMath;
