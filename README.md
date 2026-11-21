Atelier PDF
===========

Éditeur PDF de bureau pour préparer des cours : les annotations standard et les équations LaTeX sont écrites dans le fichier PDF lui-même, sans calque propriétaire. Le fichier annoté reste lisible et imprimable par tout lecteur (Adobe Acrobat, Edge, LibreOffice), et l'impression conforme est déjà dans le fichier (drapeau /F 4, apparence /AP).

Un mix volontaire de OneNote (ruban Équation, structures et préréglages) et d'un éditeur PDF classique, pour un enseignant qui ne veut que deux choses : surligner, encadrer, écrire et poser des maths sur ses documents, puis les enregistrer proprement.

Deux sortes d'équations : un mode Professionnel (saisie LaTeX directe) et un mode Linéaire (saisie à plat, symboles convertis), un aperçu vectoriel avant insertion, structures de ruban (fraction, racine, somme, intégrale, matrices, accents, crochets, fonctions et limites), préréglages d'identités remarquables et symboles usuels. Depuis la v0.1.5, des fenêtres guidées à la manière de Dmaths (quotient, racine, limite, intégrale/somme/produit, dérivée, primitive, vecteur, angle et produit de vecteurs, mesure algébrique ou angle, binôme « k parmi n », matrice jusqu'à 3×3, intervalle à crochets, ensemble avec appartenance ou condition, nombre complexe algébrique/exponentiel/trigonométrique, pourcentage, système d'équations ligne à ligne) permettent d'écrire les maths en remplissant des cases libellées en français, sans jamais taper de LaTeX : chaque fenêtre offre la bande « Insérer » (parenthèses, racine, pi, exposant, indice... ; pas de zone d'aperçu depuis la v0.1.8).

Fonctionnalités de la phase 1 :

- Ouvrir tout PDF (bouton, menu Fichier ou glisser-déposer sur la fenêtre).
- Cinq annotations standard : surlignage translucide (opacité 0,35), encadré rouge, encre à main levée et écriture sur la page (machine à écrire : texte nu au clic exact ou zone tracée au glissement, formules mêlées au texte), y compris sur les pages tournées (/Rotate 90/180/270) ; depuis la v0.1.14, la barre compte huit outils d'une fonction claire chacun.
- Équations LaTeX rendues en vecteurs PDF par MathJax, insérées en un clic, déplacées d'un glissement, supprimées d'une pression de Suppr.
- Sélection d'une annotation sur la page (liseret) et suppression.
- Confort à la PDF-XChange : barre à huit outils d'une fonction claire chacun, dont la machine à écrire (v0.1.14) ; outil Main pour faire défiler la page, sélection du texte réel du document (surlignage exact, ligne par ligne, ou copie), et annulation / rétablissement geste par geste (v0.1.13) outil Main pour faire défiler la page à la main, sélection du texte réel du document (surlignage exact, ligne par ligne, ou copie), et annulation / rétablissement geste par geste, raccourcis affichés au menu sans capter la saisie des champs.
- Vue d'ensemble du document (v0.1.15) : colonne de vignettes des pages, ouverte par défaut avec le document, page courante signalée et suivie, un clic y amène ; bouton ▤ pour la masquer ou la remettre.
- Enregistrement : réécriture complète du fichier (bouton Enregistrer) ou copie horodatée à côté de l'original (nom-AAAA-MM-JJ-HHmmss.pdf) ; jamais d'écrasement silencieux du fichier source en dehors de l'action explicite.
- Lectures des annotations d'autres logiciels (sans apparence /AP) en lecture seul : affichées mais non éditables.
- Mise à jour automatique silencieuse (releases GitHub, via electron-updater).

Développement :
- Le moteur (dossier engine/) tourne sans Electron, testé par node --test (37 tests).
- Pile : Electron, pdfjs-dist (affichage), pdf-lib 1.17.1 (écriture), MathJax 3.2.2 (équations), electron-builder + GitHub Actions (livraison Windows).

## Démarrage rapide

### Installer (utilisateur)

Téléchargez l'installateur ou le portable de la dernière Release (Windows 64 bits) : double-clic, c'est tout. Aucune connexion à un service en ligne, aucune dépendance propriétaire, tout est hors ligne après l'installation.

### Construire (développeur)

```bash
git clone https://github.com/arthurlenancker-boop/atelier-pdf.git
cd atelier-pdf
npm install --no-audit --no-fund
npm test
npm start
```

Livraison d'une version : poser un tag v* → le workflow .github/workflows/release.yml construit l'installateur NSIS, le portable et latest.yml, et les publie en brouillon de Release.

## Contrôles rapides dans l'application

| Action | Contrôle |
| --- | --- |
| Ouvrir un PDF | Ctrl+O, bouton Ouvrir, ou glisser-déposer sur la fenêtre |
| Prendre la page à la main | outil Main (premier bouton) : cliquer puis faire glisser, la page suit le geste comme une feuille sur la table (v0.1.13) |
| Sélectionner du texte | outil Texte : glisser sur le texte du document (sélection native), puis Surligner (surlignage exact, un quad par ligne) ou Copier ; les PDF scannés sans texte réel ne se prêtent pas à la sélection, le rectangle de l'outil Surligner reste alors (v0.1.13) |
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
| Basculer Professionnel / Linéaire | boutons du panneau Équation |
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
- **Puis-je éditer une annotation posée par un autre logiciel ?** Non : l'affichage en est prévu (lecture seule), l'édition reste hors périmètre de la phase 1.

## Licence

AGPL-3.0 (voir LICENSE et NOTICE). Interface claire neutre, standard ; sur la base de SpotiKit, même licence.
