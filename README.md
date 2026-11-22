Atelier PDF
===========

Éditeur PDF de bureau pour préparer des cours : les annotations standard et les équations LaTeX sont écrites dans le fichier PDF lui-même, sans calque propriétaire. Le fichier annoté reste lisible et imprimable par tout lecteur (Adobe Acrobat, Edge, LibreOffice), et l'impression conforme est déjà dans le fichier (drapeau /F 4, apparence /AP).

Un mix volontaire de OneNote (ruban Équation, structures et préréglages) et d'un éditeur PDF classique, pour un enseignant qui ne veut que deux choses : surligner, encadrer, écrire et poser des maths sur ses documents, puis les enregistrer proprement.

Deux sortes d'équations : un mode Professionnel (zone d'équation structurée, édition et correction en place, MathLive depuis la v0.1.24 ; saisie LaTeX directe en repli) et un mode Linéaire à la OneNote (depuis la v0.1.24, le langage UnicodeMath complet : a/b, x^2, √(5&a^2), ∫_0^1 xⅆx, (ABC)\vec, \matrix(1&2@3&4)… et la barre d'espace MONTE la formule) ; les commandes à barre oblique de OneNote sont admises à la frappe — \times, \cdot, \Leftrightarrow, \alpha… : la barre d'espace les convertit — et depuis la v0.1.27 une commande suivie d'un autre atome ne se colle plus et un symbole inconnu n'efface plus la fin de la saisie ; depuis la v0.1.32 la zone d'équation structurée compose elle aussi la commande à la barre d'espace : \delta puis Espace donne δ, comme OneNote, et la palette Grecques porte l'alphabet complet), un aperçu vectoriel avant insertion, structures de ruban (fraction, racine, préscripts, somme, intégrales simple/double/triple/circulaire, ⋂⋃, crochets extensible et boîte, matrices, accents, fonctions et limites), préréglages d'identités remarquables et symboles usuels. Le rendu final du PDF reste le moteur MathJax en place depuis la v0.1.0 : l'édition et le rendu final sont deux moteurs distincts, l'aperçu d'édition peut différer très légèrement du PDF. Depuis la v0.1.5, des fenêtres guidées à la manière de Dmaths (quotient, racine, limite, intégrale/somme/produit, dérivée, primitive, vecteur, angle et produit de vecteurs, mesure algébrique ou angle, binôme « k parmi n », matrice jusqu'à 6×6, intervalle à crochets, ensemble avec appartenance ou condition, nombre complexe algébrique/exponentiel/trigonométrique, pourcentage, système d'équations ligne à ligne) permettent d'écrire les maths en remplissant des cases libellées en français, sans jamais taper de LaTeX : chaque fenêtre offre la bande « Insérer » (parenthèses, racine, pi, exposant, indice... ; pas de zone d'aperçu depuis la v0.1.8).

Fonctionnalités de la phase 1 :

- Ouvrir tout PDF (bouton, menu Fichier ou glisser-déposer sur la fenêtre).
- Cinq annotations standard : surlignage, encadré, encre à main levée et écriture sur la page (machine à écrire : texte nu au clic exact ou zone tracée au glissement, formules mêlées au texte), y compris sur les pages tournées (/Rotate 90/180/270) ; depuis la v0.1.14, la barre compte huit outils d'une fonction claire chacun.
- Annotations riches (v0.1.31) : chaque outil ouvre son panneau d'options à gauche de la page. Surligner : quatre formes (/Highlight plein, /Underline soulignement, /StrikeOut barré, /Squiggly ondulé) et huit couleurs. Encadrer : quatre formes (rectangle, arrondi, ellipse, nuage /Cloudy), trait continu, tirets ou points, trois épaisseurs, remplissage teinté, sept couleurs. Écrire : machine à écrire riche — taille de corps 8 à 36 pt, gras, italique, souligné, barré, exposant, indice, couleur du texte et de fond, alignements, listes à puces et numérotées, formules LaTeX mêlées au texte ($E = mc^2$). Chaque palette offre un cercle chromatique HSV pour les couleurs personnalisées ; les notes riches se reprennent et se redimensionnent en recomposant le texte.
- Équations LaTeX rendues en vecteurs PDF par MathJax, insérées en un clic, déplacées d'un glissement, supprimées d'une pression de Suppr.
- Sélection d'une annotation sur la page (liseret) et suppression, visible aussitôt : le rendu ne repeint plus au fond de la page les annotations retirées (v0.1.35) ; menu Édition → « Ôter tous les surlignages de la page » retire d'un seul geste surlignages, soulignements, barrés et ondulés de la page affichée (une annulation les ramène tous).
- Confort à la PDF-XChange : barre à huit outils d'une fonction claire chacun, dont la machine à écrire (v0.1.14) ; outil Main pour faire défiler la page, sélection du texte réel du document (surlignage exact, ligne par ligne, ou copie), et annulation / rétablissement geste par geste (v0.1.13), fiable même sous rafales de raccourcis : les commandes d'édition s'exécutent une par une et un journal déjà dérivé est assaini plutôt que de bloquer (v0.1.33) outil Main pour faire défiler la page à la main, sélection du texte réel du document (surlignage exact, ligne par ligne, ou copie), et annulation / rétablissement geste par geste, raccourcis affichés au menu sans capter la saisie des champs.
- Reconnaissance des pages scannées (v0.1.22) : une page sans couche de texte devient sélectionnable — la reconnaissance (tesseract.js, WASM, embarquée dans l'application avec son modèle de langue français, aucun téléchargement ni service en ligne) est déclenchée à la demande, page par page, en armant l'outil Texte ; une fois la page reconnue, Surligner et Copier fonctionnent comme sur un vrai texte ; bouton « ƒ LaTeX » : la zone sélectionnée est lue par l'OCR Latin réglé dans Fichier → Options OCR LaTeX… — votre serveur OCR personnel (v0.1.23, tout local : le petit serveur du dossier serveur-ocr tourne sur votre ordinateur, joint par votre réseau privé Tailscale) ou, à défaut, l'OCR Mistral en ligne (clé API personnelle conservée sur l'ordinateur) — et les formules lues sont copiées dans le presse-papiers.
- Vue d'ensemble du document (v0.1.15) : colonne de vignettes des pages, ouverte par défaut avec le document, page courante signalée et suivie, un clic y amène ; bouton ▤ pour la masquer ou la remettre.
- Enregistrement : réécriture complète du fichier (bouton Enregistrer) ou copie horodatée à côté de l'original (nom-AAAA-MM-JJ-HHmmss.pdf) ; jamais d'écrasement silencieux du fichier source en dehors de l'action explicite.
- Lectures des annotations d'autres logiciels (sans apparence /AP) en lecture seul : affichées mais non éditables.
- Mise à jour automatique silencieuse (releases GitHub, via electron-updater).

Développement :
- Le moteur (dossier engine/) tourne sans Electron, testé par node --test (tests purs partout ; les tests d'intégration — pdf-lib, MathJax, reconnaissance tesseract réelle — s'exécutent dans la CI).
- Pile : Electron, pdfjs-dist (affichage), pdf-lib 1.17.1 (écriture), MathJax 3.2.2 (équations), tesseract.js (reconnaissance locale des scans), electron-builder + GitHub Actions (livraison Windows). Le serveur OCR LaTeX personnel (dossier serveur-ocr/, facultatif) est un script Python autonome : il n'est pas embarqué dans l'application.

## Démarrage rapide

### Installer (utilisateur)

Téléchargez l'installateur ou le portable de la dernière Release (Windows 64 bits) : double-clic, c'est tout. Le raccourci du bureau est garanti : toute version installée ou mise à jour silencieusement le recrée au prochain lancement (v0.1.34). Tout fonctionne hors ligne après l'installation — y compris la reconnaissance des pages scannées (modèle de langue embarqué). La lecture LaTeX des formules (bouton ƒ LaTeX) lit par défaut votre serveur OCR personnel si son adresse est réglée (Fichier → Options OCR LaTeX…, tout local ; voir le guide du dossier serveur-ocr), sinon l'OCR Mistral, en ligne, avec votre clé API personnelle.

### Construire (développeur)

```bash
git clone https://github.com/arthurlenancker-boop/atelier-pdf.git
cd atelier-pdf
npm install --no-audit --no-fund
node scripts/preparer-ocr.js
npm test
npm start
```

La ligne preparer-ocr décode le modèle de langue français de la reconnaissance (ocr/fra.traineddata.gz) depuis le base64 du dépôt — les tests de reconnaissance et l'application l'attendent.

Livraison d'une version : la version portée par package.json est construite et publiée automatiquement à chaque modification de .github/workflows/etag.yml poussée sur main (tests, installateur NSIS, portable, latest.yml, étiquette vX.Y.Z et Release).

## Contrôles rapides dans l'application

| Action | Contrôle |
| --- | --- |
| Ouvrir un PDF | Ctrl+O, bouton Ouvrir, ou glisser-déposer sur la fenêtre |
| Plusieurs documents à la fois | chaque PDF ouvert a son onglet sous la barre du haut : un clic le rend actif, sa croix le ferme ; ouvrir un fichier déjà présent dans un onglet réactive cet onglet au lieu d'en ouvrir un second ; la page et le zoom de chaque onglet sont gardés en mémoire (v0.1.30) |
| Fermer un onglet | croix de l'onglet ou Ctrl+W ; si le document a des modifications non enregistrées, l'application demande : Enregistrer, Fermer sans enregistrer, ou Annuler (v0.1.30) |
| Quitter sans perdre de travail | la croix de la fenêtre, Alt+F4 et le menu Quitter demandent d'enregistrer chaque onglet modifié avant de laisser la place : rien ne se perd en silence (v0.1.30) |
| Prendre la page à la main | outil Main (premier bouton) : cliquer puis faire glisser, la page suit le geste comme une feuille sur la table (v0.1.13) |
| Sélectionner du texte | outil Texte : glisser sur le texte du document (sélection native), puis Surligner (surlignage exact, un quad par ligne) ou Copier ; sur une page scannée sans texte, la reconnaissance part toute seule et la page devient sélectionnable en quelques secondes (v0.1.22) |
| Lire le LaTeX d'une formule | outil Texte : sélectionner la formule puis bouton « ƒ LaTeX » de la barre flottante ; le LaTeX extrait est copié dans le presse-papiers (aucune modification du fichier) (v0.1.22) |
| Régler la lecture LaTeX | menu Fichier → Options OCR LaTeX… : l'adresse de votre serveur OCR personnel (tout local, prioritaire, v0.1.23 — voir serveur-ocr/LISEZMOI.md) ou la clé API Mistral ; tout reste sur cet ordinateur, dans le fichier de configuration de l'application |
| Voir tout le document d'un coup | colonne Pages (✓ bouton ▤) : miniatures de toutes les pages, la courante signalée, un clic y amène (v0.1.15) |
| Annuler / Rétablir | Ctrl+Z / Ctrl+Maj+Z, boutons ou menu Édition : geste par geste (pose, déplacement, redimensionnement, correction) ; pendant une saisie dans un champ, Ctrl+Z reste au champ, sortez-en pour annuler un geste (v0.1.13) |
| Surligner | outil Surligner : glisser sur une ligne de texte |
| Encadrer | outil Encadrer : glisser un rectangle |
| Écrire à main levée | outil Encre : tracer |
| Écrire sur la page | outil Écrire (machine à écrire) : un simple clic écrit le texte nu exactement là où vous avez cliqué ; un glissement trace d'abord la zone à votre mesure ; Ctrl+Entrée pose (v0.1.14, fusion des anciens outils Note et Fiche) |
| Mêler des formules au texte écrit | dans la zone tracée à l'outil Écrire : bouton « ƒ Insérer une formule » ou Ctrl+M, la formule se glisse à la position du curseur, aperçu rendu en direct sous la saisie ; Ctrl+Entrée pose le texte et les formules ensemble (v0.1.11) |
| Corriger un texte ou une zone posés | double-clic dessus (outil Sélection ou Équation) : tout rouvre, texte comme formules (v0.1.14) |
| Insérer une équation | outil Équation : clic sur la page (la formule pose sa ligne de base à cet endroit), formule dans le panneau, bouton Insérer dans la page |
| Voir les équations posées | affichées à l'écran, calées exactement sur leur rectangle enregistré (depuis la v0.1.10, tracées par l'application depuis le LaTeX embarqué, identiques aux autres lecteurs) |
| Écrire une équation sans LaTeX | panneau Équation, section Fenêtres guidées : 16 fenêtres (dont dérivée, primitive, binôme, matrice, intervalle, ensemble, nombre complexe, pourcentage), cases en clair, bande Insérer, bouton Écrire (pas de zone d'aperçu) |
| Corriger une équation posée | clic sur l'équation (outil Équation) ou double-clic (outil Sélection), corriger, bouton Remplacer la formule ; fenêtres guidées et préréglages s'insèrent au curseur dans le champ (v0.1.11) |
| Basculer Professionnel / Linéaire | boutons du panneau Équation ; en Linéaire, la barre d'espace monte la formule dans la zone structurée (v0.1.24) |
| Zoom | Ctrl+molette : zoom fluide centré sur le pointeur, ou touches + - 0 et boutons + / − / 1:1 ; le défilement garde le point visé sous le curseur |
| Changer de page | PgSuiv / PgPréc, touches Début / Fin, boutons ‹ ›, ou clic sur une vignette (v0.1.15) |
| Sélectionner une annotation | outil Sélection : clic sur l'annotation (liseret bleu, poignées de redimensionnement si elle s'y prête) |
| Déplacer une annotation | outil Sélection : cliquer dessus puis la faire glisser ; notes, fiches, cadres, équations et annotations d'origine suivent (une seule entrée dans le journal d'annulation) (v0.1.12) |
| Redimensionner une annotation | outil Sélection : tirer l'une des huit poignées du liseret ; texte, fiche (recomposée depuis sa source), cadre et équation ; surlignage, trait et icône-note ne se redimensionnent pas (v0.1.12) |
| Supprimer l'annotation sélectionnée | touche Suppr |
| Enregistrer | Ctrl+S |
| Enregistrer une copie horodatée | Ctrl+Maj+S (jamais d'écrasement du fichier source) |

## Questions fréquentes

- **Le texte surligné sur une page tournée est-il aligné ?** Oui : l'alignement des clics sur les pages tournées (/Rotate) est garanti par engine/coords.js (couvert par les tests unitaires et un aller-retour réel dans test/roundtrip.test.js).
- **Où sont stockées mes annotations ?** Dans le PDF lui-même, au format standard : toute personne recevant le fichier les voit, sans notre application.
- **La reconnaissance des scans envoie-t-elle mes documents ?** Non : elle est entièrement locale (tesseract.js embarqué). Le bouton « ƒ LaTeX » envoie l'image de la zone sélectionnée à l'OCR Latin réglé : votre serveur personnel si son adresse existe (tout reste alors entre vos machines, v0.1.23), sinon l'OCR Mistral avec votre clé ; la clé reste sur l'ordinateur et le document n'est jamais modifié.
- **Puis-je éditer une annotation posée par un autre logiciel ?** Non : l'affichage en est prévu (lecture seule), l'édition reste hors périmètre de la phase 1.

## Licence

AGPL-3.0 (voir LICENSE et NOTICE). Interface claire neutre, standard ; sur la base de SpotiKit, même licence.
