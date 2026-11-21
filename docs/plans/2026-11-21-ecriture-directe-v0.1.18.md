# v0.1.18 — Écriture directe sur la page (façon PDF-XChange)

Date : 21 novembre 2026. Demande d'Arthur (capture à l'appui) : « j'aimerai
modifier et écrire directement dans ce carré », puis précision : « comme
dans PDF-XChange Editor, on écrit directement ce qui va apparaître, sous
la forme qui va apparaître ». Jusqu'ici, Écrire ou Note ouvraient une
fiche d'édition séparée (titre « Note », boutons Annuler / Poser), la
note nue s'éditant même à côté de sa position réelle.

## Décision

La fiche d'édition disparaît : le cadre posé sur la page EST la zone
d'écriture, exactement comme l'éditeur de PDF-XChange. Comportement
validé sur une démonstration manipulable avant la construction.

## Réalisations

- « renderer/index.html » : la carte d'édition est réduite à la zone de
  texte ; titre, boutons Annuler / Poser et actions disparaissent. La
  barre « ƒ Insérer une formule » et l'aperçu rendu deviennent des
  flottants posés par le code sous le cadre.
- « renderer/style.css » : le cadre revêt la mise en forme EXACTE de
  l'annotation finale — note nue : texte sombre sans fond ; fiche :
  carte bleu nuit à écriture blanche ; fiche mixte : carte quasi
  blanche à liseret ardoise ; commentaire sur icône : surface neutre.
  Seule marque d'édition : un liseret bleu (accent du logiciel) et son
  voile léger, qui disparaissent à la pose.
- « renderer/app.js » : typographie du cadre calée sur le rendu final
  (11 pt × zoom, interligne 13 × zoom, marges de l'annotation) ; le
  cadre s'ouvre sur le rectangle même de l'annotation, plus de décalage
  pour les notes ; il grandit quand le texte déborde ; l'annotation
  rééditée s'efface du calque le temps de l'écriture (pas de doublon
  sous le cadre) ; tout clic à l'extérieur pose le texte, Échap
  abandonne, Ctrl+Entrée pose aussi ; un brouillon vide n'efface plus
  l'annotation rééditée et n'affiche plus d'avertissement : c'est un
  abandon silencieux qui rend l'original intact.

## Ce qui ne change pas

- Le fil d'édition (retrait + pose), le moteur, les formules des
  fiches et leurs fenêtres guidées, l'annulation (Ctrl+Z) : rien n'a
  bougé. Les 59 tests locaux du moteur passent sans modification.
- L'interface neutre livrée en v0.1.17 est intacte.
