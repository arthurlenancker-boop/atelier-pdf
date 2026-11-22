// v0.1.31 : moteur pur du texte riche (engine/markup.js).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  echapperTexte, decoderEntites, analyserSource, composerLignesRiche,
} = require('../engine/markup.js');

function uneSource(parts) {
  return typeof parts === 'string' ? parts : parts.join('');
}

test('analyserSource : texte nu devient un paragraphe, sauts de ligne compris', () => {
  const b = analyserSource('Première ligne\nSeconde ligne');
  assert.strictEqual(b.length, 2);
  assert.deepStrictEqual(b.map((x) => x.type), ['p', 'p']);
  assert.strictEqual(b[0].runs[0].texte, 'Première ligne');
  assert.strictEqual(b[1].runs[0].texte, 'Seconde ligne');
  assert.deepStrictEqual(b[0].runs[0].styles, {});
});

test('analyserSource : les balises en ligne portent leurs styles', () => {
  const b = analyserSource('<b>G</b>, <i>I</i>, <u>S</u>, <s>B</s>, x<sup>2</sup>, x<sub>1</sub>');
  assert.strictEqual(b.length, 1);
  const parStyles = new Map(b[0].runs.map((r) => [r.texte, r.styles]));
  assert.deepStrictEqual(parStyles.get('G'), { gras: true });
  assert.deepStrictEqual(parStyles.get('I'), { italique: true });
  assert.deepStrictEqual(parStyles.get('S'), { souligne: true });
  assert.deepStrictEqual(parStyles.get('B'), { barre: true });
  assert.deepStrictEqual(parStyles.get('2'), { sup: true });
  assert.deepStrictEqual(parStyles.get('1'), { sub: true });
  assert.deepStrictEqual(parStyles.get(', '), {});
});

test('analyserSource : spans de couleur et de fond, imbriqués', () => {
  const b = analyserSource('<span style="color:#D13438">rouge <span style="background-color:#FFDF3A">sur fond</span></span>');
  const rs = b[0].runs;
  assert.strictEqual(rs[0].texte, 'rouge ');
  assert.strictEqual(rs[0].styles.couleur, '#d13438');
  assert.strictEqual(rs[1].texte, 'sur fond');
  assert.strictEqual(rs[1].styles.couleur, '#d13438', 'le rouge traverse le fond');
  assert.strictEqual(rs[1].styles.fond, '#ffdf3a');
});

test('analyserSource : alignements, listes et numéros', () => {
  const b = analyserSource(uneSource([
    '<div style="text-align: center">centre</div>',
    '<div style="text-align: right">droite</div>',
    '<ul><li>un</li><li>deux</li></ul>',
    '<ol><li>premier</li><li>second</li></ol>',
  ]));
  assert.deepStrictEqual(b.map((x) => [x.type, x.align, x.numero]), [
    ['p', 'centre', 0], ['p', 'droite', 0],
    ['puce', 'gauche', 0], ['puce', 'gauche', 0],
    ['num', 'gauche', 1], ['num', 'gauche', 2],
  ]);
});

test('analyserSource : formules $...$ hors des balises, dollars nus littéraux', () => {
  const b = analyserSource('a $x^2$ b, prix : 5 $ seul');
  const rs = b[0].runs;
  assert.strictEqual(rs[1].type, 'formule');
  assert.strictEqual(rs[1].valeur, 'x^2');
  const texteTout = rs.filter((r) => r.type === 'texte').map((r) => r.texte).join('');
  assert.ok(texteTout.includes('5 $ seul'), 'le dollar isolé reste littéral');
  // La mise en forme traverse la formule très bien : le $ ouvre et ferme.
  const c = analyserSource('<b>gras $y$ suites</b>');
  assert.strictEqual(c[0].runs[0].texte, 'gras ');
  assert.strictEqual(c[0].runs[1].type, 'formule');
  assert.strictEqual(c[0].runs[1].valeur, 'y');
  assert.strictEqual(c[0].runs[2].texte, ' suites');
  assert.ok(c[0].runs[2].styles.gras);
});

test('analyserSource : entités et balises inconnues', () => {
  const b = analyserSource('a &amp; b &lt;note&gt; <marquee>x</marquee>');
  const tout = b.map((x) => x.runs.map((r) => r.texte).join('')).join('');
  assert.ok(tout.includes('a & b <note>'));
  assert.ok(tout.includes('<marquee>'), 'balise hors sous-ensemble : littérale');
});

test('analyserSource : source vide, bloc vide et <br>', () => {
  assert.deepStrictEqual(analyserSource(''), [{ type: 'p', numero: 0, align: 'gauche', runs: [] }]);
  const b = analyserSource('<div></div>texte');
  assert.strictEqual(b.length, 2);
  assert.deepStrictEqual(b[0].runs, [], 'bloc vide conservé (ligne blanche)');
  assert.strictEqual(b[1].runs[0].texte, 'texte');
  const c = analyserSource('<div>a<br>b</div>');
  assert.strictEqual(c.length, 2);
  assert.strictEqual(c[0].runs[0].texte, 'a');
  assert.strictEqual(c[1].runs[0].texte, 'b');
});

