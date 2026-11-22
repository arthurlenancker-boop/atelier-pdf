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
const { rejouer, rejouerPrefixeSain } = require('./engine/undo.js');
const { creerFileDeCommandes } = require('./engine/synchro.js'); // v0.1.33
const {
  nettoyerCle, extractionLatex, nettoyerUrlServeur, latexDepuisReponseServeur,
  enteteJeton, messageErreurOcr, pageUrlDepuis, resumePage,
} = require('./engine/ocr.js');

// ---------------------------------------------------------------------------
// Dossiers : en développement, tout vit dans le dossier du projet ; empaqueté,
// pdfjs-dist est copié dans extraResources et sert via app://libs/.
// v0.1.22 : le modèle de langue de l'OCR (ocr/fra.traineddata.gz) est servi
// via app://ocr/ depuis les mêmes ressources.
// ---------------------------------------------------------------------------
const dossierLibs = app.isPackaged
  ? path.join(process.resourcesPath, 'node_modules')
  : path.join(__dirname, 'node_modules');

const dossierOcr = app.isPackaged
  ? path.join(process.resourcesPath, 'ocr')
  : path.join(__dirname, 'ocr');

const cheminConfig = () => path.join(app.getPath('userData'), 'config.json');

/** Configuration locale (config.json du dossier de données) : un objet,
 *  {} si le fichier est absent ou illisible — jamais d'exception. */
function lireConfig() {
  try {
    const conf = JSON.parse(fs.readFileSync(cheminConfig(), 'utf8'));
    return (conf && typeof conf === 'object') && !Array.isArray(conf) ? conf : {};
  } catch {
    return {};
  }
}

/** Clé API Mistral enregistrée localement, ou '' si absente. */
function lireCleMistral() {
  return nettoyerCle(lireConfig().cleMistral);
}

/** v0.1.23 : URL du serveur OCR personnel (LaTeX), ou '' si absente.
 *  Son existence SEULE fait passer la lecture LaTeX en mode serveur. */
function lireServeurOcr() {
  return nettoyerUrlServeur(lireConfig().serveurOcr);
}

/** v0.1.25 : jeton déclaré au serveur OCR (--jeton ou JETON_OCR), ou ''
 *  si aucun. Vide = le serveur n'exige rien, la requête part nue. */
function lireJetonOcr() {
  const jeton = lireConfig().jetonOcr;
  return typeof jeton === 'string' ? jeton.trim() : '';
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

let fenetre = null;
let etat = null; // v0.1.30 : etat = l'onglet ACTIF (voir onglets ci-dessous)

// v0.1.33 : la FILE d'édition. Tout ce qui touche un document (appliquer,
// annuler, rétablir, enregistrer) s'exécute UNE commande à la fois, dans
// l'ordre d'arrivée. Avant, ipcMain.handle était réentrant : deux Ctrl+Z
// rapprochés ouvraient deux rejeux qui se chevauchaient, lisaient le même
// journal d'avant et dépilaient deux fois ; le document ne correspondait
// plus ensuite au journal et CHAQUE annulation échouait pour toujours
// (« Annotation introuvable » en boucle, retour d'Arthur).
const fileEdition = creerFileDeCommandes();
// v0.1.13 : octets = fichier TEL QU'OUVERT (jamais réenregistré), socle du
// rejeu d'annulation ; gestes = lots d'éditions appliqués (un lot = un geste
// utilisateur) ; aRefaire = lots écartés par les annulations.
// v0.1.30 : onglets. Chaque PDF ouvert vit dans la Map « onglets » (id → état
// complet : chemin, doc, session, journal des gestes) ; « etat » pointe
// celui de l'onglet actif. Les canaux existants (apply, undo, redo, save)
// travaillent TOUJOURS sur l'onglet actif : pdf:activate bascule le pointeur
// avant que le rendu ne fasse quoi que ce soit. Un même fichier ouvert deux
// fois active l'onglet existant (un PDF n'est jamais édité en double).
const onglets = new Map();
let sequenceOnglets = 0;
let ongletActifId = null;
// v0.1.30 : la fermeture de la fenêtre demande d'abord d'enregistrer les
// onglets modifiés ; ce drapeau marque la fermeture consentie.
let fermetureAutorisee = false;
let confirmationFermetureEnCours = false;
const derniersMessages = []; // journal console du rendu, pour les diagnostics

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
  try {
    const octets = await fs.promises.readFile(cheminAbsolu);
    return new Response(octets, { headers: { 'Content-Type': mime } });
  } catch {
    // v0.1.2 : un fichier manquant doit echouer clairement (404), pas renvoyer
    // une reponse vide qui masquerait l'erreur dans la console.
    return new Response('Fichier introuvable.', { status: 404 });
  }
}

