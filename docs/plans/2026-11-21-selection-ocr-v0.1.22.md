# Sélection OCR et bouton « ƒ LaTeX » — v0.1.22 (21 novembre 2026)

## Demande

À partir du scan de cours « 1ère spé Leçon 2nd degré (2ème partie) page 1.pdf »
(414 images, AUCUNE couche de texte) : « sélectionner tout le texte présent
dans le document (dont le LaTeX) » — dans Atelier PDF même. Cadrage arrêté
avec Arthur : OCR locale + bouton LaTeX via l'OCR Mistral (en ligne) ;
déclenchement à la demande, page par page ; priorité à la sélection OCR
(la fonction Légende, demandée ensuite, reste planifiée). Le cadrage initial
« pas de cloud, tout local » est amendé pour ce seul bouton.

## Conception

- OCR locale : tesseract.js v6 (Apache-2.0, WASM) exécuté dans le rendu,
  servi par le protocole app:// depuis extraResources (même discipline que
  pdf.js) : module ESM + worker + cœur tesseract.js-core (le .wasm est
  EMBARQUÉ en base64 dans les .wasm.js, aucun téléchargement), modèle de
  langue français tessdata_fast embarqué dans ocr/ (committé en base64
  ASCII — seul encodage garanti octet par octet par le transport de
  poussée — décodé par scripts/preparer-ocr.js en CI/dev ; le paquet
  Windows porte le vrai binaire via extraResources).
- Recognition : page rendue hors écran à ~1700 px de large, sortie parsemée
  en mots (engine/ocr.js, pur) convertis en FRACTIONS de page, posés en
  <span> invisibles dans le calque de texte : la sélection native existe,
  donc Surligner/Copier de la v0.1.13 fonctionnent tels quels, au zoom près.
- Déclenchement : armer l'outil Texte sur une page muette sans cache →
  une seule reconnaissance à la fois, numéro de génération (page tournée =
  résultat écoulé), cache par document (Map page → mots, vidée à
  l'ouverture d'un autre document).
- Bouton « ƒ LaTeX » : 3e bouton de la barre de sélection ; la zone
  (points PDF) est redessinée hors écran à échelle clamp(1400/largeur, 1,5, 6),
  coupée, envoyée en data URL au processus principal ; POST api.mistral.ai/
  v1/ocr {model: mistral-ocr-latest, document:{type:image_url,image_url}} ;
  les formules du Markdown renvoyé sont extraites par engine/ocr.js
  ($$…$$ puis $…$, \$ littéral respecté), copiées dans le presse-papiers ;
  « Aucune formule détectée » sinon. Timeout 30 s, erreurs en français.
- Clé API : saisie menu Fichier → « Clé API Mistral (LaTeX)… », stockée en
  clair dans userData/config.json, uniquement sur l'ordinateur ; le rendu
  ne reçoit jamais sa valeur, seulement sa présence.

## Fichiers

- engine/ocr.js (pur, double en-tête) : motsDepuisBlocs, extractionLatex,
  nettoyerCle, borner. test/ocr.test.js : 12 tests purs.
- test/tesseract.test.js : reconnaissance RÉELLE en CI seulement (skip
  sinon), avec les fichiers du dépôt (ocr/fra.traineddata.gz décodé par
  scripts/preparer-ocr.js, test/fixtures/titre.png.b64, bande titre
  « SECOND DEGRE (2ème partie) » du scan réel) — jamais de CDN, comme en
  production.
- ocr/fra.traineddata.gz.b64 : modèle tessdata_fast français (Apache-2.0),
  committé en ASCII ; scripts/preparer-ocr.js le décode (signature gzip
  vérifiée) — étape de CI (ci.yml avant les tests, etag.yml avant la
  construction), .gitignore ignore les binaire décodés.
- renderer/app.js, index.html, style.css : section v0.1.22 (OCR, ƒ LaTeX,
  saisie de clé), diagnostics enrichis.
- main.js : protocole app://ocr/, IPC ocr:latex / conf:cle / conf:cle:get,
  menu, ligne de diagnostic (présence de clé).
- preload.js : latexOcr, definirCle, clePresente.
- package.json : tesseract.js ^6.0.1 ; extraResources tesseract.js,
  tesseract.js-core, ocr. etag.yml : garde-fous OCR du paquet + engine/*.js
  en vérification systématique. README/NOTICE mis à jour.

## Ce qui reste non validé

Essai réel chez Arthur : outil Texte sur le scan de cours (reconnaissance,
sélection, surlignage, copie), bouton ƒ LaTeX avec sa clé (formules du
second degré de la leçon), diagnostics. La qualité du modèle tessdata_fast
se jugera sur ses documents : tessdata_best en remplacement si des mots
cousus échouent (au prix de quelques secondes de plus par page).
