# Journal d'exécution — phase 1 (annotations et équations)

Grand livre de l'exécution du plan `2026-11-19-phase1-annotations-equations.md`.
Discipline : test d'abord (rouge), implémentation (vert), validation consignée.

## Consignes et rulings durables

- `npm test` impossible dans le bac à sable Vibe (npm interdit) : série locale `node --test`, même suite via `npm test` dans la CI (Windows). Node v22.
- `node --test test/` (dossier en argument) échoue : le script `test` de `package.json` vaut `node --test` (découverte automatique).
- Dépendances vendues à la main dans le bac à sable (pdf-lib.min.js, tarball mathjax-full) pour la suite locale ; non poussées (.gitignore inclut node_modules/), installées par `npm install` en CI.
- `addAnnot` : clés texte (Contents, DA, M, T, Subject, NM, RC) → chaînes PDF (Contents en hexadécimal, DA en chaîne littérale, convention Acrobat) ; toute autre valeur de chaîne → PDFName ; passage des PDFRef intact (corrigé : un PDFRef absorbé en dictionnaire vide cassait /AP et /P).
- MathJax ne lève pas d'exception sur du LaTeX invalide : il rend une erreur rouge avec `data-mjx-error` dans l'arbre ; `mjRender` détecte ce marqueur et lève `MjrenderError`.
- Le connecteur GitHub ne peut pas créer de dépôt sur un compte personnel (403 même avec Administration). Arthur crée `arthurlenancker-boop/atelier-pdf` à la main.
- Relecture (`listAnnots`) : sous-type normalisé SANS barre oblique initiale (« Highlight », pas « /Highlight »).
- `engine/coords.js` : double en-tête CommonJS / globalThis.AtelierCoords, pour que le processus de rendu (module ESM navigateur) emploie exactement le code testé.
- `addInk` reçoit `points` (liste plate de couples) et déduit son rectangle : pas de champ `lines` avec rect séparé.
- `openPdf(octets)` / `savePdf(doc)` travaillent en octets : les chemins de fichiers appartiennent au processus principal (main.js), jamais au moteur.

## Reconstruction du 19 novembre 2026 (après réinitialisation du bac à sable)

Le dossier de travail a été reconstruit de zéro, moteurs et tests réécrits puis
validés par la suite. Écarts assumés par rapport à la première passe :

- `DA` posé en PDFString littérale (convention des fichiers produits par Acrobat), le reste des clés texte en PDFHexString.
- `subtype` renvoyé sans barre oblique par `listAnnots`.
- Transparence du surlignage : `/ExtGState` déclaré dans les ressources propre du Form XObject (pas dans les ressources de la page).
- Calque d'apparence du rendu : dessine les rectangles `/Rect` (ruling du plan) ; les équations fraîchement posées sont retracées depuis les opérateurs vectoriels de l'aperçu (cache local du processus de rendu).

## Tâches

| # | Tâche | Fichiers | État |
| --- | --- | --- | --- |
| 1 | Scaffolding + CI | package.json, .gitignore, README, ci.yml, plan sous docs/plans | Vert (2 tests) |
| 2 | Ouverture, sauvegarde, copie horodatée | engine/pdfio.js | Vert (3) — erreurs en PdfioError français avec cause |
| 3 | Briques d'annotations bas niveau | engine/annotcore.js | Vert (5) — hexWinAnsi, normalizeRect, makeForm, addAnnot |
| 4 | Les cinq annotations standard | engine/annots.js | Vert (5) — surlignage /ca 0,35 dans le Form, encadré, encre, note, fiche |
| 5 | Rendu MathJax vers vecteurs PDF | engine/mjrender.js | Vert (4) — port svg2pdf complet, MjrenderError sur data-mjx-error |
| 6 | Annotation équation | engine/equation.js | Vert (2) — /Square /BS /W 0, Contents « Équation LaTeX : … » |
| 7 | Relecture des annotations | engine/reread.js | Vert (3) — annots d'autrui tolérées (hasAP: false) |
| 8 | Coordonnées écran vers page | engine/coords.js | Vert (6) — rot 0/90/180/270, quadPoints ordonnés |
| 9 | Session + processus principal | engine/session.js, main.js, preload.js | Vert (6 tests session) — fenêtre 1280×800, protocole app://, instance unique, ipc pdf:* et mjx:preview |
| 10 | Interface d'annotation | renderer/index.html, style.css, app.js | Écrite, vérification manuelle par Arthur (rendu pdf.js non testable dans le bac à sable) — ruban Équation complet de la maquette, bascule Professionnel/Linéaire, sélection + Suppr |
| 11 | Scénario complet aller-retour | test/roundtrip.test.js | Vert (1) — 2 pages dont /Rotate 90, 6 annotations, copie horodatée, relecture |
| 12 | Livraison | .github/workflows/release.yml, bloc build | Écrit (NSIS + portable, latest.yml sans espaces, publish en brouillon) — contrôle réel par Arthur au premier tag v0.1.0 |
| 13 | Documentation et licence | README, NOTICE, LICENSE AGPL-3.0, docs/utilisation.md, scripts/check-licenses.js | Écrit, check-licenses vert |

Suite locale au 19 novembre 2026 : `node --test` → 37 réussites, 0 échec
(2 smoke + 3 pdfio + 5 annotcore + 5 annots + 6 coords + 6 session
+ 4 mjrender + 2 equation + 3 reread + 1 roundtrip).

## Reste à faire

1. Pousser le dépôt (branche `vibe/phase-1-moteur`) dès qu'Arthur crée `arthurlenancker-boop/atelier-pdf` ; vérifier le contenu poussé par diff du zip avant la pull request (leçon PR #24 du lanceur).
2. CI verte sur GitHub, fusion par Arthur.
3. Contrôle manuel par Arthur de l'interface (tâche 10) : `npm install` puis `npm start`.
4. Tag `v0.1.0` → Release, contrôle de l'installateur par Arthur (tâche 12).
