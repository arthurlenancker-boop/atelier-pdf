// v0.1.11 : moteur PUR de la fiche « texte + formules ». Découpage du balisage
// $...$, translittération WinAnsi du texte courant, composition des lignes avec
// formules insécables calées sur la ligne de base.
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  PREFIXE_FICHE_MIXTE, extraireSourceFiche, extraireTailleFiche, translitterMathWinAnsi,
  decouperMelange, exPourCorps, composerLignes, contientFormule,
  PREFIXE_CORRECTION, extraireSourceCorrection, extraireTailleCorrection,
  extraireFamilleCorrection, extraireGrasCorrection, extraireCouleurCorrection,
} = require('../engine/texte.js');

// Mesure déterministe pour les tests : 2 pt par caractère.
const mes2 = (t) => t.length * 2;
const dimsFrac = (latex) => (latex === 'frac' ? { widthPt: 40, heightPt: 16, depthPt: 5 } : { widthPt: 10, heightPt: 8, depthPt: 2 });

test('PREFIXE_FICHE_MIXTE est le marqueur canonique', () => {
  assert.strictEqual(PREFIXE_FICHE_MIXTE, 'Fiche mixte');
});

test('decouperMelange : texte pur sans dollar', () => {
  assert.deepStrictEqual(decouperMelange('Bonjour la page'), [
    { type: 'texte', valeur: 'Bonjour la page' },
  ]);
});

test('decouperMelange : mélange texte puis formule puis texte', () => {
  assert.deepStrictEqual(decouperMelange('Pour tout $x+1$ issu de ceci.'), [
    { type: 'texte', valeur: 'Pour tout ' },
    { type: 'formule', valeur: 'x+1' },
    { type: 'texte', valeur: ' issu de ceci.' },
  ]);
});

test('decouperMelange : deux formules adjacentes', () => {
  assert.deepStrictEqual(decouperMelange('$a$$b$'), [
    { type: 'formule', valeur: 'a' },
    { type: 'formule', valeur: 'b' },
  ]);
});

test('decouperMelange : dollar IMPAIR reste du texte ', () => {
  assert.deepStrictEqual(decouperMelange('Le prix est 5$ et l\\u2019autre'), [
    { type: 'texte', valeur: 'Le prix est 5$ et l\\u2019autre' },
  ]);
});

test('decouperMelange : formule VIDE ($ $) reste du texte', () => {
  assert.deepStrictEqual(decouperMelange('Il a dit $ $ vraiment'), [
    { type: 'texte', valeur: 'Il a dit $ $ vraiment' },
  ]);
});

test('decouperMelange : non-chaîne et chaîne vide', () => {
  assert.deepStrictEqual(decouperMelange(''), []);
  assert.deepStrictEqual(decouperMelange(undefined), []);
});

test('extraireSourceFiche : retire le marqueur une seule fois', () => {
  assert.strictEqual(extraireSourceFiche('Fiche mixte : Bonjour $x$'), 'Bonjour $x$');
  assert.strictEqual(extraireSourceFiche('Fiche mixte:Fiche mixte'), 'Fiche mixte');
  assert.strictEqual(extraireSourceFiche('Un commentaire'), '');
  assert.strictEqual(extraireSourceFiche(null), '');
});

test('translitterMathWinAnsi : symboles courants vers WinAnsi, accents conservés', () => {
  assert.strictEqual(translitterMathWinAnsi('x ≠ 2, y ≤ z, t ≥ u, w ≈ v, −3, é à ü'), 'x != 2, y <= z, t >= u, w ~ v, -3, é à ü');
});

test('exPourCorps : 0,52 fois la taille du corps', () => {
  assert.strictEqual(exPourCorps(11), 5.72);
  assert.strictEqual(exPourCorps(0), 0);
});

test('contientFormule : vrai seulement si des dollars appariés délimitent une formule', () => {
  assert.strictEqual(contientFormule('Il faut $x+1$ ici'), true);
  assert.strictEqual(contientFormule('Prix 5$ seulement'), false);
  assert.strictEqual(contientFormule(''), false);
});

test('composerLignes : une seule ligne quand tout tient', () => {
  const rep = composerLignes(decouperMelange('ab cd'), { mesurerTexte: mes2, dimsFormule: dimsFrac, largeurMax: 100, fontSize: 11 });
  assert.strictEqual(rep.lignes.length, 1);
  assert.strictEqual(rep.lignes[0].morceaux.length, 1);
  assert.strictEqual(rep.largeur(rep.lignes[0]), 10);
});

