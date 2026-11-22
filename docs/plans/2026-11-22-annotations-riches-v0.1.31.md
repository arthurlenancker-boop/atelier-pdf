# v0.1.31 — Annotations riches : formes et couleurs de Surligner/Encadrer, cercle chromatique, Écrire en texte riche

Arthur, 22 novembre 2026, après la maquette canvas
« Atelier PDF : maquette couleurs, formes, tailles et texte », message
final : « Validé ». La maquette est la source exacte des commandes,
des palettes et des formes à construire telles quelles.

## Décisions (tout vient de la maquette validée)

### Surligner
- Quatre formes : Plein, Soulignement, Barré, Ondulé. Chaque forme
  est une annotation PDF STANDARD distincte : /Highlight, /Underline,
  /StrikeOut, /Squiggly, la couleur voyage dans /C, les rectangles
  dans /QuadPoints. Lisible telle quelle dans Adobe, Edge, LibreOffice.
- Huit couleurs : #FFDF3A #FFA53A #FF7A6B #FF7AD9 #7BE37B #7BC8FF
  #B39CFF #7BE3D0, plus le cercle chromatique (couleur libre).
- AP propre à chaque forme : aplat semi-transparent (ca 0.35) pour le
  plein ; trait plein dans le bas du quad pour le soulignement ; trait
  au milieu pour le barré ; onde régulière pour l'ondulé.

### Encadrer
- Quatre formes : Rectangle, Arrondi, Ellipse, Nuage. L'ellipse est
  un /Circle standard ; les autres restent des /Square ; l'effet nuage
  voyage dans /BE { S /Cloudy, IW } (standard), dessiné aussi en AP.
- Trait : Continu, Tirets ([7 5]), Pointillés ([0.2 6], caps rondes) —
  écrits dans /BS { W, D, Cap } ET dans l'AP.
- Épaisseur : fin 1.3, moyen 2.2, épais 3.4.
- Remplissage : Transparent ou Teinté (la couleur à 13 % d'opacité,
  ExtGState ca 0.13 dans l'AP, /IC porte la couleur pour les lecteurs).
- Sept couleurs : #1A1A1A #7A7A7A #D13438 #CA5010 #107C10 #0067C0
  #8764B8, plus le cercle chromatique.
- Les options de pose voyagent dans /Contents derrière le marqueur
  « Cadre forme,trait,épaisseur[,teinte] » : le redimensionnement
  REPose le cadre avec ses options (comme la fiche mixte repose sa
  source), au lieu d'écraser la forme en rectangle nu.

### Cercle chromatique (partagé)
- Roue HSV sur canvas, curseur Clarté, aperçu et hex, sous chaque
  palette. Une pastille personnalisée mémorise la dernière couleur
  libre de chaque palette. Aucune ressource externe (CSP respectée).

### Écrire : texte riche
- L'éditeur sur la page devient ÉCRITURE RICHE : zone contenteditable
  (les formules $...$, Échap-pose, Ctrl+Échap-nouvelle ligne et le
  bouton ƒ sont conservés à l'identique).
- Tailles : 8 à 36 pt par cran (défaut 11), enregistrée dans le
  marqueur de la note.
- Mise en forme : Gras, Italique, Souligné, Barré, Exposant, Indice ;
  Alignement gauche/centre/droite ; Listes à puces et numérotées ;
  Couleur du texte (palette + roue) ; Fond du texte (palette + roue,
  opacité 0.6).
- Le texte posé est une annotation /FreeText standard dont /Contents
  embarque la SOURCE derrière le marqueur « Note riche <taille> :
  <source> », sous forme d'un sous-ensemble HTML canonique (b, i, u,
  s, sup, sub, span style couleur/fond, div alignement, ul/ol, br).
  Relecture fidèle au double-clic, comme les fiches mixtes. Les notes
  et fiches posées ANTERIEUREMENT se rééditent : leur texte nu devient
  une source riche sans mise en forme.
- Le rendu fichier (AP) compose paragraphes, alignements, listes,
  tailles, styles, couleurs, fonds et formules $...$ en Helvetica
  régulière/grasse/italique/graisse italique (WinAnsi, valeurs
  vectorielles) ; l'écran repeint la même composition sur le calque.

### Outil Trait
- Non couvert par cette version : la maquette le laissait inchangé.
  Ses options viendront plus tard ; documenté dans l'aide.

## Fichiers

- engine/couleurs.js (NOUVEAU, pur, double en-tête) : hex <-> rgb,
  hex <-> rgb 0..1, HSV -> rgb pour la roue. Testable localement.
- engine/markup.js (NOUVEAU, pur, double en-tête) : analyse du
  sous-ensemble HTML canonique en blocs (type, alignement, numéro de
  liste, runs stylés) + compositeur de lignes riches ( retour à la
  ligne, formules insécables, alignement, retrait des listes ) partagé
  par l'AP fichier et le peintre écran. Testable localement.
- engine/texte.js : marqueur « Note riche [taille] : » et ses lecteurs,
  même famille que « Fiche mixte » et « Correction OCR ».
- engine/annots.js : addHighlight gagne forme (sous-types + AP) ;
  addSquare gagne forme, trait, épaisseur, teinte (/Circle, /BE,
  tirets, marqueur Cadre).
- engine/riche.js (NOUVEAU, pdf-lib/MathJax, tests en CI) : addNoteRiche
  pose le /FreeText riche et son AP.
- engine/session.js : kind « noteRiche ».
- engine/bouger.js : translation des opérateurs cubiques (c) des
  nouvelles AP ; le redimensionnement repose la note riche
  (marqueur, taille, sujet conservés) et le cadre à options.
- engine/reread.js : lecture de /C, /IC, /BS et /QuadPoints pour que
  l'écran peigne les vraies couleurs et les lignes de chaque surlignage.
- renderer/index.html : panneau d'options (Surligner, Encadrer,
  Écrire) à droite, zone d'ériture riche dans le cadre posé.
