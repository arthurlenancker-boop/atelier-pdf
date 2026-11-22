# Conception « Document vivant » — reconnaissance complète et édition (22 novembre 2026)

## Intention et pourquoi

Arthur veut qu'un PDF scanné ouvert dans Atelier PDF cesse d'être une
photographie muette. Par reconnaissance progressive en arrière-plan, chaque
page doit devenir : du texte copiable ET corrigible mot à mot dans
l'application, des formules en LaTeX, des titres et tableaux identifiés
comme tels, des images copiables, extractibles, déplaçables,
redimensionnables et supprimables. Le document corrigé DEMEURE un PDF.

Contexte : le déclencheur est le nettoyage manuel de polycopiés de
mathématiques (ex. cours de probabilités déjà transformé à la main en
Markdown). La reconnaissance server-side étendue remplace ce travail
manuel. Confidentialité inchangée : tout le traitement se fait sur les
machines d'Arthur, aucune donnée ne sort vers un tiers.

## Décisions de cadrage arrêtées par Arthur (22 novembre 2026)

1. Niveau visé : texte CORRIGIBLE dans Atelier PDF (remplacer/réécrire
   les mots reconnus), pas seulement sélectionnable.
2. Images : les deux usages — copier/extraire ET
   déplacer/redimensionner/supprimer.
3. Le modèle du PC fixe doit reconnaître le document COMPLET : texte,
   formules, titres, tableaux.
4. Réception : progressive, en arrière-plan, pendant qu'Arthur travaille.
5. Le résultat reste un PDF.
6. Choix du moteur délégué à Vibe « au meilleur résultat par rapport à
   ses attentes » ; matériel confirmé : PC fixe avec GPU NVIDIA RTX 5050
   8 Go (CUDA, génération Blackwell).
7. Documents imprimés uniquement (confirmé).
8. Funnel provisoirement sans jeton : accepté par Arthur le temps que
   la v0.1.25 l'ajoute, ensuite recommandé immédiatement.
9. Écriture DIRECTE dans le fichier original, sans créer d'autre
   fichier, et sans qu'aucun caractère visible ne change : la couche
   reconnue est invisible et le rendu reste identique. Choix exprès
   d'Arthur, en connaissance du risque de corruption évoqué ; la
   parade technique est une écriture additive, jamais réécrite.


## Objectifs

- Reconnaissance d'une page complète (texte + formules + titres +
  tableaux + images) sur le PC fixe, via la chaîne déjà validée
  (portable → Funnel/HTTPS → Ubuntu 192.168.1.22 relais socat
  127.0.0.1:8643 → PC fixe 192.168.1.116:8642).
- L'app envoie les pages une à une, en file, pendant que l'utilisateur
  travaille ; bandeau de progression par page.
- Affichage : mots reconnus discrets (surlignage léger, cliquables),
  formules balisées LaTeX, images avec poignées.
- Corrections mot à mot en place (édition inline, undo).
- Images : copier dans le presse-papiers, extraire en fichier PNG/JPEG,
  déplacer, redimensionner, supprimer.
