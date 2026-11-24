# Atelier PDF — guide d'utilisation

Version 0.1.0 — phase 1 : annotations standard et équations LaTeX.

## 1. Installer

1. Téléchargez le fichier `atelier-pdf-setup-0.1.0.exe` (installateur) ou
   `atelier-pdf-portable-0.1.0.exe` (exécutable unique, rien à installer)
   depuis la page Releases du dépôt GitHub.
2. Ouvrez-le. Au premier lancement, Windows Defender SmartScreen peut
   afficher un avertissement : l'application n'est pas signée (signature
   payante hors périmètre). Choisissez « Informations complémentaires »
   puis « Exécuter quand même ».
3. Rien d'autre : aucune connexion à un service en ligne, aucun compte,
   aucune dépendance à installer.

## 2. Ouvrir un document

Trois chemins : bouton Ouvrir, menu Fichier → Ouvrir… (Ctrl+O), ou
glisser-déposer un fichier PDF sur la fenêtre. Le document s'affiche page
par page ; la barre d'état indique le nombre de pages.

Un fichier corrompu, chiffré ou non-PDF produit un message explicite :
rien ne se ferme, rien n'est modifié.

## 3. Les cinq annotations

Toutes les annotations sont écrites dans le fichier PDF, au format standard.
Elles apparaissent dans Adobe Acrobat, Edge et LibreOffice, et s'impriment
(drapeau d'impression posé).

| Outil | Geste | Résultat dans le fichier |
| --- | --- | --- |
| Surligner | glisser sur une ligne de texte | /Highlight, /Underline, /StrikeOut ou /Squiggly selon la forme choisie |
| Encadrer | glisser un rectangle | /Square ou /Circle, forme et trait du panneau d'options |
| Encre | tracer à main levée | /Ink (polygone) |
| Écrire | clic ou glisser une zone | note riche /FreeText : texte mis en forme écrit sur la page |

Sur une page tournée (scan à plat par exemple), l'outil reste aligné : le
point visé est le point annoté.

Depuis la v0.1.31, chaque outil d'annotation ouvre son panneau d'options à
gauche de la page : formes, couleurs, palettes et cercle chromatique.

### Surligner : quatre formes, huit couleurs

- Formes : surlignage plein (/Highlight), soulignement (/Underline),
  barré (/StrikeOut) et ondulé (/Squiggly, la vague du correcteur).
- Couleurs : jaune, orange, corail, rose, vert, bleu ciel, mauve et
  turquoise ; une case « + » ouvre le cercle chromatique (teinte au
  contour, clarté au glissement vertical) puis valider.

### Encadrer : quatre formes, sept couleurs, trois traits

- Formes : rectangle, rectangle arrondi, ellipse et nuage (bulle de BD,
  bord /Cloudy).
- Trait : continu, tirets ou points ; épaisseur fin (1,3 pt), moyen
  (2,2 pt) ou épais (3,4 pt).
- Remplissage : transparent ou teinté (la couleur du cadre, translucide).
- Couleurs : noir, gris, rouge, orange, vert, bleu et violet, plus le
  cercle chromatique.

### Écrire : la machine à écrire riche

Un clic pose un texte nu à l'endroit cliqué ; un glissement trace la zone
de saisie. Le texte se compose dans un éditeur WYSIWYG posé sur la page :

- taille de corps de 8 à 36 pt (stepper, valable pour toute la note) ;
- gras, italique, souligné, barré, exposant, indice ;
- couleur du texte et couleur de fond (translucide) ;
- alignement gauche, centré, droite ; listes à puces et numérotées ;
- formules LaTeX entre dollars dans le texte (`$E = mc^2$`), composées
  par le moteur d'équations, aperçu en direct sous la saisie.

Depuis la v0.1.36, les formules se composent AUSSI dans le cadre
d'édition : à la reprise d'une note comme à l'insertion depuis le
panneau Équation, la formule s'affiche composée (fraction, racine…)
à sa place dans le texte, sur la ligne de base, comme la page la
posera. Le code LaTeX n'apparaît plus : un double-clic sur une
formule composée l'ouvre dans le panneau Équation pour correction
(bouton « Remplacer la formule »). Si la composition échoue, le
code entre dollars reste visible et modifiable comme avant. Le
fichier enregistré ne change pas d'un caractère.

Une annotation posée se sélectionne à l'outil Sélection : la poignée
bas-droite l'élargit (le texte se recompose), le glissement la déplace,
Suppr la retire. Le bouton Équation ouvre aussi une note riche cliquée
pour la corriger.

L'outil Trait conserve son comportement antérieur (encre à main levée) ;
il n'est pas couvert par le panneau d'options.

## 4. Équations LaTeX

1. Choisissez l'outil Équation : le panneau latéral s'ouvre.
2. Cliquez sur la page à l'endroit voulu (le point d'insertion est mémorisé).
3. Composez la formule :
   - mode Professionnel : saisie LaTeX directe ;
   - mode Linéaire : saisie à plat, les symboles (±, ×, α, ≤…) sont convertis.
