# v0.1.19 — Les maths de la machine à écrire

Date : 21 novembre 2026. Demande d'Arthur (capture à l'appui) : une limite
tapée à l'outil Écrire s'affichait en police courante, et les fenêtres
guidées (façon Dmaths) restaient réservées aux fiches : « met une police
pour les maths, tu as pas pris en compte le fonctionnement de Dmaths non
plus ».

## Décision

L'outil Écrire devient une vraie machine à écrire mathématique : la note
accepte les formules $...$ en ligne de texte, les fenêtres guidées
(quotient, racine, limite, intégrale, vecteur, système, matrice…) y
insèrent leurs compositions à la position du curseur, et la saisie se
fait en police mathématique. La fiche, elle, ne change pas.

## Réalisations

- « renderer/app.js » : « ouvrirInsertionFormule » n'écarte plus les
  notes ; le bouton du panneau Équation dit « Insérer dans la note »
  quand une note est ouverte, et le message qui l'accompagne suit. La
  validation d'une note contenant des formules pose une fiche mixte
  (une seule annotation, texte et équations rendus ensemble), en
  conservant le sujet « Note ». Une note mixte s'édite sans carte, à
  même la page, et s'affiche sans carte une fois posée : seul ce qui
  est écrit apparaît.
- « engine/melange.js » : le sujet (« Note » ou « Fiche ») voyage avec
  la fiche mixte et s'écrit dans le champ /Subject de l'annotation,
  relu à l'écran pour choisir la présentation, comme le font déjà les
  notes et fiches de texte.
- « renderer/style.css » : le cadre de saisie d'une note compose en
  « Cambria Math, Georgia, serif », la police mathématique de Windows ;
  chiffres et symboles prennent leur forme définitive pendant la
  frappe.
- « renderer/app.js » : la note posée s'affiche dans la même police
  mathématique, alignée sur ce que le cadre a montré.

## Ce qui ne change pas

- La fiche (carte) et la fiche mixte sur carte : présentation
  inchangée. Le filament moteur des fiches mixtes (composition, taille
  du corps embarquée dans le marqueur, redimensionnement) reste tel
  quel : le sujet est un champ additionnel, relu s'il est présent.
- Le déplacement, la suppression, l'aperçu rendu sous le cadre, le
  comportement de pose de la v0.1.18.

## Vérifications

- Les cinq suites exécutables sans « node_modules » passent (59
  tests). « node --check » passe sur chaque fichier modifié.
