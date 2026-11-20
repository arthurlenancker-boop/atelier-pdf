# v0.1.15 — La colonne de vignettes (20 novembre 2026)

## Demande

Retour d'Arthur sur le ressenti : « le design de l'app ferme vers le cours
alors que les autres éditeurs me permettent de regarder partout ». Force
de l'impression confirmée par l'architecture : l'application montre UNE
page à la fois (navigation ‹ › page par page) ; rien ne donne à voir
l'ensemble du document. Question posée : défilement continu, vignettes,
ou les deux ? Réponse : « je ne sais pas ».

## Décision (prise pour Arthur, principe : la plus grande ouverture au risque le plus faible)

- VIGNETTES D'ABORD. La colonne répond littéralement au besoin (tout voir
  d'un coup, aller partout) sans rien remanier : le rendu reste une page
  à la fois, tous les outils, gestes et annulations restent inchangés.
- Le DÉFILEMENT CONTINU, qui exige de reconstruire la mécanique des
  calques sur plusieurs pages vivantes, viendra seulement si l'essai
  réel des vignettes laisse encore l'impression d'enfermement.

## Réalisation

- Colonne Pages à gauche du document (à la manière des grands éditeurs,
  et de la capture PDF-XChange d'origine d'Arthur) : une miniature par
  page, numéro sous chacune, page courante cerclée et suivie (recadrage
  en douceur uniquement si elle sort du champ), un clic y amène.
- Les vignettes se construisent UNE À UNE : un document long montre ses
  premières pages sans attendre la dernière ; un changement de document
  annule la construction en cours par numéro de génération ; une vignette
  manquante n'entrave rien.
- Colonne ouverte PAR DÉFAUT à l'ouverture d'un document (c'est l'ouverture
  demandée) ; bouton ▤ dans la barre supérieure pour la masquer ou la
  remettre.
- Aperçu de petites tailles : les miniatures sont rendues directement
  à leur taille d'affichage (pas de rétrécissement en mémoire).

## Ce qui ne change pas

- Le moteur, les outils, les annotations, l'annulation : rien ne bouge.
- Le défilement continu reste le chantier suivant SI l'essai le demande.