4. Le ruban aide la composition : préréglages (carré, différence, racines,
   somme, trigonométrie), structures (fraction, racines, grands opérateurs,
   crochets, fonctions et limites, accents, matrices) et symboles.
5. L'aperçu se met à jour au fil de la saisie ; une erreur LaTeX s'affiche
   en rouge dans le panneau, rien n'est inséré.
6. Bouton Insérer dans la page : l'équation est rendue en vecteurs et
   inscrite dans le PDF.

Une équation insérée se sélectionne à l'outil Sélection (clic) et se
supprime avec la touche Suppr, comme toute annotation.

### Équation au fil du texte, à la frappe (v0.1.44)

Le panneau reste utile, mais la formule peut aussi s'écrire AU CURSEUR,
sans quitter le texte, comme dans OneNote :

- Dans une note ou une ligne modifiée, tapez la séquence Alt puis
  S, 0, 0, Q (les chiffres à la Maj Azerty) : la zone d'équation
  s'ouvre à l'endroit du curseur, marquée d'une légère teinte.
- Tapez la formule en linéaire (le même langage que le mode Linéaire :
  a/b, x^2, \sqrt(5&a^2)…) ; la barre d'espace MONTE la formule à
  chaque pression, sur place.
- Échap ou Entrée pose l'équation et efface la teinte ; le texte
  redevient du texte. Une zone vide ne pose rien. Dans une correction,
  la première pression d'Échap pose l'équation, la seconde abandonne
  la ligne, comme toujours.
- La formule prend la COULEUR du texte qui l'entoure : l'encre de la
  correction (échantillonnée depuis la v0.1.43) ou la couleur du run
  dans une note (le fichier et l'écran composent dans la même).
  Les mathématiques restent composées dans la fonte TeX de MathJax
  (Cambria Math n'est pas embarquable), au corps du texte environnant.

### Netteté pleine densité à l'écran (v0.1.45)

- L'affichage vit à la densité réelle de l'écran : sur un écran en
  mise à l'échelle Windows (125 ou 150 pour cent, le réglage par défaut
  des ordinateurs portables récents), les formules, les annotations et
  l'aperçu de la page sont composés avec autant de pixels que l'écran
  en montre réellement. Avant le v0.1.45, une formule posée paraissait
  grasse et floue : le bitmap était dessiné à la résolution CSS puis
  agrandi par le système.
- Le fichier n'est pas concerné : les équations y sont des vecteurs
  purs, nets dans tout lecteur (PDF-XChange, Adobe, navigateurs), à
  toute échelle. Le correctif ne touche que l'écran.
- À 100 pour cent de mise à l'échelle, rien ne change.

## 5. Enregistrer

- Enregistrer (Ctrl+S) : réécrit le fichier ouvert avec toutes les
  annotations. Le contenu original est remplacé : c'est le but (tout est
  dans le PDF).
- Copie horodatée (Ctrl+Maj+S) : crée `nom-AAAA-MM-JJ-HHmmss.pdf` à côté
  de l'original, qui n'est pas touché.

La pastille « modifié » signale un document non enregistré.

### Onglets et fermeture assistée (v0.1.30)

- Ouvrez autant de PDF que vous voulez : chacun a son onglet dans la bande
  sous la barre du haut. Un clic rend un onglet actif ; la page et le zoom
  de chaque onglet sont gardés : la reprise est à l'identique.
- La croix d'un onglet (ou Ctrl+W pour l'onglet actif) le ferme. Ouvrir un
  fichier déjà présent dans un onglet réactive cet onglet : un même PDF
  n'est jamais ouvert ni édité en double.
- Si le document à fermer (onglet ou fenêtre entière : croix, Alt+F4,
  menu Quitter) a des modifications non enregistrées, l'application
  demande d'abord : **Enregistrer**, **Fermer sans enregistrer**, ou
  **Annuler**. À la fermeture de la fenêtre, chaque onglet modifié est
  demandé un par un ; « Annuler » arrête net et vous garde la main.

## 6. Reconnaissance du document à l'ouverture

Depuis la v0.1.28, si votre serveur OCR personnel est configuré (menu
Fichier → Options OCR LaTeX…, choix « Mon serveur OCR »), l'ouverture
d'un document lance la reconnaissance de toutes les pages, l'une après
l'autre, entièrement chez vous.

- Une barre fine sous la barre d'outils montre la progression. Tant
  qu'aucune page n'est revenue, elle va et vient (elle « navigue ») :
  c'est le chargement du moteur, long seulement à la toute première
  reconnaissance ; ensuite elle avance par page terminée.
- La colonne des pages (bouton Pages) raconte la même histoire : la
  page en cours est cerclée de bleu, les pages reconnues portent une
  coche et leur numéro passe au bleu.
