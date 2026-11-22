# Onglets et « enregistrer avant la fermeture » — v0.1.30 (22 novembre 2026)

Demande d'Arthur : « ajoute un système d'onglets et de enregistrer avant
la fermeture ».

## Décisions

1. Les états complets des documents ouverts vivent dans le PROCESSUS
   PRINCIPAL : `onglets` (Map id → état complet : chemin, document
   pdf-lib, session, journal des gestes, octets d'origine, drapeau
   « modifié »). La variable `etat` existante devient « l'onglet ACTIF » :
   les canaux existants (`pdf:apply`, `pdf:undo`, `pdf:redo`,
   `pdf:save`) n'ont PAS été modifiés — ils travaillent sur l'onglet
   actif, et `pdf:activate` bascule le pointeur avant toute action du
   rendu. Risque minimal :
   des milliers de lignes éprouvées restent intactes.
2. Le rendu ne garde par onglet que la présentation : nom, pastille
   « modifié », et la vue mémorisée (page, zoom, mots reconnus, pages
   reconnues). La bascule réaffiche depuis le résumé du main ; une
   écriture en cours (cadre de la machine à écrire) est refermée
   proprement AVANT de quitter l'onglet, jamais transportée.
3. Un même fichier n'est jamais ouvert en double : `pdf:open` détecte
   le chemin déjà ouvert et renvoie `dejaOuvert : true` ; le rendu
   active l'onglet existant (sinon deux exemplaires s'écraseraient
   mutuellement à l'enregistrement).
4. « Enregistrer avant la fermeture » : UNE boîte native
   (Enregistrer / Fermer sans enregistrer / Annuler, par défaut
   Enregistrer), posée par le main, partagée par la croix d'onglet
   (canal `pdf:fermer`) et par la fermeture de la FENÊTRE (événement
   `close`, intercepté avec preventDefault tant qu'un avis n'a pas été
   donné pour chaque onglet modifié — la croix, Alt+F4 et le menu
   Quitter passent tous par là). « Annuler » n'a aucune conséquence.
   Un échec d'enregistrement garde l'onglet/fenêtre OUVERT avec le
   message.
5. Corps du rendu en colonne flexible (fin de la grille figée à quatre
   pistes) : la bande d'onglets et la barre de progression
   s'ajoutent ou disparaissent sans jamais décaler la zone de travail
   (leçon v0.1.16 appliquée ; au passage la barre de progression v0.1.28
   visible seule décalait déjà le pied — plus possible).

## Livré

- `main.js` : Map des onglets, `pdf:activate`, `pdf:fermer`,
  `enregistrerOnglet`, `demanderAvisFermeture`, `confirmerFermetureFenetre`
  (garde anti-rebond `confirmationFermetureEnCours`), menu
  Fichier → « Fermer l'onglet » (Ctrl+W), `notifierChangement` porte
  `idOnglet`.
- `preload.js` : `activer(id)`, `fermer(id)`.
- `renderer/app.js` : bande `#onglets` (construite par `majOnglets`,
  appelée depuis `majResume` et `onChanged`), ouverture/activation/
  fermeture (`ouvrirDocument` réaffactored en `afficherDocument`,
  `activerOnglet`, `fermerOnglet`), retour accueil quand le dernier
  onglet ferme, Diagnostics enrichis (nombre d'onglets, actif).
- `renderer/index.html` : div `#onglets` ; `renderer/style.css` :
  styles `.onglets/.onglet` (interface neutre : face claire et liseré
  accent bas pour l'actif) et corps flexible.
- README (table des contrôles), `docs/utilisation.md` (section 5),
  `package.json` 0.1.30, déclencheur Livraison dans `etag.yml`.

## Limites connues assumées

- La reconnaissance du document (serveur OCR) part à l'OUVERTURE d'un
  onglet, pas à chaque bascule : les résultats déjà acquis d'un onglet
  sont restaurés, une bascule n'en relance pas une passe.
- `pdf:save` de la copie horodatée laisse l'onglet sur le fichier
  d'origine (comportement inchangé).
