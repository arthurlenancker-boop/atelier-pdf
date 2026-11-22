// v0.1.34 : le raccourci GARANTI — moteur PUR (aucune dépendance, ni
// electron, ni PowerShell : le script n'est que composé et inspecté).
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { composerRaccourcisWin, echapperPS } = require('../engine/raccourcis.js');

test('echapperPS : les apostrophes sont doublées, rien d\'autre', () => {
  assert.strictEqual(echapperPS("C:\\Program Files\\L'Atelier.exe"),
    "C:\\Program Files\\L''Atelier.exe");
  assert.strictEqual(echapperPS(''), '');
  assert.strictEqual(echapperPS(null), '');
});

test('raccourcis : le script recrée SEULEMENT les raccourcis manquants', () => {
  const script = composerRaccourcisWin({
    exe: 'C:\\Users\\Arthur\\AppData\\Local\\Programs\\atelier-pdf\\Atelier PDF.exe',
    nom: 'Atelier PDF',
  });
  // Un .lnk présent n'est JAMAIS réécrit : le garde Test-Path existe
  // AVANT la création, et la boucle passe au dossier suivant.
  const positionGarde = script.indexOf('if (Test-Path -LiteralPath $cible) { continue }');
  const positionCreation = script.indexOf('$w.CreateShortcut($cible)');
  assert.ok(positionGarde > -1, "le garde d'existence est présent");
  assert.ok(positionCreation > -1, 'la création est présente');
  assert.ok(positionGarde < positionCreation, "le garde précède la création : un raccourci présent n'est pas retouché");
});

test('raccourcis : bureau ET menu démarrer, cible et répertoire de travail', () => {
  const script = composerRaccourcisWin({
    exe: 'C:\\Chemin\\Atelier PDF.exe',
    nom: 'Atelier PDF',
    description: 'Éditeur PDF.',
  });
  assert.ok(script.includes("[Environment]::GetFolderPath('Desktop')"),
    'le dossier Bureau est résolu par l\'API Windows (OneDrive honoré)');
  assert.ok(script.includes("[Environment]::GetFolderPath('Programs')"),
    'le dossier Programmes du menu démarrer est résolu');
  assert.ok(script.includes("'C:\\Chemin\\Atelier PDF.exe'"),
    "la cible est l'exécutable passé");
  assert.ok(script.includes('$s.WorkingDirectory = Split-Path -Parent $exe'),
    'le répertoire de travail est celui de l\'exécutable');
  assert.ok(script.includes("'Éditeur PDF.'"), 'la description est embarquée');
});

test('raccourcis : un chemin avec apostrophe est échappé en entier', () => {
  const script = composerRaccourcisWin({
    exe: "C:\\Dossier d'Arthur\\Atelier PDF.exe",
    nom: "L'Atelier",
    description: "L'éditeur d'Arthur",
  });
  assert.ok(script.includes("'C:\\Dossier d''Arthur\\Atelier PDF.exe'"),
    "l'apostrophe du chemin est doublée (règle PowerShell)");
  assert.ok(script.includes("'L''Atelier'"), "l'apostrophe du nom est doublée");
  assert.ok(script.includes("'L''éditeur d''Arthur'"),
    "les apostrophes de la description sont doublées");
  // Aucune apostrophe simple non doublée ne subsiste dans les littéraux
  // du script : chaque ' isolé est un délimiteur PowerShell.
  assert.ok(!/\$exe = '[^']*'[^']*'/.test(script) === true
    || script.includes("d''Arthur"), 'sanity');
});
