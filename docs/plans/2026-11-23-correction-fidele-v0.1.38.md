# La correction fidèle au document : v0.1.38

Date : 2026-11-23. Déclencheur : retour d'Arthur après la v0.1.37 —
« quand je modifie le texte ça forme un amas de texte et après les
modifications ne s'appliquent pas et le texte reste tel qu'il était »,
puis « le test modifie la police ». La capture jointe montrait une page
de cours à TITRES COLORÉS, GRAS et LIENS : une page à TEXTE RÉEL, pas un
scan. C'est le second frottement ouvert de l'entretien des dix versions
(« l'OCR et la modification du texte fait parfois des erreurs »), et
l'objet de la priorité d'Arthur : fiabiliser et affiner l'existant.

## Symptômes rapportés et clarifiés

1. La modification d'un texte « forme un amas de texte ».
2. Certaines modifications ne s'appliquent pas : le texte reste tel
   qu'il était (une correction retirée puis jamais reposée).
3. Le test modifie la police : le bloc corrigé change d'aspect.

Clarification demandée à Arthur : le bloc entier change d'aspect
(autre police) mais la couverture est propre — le masque, lui, couvre
bien. Direction choisie : « Fidélité au document : la correction lit le
vrai texte de la page (famille de police, taille réelle mesurée sur
place) ».

## Diagnostic (sourcé dans le code, pas deviné)

La correction en place (v0.1.29) fut conçue pour les SCANS :

- la source préremplie venait de la transcription OCR mot à mot
  (sourceDeBloc), jamais du vrai texte de la page ;
- la taille du corps était ESTIMÉE de la hauteur d'une ligne de l'image
  de reconnaissance (tailleEstimeeDeBloc : 72/200 points par pixel,
  divisés par 1,4), jamais mesurée sur place ;
- le fichier réécrivait tout en Helvetica uniforme
  (engine/correction.js : `Font: { F1: 'Helvetica' }`).

Sur une page à texte réel, cette triple approximation détruit l'apparence
du document : police changée (le retour d'Arthur), taille approximative
(un « amas » quand la composition déborde du bloc).

Et le second symptôme (« les modifications ne s'appliquent pas »)
tenait à la boucle des formules : la pose rend CHAQUE formule distincte
par MathJax AVANT d'écrire le fichier, sans rattrapage — une formule que
MathJax ne peut pas composer (motif inconnu, LaTeX blessé par la
reconnaissance) rejette la correction entière ; l'annotation d'origine a
DÉJÀ été retirée au moment du rejet (reprise : remove puis pose), le
texte reste donc « tel qu'il était » en apparence… la correction d'Arthur
n'existe plus.

## Correctif (sans changer le format des fichiers)

1. engine/textereel.js (NOUVEAU, moteur pur) : le VRAI texte d'une page
   lu par pdf.js — taille réelle des fragments, famille générique du
   style (« sans-serif » tranché SANS avant « serif », car
   « sans-serif » CONTIENT « serif »), gras au mieux du style, sélection
   des fragments dans le rectangle du bloc (garde verticale 0,65
   corps), regroupement en lignes réelles recollées mot à mot, analyse
   dominante (taille et famille au poids du texte).
2. renderer/app.js : le texte réel demandé UNE FOIS par page
   (.getTextContent promis en cache pour tout le document), la
   correction d'une page à texte réel part de la source réelle, de la
   taille réelle, de la famille et du gras ; le rectangle couve l'union
   du bloc reconnu et de l'encre réelle ; le cadre d'édition écrit
   DÉJÀ dans la police du document (Times pour une page à empattements)
   et l'aperçu de composition suit. Sur une page muette (scan), la
   reconnaissance garde son rôle comme toujours.
3. engine/texte.js : le marqueur /Contents s'étend en
   « Correction OCR <taille> <serif|sans> [gras] : » — les termes sont
   FACULTATIFS, tous les marqueurs posés depuis la v0.1.29 restent
   relus tels quels (extraireSourceCorrection n'a pas changé de
   contrat).
4. engine/correction.js : la police de la correction est celle du
   DOCUMENT (Times-Roman/Times-Bold pour serif, Helvetica/Helvetica-Bold
   sinon), posée en RÉFÉRENCE de la police embarquée ; et une formule
   non rendable s'écrit en TEXTE translittéré sur la ligne de base —
   la pose réussit TOUJOURS, la correction n'est plus jamais perdue.
5. engine/bouger.js : la reprise (double-clic) et le redimensionnement
   relisent famille et gras du marqueur : une correction Times reste
   Times après avoir été déplacée, reprise ou redimensionnée.

## Ce que le correctif ne prétend pas (loyauté)

- Les couleurs et les liens d'un bloc corrigé restent approximés
  (encre sombre unie) : la correction remplace l'encre par du texte
  vectoriel, elle ne repeint pas les couleurs d'origine.
- La détection du gras est au mieux : pdf.js n'expose pas toujours le
  poids des polices, le repli est « pas gras ».
- Les pages tournées gardent le comportement antérieur (la lecture du
  vrai texte suppose une page droite ; un scan penché reste un scan).

## Tests

- test/textereel.test.js (NOUVEAU, 7 tests) : famille (« sans-serif »
  tranché sans avant serif), gras, taille, sélection avec garde,
  regroupement en lignes, dominantes, null sans texte réel.
- test/correction.test.js : marqueur famille/gras relu (anciens formats
  compris), pose serif en Times (ressource résolue en /Times-Bold,
  référence de la police embarquée), pose par défaut « sans », formule
  non rendable qui ne rejette PLUS la pose, redimensionnement qui
  garde la famille.
- 284 tests au total (272 avant), 0 échec, tesseract réel sauf CI.
