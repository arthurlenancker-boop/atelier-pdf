# Serveur OCR LaTeX personnel (v0.1.25)

Ce petit dossier fait tourner, sur votre propre ordinateur, un moteur de
reconnaissance de formules vers LaTeX (RapidLaTeXOCR, licence MIT, modèle
exécuté en local, aucune donnée ne sort de vos machines). Atelier PDF, lancé
sur un autre ordinateur (par exemple celui du travail), lui envoie l'image
de la zone sélectionnée quand vous cliquez « ƒ LaTeX ».

Nouveautés de cette version : le jeton d'accès facultatif (`--jeton`), le
lanceur Windows `demarrage-windows.cmd`, et les recettes Ubuntu + Tailscale
Funnel ci-dessous.

## 1. Ce qu'il faut

- Python, de la version 3.10 à la version 3.12 EXACTEMENT. C'est le piège
  numéro un : les Python trop récents (3.13 et suivants) sont REFUSÉS par
  le moteur `rapid-latex-ocr`. C'est voulu, mieux vaut une erreur claire
  qu'un échec obscure.
- Sous Windows, la version 3.12.10 est la dernière de sa branche fournie
  avec un installateur : prenez
  `python-3.12.10-amd64.exe` sur python.org (rubrique « Windows
  installer » de la page 3.12.10), cochez « Add to PATH ».
- Une dizaine de minutes la première fois. Aucune connaissance technique
  n'est requise au-delà de copier les commandes.

## 2. Installation

1. Téléchargez ce dossier (bouton Code → Download ZIP du dépôt, ou copiez
   les fichiers de `serveur-ocr/`).
2. Ouvrez un terminal DANS ce dossier (sous Windows : Shift + clic droit
   dans le dossier → « Ouvrir la fenêtre PowerShell ici »).
3. Installez le moteur, une seule fois (sous Windows, où 3.12 a été
   installé aux côtés d'un Python plus récent, la commande `py -3.12`
   vise expressément la bonne version) :

   ```
   py -3.12 -m pip install -r requirements.txt
   ```

   (Sous Linux ou macOS : `python3 -m pip install -r requirements.txt`.)

## 3. Lancer le serveur

```
py -3.12 serveur.py
```

La toute première interrogation télécharge les modèles du moteur
(quelques dizaines de Mo), puis chaque formule est reconnue en une à
quelques secondes selon la machine. Laissez la fenêtre ouverte pendant
que vous utilisez Atelier PDF ; Ctrl+C l'arrête.

Pour éviter de retaper la commande après chaque redémarrage de Windows,
double-cliquez simplement `demarrage-windows.cmd` (fenêtre réduite dans
la barre des tâches).

Options du lancement :

```
py -3.12 serveur.py --port 9000      # autre port que 8642
py -3.12 serveur.py --jeton MONSECRET
```

