# La reconnaissance qui part vraiment au lancement : v0.1.37

Date : 2026-11-23. Déclencheur : retour d'Arthur pendant l'entretien des
dix versions — « je ne peux plus cocher la case scan » (bouton Reco de
la barre d'outils, grisé même avec un document ouvert).

## Symptôme rapporté et clarifié

Arthur ne peut plus activer le bouton « Reco » de la barre d'outils :
l'élément paraît grisé, rien ne se passe au clic, y compris sur un
document avec du texte classique. La capture, recadrée sur la barre
d'outils, montrait le bouton dans cet état.

## Diagnostic (sourcé dans le code, pas deviné)

Le bouton Reco se grise quand la page affichée n'a AUCUN bloc reconnu
(renderer/app.js, majRecoVue : `bouton.disabled = !page`). Les blocs
arrivent par la reconnaissance du document à l'ouverture (v0.1.28,
style A et D) — or cette passe repartait aussitôt :

```js
if (optionsOcrEtat.mode !== 'serveur' || !optionsOcrEtat.serveurUrl) return;
```

La cause tient en trois constats, tous vérifiés dans la source :

1. `optionsOcrEtat` naît avec sa valeur PAR DÉFAUT
   (`{ mode: 'mistral', serveurUrl: '' }`) et n'est relu nulle part
   au démarrage : la fonction init() charge pdf.js, MathLive, les
   panneaux, mais JAMAIS les options mémorisées ;
2. il n'est rafraîchi QUE par l'ouverture de la carte
   Fichier → Options OCR LaTeX… (ouvrirOptionsOcr) ;
3. même après une validation réussie, validerOptionsOcr n'actualise
   PAS l'état : le réglage frais du serveur n'agissait sur l'ouverture
   qu'après un nouveau passage par la carte.

Conséquence : après chaque lancement de l'application, la
reconnaissance du document ne partait JAMAIS (le rendeur croyait au
mode « mistral »), toutes les pages demeuraient sans blocs, et le
bouton Reco restait grisé en silence. Seule une session où la carte
des options avait été ouverte reconnaissait les documents — d'où le
« PLUS » d'Arthur : le comportement semblait aléatoire selon les
sessions.

## Correctif : trois volets, aucun changement de fichier PDF

1. Hydratation au démarrage (renderer/app.js, init) : les options OCR
   mémorisées sont relues AU lancement du rendeur. La reconnaissance
   du document part dès la première ouverture, y compris sur une
   installation fraîche. Un échec de lecture retombe sur le mode
   « mistral » par défaut, sans bloquer l'application.
2. Actualisation à la validation (renderer/app.js,
   validerOptionsOcr) : l'état du rendeur suit aussitôt la
   validation — plus besoin de rouvrir la carte pour que le réglage
   prenne effet sur l'ouverture.
3. Un bouton grisé explique sa cause (renderer/app.js, majRecoVue) :
   au survol, le bouton Reco distingue désormais « aucun serveur
   configuré » de « page non reconnue (encore) », et indique le
   chemin (Fichier → Options OCR LaTeX…). L'outil muet ne peut plus
   être pris pour un blocage.

La garde elle-même vit dans le moteur : nouvelle fonction pure
`reconnaissanceServeurActif(etat)` de engine/ocr.js (mode « serveur »
avec adresse non vide, tolérante aux états absents ou tordus),
utilisée par la garde de reconnaitreDocument et par l'info-bulle du
bouton. Aucune écriture dans le PDF, aucun changement de format : la
reconnaissance reste en mémoire, rien n'est écrit dans le document.

## Tests (272, tous verts ; 271 passent localement, 1 réservé à la CI)

- test/ocr.test.js (2 tests nouveaux) :
  reconnaissanceServeurActif accepte le mode serveur avec adresse
  (blanche autour comprise) ; rejette le mode mistral, l'adresse
  vide ou blanche, l'adresse absente, l'état null, et une adresse
  non-chaîne.
- La suite pure complète (node --test) : 272 tests, aucun échec.

## Leçons

- L'état MÉMORISÉ par le processus principal (le fichier de
  configuration) doit être relu au démarrage du rendeur : chaque
  garde du rendeur qui dépend d'un réglage persistant doit le
  recharger dans init(), pas seulement dans la carte qui l'édite.
- Un contrôle désactivé doit TOUJOURS dire pourquoi (info-bulle) :
  le silence d'un bouton grisé se lit comme un blocage de
  l'application, non comme un état en attente.
- La validation d'une carte d'options doit actualiser l'état du
  rendeur au moment même, sinon le réglage paraît inopérant jusqu'à
  une manipulation fortuite.
