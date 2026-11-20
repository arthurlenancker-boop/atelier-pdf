'use strict';

// Tâche 9 : moteur de session — réceptacle pur des demandes d'édition du processus de rendu.
// Aucun calcul de coordonnées ici : le processus de rendu a déjà converti les clics
// en points PDF via engine/coords.js.

const { PDFName, PDFRef } = require('pdf-lib');

const { addHighlight, addSquare, addInk, addTextNote, addFreeText } = require('./annots.js');
const { addEquation } = require('./equation.js');
const { addMixedFiche } = require('./melange.js');
const { deplacerAnnot, redimensionnerAnnot } = require('./bouger.js');
const { listAnnots } = require('./reread.js');

// Aiguillage sorte d'édition → fonction d'édition. Chaque fonction reçoit (doc, page, args).
const REGISTRE = {
  highlight: addHighlight,
  square: addSquare,
  ink: addInk,
  textNote: addTextNote,
  freeText: addFreeText,
  equation: addEquation,
  ficheMelangee: addMixedFiche,
  // v0.1.12 : la fiche mixte n'est plus seule à être asynchrone.
  deplacer: deplacerAnnot,
  redimensionner: redimensionnerAnnot,
};

/**
 * Retire d'une page l'annotation désignée par sa référence.
 * Leve une erreur claire si la référence ne correspond à rien (rien n'est modifié).
 */
function removeAnnot(doc, pageIndex, refBrut) {
  // Par IPC, la référence arrive sérialisée en {objectNumber, generationNumber} :
  // on la reconstitue ; un PDFRef direct (tests, même processus) est accepté tel quel.
  const ref = (refBrut instanceof PDFRef)
    ? refBrut
    : (refBrut && Number.isInteger(refBrut.objectNumber))
      ? PDFRef.of(refBrut.objectNumber, refBrut.generationNumber || 0)
      : null;
  if (!ref) {
    throw new Error('Aucune annotation désignée pour la suppression.');
  }
  const page = doc.getPage(pageIndex);
  const ctx = doc.context;
  let annots;
  try {
    annots = page.node.Annots ? page.node.Annots() : page.node.get(PDFName.of('Annots'));
  } catch { annots = null; }
  const tableau = annots ? ctx.lookup(annots) : null;
  if (!tableau || typeof tableau.size !== 'function') {
    throw new Error(`Aucune annotation à supprimer sur la page ${pageIndex + 1}.`);
  }
  const cible = ctx.lookup(ref);
  for (let i = 0; i < tableau.size(); i++) {
    if (ctx.lookup(tableau.get(i)) === cible) {
      tableau.remove(i);
      return { ref };
    }
  }
  throw new Error('Annotation introuvable : elle a peut-être déjà été supprimée.');
}

/**
 * Crée une session d'édition sur un document déjà ouvert (résultat de openPdf).
 *
 * session.apply(edit) applique une modification :
 *   edit = { kind: 'highlight'|'square'|'ink'|'textNote'|'freeText'|'equation'
 *            |'ficheMelangee'|'deplacer'|'redimensionner'|'remove',
 *            pageIndex: entier 0-par-défaut,
 *            args: objet transmis à la fonction d'édition }
 *
 * session.edits() renvoie l'ordre des modifications appliquées depuis l'ouverture.
 * session.listAnnots() renvoie les annotations présentes (engine/reread.js).
 */
function createSession(doc) {
  if (!doc || typeof doc.getPage !== 'function') {
    throw new Error('createSession attend un document ouvert par openPdf.');
  }
  const journal = [];

  return {
    apply(edit) {
      const { kind, pageIndex = 0, args = {} } = edit || {};
      if (kind === 'remove') {
        if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= doc.getPageCount()) {
          throw new Error(`Page ${pageIndex} hors bornes (document de ${doc.getPageCount()} page(s)).`);
        }
        const resultat = removeAnnot(doc, pageIndex, args.ref);
        journal.push({ kind, pageIndex, args: { ref: args.ref } });
        return resultat;
      }
      const fn = REGISTRE[kind];
      if (!fn) {
        throw new Error(`Sorte d'édition inconnue : « ${String(kind)} ».`);
      }
      const nbPages = doc.getPageCount();
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= nbPages) {
        throw new Error(`Page ${pageIndex} hors bornes (document de ${nbPages} page(s)).`);
      }
      const page = doc.getPage(pageIndex);
      const resultat = fn(doc, page, args);
      if (resultat && typeof resultat.then === 'function') {
        // v0.1.11 : les fiches mixtes se posent en asynchrone (pdf-lib expose
        // embedFont asynchrone). L'entrée de journal n'est écrite qu'une fois
        // la pose réussie ; l'éventuelle erreur remonte à l'appelant.
        return resultat.then((r) => {
          journal.push({ kind, pageIndex, args });
          return r;
        });
      }
      journal.push({ kind, pageIndex, args });
      return resultat;
    },

    edits() {
      return journal.slice();
    },

    /** Retire une annotation par sa référence (issue de listAnnots). */
    remove(pageIndex, ref) {
      return removeAnnot(doc, pageIndex, ref);
    },

    listAnnots() {
      return listAnnots(doc);
    },
  };
}

module.exports = { createSession };