test('échappement : aller-retour des cinq entités canoniques', () => {
  assert.strictEqual(echapperTexte('a<b>&'), 'a&lt;b&gt;&amp;');
  assert.strictEqual(decoderEntites(echapperTexte('leur < texte & celui-là >')), 'leur < texte & celui-là >');
  assert.strictEqual(decoderEntites('a&nbsp;b'), 'a b');
});

/* ————— Composition des lignes ————— */

const mes5 = () => (styles, t) => t.length * 5;
const dimsNulles = () => ({ widthPt: 0, heightPt: 0, depthPt: 0 });

test('composerLignesRiche : retour à la ligne aux espaces, mots insécables', () => {
  const b = analyserSource('aa bb ccc');
  const c = composerLignesRiche(b, { mesurer: mes5(), dimsFormule: dimsNulles(), largeurMax: 40, fontSize: 11 });
  assert.deepStrictEqual(c.lignes.map((l) => l.morceaux.map((m) => m.texte)),
    [['aa bb'], ['ccc']]);
  assert.strictEqual(c.lignes[0].debutBloc, true);
  assert.strictEqual(c.lignes[1].debutBloc, false, 'second ligne du MÊME bloc');
});

test('composerLignesRiche : mot trop large coupé caractère par caractère', () => {
  const b = analyserSource('aaaaaaaaaaaa');
  const c = composerLignesRiche(b, { mesurer: mes5(), dimsFormule: dimsNulles(), largeurMax: 21, fontSize: 11 });
  assert.deepStrictEqual(c.lignes.map((l) => l.morceaux.map((m) => m.texte).join('')),
    ['aaaa', 'aaaa', 'aaaa']);
});

test('composerLignesRiche : la formule est insécable et règle la hauteur', () => {
  const b = analyserSource('debut $F$ fin');
  const c = composerLignesRiche(b, {
    mesurer: mes5(),
    dimsFormule: () => ({ widthPt: 50, heightPt: 14, depthPt: 5 }),
    largeurMax: 50, fontSize: 11,
  });
  assert.deepStrictEqual(c.lignes.map((l) => l.morceaux.map((m) => m.texte || `\$${m.valeur}\$`)),
    [['debut'], ['$F$'], ['fin']]);
  const lf = c.lignes[1].morceaux[0];
  assert.strictEqual(lf.largeur, 50);
  assert.ok(Math.abs(lf.hDessus - 9) < 1e-9);
  assert.strictEqual(lf.hDes, 5);
  assert.ok(Math.abs(c.lignes[1].hDessus - 9) < 1e-9, 'la ligne prend la hauteur de la formule');
});

test('composerLignesRiche : retrait des listes sur toutes les lignes', () => {
  const b = analyserSource('<ul><li>element de liste assez long</li></ul>');
  const c = composerLignesRiche(b, { mesurer: mes5(), dimsFormule: dimsNulles(), largeurMax: 40, fontSize: 11 });
  // largeur utile = 40 - retrait (14.3) ; chaque ligne est indentée.
  const utile = 40 - c.retraitListe;
  for (const l of c.lignes) {
    assert.strictEqual(l.type, 'puce');
    assert.ok(l.w <= utile + 1e-9, `largeur ${l.w} dans la zone indentée`);
  }
  assert.strictEqual(c.lignes[0].debutBloc, true);
  assert.strictEqual(c.lignes[1].debutBloc, false);
});

test('composerLignesRiche : morceaux de styles identiques fusionnés, décorations respectées', () => {
  const b = analyserSource('<b>gras </b><b>toujours</b> puis <u>soul</u><u>igné</u>');
  const c = composerLignesRiche(b, { mesurer: mes5(), dimsFormule: dimsNulles(), largeurMax: 500, fontSize: 11 });
  const m = c.lignes[0].morceaux;
  assert.strictEqual(m.length, 3, 'runs gras fusionnés, runs soulignés fusionnés');
  assert.strictEqual(m[0].texte, 'gras toujours');
  assert.strictEqual(m[1].texte, ' puis');
  assert.strictEqual(m[2].texte, ' souligné');
  assert.strictEqual(m[0].styles.gras, true);
  assert.strictEqual(m[2].styles.souligne, true);
});

test('composerLignesRiche : alignements portés par les lignes', () => {
  const b = analyserSource('<div style="text-align: center">centre</div>');
  const c = composerLignesRiche(b, { mesurer: mes5(), dimsFormule: dimsNulles(), largeurMax: 100, fontSize: 11 });
  assert.strictEqual(c.lignes[0].align, 'centre');
  assert.strictEqual(c.lignes[0].type, 'p');
});
