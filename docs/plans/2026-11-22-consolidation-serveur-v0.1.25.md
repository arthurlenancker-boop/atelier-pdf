# Plan v0.1.25 — consolidation du serveur OCR (22 novembre 2026)

> **Pour les exécutateurs :** skill REQUIS : superpowers:executing-plans
> (exécution native) pour implémenter ce plan tâche par tâche. Les étapes
> utilisent la syntaxe de cases à cocher (`- [ ]`).

**Objectif :** fiabiliser et documenter le serveur OCR LaTeX existant
(v0.1.23) avant d'y ajouter la reconnaissance complète (v0.1.26) :
jeton de service optionnel, mode d'emploi corrigé (Python 3.10-3.12),
recette réseau complète (LAN + Funnel + relais), démarrage automatique
optionnel.

**Architecture :** le serveur `serveur-ocr/serveur.py` (bibliothèque
standard Python) gagne une option `--jeton` qui verrouille les POST par
un en-tête `Authorization: Bearer` (le GET de diagnostic reste ouvert) ;
l'app Atelier PDF gagne un champ jeton facultatif (jamais rappelé à
l'écran) et un message d'erreur dédié au refus de jeton ; le LISEZMOI
est réécrit avec la recette réseau complète validée le 22 novembre.

**Pile technique :** Python 3.12 (bibliothèque standard uniquement,
aucune nouvelle dépendance serveur) ; Electron/pdf.js côté app,
moteur pur `engine/ocr.js` testé sous Node (`node --test`).

**Conception de référence :** docs/plans/2026-11-22-document-vivant-design.md
(sections « Contrat serveur v2 », « Chaîne », « Versions successives »,
point v0.1.25). Le plan argue depuis ce document : l'exécutateur le lit
aussi.

## Contraintes globales

