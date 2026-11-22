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
| Surligner | glisser sur une ligne de texte | /Highlight translucide (opacité 0,35), quadrilatère exact du glissement |
| Encadrer | glisser un rectangle | /Square à bordure rouge |
| Encre | tracer à main levée | /Ink (polygone) |
| Note | clic, puis saisir le texte | icône post-it /Text (Comment), texte au survol dans Adobe |
| Fiche | glisser une zone, puis saisir | /FreeText : texte écrit sur la page |

Sur une page tournée (scan à plat par exemple), l'outil reste aligné : le
point visé est le point annoté.

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

## 5. Enregistrer

- Enregistrer (Ctrl+S) : réécrit le fichier ouvert avec toutes les
  annotations. Le contenu original est remplacé : c'est le but (tout est
  dans le PDF).
- Copie horodatée (Ctrl+Maj+S) : crée `nom-AAAA-MM-JJ-HHmmss.pdf` à côté
  de l'original, qui n'est pas touché.

La pastille « modifié » signale un document non enregistré.

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
  estimée du bloc. Corrigez la coquille, cliquez à côté (ou Échap)
  pour poser ; un texte vidé abandonne la correction.
- Un bloc de formule s'ouvre pareil, prérempli de son LaTeX entre
  dollars ($...$) : la formule corrigée est composée par le moteur
  d'équations, comme une équation posée.
- À l'enregistrement, la correction fait deux choses dans le
  fichier : un rectangle blanc opaque COUVRE le scan du bloc, puis
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
