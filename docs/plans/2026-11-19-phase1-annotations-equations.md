<!-- Copie de référence du plan de construction, tel qu'exécuté (tâche 1 du plan). -->
<!-- Source : canvas « atelier-pdf-plan » ; exécution consignée dans journal-phase1.md. -->

# Plan de mise en œuvre : phase 1 (annotations + équations)

> **Pour les exécutants :** ce plan se met en œuvre tâche par tâche avec le skill executing-plans (exécution native par Vibe, une tâche à la fois) ou subagent-driven-development. Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi. Arthur ne code pas : Vibe implémente chaque tâche sur une branche `vibe/*`, la CI doit être verte, et Arthur fusionne la pull request sur GitHub.

**Objectif :** livrer l'application de bureau Windows « Atelier PDF » qui ouvre un PDF, permet les cinq annotations standard et l'insertion d'équations LaTeX rendues en vecteur, et enregistre le tout dans le fichier lui-même, lisible et imprimable par tout lecteur PDF.

**Architecture :** moteur pur sous Node (dossier `engine/`, sans aucun import d'Electron, testé par `node --test`), surmonté d'une coque Electron mince : processus principal qui détient le document pdf-lib et applique les éditions via IPC, rendu pdf.js dans le processus de rendu. La sauvegarde est une réécriture complète du fichier, avec copie horodatée en option.

**Pile technique :** Electron (coque), pdfjs-dist (rendu), pdf-lib 1.17.1 (écriture), mathjax-full 3.2.2 (équations, paquets `['base','ams','newcommand','color','mathtools']`), kit visuel Glass on Charcoal, electron-builder + GitHub Actions (livraison Windows).

**Spécification :** canvas « atelier-pdf-cadrage » (documento de cadrage validé), canvas « maquette-atelier-pdf » (interface de référence), dossier de connaissances « atelier-pdf ». Le prototype du 19 novembre 2026, validé dans Edge, Adobe Acrobat et LibreOffice, sert de référence technique : son code (pdf-lib bas niveau, svg2pdf, LaTeX) est porté dans le moteur, pas réinventé.

## Contraintes globales

- Fichier unique : `.exe` Windows uniquement, tout hors ligne, rien à installer sur la machine d'Arthur, aucun service payant, aucune dépendance propriétaire.
- Moteur pur : tout fichier sous `engine/` s'importe sous Node sans Electron et se teste avec `node --test test/`.
- Chaque annotation écrite porte : `/AP/N` (apparence), `/P` (page), `/F 4` (impression), `/M` (date), `/Contents` quand pertinent.
- Annotations au format PDF standard uniquement dans le fichier ; aucun calque propriétaire à côté.
- Versions épinglées : `pdf-lib 1.17.1` exact, `mathjax-full 3.2.2` exact (paquets Sans mhchem), `pdfjs-dist` majeure 4, Electron majeure la plus récente au jour du démarrage, `electron-builder` majeure 25.
- Interface en français, style Glass on Charcoal ; dépôt public `arthurlenancker-boop/atelier-pdf` (AGPL-3.0 du kit).
- Discipline du launcher : chaque tâche sur une branche `vibe/*`, CI verte avant fusion, pull request fusionnée par Arthur, Release déclenchée par tag `v*`.
- Compilation GitHub Actions : `windows-latest`, `npm install --no-audit --no-fund`, NSIS installateur + portable, `latest.yml`, noms de fichiers sans espaces.
- Copier ce plan dans le dépôt à la tâche 1 : `docs/plans/2026-11-19-phase1-annotations-equations.md`.

## Points de vigilance (Revue)

1. Pages tournées (`/Rotate` 90/180/270) : un clic sur le texte surligné doit tomber au bon endroit ; test de transformation dans la tâche Coordonnées.
2. Fichier corrompu ou illisible : message d'erreur clair, aucune fermeture brutale ; test dans la tâche Ouverture.
3. Caractères hors WinAnsi dans un texte de fiche (emoji, idéogrammes) : repli documenté vers `?`, aucun octet invalide dans le flux ; test dans la tâche Annotations.
4. Rectangle inversé ou plat (glisser de droite à gauche, ou sans déplacement) : normalisation avant écriture ; test dans la tâche Annotations.
5. Annotations créées par d'autres logiciels (sans `/AP`, ressources inconnues) : lecture sans plantage, affichage en lecture seule ; test dans la tâche Relecture.

---

### Tâche 1 : Scaffolding du dépôt et CI

**Fichiers :**
- Créer : `package.json`, `.gitignore`, `README.md`, `.github/workflows/ci.yml`, `docs/plans/2026-11-19-phase1-annotations-equations.md`
- Test : `test/smoke.test.js`

**Interfaces :**
- Produit : dépôt initialisé avec `npm test` fonctionnel (script `node --test test/`), dépendances installables (`electron`, `electron-builder`, `pdfjs-dist`, `pdf-lib@1.17.1`, `mathjax-full@3.2.2`), le présent plan recopié sous `docs/plans/`.

- [ ] **Étape 1 : écrire le test de fumée en échec**

`test/smoke.test.js` : charge `pdf-lib` et `mathjax-full` par `require` (moins le paquet mhchem), affirme que les exports `PDFDocument` et du module `mathjax.js` existent, et qu'une page A4 créée par `PDFDocument.create()` mesure 595,28 × 841,89 points.

- [ ] **Étape 2 : vérifier l'échec**

Exécuter : `npm test`. Attendu : échec, module introuvable (aucun `package.json`).

- [ ] **Étape 3 : créer `package.json`, `.gitignore`, README, copier le plan et écrire `ci.yml`**

`package.json` : `type: commonjs`, scripts `test: node --test test/` et `start: electron .`, `main: main.js`, versions épinglées de la section Contraintes. `ci.yml` : sur `push` et `pull_request`, `windows-latest`, `npm install --no-audit --no-fund` puis `npm test` (le runner Windows valide dès le départ l'environnement de livraison).

- [ ] **Étape 4 : vérifier le succès**

Exécuter : `npm install --no-audit --no-fund` puis `npm test`. Attendu : 2 réussites.

- [ ] **Étape 5 : valider**

`git add -A && git commit -m "chore: scaffold repo, CI, plan"` puis pousser la branche `vibe/01-scaffolding` et ouvrir la pull request.

### Tâche 2 : Ouverture, sauvegarde, copie horodatée

**Fichiers :**
- Créer : `engine/pdfio.js`
- Test : `test/pdfio.test.js`

**Interfaces :**
- Produit :
  - `openPdf(bytes: Uint8Array): Promise<PDFDocument>` — enveloppe `PDFDocument.load`, lève `PdfioError(message, cause)` sur octets invalides ou fichier chiffré.
  - `savePdf(doc: PDFDocument): Promise<Uint8Array>`.
  - `timestampedPath(dir: string, baseName: string, now: Date): string` — `${dir}/${baseInste sans extension}-AAAA-MM-JJ-HHmmss.pdf`, horloge injectée pour les tests.

- [ ] **Étape 1 : test en échec** — dans `test/pdfio.test.js` : (a) `savePdf` puis `openPdf` d'un document créé fait l'aller-retour (une page conservée) ; (b) `openPdf(new TextEncoder().encode("pas un pdf"))` lève `PdfioError` (et non une erreur brute de pdf-lib) ; (c) `timestampedPath('/cours', 'fiche', new Date('2026-11-19T09:05:00'))` vaut exactement `/cours/fiche-2026-11-19-090500.pdf`.
- [ ] **Étape 2 : vérifier l'échec** — `npm test` : module `engine/pdfio.js` introuvable.
- [ ] **Étape 3 : implémenter `engine/pdfio.js`** — traduire la cause de l'erreur pdf-lib en `PdfioError` avec un message français actionnable.
- [ ] **Étape 4 : vérifier le succès** — `npm test` : réussites.
- [ ] **Étape 5 : valider** — `git commit -m "feat: pdf io open/save/timestamped"` sur `vibe/02-pdfio`.

### Tâche 3 : Briques d'annotations bas niveau

**Fichiers :**
- Créer : `engine/annotcore.js`
- Test : `test/annotcore.test.js`

**Interfaces :**
- Produit :
  - `makeForm(ctx, {bbox: number[], resources: PDFDict, content: string}): PDFRawStream`.
  - `addAnnot(doc, page, dict: object): PDFRef` — complète `P`, `M`, `F: 4`, enregistre, ajoute au `/Annots` de la page.
  - `hexWinAnsi(text: string): string` — Latin-1, repli `?` hors bornes.
  - `normalizeRect(rect: number[]): number[]` — trie x et y croissants, rejette le zéro surface en l'échangeant contre 1 point.

- [ ] **Étape 1 : test en échec** — (a) `hexWinAnsi('Méthode : é à')` vaut la séquence hexadécimale exacte attendue ; `hexWinAnsi('🎉')` vaut la séquence de `?` ; (b) `normalizeRect([10, 5, 2, 8])` vaut `[2, 5, 10, 8]` et `normalizeRect([5, 5, 5, 5])` vaut `[5, 5, 6, 6]` ; (c) `addAnnot` sur une page neuve : rechargement du document, la page porte un objet dans `/Annots` avec `/F` entier 4.
- [ ] **Étape 2 : vérifier l'échec** — `npm test`.
- [ ] **Étape 3 : implémenter `engine/annotcore.js`** — reprendre les fonctions `makeForm`, `addAnnot`, `hexWinAnsi` du prototype validé, telles quelles.
- [ ] **Étape 4 : vérifier le succès** — `npm test`.
- [ ] **Étape 5 : valider** — `git commit -m "feat: annotation low-level core"` sur `vibe/03-annotcore`.

### Tâche 4 : Les cinq annotations standard

**Fichiers :**
- Créer : `engine/annots.js`
- Test : `test/annots.test.js`

**Interfaces :**
- Consomme : `PDFDocument`/`PDFPage` de pdf-lib, tout ce que `annotcore.js` produit.
- Produit (chaque fonction enregistre l'annotation et son `/AP/N`, renvoie le `PDFRef`) :
  - `addHighlight(doc, page, {rect, quadPoints: number[][], color?: number[], contents?: string})` — jaune translucide via `/ExtGState /ca` 0,35 (repère de vigilance n° 4 : `rect = normalizeRect(rect)` et les quadpoints suivent).
  - `addSquare(doc, page, {rect, color?: number[], borderWidth?: number, fill?: number[]})`.
  - `addInk(doc, page, {points: number[][], color?: number[], width?: number})` — `/InkList` en coordonnées page et apparence poly ligne.
  - `addTextNote(doc, page, {rect, contents, name?: 'Comment'})` — icône post-it vectorielle (calquée sur le prototype), titre `/T` « Atelier PDF ».
  - `addFreeText(doc, page, {rect, text, fontSize?: 11, color?: number[], font?: 'Helv'})` — `/DA` et apparence avec texte hexadécimal WinAnsi ; police standard Type 1, non embarquée.

- [ ] **Étape 1 : test en échec** — scénario unique : document A4 neuf, une de chaque annotation, `savePdf`, rechargement, puis assertion par annotation : sous-type exact, `/Rect` attendu, `/AP` présent, et l'apparence décodée contient l'opérateur discriminant (`gs` pour le surlignage, `re` pour l'encadré, `Tj` pour le texte de fiche). Plus : surlignage à rectangle inversé en entrée, `/Rect` normalisé en sortie (vigilance n° 4) ; texte de fiche avec un caractère hors WinAnsi, `/Contents` décodé contient `?` (vigilance n° 3).
- [ ] **Étape 2 : vérifier l'échec** — `npm test`.
- [ ] **Étape 3 : implémenter `engine/annots.js`** — porter les blocs 1 à 5 du `prototype.js` validé ; une fonction par annotation, aucun état global.
- [ ] **Étape 4 : vérifier le succès** — `npm test`.
- [ ] **Étape 5 : valider** — `git commit -m "feat: five standard annotations"` sur `vibe/04-annots`.

### Tâche 5 : Rendu MathJax vers vecteurs PDF

**Fichiers :**
- Créer : `engine/mjrender.js` (port du `svg2pdf.js` du prototype + enveloppe MathJax)
- Test : `test/mjrender.test.js`

**Interfaces :**
- Produit :
  - `mjRender(latex: string, exPt: number, opts?: {display?: boolean, rgb?: number[]}): {widthPt: number, heightPt: number, depthPt: number, ops: string}` — `ops` composé d'opérateurs `m/l/c/f/re/rg` valides dans une boîte `[0 0 widthPt heightPt]` ; lève `MjrenderError(message)` sur LaTeX invalide (sans faire tomber le processus).

- [ ] **Étape 1 : test en échec** — (a) pour `'x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}'` avec `exPt` 4,5 : `widthPt` et `heightPt` valent 93,44 et 23,81 à 0,05 près, `ops` commence par `0 0 0 rg`, tous les nombres y restent dans `[0, widthPt] × [0, heightPt]` ; (b) `\vec{F} = m \cdot \vec{a}`, `\matrix{a & b \\ c & d}`, `\int_0^1 x^2 dx = \frac{1}{3}` se rendent sans erreur, chacune avec un `ops` non vide ; (c) `mjRender('\\pasUnecommande!!')` lève `MjrenderError` ; (d) une seconde légère couleur : `ops` commence par `rg` correspondant.
- [ ] **Étape 2 : vérifier l'échec** — `npm test`.
- [ ] **Étape 3 : implémenter `engine/mjrender.js`** — initialiser une unique instance MathJax en bas niveau (`liteAdaptor`, paquets `['base','ams','newcommand','color','mathtools']`, options `{InputJax, OutputJax}`) et porter `svg2pdf.js` tel que validé (parseur de chemins Q/T, matrices translate/scale, retournement y).
- [ ] **Étape 4 : vérifier le succès** — `npm test`.
- [ ] **Étape 5 : valider** — `git commit -m "feat: mathjax to pdf vector renderer"` sur `vibe/05-mjrender`.

### Tâche 6 : Annotation équation

**Fichiers :**
- Créer : `engine/equation.js`
- Test : `test/equation.test.js`

**Interfaces :**
- Consomme : `mjRender` de `engine/mjrender.js`, `annotcore.js`, `annots.js`.
- Produit :
  - `addEquation(doc, page, {latex, x: number, y: number, exPt?: 4.5, rgb?: number[], display?: boolean}): {ref: PDFRef, rect: number[]}` — `/Square` à bordure nulle (`/BS /W 0`), apparence rendue par `mjRender`, `Contents` « Équation LaTeX : … ». `y` désigne le coin inférieur gauche du rectangle.

- [ ] **Étape 1 : test en échec** — équation quadratique posée à (60, 480) : rechargement, une annotation `/Square` dont `/Rect` répond à la taille `mjRender` et contient un `/AP/N` en Form XObject avec BBox identique ; marker secondaire : contenu crypté décodé commence par « Équation LaTeX ».
- [ ] **Étape 2 : vérifier l'échec** — `npm test`.
- [ ] **Étape 3 : implémenter `engine/equation.js`** — assemblage direct des briques des tâches 3 à 5.
- [ ] **Étape 4 : vérifier le succès** — `npm test`.
- [ ] **Étape 5 : valider** — `git commit -m "feat: equation annotation"` sur `vibe/06-equation`.

### Tâche 7 : Relecture des annotations

**Fichiers :**
- Créer : `engine/reread.js`
- Test : `test/reread.test.js`

**Interfaces :**
- Consomme : un `PDFDocument` chargé.
- Produit :
  - `listAnnots(doc): {page: number, subtype: string, rect: number[], hasAP: boolean, contents: string}[]` — chaîne de caractères `/Contents` décodée en UTF-8 avec repli vide ; ne lève jamais sur une annotation inconnue (vigilance n° 5).

- [ ] **Étape 1 : test en échec** — montage (a) : document avec les cinq annotations et une équation issue des tâches 4 et 6 : la liste rend 6 annotate avec sous-types et rectangles exacts ; montage (b), la Annotation brut sans `/AP`, avec un dictionnaire inconnu supplémentaire fabriquée à la main dans le test : `listAnnots` la renvoie avec `hasAP: false` sans erreur.
- [ ] **Étape 2 : vérifier l'échec** — `npm test`.
- [ ] **Étape 3 : implémenter `engine/reread.js`** — parcours de `/Annots` avec `context.lookup`, dérobades successives par champ.
- [ ] **Étape 4 : vérifier le succès** — `npm test`.
- [ ] **Étape 5 : valider** — `git commit -m "feat: annotation reread"` sur `vibe/07-reread`.

### Tâche 8 : Coordonnées écran vers page PDF

**Fichiers :**
- Créer : `engine/coords.js` (pur, utilisé aussi par le processus de rendu)
- Test : `test/coords.test.js`

**Interfaces :**
- Produit :
  - `deviceToPdf(pxX: number, pxY: number, viewport: {scale: number, rotation: 0|90|180|270, pageW: number, pageH: number, offsetX: number, offsetY: number}): {x: number, y: number}` — coordonnées utilisateur PDF (point en bas à gauche, image lisible de la vision pdf.js) ; tolère `offsetX/Y` pour l'alignement du canvas dans la vue.
  - `quadPointsForRange(pointA: {x,y}, pointB: {x,y}): number[][]` — un quadrilatère horizontal de texte (8 valeurs), quel que soit le sens du glissement.

- [ ] **Étape 1 : test en échec** — cas enregistrés (valeurs exactes dans le test) : page A4 non tournée avec échelle 1, clic au milieu du canvas au format A4 occupé → (297,64 ; 421) environ ; page `/Rotate` 90 même clic → coin tourné exact ; échelle 2 → coordonnées divisées par deux ; `quadPointsForRange` avec B à gauche de A → quadpoints ordonnés indépendamment du glissement (vigilance n° 1).
- [ ] **Étape 2 : vérifier l'échec** — `npm test`.
- [ ] **Étape 3 : implémenter `engine/coords.js`** — correspondance exacte avec la construction du viewport pdf.js dans le processus de rendu (tâche 10).
- [ ] **Étape 4 : vérifier le succès** — `npm test`.
- [ ] **Étape 5 : valider** — `git commit -m "feat: device to pdf coordinates"` sur `vibe/08-coords`.

### Tâche 9 : Processus principal Electron

**Fichiers :**
- Créer : `main.js`, `preload.js`, `engine/session.js`
- Test : `test/session.test.js` (le module de session est pur, sans Electron)

**Interfaces :**
- Consomme : `pdfio.js`, toutes les fonctions d'édition des tâches 4, 6, 7.
- Produit :
  - `engine/session.js`, pur : `createSession(doc)`, `session.apply(edit)` où `edit = {kind: 'highlight'|'square'|'ink'|'textNote'|'freeText'|'equation', args: object}` aiguille vers la bonne fonction, `session.listAnnots()`.
  - `engine/session.js` : `session.edits()` renvoie l'ordre des modifications effectuées depuis l'ouverture (pour l'état modifié).
  - `main.js` : fenêtre 1280 × 800, protocole `app://` pour le dossier du processus de rendu, instance unique, menus Ouvrir / Enregistrer / Enregistrer une copie horodatée, dialogues natifs ; IPC `pdf:open → {path}`, `pdf:apply(edits) → {bytes}`, `pdf:save({mode}) → {path}`.
  - `preload.js` : `contextBridge.exposeInMainWorld('atelier', { open, applyEdits, save, onChanged })` avec `contextIsolation` actif.

- [ ] **Étape 1 : test en échec** — `test/session.test.js` : une session sur document neuf, `apply` avec les 6 sortes d'édition une fois chacune, `listAnnots` rend 6 annotations ; après `savePdf` + `openPdf`, toujours 6. Fichier illisible via `openPdf` → l'erreur remonte avec la question posée (vigilance n° 2).
- [ ] **Étape 2 : vérifier l'échec** — `npm test`.
- [ ] **Étape 3 : implémenter `engine/session.js` währe les API déclarées, puis `main.js` et `preload.js`** — aucun traitement approximatif de coordonnées ici : le processus de rendu les a déjà calculées.
- [ ] **Étape 4 : vérifier le succès** — `npm test` ; vérification manuelle : `npm start`, la fenêtre s'ouvre sans erreur dans la console principale.
- [ ] **Étape 5 : valider** — `git commit -m "feat: electron main + session engine"` sur `vibe/09-main`.

### Tâche 10 : Interface d'annotation

**Fichiers :**
- Créer : `renderer/index.html`, `renderer/app.js`, `renderer/toolbar.js`, `renderer/viewer.js`, `renderer/panel/equation.js`, `assets/glass-on-charcoal/` (thème compilé du kit)
- Test : vérification manuelle (le code du processus de rendu se limite à la présentation, sa logique de calcul se trouve dans `coords.js` déjà testé)

**Interfaces :**
- Consomme : pont `window.atelier` de la tâche 9, `engine/coords.js`, structures du ruban Équation décrites dans le canvas « maquette-atelier-pdf » (Base, Grands opérateurs, Crochets, Fonctions et limites, Accents, Matrices, symboles), bascule Professionnel/Linéaire (champ de saisie et affichage), aperçu du rendu avant insertion.

- [ ] **Étape 1 : implémenter la visionneuse pdf.js** — canvas html, panneaux de pages, zoom avec molette et boutons, raccourcis `+`/`-`/`0`, navigation entre les pages (raccourci `Début`/`Fin`), glisser-déposer sur la fenêtre et menu Ouvrir.
- [ ] **Étape 2 : implémenter la barre d'outils** — 5 outils de sélection, calque d'apparence des annotations de la session (rectangles du `/Rect` de `listAnnots`, redessinés après chaque `applyEdits`), sélection d'une annotation par clic puis suppression avec la touche `Suppr` (la suppression du moteur passe par un re-création complète du document, la suppression du rendez-vous n'a pas d' édition), propre au moteur : `session.remove(pageRef, annotRef)` ajouté à `engine/session.js` dans cette tâche avec couverture par test dans `test/session.test.js`.
- [ ] **Étape 3 : implémenter l'outil Équation du point de vue de la maquette** — panneau latéral avec les structures groupées de la maquette, champ LaTeX, case bascule Professionnel/Linéaire (champ de texte), bouton insérer. Aperçu du rendu (`mjRender` sur place dans le moteur de rendu, pdf.js d'affichage ne souhaite pas) : le préréglage plutôt que `mjRender` n'est accessible que du moteur : l'aperçu passe par un canal IPC `mjx:preview` ajouté à main.js.
- [ ] **Étape 4 : vérification manuelle passant** — feuille de contrôle documentée dans le cadran de rendu du README : ouvrir le PDF du prototype, surligner les deux phrases, encadrer, dessiner au trait, poser une note (double clic), écrire une fiche, insérer une matrice, zoomer, tourner une page 90° dans un PDF de test final et vérifier qu'un surlignage reste sur le texte.
- [ ] **Étape 5 : valider** — `git commit -m "feat: annotator UI"` sur `vibe/10-ui`.

### Tâche 11 : Scénario complet aller-retour

**Fichiers :**
- Test : `test/roundtrip.test.js`, `test/fixtures/reference-annotated.pdf` (généré)

**Interfaces :**
- Consomme : tout le moteur, la classe de session de la tâche 9.
- Produit : test de non-régression durable de l'ensemble du moteur.

- [ ] **Étape 1 : test en échec** — scénario de bout en bout en Node de préparation de cours : créer un PDF d'une page avec deux lignes de texte et une page 90°, `savePdf`, rouvrir en session, appliquer 5 annotations + 1 équation, sauvegarder en mode horodaté, rouvrir la copie : les 6 annotations y figurent avec leurs `/AP` ; la copie horodatée existe sous le nom attendu ; la page tournée conserve ses annotations aux coordonnées correctes (surlignage aligné, vigilance n° 1).
- [ ] **Étape 2 : vérifier l'échec** — `npm test`.
- [ ] **Étape 3 : compléter le moteur jusqu'au succès éventuel, sans toucher aux signatures publiées des tâches 2 à 9** — sinon bug d'interface à corriger directement.
- [ ] **Étape 4 : vérifier le succès** — `npm test` complet : réussites totales.
- [ ] **Étape 5 : valider** — `git commit -m "test: full roundtrip scenario"` sur `vibe/11-roundtrip`.

### Tâche 12 : Livraison : Release

**Fichiers :**
- Créer : `.github/workflows/release.yml`, configuration `electron-builder` dans `package.json` (section `build`)
- Modifier : `README.md` (contrôle de livraison)

**Interfaces :**
- Produit : tag `v*` → Release GitHub contenant l'installateur NSIS et l' portable `.exe`, plus `latest.yml` cohérent avec les noms de fichiers (sans espaces, sans caractères accentués).

- [ ] **Étape 1 : adapter `release.yml` de la discipline du launcher** (dossier de connaissances lenancker-launcher) : tag `v*`, `windows-latest`, `npm install --no-audit --no-fund`, `electron-builder --win nsis portable --publish always`, `electron-updater` en dépendance de production, espaces remplacés par des points dans le nom correspondant à `latest.yml`.
- [ ] **Étape 2 : contrôles préalables** — sur la branche : `npm start` : menu Aide → à l'appui, le numéro de version correspond à `package.json` ; vérification manuelle sur le binaire portable téléchargé depuis la pré-version Release (`workflow_dispatch`) : ouverture d'un PDF annoté conservé, pose d'une annotation, sauvegarde, réouverture.
- [ ] **Étape 3 : contrôle par Arthur** — Arthur installe le NSIS sur sa machine (contrôle de sécurité lors du premier lancement de l' application non signée prévue), contrôle l'annotation et l'impression dans Adobe Acrobat.
- [ ] **Étape 4 : valider et livrer** — fusion, tag `v0.1.0`, mention de version du contrôle d' « Atelier PDF » épinglée dans cette section après livraison effective.

### Tâche 13 : Documentation et licence

**Fichiers :**
- Créer : `DOCS/utilisation.md` (guide de l'utilisateur en français, avec captures), `LICENSE` (AGPL-3.0), `NOTICE` (mentions pdf-lib MIT, MathJax Apache-2.0, pdf.js Apache-2.0, Electron MIT, kit Glass on Charcoal AGPL-3.0 et mention SpotiKit), `docs/plans/` tenu à jour
- Modifier : `README.md` (contrôles rapides)

**Interfaces :**
- Produit : un utilisateur disposant du simulacre de l' application sans le README technique ; dépôt conforme à l'AGPL-3.0 (sources publiées).
- [ ] **Étape 1 : rédiger utilisation.md depuis le protocole réel d'utilisation** (installer Windows, ouvrir, annoter, équations, sauvegarde, copies horodatées, questions fréquentes).
- [ ] **Étape 2 : rédiger NOTICE et vérifier le dépôt** — `npm ls --all | grep -i …` prohibits? Contrôle : aucune dépendance nonsensical : vérification de licences avec `node scripts/check-licenses.js` (si absent, en écrire un : échec si une dépendance directe n'est pas MIT/Apche/BSD/ISC).
- [ ] **Étape 3 : valider** — `git commit -m "docs: user guide, license, notice"` sur `vibe/13-docs`, pull request, fusion par Arthur.

---

## Auto-vérification du plan (faite à la rédaction)

1. **Couverture de la spécification :** ouvrir PDF (tâche 10), naviguer et zoomer (tâche 10), 5 annotations persistantes (tâche 4), équation LaTeX toutes structures OneNote (tâches 5, 6 et tâche 10 pour le ruban), enregistrement en réécriture complète + copies horodatées (tâches 2, 9), affichage et impression vérifiés par points de vigilance et scénario aller-retour (tâche 11), vérification Adobe Reader et LibreOffice (tâche 12, contrôle par Arthur). Les non-objectifs (OCR, fusion/découpage : phase 2, cloud) ne sont pas mis en construction.
2. **Interfaces cohérentes :** noms vérifiés entre tâches : `openPdf`, `savePdf`, `timestampedPath`, `makeForm`, `addAnnot`, `hexWinAnsi`, `normalizeRect`, `mjRender`, `addEquation`, `listAnnots`, `deviceToPdf`, `quadPointsForRange`, `createSession`, `session.apply`, `session.edits`.
3. **Points de vigilance :** les 5 lignes ont chacune leur test dans les tâches 2, 3, 4, 7 et 8.
4. **Proportion :** le plan tient en 13 tâches, la logique métier se réfère au code validé du prototype ; aucun corps de fonction n'est recopié dans le plan.

## Décisions non prises dans ce plan (des choix de mise en page, sans incidence pour la construction du moteur)

- Y a-t-il des raccourcis clavier propres aux outils (par exemple `H` pour surlignage) à prévoir au-delà des raccourcis d'affichage ? À confirmer avec Arthur.
- La phase 1 garde la lecture des annotations d'autres logiciels en lecture seule (décision du cadrage) ; l'édition de ces annotations après identification de leurs structures reviendra en considération de phase 2.
