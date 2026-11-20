// engine/guides.js — Tâche 11 (v0.1.5) : fenêtres guidées « à la Dmaths ».
// Logique PURE : définition des gabarits et composition du LaTeX. Aucune
// dépendance, aucun accès au DOM. Testée sous Node (test/guides.js) et
// employée telle quelle par le processus de rendu via globalThis — mêmes
// fonctions, mêmes comportements (discipline du moteur pur).
'use strict';

/** Trim défensif : les champs de saisie peuvent être absents ou non textuels. */
function net(s) {
  return typeof s === 'string' ? s.trim() : '';
}

/** Colonne de coordonnées, verticale (choix Dmaths par défaut) ou en ligne. */
function colonneCoordonnees(coords, verticale) {
  const v = coords.map(net).filter((c) => c !== '');
  if (v.length === 0) return '';
  if (v.length === 1) return `\\left(${v[0]}\\right)`;
  if (verticale) {
    return `\\left(\\begin{matrix}${v.join(' \\\\ ')}\\end{matrix}\\right)`;
  }
  return `\\left(${v.join(' ;\\, ')}\\right)`;
}

/** Vecteur éventuellement précédé d'un coefficient : « 2 » + « \vec{u} ». */
function vecteur(coeff, nom) {
  const c = net(coeff);
  return (c ? c : '') + `\\vec{${net(nom)}}`;
}

/* Chaque gabarit fournit :
   - bouton : court libellé pour la grille d'entrée du panneau,
   - titre   : titre de la fenêtre, « Écrire … » comme Dmaths,
   - champs  : [{ id, libelle, place?, defaut? }],
   - radios? : { id, options: [{ id, libelle }], defaut },
   - coches? : [{ id, libelle, defaut? }] (cases à cocher),
   - composer(v, r, c) : valeur(s) -> { latex } | { erreur: 'message français' }.
   Le système d'équations suit un chemin particulier (liste de lignes). */

