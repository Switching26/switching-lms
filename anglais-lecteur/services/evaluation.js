import { lire, ecrire } from './stockage.js';
import { unite } from './unite.js';
export function etatTest(id = unite()) { return lire(`test:${id}`, { debut: null, remis: null, reponses: {} }); }
export function sauverTest(t, id = unite()) { ecrire(`test:${id}`, t); }
export function commencerTest(id = unite()) { const t = etatTest(id); if (!t.debut) { t.debut = Date.now(); sauverTest(t, id); } return t; }
export function remettreTest(id = unite()) { const t = etatTest(id); t.remis = Date.now(); sauverTest(t, id); }
export function normaliser(s, tol = {}) {
  let v = String(s ?? '').trim().replace(/\s+/g, ' ');
  if (tol.apostrophes !== false) v = v.replace(/[’‘]/g, "'");
  if (tol.ponctuation_finale) v = v.replace(/[.!?]+$/, '');
  if (tol.casse !== false) v = v.toLowerCase();
  return v;
}
export function corriger(item, donne, tolerance = {}) {
  const rep = item.correction || item.reponse || { attendues: [item.bonne] };
  const attendu = [...(rep.attendues || []), ...(rep.variantes || [])].filter(x => x != null);
  const tol = { ...tolerance, ...rep.tolerance };
  const juste = attendu.some(x => normaliser(x, tol) === normaliser(donne, tol));
  const ret = item.retours || {};
  const cible = ret.cibles?.find(c => c.si?.some(x => normaliser(x, tol) === normaliser(donne, tol)));
  return { juste, attendu: attendu.join(' / '), explication: juste ? ret.juste : cible?.retour || item.distracteurs?.find(x => x.texte === donne)?.retour || ret.faux_par_defaut || ret.correction_fausse || 'Comparez votre réponse avec la forme attendue.' };
}
// Les prises restent sur l'appareil, y compris après navigation ou rechargement.
export async function garderPrise(cle, blob) {
  const db = await new Promise((ok, ko) => { const r = indexedDB.open('lms-anglais-productions', 1); r.onupgradeneeded = () => r.result.createObjectStore('prises'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  return new Promise((ok, ko) => { const tx = db.transaction('prises', 'readwrite'); tx.objectStore('prises').put(blob, cle); tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => { db.close(); ko(tx.error); }; });
}
export async function lirePrise(cle) {
  const db = await new Promise((ok, ko) => { const r = indexedDB.open('lms-anglais-productions', 1); r.onupgradeneeded = () => r.result.createObjectStore('prises'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  return new Promise((ok, ko) => { const r = db.transaction('prises').objectStore('prises').get(cle); r.onsuccess = () => { db.close(); ok(r.result); }; r.onerror = () => { db.close(); ko(r.error); }; });
}
