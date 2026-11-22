// engine/raccourcis.js — v0.1.34 : le raccourci GARANTI.
// Retour d'Arthur : « il n'y a plus de raccourci qui se créé après
// installation ». Cause établie : electron-updater installe les
// nouvelles versions EN SILENCE (drapeau --updated), et l'installateur
// NSIS n'y recrée AUCUN raccourci, tandis que la désinstallation de
// l'ancienne version a déjà emporté l'existant (problèmes
// electron-builder #2725 et #2514) : le raccourci du bureau disparaît
// à la première mise à jour silencieuse. Garantie inversée : c'est
// l'APPLICATION elle-même qui, à chaque lancement, recrée les
// raccourcis manquants du bureau et du menu démarrer. Un raccourci
// présent n'est JAMAIS retouché (le raccourci déplacé ou renommé par
// l'utilisateur est respecté).
'use strict';

/** Double les apostrophes d'une valeur insérée entre guillemets
 * simples PowerShell (règle d'échappement PS). */
function echapperPS(valeur) {
  return String(valeur ?? '').replace(/'/g, "''");
}

/**
 * Compose le script PowerShell autonome qui recrée les raccourcis
 * manquants de l'application (bureau + menu démarrer). Le script ne
 * crée un .lnk que s'il est absent du dossier : présent, il n'est
 * jamais réécrit. Les dossiers réels sont résolus par l'API
 * Windows ([Environment]::GetFolderPath), donc un bureau redirigé
 * (OneDrive, profil itinérant) est honoré.
 * @param {{ exe: string, nom: string, description?: string }} entree
 *   exe = chemin complet de l'exécutable ; nom = libellé du raccourci.
 * @returns {string} source PowerShell à passer à -Command.
 */
function composerRaccourcisWin({ exe, nom, description = '' }) {
  const lignes = [
    "$w = New-Object -ComObject WScript.Shell",
    `$exe = '${echapperPS(exe)}'`,
    `$nom = '${echapperPS(nom)}'`,
    `$dossiers = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))`,
    'foreach ($dossier in $dossiers) {',
    '  if (-not $dossier) { continue }',
    '  if (-not (Test-Path -LiteralPath $dossier)) { continue }',
    "  $cible = Join-Path $dossier ($nom + '.lnk')",
    '  if (Test-Path -LiteralPath $cible) { continue }',
    '  $s = $w.CreateShortcut($cible)',
    '  $s.TargetPath = $exe',
    '  $s.WorkingDirectory = Split-Path -Parent $exe',
    `  $s.Description = '${echapperPS(description)}'`,
    '  $s.Save()',
    '}',
    '$w = $null',
  ];
  return lignes.join('\n');
}

module.exports = { composerRaccourcisWin, echapperPS };
