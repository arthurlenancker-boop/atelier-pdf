'use strict';

// v0.1.33 : la file de commandes. Une seule promesse chaînée : FIFO strict,
// exclusion mutuelle (une commande à la fois), isolement des erreurs (une
// commande qui jette ne casse pas les suivantes) et restitution fidèle des
// valeurs. Le processus principal enfile TOUT ce qui touche un document
// (appliquer, annuler, rétablir, enregistrer) : le journal des gestes et
// les numéros d'objetspdf-lib ne peuvent plus être observés ni modifiés
// à mi-chemin d'un rejeu.
'use strict';

/**
 * Crée une file de commandes asynchrones à exclusion mutuelle.
 * @returns {{enfiler: (tache: () => Promise|*) => Promise}} une file
 */
function creerFileDeCommandes() {
  let chaine = Promise.resolve();
  return {
    /**
     * Enfile une tâche ; la promesse rendue porte la valeur (ou l'erreur)
     * de la tâche, jamais celle des voisines.
     */
    enfiler(tache) {
      const resultat = chaine.then(() => tache());
      // La chaîne continue quoi qu'il arrive : les erreurs d'une commande
      // ne doivent jamais bloquer (ni rejouer) les suivantes.
      chaine = resultat.then(() => undefined, () => undefined);
      return resultat;
    },
  };
}

module.exports = { creerFileDeCommandes };
