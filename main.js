// main.js — Tâche 9 : processus principal Electron.
// Le document pdf-lib appartient exclusivement à ce processus ; le processus
// de rendu ne fait que présenter et calculer des coordonnées (engine/coords.js).
'use strict';

const {
  app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { openPdf, savePdf, timestampedPath } = require('./engine/pdfio.js');
const { createSession } = require('./engine/session.js');
const { listAnnots } = require('./engine/reread.js');
const { mjRender } = require('./engine/mjrender.js');

// ---------------------------------------------------------------------------
// Dossiers : en développement, tout vit dans le dossier du projet ; empaqueté,
// pdfjs-dist est copié dans extraResources et sert via app://libs/.
// ---------------------------------------------------------------------------
const dossierLibs = app.isPackaged
  ? path.join(process.resourcesPath, 'node_modules')
  : path.join(__dirname, 'node_modules');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

let fenetre = null;
let etat = null; // { chemin, session, doc, modifie }

// ---------------------------------------------------------------------------
// Instance unique : un deuxième lancement ramène la fenêtre existante.
// ---------------------------------------------------------------------------
const verrou = app.requestSingleInstanceLock();
if (!verrou) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (fenetre) {
      if (fenetre.isMinimized()) fenetre.restore();
      fenetre.focus();
    }
  });
}

/** Sert un fichier local (fonctionne aussi depuis l'archive asar). */
async function servirFichier(cheminAbsolu, mime) {
  const octets = await fs.promises.readFile(cheminAbsolu);
  return new Response(octets, { headers: { 'Content-Type': mime } });
}

const MIMES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function initProtocole() {
  protocol.handle('app', (requ) => {
    const url = new URL(requ.url);
    // app://local/renderer/…  → fichiers du dossier renderer.
    // app://local/libs/…     → dépendances servies localement (pdfjs-dist).
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let racine;
    if (rel.startsWith('libs/')) {
      racine = dossierLibs;
    } else {
      racine = __dirname;
    }
    const cible = path.join(racine, rel);
    const mime = MIMES[path.extname(cible).toLowerCase()] || 'application/octet-stream';
    return servirFichier(cible, mime);
  });
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0C0E13',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  fenetre.once('ready-to-show', () => fenetre.show());
  fenetre.loadURL('app://local/renderer/index.html');
  fenetre.on('closed', () => { fenetre = null; });
}

function menuApplication() {
  const estFichier = () => Boolean(etat && etat.chemin);
  const modele = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Ouvrir…',
          accelerator: 'CmdOrCtrl+O',
          click: () => { if (fenetre) fenetre.webContents.send('app:commande', { nom: 'ouvrir' }); },
        },
        { type: 'separator' },
        {
          label: 'Enregistrer',
          accelerator: 'CmdOrCtrl+S',
          enabled: estFichier(),
          click: () => { if (fenetre) fenetre.webContents.send('app:commande', { nom: 'enregistrer' }); },
        },
        {
          label: 'Enregistrer une copie horodatée…',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: estFichier(),
          click: () => { if (fenetre) fenetre.webContents.send('app:commande', { nom: 'copie' }); },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'zoomIn', label: 'Zoom avant' },
        { role: 'zoomOut', label: 'Zoom arrière' },
        { role: 'resetZoom', label: 'Taille réelle' },
      ],
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'À propos d\'Atelier PDF',
          click: () => {
            dialog.showMessageBox(fenetre, {
              type: 'info',
              title: 'À propos d\'Atelier PDF',
              message: 'Atelier PDF',
              detail: `Version ${app.getVersion()}\nAnnotations et équations LaTeX inscrites dans le PDF.\nLicence AGPL-3.0.`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modele));
}

function notifierChangement() {
  if (fenetre) fenetre.webContents.send('app:changed', { modifie: Boolean(etat && etat.modifie) });
}