test('composerLignes : coupe aux ESPACES quand la ligne déborde', () => {
  const rep = composerLignes(decouperMelange('aa bb cc dd'), { mesurerTexte: mes2, dimsFormule: dimsFrac, largeurMax: 20, fontSize: 11 });
  // chaque mot fait 4 pt (+ espace 2 pt) ; 'aa bb cc' = 16 pt, 'dd' passe à 22 : coupé.
  assert.strictEqual(rep.lignes.length, 2);
  assert.deepStrictEqual(rep.lignes.map((l) => l.morceaux.map((m) => m.valeur).join('')), ['aa bb cc', 'dd']);
});

test('composerLignes : mot plus large que la largeur coupé caractère par caractère', () => {
  const rep = composerLignes(decouperMelange('abcdefghij kl'), { mesurerTexte: mes2, dimsFormule: dimsFrac, largeurMax: 10, fontSize: 11 });
  assert.strictEqual(rep.largeur(rep.lignes[0]), 10); // 5 caractères exactement
});

test('composerLignes : la formule est INSÉCABLE, jamais coupée', () => {
  const rep = composerLignes(decouperMelange('ab $frac$ cd'), { mesurerTexte: mes2, dimsFormule: dimsFrac, largeurMax: 20, fontSize: 11 });
  const formules = rep.lignes.flatMap((l) => l.morceaux).filter((m) => m.type === 'formule');
  assert.strictEqual(formules.length, 1);
  assert.strictEqual(formules[0].valeur, 'frac');
  assert.strictEqual(formules[0].largeur, 40); // jamais réduite ni divisée
});

test('composerLignes : la formule trop large part SEULE sur sa ligne', () => {
  const rep = composerLignes(decouperMelange('ab $frac$ cd'), { mesurerTexte: mes2, dimsFormule: dimsFrac, largeurMax: 12, fontSize: 11 });
  assert.strictEqual(rep.lignes.length, 3);
  assert.strictEqual(rep.lignes[1].morceaux.filter((m) => m.type === 'formule').length, 1);
});

test('composerLignes : hauteur de ligne étendue par une formule à profondeur', () => {
  const rep = composerLignes(decouperMelange('ab $frac$'), { mesurerTexte: mes2, dimsFormule: dimsFrac, largeurMax: 200, fontSize: 10 });
  const ligne = rep.lignes.find((l) => l.morceaux.some((m) => m.type === 'formule'));
  assert.strictEqual(ligne.hDessus, 11); // max(0.75*10, 16-5)
  assert.strictEqual(ligne.hDes, 5); // max(0.25*10, 5)
});

test('composerLignes : ligne texte seul garde les hauteurs du corps seul', () => {
  const rep = composerLignes(decouperMelange('ab cd'), { mesurerTexte: mes2, dimsFormule: dimsFrac, largeurMax: 200, fontSize: 10 });
  assert.strictEqual(rep.lignes[0].hDessus, 7.5);
  assert.strictEqual(rep.lignes[0].hDes, 2.5);
});

// v0.1.12 : le marqueur porte la taille du corps (« Fiche mixte 11 : … »)
// pour redimensionner une fiche sans perdre sa composition. L'ancien
// format « Fiche mixte : … » (v0.1.11) reste relu, taille par défaut 11.
test('extraireSourceFiche : le marqueur À TAILLE est relu pareil', () => {
  assert.strictEqual(extraireSourceFiche('Fiche mixte 11 : Bonjour $x$'), 'Bonjour $x$');
  assert.strictEqual(extraireSourceFiche('Fiche mixte 8.5 : $x$ et du texte'), '$x$ et du texte');
});

test('extraireTailleFiche : la taille du corps, ou null pour l\u2019ancien format', () => {
  assert.strictEqual(extraireTailleFiche('Fiche mixte 11 : Bonjour $x$'), 11);
  assert.strictEqual(extraireTailleFiche('Fiche mixte 8.5 : x'), 8.5);
  assert.strictEqual(extraireTailleFiche('Fiche mixte : Bonjour $x$'), null);
  assert.strictEqual(extraireTailleFiche('Un commentaire'), null);
  assert.strictEqual(extraireTailleFiche(null), null);
});

test('le marqueur à taille commence toujours par PREFIXE_FICHE_MIXTE', () => {
  assert.ok('Fiche mixte 11 : x'.startsWith(PREFIXE_FICHE_MIXTE));
  assert.ok('Fiche mixte : x'.startsWith(PREFIXE_FICHE_MIXTE));
});

