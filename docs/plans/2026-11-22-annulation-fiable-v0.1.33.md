# Annulation fiable, même sous rafales : v0.1.33

Date : 2026-11-22. Déclencheur : retour d'Arthur en essai réel.
« L'annulation du geste n° 8 (édition « deplacer ») a échoué :
Annotation introuvable : elle a peut-être été supprimée. »,
puis « j'ai trop cette erreur pour bien travailler » :
l'erreur revenait en boucle, chaque Ctrl+Z échouait, la session
n'était plus récupérable sans rouvrir le document.

## Diagnostic (vérifié, pas deviné)

Annuler = rouvrir les octets originaux et rejouer tout le journal
sauf le dernier geste (v0.1.13). Le rejeu a été éprouvé de deux
façons :

1. Deux fuzzers reprenant la sémantique exacte de main.js (lots,
   pile « à refaire », undo/redo entrelacés, toutes les sortes
   d'éditions, douze graines) : LE REJEU EST DÉTERMINISTE.
   Aucune divergence trouvée dans le moteur lui-même.
2. savePdf ne mute pas le document (formCache paresseux de
   pdf-lib : updateFieldAppearances est sauté sans getForm()).

La cause racine retenue est donc la CONCURRENCE DES CANAUX IPC :
ipcMain.handle est réentrant. Un Ctrl+Z répété (ou une pose
concurrente) pendant un rejeu long sur un vrai document ouvre
DEUX annulations qui se chevauchent. Toutes deux lisent le
journal d'avant, dépilent deux fois, et le document reconstruit
ne correspond plus au journal. Chaque geste suivant porte alors
une référence décalée : TOUTE annulation ultérieure échoue
définitivement — exactement « geste n° 8, Annotation
introuvable » en boucle.

## Correctifs : trois volets

1. engine/synchro.js (NOUVEAU) : creerFileDeCommandes(), une
   file à exclusion mutuelle par chaîne de promesses — FIFO
   strict, isolement des erreurs (une commande qui jette ne
   casse pas les suivantes), fidélité des valeurs rendues.
2. main.js : TOUT ce qui touche un document (pdf:apply,
   pdf:undo, pdf:redo, pdf:save) est enfiler dans la file. Un
   seul rejeu à la fois ; plus de course possible. L'état visé
   est capté À L'ARRIVÉE de la commande : un changement
   d'onglet pendant l'exécution ne détourne jamais la commande.
   Limite documentée : pdf:fermer (longues boîtes natives) et
   pdf:open/pdf:activate (ils remplacent le pointeur d'état,
   ne le touchent pas) restent hors file.
3. Reprise assurée même sur un journal déjà dérivé (rouvertures,
   états antérieurs) :
   - engine/undo.js : rejouerPrefixeSain(octets, gestes) tente
     le rejeu complet, sinon dépaie PAR LA FIN jusqu'au dernier
     préfixe rejouable ; rend { doc, session, rejoues, abandonnes }.
     pdf:undo et la reprise d'erreur de pdf:redo l'utilisent :
     l'annulation rend TOUJOURS la main avec un état cohérent,
     les gestes déjà incohérents (postérieurs à la dérive) sont
     écartés silencieusement.
   - engine/bouger.js : repose SÛRE. Les quatre branches qui
     retiraient l'annotation avant de la reposer (fiche mixte,
     correction, note riche, cadre à options) valident la
     source embarquée AVANT tout retrait, et réinsèrent
     l'annotation d'origine dans /Annots si la pose échoue.
     Un contenu corrompu ne fait plus jamais perdre l'annot.

## Tests (257, tous verts)

- test/synchro.test.js (NOUVEAU) : FIFO strict (l'ordre est
  l'ordre d'ARRIVÉE), isolement des erreurs, sérialisation des
  commandes mitoyennes.
- test/undo.test.js : rejouerPrefixeSain sur journal sain
  (tout rejoué), désynchronisé (assaini par la fin, jamais
  bloquant), document illisible (l'erreur d'ouverture remonte).
- test/bouger.test.js : source corrompue = refus AVANT tout
  retrait, la note reste dans /Annots (aucune perte).

## Leçons

- Un visualiseur d'état (résumé, journal) qui marche en essai
  poli ne suffit pas : la PRESSION RÉELLE (rafales de raccourcis,
  clics répétés) est un scénario de test à part entière.
- Tout canal IPC qui touche une structure mutable partagée doit
  passer par une file. « Le renderer n'envoie jamais deux
  commandes à la fois » n'est pas une garantie, c'est un vœu.
- Jamais retirer une annotation avant d'avoir validé TOUT ce
  dont la repose dépend : le retrait est le seul geste
  irréversible en mémoire.
