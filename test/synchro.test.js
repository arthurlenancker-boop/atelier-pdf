// v0.1.33 : la file de commandes du processus principal. DIAGNOSTIC du
// correctif : les canaux IPC d'édition (pdf:apply, pdf:undo, pdf:redo,
// pdf:save) sont ASYNCHRONES et le client envoie AUTANT de messages qu'il
// veut (répétition de Ctrl+Z, pendant un rejeu long). Sans file, deux
// annulations se chevauchent : toutes deux lisent le journal d'avant,
// dépilement double, l'état reconstruit ne correspond plus au journal —
// chaque pose suivante décale ses références, l'annulation tombe sur
// « Annotation introuvable » (retour d'Arthur : « j'ai trop cette erreur
// pour bien travailler »). CI SEULEMENT : aucune dépendance.
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { creerFileDeCommandes } = require('../engine/synchro.js');

test('synchro : les commandes s’exécutent une par une, dans l’ordre d’arrivée', async () => {
  const file = creerFileDeCommandes();
  const journal = [];
  const lentes = [3, 1, 2].map((n) => file.enfiler(async () => {
    journal.push(`debut ${n}`);
    for (let k = 0; k < n; k += 1) await Promise.resolve();
    journal.push(`fin ${n}`);
    return n * 10;
  }));
  const valeurs = await Promise.all(lentes);
  assert.deepStrictEqual(valeurs, [30, 10, 20], 'chaque commande rend SA valeur');
  assert.deepStrictEqual(journal, [
    'debut 3', 'fin 3',
    'debut 1', 'fin 1',
    'debut 2', 'fin 2',
  ], 'aucun chevauchement, ordre FIFO strict (arrivée 3, 1, 2)');
});

test('synchro : la faillite d’une commande n’emporte pas la file', async () => {
  const file = creerFileDeCommandes();
  const p1 = file.enfiler(async () => { throw new Error('rate'); });
  const p2 = file.enfiler(async () => 'ensuite');
  await assert.rejects(() => p1, /rate/);
  assert.strictEqual(await p2, 'ensuite', 'la commande suivante vit sa vie');
});

test('synchro : la file serialise aussi les commandes synchrones mitoyennes', async () => {
  const file = creerFileDeCommandes();
  let enCours = 0;
  let pic = 0;
  const dix = [...Array(10).keys()].map((k) => file.enfiler(async () => {
    enCours += 1;
    pic = Math.max(pic, enCours);
    await Promise.resolve();
    enCours -= 1;
    return k;
  }));
  assert.deepStrictEqual(await Promise.all(dix), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.strictEqual(pic, 1, 'jamais plus d’une commande à la fois');
});
