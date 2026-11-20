# v0.1.16 — Correctif : la page disparaissait à côté des vignettes (20 novembre 2026)

## Incident (première capture d'usage réel, Arthur, v0.1.15)

Document scanné de deux pages ouvert : les vignettes s'affichent, la barre
d'état dit « Document ouvert : 2 page(s). », mais la zone centrale est vide,
aucune page rendue.

## Cause racine

La rangée principale de la fenêtre (.corps) était une GRILLE figurée à
exactement deux pistes : `grid-template-columns: 1fr auto` (la vue de
document, puis le panneau Équation). La colonne de vignettes de la v0.1.15,
insérée comme PREMIER enfant, prenait la piste souple (1fr, presque toute
la largeur, où elle n'occupe que ses 156 px), tandis que la vue de document
était repoussée dans la piste « auto » : son contenu étant en position
absolue, sa largeur intrinsèque est zéro, la piste s'est repliée et la page
a disparu. Les vignettes, elles, sont rendues hors de cette rangée : voilà
 pourquoi tout semblait marcher sauf la page.

Faille de méthode associée : le message d'ouverture (« Document ouvert :
N page(s). ») écrasait instantanément tout message d'erreur de rendu, et les
vérifications d'intégration ne surveillent que le moteur, jamais la mise en
page. Une régression de présentation ne pouvait être vue que sur l'écran
d'Arthur.

## Correctif

- La rangée devient une boîte souple : `.corps { display: flex; }`, la vue
  de document prend tout l'espace restant (`flex: 1 1 auto; min-width: 0`),
  chaque panneau garde sa largeur fixe et ne lâche rien. Les quatre
  combinaisons (vignettes × panneau Équation, visibles ou masquées) se
  répartissent correctement.
- Le message d'ouverture n'écrase plus un échec de rendu : l'erreur reste
  affichée, avec le renvoi vers les diagnostics.
- Le bouton Pages porte son nom en toutes lettres (« Pages », plus un
  glyphe dépendant de la police), avec un état actif visible quand la
  colonne est ouverte.

## Ce qui ne change pas

- Le rendu, les vignettes, les outils, le moteur : aucun changement.
- Leçon retenue : toute modification de la STRUCTURE de la rangée
  (nouveau panneau) devra désormais être accompagnée d'un examen écrit des
  quatre combinaisons de visibilité des panneaux.
