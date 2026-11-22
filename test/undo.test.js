// v0.1.13 : le rejeu d'annulation — le cœur métier de Ctrl+Z.
// CI SEULEMENT : exige pdf-lib et mathjax-full (jamais installés localement).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { PDFDocument } = require('pdf-lib');

const { openPdf, savePdf } = require('../engine/pdfio.js');
const { createSession } = require('../engine/session.js');
const { rejouer, rejouerPrefixeSain } = require('../engine/undo.js');
const { PREFIXE_FICHE_MIXTE } = require('../engine/texte.js');

/** Empreinte lisible d'une annotation : subtype, sujet, contenu tronqué, rect. */
function signature(a) {
  return [
    a.subtype,
    a.subject || '',
    String(a.contents || '').slice(0, 40),
    a.rect.map((v) => Math.round(v * 10) / 10),
  ].join(' | ');
}

async function neuf() {
  const doc0 = await PDFDocument.create();
  doc0.addPage([595, 842]);
  const octets = await savePdf(doc0);
  const doc = await openPdf(new Uint8Array(octets));
  const session = createSession(doc);
  return { octets, session };
}

/** Applique un lot d'éditions, l'enregistre TEL QUEL comme un geste rejouable. */
async function geste(session, gestes, edits) {
  for (const edit of edits) await session.apply(edit);
  gestes.push(edits.map((e) => JSON.parse(JSON.stringify(e))));
}

test('rejouer : six gestes variés reproduisent la session au complet', async () => {
  const { octets, session } = await neuf();
  const gestes = [];

  await geste(session, gestes, [{ kind: 'highlight', pageIndex: 0,
    args: { rect: [50, 700, 300, 720], quadPoints: [[50, 720, 300, 720, 50, 700, 300, 700]] } }]);
  await geste(session, gestes, [{ kind: 'square', pageIndex: 0,
    args: { rect: [100, 400, 300, 500] } }]);
  await geste(session, gestes, [{ kind: 'freeText', pageIndex: 0,
    args: { rect: [200, 300, 440, 324], text: 'Note initiale', subject: 'Note' } }]);
  // Geste 4 : fiche mixte, ASYNCHRONE (embedFont de pdf-lib).
  await geste(session, gestes, [{ kind: 'ficheMelangee', pageIndex: 0,
    args: { rect: [100, 600, 360, 660], source: 'Quelque $x$ fin', fontSize: 11 } }]);

  // Geste 5 : CORRECTION de la note = retrait + repose, UN SEUL geste.
  const note = session.listAnnots().find((a) => a.subtype === 'FreeText'
    && a.subject === 'Note');
  assert.ok(note, 'la note initiale est posée');
  const noteRef = { objectNumber: note.ref.objectNumber,
    generationNumber: note.ref.generationNumber }; // réf IPC sérialisée
  await geste(session, gestes, [
    { kind: 'remove', pageIndex: 0, args: { ref: noteRef } },
    { kind: 'freeText', pageIndex: 0,
      args: { rect: [200, 300, 440, 326], text: 'Note corrigée', subject: 'Note' } },
  ]);

  // Geste 6 : déplacement de la fiche mixte (réf sérialisée aussi).
  const fiche = session.listAnnots().find((a) => (a.contents || '')
    .startsWith(PREFIXE_FICHE_MIXTE));
  assert.ok(fiche, 'la fiche mixte est posée');
  const ficheRef = { objectNumber: fiche.ref.objectNumber,
    generationNumber: fiche.ref.generationNumber };
  await geste(session, gestes, [{ kind: 'deplacer', pageIndex: 0,
    args: { ref: ficheRef, dx: 40, dy: -20 } }]);

  const directes = session.listAnnots().map(signature);
  assert.strictEqual(directes.length, 4, 'quatre annotations après les six gestes');

  const r1 = await rejouer(octets, gestes);
  const rejouees = r1.session.listAnnots().map(signature);
  assert.deepStrictEqual(rejouees, directes,
    'le rejeu complet reproduit la session EXACTEMENT (ordre, contenus, rects)');
  // Le journal compte une entrée par ÉDITION : les six gestes en comptent
  // sept, la correction du geste 5 étant un lot « retrait + repose ».
  assert.strictEqual(r1.session.edits().length, 7,
    'le journal du rejeu compte chaque édition des six gestes');

  // Annuler le déplacement : la fiche revient à son rectangle d'origine.
  const r2 = await rejouer(octets, gestes.slice(0, 5));
  const sansDeplace = r2.session.listAnnots().find((a) => (a.contents || '')
    .startsWith(PREFIXE_FICHE_MIXTE));
  assert.ok(sansDeplace.rect[0] === 100,
    'annuler le déplacement remet la fiche à son rectangle posé');

  // Annuler la correction : la repose disparaît, l'originale est INTACTE,
  // il ne reste qu'un seul bloc de note.
  const r3 = await rejouer(octets, gestes.slice(0, 4));
  const blocs = r3.session.listAnnots().filter((a) => a.subject === 'Note');
  assert.strictEqual(blocs.length, 1, 'la correction annulée ne laisse qu\u2019une note');
  assert.strictEqual(blocs[0].contents, 'Note initiale',
    'l\u2019original survit à l\u2019annulation de sa correction');
});

