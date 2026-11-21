# Plan v0.1.24 — la fonction Équation de OneNote (21 novembre 2026)

Demandes et faisabilité : canvas spec-equation-onenote (spécification sourcée,
UTN28 v3.3), puis démo interactive demo-equation-gestes VALIDÉE par Arthur
(les deux gestes) avant l'intégration, selon la méthode éprouvée en v0.1.18.

## Les trois niveaux livrés

1. TRANSCODAGE COMPLET UnicodeMath → LaTeX : engine/unicodemath.js, moteur
   pur (double en-tête gardé, leçon v0.1.4), 58 tests ancrés sur UTN28
   (test/unicodemath.test.js). Couvre fractions a/b associées à gauche avec
   dépilage de parenthèses, scripts et préscripts \_a^b, radicaux √∛∜ avec
   degré √(5&a^2), n-aires ∫∬∭∮ ∑∏ ⋂⋃ avec bornes, ⅆⅈⅇ, fonctions et \lim,
   accents préfixés et postfixés (abc)\vec, \overbar, \vbar/\middle\vert,
   ¦ \atop \choose, \matrix (environnements selon le délimiteur),
   \eqarray→aligned, piles █/Ⓒ, \abs \norm \rect/\boxed, pré-substitutions
   \dd \ii \ee \open \close \cases \cbrt \qdrt /= <= >= ->.
   Politiques canoniques : le fermant consommé comme liant disparaît ; un
   délimiteur survit littéralement sauf contenu « grand » (frac, atop,
   n-aire, radical, pile, matrice) → \left…\right ; accolades minimales ;
   espacement de juxtaposition par règles.
   Le mode Linéaire du panneau Équation utilise ce moteur (l'ancienne
   table de simples substitutions reste en FILET pour les symboles encore
   littéraux : α, ⋯…).
2. MONTÉE À LA FRAPPE (le geste signature de OneNote) : en saisie
   linéaire, la barre d'espace transcode la frappe et monte la formule
   dans la zone structurée (bascule automatique Professionnel) ; la formule
   est vérifiée calculable par l'aperçu MathJax AVANT de monter ; le
   premier espace (saisie vide) reste un espace ordinaire.
3. ÉDITION STRUCTURÉE EN PLACE : MathLive 0.102.0 (MIT), ZONE STRUCTURÉE
   du panneau Équation en mode Professionnel. Le curseur vit dans la
   structure, la correction se fait sur place, les boutons du ruban
   (préréglages, structures, symboles, fenêtres guidées) insèrent à la
   position du curseur. Le champ LaTeX de toujours (textarea) subsiste :
   c'est la saisie linéaire ET le repli complet si le module ne charge pas
   (leçon v0.1.2/v0.1.4 : import dynamique seul, échec affiché, application
   jamais cassée). Le rendu final du PDF reste le pipeline MathJax→SVG→PDF
   existant, inchangé : l'édition et le rendu sont deux moteurs distincts,
   de très légères différences de composition sont possibles (annonce
   honnête faite à Arthur).

## Détails

- MathLive VENDORED : dépendance npm `mathlive` "0.102.0" (version figée),
  servie par app://local/libs/ comme pdf.js et tesseract.js, empaquetée par
  extraResources. Le paquet npm 0.102.0 contient dist/mathlive.min.mjs
  (790 191 octets, exactement le bundle validé dans le prototype) ET les
  polices KaTeX dans dist/fonts : aucune fonte base 64 à committer.
  MathfieldElement.fontsDirectory est réglé explicitement sur
  app://local/libs/mathlive/dist/fonts/ ; soundsDirectory null (silence).
  Garde-fou de livraison : le paquet Windows doit contenir
  node_modules/mathlive/dist/mathlive.min.mjs et une police KaTeX.
- Le contenu suit la bascule Professionnel/Linéaire : plus jamais de
  formule perdue en changeant de mode (la zone structurée reçoit le LaTeX
  monté, le champ de toujours le conserve).
- Ruban enrichi : préscripts {}_a^b x, ∬ ∭ ⋂ ⋃, valeur absolue et norme
  EXTENSIBLES (\left|…\right|, \left\|…\right\|), \boxed, symboles ∬∭∮⋂⋃∐
  en catégorie « Grands opérateurs » (ils rejoignent la table Linéaire) ;
  fenêtre matrice jusqu'à 6×6 (engine/guides.js bornes [1;6], test
  rouge-vert : 4 lignes et clamp à 6 vérifiés).
- Corrections d'équation existante, fenêtres guidées, insertion dans les
  fiches et notes (v0.1.11/v0.1.19) : chemins inchangés, ils passent par
  poserChampEquation/insererAuChamp à double chemin (zone structurée ou
  champ de toujours).
- Diagnostics (menu Aide) : état de la zone structurée (chargée, repli,
  motif de l'échec).

## Vérifications locales

node --test test/unicodemath.test.js test/guides.js : 75/75 verts.
node --check engine/*.js main.js preload.js ; app.js en module (--input-type=
module --check). Le reste de la suite (pdf-lib, mathjax-full) : CI.
