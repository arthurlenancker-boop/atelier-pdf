// v0.1.38 : le VRAI texte d'une page, lu pour la correction fidèle au
// document (engine/textereel.js). Moteur PUR : aucun pdf-lib requis, les
// items sont façonnés à la Mimile de ceux de pdf.js (transform en espace
// utilisateur, origine en bas à gauche).
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  tailleDItem, familleDeStyle, grasDeStyle,
  selectionnerItemsDans, regrouperEnLignes, analyserItemsTexte,
} = require('../engine/textereel.js');

/* Un fragment pdf.js : {str, transform [a,b,c,d,e,f], width, fontName}. */
function item(str, x, base, taille, fontName, width) {
  return {
    str,
    transform: [taille, 0, 0, taille, x, base],
    width: width ?? str.length * taille * 0.5,
    fontName: fontName ?? 'f1',
    height: taille,
  };
}

test('familleDeStyle : « sans-serif » est tranché SANS avant « serif »', () => {
  assert.strictEqual(familleDeStyle({ fontFamily: 'sans-serif' }), 'sans',
    '« sans-serif » CONTIENT « serif » : l\'ordre des tests est le contrat');
  assert.strictEqual(familleDeStyle({ fontFamily: 'serif' }), 'serif');
  assert.strictEqual(familleDeStyle({ fontFamily: 'Times New Roman' }), 'serif');
  assert.strictEqual(familleDeStyle({ fontFamily: 'Helvetica' }), 'sans');
  assert.strictEqual(familleDeStyle(null), 'sans', 'sans style, repli sans empattement');
  assert.strictEqual(familleDeStyle({ fontFamily: 'monospace' }), 'sans');
});

test('grasDeStyle : au mieux du style (souvent muet : repli faux)', () => {
  assert.strictEqual(grasDeStyle({ fontWeight: 700 }), true);
  assert.strictEqual(grasDeStyle({ fontWeight: 400 }), false);
  assert.strictEqual(grasDeStyle({ fontFamily: 'Times New Roman, Bold' }), true);
  assert.strictEqual(grasDeStyle({ fontFamily: 'Times New Roman' }), false);
  assert.strictEqual(grasDeStyle(null), false);
});

test('tailleDItem : l\'échelle verticale du transform, sinon height', () => {
  assert.strictEqual(tailleDItem(item('a', 0, 0, 12)), 12);
  assert.strictEqual(tailleDItem({ str: 'a', height: 9, transform: [] }), 9);
  assert.strictEqual(tailleDItem({ str: '' }), 0);
});

test('selectionnerItemsDans : la garde verticale accepte les lignes qui débordent', () => {
  const items = [
    item('Bonjour', 80, 700, 11),
    item('Monde', 80, 660, 11), // une ligne plus bas, hors du rectangle
    item('Étroit', 500, 700, 11), // trop à droite
  ];
  const dans = selectionnerItemsDans(items, [80, 690, 420, 712]);
  assert.strictEqual(dans.length, 1);
  assert.strictEqual(dans[0].str, 'Bonjour');
  // Le fragment qui déborde de HUIT points reste retenu (garde 0,65 corps).
  const dans2 = selectionnerItemsDans([item('Titre', 80, 704, 12)], [80, 690, 420, 712]);
  assert.strictEqual(dans2.length, 1, 'la base au-dessus du rectangle reste dans la garde');
  assert.strictEqual(selectionnerItemsDans(null, [0, 0, 1, 1]).length, 0);
});

test('regrouperEnLignes : mêmes bases ensemble, espaces recollés, tri par x', () => {
  const items = [
    item('le ', 100, 700, 11, 'f1', 12),
    item('monde', 120, 700, 11, 'f1', 30),
    item('Bon', 80, 700, 11, 'f1', 18),
    item('seconde ligne', 80, 674, 11, 'f1', 70),
  ];
  const lignes = regrouperEnLignes(items);
  assert.strictEqual(lignes.length, 2, 'deux lignes réelles');
  assert.strictEqual(lignes[0].texte, 'Bon le monde',
    'les fragments proches se recollent, les espaces lavées');
  assert.strictEqual(lignes[1].texte, 'seconde ligne');
});

test('analyserItemsTexte : source, taille dominante, famille au poids du texte', () => {
  const items = [
    item('Un titre en Times', 80, 700, 16, 'f-serif'),
    item('Texte ordinaire assez long pour peser plus que le titre.', 80, 674, 11, 'f-serif'),
  ];
  const styles = {
    'f-serif': { fontFamily: 'Times New Roman, serif' },
    'f-sans': { fontFamily: 'Helvetica, sans-serif' },
  };
  const rep = analyserItemsTexte(items, styles, [70, 660, 500, 720]);
  assert.ok(rep, 'la zone porte du vrai texte');
  assert.strictEqual(rep.source, 'Un titre en Times\nTexte ordinaire assez long pour peser plus que le titre.');
  assert.strictEqual(rep.taille, 11, 'la taille DOMINANTE (au poids du texte) gagne');
  assert.strictEqual(rep.famille, 'serif');
  assert.strictEqual(rep.gras, false);
  assert.ok(rep.rect[0] <= 80 && rep.rect[2] >= 80, 'le rectangle réel couvre l\'encre');
});

test('analyserItemsTexte : null quand la zone ne porte aucun vrai texte', () => {
  assert.strictEqual(analyserItemsTexte([], {}, [0, 0, 100, 100]), null);
  assert.strictEqual(analyserItemsTexte(null, null, [0, 0, 100, 100]), null);
  // Un scan : la page entière est muette, la reconnaissance garde son rôle.
  assert.strictEqual(analyserItemsTexte([item('loin', 400, 100, 12)], {}, [50, 600, 300, 700]), null);
});
