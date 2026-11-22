# v0.1.25 — correctifs Equation sur retour d'Arthur (22 novembre 2026)

## Contexte

Retour d'Arthur après essai réel de la v0.1.24 (capture du panneau
Équation) : « ce n'est pas la même que celle de OneNote même si ce n'est
pas mal ; \Leftrightarrow est censé donner une double flèche avec deux
traits ; \times est censé donner un "fois" ». La capture montrait en
lettres droites dans la zone structurée des fragments tels que
« Leftrightarrow/ow » et « times ».

## Diagnostics (reproduits localement, moteur pur)

1. COLLAGE : la juxtaposition sérialisait `\Leftrightarrow` suivi d'un
   autre atome SANS séparateur (`p \Leftrightarrow ow` →
   `\Leftrightarrowow`) : commande LaTeX inconnue, que MathLive
   affiche en lettres droites (« Leftrightarrowow »). Même chose pour
   `a\times b` → `\timesb`.
2. PERTE : un symbole Unicode alors inconnu du parseur (⇔, ·…) arrêtait
   l'analyse et TOUTE la fin de la saisie disparaissait (« a⇔b » → « a »,
   « (3·4)/x » → « (3) »).
3. Nommerie : `\superset`/`\superseteq` n'existent pas en LaTeX
   (les vrais noms sont \supset/\supseteq) ; ∘ ∙ étaient transcodés en
   \cdot approximatif.
4. FONTE (remarque « pas la même que OneNote ») : NON CORRIGEABLE à
   l'identique. OneNote affiche Cambria Math, police Microsoft
   propriétaire ; MathLive compose avec les polices KaTeX (libres) et
   le PDF final avec les polices TeX de MathJax. Aucune des trois ne
   peut embarquer Cambria Math dans un logiciel AGPL. Réponse faite :
   compromis assumé, la v0.1.25 corrige le COMPORTEMENT pour que le
   geste OneNote (commande + Espace → symbole) soit exact.

## Correctifs (engine/unicodemath.js, TDD rouge → vert : 81 tests)

- sepJuxt : GARDE ANTI-COLLAGE — toute gauche se terminant par une
  commande LaTeX reçoit un espace avant l'atome suivant
  (`/\\[A-Za-z]+$/`). « p\Leftrightarrow ow » → `p \Leftrightarrow ow` ;
  « a\times b » → « a \times b » ; « \alpha x » → « \alpha x ».
- serie() : FILET ANTI-PERTE — un jeton que l'analyse n'a pas consommé
  est juxtaposé tel quel (ou repris par une vraie suite si c'est un
  mot) ; plus jamais la fin de la frappe n'est avalée.
- estBinaireRel étendu : ⇔ ⟺ ⟷ ⇒ ⇐ ∓ ∖ ∧ ∨ ⊕ ⊖ ⊗ ⊙ ∉ ∣ ⊥ ∥ ∼ ≃
  ⊢ ⊣ ∵ ∴ (et + − = < > inchangés). PIÈGE de session : les
  concaténations de lignes dans la chaîne testée PAR `.includes(c)`
  exigent des parenthèses : `a + b + c.includes(c)` s'évalue
  `a + b + (c.includes(c))` et retourne une chaîne TOUJOURS véridique
  (vrai pour TOUT caractère) — caught by test « a★b ».
- opVersLaTeX : couverture des nouveaux symboles + atomes isolés
  (↑ ↓ ↦ ↕ ⇕ ∇ ¬ ∅ ∠ △ ⊤ ° ′ ⋯ … \supset \supseteq corrigés),
  retombée MULT_LA pour les produits. ser('mot') retombe désormais sur
  opVersLaTeX : un symbole isolé en début de saisie (« \Leftrightarrow »
  seul, puis Espace) donne la commande, pas la lettre.
- MULT : · (U+00B7) et • ∗ ⋆ rejoints ; MULT_LA mappe chacun à sa
  commande propre (∘ = \circ, • = \bullet, ⋆ = \star…).

## Interface (renderer/app.js, ancien test 75 verts + nouveaux)

- Palette « Ensembles & flèches » enrichie : ← ⇐ ⇔ ⟺ (⇒ et → déjà
  présents), donc boutons directs pour la double flèche d'équivalence.
- La table FILET (LINEAIRE) suit SYMR automatiquement.

## Décisions non prises (laissées à un retour d'usage)

- Les polices d'édition (KaTeX) et du PDF (TeX MathJax) restent libres :
  se rapprocher encore de l'aspect Cambria Math exigerait des données de
  police SVG sur mesure (STIX Two) : éventuel chantier futur si Arthur
  le demande.

## Livraison

12+ fichiers poussés en un commit par protocole d'empreintes ; flux
Livraison déclenché par etag.yml ; tag v0.1.25 ; sha512 vérifié contre
latest.yml.
