// preload.js — Tâche 9 : pont contextBridge, isolation de contexte active.
'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('atelier', {
  /** Ouvre un PDF (la version data est renvoyée pour le rendu pdf.js). */
  open: (chemin) => ipcRenderer.invoke('pdf:open', chemin),
  /** Applique une liste d'éditions {kind, pageIndex, args} et renvoie le résumé. */
  applyEdits: (edits) => ipcRenderer.invoke('pdf:apply', edits),
  /** v0.1.13 : annule le dernier geste (rejeu depuis les octets originaux). */
  undo: () => ipcRenderer.invoke('pdf:undo'),
  /** v0.1.13 : rétablit le geste annulé au sommet de la pile. */
  redo: () => ipcRenderer.invoke('pdf:redo'),
  /** Enregistre : mode 'overwrite' (défaut) ou 'timestamped'. */
  save: (mode) => ipcRenderer.invoke('pdf:save', { mode }),
  /** Aperçu d'une équation LaTeX : dimensions et opérateurs vectoriels. */
  previewEquation: (latex, exPt, rgb) => ipcRenderer.invoke('mjx:preview', { latex, exPt, rgb }),
  /** Version affichée (menu Aide). */
  version: () => ipcRenderer.invoke('app:version'),
  /** v0.1.22/v0.1.23 : envoie l'image d'une zone à l'OCR LaTeX en
      vigueur (serveur personnel ou Mistral), renvoie le LaTeX. */
  latexOcr: (dataUrl) => ipcRenderer.invoke('ocr:latex', { dataUrl }),
  /** v0.1.23 : enregistre les options de la lecture LaTeX ({ cle } pour
      la clé Mistral, { url } ou { url: '' } pour le serveur personnel). */
  enregistrerOptionsOcr: (options) => ipcRenderer.invoke('conf:ocr', options || {}),
  /** v0.1.23 : état de la lecture LaTeX (mode, URL du serveur, clé présente). */
  optionsOcr: () => ipcRenderer.invoke('conf:ocr:get'),
  /** Chemin réel d'un fichier déposé par glisser-déposer. */
  cheminFichier: (fichier) => webUtils.getPathForFile(fichier),
  /** Signale chaque changement d'état (modifié / enregistré). */
  onChanged: (retour) => {
    ipcRenderer.on('app:changed', (_e, infos) => retour(infos));
  },
  /** Commandes du menu natif redirigées vers le rendu. */
  onCommande: (retour) => {
    ipcRenderer.on('app:commande', (_e, cmd) => retour(cmd));
  },
});