- renderer/style.css : styles du panneau, des pastilles, de la roue et
  de la zone riche, dans la langue visuelle existante.
- renderer/app.js : état des options par outil, construction des
  palettes et de la roue, gestes enrichis (forme + couleur + trait +
  teinte passés au moteur), éditeur riche (contenteditable, mise en
  forme, sérialisation canonique, relecture), peinture écran des
  surlignages à leur couleur et forme, des cadres (rect/arrondi/
  ellipse/nuage, tirets, teinte) et des notes riches, aide mise à
  jour, formules des notes riches composées au corps de leur marqueur.
- docs/utilisation.md, README.md : documentation des nouveautés.
- package.json 0.1.31 ; .github/workflows/etag.yml : déclencheur
  v0.1.31 en tête de commentaires.

## Tests

- Locaux (node --test, aucune dépendance) : test/couleurs.test.js,
  test/markup.test.js (analyse canonique, composition des lignes,
  alignements, listes, styles, formules insécables).
- CI (pdf-lib/MathJax) : annots.test.js étendu (formes de surlignage,
  /Circle, nuage /BE, tirets /BS, teinte /IC), riche.test.js (AP de la
  note riche : polices, marqueur, relecture, couleur dans le flux),
  bouger.test.js (translation des cubiques, repos de la note riche et
  du cadre à options), reread.test.js (/C, /IC, /BS, /QuadPoints).
- node --check après chaque édition ; test des fonctions async par
  assert.rejects ; vérification des jetons des opérateurs PDF.

## Vigilances du projet appliquées

- Aucune dépendance nouvelle ; double en-tête gardé pour couleurs.js
  et markup.js (partagés rendu/moteur).
- Annotations 100 % standard (/C, /BS, /BE, /IC, /QuadPoints, /DA) :
  lisibles et imprimables partout.
- Relecture de la tête de main avant la poussée (un flux parallèle a
  livré la v0.1.29 pendant la maquette).
- Échec des tests = pas de livraison : le flux Livraison teste avant
  de construire.
