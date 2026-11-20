# v0.1.14 — La barre à huit outils et la machine à écrire (20 novembre 2026)

## Demande

Retour d'Arthur avant tout essai de la v0.1.13 : « le nombre d'outils est trop
grand et leur fonction pas claire » ; « on ajoute la machine à écrire ? ».
Sa capture d'origine (PDF-XChange : Enregistrer, Main, Sélectionner du texte,
Machine à écrire, Légende) sert toujours de référence.

## Décision (validée par Arthur : « huit outils : fusionner Note et Fiche »)

- AUCUN nouvel outil : la machine à écrire existe déjà, coupée en deux
  (l'ancien outil Note = texte nu à l'endroit exact du clic ; l'ancien outil
  Fiche = zone tracée au glissement, avec insertion de formules). La
  distinction était invisible pour l'utilisateur : c'était le défaut de
  clarté signalé.
- Fusion Note + Fiche en UN outil « Écrire » :
  - simple clic (ou micro-glissement de clic tremblé, moins de 5 pt dans
    chaque sens) : saisie du texte nu, exactement à l'endroit cliqué
    (ancien comportement Note, v0.1.12) ;
  - glissement réel : aperçu du rectangle, puis saisie dans la zone tracée
    à la mesure (ancien comportement Fiche), formules insérables comme
    depuis la v0.1.11 (ƒ ou Ctrl+M) ;
  - correction inchangée : double-clic rouvre l'objet, texte ou formules.
- La barre passe de neuf à huit outils, chaque info-bulle dit UNE
  fonction en une ligne : Main (faire défiler), Sélection (attraper,
  déplacer, redimensionner), Texte (sélectionner le vrai texte, surligner
  ou copier), Surligner (rectangle, pour les pages scannées sans texte),
  Encadrer (tracer un cadre), Encre (écrire à main levée), Écrire
  (machine à écrire), Équation (poser une formule).

## Ce qui ne change pas

- Le moteur ne bouge pas : la fusion ne concerne que la barre et le
  geste d'entrée ; les éditions posées restent celles d'avant (Text pour
  le texte nu, FreeText pour les zones), les fichiers déjà annotés
  s'ouvrent et se corrigent à l'identique.
- La Légende (callout à flèche) passe en v0.1.15, après l'essai réel.

## Vérifications

- node --check sur tous les fichiers (le rendu en module), tests locaux
  du moteur verts, tests CI (dont le déroulé complet) sur le flux de
  livraison, release vérifiée (somme de l'installateur contre la
  configuration de mise à jour), diff de l'arborescence distante vide.
