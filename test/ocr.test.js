// test/ocr.test.js — PROTOTYPE DE FAISABILITÉ OCR (21 nov. 2026).
// CI SEULEMENT : exige pdf-lib, pdfjs-dist (rasterisation + extraction),
// tesseract.js + @tesseract.js-data/fra (OCR hors ligne) et @napi-rs/canvas.
// Chaîne réelle simulée de bout en bout :
//   1. page texte A4 (pdf-lib) → PNG 300 dpi (pdf.js) ;
//   2. « scan » : PDF image seule → GATE : aucun texte extractible ;
//   3. OCR Tesseract français (variantes best_int ET best, hors ligne) ;
//   4. couche de texte invisible posée sur le scan (engine/ocr.js) ;
//   5. VÉRIFICATIONS : mots retrouvés, positions proches de la vérité,
//      raster pré/post inchangé (Tr 3 invisible), durées publiées en notice.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { PDFDocument, StandardFonts, rgb, PDFRawStream, PDFName, decodePDFRawStream } = require('pdf-lib');
const { lignesOCR, poserCoucheInvisible } = require('../engine/ocr.js');

const NOTICE = (m) => console.log(`::notice::OCR ${String(m).replace(/\r?\n/g, ' ')}`);

const TITRE = 'Histoire : la croissance économique';
const PHRASES = [
  "Le développement construit est une réponse organisée.",
  "L'industrie se concentre dans les grandes villes.",
  "La population française atteint quarante millions d'habitants.",
  "Le commerce maritime relie les principaux ports d'Europe.",
  "Les campagnes se vident au bénéfice des cités.",
];
const MOTS_CLES = [
  'histoire', 'croissance', 'economique', 'developpement', 'construit',
  'reponse', 'organisee', 'industrie', 'concentre', 'grandes', 'villes',
  'population', 'francaise', 'millions', 'habitants', 'commerce',
  'maritime', 'ports', 'europe', 'campagnes',
];
const LARG_PT = 595.28;
const HAUT_PT = 841.89;
const DPI = 300;
const X_TEXTE = 72;
const Y_TITRE = 760;
const Y_PHRASE0 = 700;
const ECART_Y = 34;
const TAILLE_TEXTE = 13;

const norm = (s) => String(s).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function dossierFra() {
  const essais = [
    () => path.dirname(require.resolve('@tesseract.js-data/fra')),
    () => path.dirname(require.resolve('@tesseract.js-data/fra/package.json')),
    () => path.join(process.cwd(), 'node_modules', '@tesseract.js-data', 'fra'),
  ];
  for (const essai of essais) {
    try { const p = essai(); if (fs.existsSync(path.join(p, '4.0.0_best_int'))) return p; } catch (_e) { /* essai suivant */ }
  }
  throw new Error('Dossier @tesseract.js-data/fra introuvable (npm install incomplet ?)');
}

function dossierPdfjs() {
  const p = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  return path.join(path.dirname(p), '..', '..');
}

async function ouvrirPdf(octets) {
  const racine = dossierPdfjs();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const tache = pdfjs.getDocument({
    data: octets.slice(),
    standardFontDataUrl: `${racine}/standard_fonts/`,
    wasmUrl: `${racine}/wasm/`,
  });
  const doc = await tache.promise;
  return {
    doc,
    page: await doc.getPage(1),
    fermer: () => doc.destroy(),
  };
}

async function rendrePng(vue, scale) {
  const vp = vue.page.getViewport({ scale });
  const cc = vue.doc.canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height));
  await vue.page.render({ canvasContext: cc.context, viewport: vp }).promise;
  return { png: Buffer.from(cc.canvas.toBuffer('image/png')), lPx: Math.ceil(vp.width), hPx: Math.ceil(vp.height) };
}

