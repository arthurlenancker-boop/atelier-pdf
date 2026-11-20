# Confort d'annotation v0.1.13 — sélection de texte, Main, annulation

Validé par Arthur le 20 novembre 2026 : « plus pratique à utiliser », approche B
retenue (les rails du quotidien d'abord). Référence montrée : la gamme d'outils
d'un éditeur PDF (Enregistrer, Main, Sélectionner du texte, Machine à écrire,
Légende). La Machine à écrire existe depuis la v0.1.12 (note nue au point
cliqué). La Légende (bulle avec trait indicateur) est explicitement REPORTÉE
à la version suivante.

## Intentions

Un enseignant annote des cours toute la journée ; trois frictions l'usent :
surligner à la main un rectangle qui déborde des lignes, naviguer à la souris
sans jamais prendre la page, et rater une annulation après chaque geste.
Objectif : le surlignage se pose sur le TEXTE RÉEL du document, la page se
prend en main et se fait glisser, et chaque geste se rattrape d'un Ctrl+Z.

## Buts, non-buts, anti-buts

- Buts : (1) outil Main ( prendre la page, la faire glisser ) ; (2) outil
  Sélectionner du texte : sélectionner les mots du document puis surligner
  exactement la sélection (ou la copier) ; (3) annuler / rétablir, geste par
  geste (Ctrl+Z / Ctrl+Maj+Z).
- Non-buts de cette version : Légende (v0.1.14), couleurs et tailles au
  choix, raccourcis numériques d'outils, réorganisation de la barre.
- Anti-buts : rien de propriétaire (tout reste /Highlight, /FreeText… dans
  le fichier, lisible par tout lecteur) ; pas de panneau modal pour surligner.

## Approches écartées / retenues

### Main

- Écarté : touche temporaire (Espace maintenu) seule — invisible dans
  l'interface, jamais découverte ; bonne idée plus tard en complément.
- Retenue : bouton Main à part entière. pointerdown mémorise la position
  écran et le défilement ; pointermove décale visionneuse.scrollLeft /
  scrollTop du delta ; curseur main ouverte puis fermée pendant le geste.
  Pendant le geste, aucun zoom fluide ne peut interférer (les deux lisent
  les mêmes événements ; le Main ignore la molette).

### Sélection de texte → surlignage

- Écarté : re-calcul géométrique maison depuis getTextContent (chaîne,
  largeur d'item, matrices) : fragile, multi-lignes hasardeux, chaque
  item a sa propre échelle et ses propres interstices.
- Écarté : remplacer le rectangle actuel — non : un document scanné n'a pas
  de texte ; le rectangle garde son rôle, les deux coexistent.
- Retenue : la couche de texte OFFICIELLE de pdf.js v4 (classe TextLayer),
  une div invisible posée sur la page, reconstruite à chaque rendu. Seule
  la surbrillance native du navigateur (CSS ::selection) montre la
  sélection ; au relâchement, une mini-barre flottante apparaît au-dessus
  avec « Surligner » et « Copier ». Surligner lit les rectangles de lignes
  de la sélection (getClientRects), les convertit en points PDF par la
  fonction inverse déjà garantie sur les pages tournées (coords.js), et
  pose UNE annotation /Highlight dont les /QuadPoints épousent chaque
  ligne. Copier écrit la chaîne dans le presse-papiers avec un message de
  confirmation.
- Visibilité : la div n'intercepte les événements QUE lorsque l'outil
  « Sélectionner du texte » est actif ; les autres outils ne la voient pas.

### Annulation par rejeu (undo/redo)

- Écarté : snapshots (copie du document par geste : coût mémoire non borné
  sur un vrai cours).
- Écarté : inverses par sorte d'édition (une table d'annulation par type :
  chaque nouveau type impose son inverse, source d'asymétries).
- Retenue : rejeu déterministe depuis les OCTETS ORIGINAUX. À l'ouverture,
  le processus principal CONSERNE une copie des octets du fichier tel
  qu'ouvert (aujourd'hui elle disparaît après lecture). Chaque lot envoyé
  par l'interface (un geste v0.1.11 : pose, correction = retrait + repose,
  remplacement d'équation…) est enregistré tel quel (les arguments passent
  déjà sérialisés par IPC, donc rejouables). Annuler : rouvrir les octets
  originaux, recréer la session, REJOUER tous les gestes sauf le dernier,
  le dernier part sur une pile « à refaire ». Rétablir : appliquer le lot
  au sommet de la pile (les numéros d'objets concordent : le rejeu est
  déterministe, pdf-lib attribue les numéros en ordre d'enregistrement).
  Chaque nouveau geste vide la pile « à refaire » (règle habituelle).
- Le rejeu lui-même vit dans le MOTEUR (fonction rejouer(octets, gestes)
  testée en CI), le processus principal ne fait que l'appeler et exposer
  peutAnnuler / peutRefaire au résumé (les boutons se grisent).
- Toutes les fonctions de pose asynchrones (fiche mixte : embedFont) sont
  attendues une à une pendant le rejeu.
- Le menu natif gagne Édition → Annuler (Ctrl+Z) et Rétablir
  (Ctrl+Maj+Z). Précision : les raccourcis sont AFFICHÉS dans le menu mais
  NON enregistrés comme accélérateurs natifs (registerAccelerator:false)
  — un accélérateur natif intercepterait Ctrl+Z même pendant la saisie
  d'une note et casserait l'annulation native du champ. L'appui réel est
  écouté dans la fenêtre de rendu, avec la garde habituelle : si le focus
  est dans un champ (notes, équations), Ctrl+Z annule la FRAPPE, pas le
  document.

## Décisions laissées au constructeur (prises ici comme mes choix)

- La mini-barre flottante de sélection réutilise la mise en page du
  sélecteur de couleur de l'éditeur ( fond clair, ombre douce ) sans nouveau
  style lourd.
- L'outil s'appelle « Sélectionner le texte » dans la barre et hérite du
  curseur en I.
- Annuler ne s'occupe pas du fichier sur disque : après une annulation
  suivie d'un enregistrement, la copie horodatée reste l'outil de sécurité.
- Les octets originaux vivent en mémoire de session (pas de limite en
  pratique : un PDF de cours tient en quelques mégaoctets).

## Preuves et garde-fous

- moteur pur testable sous Node : coords (déjà verts), UN NOUVEAU module
  de rejeu, tests CI du rejeu avec les cas sensibles : correction d'une
  fiche (retrait + repose dans un seul geste), fiche mixte asynchrone,
  remplacement d'équation, déplacement.
- la conversion client → PDF pour le surlignage passe par les fonctions
  existantes déjà couvertes sur les pages tournées.
- livraison : comme les versions précédentes (chaîne GitHub Actions,
  journal d'échec des tests publié en annotations publiques, somme de
  l'installateur vérifiée).

## Découpage indicatif

1. Main (le plus simple, effet immédiat).
2. Annulation (moteur + IPC + menu + boutons).
3. Sélection de texte → surlignage (couche pdf.js, la plus délicate,
   livrée après le socle sûr).
4. Livraison v0.1.13, puis la Légende en v0.1.14 sur demande.
