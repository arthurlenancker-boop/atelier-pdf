# v0.1.21 — Échap pose, et l'insertion de formule réparée

Date : 21 novembre 2026. Retour d'Arthur sur la v0.1.19/v0.1.20 :
« La fonction insertion de formule dans le cadre de texte ne
fonctionne pas, elle s'enlève quand j'appuie sur quoi que ce soit.
Peut être utiliser échap pour valider au lieu de cliquer autre part et
ctrl+échap pour passer une ligne ? ».

## Diagnostic

Le défaut remonte à la v0.1.18 : la règle « tout clic à l'extérieur
pose le texte » englobait LE PANNEAU ÉQUATION. Or composer une formule
pour la note se fait précisément dans ce panneau (saisie LaTeX,
fenêtres guidées, bouton « Insérer »). Chaque clic dans le panneau
refermait donc le cadre de texte, et l'insertion se perdait avec le
message « La saisie n'est plus ouverte » : d'où le ressenti « elle
s'enlève quand j'appuie sur quoi que ce soit ».

## Réalisations

- « renderer/app.js » (clicHorsEditeur) : le panneau Équation rejoint
  la liste des surfaces qui FONT PARTIE de la saisie (cadre, barre
  ƒ, aperçu, fenêtres guidées) : cliquer dedans ne pose pas le texte ;
  seul un clic sur la page pose, comme avant.
- « renderer/app.js » (toucheEchapEditeur) : nouvelle étiquette clavier
  à la demande d'Arthur — Échap POSE le texte (plus besoin de viser
  ailleurs), Ctrl+Échap passe à la ligne à la position du curseur.
  L'abandon d'un brouillon non vide se fait en effaçant le texte puis
  Échap : l'original réédité reste intact (comportement v0.1.18
  conservé). Le rappel sous le cadre affiche la nouvelle étiquette
  (« renderer/index.html »).
- « renderer/app.js » : Échap ferme la fenêtre guidée SEULE (il ne
  pose pas la note en dessous : la composition poursuit son cours) ;
  et Échap reste « annuler le remplacement » pour la modification
  d'équation posée sur la page quand aucun cadre n'est ouvert.

## Ce qui ne change pas

- Le clic sur la page pose toujours ; Ctrl+Entrée pose toujours ;
  Ctrl+M ouvre l'insertion de formule ; Entrée insère un retour à la
  ligne dans la note (Ctrl+Échap en est un second chemin).
- La police OneNote (v0.1.20), les formules en ligne à la Dmaths
  (v0.1.19), l'écriture directe (v0.1.18) : tout l'acquis est intact.
- Le moteur et le fichier produit : aucune modification engine.

## Vérifications

- Les cinq suites exécutables sans « node_modules » passent (59
  tests). « node --check » passe sur chaque fichier modifié.
