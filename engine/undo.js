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

/**
 * v0.1.33 : annulation ASSAINIE. Un journal désynchronisé (une course entre
 * deux rejeux, un état vif qui n'a plus rien à voir avec le journal capté)
 * faisait échouer CHAQUE annulation pour toujours : « Annotation
 * introuvable » en boucle (retour d'Arthur). Ici, le rejeu strict est
 * tenté ; s'il échoue, des gestes sont abandonnés PAR LA FIN jusqu'au
 * dernier préfixe qui se rejoue proprement. L'utilisateur récupère une
 * commande d'annulation qui marche TOUJOURS ; le travail postérieur à la
 * dérive est sacrifié (c'était du travail déjà incohérent).
 * @returns {Promise<{doc, session, rejoues: number, abandonnes: Array}>}
 *   rejoues = nombre de lots du préfixe sain ; abandonnes = lots écartés.
 * @throws l'erreur du rejeu du préfixe VIDE (document original illisible).
 */
async function rejouerPrefixeSain(octets, gestes) {
  const lots = Array.isArray(gestes) ? gestes : [];
  let derniereErreur = null;
  for (let fin = lots.length; fin >= 0; fin -= 1) {
    try {
      const r = await rejouer(octets, lots.slice(0, fin));
      return { ...r, rejoues: fin, abandonnes: lots.slice(fin) };
    } catch (cause) {
      derniereErreur = cause;
    }
  }
  throw derniereErreur;
}

module.exports = { rejouer, rejouerPrefixeSain };