test('rejouer : une édition inconnue lève avec sa sorte, sans état à moitié consommé', async () => {
  const { octets } = await neuf();
  await assert.rejects(
    () => rejouer(octets, [[{ kind: 'sorteInconnue', pageIndex: 0, args: {} }]]),
    /inconnue/,
  );
});

test('rejouer : gestes vides = document original intact', async () => {
  const { octets } = await neuf();
  const r = await rejouer(octets, []);
  assert.strictEqual(r.session.listAnnots().length, 0);
  assert.strictEqual(r.session.edits().length, 0);
});

test('rejouerPrefixeSain : journal sain = tout rejoué, rien d’abandonné', async () => {
  const { octets, session } = await neuf();
  const gestes = [];
  await geste(session, gestes, [{ kind: 'square', pageIndex: 0, args: { rect: [10, 500, 100, 550] } }]);
  await geste(session, gestes, [{ kind: 'square', pageIndex: 0, args: { rect: [10, 400, 100, 450] } }]);
  const avant = session.listAnnots().map(signature);
  const r = await rejouerPrefixeSain(octets, gestes);
  assert.strictEqual(r.rejoues, 2, 'le journal complet est rejoué');
  assert.deepStrictEqual(r.abandonnes, [], 'aucun geste abandonné');
  assert.deepStrictEqual(r.session.listAnnots().map(signature), avant);
});

test('rejouerPrefixeSain : journal désynchronisé = assaini par la fin, jamais bloquant', async () => {
  // Retour d'Arthur : « j'ai trop cette erreur pour bien travailler ».
  // Une course entre deux annulations décale le journal : une référence
  // pointe vers un objet inexistant au milieu du journal. Le rejeu strict
  // échoue pour TOUJOURS ; l'assainissement dépaie par la fin jusqu'au
  // dernier préfixe rejouable et rend la main à l'utilisateur.
  const { octets, session } = await neuf();
  const gestes = [];
  await geste(session, gestes, [{ kind: 'square', pageIndex: 0, args: { rect: [10, 500, 100, 550] } }]);
  await geste(session, gestes, [{ kind: 'square', pageIndex: 0, args: { rect: [10, 400, 100, 450] } }]);
  await geste(session, gestes, [{ kind: 'square', pageIndex: 0, args: { rect: [10, 300, 100, 350] } }]);
  const carres = session.listAnnots().filter((a) => a.subtype === 'Square');
  assert.strictEqual(carres.length, 3);
  // Le geste 4 se réfère à un objet qui n'existera PAS au rejeu (une
  // référence qui a dérivé d'un numéro d'objet, symptôme exact d'Arthur).
  // La derive n'est PAS rejouable en direct : inscription au journal sans
  // application directe (comme si la reference du geste avait bougé).
  gestes.push(JSON.parse(JSON.stringify([{ kind: 'deplacer', pageIndex: 0,
    args: { ref: { objectNumber: 4242, generationNumber: 0 }, dx: 5, dy: 5 } }])));
  await geste(session, gestes, [{ kind: 'square', pageIndex: 0, args: { rect: [10, 200, 100, 250] } }]);
  await assert.rejects(() => rejouer(octets, gestes), /introuvable/,
    'le rejeu strict échoue bien sur le geste décalé');
  const r = await rejouerPrefixeSain(octets, gestes);
  assert.strictEqual(r.rejoues, 3,
    'le dernier préfixe cohérent s’arrête AVANT le geste décalé');
  assert.strictEqual(r.abandonnes.length, 2,
    'le geste décalé et son successeur sont abandonnés (travail postérieur à la dérive)');
  const rejouees = r.session.listAnnots().filter((a) => a.subtype === 'Square');
  assert.strictEqual(rejouees.length, 3, 'les trois cadres cohérents sont là');
  rejouees.forEach((a, k) => assert.deepStrictEqual(a.rect, carres[k].rect,
    'les cadres conservent le rectangle du préfixe sain'));
});

test('rejouerPrefixeSain : document illisible = l’erreur d’ouverture remonte', async () => {
  await assert.rejects(() => rejouerPrefixeSain(new Uint8Array([1, 2, 3]), []), /PDF/);
});