- Enregistrement : couche texte invisible + patchs visuels, ÉCRITS
  DANS LE PDF (prolongement de la PR #2), directement dans le fichier
  ouvert, sans en créer d'autre.
- Le texte ainsi écrit doit être sélectionnable/copiable depuis tout
  lecteur PDF (Acrobat, navigateurs).

## Non-objectifs (cette phase)

- Pas de réécriture complète du document ni de mise en page refaite
  automatiquement.
- Pas d'édition de tableau cellule par cellule (copie HTML seulement).
- Pas de reconnaissance d'écriture manuscrite : Arthur a confirmé
  que ses documents sont des IMPRIMÉS uniquement ; le manuscrit,
  s'il apparaît un jour, n'est pas garanti.
- Pas d'OCR sur le portable : le moteur reste sur le PC fixe.
- Pas de service cloud, pas d'abonnement, aucune dépendance payante.

## Anti-objectifs (échec même si ça marche techniquement)

- Corrompre le fichier écrit : les écritures sont ADDITIVES, elles ne
  réécrivent JAMAIS les objets existants du PDF ; testé sur documents
  variés avant chaque version.
- Changer le rendu visuel d'une page non éditée : la couche invisible
  ne doit rien modifier à l'écran, au pixel près.
- Envoyer les pages vers un tiers (le transit reste le réseau privé
  Tailscale d'Arthur).
- Perdre le contrat v0.1.23 : le bouton « ƒ LaTeX » et le chemin /ocr
  restent fonctionnels à l'identique.

## Contraintes

- Gratuit, tout local, licences MIT/Apache/BSD/ISC/0BSD/AGPL-3.0
  (MinerU est AGPL à cause de ses modèles YOLO ; le dépôt Atelier PDF
  est AGPL-3.0, donc compatible ; le LISEZMOI documentera la licence).
- Windows, Python 3.10 à 3.12 OBLIGATOIRE (rapid-latex-ocr refuse
  >= 3.13 ; invocation `py -3.12 serveur.py`). MinerU accepte 3.10-3.12.
- RTX 5050 = Blackwell (sm_120) : exige PyTorch >= 2.7.0 avec roues
  CUDA 12.8 (`--index-url https://download.pytorch.org/whl/cu128`).
  Repli accepté : pipeline MinerU sur CPU (plus lent, fonctionnel).
- 8 Go de VRAM : au plancher officiel du backend VLM de MinerU (1,2 Md
  de paramètres, minimum 8 Go, pas de repli CPU) ; confortable pour le
  backend pipeline.
- Serveur : bibliothèque standard Python, verrou d'exécution une
  requête à la fois, erreurs en français (conventions v0.1.23).
- App : JavaScript maison sans dépendances lourdes, moteur/engine pur
  testé dans test/ (conventions du dépôt).

## Approches envisagées pour le moteur

1. MinerU (opendatalab), backend pipeline — AGPL-3.0. Layout (titres,
   paragraphes, formules, tableaux, images) + texte + formules LaTeX +
   tableaux HTML, sortie JSON par page où chaque bloc porte son type et
   ses coordonnées ; l'OCR texte rend des boîtes par ligne et par mot,
   dont l'édition a besoin. Même écosystème que rapid-latex-ocr
   (RapidOCR, UniMERNet) déjà validé. Fonctionne sur CPU et GPU.
2. PaddleOCR PP-StructureV3 — Apache-2.0. Capacités comparables, mais
   sortie moins directement exploitable et dépendances PaddlePaddle
   plus lourdes ; le projet concentre son effort sur de gros modèles
   vision-langage hors de portée CPU/RAM visés. Écarté en second.
3. Composition maison (RapidOCR + rapid-latex-ocr + DocLayout-YOLO
   assemblés à la main) — écarté : cela revient à reconstruire MinerU
   en moins maintenable, la cohérence blocs/positions entre trois
   briques reposant sur nous.

Arrêté : MinerU, backend pipeline, exécuté sur la RTX 5050 (CUDA).
La qualité visée étant « le meilleur résultat par rapport à [s]es
attentes », le backend VLM 1,2 Md (plus précis d'après les évaluations
publiques OmniDocBench, ~90+ contre ~86 pour le pipeline) sera MESURÉ en
comparatif sur des pages réelles d'Arthur pendant le banc d'essai de la
v0.1.26 : trois pages de polycopiés passées aux deux backends, qualité
des formules et du texte comparée à l'oeil, temps par page chronométré.
Le meilleur mesuré devient le backend par défaut ; l'autre reste
disponible par option. Décision de mesurer plutôt que de spéculer.

## Architecture générale

### Chaîne (inchangée, déjà validée le 22 novembre)

Atelier PDF (portable) → Funnel HTTPS
https://pcarthur-1.tailda0234.ts.net/latex-ocr → Ubuntu (socat
127.0.0.1:8643 → 192.168.1.116:8642) → PC fixe serveur.py.

À la maison, l'app utilise l'URL LAN directe (http://192.168.1.116:8642)
si configurée ; à l'extérieur, la Funnel. Rien de nouveau à déployer.

### Contrat serveur v2 (ajout, sans toucher au v1)

- `POST /page` : corps JSON `{ "image_url": "data:image/…;base64,…" }`
  (rendu de la page à ~180-220 dpi, JPEG ou PNG).
- Réponse 200 : JSON de page reconnue :
  ```
  {
    "largeur": 1654, "hauteur": 2339,   // pixels de l'image reçue
    "blocs": [
      { "type": "titre",    "bbox": [x0,y0,x1,y1], "texte": "…" },
      { "type": "texte",    "bbox": [x0,y0,x1,y1],
        "lignes": [ { "bbox": [x0,y0,x1,y1],
                      "mots": [ { "bbox": [x0,y0,x1,y1], "texte": "…" } ] } ] },
      { "type": "formule",  "bbox": [x0,y0,x1,y1], "latex": "…" },
      { "type": "tableau",  "bbox": [x0,y0,x1,y1], "html": "…" },
      { "type": "image",    "bbox": [x0,y0,x1,y1] }
    ]
  }
  ```
  L'image d'une zone type image N'EST PAS incluse dans la réponse
  (l'app la recadre localement depuis sa propre copie haute résolution).
- Traitement synchrone, une page à la fois (verrou d'exécution v0.1.23
  conservé) ; sur GPU, quelques secondes par page ; délai applicatif
  passé de 90 s à 10 min par page pour absorber le CPU de repli.
- `POST /ocr` (v0.1.23, bouton ƒ LaTeX) : INCHANGÉ, même port.
- Mode `--banc` étendu : `POST /page` répond une page factice complète
  (un titre, deux lignes de mots, une formule, un petit tableau, une
  image), sans moteur, pour valider toute la chaîne avant installation.
- Mode `--banc-vlm` inutile : le comparatif pipeline/VLM se mène en
  local sur le PC fixe (script fourni), sans l'app.

### Côté application

- Au chargement d'un PDF, si l'URL serveur est configurée, file
  progressive : pages envoyées une à une (reprise après coupure,
  échec d'une page non bloquant pour les suivantes), bandeau
  « page X : reconnue / en cours / en attente ».
- Rendu : les boîtes reconnues s'affichent en surimpression discrète
  sur le rendu actuel ; clic sur un mot → édition inline ; les objets
  formule LaTeX et tableau HTML se copient depuis le menu contextuel.
- Objets image : recadrage local de la zone, poignées de
  déplacement/redimensionnement, actions copier / extraire en fichier /
  supprimer.
- Toute correction vit d'abord en session (undo existant), puis
  s'écrit par « Enregistrer », dans le fichier ouvert.

### Écriture dans le PDF (politique arrêtée par Arthur)

- Écriture DIRECTE dans le fichier ouvert : aucun fichier n'est créé,
  « Enregistrer » enrichit le fichier lui-même.
- Le rendu d'une page reconnue mais non éditée reste IDENTIQUE au
  pixel près : la couche de texte est invisible (positionnée derrière
  le contenu, prolongement de la PR #2, à fusionner comme brique).
- Les seuls changements visuels sont ceux qu'Arthur a opérés LUI-MÊME
  à l'écran : mot corrigé (mastique blanc + texte réel au-dessus),
  image déplacée (masquée à l'ancienne place, réinsérée à la nouvelle).
- Toute écriture est ADDITIVE : ajouts de nouveaux objets, jamais de
  modification des flux existants ; c'est la parade au risque de
  corruption du fichier unique.
- Les corrections vivent d'abord en session (undo existant), puis
  s'écrivent par « Enregistrer ».

## Versions successives (chacune livrable seule)

- v0.1.25 — consolidation serveur (déjà cadrée) : LISEZMOI corrigé
  (Python 3.10-3.12 requis, `py -3.12 serveur.py`), recette
  Ubuntu/Funnel + relais socat documentés, jeton de service optionnel,
  auto-démarrage Windows optionnel.
- v0.1.26 — serveur v2 : endpoint /page, MinerU pipeline GPU (torch
  cu128), banc étendu, comparatif pipeline vs VLM mesuré sur 3 pages
  réelles, LISEZMOI v2 (installation GPU, repli CPU, licences AGPL).
  Côté app : bouton « Tester la reconnaissance » dans les options OCR
  qui envoie une page et affiche un résumé lisible (n blocs de chaque
  type).
- v0.1.27 — texte visible : file progressive à l'ouverture, surlignage
  des mots reconnus, copie du texte (mot, ligne, sélection, page),
  écriture de la couche invisible par « Enregistrer » (fusion PR #2).
- v0.1.28 — correction : édition inline mot à mot, undo, patch
  visuel à l'enregistrement.
- v0.1.29 — images : objets avec poignées, copier/extraire/
  déplacer/redimensionner/supprimer, patchs associés ;
  tableaux copiables en HTML.

## Ce qui reste au constructeur (liberté d'implémentation)

- Bibliothèques exactes côté serveur (MinerU s'installe par
  `pip install "mineru[core]"` ; le constructeur fixe la version
  épinglée et la ligne torch cu128 dans requirements.txt).
- Transformation de la sortie MinerU (content_list) vers le contrat
  JSON ci-dessus : fonction pure testée isolément.
- Rendu des pages à ~200 dpi côté app (dpi définitif à régler pendant
  le banc, en fonction du débit Funnel).
- Apparence de la surimpression (couleur, opacité) : maquette à
  soumettre à Arthur avant finalisation.
- Gestion mémoire : purge des résultats après enregistrement, reprise
  après coupure réseau.
- Le niveau exact de granularité de l'édition des mots très petits
  (fusion sous-bloc le cas échéant).

## Risques connus et parades

- sm_120 : si l'installation GPU échouait, repli pipeline CPU documenté
  (10-40 s/page, file arrière-plan : acceptable).
- VRAM 8 Go au plancher du VLM : le comparatif mesuré tranche ; le
  pipeline reste le défaut sûr.
- Premier appel : téléchargement des modèles MinerU (quelques Go),
  signalé dans le LISEZMOI et par un message dédié dans l'app.
- Scans penchés/bruités : la reconnaissance peut se tromper ; c'est
  précisément pourquoi la correction mot à mot existe.
- Bande passante upload du portable hors de chez lui : pages en JPEG
  ~200 dpi (quelques centaines de Ko), à ajuster au banc.