const GUIDES = {
  quotient: {
    bouton: 'Quotient',
    titre: 'Écrire un quotient',
    champs: [
      { id: 'num', libelle: 'Numérateur', place: 'a + b' },
      { id: 'den', libelle: 'Dénominateur', place: '2c' },
    ],
    composer(v) {
      const num = net(v.num);
      const den = net(v.den);
      if (!num || !den) return { erreur: 'Complétez le numérateur et le dénominateur.' };
      return { latex: `\\frac{${num}}{${den}}` };
    },
  },

  racine: {
    bouton: 'Racine',
    titre: 'Écrire une racine',
    champs: [
      { id: 'index', libelle: 'Index (2 si vide)', place: 'n' },
      { id: 'radicande', libelle: 'Radicande', place: 'b^2 - 4ac' },
    ],
    composer(v) {
      const r = net(v.radicande);
      if (!r) return { erreur: 'Complétez la radicande (ce qui est sous la racine).' };
      const n = net(v.index);
      return { latex: n ? `\\sqrt[${n}]{${r}}` : `\\sqrt{${r}}` };
    },
  },

  limite: {
    bouton: 'Limite',
    titre: 'Écrire une limite',
    champs: [
      { id: 'variable', libelle: 'Limite quand', place: 'x', defaut: 'x' },
      { id: 'but', libelle: 'tend vers', place: '0' },
      { id: 'expression', libelle: 'de', place: 'f(x)' },
    ],
    composer(v) {
      const variable = net(v.variable) || 'x';
      const but = net(v.but);
      if (!but) return { erreur: 'Complétez la valeur dont la variable s\u2019approche.' };
      const expr = net(v.expression);
      const corps = `\\lim\\limits_{${variable} \\to ${but}}`;
      return { latex: expr ? `${corps} ${expr}` : corps };
    },
  },

  borne: {
    bouton: 'Intégrale / Somme',
    titre: 'Écrire une intégrale, une somme ou un produit',
    champs: [
      { id: 'variable', libelle: 'Variable', place: 'k', defaut: 'k' },
      { id: 'de', libelle: 'de', place: '1' },
      { id: 'a', libelle: 'à', place: 'n' },
      { id: 'expr', libelle: 'Fonction', place: 'k^2' },
    ],
    radios: {
      id: 'choix',
      defaut: 'int',
      options: [
        { id: 'int', libelle: 'intégrale' },
        { id: 'somme', libelle: 'somme' },
        { id: 'prod', libelle: 'produit' },
      ],
    },
    composer(v, r) {
      const variable = net(v.variable) || 'k';
      const de = net(v.de);
      const a = net(v.a);
      let corps;
      if (r === 'int') {
        let bornes = '';
        if (de && a) bornes = `_{${de}}^{${a}}`;
        else if (de) bornes = `_{${de}}`;
        else if (a) bornes = `^{${a}}`;
        corps = `\\int${bornes}`;
        const expr = net(v.expr);
        if (expr) corps += ` ${expr}`;
        corps += ` \\, d${variable}`;
        return { latex: corps };
      }
      // Somme ou produit : indice « variable = de » (ou variable seule).
      const indice = de ? `${variable}=${de}` : variable;
      let bornes = `_{${indice}}`;
      if (a) bornes += `^{${a}}`;
      const op = r === 'somme' ? '\\sum' : '\\prod';
      const expr = net(v.expr);
      return { latex: expr ? `${op}${bornes} ${expr}` : `${op}${bornes}` };
    },
  },

  vecteur: {
    bouton: 'Vecteur',
    titre: 'Écrire un vecteur',
    champs: [
      { id: 'coeff', libelle: 'Coefficient', place: '2' },
      { id: 'nom', libelle: 'Nom du vecteur', place: 'u' },
      { id: 'x', libelle: 'Coordonnées : x', place: '3' },
      { id: 'y', libelle: 'y', place: '-1' },
      { id: 'z', libelle: 'z', place: '' },
    ],
    coches: [
      { id: 'verticale', libelle: 'Coordonnées verticales', defaut: true },
      { id: 'norme', libelle: 'Écrire la norme' },
    ],
    composer(v, _r, c) {
      const nom = net(v.nom);
      const coords = [v.x, v.y, v.z].map(net).filter((t) => t !== '');
      if (!nom && coords.length === 0) {
        return { erreur: 'Donnez au moins un nom ou des coordonnées.' };
      }
      const coeff = net(v.coeff);
      const corps = coords.length > 0
        ? (coeff ? coeff : '') + colonneCoordonnees([v.x, v.y, v.z], c.verticale !== false)
        : vecteur(coeff, nom);
      if (c.norme) return { latex: `\\left\\| ${corps} \\right\\|` };
      return { latex: corps };
    },
  },

  angle: {
    bouton: 'Angle de vecteurs',
    titre: 'Écrire un angle ou un produit de vecteurs',
    champs: [
      { id: 'coeff1', libelle: 'Coefficient 1', place: '' },
      { id: 'nom1', libelle: 'Vecteur 1', place: 'u' },
      { id: 'coeff2', libelle: 'Coefficient 2', place: '' },
      { id: 'nom2', libelle: 'Vecteur 2', place: 'v' },
    ],
    radios: {
      id: 'choix',
      defaut: 'angle',
      options: [
        { id: 'angle', libelle: 'angle vectoriel' },
        { id: 'scalaire', libelle: 'produit scalaire' },
        { id: 'vectoriel', libelle: 'produit vectoriel' },
      ],
    },
    composer(v, r) {
      const n1 = net(v.nom1);
      const n2 = net(v.nom2);
      if (!n1 || !n2) return { erreur: 'Donnez les deux noms de vecteurs.' };
      const u = vecteur(v.coeff1, n1);
      const w = vecteur(v.coeff2, n2);
      if (r === 'scalaire') return { latex: `${u} \\cdot ${w}` };
      if (r === 'vectoriel') return { latex: `${u} \\wedge ${w}` };
      return { latex: `\\left( ${u} ;\\, ${w} \\right)` };
    },
  },

  mesure: {
    bouton: 'Mesure / Angle',
    titre: 'Écrire une mesure algébrique ou un angle',
    champs: [
      { id: 'coeff', libelle: 'Coefficient', place: '2' },
      { id: 'nom', libelle: 'Nom', place: 'AB' },
    ],
    radios: {
      id: 'choix',
      defaut: 'mesure',
      options: [
        { id: 'mesure', libelle: 'mesure algébrique' },
        { id: 'angle', libelle: 'angle' },
      ],
    },
    composer(v, r) {
      const nom = net(v.nom);
      if (!nom) return { erreur: 'Complétez le nom (ex. : AB pour une mesure, ABC pour un angle).' };
      const coeff = net(v.coeff);
      const corps = r === 'mesure' ? `\\overline{${nom}}` : `\\widehat{${nom}}`;
      return { latex: `${coeff ? `${coeff} \\, ` : ''}${corps}` };
    },
  },
};

/* Système d'équations : chaque ligne = { gauche, symbole, droite }. */
function composerSysteme(lignes) {
  const valides = (Array.isArray(lignes) ? lignes : [])
    .filter((l) => l && (net(l.gauche) || net(l.droite)))
    .map((l) => {
      const symbole = net(l.symbole) || '=';
      return `${net(l.gauche)} ${symbole} ${net(l.droite)}`.trim();
    });
  if (valides.length === 0) return { erreur: 'Écrivez au moins une équation.' };
  if (valides.length === 1) return { latex: valides[0] };
  return { latex: `\\left\\{\\begin{matrix}${valides.join(' \\\\ ')}\\end{matrix}\\right.` };
}

// Double en-tête : sous Node (tests), CommonJS habituel ; dans le navigateur
// du processus de rendu (module ESM sans « module »), exposition sur
// globalThis. v0.1.4 : TOUJOURS la forme gardée, jamais d'exportation
// inconditionnelle (voir la leçon de coords.js).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GUIDES, composerSysteme };
} else {
  globalThis.AtelierGuides = { GUIDES, composerSysteme };
}
