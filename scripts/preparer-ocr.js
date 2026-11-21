// scripts/preparer-ocr.js — v0.1.22 : décode le modèle de langue de l'OCR.
// Le dépôt porte le fichier en BASE64 ASCII — seul encodage que le
// transport de poussée garantit octet par octet — et l'application, la CI
// et la construction attendent le VRAI binaire ocr/fra.traineddata.gz.
// Ce script pur (aucune dépendance) recrée ce binaire :
//   - CI : exécuté avant les tests et avant la construction ;
//   - développement : exécuter une fois après le clonage (voir README) ;
//   - l'installateur livré contient déjà le vrai binaire via extraResources.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'ocr', 'fra.traineddata.gz.b64');
const cible = path.join(__dirname, '..', 'ocr', 'fra.traineddata.gz');

if (!fs.existsSync(source)) {
  console.error('Absence du modèle base64 : ocr/fra.traineddata.gz.b64 introuvable.');
  process.exit(1);
}

const texte = fs.readFileSync(source, 'utf8').replace(/\s+/g, '');
const octets = Buffer.from(texte, 'base64');
// Signature gzip : 1f 8b — le modèle doit être le fichier comprimé attendu.
if (!(octets.length > 0 && octets[0] === 0x1f && octets[1] === 0x8b)) {
  console.error('Le décodage ne donne pas un fichier gzip (signature absente) : le base64 est corrompu.');
  process.exit(1);
}
fs.writeFileSync(cible, octets);
console.log(`Modèle OCR prêt : ocr/fra.traineddata.gz (${Math.round(octets.length / 1024)} Ko).`);
