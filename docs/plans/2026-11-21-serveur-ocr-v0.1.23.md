# Plan v0.1.23 — serveur OCR LaTeX personnel (21 novembre 2026)

## Demande et décision

Après la v0.1.22 (sélection OCR locale + bouton ƒ LaTeX via l'OCR Mistral),
Arthur demande à faire tourner la lecture LaTeX SUR SON PROPRE ordinateur,
l'ordinateur de travail n'envoyant les données QUE par le canal de son PC,
via son réseau privé Tailscale. Motivation : confidentialité, coût et
curiosité technique (« un peu des trois »). Décision de cadrage arrêtée par
choix : construire le mode « serveur OCR sur votre PC » en v0.1.23.

## Distinction de principe (ce que Tailscale change ou non)

- Tailscale ne chiffre que le CHEMIN : un simple relais vers Mistral
  n'aurait rien changé à qui TRAITE les images.
- Ce qui est construit ici : le TRAITEMENT lui-même se fait sur le PC
  d'Arthur. L'image de la zone sélectionnée ne quitte jamais ses machines.

## Conception livrée

- serveur-ocr/serveur.py : petit serveur HTTP (bibliothèque standard
  Python uniquement) qui exécute RapidLaTeXOCR (MIT, ONNX, dérivé du modèle
  LaTeX-OCR) sur l'image reçue et répond { "latex": "…" }. Verrou
  d'exécution : le moteur ONNX est appelé une requête à la fois. Mode
  --banc (réponse fixe, moteur désactivé) pour vérifier URL, Tailscale et
  pare-feu AVANT d'installer le gros moteur. Port par défaut 8642,
  --hote/--port. Contrat : POST JSON { image_url: data:...png } →
  { latex }, erreurs en français.
- engine/ocr.js (pur, tests dans test/ocr.test.js, 17/17) :
  nettoyerUrlServeur (http/https net, épure espaces et barres finales) ;
  latexDepuisReponseServeur (champ latex PRIS TEL QUEL — le serveur a
  extrait la formule, la repasser par extractionLatex la déformerait ;
  text/markdown passés par extractionLatex).
- main.js : config.json conserve cleMistral (v0.1.22) et serveurOcr
  (l'URL). L'existence de l'URL fait PASSER le bouton ƒ LaTeX en mode
  serveur (prioritaire), sinon Mistral inchangé. IPC 'conf:ocr' (cle
  et/ou url, '' pour retirer le serveur) et 'conf:ocr:get' (mode, URL,
  clé présente : JAMAIS la valeur de la clé). 'ocr:latex' : branche
  serveur (délai 90 s, moteur CPU lent la première fois ; messages
  d'erreur français distincts injoignable / délai / interrogation).
  Menu Fichier → Options OCR LaTeX… ; diagnostic : mode affiché.
- renderer : l'ancienne fenêtre de saisie de clé devient la carte
  d'options : radios « Mon serveur OCR (tout local) » / « OCR Mistral »,
  champ URL ou champ clé selon le choix, l'état présent est pré-rempli
  (le champ clé TOUJOURS vide : on ne rappele jamais une clé saisie).
- NOTICE : RapidLaTeXOCR (MIT, dérivé de LaTeX-OCR de Lukas Blecher) ;
  le dossier serveur-ocr/ est facultatif et NON embarqué dans le paquet
  Windows (extraResources et files inchangés).

## Choix techniques notables

- Aucune authentification sur le serveur : le réseau Tailscale EST le
  contrôle d'accès (adresses 100.x invisibles d'Internet) ; le guide
  documente le pare-feu Windows (case à cocher du premier lancement).
- Le bouton ƒ LaTeX reste strictement UN coup de feu : l'image de la zone
  sélectionnée part SEULEMENT au clic, dans les deux modes.
- Le serveur accepte aussi text/markdown (contrat documenté dans
  serveur-ocr/LISEZMOI.md) pour toute autre implémentation future.

## Reste non validé

- L'essai réel chez Arthur : banc d'essai d'abord (URL/Tailscale), puis
  pip install -r requirements.txt et reconnaissance réelle d'une
  formule de sa leçon ; qualité du modèle sur sa machine inconnue
  (repli documenté : le mode Mistral reste à un clic, la clé n'est pas
  effacée par le mode serveur).
- La reconnaissance CPU d'une formule prend de une à quelques secondes
  selon la machine ; le délai applicatif est 90 s pour absorber le
  premier appel (téléchargement des modèles inclus).
