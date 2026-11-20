# Plan d'implémentation v0.1.13 — confort d'annotation (Main, sélection de texte, annulation)

> Pour l'exécution : approche native (l'agent réalise chaque tâche dans cette
> session, comme les versions 0.1.0 à 0.1.12). Le design validé se trouve
> dans docs/plans/2026-11-20-confort-selection-v0.1.13.md.

**Objectif :** la page se prend à la main, le texte du document se sélectionne
et se surligne exactement, chaque geste s'annule d'un Ctrl+Z et se rétablit.

**Architecture :** aucun changement de pile : moteur CommonJS pur sous Node
(pdf-lib en CI seulement), rendu ESM Electron (pdf.js v4), annotations PDF
standard. Le rejeu d'annulation vit dans le moteur (testé en CI) ; le
processus principal ne fait que conserver les octets originaux, les lots
appliqués, et exposer l'IPC.

**Contraintes globales :**
- npm interdit localement ; node --check sur tout .js ; tests locaux : les
  fichiers sans dépendance pdf-lib/mathjax seulement.
- Tests CI uniquement (pdf-lib, mathjax-full, mjrender) dans test/*.test.js.
- Copies d'interface en français, sans contractions.
- Tout reste des annotations standard dans le fichier (/Highlight + /QuadPoints...).
- Livraison : bump 0.1.13 + ligne déclencheur .github/workflows/etag.yml +
  lignes README, push par empreintes, vérification CI/annotations, tag,
  somme sha512 de l'installateur, archive + KNOWLEDGE.md.

**Review focus (ce que les tests doivent pincer) :**
1. Ctrl+Z pendant la saisie d'une note doit annuler la FRAPPE et jamais le
   document → garde sur la cible de l'événement (tâche 4).
2. Annuler une CORRECTION (retrait + repose = un seul geste) doit retirer la
   repose d'un bloc, sans rien laisser → test moteur (tâche 2).
3. Le rejeu attend les poses asynchrones (fiche mixte, embedFont) → test
   moteur (tâche 2).
4. Pages tournées : les rects sélection convertis en quads suivent la
   conversion déjà prouvée → test coords (tâche 5).
5. Sélection multi-lignes fragmentée : les rects d'une même ligne fusionnent
   en UN quad par ligne → test coords (tâche 5).

---

### Tâche 1 — Outil Main

**Fichiers :** modifier renderer/index.html (bouton `.outil` data-outil="main",
libellé « Main », avant le bouton Sélection), renderer/app.js (pointerdown/move/
up de ecouterSouris + choisirOutil + messages), renderer/style.css (cursors
`body[data-curseur="main"]` : main ouverte refermée).

**Interfaces :** etat.outil peut valoir 'main' ; aucun changement moteur.

- [ ] Étape 1 : bouton Main dans la barre + cas 'main' dans pointerdown : mémoriser
  departEcran {x, y} + scrollDepart {gauche, haut} ; pointermove : décaler
  els.visionneuse.scrollLeft/scrollTop du delta écran (pas de conversion PDF,
  pas de dessin sur le tampon) ; pointerup : rien.
- [ ] Étape 2 : dernier état : choisirOutil('main') → curseur 'main', message
  « Faites glisser la page. » ; le zoom fluide reste prioritaire (garde
  gesteZoomActif inchangée).
- [ ] Étape 3 : node --check module du rendu.

### Tâche 2 — Moteur du rejeu (annulation)

**Fichiers :** créer engine/undo.js ; créer test/undo.test.js (CI only).

**Interfaces :**
- Produit : `async function rejouer(octets, gestes)` — octets : Uint8Array du
  fichier ORIGINAL tel qu'ouvert ; gestes : tableau de LOTS, chaque lot un
  tableau d'éditions { kind, pageIndex, args } telles qu'envoyées par IPC
  (références sérialisées { objectNumber, generationNumber }). Retour :
  `{ doc, session }` (session prête, tout le journal interne rempli). Toute
  édition qui échoue lève avec le nom de la sorte.
- Consomme : openPdf (engine/pdfio.js), createSession (engine/session.js).

- [ ] Étape 1 : test CI échouant d'abord : document vierge créé et enregistré
  (savePdf) → octets originaux ; gestes : [highlight], [square], [note
  freeText], [fiche mixte ASYNCHRONE], [correction note : remove + freeText],
  [deplacer]. Assertions : rejouer(octets, gestes complets) → listAnnots avec
  le même décompte DANS LE MÊME ORDRE de sous-types/contenus que la session
  directe ; rejouer(octets, gestes moins le dernier lot) → le déplacement
  absent ;
  rejouer(octets, gestes moins les 2 derniers) → la correction annulée :
  l'annotation repose absente ET l'originale encore là, un seul bloc.
- [ ] Étape 2 : implémenter rejouer : openPdf → createSession → pour chaque
  lot, pour chaque édition : `await` session.apply(edit) (apply renvoie une
  promesse pour les fiches mixtes ; l'attendre toujours).
- [ ] Étape 3 : node --check ; test CI local impossible (pdf-lib absent) →
  ne l'exécuter qu'en CI ; relire assertion par assertion avant le push.

### Tâche 3 — Processus principal : octets, lots, IPC, menu

**Fichiers :** modifier main.js (openPdf garde etat.octets = copie des octets
lus ; pdf:apply enregistre le lot APPLIQUÉ (les length premiers faits) dans
etat.gestes et vide etat.aRefaire ; nouveaux canaux pdf:undo / pdf:redo qui
appellent engine rejouer(octets originaux, gestes sans le dernier lot) /
session.apply de chaque édition du lot sommet de etat.aRefaire ;
resumerSession expose peutAnnuler / peutRefaire), preload.js (canals undo,
redo), main.js menu Édition (Annuler,Ctrl+Z et Rétablir,Ctrl+Maj+Z,
registerAccelerator:false, cliquables, disabled dynamiquement).

- [ ] Étape 1 : pdf:undo : si gestes vides → { erreur:null, resume } inchangé ;
  sinon rejouer tout sauf le dernier lot, le lot retiré va au sommet
  d'etat.aRefaire, etat.doc/session remplacés, modifie = gestes.length > 0.
  Toute erreur de rejeu → réponse { erreur } SANS toucher l'état courant.
- [ ] Étape 2 : pdf:redo : si aRefaire vide → inchangé ; sinon le lot
  sommet est appliqué édition par édition (await), bascule en queue de
  etat.gestes.
- [ ] Étape 3 : node --check main.js preload.js.

### Tâche 4 — Rendu : boutons et raccourcis d'annulation

**Fichiers :** modifier renderer/index.html (boutons Annuler/Rétablir près
d'Enregistrer, disabled au départ), renderer/app.js (majResume lit
peutAnnuler/peutRefaire et met à jour les boutons ; keydown Ctrl+Z/
Ctrl+Maj+Z avec la garde existante sur TEXTAREA/INPUT ; messages ; majResume
après undo/redo via le résumé renvoyé).

- [ ] Étape 1 : window.atelier.undo()/redo() renvoient { erreur, resume } →
  la même fonction majResume les absorbe.
- [ ] Étape 2 : garde : si ev.target est TEXTAREA ou INPUT, Ctrl+Z/Ctrl+Y ne
  touchent PAS au document (retour immédiat).
- [ ] Étape 3 : node --check module.

### Tâche 5 — Sélectionner le texte → surlignage exact

**Fichiers :** modifier engine/coords.js (ajouter `quadsPourLignes(lignes)` :
une ligne écran { x0, yHaut, x1, yBas } → quad PDF [xTL,yTL,xTR,yTR,xBL,yBL,
xBR,yBR] avec yTL=yTR=yHaut converti ; pure, réutilise zéro dépendance),
test/coords.test.js (lignes simples, multi-lignes, fusion), renderer/index.html
(bouton Sélectionner le texte ; div #calque-texte dans le conteneur ;
div #barre-selection avec boutons Surligner/Copier), renderer/style.css
(couche texte transparente, ::selection visible, barre flottante),
renderer/app.js.

**Interfaces :**
- `quadsPourLignes(lignes)` retourne `[[x,y]×8 par ligne]` hexagonal au
  format POSÉ par quadPointsForRange ; rects = fusion par ligne des
  getClientRects (y commun).
- pdf.js v4 : `new pdfjsLib.TextLayer({ textContentSource, container,
  viewport })` puis `.render()` ; repli : `pdfjsLib.renderTextLayer(...)` si
  la classe manque ; les deux dans try/catch avec effacement propre.

- [ ] Étape 1 : test coords échouant d'abord : quadsPourLignes([{x0:10,yHaut:
  700,x1:200,yBas:688}]) === [[10,700,200,700,10,688,200,688]] ; deux lignes
  → deux quads ; rects fragmentés d'une même ligne (yHaut partagé) → UN quad
  par ligne (fusion min x0 / max x1). Tests locaux exécutables (coords pur).
- [ ] Étape 2 : implémenter quadsPourLignes ; node --test coords verts.
- [ ] Étape 3 : rendPage reconstruit #calque-texte (largeur/hauteur du
  conteneur, position absolute) à partir de getTextContent + TextLayer (repli
  renderTextLayer) ; la div n'est visible et cliquable QUE si l'outil
  'texte' est actif (choisirOutil + pointer-events).
- [ ] Étape 4 : mouseup document : si outil 'texte' et sélection non repliée :
  calcul des lignes (getClientRects regroupés par yHaut), positionnement de
  #barre-selection au-dessus ; Surligner → quadsPourLignes → appliquer({
  kind:'highlight', pageIndex, args:{ rect: boîte englobante, quadPoints }})
  ; Copier → presse-papiers + message ; Échap ou clic ailleurs referme ;
  gesteZoomActif : ne rien proposer.
- [ ] Étape 5 : node --check module.

### Tâche 6 — Version, documentation, pièces d'accompagnement

- [ ] package.json → 0.1.13 ; .github/workflows/etag.yml ligne déclencheur
  v0.1.13 ; README : lignes « Prendre la page à la main », « Sélectionner du
  texte » (mention scans sans texte → le rectangle reste), « Annuler/
  Rétablir » ; conserver ce plan et le design dans le push.

### Tâche 7 — Livraison et vérification

- [ ] Empreintes (n unités UTF-16, Σ(i+1)·unité mod 2^32) → lecture vérifiée
  → push_files → diff -r codeload/local vide.
- [ ] Surveillance CI : page /commit/<sha>/checks, chercher « Annotations » ;
  en cas d'échec lire l'extrait publié, corriger, re-pousser (retoucher
  etag.yml).
- [ ] Tag v0.1.13 == commit ; release en ligne ; sha512 base64 de l'installateur
  vérifié ; archive tar.gz dans la base de connaissances ; KNOWLEDGE.md mis à
  jour (décisions, pièges, leçons) ; réponse finale à Arthur.
