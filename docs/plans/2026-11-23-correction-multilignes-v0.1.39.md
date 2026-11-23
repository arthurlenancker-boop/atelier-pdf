# La correction multi-lignes qui s'applique : v0.1.39

Date : 2026-11-23. Déclencheur : retour d'Arthur après la v0.1.38 —
« c'est ça aussi qui me gêne une boîte s'ouvre et ce n'est pas utile
pour modifier », avec deux captures d'une page de cours à texte réel
(outil Sélection actif et éditeur de correction ouvert).

## Symptôme rapporté et clarifié

La première capture montre, en bas à gauche de la fenêtre, un toast
d'erreur brut : « WinAnsi cannot encode (0x000a) ». La seconde montre
l'éditeur de correction en place sur la page. Autrement dit : la boîte
s'ouvre correctement, mais la pose ÉCHOUE, et l'erreur affichée est le
message interne de pdf-lib, sans traduction ni récupération. La
correction disparaît alors silencieusement : « ce n'est pas utile pour
modifier ».

## Diagnostic (sourcé dans le code, pas deviné)

1. Le message vient de @pdf-lib/standard-fonts (encodeUnicodeCodePoint
   jette « <name> cannot encode "<char>" (0x…) » pour tout caractère
   hors WinAnsi). pdf-lib lève la même erreur dans widthOfTextAtSize :
   MESURER un tel caractère est impossible, pas seulement l'écrire.
2. Sur une page à texte réel, la source préremplie dans l'éditeur joint
   les lignes du bloc par \n (engine/textereel.js, regrouperEnLignes ;
   la transcription d'un scan fait de même). Or composerLignes
   (engine/texte.js) traitait \n comme un simple espace : le fragment
   « \n » parvenait tel quel à la mesure pdf-lib, qui rejetait la pose
   ENTIÈRE.
3. La reprise d'une correction procède par retrait puis pose
   (main.js, lot pdf:apply). Quand la pose échoue, l'annotation d'origine
   est déjà retirée et jamais reposée : d'où le format précédent « le
   texte reste tel qu'il était ».
4. Même fragilité latente dans les moteurs voisins : engine/melange.js
   et engine/riche.js mesurent le texte BRUT alors que leur affichage
   écrit du texte translittéré (tolérant).

0x000a est le code du retour à la ligne (repère \n) : le toast désignait
exactement le caractère qui faisait échouer la pose.

## Correctif (sans changer le format des fichiers)

1. engine/texte.js, composerLignes : le texte est découpé sur
   /\r?\n/ ; chaque saut de ligne devient un retour à la ligne RÉEL
   dans l'apparence composée (cloreLigne à chaque saut, espace
   suspendu remis à zéro). \r\n et \n isolés se comportent pareil.
2. Durcissement des moteurs de pose (correction, melange, riche) : la
   MESURE porte désormais sur le texte AFFICHÉ —
   sanitizeWinAnsi(translitterMathWinAnsi(texte sans \n\r)). La mesure
   ne rejette PLUS jamais la pose (tout caractère non WinAnsi devient
   « ? » dans la mesure, comme à l'affichage), et elle est fidèle au
   rendu final. La SOURCE, elle, voyage intacte dans /Contents :
   la relecture au double-clic reste exacte, y compris avec \n, Ω ou
   un émoji.

## Tests

- test/texte.js (23) : la mesure de référence confirme que pdf-lib
  JETTE bien sur \n (la régression est réelle) ; « la première
  ligne\nla seconde » se compose en 2 lignes exactes ; \r\n idem ;
  3 sous-lignes donnent 3 lignes.
- test/correction.test.js (12) : une source multi-lignes se pose ENFIN
  (plus de rejet), la source est relue EXACTEMENT (0x0a compris),
  l'apparence contient deux lignes réelles (deux « Tm ») et non un
  amas ; une source à caractères exotiques (Ω, émoji) ne bloque plus
  la pose.
- Suite locale : 288 tests (287 verts, 1 saut tesseract réservé à la
  CI).

## Limites assumées

Un caractère exotique s'affiche « ? » à l'écran ET dans le PDF posé
(les polices standard du format ne l'encodent pas), la source reste
nouvellement intacte à la reprise. La boîte de correction elle-même
(cadre en place avec sa barre de formules) est inchangée : si sa
présence gêne, c'est un ajustement d'interface à part.