- Python 3.10 à 3.12 OBLIGATOIRE : rapid-latex-ocr refuse 3.13+ ;
  invocation Windows `py -3.12 serveur.py` (3.12.10 est la dernière
  3.12 disposant d'un installateur Windows, déjà déposée chez Arthur).
- Serveur : BIBLIOTHÈQUE STANDARD Python uniquement, verrou d'exécution
  une requête à la fois, messages d'erreur en français, port 8642 par
  défaut, options `--hote/--port/--banc` inchangées.
- Contrat v0.1.23 INCHANGÉ : POST JSON `{ "image_url": "data:…;base64,…" }`
  → 200 `{ "latex": "…" }` ; GET /ocr → `{ "service": "serveur-ocr", "banc": true }` ;
  mode `--banc` (réponse fixe, moteur désactivé).
- App : moteur pur testé sous Node (`node --test`), interface mince ;
  un secret (clé ou jeton) n'est JAMAIS rappelé à l'écran après
  enregistrement (le champ réaffiché reste TOUJOURS vide).
- `serveur-ocr/` reste FACULTATIF et NON embarqué dans le paquet
  Windows (extraResources et files inchangés).
- Licences : rien de payant ; classes de licences MIT/Apache/BSD/ISC/
  0BSD/AGPL respectées (aucune nouvelle dépendance dans ce plan).

## Points de vigilance (entrées à risque non couvertes par le contrat)

1. App AVEC jeton configuré + serveur SANS jeton : l'en-tête Bearer
   doit être IGNORÉ par le serveur (200 quand même) — test dans la
   tâche 1.
2. App SANS jeton + serveur AVEC jeton : 401 doit s'afficher comme un
   refus de jeton (message distinct), pas comme un serveur injoignable
   — test dans la tâche 2 (moteur pur) et tâche 3 (branchement).
3. Jeton avec espaces parasites saisis dans l'app : épure (trim) avant
   enregistrement — test dans la tâche 2.
4. GET de diagnostic SANS jeton doit rester accessible même quand le
   jeton est actif (vérifier la chaîne AVANT de configurer le jeton) —
   test dans la tâche 1.
5. Python 3.13+ installé par erreur : le LISEZMOI doit l'expliquer
   visiblement AVANT l'installation du moteur (tâche 4) ; le test
   serveur (tâche 1) ne dépend PAS du moteur donc échoue proprement
   sur toute version.

---

### Tâche 1 : jeton de service côté serveur

**Fichiers :**
- Modifier : `serveur-ocr/serveur.py`
- Créer : `serveur-ocr/test_serveur.py` (autonome, mode `--banc`
  uniquement, ZÉRO dépendance externe, bibliothèque standard : thread +
  urllib)

**Interfaces :**
- Produit : option `--jeton TEXTE` de serveur.py (défaut : valeur de la
  variable d'environnement `JETON_OCR`, sinon AUCUN jeton). Si un jeton
  est actif, tout POST sans en-tête `Authorization: Bearer <jeton>`
  exact répond 401 avec corps JSON `{"erreur": "Jeton absent ou refusé."}` ;
  GET /ocr reste accessible sans jeton (il ne donne que l'état).
- Produit : `serveur-ocr/test_serveur.py` — exécutable directement
  (`py -3.12 serveur-ocr/test_serveur.py`), exit 0 si tout vert,
  imprime chaque vérification ; démarre le serveur en thread sur un
  port libre (paramètre --port, défaut 18642), --banc.

- [ ] **Étape 1 : écrire le test défaillant**

`serveur-ocr/test_serveur.py` vérifie, dans l'ordre (chaque ligne
imprimée) :

1. serveur --banc SANS --jeton : GET /ocr → 200 ; POST /ocr sans
   en-tête → 200 `{ "latex": … }` ; POST /ocr AVEC en-tête
   `Authorization: Bearer nimporte` → 200 QUAND MÊME (rétrocompat :
   un serveur sans jeton ignore l'en-tête).
2. serveur --banc --jeton secret123 : GET /ocr SANS en-tête → 200 ;
   POST /ocr SANS en-tête → 401 avec `{"erreur": "Jeton absent ou refusé."}` ;
   POST /ocr avec `Authorization: Bearer secret123` → 200 ; POST /ocr
   avec `Authorization: Bearer mauvais` → 401.

Le POST de test envoie le corps JSON minimal
`{"image_url": "data:image/png;base64,iVBORw0KGgo="}`.

- [ ] **Étape 2 : lancer le test et vérifier l'échec**

Exécuter : `py -3.12 serveur-ocr/test_serveur.py`
Attendu : échec aux vérifications du jeton (option --jeton inconnue).

- [ ] **Étape 3 : implémenter `--jeton` dans serveur.py**

Analyse des arguments : ajout de `--jeton` (défaut : `os.environ.get("JETON_OCR")`,
chaîne vide = aucun jeton). Nouvelle fonction pure
`autorise(enteteAuthorization, jetonActif) -> bool` : si `jetonActif`
est vide → True (jamais verrouillé) ; sinon True uniquement si
l'en-tête vaut exactement `"Bearer " + jetonActif`. Le gestionnaire
POST appelle `autorise` et répond 401 en son échec ; le GET de
diagnostic ne l'appelle pas. Signatures existantes intactes.

- [ ] **Étape 4 : lancer le test et vérifier le succès**

Exécuter : `py -3.12 serveur-ocr/test_serveur.py`
Attendu : toutes les vérifications vertes, exit 0.

- [ ] **Étape 5 : commit**

```bash
git add serveur-ocr/serveur.py serveur-ocr/test_serveur.py
git commit -m "feat: jeton de service optionnel du serveur OCR"
```

---

### Tâche 2 : en-tête et message côté moteur pur

**Fichiers :**
- Modifier : `engine/ocr.js`
- Modifier : `test/ocr.test.js`

**Interfaces :**
- Produit : `enteteJeton(jeton)` dans engine/ocr.js — chaîne vide,
  nulle ou blanches → `{}` ; sinon `{ "Authorization": "Bearer " + jetonEpure }`
  où jetonEpure = trim de chaque côté.
- Produit : `messageErreurOcr(statut, infos)` dans engine/ocr.js —
  401 → `"Le serveur exige un jeton : jeton absent ou refusé."` ;
  0 → `"Le serveur OCR est injoignable."` ; les autres statuts →
  `"Le serveur OCR a répondu une erreur (code <statut>)."`.

- [ ] **Étape 1 : écrire les tests défaillants**

Dans test/ocr.test.js :

1. `enteteJeton('')` → `{}` ;
2. `enteteJeton(null)` → `{}` ;
3. `enteteJeton('  secret123 ')` → `{ 'Authorization': 'Bearer secret123' }` ;
4. `messageErreurOcr(401)` contient « jeton » ;
5. `messageErreurOcr(0)` contient « injoignable » ;
6. `messageErreurOcr(500)` contient « 500 ».

- [ ] **Étape 2 : lancer les tests et vérifier l'échec**

Exécuter : `node --test test/ocr.test.js`
Attendu : échec (fonctions absentes).

- [ ] **Étape 3 : implémenter dans engine/ocr.js**

Mêmes conventions que les fonctions voisines (double en-tête GUARDÉ,
leçon v0.1.4 : aucune référence CommonJS hors garde).

- [ ] **Étape 4 : lancer les tests et vérifier le succès**

Exécuter : `node --test test/ocr.test.js`
Attendu : tous verts.

- [ ] **Étape 5 : commit**

```bash
git add engine/ocr.js test/ocr.test.js
git commit -m "feat: en-tête Bearer et message 401 côté client OCR"
```

---

### Tâche 3 : branchement app (config, IPC, champ, requête)

**Fichiers :**
- Modifier : `main.js` (IPC `conf:ocr`, `conf:ocr:get`, `ocr:latex`)
- Modifier : `renderer/app.js` (carte options OCR)

**Interfaces :**
- Consomme : `enteteJeton` et `messageErreurOcr` (tâche 2), contrat
  serveur (tâche 1).
- Produit : config.json conserve `serveurOcr` (URL) et gagne `jetonOcr`
  (chaîne éventuellement vide) ; `conf:ocr` accepte `{ url?, jeton? }`
  (jeton trimé, `''` retire le jeton) ; `conf:ocr:get` renvoie
  `{ mode, url, jetonPresent }` — JAMAIS la valeur du jeton ; `ocr:latex`
  envoie la requête avec les en-têtes d'`enteteJeton(jetonOcr)` et, en
  cas de statut HTTP 401 ou d'échec, renvoie `{ erreur: messageErreurOcr(…) }`.

- [ ] **Étape 1 : implémenter main.js**

Suivre le modèle existant de `cleMistral`/`serveurOcr` : lecture
sécure de config.json, écriture atomique si déjà pratiquée, gestion
d'erreurs en `{ erreur: message français }` (jamais d'exception IPC).
Le champ jeton suit EXACTEMENT la discipline de la clé Mistral :
enregistrable, jamais renvoyé.

- [ ] **Étape 2 : implémenter le renderer**

Dans la carte « Options OCR LaTeX », section « Mon serveur OCR », un
champ supplémentaire « Jeton (uniquement si le serveur en exige un) »,
TOUJOURS vide à l'ouverture ; texte d'aide : « Laisser vide si le
serveur n'exige pas de jeton. »

- [ ] **Étape 3 : vérifier la syntaxe et le moteur**

Exécuter : `node --test test/` (moteur entier), `node --check main.js`,
`node --input-type=module --check renderer/app.js`
Attendu : tout vert.

- [ ] **Étape 4 : commit**

```bash
git add main.js renderer/app.js
git commit -m "feat: champ jeton optionnel dans les options OCR"
```

---

### Tâche 4 : LISEZMOI v2 + démarrage automatique optionnel

**Fichiers :**
- Modifier : `serveur-ocr/LISEZMOI.md` (réécriture)
- Créer : `serveur-ocr/demarrage-windows.cmd`

**Interfaces :**
- Consomme : l'option `--jeton` (tâche 1) ; la recette réseau validée
  le 22 novembre (faits ci-dessous, à recopier fidèlement).
- Produit : un LISEZMOI complet permettant à un lecteur non technique
  de vérifier la chaîne AVANT d'installer le gros moteur, et un script
  de démarrage copiable dans le dossier Démarrage de Windows.

- [ ] **Étape 1 : écrire demarrage-windows.cmd**

```bat
@echo off
rem Serveur OCR Atelier PDF — démarrage automatique (copier un
rem raccourci de ce fichier dans le dossier Démarrage :
rem Touche Windows + R, taper shell:startup, Entrée).
cd /d "%~dp0"
start "Serveur OCR Atelier PDF" /min py -3.12 serveur.py
```

- [ ] **Étape 2 : réécrire LISEZMOI.md**

Sections obligatoires, dans l'ordre :
1. Vue d'ensemble et confidentialité (inchangé dans l'esprit).
2. « Ce qu'il faut » : Python 3.10 à 3.12 EXIGÉ, avec l'avertissement
   visible : les Python 3.13 et plus récents sont REFUSÉS par le moteur
   de formules ; sous Windows, dernière version 3.12 installable :
   3.12.10 (installateur python-3.12.10-amd64.exe de python.org) ;
   toutes les commandes via `py -3.12 serveur.py`.
3. Installation (pip install -r requirements.txt, premier appel
   télécharge les modèles, une à quelques secondes par formule).
4. Vérifier la chaîne AVANT le moteur : local
   (`http://127.0.0.1:8642/ocr`) ; même réseau local
   (`http://192.168.1.116:8642/ocr`) ; depuis l'extérieur
   (Funnel : `https://pcarthur-1.tailda0234.ts.net/latex-ocr/ocr`).
5. RECETTE UBUNTU (relais socat systemd), recopiée de la validation
   du 22 novembre : créer `/etc/systemd/system/relais-ocr.service`
   exécutant `socat TCP-LISTEN:8643,bind=127.0.0.1,fork,reuseaddr
   TCP:192.168.1.116:8642`, puis `sudo systemctl daemon-reload`,
   `sudo systemctl enable --now relais-ocr.service`. Vérification :
   depuis le PC Ubuntu, `curl http://127.0.0.1:8643/ocr`.
6. RECETTE FUNNEL (la séquence exacte qui évite le piège principal de
   cette génération de tailscale) : là où
   PocketBase est déjà servi, la bonne séquence pour DEUX montages :
   `sudo tailscale funnel --bg 8090` PUIS
   `sudo tailscale funnel --bg --set-path=/latex-ocr http://127.0.0.1:8643`
   PUIS `sudo tailscale serve status` → attendre «(Funnel on)» et les
   deux branches (`/`→8090, `/latex-ocr`→8643). Pièges documentés :
   `serve --bg --set-path` SEUL RETIRE le funnel du 8090 (TOUT
   remonter ensemble) ; `funnel --https=443 on` n'existe pas dans
   cette génération ; un DNS qui ne résout plus
   `pcarthur-1.tailda0234.ts.net` signifie que le funnel est coupé :
   le remonter avec la séquence ci-dessus.
7. JETON (facultatif) : ajouter `--jeton MONJETON` à la commande de
   lancement (ou variable `JETON_OCR`) ; dans Atelier PDF, renseigner
   le même jeton dans Options OCR → Mon serveur OCR → Jeton. Effet :
   les requêtes sans jeton sont refusées.
8. DÉMARRAGE AUTOMATIQUE (facultatif) : copier un raccourci de
   demarrage-windows.cmd dans shell:startup ; le serveur démarre
   alors minimisé à chaque ouverture de session ; sinon, le relancer
   à la main après chaque redémarrage du PC fixe.
9. Contrat technique : v0.1.23 INCHANGÉ + extension 401/en-tête
   Authorization: Bearer, pour toute autre implémentation.

- [ ] **Étape 3 : relecture du LISEZMOI avec les faits sous les yeux**

Relire la topologie ci-dessus à côté du LISEZMOI ; corriger tout
écart d'adresse, de port ou de séquence ; vérifier en particulier
que la séquence funnel en DEUX commandes apparaît bien dans l'ordre.

- [ ] **Étape 4 : commit**

```bash
git add serveur-ocr/LISEZMOI.md serveur-ocr/demarrage-windows.cmd
git commit -m "docs: LISEZMOI v2 (Python 3.12, recette lan/funnel/relais, jeton, auto-démarrage)"
```

---

### Tâche 5 : la CI exécute le test serveur

**Fichiers :**
- Modifier : `.github/workflows/ci.yml`
- Modifier : `.github/workflows/etag.yml` (même étape aux deux)

**Interfaces :**
- Consomme : `serveur-ocr/test_serveur.py` (tâche 1, autonomie
  bibliothèque standard, mode --banc : aucune dépendance installable).

- [ ] **Étape 1 : ajouter l'étape après « npm test »**

```yaml
      - name: Test serveur OCR (mode banc)
        shell: bash
        run: py -3.12 serveur-ocr/test_serveur.py
```

(les leçons CI du projet exigent shell: bash pour tout ce qui touche
un interpréteur ; py -3.12 est présent sur windows-latest).

- [ ] **Étape 2 : vérifier la syntaxe des deux workflows**

Relire les deux fichiers complets (indentation YAML, position de
l'étape) ; node --check est inapplicable ici : relecture attentive.

- [ ] **Étape 3 : commit**

```bash
git add .github/workflows/ci.yml .github/workflows/etag.yml
git commit -m "ci: le serveur OCR passe son banc d'essai à chaque pousse"
```

---

### Tâche 6 : livraison v0.1.25

**Fichiers :**
- Modifier : `package.json` (version 0.1.25)
- Modifier : `.github/workflows/etag.yml` (commentaire déclencheur)

**Interfaces :**
- Consomme : le flux « Livraison » du dépôt (déjà éprouvé 24 fois) ;
  le protocole de pousse FIABLE documenté dans la mémoire du projet
  (empreintes longueur u16 + somme pondérée vérifiées dans
  run_typescript, push_files, contrôle final par zip codeload +
  `diff -r`).

- [ ] **Étape 1 : monter la version et le déclencheur**

package.json `"version": "0.1.25"` ; commentaire déclencheur v0.1.25
dans etag.yml (règle du projet : le flux ne se déclenche que sur
modification de ce fichier).

- [ ] **Étape 2 : pousser via le protocole des empreintes**

Chaque fichier poussé est relu (read_file paginé si tronqué),
empreinte calculée et comparée AVANT pousse (push_files), contrôle
final : télécharger le zip codeload de main et `diff -r` vide contre
l'arbre local.

- [ ] **Étape 3 : surveiller le flux Livraison**

Canal fiable (leçon du projet) : la page github.com/arthurlenancker-boop/
atelier-pdf/actions/runs/<id> (jamais /commit/<sha>/checks, servi en
cache têtu). Attendre SUCCESS (~2-3 min).

- [ ] **Étape 4 : vérifier la publication**

Outils github_app authentifiés (pas l'API anonyme, limitée) : tag
v0.1.25 posé == tête de main ; assets au nombre de 3 ; télécharger
l'installateur et vérifier son sha512 IDENTIQUE à latest.yml.

- [ ] **Étape 5 : archiver**

`tar -czf archive-atelier-pdf-2026-11-22-v0.1.25.tar.gz` de l'arbre
local (== main), rangée à côté des archives précédentes. Consigner
la livraison dans la mémoire durable du projet.

- [ ] **Étape 6 : validation réelle d'Arthur (NON VALIDÉ tant que fait)**

Demande à Arthur : (1) installer v0.1.25 ; (2) OPTIONNELLEMENT lancer
le serveur avec `--jeton` et renseigner le jeton dans les options ;
(3) bouton ƒ LaTeX : banc puis moteur réel ; (4) la recette liée du
LISEZMOI pour la vérification Funnel. Tout écart : capture ou
diagnostics (menu Aide).

---

## Reste non validé (toujours en instance, rappel)

- Premier essai réel v0.1.24 (MathLive : zone structurée, montée à la
  frappe, matrice 6×6, correction au clic).
- Validation réelle du clic ƒ LaTeX depuis le portable (banc puis
  moteur réel) — la v0.1.25 rend ce test plus simple avec le LISEZMOI v2.
