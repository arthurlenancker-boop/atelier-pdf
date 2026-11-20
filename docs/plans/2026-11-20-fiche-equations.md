# Fiche « texte + formules » (v0.1.11) : conception et plan

Validation : Arthur a approuvé le croquis « Croquis : formules dans le fil du texte »
(canevas de la conversation, 20 novembre 2026), sur la demande initiale
« ce n'est pas le même fonctionnement que Dmaths dans LibreOffice dans la saisie de texte ».
Objectif retenu avec Arthur : annoter un PDF existant en écrivant des passages qui mêlent
texte et formules, la formule s'insérant à la position du curseur dans la fiche.

## Conception approuvée

Trois étapes : (1) le texte se tape normalement dans la fiche, bouton « ƒ Insérer une
formule » dans la fiche (ou Ctrl+M) ; (2) le panneau Équation et ses fenêtres guidées
s'ouvrent à l'habituuelle, « Écrire » insère la formule au curseur exact ; (3) à la
validation, une seule annotation posée : texte et formules sur la même ligne, calées sur
la ligne de base, corrigeable au double-clic, rendu identique dans les autres lecteurs.

## Décisions d'implémentation (mes choix, modifiables à la revoire)

- Balisage : formules inline délimitées par `$...$` (LaTeX à l'intérieur). Seuls les `$`
  APPARIÉS délimitent une formule ; un `$` isolé reste du texte. `$ $` (formule vide)
  reste du texte. Le bouton écrit les `$` pour l'utilisateur.
- Annotation : /Square à bordure invisible (comme les équations, rendu vérifié dans
  Acrobat/Edge/LibreOffice), /AP dessinée par nous (texte Helvetica + formules en
  XObjects), /Contents = `Fiche mixte : <source>`. Les fiches sans `$` restent des
  /FreeText inchangées (compatibilité arrière).
- Taille : formule posée à exPt = 0,52 × taille du texte (x-height Helvetica), pour
  que les glyphes MathJax s'alignent sur le corps Helvetica.
- Interligne : ligne = max(0,75×fs, hauteur-dessus-formule) + 0,45×fs (interbase) +
  max(0,25×fs, profondeur-formule).
- Rect réalisé : x et haut conservés ; le bas descend si le contenu dépasse la zone
  glissée, la zone glissée est conservée si le contenu tient.
- Texte stocké/affiché : WinAnsi ; translittération des symboles hors WinAnsi
  (≠ → !=, ≤ → <=, ≥ → >=, ≈ → ~, − U+2212 → -, ⩽ etc.) ; les symboles mathématiques
  riches vivent dans les formules $...$. La source stockée EST la source affichée
  (re-édition fidèle au double-clic).
- Pas de fond dans /AP (comme les fiches actuelles) ; l'application dessine une carte
  translucide claire sous le contenu, texte #14161c (croquis validé).
- Fidélité au croquis : la zone de saisie reste un champ texte où la formule apparaît
  sous forme `$latex$` (comme la boîte de formule de Dmaths montre le code), avec un
  aperçu RENDU en direct juste en dessous dans la même carte.

## Tâches (TDD : rouge puis vert à chaque tâche)

### T1. Moteur pur engine/texte.js + test/texte.js
- PREFIXE_FICHE_MIXTE, extraireSourceFiche (marqueur « Fiche mixte : »),
  translitterMathWinAnsi, decouperMelange(source) → segments
  {type:'texte'|'formule', valeur}, exPourCorps(fs), composerLignes(segments,
  {mesurerTexte, dimsFormule, largeurMax, fontSize}) → lignes
  {morceaux: [{type, valeur|latex, largeur, hDessus?, hDes?}], hDessus, hDes}
  (formule insécable, mot long coupé caractère par caractère).
- Tests locaux : ~10 (découpage, $ impair, $ $ vide, coupe, insécabilité,
  hauteurs ligne formule > texte).

### T2. engine/melange.js (pdf-lib + MathJax) + test/melange.test.js (CI seulement)
- addMixedFiche(doc, page, {rect, source, fontSize = 11}) : mjRender par formule
  (cache par latex), largeurs Helvetica via doc.embedFont, composeLignes,
  opérations /AP (BT /F1 … Tm <hex> Tj ET ; q a 0 0 1 x (base − depth) cm /Fx Do Q),
  XObjects /Fx en ressources, rect réalisé, Contents `Fiche mixte : source`.
- Retour {ref, rect}. Entrée REGISTRE session.js : `ficheMelangee`.

### T3. Interface (renderer/app.js)
- Détection/routage : Square + « Fiche mixte » → ouvrirEditeur('fiche', null, cible)
  (kind ficheMelangee), clic comme double-clic.
- validerEditeur : fiche dont le texte contient `$…$` apparié → édition
  ficheMelangee (remove + pose).
- Affichage : branche Fiche mixte dans dessinerAnnots (carte claire, texte, formules
  via ops cache), généralisation de chargerOpsEquations (cache par fiche).
- Éditeur : mini-barre « ƒ Insérer une formule » + Ctrl+M ; mode insertion-fiche du
  panneau Équation (bouton « Insérer dans la fiche », insertion `$latex$` au
  curseur, refocus, aperçu live en dessous du champ, debounced).
- Correctif d'insertion au curseur dans #eq-saisie : préréglages et fenêtres guidées
  insèrent au curseur (comme insererAuChamp) au lieu de remplacer.

### T4. Livraison
- README (contrôles : fiche à formules), version 0.1.10 → 0.1.11, déclencheur
  etag.yml, ce document, exercice de surveillance identique aux versions
  précédentes (tag = commit, release, sha512).

## Pièges visés par les tests

- `$` impair ou formule vide → texte ordinaire, jamais de blocage.
- Formule trop large pour une ligne → isolée sur sa propre ligne, jamais coupée.
- Mot plus large que la largeur → coupé caractère par caractère.
- Ligne contenant une fraction : hauteur étendue au-dessus et en dessous, la
  ligne de base du texte reste celle de la formule.
- Re-édition : la source relue rend EXACTEMENT ce qui a été saisi (marqueur
  retiré une seule fois).
