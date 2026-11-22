# Le retrait qui se voit : v0.1.35

Date : 2026-11-22. Déclencheur : retour d'Arthur.
« Ça ne retire pas vraiment, et regarde les dingueries que fait l'ocr. »

## Diagnostic (sourcé, pas deviné)

Supprimer une annotation ôtait bien l'entrée du /Annots — le fichier
était juste — mais l'écran montrait deux sources contradictoires :

1. Le CALQUE APPLICATIF (dessinerAnnots de renderer/app.js) peint
   les annotations depuis le résumé : il avait bien vidé le
   surlignage supprimé.
2. Le CANEVAS DE PAGE, lui, était peint par pdf.js avec les
   APPARENCES des annotations (annotationMode implicite ENABLE de
   render()) : le surlignage d'origine restait au fond de page,
   sous le calque.

Supprimer (ou « ôter le surlignage ») laissait donc à l'écran une
peinture orpheline : « ça ne retire pas vraiment ». Les blocs en
pointillés et le voile bleu pâle autour des formules signalés à coté
sont l'affichage des blocs reconnus par l'OCR (calque « Reco »,
masquable au bouton) et la sélection : ils ne sont jamais inscrits
dans le fichier.

Banc d'essai (node, pdfjs-dist 4.10.38, PDF forgé par pdf-lib :
surlignage sans /AP, cadre /Square avec /AP, encre sans /AP) :
getOperatorList({ annotationMode: ENABLE }) compte 3 sections
beginAnnotation — pdf.js peint les trois sortes, surlignage et encre
sans apparence compris (apparence par défaut forgée par le worker) ;
annotationMode: DISABLE en compte 0. Conclusion de source : c'est
bien render() l'unique coupable du fond repeint, et DISABLE
l'annule.

Deux conséquences à couvrir avant de fermer la porte :

- l'ENCRE : le calque n'en montrait qu'un cadre pointillé, pdf.js
  peignait les traits ; sous DISABLE elle disparaîtrait ;
- les ANNOTATIONS TIERCES (trait, polygone, tampon…) : seul pdf.js
  les peignait ; sous DISABLE elles disparaîtraient.

## Correctifs : trois volets

1. Rendu principal sans fond repeint (renderer/app.js, rendPage) :
   page.render({ ..., annotationMode: DISABLE }). Le calque
   applicatif devient l'unique source visible des annotations :
   une suppression à l'écran se voit aussitôt. Vignettes et
   captures gardent le rendu complet (aucun calque par-dessus).
   Repli prudent : si AnnotationMode manquait, 0 EST la valeur
   DISABLE de la norme du module.
2. L'encre redessinée par le calque : engine/reread.js relit
   /InkList point par point (champ inkList : chemins d'un nombre
   pair de coordonnées, chacune relue) ; dessinerAnnots trace les traits avec la couleur
   /C et l'épaisseur /BS W du fichier, silhouette pointillée en
   repli si un trait est illisible. Les annotations tierces visibles
   (Line, PolyLine, Polygon, Stamp, Caret, FileAttachment, Redact)
   reçoivent un liseré pointillé gris pour rester visibles et
   sélectionnables ; liens et champs de formulaire, invisibles par
   nature, ne sont jamais marqués.
3. Outil « Ôter tous les surlignages de la page » (menu Édition) :
   engine/surlignage.js (moteur pur) définit les quatre formes de
   surlignage (surlignage, souligné, barré, ondulé) et sélectionne
   celles de la page affichée ; le lot forme UN geste (une
   annulation les ramène toutes). La sélection visée est libérée.

## Tests (267, un saut d'office, aucun échec)

- test/surlignage.test.js (NOUVEAU, 4) : les quatre formes
  reconnues rien qu'elles ; filtre par page et par forme ; résumé
  absent ou brouillé toléré ; ordre de lecture conservé.
- test/reread.test.js (+2) : /InkList relu point par point avec
  /C et /BS W ; pas de clef inkList pour une annotation sans encre.

## Leçons

- Un écran à deux sources de vérité finit toujours par les
  contredire : quand l'édition dessine sur un calque, le fond
  doit être sourd aux mêmes données (DISABLE), sinon chaque
  suppression est un mensonge visuel.
- Fermer un robinet d'affichage oblige à dresser l'inventaire de
  tout ce qu'il arrosait (ici l'encre et les annotations tierces) :
  vérifié AVANT la bascule, pas constaté après.
- « Les bizarres de l'OCR » méritaient d'être triées : blocs
  reconnus (affichage masquable, jamais dans le fichier), voile de
  selection, surlignage réel du fichier. Trois phénomènes, un seul
  étant dans le document.