async function ocrPage(png, variante) {
  const { createWorker } = require('tesseract.js');
  const dossier = path.join(dossierFra(), variante);
  const worker = await createWorker('fra', 1, {
    langPath: dossier,
    cachePath: os.tmpdir(),
    gzip: true,
  });
  try {
    await worker.setParameters({ user_defined_dpi: String(DPI) });
    const t0 = performance.now();
    const { data } = await worker.recognize(png, {}, { text: true, blocks: true });
    const duree = (performance.now() - t0) / 1000;
    const lignes = lignesOCR(data.blocks);
    const mots = [];
    for (const ligne of lignes) for (const m of ligne.mots) mots.push(m.texte.trim());
    return { duree, lignes, mots, texteBrut: data.text || '' };
  } finally {
    await worker.terminate();
  }
}

function compterMotsCles(mots) {
  const vus = new Set(mots.map(norm).filter(Boolean));
  return MOTS_CLES.filter((m) => vus.has(m)).length;
}

test('prototype OCR : scan A4 300 dpi rendu interrogeable, tout local', async () => {
  const rapport = { etapes: {}, facteurs: { dpi: DPI } };

  // --- 1. Document source (vérité terrain : textes à position connue). ---
  const docSource = await PDFDocument.create();
  const pageSource = docSource.addPage([LARG_PT, HAUT_PT]);
  const policeTitre = await docSource.embedFont(StandardFonts.HelveticaBold);
  const policeTexte = await docSource.embedFont(StandardFonts.Helvetica);
  pageSource.drawText(TITRE, { x: X_TEXTE, y: Y_TITRE, size: 16, font: policeTitre, color: rgb(0, 0, 0) });
  PHRASES.forEach((p, i) => pageSource.drawText(p, {
    x: X_TEXTE, y: Y_PHRASE0 - i * ECART_Y, size: TAILLE_TEXTE, font: policeTexte, color: rgb(0, 0, 0),
  }));
  const octetsSource = await docSource.save();

  // Position attendue de la ligne repère (3e phrase).
  const yAttendu = Y_PHRASE0 - 2 * ECART_Y;

  // --- 2. Rasterisation 300 dpi puis « scan » (PDF image seule). ---
  const vueSource = await ouvrirPdf(octetsSource);
  const t0 = performance.now();
  const { png, lPx, hPx } = await rendrePng(vueSource, DPI / 72);
  rapport.etapes.rasterisation = (performance.now() - t0) / 1000;
  rapport.facteurs.image = `${lPx}x${hPx}px (${(png.length / 1024).toFixed(0)} Ko PNG)`;
  await vueSource.fermer();

  const docScan = await PDFDocument.create();
  const pageScan = docScan.addPage([LARG_PT, HAUT_PT]);
  pageScan.drawImage(await docScan.embedPng(png), { x: 0, y: 0, width: LARG_PT, height: HAUT_PT });
  const octetsScan = await docScan.save();

  const vueScan = await ouvrirPdf(octetsScan);
  const itemsAvant = await vueScan.page.getTextContent();
  assert.strictEqual(itemsAvant.items.length, 0,
    `le scan de départ doit être SANS texte extractible (reçu ${itemsAvant.items.length} élément(s))`);
  const pngAvant = Buffer.from((await rendrePng(vueScan, 1.5)).png);
  await vueScan.fermer();

  // --- 3. OCR français, hors ligne, deux variantes de modèle. ---
  const tesseract = require('tesseract.js');
  assert.ok(typeof tesseract.createWorker === 'function', 'tesseract.js présent');
  const partieInt = await ocrPage(png, '4.0.0_best_int');
  const partieBest = await ocrPage(png, '4.0.0');
  rapport.ocr = {
    best_int: { s: +partieInt.duree.toFixed(1), mots: partieInt.mots.length, cles: compterMotsCles(partieInt.mots) },
    best: { s: +partieBest.duree.toFixed(1), mots: partieBest.mots.length, cles: compterMotsCles(partieBest.mots) },
  };
  const trouveres = compterMotsCles(partieInt.mots);
  assert.ok(partieInt.lignes.length >= 3, `OCR best_int : ≥3 lignes attendues (reçu ${partieInt.lignes.length}). Texte brut : ${JSON.stringify(partieInt.texteBrut.slice(0, 400))}`);
  assert.ok(trouveres >= 14,
    `OCR best_int : ≥14 mots clés attendus (reçu ${trouveres}/20). Mots : ${JSON.stringify(partieInt.mots.slice(0, 60))}`);

  // --- 4. Couche invisible sur le scan. ---
  const policeHelv = await docScan.embedFont(StandardFonts.Helvetica);
  const t1 = performance.now();
  const { nbMots, cle } = poserCoucheInvisible(pageScan, policeHelv, partieInt.lignes, { largeurPx: lPx, hauteurPx: hPx });
  rapport.etapes.couche = (performance.now() - t1) / 1000;
  assert.ok(nbMots >= 20, `≥20 mots posés dans la couche (reçu ${nbMots})`);
  const octetsFinaux = await docScan.save();
  rapport.facteurs.sortie = `${(octetsFinaux.length / 1024).toFixed(0)} Ko PDF`;

  // --- 5a. Sonde : le canal d'extraction (pdf-lib ↔ pdf.js) lit-il un
  // texte VISIBLE créé par la même chaîne ? Distingue un défaut de
  // relecture d'un défaut d'injection dans la couche. ---
  const docSonde = await PDFDocument.create();
  const pageSonde = docSonde.addPage([320, 140]);
  pageSonde.drawText('SONDEALPHA', { x: 24, y: 70, size: 14, font: policeHelv, color: rgb(0, 0, 0) });
  const vueSonde = await ouvrirPdf(await docSonde.save());
  const itemsSonde = await vueSonde.page.getTextContent();
  await vueSonde.fermer();
  assert.ok(itemsSonde.items.some((i) => norm(i.str).includes('sondealpha')),
    `sonde : l'extraction doit lire un texte pdf-lib visible ; reçu ${JSON.stringify(itemsSonde.items.map((i) => i.str))}`);

  // --- 5b. Preuve par le flux : les opérateurs de la couche sont-ils
  // physiquement dans le PDF sauvé ? (content stream décompressé via pdf-lib) ---
  const docRelu = await PDFDocument.load(octetsFinaux);
  let flux = '';
  for (const [, objet] of docRelu.context.enumerateIndirectObjects()) {
    if (!(objet instanceof PDFRawStream)) continue;
    if (objet.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') continue; // le PNG du scan
    try {
      const s = decodePDFRawStream(objet);
      const octets = typeof s.decode === 'function' ? s.decode() : s.getBytes();
      flux += Buffer.from(octets).toString('latin1');
    } catch (_e) { /* flux non textuel : ignoré */ }
  }
  const nbBT = (flux.match(/BT\b/g) || []).length;
  const nbTd = (flux.match(/\bTd\b/g) || []).length;
  const nbTj = (flux.match(/\bTj\b/g) || []).length;
  const nbTr3 = (flux.match(/\b3 Tr\b/g) || []).length;
  NOTICE(`flux sauvé : BT=${nbBT}, Td=${nbTd}, Tj=${nbTj}, 3Tr=${nbTr3}, cle=${JSON.stringify(cle.toString())}`);
  assert.ok(nbBT >= 3 && nbTj >= nbMots && nbTr3 >= 3,
    `les opérateurs posés doivent être dans le PDF sauvé : BT=${nbBT}, Td=${nbTd}, Tj=${nbTj} (attendus ≥${nbMots}), `
    + `3Tr=${nbTr3}; extrait du flux : « ${flux.replace(/[^\x20-\x7e]/g, '.').slice(-800)} »`);

  // --- 5c. Relecture : les mots du scan sont désormais extractibles. ---
  // pdf.js fusionne en un item les mots posés sur une même ligne : les
  // vérifications portent donc sur le TEXTE ASSEMBLÉ (espaces conservés =
  // mots posés à des positions distinctes) et sur la position de l'item.
  const vueApres = await ouvrirPdf(octetsFinaux);
  const itemsApres = await vueApres.page.getTextContent();
  const apercuItems = JSON.stringify(itemsApres.items.slice(0, 8)
    .map((i) => ({ s: i.str, x: +i.transform[4].toFixed(1), y: +i.transform[5].toFixed(1) })));
  const texteApres = norm(itemsApres.items.map((i) => i.str).join(' '));
  const clesApres = MOTS_CLES.filter((m) => new RegExp(`\\b${m}\\b`).test(texteApres)).length;
  NOTICE(`couche : ${nbMots} mots posés (cle ${JSON.stringify(cle.toString())}), extraction ${itemsApres.items.length} items `
    + `dont mot clé ${clesApres}/${trouveres} ; échantillon ${apercuItems.slice(0, 220)}`);
  rapport.extraction = { items: itemsApres.items.length, cles: clesApres };
  assert.strictEqual(clesApres, trouveres,
    `les ${trouveres} mots clés reconnus doivent être extraits après pose (reçu ${clesApres}). `
    + `Items (${itemsApres.items.length}) : ${apercuItems.slice(0, 400)}`);
  const itemRepere = itemsApres.items.find((i) => new RegExp('\\bhabitants\\b').test(norm(i.str)));
  assert.ok(itemRepere, `le mot repère « habitants » doit figurer dans le texte extrait : ${apercuItems.slice(0, 400)}`);
  // L'item de ligne part du premier mot (« La ») : attendu à X_TEXTE, ligne 3.
  assert.ok(Math.abs(itemRepere.transform[4] - X_TEXTE) <= 25,
    `position x de la ligne repère : attendu ${X_TEXTE}±25, reçu ${itemRepere.transform[4].toFixed(1)}`);
  assert.ok(Math.abs(itemRepere.transform[5] - yAttendu) <= 20,
    `position y de la ligne repère : attendu ${yAttendu}±20, reçu ${itemRepere.transform[5].toFixed(1)}`);
  // Preuve d'espacement mot à mot : pdf.js n'insère des espaces que si les
  // mots posés sont réellement écartés sur la ligne.
  assert.ok(/ population francaise /.test(texteApres),
    `les mots doivent être posés écartés (« population française » espacé attendu) : « ${texteApres.slice(0, 300)} »`);

  // Invisibilité : le raster (1,5x) doit être IDENTIQUE avant/après couche.
  const pngApres = Buffer.from((await rendrePng(vueApres, 1.5)).png);
  await vueApres.fermer();
  if (!pngAvant.equals(pngApres)) {
    let i = 0;
    while (i < pngAvant.length && pngAvant[i] === pngApres[i]) i += 1;
    assert.fail(`la couche doit être invisible : rasters pré/post différents dès l'octet ${i}/${pngAvant.length}`);
  }

  // --- 6. Publication du rapport et de l'échantillon. ---
  const dirSortie = path.join(__dirname, '..', 'sortir');
  fs.mkdirSync(dirSortie, { recursive: true });
  fs.writeFileSync(path.join(dirSortie, 'scan-ocr.pdf'), octetsFinaux);
  rapport.calculs = {
    motsCles: `${trouveres}/${MOTS_CLES.length}`,
    tempsTotalS: +(rapport.etapes.rasterisation + partieInt.duree + partieBest.duree
      + rapport.etapes.couche).toFixed(1),
  };
  fs.writeFileSync(path.join(dirSortie, 'rapport-ocr.json'), JSON.stringify(rapport, null, 2));
  NOTICE(`faisabilité confirmée : scan A4 ${DPI} dpi, OCR fr best_int ${partieInt.duree.toFixed(1)} s `
    + `(${partieInt.mots.length} mots, ${trouveres}/${MOTS_CLES.length} clés), best ${partieBest.duree.toFixed(1)} s `
    + `(${compterMotsCles(partieBest.mots)} clés), couche invisible ${nbMots} mots, rasters identiques, total `
    + `${rapport.calculs.tempsTotalS} s, sortie ${rapport.facteurs.sortie}`);
});
