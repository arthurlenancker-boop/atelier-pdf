Atelier PDF
===========

Éditeur PDF de bureau pour préparer des cours : les annotations standard et les équations LaTeX sont écrites dans le fichier PDF lui-même, sans calque propriétaire. Le fichier annoté reste lisible et imprimable par tout lecteur (Adobe Acrobat, Edge, LibreOffice), et l'impression conforme est déjà dans le fichier (drapeau /F 4, apparence /AP).

Un mix volontaire de OneNote (ruban Équation, structures et préréglages) et d'un éditeur PDF classique, pour un enseignant qui ne veut que deux choses : surligner, encadrer, écrire et poser des maths sur ses documents, puis les enregistrer proprement.

Deux sortes d'équations : un mode Professionnel (saisie LaTeX directe) et un mode Linéaire (saisie à plat, symboles convertis), un aperçu vectoriel avant insertion, structures de ruban (fraction, racine, somme, intégrale, matrices, accents, crochets, fonctions et limites), préréglages d'identités remarquables et symboles usuels. Depuis la v0.1.5, des fenêtres guidées à la manière de Dmaths (quotient, racine, limite, intégrale/somme/produit, vecteur, angle et produit de vecteurs, mesure algébrique ou angle, système d'équations ligne à ligne) permettent d'écrire les maths en remplissant des cases libellées en français, sans jamais taper de LaTeX : chaque fenêtre offre la bande « Insérer » (parenthèses, racine, pi, exposant, indice...) et un aperçu en direct.

Fonctionnalités de la phase 1 :

- Ouvrir tout PDF (bouton, menu Fichier ou glisser-déposer sur la fenêtre).
- Cinq annotations standard : surlignage translucide (opacité 0,35), encadré rouge, encre à main levée, note post-it (icône Comment, texte au survol dans Adobe) et fiche de texte sur la page, y compris sur les pages tournées (/Rotate 90/180/270).
- Équations LaTeX rendues en vecteurs PDF par MathJax, insérées en un clic, déplacées d'un glissement, supprimées d'une pression de Suppr.
- Sélection d'une annotation sur la page (liseret) et suppression.
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
| Surligner | outil Surligner : glisser sur une ligne de texte |
| Encadrer | outil Encadrer : glisser un rectangle |
| Écrire à main levée | outil Encre : tracer |
| Poser une note post-it | outil Note : clic, puis saisir le texte — le texte s'affiche à côté de l'icône dans l'application et reste au survol dans Adobe Acrobat |
| Écrire une fiche sur la page | outil Fiche : glisser la zone, puis saisir le texte |
| Insérer une équation | outil Équation : clic sur la page, formule dans le panneau, bouton Insérer dans la page |
| Écrire une équation sans LaTeX | panneau Équation, section Fenêtres guidées : cases en clair, bande Insérer, aperçu en direct, bouton Écrire |
| Basculer Professionnel / Linéaire | boutons du panneau Équation |
| Zoom | Ctrl+molette : zoom fluide centré sur le pointeur, ou touches + - 0 et boutons + / − / 1:1 ; le défilement garde le point visé sous le curseur |
| Changer de page | PgSuiv / PgPréc, touches Début / Fin, boutons ‹ › |
| Sélectionner une annotation | outil Sélection : clic sur l'annotation (liseret bleu) |
| Supprimer l'annotation sélectionnée | touche Suppr |
| Enregistrer | Ctrl+S |
| Enregistrer une copie horodatée | Ctrl+Maj+S (jamais d'écrasement du fichier source) |

## Questions fréquentes

- **Le texte surligné sur une page tournée est-il aligné ?** Oui : l'alignement des clics sur les pages tournées (/Rotate) est garanti par engine/coords.js (couvert par les tests unitaires et un aller-retour réel dans test/roundtrip.test.js).
- **Où sont stockées mes annotations ?** Dans le PDF lui-même, au format standard : toute personne recevant le fichier les voit, sans notre application.
- **Puis-je éditer une annotation posée par un autre logiciel ?** Non : l'affichage en est prévu (lecture seule), l'édition reste hors périmètre de la phase 1.

## Licence

AGPL-3.0 (voir LICENSE et NOTICE). Interface Glass on Charcoal, dérivée de SpotiKit, même licence.