- La barre d'état indique la page en cours et le décompte (« page 3 sur
  12, 2 pages reconnues »), avec un lien Arrêter : la page en cours
  s'achève, puis plus rien n'est envoyé. Rien n'est cassé côté serveur.
- Le document reste entièrement lisible et annotable pendant toute
  la reconnaissance.
- Sans serveur personnel configuré (mode OCR Mistral ou rien), l'ouverture
  ne déclenche aucune reconnaissance automatique.
- Les pages reconnues restent en mémoire de l'application, rien n'est
  écrit dans le fichier PDF.

## 7. Corriger la page reconnue, en place

Depuis la v0.1.29, à l'outil Sélection, les blocs reconnus de la page
affichée apparaissent soulignés d'un contour discret, à leur position
et taille réelles.

- Un clic sur un bloc de texte ou un titre ouvre la correction
  EXACTEMENT à sa place, préremplie du texte reconnu, à la taille
  estimée du bloc. Corrigez la coquille, puis Entrée (ou un clic à
  côté) pour poser ; Échap abandonne et rend l'original intact ;
  Maj+Entrée (ou Ctrl+Échap) passe à la ligne ; un texte vidé
  abandonne aussi la correction (v0.1.41 : l'étiquette clavier des
  corrections est celle de l'outil Modifier). Depuis la v0.1.43, le
  texte corrigé reprend AUSSI la couleur d'encre du texte remplacé
  quand il vit sous le rectangle (page à texte réel).
- Un bloc de formule s'ouvre pareil, prérempli de son LaTeX entre
  dollars ($...$) : la formule corrigée est composée par le moteur
  d'équations, comme une équation posée.
- À l'enregistrement, la correction fait deux choses dans le
  fichier : un rectangle blanc opaque COUVRE l'original du bloc (le
  scan, ou la ligne d'origine d'une page à texte réel), puis
  le texte corrigé est écrit en texte vectoriel standard. Dans tous
  les lecteurs, le texte devient sélectionnable et imprimable ; les
  blocs intacts restent l'image du scan, sans perte.
- Un bloc déjà corrigé se signale à même la page : le clic le REPREND
  (au lieu d'en empiler une seconde).
- Le bouton Reco masque ou remet l'aperçu. Masqué, les annotations
  posées (corrections comprises) redeviennent saisissables à la
  Sélection : les déplacer, les redimensionner, ou Suppr pour les
  retirer.
- Réserve : la correction écrit dans le rectangle du bloc, sans
  recomposer le paragraphe entier ni traiter les tableaux reconnus.

## 7 bis. Modifier une phrase, comme dans Word (v0.1.41)

L'outil Modifier (à côté d'Écrire dans la barre d'outils) complète le
clic sur les blocs reconnus : il ne demande ni aperçu ni page
préalablement reconnue, il travaille là où vous cliquez.

- Cliquez dans une phrase du document : la LIGNE cliquée s'ouvre à sa
  place, marquée d'une légère teinte de fond et d'un liseré discret,
  le curseur au caractère le plus proche du clic. L'original
  disparaît sous un masque blanc le temps de l'édition : la ligne se
  lit une seule fois, la vôtre.
- Tapez, supprimez, remplacez librement : la police (Times ou
  Helvetica), la taille mesurée sur place, le gras et la COULEUR de
  l'encre de la ligne sont repris à l'identique, le texte ajouté se
  fond dans le document. Un texte rose reste rose, un titre bleu reste
  bleu (v0.1.43) ; les textes noirs ou gris sont écrits dans le gris
  fidèle de l'atelier. Une correction reprise ou déplacée garde aussi
  sa couleur.
- Sur une page scannée, le clic ouvre le bloc reconnu qui contient le
  point (même chemin que le bouton Reco) ; une page scannée non
  reconnue vous invite à armer d'abord l'outil Texte.
- Entrée pose la modification ; Maj+Entrée (ou Ctrl+Échap) passe à la
  ligne ; Échap abandonne et rend l'original intact ; un clic à côté
  pose aussi.
- Une correction déjà posée se reprend par un nouveau clic dessus
  (à l'outil Modifier comme à la Sélection) au lieu d'en empiler une
  seconde.

## 8. Questions fréquentes

- Mes annotations disparaissent dans un autre logiciel ? Elles y sont :
  surlignage, cadre, encre, note et fiche suivent le format standard des
  annotations PDF. Si un lecteur n'affiche pas les annotations, vérifiez
  que son affichage des annotations/commentaires est actif.
- Puis-je modifier une annotation posée par un autre logiciel ? Non :
  elle s'affiche en lecture seule (rectangle pointillé). L'édition de ces
  annotations est prévue en phase 2.
- L'application se met à jour seule ? Oui, silencieusement, depuis les
  releases GitHub ; en cas d'échec (hors ligne), rien n'est affiché.
- Comment vérifier que tout est bien dans le fichier ? Ouvrez la copie
  horodatée dans Adobe Acrobat ou LibreOffice, imprimez-la : tout y est.