/* Mesure AUSSI INTOLERANTE que pdf-lib : tout caractère hors WinAnsi
 * fait JETER la pose entière dans la vraie vie (retour d'Arthur sur
 * v0.1.38 : « WinAnsi cannot encode (0x000a) », le 0x0a est \n). */
const mesWin = (t) => {
  if (/\n/.test(t)) throw new Error('WinAnsi cannot encode "\\n" (0x000a)');
  return t.length * 2;
};

test('composerLignes : un SAUT DE LIGNE de la source COUPE la ligne (v0.1.39)', () => {
  const rep = composerLignes(decouperMelange('la première ligne\nla seconde'), {
    mesurerTexte: mesWin, dimsFormule: dimsFrac, largeurMax: 100, fontSize: 11,
  });
  assert.strictEqual(rep.lignes.length, 2, 'deux lignes réelles');
  assert.deepStrictEqual(
    rep.lignes.map((l) => l.morceaux.map((m) => m.valeur).join('')),
    ['la première ligne', 'la seconde'],
    'chaque ligne porte exactement sa sous-ligne de la source',
  );
  // Le retour chariot Windows (\r\n) coupe pareil.
  const crlf = composerLignes(decouperMelange('un\r\ndeux'), {
    mesurerTexte: mesWin, dimsFormule: dimsFrac, largeurMax: 100, fontSize: 11,
  });
  assert.strictEqual(crlf.lignes.length, 2);
});

test('composerLignes : trois lignes de source, trois lignes composées, aucune avalée', () => {
  const src = 'Titre du paragraphe\nCorps du paragraphe assez long\nSuite.';
  const rep = composerLignes(decouperMelange(src), {
    mesurerTexte: mesWin, dimsFormule: dimsFrac, largeurMax: 1000, fontSize: 11,
  });
  assert.strictEqual(rep.lignes.length, 3);
  assert.deepStrictEqual(
    rep.lignes.map((l) => l.morceaux.map((m) => m.valeur).join('')),
    ['Titre du paragraphe', 'Corps du paragraphe assez long', 'Suite.'],
  );
});

/* v0.1.43 : la COULEUR d'encre voyage dans le marqueur de correction
 * (retour d'Arthur : « le texte est passé de rose à gris »). Moteur pur :
 * la relecture du marqueur, nouveaux comme anciens. */
test('v0.1.43 : le marqueur porte la couleur, les autres champs restent relus', () => {
  const marqueur = 'Correction OCR 12 serif gras #E13A6E : Un texte rose';
  assert.strictEqual(extraireCouleurCorrection(marqueur), '#E13A6E');
  assert.strictEqual(extraireTailleCorrection(marqueur), 12);
  assert.strictEqual(extraireFamilleCorrection(marqueur), 'serif');
  assert.ok(extraireGrasCorrection(marqueur));
  assert.strictEqual(extraireSourceCorrection(marqueur), 'Un texte rose');
});

test('v0.1.43 : sans gras, la couleur suit quand même la famille', () => {
  assert.strictEqual(extraireCouleurCorrection('Correction OCR 11 sans #1f4e79 : bleu'),
    '#1f4e79', 'la casse mixte est relue telle quelle');
  assert.strictEqual(extraireFamilleCorrection('Correction OCR 11 sans #1f4e79 : bleu'), 'sans');
  assert.strictEqual(extraireGrasCorrection('Correction OCR 11 sans #1f4e79 : bleu'), false);
  assert.strictEqual(extraireSourceCorrection('Correction OCR 11 sans #1f4e79 : bleu'), 'bleu');
});

test('v0.1.43 : les marqueurs ANCIENS restent relus (couleur null, source intacte)', () => {
  assert.strictEqual(extraireCouleurCorrection('Correction OCR 12,5 : texte'), null);
  assert.strictEqual(extraireCouleurCorrection('Correction OCR : #a1b2c3 dans la source'), null,
    'un #hex de la SOURCE, après les deux-points, n\'est pas une couleur du marqueur');
  assert.strictEqual(extraireSourceCorrection('Correction OCR : #a1b2c3 : texte'), '#a1b2c3 : texte',
    'la source contenant elle-même « #hex : » reste EXACTEMENT ce qu\'elle était');
  assert.strictEqual(extraireCouleurCorrection('Correction OCR 11 serif gras : Un titre'), null);
  assert.strictEqual(extraireCouleurCorrection('Fiche mixte 11 : pas une correction #E13A6E'), null);
});
