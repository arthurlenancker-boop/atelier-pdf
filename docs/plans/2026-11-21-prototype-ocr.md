# Prototype de faisabilité OCR — 21 novembre 2026

## Décision amont

Le cadrage du 19 novembre avait écarté un pont OCR dans l'application (l'app
OCR du lanceur suffisait). Demande d'Arthur (21 novembre) : trouver un OCR à
intégrer « dans le logiciel », usage confirmé par choix : rendre les scans
interrogeables (recherche, sélection, copie). Le point douloureux visé :
l'outil Sélectionner du texte (v0.1.13) ne fonctionne pas sur les documents
scannés, et le surlignage d'un scan ne peut viser que des rectangles.

## Choix du moteur, contraintes d'Arthur

Tout local, tout gratuit, aucune donnée vers un réseau, application Windows
sans GPU. Les moteurs vision-langage en tête des référentiels 2026
(PaddleOCR-VL, MinerU, GLM-OCR) exigent Python et un GPU : écartés. Tesseract
reste la référence CPU imprimé (Apache-2.0, français inclus) :

- `tesseract.js` 7.0.0 (Apache-2.0, npm, WASM) : OCR dans le processus,
  aucun binaire natif à empaqueter.
- `@tesseract.js-data/fra` 1.0.0 (MIT) : données de langue françaises
  embarquées, HORS LIGNE au premier lancement (le mécanisme par défaut de
  tesseract.js est un téléchargement CDN : le passer à `langPath` local,
  dossier du paquet npm, supprime toute dépendance réseau).
- `@napi-rs/canvas` (MIT, devDependency) : uniquement pour rastériser et
  vérifier en CI ; l'application n'en a pas besoin.

Limitation assumée et documentée : Tesseract lit mal le manuscrit ; l'OCR
intégré vise les textes imprimés scannés. La transcription des notes
manuscrites reste un parcours séparé.

## Ce que le prototype prouve (test/ocr.test.js, CI uniquement)

Chaîne réelle simulée de bout en bout, sans fichiers vérifiés à la main :

1. Page texte A4 (pdf-lib, phrases françaises à position connue).
2. Rasterisation 300 dpi (pdf.js + document.canvasFactory) puis « scan » :
   PDF image seule. GATE : aucune extraction de texte possible avant OCR.
3. OCR Tesseract français, deux variantes de modèle (4.0.0_best_int et
   4.0.0), langues lues depuis node_modules : zéro réseau.
4. Couche de texte INVISIBLE posée sur la page du scan (engine/ocr.js) :
   mode de rendu 3 (« 3 Tr »), taille par ligne et ligne de base calées sur
   les bbox OCR, police Helvetica WinAnsi (nettoyage déterministe des
   caractères non encodables : engine/ocr.js versWinAnsi).
5. Vérifications automatiques :
   - les mots clés reconnus sont extraits par un lecteur standard (pdf.js
     getTextContent) : recherche/sélection possibles ;
   - le mot repère « habitants » est à sa position attendue (±25 pt x,
     ±20 pt y, tolérance du calage OCR) ;
   - les rasters 1,5x AVANT ET APRÈS la pose sont IDENTIQUES octet par
     octet : la couche est invisible, le scan visuel est intact ;
   - durées et couverture publiées en notice d'annotation de la
     vérification CI, échantillon en artefact (scan-ocr-demo).

## Format : PDF standard pur

Le texte invisible vit dans le flux de contenu de la page, pas dans une
annotation : n'importe quel lecteur conforme (Edge, Adobe, LibreOffice)
recherche, sélectionne et copie, et l'impression reste identique au scan
d'origine (Tr 3 ne peint jamais).

## Si le prototype est validé (Arthur fusionnera la PR)

Prochaine étape : intégration applicative (menu « Rendre le document
interrogeable », progression par page, réutilisation du pdfio/session
existant), puis mesure sur les vrais scans d'Arthur à l'écran.
