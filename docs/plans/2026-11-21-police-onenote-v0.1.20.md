# v0.1.20 — La police de OneNote pour la machine à écrire

Date : 21 novembre 2026. Retour d'Arthur sur la v0.1.19, captures à
l'appui : « cette police est moche, regarde celle de OneNote qui est
magnifique ». La police Cambria Math appliquée à TOUTE la note
(v0.1.19) rendait les phrases en caractères techniques droits, là où
ses pages OneNote montrent des phrases dans une police moderne et
économe et des équations composées en italique mathématique.

## Diagnostic

La v0.1.19 avait confondu deux besoins distincts, que OneNote sépare
nettement : la police du CORPS (prose des pages, Aptos puis Calibri)
et le rendu des MATHS (italique mathématique composé, indépendant de
la police de frappe). La note doit suivre cette même séparation.

## Réalisations

- « renderer/style.css » : la zone de saisie d'une note compose en
  « Aptos, Calibri, Segoe UI, sans-serif » — les polices corps de
  OneNote (le cru récent d'abord, le classique universel ensuite).
- « renderer/app.js » : la note posée s'affiche dans la même pile de
  polices corps, alignée sur ce que le cadre de saisie a montré.
- Les formules $...$ de la note ne changent pas : composées à la pose
  par le moteur d'équations, elles gardent l'italique mathématique
  élégant déjà montré par l'aperçu flottant — c'est exactement le
  deux-tons des pages OneNote de référence.

## Ce qui ne change pas

- L'outil Écrire, les fenêtres guidées, la note mixte sans carte, le
  marqueur « Note » : tout l'acquis de la v0.1.19 est intact.
- La fiche sur carte, l'interface neutre, le panneau Équation et ses
  saisies LaTeX (Cambria Math y reste adaptée au code mathématique).
- Le moteur et le fichier produit : aucune modification engine.

## Vérifications

- Les cinq suites exécutables sans « node_modules » passent (59
  tests). « node --check » passe sur chaque fichier modifié.
