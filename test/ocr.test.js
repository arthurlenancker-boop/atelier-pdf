// test/ocr.test.js — v0.1.22 : tests PURS de engine/ocr.js (aucune dépendance,
// exécutables partout). La reconnaissance réelle (tesseract) est couverte par
// test/tesseract.test.js, exécuté en CI seulement.
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { borner, nettoyerCle, motsDepuisBlocs, extractionLatex, nettoyerUrlServeur, estHttpsLocal, latexDepuisReponseServeur, enteteJeton, messageErreurOcr, pageUrlDepuis, resumePage, reconnaissanceServeurActif } = require('../engine/ocr.js');

// ————— borner —————
test('borner borne un nombre dans l’intervalle', () => {
  assert.strictEqual(borner(-1, 0, 1), 0);
  assert.strictEqual(borner(2, 0, 1), 1);
  assert.strictEqual(borner(0.5, 0, 1), 0.5);
});

test('borner ramène une valeur non finie à la borne basse', () => {
  assert.strictEqual(borner(NaN, 0, 1), 0);
  assert.strictEqual(borner(undefined, 0, 1), 0);
});

// ————— nettoyerCle —————
test('nettoyerCle débarrasse les espaces et refuse les non-chaînes', () => {
  assert.strictEqual(nettoyerCle('  abc123  '), 'abc123');
  assert.strictEqual(nettoyerCle('   '), '');
  assert.strictEqual(nettoyerCle(42), '');
  assert.strictEqual(nettoyerCle(null), '');
  assert.strictEqual(nettoyerCle(undefined), '');
});

// ————— motsDepuisBlocs —————
// Réduction d'une sortie tesseract « blocks » à deux mots « SECOND »
// (gauche) et « DEGRE » (droite) sur une image 100×50.
function blocsBidons(bboxA, bboxB) {
  return [{
    paragraphs: [{
      lines: [{
        words: [
          { text: 'SECOND', bbox: bboxA },
          { text: 'DEGRE', bbox: bboxB },
        ],
      }],
    }],
  }];
}

test('motsDepuisBlocs convertit les boîtes en fractions de page', () => {
  const mots = motsDepuisBlocs(blocsBidons({ x0: 10, y0: 5, x1: 40, y1: 15 }, { x0: 50, y0: 5, x1: 90, y1: 15 }), 100, 50);
  assert.strictEqual(mots.length, 2);
  assert.deepStrictEqual(mots[0], { t: 'SECOND', x: 0.1, y: 0.1, w: 0.3, h: 0.2 });
  assert.deepStrictEqual(mots[1], { t: 'DEGRE', x: 0.5, y: 0.1, w: 0.4, h: 0.2 });
});

test('motsDepuisBlocs borne les débordements et ignore les mots vides', () => {
  const mots = motsDepuisBlocs(blocsBidons({ x0: -3, y0: 48, x1: 120, y1: 60 }, { x0: 0, y0: 0, x1: 10, y1: 10 }), 100, 50);
  const par = (t) => mots.find((m) => m.t === t);
  // Premier mot : tout déborde → x, y et w bornés (la hauteur reste
  // honnête, 0.24 ; la couche de texte la découpe à la page).
  assert.deepStrictEqual(par('SECOND'), { t: 'SECOND', x: 0, y: 0.96, w: 1, h: 0.24 });
  assert.deepStrictEqual(par('DEGRE'), { t: 'DEGRE', x: 0, y: 0, w: 0.1, h: 0.2 });
});

test('motsDepuisBlocs survit à une entrée vide ou tordue', () => {
  assert.deepStrictEqual(motsDepuisBlocs(null, 100, 50), []);
  assert.deepStrictEqual(motsDepuisBlocs([], 100, 50), []);
  const mots = motsDepuisBlocs([
    { paragraphs: null },
    { paragraphs: [{ lines: [{ words: [{ text: '  ', bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } }] }] }] },
    { paragraphs: [{ lines: [{ words: [{ text: 'OK', bbox: null }] }] }] },
  ], 100, 50);
  assert.strictEqual(mots.length, 0); // texte blanc et boîte absente : rien
  // Dimensions invalides : pas de division par zéro.
  const motsDeux = motsDepuisBlocs(blocsBidons({ x0: 0, y0: 0, x1: 50, y1: 25 }, { x0: 60, y0: 0, x1: 90, y1: 25 }), 0, 0);
  assert.strictEqual(motsDeux.length, 2);
});