`--jeton` exige l'en-tête « Bearer MONSECRET » sur chaque requête POST
(le GET d'état reste ouvert) ; renseignez alors le même jeton dans Atelier
PDF, menu Fichier → Options OCR LaTeX…, champ « Jeton ». Sans l'option,
la variable d'environnement `JETON_OCR` fait de même. Par défaut, aucun
jeton n'est exigé.

Important : le serveur ne redémarre pas tout seul quand l'ordinateur
redémarre. Après un reboot, relancez `demarrage-windows.cmd`.

## 4. Vérifier la chaîne AVANT d'installer le moteur

```
py -3.12 serveur.py --banc
```

Le mode banc d'essai répond une formule fixe sans installer le moteur.
Il sert à contrôler l'URL, Tailscale et le pare-feu en une minute, puis
à régler Atelier PDF (section 5) : une fois le bouton « ƒ LaTeX » réussi
en mode banc, refaites l'installation complète et relancez sans `--banc`.

Le niveau de vérification se lit depuis N'IMPORTE QUEL appareil relié :

```
curl http://ADRESSE:8642/ocr
```

doit répondre `{"service": "serveur-ocr", "banc": true}`. Essayez d'abord
depuis le PC lui-même (`http://127.0.0.1:8642/ocr`), puis depuis le même
réseau (l'adresse LAN du PC), puis depuis l'extérieur (recette Funnel,
section 7) : chaque cran réussi isole le défaut au cran suivant.

## 5. Faire joindre Atelier PDF à votre serveur

Dans Atelier PDF : menu Fichier → « Options OCR LaTeX… », choisissez
« Mon serveur OCR », et indiquez l'adresse :

- sur le même ordinateur : `http://127.0.0.1:8642/ocr` (port 8642 par
  défaut) ;
- depuis un autre ordinateur de votre réseau domestique :
  `http://ADRESSE-LAN-DU-PC:8642/ocr` ;
- depuis un autre ordinateur de votre réseau Tailscale : `http://<adresse
  Tailscale de ce PC>:8642/ocr`. L'adresse se lit sur CE PC avec la
  commande `tailscale ip -4` (elle ressemble à 100.x.y.z) ;
- depuis n'importe où par Tailscale Funnel : l'adresse `https://…` de la
  section 7.

Si le serveur est lancé avec `--jeton`, saisissez le même jeton dans le
champ prévu à cet effet ; laissez ce champ vide sinon.

Sous Windows, au premier lancement, le pare-feu demande l'autorisation
pour Python : cochez les deux cases (réseaux privés et publics) ; le
port 8642 ne répond qu'aux machines de votre réseau si vous ne l'ouvrez
nulle part ailleurs.

## 6. Recette Ubuntu : relais d'un PC du réseau

Si le PC qui fait tourner le serveur n'est pas directement joignable,
un autre PC Linux du réseau peut servir de relais : il écoute en local
et transmet au PC du serveur. Installez `socat`, puis créez le service
systemd `/etc/systemd/system/relais-ocr.service` :

```
[Unit]
Description=Relais vers le serveur OCR LaTeX
After=network-online.target

[Service]
ExecStart=/usr/bin/socat TCP-LISTEN:8643,bind=127.0.0.1,fork,reuseaddr TCP:ADRESSE-DU-PC-SERVEUR:8642
Restart=always

[Install]
WantedBy=multi-user.target
```

Puis :

```
sudo systemctl daemon-reload
sudo systemctl enable --now relais-ocr
```

Le relais écoute alors sur `127.0.0.1:8643` du PC Linux. C'est ce point
local que le Funnel publie (section 7). Contrôle :
`curl http://127.0.0.1:8643/ocr` depuis ce même PC Linux.

## 7. Recette Tailscale Funnel (accès depuis l'extérieur)

Tailscale Funnel publie un service du PC Linux sur une adresse
`https://….ts.net`, avec un certificat TLS automatique, sans ouvrir
aucun port de la box. Prérequis : Tailscale installé et connecté sur ce
PC, et Funnel activé une première fois pour votre domaine (page DNS de
la console d'administration Tailscale). La publication tient en deux
commandes, dans cet ordre :

```
sudo tailscale funnel --bg 8090
sudo tailscale funnel --bg --set-path=/latex-ocr http://127.0.0.1:8643
sudo tailscale serve status
```

Attendez que le statut affiche «(Funnel on)» ET les deux branches ("/"
vers 8090, "/latex-ocr" vers 8643). La version publique est alors :

```
https://VOTRE-MACHINE.ts.net/latex-ocr/ocr
```

Deux pièges connus de cette génération de Tailscale :

- `tailscale serve --bg --set-path=…` sur une URL AJOUTE le montage mais
  COUPE le Funnel existant : utilisez toujours `funnel --bg` (pas
  `serve --bg`) pour chaque branche ;
- `tailscale funnel --https=443 on` n'existe pas dans cette génération :
  l'erreur « non-localhost target "http://on" » signifie que la commande
  est mal formée pour cette version.

Test depuis un appareil HORS du réseau (donnez l'adresse à votre
téléphone, réseau mobile activé) :

```
curl https://VOTRE-MACHINE.ts.net/latex-ocr/ocr
```

Doit répondre le même JSON qu'en local. Si le nom `.ts.net` ne se
résout plus du tout, le Funnel est retombé (ou une commande `serve`
l'a démonté) : relancez les deux commandes ci-dessus.

## 8. Contrat technique (pour toute autre implémentation)

- Requête : `POST` sur n'importe quel chemin, corps JSON
  `{ "image_url": "data:image/png;base64,…" }`. Si un jeton est exigé,
  en-tête `Authorization: Bearer <jeton>` ; sans lui la réponse est
  `401 {"erreur": "Jeton absent ou refusé."}` (le corps n'est pas lu
  avant l'autorisation).
- Réponse 200 : `{ "latex": "…" }` (Atelier PDF copie la valeur telle
  quelle ; les champs `text` ou `markdown` sont aussi acceptés, la
  formule y est alors repérée entre `$…$` ou `$$…$$`).
- État : `GET /ocr` (ou tout GET) répond
  `{"service": "serveur-ocr", "banc": true|false}`, sans jeton.
- Erreurs : code HTTP hors 200, affiché tel quel par l'application.

## 9. Confidentialité

Les images de formules transitent uniquement entre vos machines
(chiffrées par Tailscale dans ce cas) et sont traitées sur votre PC.
Le moteur n'est contacté par personne, et aucun résultat ne sort de la
maison.
