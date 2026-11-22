// engine/couleurs.js — v0.1.31 : conversions de couleur, moteur PUR.
// Palette, cercle chromatique et moteur d'annotations partagent ces
// fonctions : une couleur hexadécimale (#RRGGBB) devient un tableau
// [r g b] 0..1 pour les opérateurs PDF (rg, RG, /C, /IC). Aucune
// dépendance, testé sous Node sans pdf-lib.
'use strict';

/** Analyse « #RRGGBB » ou « #RGB » ; renvoie [r, g, b] entiers 0..255,
 * ou null si la chaîne n'est pas une couleur hexadécimale. */
function hexVersRgb(hex) {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(String(hex ?? '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Compose « #RRGGBB » depuis des composants 0..255. */
function rgbVersHex(t) {
  if (!Array.isArray(t) || t.length < 3) return '#000000';
  const c = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)))
    .toString(16).padStart(2, '0');
  return `#${c(t[0])}${c(t[1])}${c(t[2])}`;
}

/** Hexadécimal -> [r g b] 0..1 (opérateurs et dictionnaires PDF). */
function hexVersRgb01(hex) {
  const t = hexVersRgb(hex);
  if (!t) return null;
  return [t[0] / 255, t[1] / 255, t[2] / 255];
}

/** [r g b] 0..1 -> hexadécimal ; null si le tableau est absent. */
function rgb01VersHex(c) {
  if (!Array.isArray(c) || c.length < 3) return null;
  return rgbVersHex(c.map((v) => Math.max(0, Math.min(1, Number(v) || 0)) * 255));
}

/** HSV (h en degrés 0..360, s et v 0..1) -> [r g b] entiers 0..255.
 * Même formule que la maquette validée, pour une roue identique. */
function hsvVersRgb(h, s, v) {
  const hh = ((Number(h) || 0) % 360 + 360) % 360;
  const ss = Math.max(0, Math.min(1, Number(s) || 0));
  const vv = Math.max(0, Math.min(1, Number(v) || 0));
  const f = (n) => {
    const k = (n + hh / 60) % 6;
    return vv - vv * ss * Math.max(Math.min(k, 4 - k, 1), 0);
  };
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { hexVersRgb, rgbVersHex, hexVersRgb01, rgb01VersHex, hsvVersRgb };
} else {
  globalThis.AtelierCouleurs = { hexVersRgb, rgbVersHex, hexVersRgb01, rgb01VersHex, hsvVersRgb };
}
