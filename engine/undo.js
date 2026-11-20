// engine/undo.js — v0.1.13 : le rejeu d'annulation.
// Annuler = rouvrir les OCTETS ORIGINAUX du fichier et refaire tous les
// gestes sauf le dernier : pdf-lib attribue les numéros d'objets en ordre
// d'enregistrement, le rejeu d'une même séquence est donc DÉTERMINISTE et
// les références sérialisées {objectNumber, generationNumber} restent
// valables d'un rejeu à l'autre. Rétablir = appliquer le lot écarté sur
// la session courante. Les poses asynchrones (fiche mixte : embedFont)
// sont attendues une à une.
'use strict';

const { openPdf } = require('./pdfio.js');
const { createSession } = require('./session.js');

/**
 * Rejoue des gestes sur un document ouvert depuis ses octets originaux.
 * @param {Uint8Array} octets  fichier TEL QU'OUVERT (jamais enregistré depuis)
 * @param {Array<Array<{kind: string, pageIndex: number, args: object}>>} gestes
 *   tableau de LOTS (un lot = un geste de l'utilisateur : une pose, une
 *   correction « retrait + repose », un remplacement d'équation, ...).
 *   Les arguments sont ceux passés par IPC, donc sérialisables (références
 *   {objectNumber, generationNumber}, jamais d'instance de pdf-lib).
 * @returns {Promise<{doc: object, session: object}>}
 *   le document reconstruit et sa session (journal interne rempli).
 * @throws l'édition qui échoue pendant le rejeu lève telle quelle ;
 *   l'état de la session en cours (celle de l'appelant) n'est jamais
 *   touché : rejouer travaille sur une copie jetable.
 */
async function rejouer(octets, gestes) {
  const doc = await openPdf(octets);
  const session = createSession(doc);
  const lots = Array.isArray(gestes) ? gestes : [];
  for (let g = 0; g < lots.length; g += 1) {
    const lot = Array.isArray(lots[g]) ? lots[g] : [];
    for (const edit of lot) {
      try {
        // apply renvoie une promesse pour les poses asynchrones (fiche
        // mixte) : l'attendre TOUJOURS, sinon le résumé suivant ment.
        await session.apply(edit);
      } catch (cause) {
        const sorte = edit && edit.kind ? edit.kind : '(sans sorte)';
        throw new Error(
          `Le rejeu du geste n° ${g + 1} (édition « ${sorte} ») a échoué : `
          + `${(cause && cause.message) ? cause.message : String(cause)}`,
        );
      }
    }
  }
  return { doc, session };
}

module.exports = { rejouer };
