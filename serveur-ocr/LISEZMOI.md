# Serveur OCR LaTeX personnel (v0.1.23)

Ce petit dossier fait tourner, sur votre propre ordinateur, un moteur de
reconnaissance de formules vers LaTeX (RapidLaTeXOCR, licence MIT, modèle
exécuté en local, aucune donnée ne sort de vos machines). Atelier PDF, lancé
sur un autre ordinateur (par exemple celui du travail), lui envoie l'image
de la zone sélectionnée quand vous cliquez « ƒ LaTeX ».

## Ce qu'il faut

- Python 3.10 ou plus récent (python.org, cochez « Add to PATH » à
  l'installation sous Windows).
- Une dizaine de minutes la première fois. Aucune connaissance technique
  n'est requise au-delà de copier les commandes.

## Installation

1. Téléchargez ce dossier (bouton Code → Download ZIP du dépôt, ou copiez
   simplement les trois fichiers de `serveur-ocr/`).
2. Ouvrez un terminal DANS ce dossier (sous Windows : Shift + clic droit
   dans le dossier → « Ouvrir la fenêtre PowerShell ici »).
3. Installez le moteur, une seule fois :

   ```
   pip install -r requirements.txt
   ```

4. Lancez le serveur :

   ```
   python serveur.py
   ```

   La toute première interrogation télécharge les modèles du moteur
   (quelques dizaines de Mo), puis chaque formule est reconnue en une à
   quelques secondes selon la machine. Laissez la fenêtre ouverte pendant
   que vous utilisez Atelier PDF ; Ctrl+C l'arrête.

## Vérifier la chaîne AVANT d'installer le moteur

```
python serveur.py --banc
```

Le mode banc d'essai répond une formule fixe sans installer le moteur.
Il sert à contrôler l'URL, Tailscale et le pare-feu en une minute, puis
à régler Atelier PDF (ci-dessous) : une fois le bouton « ƒ LaTeX »
réussi en mode banc, refaites l'installation complète et relancez
sans `--banc`.

## Faire joindre Atelier PDF à votre serveur

Dans Atelier PDF : menu Fichier → « Options OCR LaTeX… », choisissez
« Mon serveur OCR », et indiquez l'adresse :

- sur le même ordinateur : `http://127.0.0.1:8642/ocr` (port 8642 par
  défaut) ;
- depuis un autre ordinateur de votre réseau Tailscale : `http://<adresse
  Tailscale de ce PC>:8642/ocr`. L'adresse se lit sur CE PC avec la
  commande `tailscale ip -4` (elle ressemble à 100.x.y.z).

Sous Windows, au premier lancement, le pare-feu demande l'autorisation
pour Python : cochez les deux cases (réseaux privés et publics) ; le
port 8642 ne répond qu'aux machines de votre Tailscale si vous ne
l'ouvrez nulle part ailleurs.

## Contrat technique (pour toute autre implémentation)

- Requête : `POST` sur n'importe quel chemin, corps JSON
  `{ "image_url": "data:image/png;base64,…" }`.
- Réponse 200 : `{ "latex": "…" }` (Atelier PDF copie la valeur telle
  quelle ; les champs `text` ou `markdown` sont aussi acceptés, la
  formule y est alors repérée entre `$…$` ou `$$…$$`).
- Erreurs : code HTTP hors 200, affiché tel quel par l'application.

## Confidentialité

Les images de formules transitent uniquement entre vos deux machines
(chiffrées par Tailscale dans ce cas) et sont traitées sur votre PC.
Le moteur du site n'est contacté par personne, et aucun résultat ne
sort de la maison.