const MIMES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  // v0.1.3 : sans cette ligne, les modules .mjs (pdf.min.mjs, pdf.worker.min.mjs)
  // etaient servis en application/octet-stream. Chromium applique une
  // verification stricte du type MIME des modules de script (import y compris)
  // : l'import dynamique de pdf.js echouait depuis la v0.1.0. C'est la cause
  // racine de l'impossibilite d'ouvrir un document.
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function initProtocole() {
  protocol.handle('app', async (requ) => {
    const url = new URL(requ.url);
    // app://local/renderer/...  -> fichiers du dossier renderer.
    // app://local/libs/...      -> dependances servies localement (pdfjs-dist).
    // app://local/ocr/...       -> modele de langue de l'OCR (v0.1.22).
    // v0.1.2 : le prefixe « libs/ » designe l'interieur du dossier des
    // dependances ; il doit etre retire du chemin servi (l'import de pdf.js
    // pointait avant vers node_modules/libs/..., un dossier inexistant).
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let racine;
    let cible;
    if (rel.startsWith('libs/')) {
      racine = dossierLibs;
      cible = path.join(dossierLibs, rel.slice('libs/'.length));
    } else if (rel.startsWith('ocr/')) {
      racine = dossierOcr;
      cible = path.join(dossierOcr, rel.slice('ocr/'.length));
    } else {
      racine = __dirname;
      cible = path.join(__dirname, rel);
    }
    // Garde-fou : jamais de remontee hors de la racine servie.
    const resolu = path.resolve(cible);
    if (resolu !== path.resolve(racine) && !resolu.startsWith(path.resolve(racine) + path.sep)) {
      return new Response('Chemin refuse.', { status: 403 });
    }
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
    backgroundColor: '#F3F3F3',
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
  // v0.1.30 : « enregistrer avant la fermeture ». Un document modifié ne
  // peut pas disparaître en silence : la croix, Alt+F4 et Quititter
  // (rôle du menu) passent TOUS par l'événement close.
  fenetre.on('close', (ev) => {
    if (fermetureAutorisee) return;
    let modifie = false;
    for (const o of onglets.values()) {
      if (o.modifie) { modifie = true; break; }
    }
    if (!modifie) return;
    ev.preventDefault();
    confirmerFermetureFenetre();
  });
  // v0.1.3 : les erreurs du processus de rendu sont silencieuses pour
  // l'utilisateur (pas de console ouverte) ; on les garde pour les diagnostics.
  fenetre.webContents.on('console-message', (_e, niveau, texte) => {
    derniersMessages.push(`[${niveau}] ${texte}`);
    if (derniersMessages.length > 25) derniersMessages.shift();
  });
}

function menuApplication() {
  // v0.1.30 (correctif de construction) : le menu n'est bâti QU'AU DÉMARRAGE ;
  // un « enabled » évalué ici fige l'état de ce moment (pas de document) pour
  // toute la séance : les items Enregistrer/Copie restaient hors service et
  // le nouveau « Fermer l'onglet » (Ctrl+W) ne devait jamais l'être. Les
  // gardes côté rendu (enregistrer/fermerOnglet ne font rien sans document)
  // tiennent déjà le rôle ; on ne fige plus ici.
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
          click: () => { if (fenetre) fenetre.webContents.send('app:commande', { nom: 'enregistrer' }); },
        },
        {
          label: 'Enregistrer une copie horodatée…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => { if (fenetre) fenetre.webContents.send('app:commande', { nom: 'copie' }); },
        },
        { type: 'separator' },
        {
          // v0.1.30 : fermeture de l'onglet actif. Les modifications non
          // enregistrées demandent d'abord l'avis de l'utilisateur (boîte du
          // canal pdf:fermer, partagée avec la croix de l'onglet).
          label: "Fermer l'onglet",
          accelerator: 'CmdOrCtrl+W',
          click: () => { if (fenetre) fenetre.webContents.send('app:commande', { nom: 'fermer' }); },
        },
        { type: 'separator' },
        {
          // v0.1.23 : lecture LaTeX, chez Mistral (clé) ou sur le serveur
          // OCR personnel de l'utilisateur (tout local).
          label: 'Options OCR LaTeX…',
          click: () => {
            if (fenetre) fenetre.webContents.send('app:commande', { nom: 'options-ocr' });
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      // v0.1.13 : annulation et rétablissement. Les raccourcis sont AFFICHÉS
      // mais non enregistrés comme accélérateurs natifs : un accélérateur
      // natif intercepterait Ctrl+Z même pendant la saisie d'une note et
      // casserait l'annulation native du champ. L'appui réel est écouté côté
      // rendu, avec une garde sur les champs de saisie.
      label: 'Édition',
      submenu: [
        {
          label: 'Annuler',
          accelerator: 'CmdOrCtrl+Z',
          registerAccelerator: false,
          click: () => { if (fenetre) fenetre.webContents.send('app:commande', { nom: 'annuler' }); },
        },
        {
          label: 'Rétablir',
          accelerator: 'CmdOrCtrl+Shift+Z',
          registerAccelerator: false,
          click: () => { if (fenetre) fenetre.webContents.send('app:commande', { nom: 'retablir' }); },
        },
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
          // v0.1.3 : capture instantanee de l'etat, a photographier ou recopier
          // en cas de probleme, sans console technique ni raccourci cache.
          label: 'Diagnostics de l\'application…',
          click: async () => {
            try {
              const rendu = await fenetre.webContents.executeJavaScript(
                "(globalThis.__atelierDiagnostics ? globalThis.__atelierDiagnostics() : 'rendu non initialise')",
              );
              const journal = derniersMessages.length
                ? derniersMessages.join('\n')
                : '(aucun message console)';
              const serveur = lireServeurOcr();
              const modeLatex = serveur
                ? `serveur personnel (${serveur})`
                : (lireCleMistral() ? 'Mistral (clé définie)' : 'Mistral (clé absente, menu Fichier → Options OCR LaTeX…)');
              dialog.showMessageBox(fenetre, {
                type: 'info',
                title: 'Diagnostics',
                message: 'État de l\'application',
                detail: `${rendu}\nLecture LaTeX : ${modeLatex}\n\nJournal de la console du rendu :\n${journal}`,
              });
            } catch (err) {
              dialog.showMessageBox(fenetre, {
                type: 'warning',
                title: 'Diagnostics',
                message: 'Diagnostics indisponibles.',
                detail: String((err && err.message) || err),
              });
            }
          },
        },
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

function notifierChangement(o) {
  // v0.1.30 : le changement porte l'identifiant de l'onglet concerné (le
  // rendu tient à jour les pastilles de SA bande d'onglets).
  // v0.1.33 : o = l'état QUE LA COMMANDE a réellement modifié (capté à
  // l'arrivée de la commande, pas au moment de notifier) ; par défaut,
  // l'onglet actif.
  const cible = o === undefined ? etat : o;
  if (fenetre) {
    fenetre.webContents.send('app:changed', { idOnglet: ongletActifId, modifie: Boolean(cible && cible.modifie) });
  }
}

/** Résumé sérialisable de la session (pour le calque d'apparence du rendu). */
function resumerSession(o = etat) {
  if (!o) return null;
  return {
    chemin: o.chemin,
    modifie: o.modifie,
    pageCount: o.doc.getPageCount(),
    peutAnnuler: Boolean(o.gestes && o.gestes.length),
    peutRefaire: Boolean(o.aRefaire && o.aRefaire.length),
    annots: listAnnots(o.doc).map((a) => ({
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
    // v0.1.30 : le fichier est-il déjà ouvert dans un autre onglet ? On
    // l'active plutôt que d'en ouvrir un second : un PDF édité en double
    // mène à l'écrasement des annotations de l'un par l'autre.
    for (const [id, o] of onglets) {
      if (path.resolve(o.chemin) === path.resolve(chemin)) {
        etat = o;
        ongletActifId = id;
        notifierChangement();
        return { idOnglet: id, dejaOuvert: true, resume: resumerSession(), octets: new Uint8Array(o.octets) };
      }
    }
    const octets = await fs.promises.readFile(chemin);
    const doc = await openPdf(octets); // PdfioError en français si corrompu
    etat = {
      chemin,
      doc,
      session: createSession(doc),
      modifie: false,
      // v0.1.13 : la copie PRISTINE des octets est le point de repli de
      // chaque annulation ; les lots appliqués s'y rejouent pour reconstruire
      // l'état exact d'avant le dernier geste.
      octets: new Uint8Array(octets),
      gestes: [],
      aRefaire: [],
    };
    const idOnglet = ++sequenceOnglets;
    onglets.set(idOnglet, etat);
    ongletActifId = idOnglet;
    notifierChangement();
    return { idOnglet, resume: resumerSession(), octets: new Uint8Array(octets) };
  } catch (err) {
    return { erreur: err.message || String(err) };
  }
});

// v0.1.30 : bascule l'onglet actif. Le processus de rendu N'AVANTAGE aucun
// état : il réaffiche depuis le résumé et les octets renvoyés ici (le
// journal des gestes, l'annulation et le drapeau « modifié » vivent dans
// cet état et suivent l'onglet, pas la fenêtre).
ipcMain.handle('pdf:activate', (_e, id) => {
  try {
    const cle = Number(id);
    const cible = onglets.get(cle);
    if (!cible) return { erreur: "Cet onglet n'existe plus." };
    etat = cible;
    ongletActifId = cle;
    notifierChangement();
    return { idOnglet: cle, resume: resumerSession(), octets: new Uint8Array(cible.octets) };
  } catch (err) {
    return { erreur: err.message || String(err) };
  }
});

/** Enregistre l'état d'un onglet sur son fichier d'origine ; renvoie le
 *  chemin écrit ou jette. Partagé par pdf:save et la fermeture assistée. */
async function enregistrerOnglet(o) {
  const octets = await savePdf(o.doc);
  await fs.promises.writeFile(o.chemin, octets);
  o.modifie = false;
  return o.chemin;
}

/** v0.1.30 : l'avis d'Arthur avant de perdre un document modifié. La même
 *  boîte sert à la croix d'un onglet et à la fermeture de la fenêtre. */
async function demanderAvisFermeture(cheminFichier) {
  const choix = await dialog.showMessageBox(fenetre, {
    type: 'warning',
    title: 'Modifications non enregistrées',
    message: `« ${path.basename(cheminFichier)} » a des modifications non enregistrées.`,
    detail: 'Voulez-vous enregistrer avant de fermer ?',
    buttons: ['Enregistrer', 'Fermer sans enregistrer', 'Annuler'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  return ['enregistrer', 'fermer', 'annuler'][choix.response];
}

// v0.1.30 : fermeture d'un onglet (sa croix, Ctrl+W, menu Fichier).
// Si le document est modifié, l'avis est demandé AVANT toute suppression ;
// « Annuler » n'a aucune conséquence. Quand l'onglet fermé était l'actif,
// le plus récemment ouvert des autres prend sa place (résumé + octets pour
// le réaffichage immédiat).
ipcMain.handle('pdf:fermer', async (_e, idDemande) => {
  try {
    const cle = idDemande == null ? ongletActifId : Number(idDemande);
    const cible = onglets.get(cle);
    if (!cible) return { erreur: "Cet onglet n'existe plus." };
    if (cible.modifie) {
      const avis = await demanderAvisFermeture(cible.chemin);
      if (avis === 'annuler') return { ferme: false };
      if (avis === 'enregistrer') {
        try {
          await enregistrerOnglet(cible);
        } catch (err) {
          return { erreur: `Enregistrement impossible, l'onglet reste ouvert : ${err.message || String(err)}` };
        }
      }
    }
    onglets.delete(cle);
    let rep = { ferme: true };
    if (cle === ongletActifId) {
      const restants = [...onglets.keys()];
      if (restants.length > 0) {
        const nouveau = restants[restants.length - 1];
        etat = onglets.get(nouveau);
        ongletActifId = nouveau;
        rep = {
          ...rep,
          idOngletActif: nouveau,
          resume: resumerSession(),
          octets: new Uint8Array(etat.octets),
        };
      } else {
        etat = null;
        ongletActifId = null;
        rep = { ...rep, idOngletActif: null };
      }
    }
    notifierChangement();
    return rep;
  } catch (err) {
    return { erreur: err.message || String(err) };
  }
});

// v0.1.30 : la croix de la fenêtre (ou Alt+F4, ou le menu Quitter) sur un
// document modifié : avis pour CHAQUE onglet modifié, dans l'ordre d'ouverture.
// « Annuler » stoppe net et la fenêtre reste ; tout le reste poursuivra.
async function confirmerFermetureFenetre() {
  if (confirmationFermetureEnCours) return;
  confirmationFermetureEnCours = true;
  try {
    for (const [id, o] of onglets) {
      if (!o.modifie) continue;
      const avis = await demanderAvisFermeture(o.chemin);
      if (avis === 'annuler') return; // la fenêtre reste ouverte, rien n'est fermé
      if (avis === 'enregistrer') {
        try {
          await enregistrerOnglet(o);
        } catch (err) {
          dialog.showErrorBox(
            'Enregistrement impossible',
            `« ${path.basename(o.chemin)} » n'a pas pu être enregistré :\n${err.message || String(err)}`,
          );
          return; // la fermeture s'arrête : l'utilisateur garde la main
        }
      }
    }
    fermetureAutorisee = true;
    if (fenetre) fenetre.close();
  } finally {
    confirmationFermetureEnCours = false;
  }
}

ipcMain.handle('pdf:apply', (_e, edits) => {
  // v0.1.33 : l'état visé est capté À L'ARRIVÉE (avant l'attente dans la
  // file) : un changement d'onglet pendant l'exécution ne détourne jamais
  // la commande vers le document du nouvel onglet.
  const o = etat;
  if (!Array.isArray(edits)) return { erreur: 'Requête d\'édition mal formée.' };
  return fileEdition.enfiler(async () => {
    try {
      if (!o) return { erreur: 'Aucun document n\'est ouvert.' };
      const faits = [];
      for (const edit of edits) {
        // v0.1.11 : les fiches mixtes se posent en asynchrone (embedFont de
        // pdf-lib) ; il faut les attendre une à une pour que le résumé reflète
        // vraiment le document AVANT qu'il ne soit envoyé au rendu.
        faits.push(await o.session.apply(edit));
      }
      // v0.1.13 : les éditions EFFECTIVEMENT appliquées forment UN lot = un
      // geste rejouable ; un lot partiel (échec en milieu de lot) est journalisé
      // tel quel, il s'annulera d'un bloc avec son voisin réussi. Toute pose
      // nouvelle vide la pile « à refaire » (règle habituelle des éditeurs).
      o.gestes.push(edits.slice(0, faits.length).map((e) => JSON.parse(JSON.stringify(e))));
      o.aRefaire = [];
      o.modifie = true;
      notifierChangement(o);
      return { resume: resumerSession(o), faits };
    } catch (err) {
      return { erreur: err.message || String(err) };
    }
  });
});

// v0.1.13 : annulation par rejeu. L'état courant n'est JAMAIS touché tant
// que le rejeu du nouveau départ n'a pas réussi : toute erreur de rejeu
// renvoie { erreur } et laisse le document exactement comme avant.
ipcMain.handle('pdf:undo', () => {
  const o = etat;
  return fileEdition.enfiler(async () => {
    try {
      if (!o) return { erreur: 'Aucun document n\'est ouvert.' };
      if (!o.gestes.length) return { resume: resumerSession(o), rien: true };
      const dernier = o.gestes[o.gestes.length - 1];
      // v0.1.33 : rejeu ASSAINI. Le rejeu strict échouait pour toujours dès
      // que le journal avait dérivé (course historique, relecture d'un PDF
      // modifié par ailleurs) ; on rejoue le journal privé de son dernier
      // geste, et s'il résiste, les gestes sont abandonnés PAR LA FIN
      // jusqu'au dernier préfixe rejouable : l'annulation rend TOUJOURS la
      // main avec un état cohérent, jamais « Annotation introuvable » en
      // boucle. Les gestes abandonnés étaient déjà du travail incohérent.
      const r = await rejouerPrefixeSain(o.octets, o.gestes.slice(0, -1));
      o.gestes = o.gestes.slice(0, r.rejoues);
      o.aRefaire.push(dernier);
      o.doc = r.doc;
      o.session = r.session;
      o.modifie = o.gestes.length > 0;
      notifierChangement(o);
      return { resume: resumerSession(o), abandonnes: r.abandonnes.length };
    } catch (err) {
      return { erreur: err.message || String(err) };
    }
  });
});

// v0.1.13 : rétablissement. Le lot écarté se réapplique sur la session
// courante ; en cas d'échec, le lot RESTE sur la pile et rien ne change.
ipcMain.handle('pdf:redo', () => {
  const o = etat;
  return fileEdition.enfiler(async () => {
    try {
      if (!o) return { erreur: 'Aucun document n\'est ouvert.' };
      if (!o.aRefaire.length) return { resume: resumerSession(o), rien: true };
      const lot = o.aRefaire[o.aRefaire.length - 1];
      const faits = [];
      for (const edit of lot) faits.push(await o.session.apply(edit));
      o.aRefaire.pop();
      o.gestes.push(lot);
      o.modifie = true;
      notifierChangement(o);
      return { resume: resumerSession(o), faits };
    } catch (err) {
      // Un lot à moitié appliqué ne doit JAMAIS rester en place : on reconstruit
      // l'état en rejetant tous les gestes sains, la pile « à refaire » intacte.
      try {
        const r = await rejouerPrefixeSain(o.octets, o.gestes);
        o.doc = r.doc;
        o.session = r.session;
        // v0.1.33 : le journal se réaligne sur le préfixe sain (même règle
        // que l'annulation : l'état reconstruit et le journal coïncident).
        o.gestes = o.gestes.slice(0, r.rejoues);
      } catch (e2) { void e2; /* état inchangé ; l'erreur d'origine prime */ }
      return { erreur: err.message || String(err) };
    }
  });
});

ipcMain.handle('pdf:save', (_e, { mode } = {}) => {
  const o = etat;
  return fileEdition.enfiler(async () => {
    try {
      if (!o) return { erreur: 'Aucun document n\'est ouvert.' };
      const octets = await savePdf(o.doc);
      let cible;
      if (mode === 'timestamped') {
        const dossier = path.dirname(o.chemin);
        const base = path.basename(o.chemin, path.extname(o.chemin));
        cible = timestampedPath(dossier, base);
      } else {
        cible = o.chemin;
      }
      await fs.promises.writeFile(cible, octets);
      if (mode !== 'timestamped') {
        o.modifie = false;
      } else {
        o.modifie = false; // le contenu sauvegardé correspond aussi à l'état courant
      }
      notifierChangement(o);
      return { chemin: cible };
    } catch (err) {
      return { erreur: err.message || String(err) };
    }
  });
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

// -------------------------------------------------------------------------
// v0.1.22/v0.1.23 : OCR LaTeX (bouton ƒ LaTeX). Deux modes, réglés par le
// menu Fichier → Options OCR LaTeX… : le serveur OCR PERSONNEL de
// l'utilisateur (une URL : tout reste entre ses machines, prioritaire dès
// qu'elle existe — son PC fait tourner serveur-ocr/serveur.py) ou, à
// défaut, l'OCR Mistral en ligne (clé API conservée ici, jamais dans le
// document ni dans le dépôt).
// -------------------------------------------------------------------------

// Enregistre les options dans config.json (dossier de données de
// l'application) : { cle } (Mistral), { url } (serveur, '' pour revenir
// au mode Mistral) et { jeton } (v0.1.25 : jeton exigé par le serveur
// personnel ; '' ou null le retire).
ipcMain.handle('conf:ocr', async (_e, { cle, url, jeton } = {}) => {
  try {
    let conf;
    try {
      conf = JSON.parse(await fs.promises.readFile(cheminConfig(), 'utf8'));
    } catch { /* première écriture */ }
    if (!conf || typeof conf !== 'object' || Array.isArray(conf)) conf = {};
    if (typeof cle !== 'undefined') {
      const valeur = nettoyerCle(cle);
      if (!valeur) return { erreur: 'La clé indiquée est vide.' };
      conf.cleMistral = valeur;
    }
    if (typeof jeton !== 'undefined') {
      const valeur = String(jeton == null ? '' : jeton).trim();
      if (!valeur) delete conf.jetonOcr; // serveur sans jeton
      else conf.jetonOcr = valeur;
    }
    if (typeof url !== 'undefined') {
      if (url === null || String(url).trim() === '') {
        delete conf.serveurOcr; // retour au mode Mistral
      } else {
        const adresse = nettoyerUrlServeur(String(url));
        if (!adresse) {
          return { erreur: 'Adresse du serveur invalide : elle doit commencer par http:// ou https:// (ex. : http://100.x.y.z:8642/ocr).' };
        }
        conf.serveurOcr = adresse;
      }
    }
    await fs.promises.writeFile(cheminConfig(), JSON.stringify(conf, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { erreur: `Impossible d'enregistrer les options : ${err.message || String(err)}` };
  }
});

// Le rendu affiche l'état ; les SEULS points qui transitent sont l'URL du
// serveur (choisie par l'utilisateur) et des PRÉSENCES (clé, jeton), jamais
// les valeurs.
ipcMain.handle('conf:ocr:get', () => ({
  mode: lireServeurOcr() ? 'serveur' : 'mistral',
  serveurUrl: lireServeurOcr(),
  clePresente: lireCleMistral() !== '',
  jetonPresent: lireJetonOcr() !== '',
}));

// La zone sélectionnée, redessinée nette par le rendu, part à l'OCR
// LaTeX en vigueur ; les formules extraites reviennent pour copie.
ipcMain.handle('ocr:latex', async (_e, { dataUrl } = {}) => {
  try {
    if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
      return { erreur: 'L\'image de la zone sélectionnée est illisible : requête mal formée.' };
    }

    // v0.1.23 : serveur OCR personnel — tout local, prioritaire.
    const serveur = lireServeurOcr();
    if (serveur) {
      const reponse = await fetch(serveur, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...enteteJeton(lireJetonOcr()) },
        body: JSON.stringify({ image_url: dataUrl }),
        signal: AbortSignal.timeout(90000), // un moteur CPU peut être lent
      });
      if (reponse.status === 401) {
        // v0.1.25 : le serveur exige un jeton absent ou refusé ;
        // pas de lecture du corps, le message guide vers le réglage.
        return { erreur: messageErreurOcr(401) };
      }
      if (!reponse.ok) {
        let detail = '';
        try {
          const corps = await reponse.json();
          if (corps && typeof corps.erreur === 'string') detail = corps.erreur;
        } catch { /* corps non JSON */ }
        if (!detail) {
          try { detail = (await reponse.text()).slice(0, 200); } catch { /* silencieux */ }
        }
        return {
          erreur: `Le serveur OCR a répondu par une erreur ${reponse.status}${detail ? ` : ${detail}` : '.'}`,
        };
      }
      let contenu = null;
      try {
        contenu = await reponse.json();
      } catch {
        return { erreur: 'Réponse du serveur illisible : du JSON est attendu, de la forme { "latex": "…" }.' };
      }
      const latex = latexDepuisReponseServeur(contenu);
      if (!latex) {
        return { erreur: 'Le serveur n\'a reconnu aucune formule dans la zone sélectionnée. Cadrez la seule formule, bien accrée.' };
      }
      return { latex };
    }

    // Mode Mistral (en ligne) : chemin v0.1.22 inchangé.
    const cle = lireCleMistral();
    if (!cle) {
      return { erreur: 'Aucune clé API Mistral enregistrée. Menu Fichier → Options OCR LaTeX… (ou indiquez l\'adresse de votre serveur OCR).' };
    }
    const reponse = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cle}`,
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: { type: 'image_url', image_url: dataUrl },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (reponse.status === 401 || reponse.status === 403) {
      return { erreur: 'Clé refusée par Mistral : vérifiez-la (menu Fichier → Options OCR LaTeX…).' };
    }
    if (!reponse.ok) {
      return { erreur: `Mistral a répondu par une erreur ${reponse.status}${reponse.status === 429 ? ' (quota atteint : patientez un instant)' : ''}.` };
    }
    const contenu = await reponse.json();
    const markdown = contenu && Array.isArray(contenu.pages) && contenu.pages[0]
      ? contenu.pages[0].markdown : null;
    if (typeof markdown !== 'string') {
      return { erreur: 'Réponse de Mistral inattendue : aucun texte n\'a été reconnu.' };
    }
    return { latex: extractionLatex(markdown), markdown };
  } catch (err) {
    const nom = String((err && err.name) || err);
    if (/timeout|abort/i.test(nom)) {
      return { erreur: lireServeurOcr()
        ? 'Délai dépassé : votre serveur OCR n\'a pas répondu en 90 secondes (vérifiez qu\'il tourne et que la première reconnaissance a bien fini de télécharger les modèles).'
        : 'Délai dépassé : l\'OCR Mistral n\'a pas répondu en 30 secondes.' };
    }
    return { erreur: lireServeurOcr()
      ? 'Serveur OCR injoignable : vérifiez son adresse (menu Fichier → Options OCR LaTeX…) et qu\'il tourne bien.'
      : 'Réseau indisponible : la lecture LaTeX exige une connexion à api.mistral.ai.' };
  }
});

// v0.1.26 : le bouton « Tester la reconnaissance » des options OCR
// envoie la page courante (JPEG produit par le rendu, ~200 points par
// pouce) au endpoint /page du serveur personnel ; la page reconnue et
// son résumé lisible reviennent pour la carte. Toujours local : rien
// ne passe par Mistral.
ipcMain.handle('page:tester', async (_e, { dataUrl } = {}) => {
  try {
    if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
      return { erreur: 'L\'image de la page est illisible : rendu impossible.' };
    }
    const serveur = lireServeurOcr();
    if (!serveur) {
      return { erreur: 'Aucun serveur OCR enregistré. Menu Fichier → Options OCR LaTeX…' };
    }
    const reponse = await fetch(pageUrlDepuis(serveur), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...enteteJeton(lireJetonOcr()) },
      body: JSON.stringify({ image_url: dataUrl }),
      signal: AbortSignal.timeout(600000), // une page complète : 10 minutes
    });
    if (reponse.status === 401) {
      // Le serveur exige un jeton absent ou refusé ; le message guide
      // vers le réglage, sans lecture du corps.
      return { erreur: messageErreurOcr(401) };
    }
    if (!reponse.ok) {
      let detail = '';
      try {
        const corps = await reponse.json();
        if (corps && typeof corps.erreur === 'string') detail = corps.erreur;
      } catch { /* corps non JSON */ }
      if (!detail) {
        try { detail = (await reponse.text()).slice(0, 200); } catch { /* silencieux */ }
      }
      return {
        erreur: `Le serveur OCR a répondu par une erreur ${reponse.status}${detail ? ` : ${detail}` : '.'}`,
      };
    }
    let page = null;
    try {
      page = await reponse.json();
    } catch {
      return { erreur: 'Réponse du serveur illisible : du JSON est attendu, de la forme { "largeur": …, "hauteur": …, "blocs": … }.' };
    }
    if (!page || typeof page !== 'object' || !Array.isArray(page.blocs)) {
      return { erreur: 'Réponse du serveur inattendue : la page reconnue est mal formée.' };
    }
    return { page, resume: resumePage(page) };
  } catch (err) {
    const nom = String((err && err.name) || err);
    if (/timeout|abort/i.test(nom)) {
      return { erreur: 'Délai dépassé : votre serveur OCR n\'a pas reconnu la page en 10 minutes (vérifiez qu\'il tourne et que la première reconnaissance a bien fini de télécharger les modèles).' };
    }
    return { erreur: 'Serveur OCR injoignable : vérifiez son adresse (menu Fichier → Options OCR LaTeX…) et qu\'il tourne bien.' };
  }
});

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
