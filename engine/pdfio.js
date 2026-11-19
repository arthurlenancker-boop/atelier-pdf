// engine/pdfio.js — Tâche 2 : ouverture, enregistrement et copies horodatées.
'use strict';

const { PDFDocument } = require('pdf-lib');

/** Erreur d'entrée-sortie PDF, toujours en français, avec la cause d'origine. */
class PdfioError extends Error {
  constructor(message, cause) {
    super(cause ? `${message} (${cause.message || cause})` : message);
    this.name = 'PdfioError';
    this.cause = cause;
  }
}

/**
 * Ouvre un PDF depuis des octets.
 * @param {Uint8Array|Buffer} octets contenu du fichier
 * @returns {Promise<PDFDocument>} document pdf-lib
 * @throws {PdfioError} fichier illisible, corrompu ou non-PDF
 */
async function openPdf(octets) {
  try {
    return await PDFDocument.load(octets, { ignoreEncryption: false, updateMetadata: false });
  } catch (cause) {
    if (cause && /password|encrypt/i.test(String(cause.message))) {
      throw new PdfioError('Ce document est protégé par un mot de passe : il ne peut pas être ouvert.', cause);
    }
    throw new PdfioError('Ce fichier n'a pas pu être lu comme un PDF (fichier absent, corrompu ou non-PDF).', cause);
  }
}

/**
 * Enregistre le document (réécriture complète).
 * @returns {Promise<Uint8Array>} octets du PDF complet
 */
async function savePdf(doc) {
  try {
    return await doc.save();
  } catch (cause) {
    throw new PdfioError('Le document n'a pas pu être enregistré.', cause);
  }
}

/**
 * Chemin d'une copie horodatée : <dossier>/<nom>-AAAA-MM-JJ-HHmmss.pdf
 * @param {string} dossier dossier de destination
 * @param {string} base nom de base du fichier (sans extension)
 * @param {Date} [now=Date.now()] date de l'horodatage
 * @returns {string} chemin complet
 */
function timestampedPath(dossier, base, now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const p2 = (n) => String(n).padStart(2, '0');
  const horodatage = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
    + `-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const sep = dossier.endsWith('/') || dossier.endsWith('\\')
    ? ''
    : (dossier.includes('\\') && !dossier.includes('/') ? '\\' : '/');
  return `${dossier}${sep}${base}-${horodatage}.pdf`;
}

module.exports = { openPdf, savePdf, timestampedPath, PdfioError };
