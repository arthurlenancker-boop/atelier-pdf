# v0.1.28 — Barre de progression de la reconnaissance à l'ouverture (styles A et D)

Arthur, 22 novembre 2026, après le comparatif basic/standard et la maquette
« Barre de progression de la reconnaissance : quatre styles à l'essai » :

> « j'aimerai qu'à l'ouverture du document, une barre de progression
> s'affiche, montrant la progression de l'ocr » — puis choix : « A et D oui ».

## Décisions

- À l'ouverture d'un document (bouton, Ctrl+O, glisser-déposer), si le
  serveur OCR personnel est configuré, TOUTES les pages sont reconnues,
  l'une après l'autre, par le chemin central existant (rendu JPEG ~200
  points par pouce → IPC page:tester → POST /page). Décision d'Arthur :
  c'est le serveur (MinerU) qui reconnaît, pas tesseract.js ; la
  reconnaissance locale des mots surlignables reste ce qu'elle est.
- Style A : barre fine de 3 pixels sous la barre d'outils, piste grise,
  remplissage bleu accent, NAVETTE tant qu'aucune page n'est revenue
  (le premier appel emporte le chargement du moteur, sans pourcentage
  mesurable).
- Style D : la colonne de vignettes raconte la progression — page en
  cours cerclée de bleu (pulsée), pages reconnues cochées (pastille
  bleue, coin bas-droit) ; le numéro prend l'accent. Les classes sont
  réappliquées au fur et à mesure que construireVignettes pose les
  figures (aucune course entre les deux boucles asynchrones).
- Barre d'état : « Reconnaissance : page 3 sur 12, 2 pages reconnues
  (17 %) · Arrêter ». Le lien Arrêter est discret : la page en vol
  s'achève, les suivantes ne partent pas ; le serveur n'est pas
  dérangé (l'annulation est purement client).
- Les pages reconnues sont gardées en mémoire (Map n° → page), elles
  serviront la recherche et le clic ƒ ; rien n'est écrit dans le PDF.
- La reconnaissance ne part QUE si le mode serveur est actif et son
  adresse enregistrée ; en mode OCR Mistral, l'ouverture ne déclenche
  rien (le bouton ƒ garde son rôle).

## Comportements d'erreur (choix délibérés)

- Échec de la première page (serveur éteint) : arrêt complet, barre
  retirée, une seule erreur dans la barre d'état. Les ouvertures
  suivantes réessaieront naturellement.
- Échec au milieu du document : arrêt (pas de pages sautées en silence),
  erreur affichée avec le numéro de page.
- Un autre document ouvert coupe la boucle (numéro de génération,
  comme les vignettes) ; la barre et la zone d'état sont purgées.

## Correctifs approuvés livrés dans la même version

1. nettoyerUrlServeur REFUSE https:// sur un hôte local (127.0.0.1,
   localhost, ::1) : le serveur personnel écoute en HTTP ; la saisie
   erronée d'Arthur (https://127.0.0.1:8642) est maintenant refusée avec
   un message explicite dans la carte des options, plutôt que
   d'une erreur de connexion seulement au clic. Export estHttpsLocal.
2. Aide de la carte options : une ligne explique DANS la carte qu'un
   document doit être ouvert avant le test (« la page affichée sera
   reconnue ») ; le message rouge d'ouverture reste mais n'est plus
   la seule explication.
3. Styles propres au bloc #essai-page : le résumé du test n'emplace
   plus les classes génériques .eq-erreur/.cle-aide mais des classes
   dédiées (essai-erreur, essai-info), mêmes couleurs.
4. test_moteur_pages.py rejoint la CI (python 3.12 déjà installé par
   le banc serveur, juste après lui).
5. Le serveur (ThreadingHTTPServer) ne journalise plus les
   réinitialisations de connexion attends-de-nous anonymes
   (ConnectionResetError WinError 10054, ConnectionAbortedError) :
   sous-classe ServeurOcr, handle_error silencieux pour ce cas seul.

## Limites

- Aucun pourcentage intra-page (le serveur ne le rapporte pas) : la
  barre avance par page terminée ; la navette couvre le chargement du
  moteur au premier appel.
- Pas d'annulation côté serveur (le POST en vol va au bout) : c'est
  le comportement voulu, le serveur reste simple.
- Les pages reconnues ne sont PAS encore utilisées par les outils :
  c'est la brique suivante (recherche, mots surlignables depuis les
  blocs, ƒ sur zone) ; ce dépôt prépare le terrain.
