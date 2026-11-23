# L'édition au propre des formules : v0.1.36

Date : 2026-11-23. Déclencheur : retour d'Arthur.
« Quand j'appuie pour modifier une note, c'est possible de modifier
avec la mise en forme reconnue et pas avec cet amas de caractères ? »

Précisions reçues : le cadre d'édition affichait bien « du code de
formules entre $…$ », et le souhait porte sur la formule composée
dans la note ET sur la mise en forme du texte (le texte, lui,
s'affichait déjà mis en forme : le sérialiseur canonique est un
sous-ensemble HTML, réinjecté tel quel dans le contenteditable).

## Diagnostic (sourcé, pas deviné)

La chaîne v0.1.31 garde la mise en forme et les formules d'une note
dans SA SOURCE CANONIQUE (sous-ensemble HTML + $...$), posée dans
/Contents derrière le marqueur « Note riche [taille] : ». À la pose,
le moteur compose le tout (engine/riche.js + markup.js + MathJax) :
la PAGE montre des formules composées. Mais le CADRE D'ÉDITION, lui,
mettait la source dans le contenteditable SANS composer les formules
(seul un aperçu composé vivait sous la saisie) : la reprise d'une
note de maths montrait donc le LaTeX brut entre dollars
($\dfrac{1}{8}$…) — « un amas de caractères ». L'insertion depuis le
panneau Équation insérait de même le code `$...$` nu
(execCommand insertText).

## Correctif : composer dans le cadre, ne rien changer au fichier

1. COMPOSER L'IMAGE (renderer/app.js, composerImageFormule) : chaque
   formule se réduit en image (les ops MathJax de l'aperçu, déjà
   tracées par tracerOpsPlacé, peintes sur un canevas puis dataURL),
   alignée sur la ligne de base par vertical-align négatif de la
   profondeur. La géométrie (marges, hauteur au-dessus/dessous de la
   base, décalage CSS) vit dans le moteur pur engine/markup.js
   (cadrerImageFormule, PAD_IMAGE_FORMULE) — la même pour l'éditeur,
   l'aperçu et les tests.
2. HABILLER LA NOTE REPRISE (habillerFormulesEditeur) : après
   l'injection de la source canonique, chaque segment $...$ des
   noeuds texte devient une image composée, à sa place, dans la mise
   en forme existante. Le parcours est ASYNCHRONE mais PRUDENT :
   cadre refermé, onglet changé ou texte modifié pendant la
   composition = arrêt net, jamais une image ne remplacée un texte
   qui a bougé. Échec de composition = le code reste visible (repli
   intégral d'avant la v0.1.36).
3. L'INSERTION COMPOSÉE (insererEquation) : la formule validée du
   panneau Équation se pose en image au curseur (l'aperçu
   précalculé sert tel quel, pas de recomposition) ; repli en code
   nu si la composition échoue. Un DOUBLE-CLIC sur une formule
   composée l'ouvre dans le panneau pour correction (« Remplacer la
   formule » remplace l'image en place, la saisie continue).
4. LE FICHIER NE CHANGE PAS D'UN CARACTÈRE : le sérialiseur
   restitue chaque image en $...$ brut (serialiserInlineRiche,
   data-latex) ; la source canonique, le journal d'annulation (le
   geste retrait + repose est identique), les autres lecteurs PDF et
   les tests d'aller-retour sont INTACTS. Une note réduite à ses
   formules (innerText vide, images invisibles au texte) reste
   posable : la garde de vide consulte la source (contientFormule).

## Tests (270 au total, un saut d'office, aucun échec)

- test/markup.test.js (+3) : cadrerImageFormule réduit l'aperçu au
  corps réel (base, profondeur, décalage CSS) ; la marge du bas
  subsiste sans profondeur ; un aperçu absent, négatif ou une
  échelle absente restent dans des dimensions entières (jamais un
  canevas nul).

## Leçons

- Le WYSIWYG d'un écran se juge au moment de RETROUVER le travail
  (la reprise), pas seulement au moment de l'écrire : une chaîne
  qui compose à la pose doit aussi composer à la reprise.
- Composer à l'affichage sans toucher au stockage : sérialiser
  l'affichage vers le canonique existant rend le correctif
  réversible et invisible pour tout le reste (fichier, annulation,
  autres lecteurs) — la bonne couche pour « ce qui se voit ».
- Une promesse asynchrone qui écrit dans un document éditable doit
  être accompagnée de son geste d'annulation : isConnected et le
  pivot de saisie vérifiés AVANT chaque remplacement.
