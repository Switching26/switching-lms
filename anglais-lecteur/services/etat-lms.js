// Contrat de transport : {version:1, valeurs:{clé:{valeur,modifie}}, commun:{clé:{id:{valeur,modifie}}}}.
// Les snapshots remplacent l'état ; les compteurs ne sont jamais additionnés au serveur.
import { modeLMS, requete, idChapitre } from './base.js';
export const LIMITE_ETAT = 1024 * 1024;
const etats = new Map(), charges = new Set(), sales = new Set(), plans = new Map(), annonces = new Set();
let actif = 'U01', horloge = 0, minuterie, envoi;
const maintenant = () => (horloge = Math.max(Date.now(), horloge + 1));
const vide = () => ({ version: 1, valeurs: {}, commun: {} });
const copier = x => x === undefined ? undefined : structuredClone(x);
function cache(id, valeur) { try { localStorage.setItem(`lmsang:lms:${id}`, JSON.stringify(valeur)); return true; } catch { return false; } }
function local(id) { try { return JSON.parse(localStorage.getItem(`lmsang:lms:${id}`)) || vide(); } catch { return vide(); } }
function etat(id = actif) { if (!etats.has(id)) etats.set(id, local(id)); return etats.get(id); }
function statut(texte) { globalThis.dispatchEvent?.(new CustomEvent('anglais:sauvegarde', { detail: texte })); }
const commun = cle => cle === 'revisions' || cle === 'carnet';
function fusionCommune(cle) {
  const t = {};
  for (const e of etats.values()) for (const [id, entree] of Object.entries(e.commun?.[cle] || {})) if (!t[id] || entree.modifie > t[id].modifie) t[id] = entree;
  return t;
}
export function lireLMS(cle, defaut) {
  if (commun(cle)) {
    const t = Object.fromEntries(Object.entries(fusionCommune(cle)).filter(([,e]) => e.valeur !== null).map(([id,e]) => [id,copier(e.valeur)]));
    return cle === 'carnet' ? Object.values(t).sort((a,b) => b.ajoute_le-a.ajoute_le) : t;
  }
  let v = etat().valeurs?.[cle];
  for (const e of etats.values()) if (e.valeurs?.[cle]?.modifie > (v?.modifie || 0)) v = e.valeurs[cle];
  return v?.valeur === null || !v ? defaut : copier(v.valeur);
}
export function ecrireLMS(cle, valeur) {
  const e = copier(etat());
  if (commun(cle)) {
    const avant = fusionCommune(cle);
    const suite = cle === 'carnet' ? Object.fromEntries((valeur || []).map(x => [x.mot.trim().toLowerCase(),x])) : valeur || {};
    e.commun[cle] = { ...avant };
    for (const id of new Set([...Object.keys(avant), ...Object.keys(suite)])) if (JSON.stringify(avant[id]?.valeur ?? null) !== JSON.stringify(suite[id] ?? null)) e.commun[cle][id] = { valeur: suite[id] ?? null, modifie: maintenant() };
  } else e.valeurs[cle] = { valeur: valeur ?? null, modifie: maintenant() };
  if (new TextEncoder().encode(JSON.stringify(e)).byteLength > LIMITE_ETAT) { statut('La mémoire de ce chapitre est pleine. Votre dernière réponse n’a pas pu être conservée.'); return false; }
  e.en_attente=true; etats.set(actif,e); sales.add(actif); cache(actif,e); programmer(); return true;
}
export async function chargerEtat(id) {
  if (!modeLMS) return;
  actif = id;
  if (charges.has(id)) return;
  const copie = etat(id);
  try {
    const r = await requete(`api/etat/${idChapitre(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error('lecture');
    const serveur = await r.json();
    const distant = serveur?.version === 1 && serveur.valeurs && serveur.commun ? serveur : vide();
    // Le repli n'est rejoué que s'il porte explicitement des écritures non synchronisées.
    if (copie.en_attente) {
      for (const [k,v] of Object.entries(copie.valeurs || {})) if (v.modifie > (distant.valeurs[k]?.modifie || 0)) distant.valeurs[k]=v;
      for (const [k,t] of Object.entries(copie.commun || {})) for (const [c,v] of Object.entries(t)) { distant.commun[k] ||= {}; if (v.modifie > (distant.commun[k][c]?.modifie || 0)) distant.commun[k][c]=v; }
      sales.add(id);
    }
    etats.set(id,distant); cache(id,distant);
    if(distant.termine_annonce) annonces.add(id);
    charges.add(id);
  } catch { statut('Hors connexion : reprise conservée sur cet appareil.'); }
}
export async function chargerTransversaux() {
  if (!modeLMS) return;
  const precedent=actif;
  try {
    const r=await requete('api/niveau'); if(!r.ok) return;
    const n=await r.json(); const ids=(n.elements || []).filter(x=>x.disponible).map(x=>x.id);
    // Séries courtes : jamais 74 requêtes simultanées.
    for(let i=0;i<ids.length;i+=6) await Promise.all(ids.slice(i,i+6).map(chargerEtat));
  } catch { /* les états déjà connus restent disponibles */ }
  actif=precedent;
}
export function definirPlan(id, ids) { plans.set(id,ids); }
export function progressionLMS(id) {
  const e=etat(id), ids=plans.get(id)||[];
  const p=e.valeurs[id==='U01'?'progression-l01':`progression-${id}`]?.valeur?.etapes || {};
  const vues=ids.filter(x=>p[x]?.ouvertures>0).length, faites=ids.filter(x=>p[x]?.termine).length;
  return { vues, faites, total:ids.length, termine:ids.length>0 && faites===ids.length };
}
function programmer() { clearTimeout(minuterie); minuterie=setTimeout(()=>synchroniser(),450); }
export async function synchroniser() {
  if (!modeLMS) return;
  if (envoi) { await envoi; return; }
  envoi=(async()=>{
    for(const id of [...sales]) {
      sales.delete(id);
      const snapshot=copier(etat(id)); snapshot.en_attente=true; cache(id,snapshot);
      const p=progressionLMS(id);
      try {
        const options={headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(6000)};
        const r=await requete(`api/etat/${idChapitre(id)}`,{...options,method:'PUT',body:JSON.stringify({...snapshot,en_attente:false})}); if(!r.ok) throw new Error('écriture');
        if(p.total) {
          const r=await requete(`api/progression/${idChapitre(id)}`,{...options,method:'POST',body:JSON.stringify(p)}); if(!r.ok) throw new Error('progression');
          if(p.termine && !annonces.has(id)) { annonces.add(id); etat(id).termine_annonce=true; sales.add(id); programmer(); globalThis.parent?.postMessage({type:'anglais:termine',id:idChapitre(id)},location.origin); }
        }
        if(!sales.has(id)) { etat(id).en_attente=false; cache(id,etat(id)); }
        statut('');
      } catch { sales.add(id); statut('Sauvegarde en attente : vos réponses restent sur cet appareil.'); break; }
    }
  })();
  await envoi; envoi=null;
}
if(modeLMS) {
  globalThis.addEventListener('online',()=>synchroniser());
  // L'état local est écrit immédiatement ; une sortie ne dépend jamais du réseau.
  globalThis.addEventListener('pagehide',()=>{ for(const id of sales) { const e=copier(etat(id)); e.en_attente=true; cache(id,e); } });
}
