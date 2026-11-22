# v0.1.32 — le geste « delta » et l'espace OneNote dans la zone structurée (22 novembre 2026)

## Contexte

Retour d'Arthur sur la v0.1.30 (capture du panneau Équation, mode
Professionnel) : « je voulais mettre delta... en plus la police est
vraiment pas belle... ». La capture montre la zone structurée affichant
une commande en cours de frappe en lettres droites (« \De… », la fin de
« \Delta » étant le complément grisé du mode commande), suivie de « < a »,
sans aucun symbole composé.

## Diagnostic (documenté sur les sources MathLive 0.102.0, pas deviné)

- MathLive n'inserte RIEN sur la barre d'espace en mode math
  (documenté : « By default, pressing the spacebar when in math mode does
  not insert anything »).
- Le mode d'édition de commandes LaTeX (ouvert par \ ou Échap) ne se
  quitte QUE par Échap (« Press ESC to exit LaTeX editing mode »).
- Conséquence vécue par Arthur : taper \Delta (ou \delta) puis Espace ne
  compose RIEN ; la commande reste en texte ; en tapant « <a » derrière,
  la formule entière paraît cassée et « pas belle ». C'est le déficit
  exact du geste signature de OneNote (commande + Espace = symbole).
- La palette « Grecques » existait déjà (α δ Δ…), mais le geste de frappe
  restait l'attente légitime d'Arthur.

## Correctifs (renderer/app.js, aucun moteur touché)

1. Zone structurée, parité OneNote : écoute keydown en phase capture sur
   le champ. Si Espace est pressé et que le champ est en mode commande
   (mf.mode === 'latex', API publique), preventDefault puis mf.mode =
   'math' : la commande en cours se compose. \delta + Espace donne δ,
   \Delta + Espace donne Δ. Hors du mode commande, Espace reste sans
   effet (comportement MathLive inchangé) ; Échap reste le repli.
   Repli guardé : le moindre échec de l'API laisse le comportement
   d'origine intact.
2. Palette « Grecques » complétée : l'alphabet grec entier
   (ε ζ η ι κ ν ξ τ υ χ ψ, ϑ ϕ, capitales Γ Θ Λ Ξ Φ Ψ), pour un accès
   direct au clic dans les deux modes.

## Décision consignée : la police « pas belle »

Étude faite à la demande d'Arthur, conclusion honnête, fermée pour
l'instant :
- Zone d'édition : MathLive compose OBLIGATOIREMENT avec les polices
  KaTeX (familles câblées « Main-Regular », « Math-Italic »… dans le
  bundle ; aucune option de remplacement). Ce que voit Arthur en éditant
  ne peut pas être changé.
- PDF final : le pipeline MathJax 3.2.2 ne distribue QUE les données de
  police TeX (vérifié dans le paquet) ; pas de STIX disponible ; la
  bêta MathJax 4 non plus (vérifié). Rapprocher l'aspect de Cambria Math
  exigerait de changer de moteur de composition : chantier lourd à
  réétudier à la demande, pas une itération courte.
- Réponse faite à Arthur : le geste corrigé ; la police assumée (libre,
  cohérente), pas de fausse promesse.

## Réparation de dernier recours : main rouge du flux parallèle (motif v0.1.27)

Le flux des annotations riches s'est arrêté sur main ROUGE : v0.1.31
poussée en quatre commits (tête 08df9f6, 18:05Z) mais CI #69 et
Livraison #41 ÉCHOUÉS, aucun commit pendant plus de vingt minutes de
surveillance, dernière version maintenue v0.1.30. Deux causes
établies en exécutant réellement `node --test` avec pdf-lib et
mathjax-full installés (tarballs vendés, jamais npm) :
1. engine/bouger.js : la branche `op === 'c'` (cubiques, six nombres,
   sept mots) était placée APRÈS le garde `nombreMots inconnu → ligne
   intacte`. Or `c` ne figure pas dans la table `{re, m, l, Td, cm,
   Tm}` : la ligne était rendue INTACTE avant d'atteindre la branche,
   les cubiques des ellipses n'étaient jamais translatées. Fix :
   déplacer la branche AVANT le garde.
2. test/bouger.test.js : la ligne cubique est convertie
   par `split(/\s+/).map(Number)` SUR LES SEPT MOTS, opcode compris :
   `Number('c')` = NaN, l'assertion `every` ne pouvait JAMAIS passer,
   moteur correct ou non. Fix : `slice(0, 6)` avant `map(Number)`.

Après ces deux correctifs : 250 tests verts (node --test complet).
Leur travail v0.1.31 est livré tel quel, aucune de leurs fonctionnalités
n'est modifiée ; le geste delta s'y ajoute.

## Livraison

Construite sur le main du jour (v0.1.31 des annotations riches, dont
les deux tests rouges réparés ci-dessus) ; version 0.1.32 ; un seul
commit (bouger.js + bouger.test.js + renderer/app.js + README + plan +
package.json + etag.yml) ; flux Livraison déclenché par etag.yml ;
sha512 vérifié contre latest.yml. Leçons durables :
- vérifier la TÊTE de main (tête + messages) AVANT et APRÈS chaque
  poussée : deux flux du même compte peuvent se croiser à la minute ;
- la barre d'espace « ne fait rien » est un défaut UX muet : un geste
  documenté « ne fait rien » doit être éprouvé à la frappe réelle,
  pas seulement à l'insertion programmatique.