/** Résumé sérialisable de la session (pour le calque d'apparence du rendu). */
function resumerSession() {
  if (!etat) return null;
  return {
    chemin: etat.chemin,
    modifie: etat.modifie,
    pageCount: etat.doc.getPageCount(),
    annots: listAnnots(etat.doc).map((a) => ({
      ...a,
      ref: a.ref ? { objectNumber: a.ref.objectNumber, generationNumber: a.ref.generationNumber } : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// IPC — chaque canal renvoie { erreur } en français plutôt qu'une exception.
// ---------------------------------------------------------------------------
ipcMain.handle('pdf:open', async (_e, cheminDemande) => {
  try {
    let chemin = cheminDemande;
    if (!chemin || typeof chemin !== 'string') {
      const choix = await dialog.showOpenDialog(fenetre, {
        title: 'Ouvrir un PDF',
        filters: [{ name: 'Documents PDF', extensions: ['pdf'] }],
        properties: ['openFile'],
      });
      if (choix.canceled || choix.filePaths.length === 0) return { annule: true };
      [chemin] = choix.filePaths;
    }
    const octets = await fs.promises.readFile(chemin);
    const doc = await openPdf(octets); // PdfioError en français si corrompu
    etat = { chemin, doc, session: createSession(doc), modifie: false };
    return { resume: resumerSession(), octets: new Uint8Array(octets) };
  } catch (err) {
    return { erreur: err.message || String(err) };
  }
});

ipcMain.handle('pdf:apply', async (_e, edits) => {
  try {
    if (!etat) return { erreur: 'Aucun document n\'est ouvert.' };
    if (!Array.isArray(edits)) return { erreur: 'Requête d\'édition mal formée.' };
    const faits = [];
    for (const edit of edits) {
      faits.push(etat.session.apply(edit));
    }
    etat.modifie = true;
    notifierChangement();
    return { resume: resumerSession(), faits };
  } catch (err) {
    return { erreur: err.message || String(err) };
  }
});

ipcMain.handle('pdf:save', async (_e, { mode } = {}) => {
  try {
    if (!etat) return { erreur: 'Aucun document n\'est ouvert.' };
    const octets = await savePdf(etat.doc);
    let cible;
    if (mode === 'timestamped') {
      const dossier = path.dirname(etat.chemin);
      const base = path.basename(etat.chemin, path.extname(etat.chemin));
      cible = timestampedPath(dossier, base);
    } else {
      cible = etat.chemin;
    }
    await fs.promises.writeFile(cible, octets);
    if (mode !== 'timestamped') {
      etat.modifie = false;
    } else {
      etat.modifie = false; // le contenu sauvegardé correspond aussi à l'état courant
    }
    notifierChangement();
    return { chemin: cible };
  } catch (err) {
    return { erreur: err.message || String(err) };
  }
});

ipcMain.handle('mjx:preview', async (_e, { latex, exPt, rgb } = {}) => {
  try {
    if (typeof latex !== 'string' || !latex.trim()) {
      return { erreur: 'Aucune formule à afficher.' };
    }
    const r = mjRender(latex, Number.isFinite(exPt) ? exPt : 4.5, rgb ? { rgb } : {});
    return { apercu: r };
  } catch (err) {
    return { erreur: err.message || String(err) };
  }
});

ipcMain.handle('app:version', () => app.getVersion());

// ---------------------------------------------------------------------------
// Cycle de vie.
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  initProtocole();
  creerFenetre();
  menuApplication();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) creerFenetre(); });

  // Mise à jour silencieuse : l'utilisateur non averti n'a rien à voir ;
  // un échec (pas de réseau, pas de GitHub) ne perturbe jamais la séance.
  try {
    if (app.isPackaged) {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.autoDownload = true;
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }
  } catch { /* hors ligne ou electron-updater absent : silencieux */ }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Les liens externes éventuels s'ouvrent dans le Navigateur du système,
// jamais dans la fenêtre de l'application.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});
