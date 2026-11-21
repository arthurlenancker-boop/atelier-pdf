# v0.1.17 — Interface neutre claire

Date : 21 novembre 2026. Demande d'Arthur : remplacer le thème sombre
« Glass on Charcoal » par un thème clair. Trois itérations de maquette
ont été rejetées comme artificielles : verre translucide sur blanc,
« Atelier calme » à encres ardoise, puis « table de correction » à fond
lin et accent rouge. Décision finale d'Arthur : l'ensemble faisait
artificiel.

## Décision

Abandon de tout « thème » authorial au profit des conventions des
logiciels Windows ordinaires. Le but est qu'aucun élément ne se fasse
remarquer : pas de concept, pas de palette signature, pas d'ombres
décoratives. L'application doit ressembler à un produit d'éditeur
établi et le regard doit aller uniquement au document.

## Réalisations

- « renderer/style.css » : gris neutres (fenêtre « #F3F3F3 », panneau
  « #F7F7F7 », zone de travail « #E9E9E9 », bordures « #DDDDDD »),
  encres neutres (« #1A1A1A », « #575757 », « #8C8C8C »), accent bleu
  standard (« #0067C0 », WinUI) réservé à l'outil actif et à l'action
  principale, rayons réduits à 6 / 6 / 4 / 3 px, panneaux plats sans
  ombre décorative (« --ombre-verre » neutralisé), état d'attente
  rehaussé par bordure pleine et fond franc.
- « renderer/app.js » : traits et zones d'interaction (sélection,
  poignées, gestes en cours, encadrés) passés à l'accent bleu ;
  encres des aperçus neutres ; cadres d'attente gris neutre.
- « main.js » : fond de fenêtre neutre « #F3F3F3 ».
- « renderer/index.html » : les glyphes décoratifs de la barre d'outils
  (dont la main en émoji, jugée artificielle) sont remplacés par des
  icônes vectorielles monochromes simples, dans le trait des logiciels
  professionnels ; seul « ∑ » reste, comme caractère mathématique.
- « renderer/index.html » : libellés de la barre supérieure alignés sur
  les conventions des logiciels : Annuler, Rétablir et Enregistrer
  deviennent des icônes avec info-bulle et libellé d'accessibilité ;
  « Copie horodatée » devient « Copie » avec info-bulle complète.
- « renderer/index.html » et « renderer/style.css » : le carré bleu
  d'initiales « Ap » est retiré de la barre ; le nom de l'application
  en clair suffit, comme dans les logiciels établis.
- Dernière passe d'épuration : survols neutralisés en gris clair (plus
  aucun liseré bleu au survol), pastille « modifié » réduite à un texte
  sobre sans capsule, libellé « Fenêtres guidées » épuré de sa
  parenthèse, cadre d'accueil plat sans ombre.
- « README.md » : mention de thème mise à jour (base SpotiKit,
  AGPL-3.0 inchangée).

## Ce qui ne change pas

- La mise en page de la v0.1.16 (rangée flexible, panneaux à largeur
  fixe, colonne de vignettes, barre à huit outils) est intacte.
- L'encre des annotations posées sur la page reste inchangée : c'est
  le contenu du document.
- Aucun changement de comportement : tous les tests existants passent
  sans modification.