test('motsDepuisBlocs trie en ordre de lecture, y puis x', () => {
  const blocs = [{
    paragraphs: [{
      lines: [
        { words: [{ text: 'DEGRE', bbox: { x0: 50, y0: 10, x1: 90, y1: 15 } }] },
        { words: [{ text: 'SECOND', bbox: { x0: 10, y0: 10, x1: 40, y1: 15 } }] },
      ],
    }],
  }];
  const mots = motsDepuisBlocs(blocs, 100, 50);
  assert.strictEqual(mots[0].t, 'SECOND');
  assert.strictEqual(mots[1].t, 'DEGRE');
});

// ————— extractionLatex —————
test('extractionLatex cueille un bloc $$…$$ sans les dollars', () => {
  const md = 'Texte avant\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\nTexte après';
  assert.strictEqual(extractionLatex(md), 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
});

test('extractionLatex cueille les $…$ inline appariés', () => {
  const md = 'Le discriminant $\\Delta = b^2 - 4ac$ est positif, donc $x_1 \\ne x_2$.';
  assert.strictEqual(extractionLatex(md), '\\Delta = b^2 - 4ac\nx_1 \\ne x_2');
});

test('extractionLatex mêle $$…$$ et $…$ dans l’ordre du texte, puis de la cueillette', () => {
  const md = 'Si $a > 0$ alors\n\n$$f(x) = ax^2 + bx + c$$\n\nde maximum atteint. Cout $5 \\euro$.';
  const sortie = extractionLatex(md);
  assert.ok(sortie.includes('a > 0'));
  assert.ok(sortie.includes('f(x) = ax^2 + bx + c'));
  assert.ok(sortie.includes('5 \\euro'));
  assert.ok(!sortie.includes('$')); // aucune godille ne doit survivre
});

test('extractionLatex ignore les dollars non appariés et les formules vides', () => {
  assert.strictEqual(extractionLatex('Il coûte 5\\$ et $ $ rien.'), null);
  assert.strictEqual(extractionLatex('Pas de formule ici.'), null);
  assert.strictEqual(extractionLatex('$$$$'), null);
  assert.strictEqual(extractionLatex(42), null);
});

test('extractionLatex ne recolle pas les restes des blocs $$ déjà cueillis', () => {
  const md = '$$x^2$$ et $y^2$';
  const sortie = extractionLatex(md);
  assert.strictEqual(sortie, 'x^2\ny^2');
});

// ————— v0.1.23 : nettoyerUrlServeur —————
test('nettoyerUrlServeur accepte une URL http ou https et retire espaces et barres finales', () => {
  assert.strictEqual(nettoyerUrlServeur('http://127.0.0.1:8642/ocr'), 'http://127.0.0.1:8642/ocr');
  assert.strictEqual(nettoyerUrlServeur('  http://127.0.0.1:8642/ocr/  '), 'http://127.0.0.1:8642/ocr');
  assert.strictEqual(nettoyerUrlServeur('https://100.101.102.103:8642/ocr'), 'https://100.101.102.103:8642/ocr');
  assert.strictEqual(nettoyerUrlServeur('http://mon-pc.tail*****.ts.net:8642/ocr'), 'http://mon-pc.tail*****.ts.net:8642/ocr');
});

test('nettoyerUrlServeur refuse tout ce qui n’est pas une URL http(s) nette', () => {
  assert.strictEqual(nettoyerUrlServeur('ftp://127.0.0.1:8642/ocr'), '');
  assert.strictEqual(nettoyerUrlServeur('127.0.0.1:8642'), '');
  assert.strictEqual(nettoyerUrlServeur('http:// pas d espace.fr'), '');
  assert.strictEqual(nettoyerUrlServeur('   '), '');
  assert.strictEqual(nettoyerUrlServeur(''), '');
  assert.strictEqual(nettoyerUrlServeur(42), '');
  assert.strictEqual(nettoyerUrlServeur(null), '');
  assert.strictEqual(nettoyerUrlServeur(undefined), '');
});

// ————— v0.1.28 : refus du https sur un hôte local (correctif approuvé) —————
test('nettoyerUrlServeur refuse https sur un hôte local (le serveur écoute en HTTP)', () => {
  assert.strictEqual(nettoyerUrlServeur('https://127.0.0.1:8642/ocr'), '');
  assert.strictEqual(nettoyerUrlServeur('https://localhost:8642/ocr'), '');
  assert.strictEqual(nettoyerUrlServeur('https://[::1]:8642/ocr'), '');
  assert.strictEqual(nettoyerUrlServeur('https://LOCALHOST:8642/ocr'), '');
});

test('estHttpsLocal signale le https local, jamais le distant ni le http', () => {
  assert.strictEqual(estHttpsLocal('https://127.0.0.1:8642/ocr'), true);
  assert.strictEqual(estHttpsLocal('https://localhost/ocr'), true);
  assert.strictEqual(estHttpsLocal('https://[::1]:8642/ocr'), true);
  assert.strictEqual(estHttpsLocal('http://127.0.0.1:8642/ocr'), false);
  assert.strictEqual(estHttpsLocal('https://100.101.102.103:8642/ocr'), false);
  assert.strictEqual(estHttpsLocal('mon-pc:8642'), false);
  assert.strictEqual(estHttpsLocal(42), false);
});

// ————— v0.1.23 : latexDepuisReponseServeur —————
test('latexDepuisReponseServeur prend le champ latex tel quel, épuré', () => {
  assert.strictEqual(latexDepuisReponseServeur({ latex: 'x^{2}' }), 'x^{2}');
  assert.strictEqual(latexDepuisReponseServeur({ latex: '  \\frac{1}{2}  ' }), '\\frac{1}{2}');
});

test('latexDepuisReponseServeur repère les formules dans text ou markdown', () => {
  assert.strictEqual(latexDepuisReponseServeur({ text: 'texte $x_1$ fin' }), 'x_1');
  assert.strictEqual(latexDepuisReponseServeur({ markdown: '$$y$$' }), 'y');
});

test('latexDepuisReponseServeur renvoie null quand rien n’est exploitable', () => {
  assert.strictEqual(latexDepuisReponseServeur({}), null);
  assert.strictEqual(latexDepuisReponseServeur(null), null);
  assert.strictEqual(latexDepuisReponseServeur('chaîne'), null);
  assert.strictEqual(latexDepuisReponseServeur({ latex: '   ' }), null);
  assert.strictEqual(latexDepuisReponseServeur({ markdown: 'aucune formule' }), null);
});

// ————— v0.1.25 : enteteJeton —————
test('enteteJeton renvoie un objet vide sans jeton', () => {
  assert.deepStrictEqual(enteteJeton(''), {});
  assert.deepStrictEqual(enteteJeton(null), {});
  assert.deepStrictEqual(enteteJeton(undefined), {});
  assert.deepStrictEqual(enteteJeton(42), {});
  assert.deepStrictEqual(enteteJeton('   '), {});
});

test('enteteJeton épure les espaces et compose l’en-tête Bearer', () => {
  assert.deepStrictEqual(enteteJeton('secret123'), { 'Authorization': 'Bearer secret123' });
  assert.deepStrictEqual(enteteJeton('  secret123 '), { 'Authorization': 'Bearer secret123' });
  assert.deepStrictEqual(enteteJeton('\tmon-jeton\n'), { 'Authorization': 'Bearer mon-jeton' });
});

// ————— v0.1.25 : messageErreurOcr —————
test('messageErreurOcr distingue le refus de jeton (401)', () => {
  const message = messageErreurOcr(401);
  assert.ok(message.includes('jeton'));
  assert.ok(/Bearer|jeton/i.test(message));
});

test('messageErreurOcr dit injoignable au statut 0', () => {
  assert.ok(messageErreurOcr(0).includes('injoignable'));
});

test('messageErreurOcr cite le code des autres statuts', () => {
  assert.ok(messageErreurOcr(500).includes('500'));
  assert.ok(messageErreurOcr(502).includes('502'));
});

// ————— v0.1.26 : pageUrlDepuis —————
test('pageUrlDepuis remplace le suffixe /ocr par /page', () => {
  assert.strictEqual(pageUrlDepuis('http://127.0.0.1:8642/ocr'), 'http://127.0.0.1:8642/page');
  assert.strictEqual(pageUrlDepuis('https://pc-arthur.tailxxxx.ts.net/latex-ocr/ocr'), 'https://pc-arthur.tailxxxx.ts.net/latex-ocr/page');
});

test('pageUrlDepuis ajoute /page à une URL nue, sans jamais doubler', () => {
  assert.strictEqual(pageUrlDepuis('http://192.168.1.116:8642'), 'http://192.168.1.116:8642/page');
  assert.strictEqual(pageUrlDepuis('http://127.0.0.1:8642/page'), 'http://127.0.0.1:8642/page');
  assert.strictEqual(pageUrlDepuis('https://pc-arthur.tailxxxx.ts.net/latex-ocr'), 'https://pc-arthur.tailxxxx.ts.net/latex-ocr/page');
});

test('pageUrlDepuis renvoie une chaîne vide sur une entrée inutilisable', () => {
  assert.strictEqual(pageUrlDepuis(''), '');
  assert.strictEqual(pageUrlDepuis(null), '');
  assert.strictEqual(pageUrlDepuis(42), '');
});

// ————— v0.1.26 : resumePage —————
const PAGE_FACTICE = {
  largeur: 1654, hauteur: 2339,
  blocs: [
    { type: 'titre', bbox: [132, 141, 1522, 199], texte: 'Titre de la page' },
    { type: 'texte', bbox: [132, 231, 1522, 339], lignes: [
      { bbox: [132, 231, 1522, 267], mots: [{ bbox: [132, 231, 204, 267], texte: 'Première' }] },
      { bbox: [132, 303, 1522, 339], mots: [{ bbox: [132, 303, 232, 339], texte: 'Deuxième' }] },
    ] },
    { type: 'formule', bbox: [132, 419, 1037, 547], latex: '\\frac{1}{2}' },
    { type: 'tableau', bbox: [132, 619, 1522, 875], html: '<table></table>' },
    { type: 'image', bbox: [132, 947, 1522, 1303] },
  ],
};

test('resumePage résume la page factice du banc, types dans l’ordre', () => {
  assert.strictEqual(
    resumePage(PAGE_FACTICE),
    'Page reconnue : 5 blocs (1 titre, 2 lignes de texte, 1 formule, 1 tableau, 1 image).'
  );
});

test('resumePage accorde les pluriels et omet les types absents', () => {
  const page = { blocs: [
    { type: 'formule', bbox: [0, 0, 1, 1], latex: 'a' },
    { type: 'formule', bbox: [0, 2, 1, 3], latex: 'b' },
    { type: 'texte', bbox: [0, 4, 1, 5], lignes: [
      { bbox: [0, 4, 1, 5], mots: [{ bbox: [0, 4, 1, 5], texte: 'un' }] },
    ] },
  ] };
  assert.strictEqual(
    resumePage(page),
    'Page reconnue : 3 blocs (1 ligne de texte, 2 formules).'
  );
});

test('resumePage dit « aucun bloc » sur une page vide ou tordue', () => {
  assert.strictEqual(resumePage({ largeur: 10, hauteur: 10, blocs: [] }), 'Page reconnue : aucun bloc.');
  assert.strictEqual(resumePage(null), 'Page reconnue : aucun bloc.');
  assert.strictEqual(resumePage({ blocs: 'pas une liste' }), 'Page reconnue : aucun bloc.');
});

// ————— reconnaissanceServeurActif (v0.1.37) —————
test('reconnaissanceServeurActif accepte le mode serveur avec adresse non vide', () => {
  assert.strictEqual(
    reconnaissanceServeurActif({ mode: 'serveur', serveurUrl: 'http://127.0.0.1:8642/ocr' }),
    true
  );
  assert.strictEqual(
    reconnaissanceServeurActif({ mode: 'serveur', serveurUrl: '  http://100.x.y.z:8642/ocr  ' }),
    true
  );
});

test('reconnaissanceServeurActif rejette le mode mistral, l’adresse vide, l’état absent', () => {
  assert.strictEqual(reconnaissanceServeurActif({ mode: 'mistral', serveurUrl: '', clePresente: true }), false);
  assert.strictEqual(reconnaissanceServeurActif({ mode: 'serveur', serveurUrl: '' }), false);
  assert.strictEqual(reconnaissanceServeurActif({ mode: 'serveur', serveurUrl: '   ' }), false);
  assert.strictEqual(reconnaissanceServeurActif({ mode: 'serveur' }), false);
  assert.strictEqual(reconnaissanceServeurActif(null), false);
  assert.strictEqual(reconnaissanceServeurActif(undefined), false);
  assert.strictEqual(reconnaissanceServeurActif({ mode: 'serveur', serveurUrl: 42 }), false);
});
