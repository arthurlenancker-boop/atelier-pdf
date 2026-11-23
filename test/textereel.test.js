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
  ligneAuPoint, zoneDeLigne,
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

/* v0.1.41 : l'outil Modifier clique dans une phrase — le moteur PUR
   doit dire QUELLE ligne vit sous le point, puis décrire la zone de
   CETTE ligne seule (source, taille, famille, gras, rectangle). */

test('ligneAuPoint : la ligne sous le point, à la bande verticale près', () => {
  const items = [
    item('Bonjour', 80, 700, 11),
    item('Monde', 130, 700, 11),
    item('Second', 80, 660, 11),
  ];
  // (100, 699) : dans la bande ET dans l'encre de la première ligne.
  const l1 = ligneAuPoint(items, 100, 699);
  assert.ok(l1);
  assert.strictEqual(l1.texte, 'Bonjour Monde');
  // La bande de la ligne 2 : [656,48 ; 669,02] ; (80, 672) est juste AU-
  // DESSUS, à moins d'un demi-corps : c'est la ligne 2 qui l'emporte.
  const l2 = ligneAuPoint(items, 80, 672);
  assert.ok(l2);
  assert.strictEqual(l2.texte, 'Second');
  // (120, 700) : entre les fragments, DANS la ligne (l'encre couve).
  const l3 = ligneAuPoint(items, 120, 700);
  assert.ok(l3);
  assert.strictEqual(l3.texte, 'Bonjour Monde');
  // Fin de ligne : cliquer un peu APRÈS le dernier mot reste dans la
  // ligne (marge max(10 ; 1,5·t) = 16,5 pt ici).
  const l4 = ligneAuPoint(items, 157.5 + 8, 700);
  assert.ok(l4);
  assert.strictEqual(l4.texte, 'Bonjour Monde');
});

test('ligneAuPoint : null dans les marges — rien n’y est éditable', () => {
  const items = [
    item('Bonjour', 80, 700, 11),
    item('Second', 80, 660, 11),
  ];
  // Loin SOUS la dernière ligne : plus d'un demi-corps de la bande.
  assert.strictEqual(ligneAuPoint(items, 90, 620), null);
  // Loin à DROITE de l'encre : au-delà de la marge de fin de ligne.
  assert.strictEqual(ligneAuPoint(items, 300, 700), null);
  // Page muette ou entrée cassée : null, jamais d'exception.
  assert.strictEqual(ligneAuPoint([], 100, 700), null);
  assert.strictEqual(ligneAuPoint(null, 100, 700), null);
  assert.strictEqual(ligneAuPoint(items, Number.NaN, 700), null);
});

test('zoneDeLigne : la zone d’UNE ligne, sans y fusionner les voisines', () => {
  const items = [
    item('Un titre', 80, 700, 16, 'f-serif'),
    item('ordinaire', 80, 674, 11, 'f-sans'),
  ];
  const styles = {
    'f-serif': { fontFamily: 'Times New Roman, serif' },
    'f-sans': { fontFamily: 'Helvetica, sans-serif' },
  };
  const l = ligneAuPoint(items, 100, 699);
  assert.ok(l);
  const z = zoneDeLigne(l, styles);
  assert.ok(z);
  assert.strictEqual(z.source, 'Un titre', 'UNE ligne, pas le paragraphe');
  assert.strictEqual(z.taille, 16, 'la taille mesurée sur place');
  assert.strictEqual(z.famille, 'serif');
  assert.strictEqual(z.gras, false);
  assert.ok(Math.abs(z.rect[0] - 80) < 0.01, 'le rectangle part de l’encre');
  assert.ok(Math.abs(z.rect[1] - (700 - 16 * 0.32)) < 0.01, 'bande basse idem analyserItemsTexte');
  assert.ok(Math.abs(z.rect[3] - (700 + 16 * 0.82)) < 0.01, 'bande haute idem analyserItemsTexte');
  // Ligne vide ou entrée absente : null.
  assert.strictEqual(zoneDeLigne(null, styles), null);
  assert.strictEqual(zoneDeLigne({ base: 700, taille: 11, texte: '', items: [] }, styles), null);
});
