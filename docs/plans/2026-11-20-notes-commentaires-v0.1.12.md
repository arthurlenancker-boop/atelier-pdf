# v0.1.12 — Notes et commentaires : clic, déplacer, redimensionner

Croquis validé par Arthur (canvas croquis-notes-commentaires), à la manière de
PDF-XChange Editor : « texte écrit directement sur la page, partout où je
clique », « texte redimensionnable et position changeable ».

## Décisions

- Outil Note = texte NU (machine à écrire, sans fond) posé au point cliqué,
  posé en /FreeText avec /Subject « Note ». L'ancienne icône /Text reste
  lisible et déplaçable, mais l'outil Note ne la pose plus.
- Outil Fiche = carte avec fond (comme avant) ; un simple clic pose la carte
  au point cliqué (largeur par défaut 260 pt, glisser reste possible pour
  choisir la zone). Formules $...$ inchangées (v0.1.11).
- Sélection (outil par défaut) : poignées autour de l'annotation ; glisser
  dedans = déplacer ; tirer une poignée = redimensionner ; Suppr supprime ;
  double-clic corrige. Toutes les annotations se déplacent ; textes, fiches,
  équations et cadres se redimensionnent ; surlignage, trait et icône note
  refusent le redimensionnement avec un message clair.
- Le déplacement et le redimensionnement restent des annotations STANDARD :
  /Rect mis à jour, /AP recalculé (voir ci-dessous), même rendu partout.

## Moteur

- engine/geom.js (PUR, testé Node, double en-tête gardé) : poignéesRect,
  poigneeSousPoint (tolérance en points), rectDepuisPoignee (ancrage du coin
  opposé, minimums 24 × 10 pt).
- engine/texte.js : le marqueur de fiche mixte gagne la taille du corps :
  « Fiche mixte 11 : <source> ». Ancien format toujours relu (taille par
  défaut 11 = FS_FICHE ; toutes les fiches 0.1.11 ont exactement 11).
  Nouvelle lecture : extraireTailleFiche.
- engine/reread.js : listAnnots expose /Subject (distinction note nue /
  fiche carte à l'écran).
- engine/annots.js : addFreeText accepte subject (« Fiche » par défaut).
- engine/bouger.js (pdf-lib, tests CI) :
  - deplacerAnnot(doc, page, { ref, dx, dy }) : décale /Rect, /QuadPoints et
    /InkList ; décale /AP (BBox + opérateurs re/m/l/Td/cm/Tm) pour tout sauf
    les équations (leur /AP est LOCALE : BBox [0,0,w,h] mappé sur /Rect, seul
    /Rect bouge, les lecteurs conformes mettent l'apparence à l'échelle).
  - redimensionnerAnnot(doc, page, { ref, rect }) :
    /FreeText → /Rect + /AP régénérés (texte et taille depuis /DA) ;
    fiche mixte → remove + re-pose depuis la source embarquée et la taille
    du marqueur (asynchrone, embedFont) ; équation → /Rect seul (l'apparence
    locale est mise à l'échelle BBox→/Rect partout) ; cadre → /Rect + /AP
    régénérés ; Text/Highlight/Ink → refus explicit.
- engine/session.js : REGISTRE += deplacer, redimensionner (le chemin
  promesse v0.1.11 journalise les poses asynchrones après réussite).

## Rendu (renderer/app.js)

- pointerdown Note → éditeur au point cliqué (libreTexte nu) ; pointerup
  Fiche sans glisser → carte par défaut au point.
- dessinerAnnots : Subject « Note » → texte nu sans fond ; poignées
  dessinées sur la sélection.
- outil Sélection : départ = teste la poignée sous le curseur (sélection
  courante), sinon l'annotation sous le curseur ; geste déplacement (fantôme
  translucide pendant le drag) ou poignée (rect d'aperçu) ; pointerup →
  applyEdits deplacer/redimensionner, sélection recollée à la ref retournée.
- validerEditeur : args.subject (Note/Fiche) ; hauteur réalisée d'une note
  nue = lignes du texte (enveloppeTexte).

## Tests

- Locaux purs : geom (poignées, ancrage, minimums), texte (marqueur à
  taille, rétrocompatibilité, extraireTailleFiche).
- CI (pdf-lib) : test/bouger.test.js — déplacement de chaque sorte (Rect,
  QuadPoints, InkList, AP translaté, équation = Rect seul), redimensionnement
  FreeText/fiche mixte (source identique, taille conservée) /cadre/équation,
  refus Text/Highlight/Ink, session journaux deplacer/redimensionner.

## Livraison

package.json 0.1.12 ; etag.yml déclencheur v0.1.12 ; README mis à jour.
