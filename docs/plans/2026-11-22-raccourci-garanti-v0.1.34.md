# Le raccourci garanti : v0.1.34

Date : 2026-11-22. Déclencheur : retour d'Arthur.
« Il n'y a plus de raccourci qui se créé après installation. »

## Diagnostic (sourcé, pas deviné)

Le raccourci du bureau a été créé par l'installateur NSIS de la
v0.1.32 (oneClick, défauts electron-builder). La v0.1.33 n'a PAS
été installée par Arthur : elle a été installée EN SILENCE par
electron-updater (main.js : autoDownload = true,
checkForUpdatesAndNotify au lancement). Or, en installation
silencieuse de mise à jour, l'installateur tourne avec le drapeau
--updated et ne crée AUCUN raccourci, tandis que la désinstallation
de l'ancienne version emporte les raccourcis existants :

- electron-builder #2725 : « If a desktop shortcut is removed, it
  is not re-created when re-running the installer » ;
- electron-builder #2514 : la macro addDesktopLinks au moment de
  l'installation, et la disparition des icônes épinglées à la mise
  à jour ;
- projets tiers documentant le comportement : la réparation du
  raccourci est sautée sur --updated, drapeau que electron-updater
  passe toujours.

Résultat : première mise à jour silencieuse = raccourci du bureau et
du menu démarrer disparus. La configuration NSIS de package.json
n'avait pourtant pas changé : ce sont les DÉFAUTS de l'outil qui
perdent le raccourci, pas notre configuration.

## Correctifs : deux volets

1. Configuration NSIS explicite (package.json) :
   createDesktopShortcut: "always" (recréé même s'il a disparu),
   createStartMenuShortcut: true, shortcutName: "Atelier PDF".
   Les réinstallations manuelles recréent désormais le raccourci.
2. Garantie DANS l'application (le vrai correctif) : à chaque
   lancement d'une version empaquetée sous Windows, main.js lance un
   script PowerShell qui recrée les raccourcis MANQUANTS du bureau
   et du menu démarrer (engine/raccourcis.js, moteur pur :
   composerRaccourcisWin). Un raccourci présent n'est jamais
   retouché (celui que l'utilisateur a déplacé ou renommé est
   respecté) ; les dossiers réels sont résolus par l'API Windows
   (bureau OneDrive honoré) ; tout échec reste silencieux.

La garantie ne dépend donc plus jamais du mode d'installation :
pose manuelle, réinstallation ou mise à jour silencieuse, le
raccourci est là au prochain lancement.

## Tests (261, tous verts)

- test/raccourcis.test.js (NOUVEAU, 4 tests) : échappement
  PowerShell ; le garde d'existence précède la création (un
  raccourci présent n'est jamais réécrit) ; bureau ET menu
  démarrer résolus par l'API, cible et répertoire de travail ;
  un chemin portant une apostrophe est échappé.

## Leçons

- Le premier réflexe devant « la nouvelle version a perdu le
  raccourci » n'est pas de soupçonner la configuration : RIEN n'y
  avait changé. Vérifier d'abord COMMENT la version est arrivée
  sur la machine (ici : auto-update silencieux, pas un
  double-clic sur l'installateur).
- Une garantie d'interface ne se confie pas aux défauts d'un
  empaqueteur : elle se code dans l'application, au lancement.
- tout canal « la mise à jour s'installe toute seule » doit être
  éprouvé comme un scénario à part entière du cycle de vie.
