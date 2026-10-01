// Recette locale uniquement, utilise les comptes fictifs préparés par preparer-recette-locale.ts.
import fs from 'node:fs/promises';import{createHash}from'node:crypto';
const base=process.env.ANGLAIS_TEST_URL||'http://127.0.0.1:3096';const comptes=JSON.parse(await fs.readFile('.local/comptes.json','utf8'));const results=[];
if(!['127.0.0.1','localhost','anglais.localhost'].includes(new URL(base).hostname))throw Error('Recette locale uniquement');
function check(n,ok,details){results.push({test:n,ok,details});if(!ok)throw Error(n+' '+JSON.stringify(details));}
async function login(email){const cookies=new Map(); const request=async(path,opts={})=>{const r=await fetch(base+path,{...opts,redirect:'manual',headers:{...opts.headers,cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}});for(const c of r.headers.getSetCookie()){const p=c.split(';')[0];cookies.set(p.slice(0,p.indexOf('=')),p.slice(p.indexOf('=')+1))}return r;};const csrf=await(await request('/api/auth/csrf')).json();await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password:comptes.password,csrfToken:csrf.csrfToken,callbackUrl:base+'/learner/accueil'})});return request;}
try{
const anonyme=await fetch(base+'/anglais/services/base.js');check('sans session JS',anonyme.status===401,anonyme.status);
const sans=await login(comptes.sansInscription);const refus=await sans('/anglais/api/lecon/U01');check('sans inscription',refus.status===403,refus.status);
const user=await login(comptes.apprenant);
const mediaRefus=await sans('/anglais/audio/l01-c2-r03-ex.mp3');check('média sans inscription',mediaRefus.status===403,mediaRefus.status);
for(const url of ['/anglais/api/lecon/U01','/anglais/api/lecon/U05','/anglais/api/activites','/anglais/contenu/U01/script/exercices.json']){const r=await user(url);check(url,r.status===200,r.status)}
const blancs=await user('/anglais/api/lecon/BLANC1');check('blanc non publié',blancs.status===403,blancs.status);
for(const path of ['/anglais/assets/%2e%2e%2f%2e%2e%2f.env.local','/anglais/assets/%252e%252e/test','/anglais/assets/%2Fetc/passwd','/anglais/assets/..%5C..%5C.env.local']){const r=await user(path);check('chemin borné '+path,r.status>=400,r.status)}
const v={version:1,valeurs:{recette:{valeur:'retrouvée',modifie:100}},commun:{}};
let r=await user('/anglais/api/etat/G01',{method:'PUT',headers:{'Content-Type':'application/json',origin:base},body:JSON.stringify(v)});check('écriture état',r.status===200,r.status);
r=await user('/anglais/api/etat/G01');check('relecture état',(await r.json()).valeurs.recette.valeur==='retrouvée');
await user('/anglais/api/etat/G01',{method:'PUT',body:JSON.stringify({...v,valeurs:{recette:{valeur:'ancienne',modifie:50}}})});check('ancien appareil ne régresse pas',(await(await user('/anglais/api/etat/G01')).json()).valeurs.recette.valeur==='retrouvée');
r=await user('/anglais/api/etat/G01',{method:'PUT',body:JSON.stringify({...v,x:'x'.repeat(1024*1024)})});check('borne 1 Mio',r.status===413,r.status);
r=await sans('/anglais/api/etat/G01');check('état sans inscription',r.status===403,r.status);
r=await user('/anglais/api/etat/G01',{method:'PUT',headers:{origin:'https://evil.invalid'},body:JSON.stringify(v)});check('origine étrangère',r.status===403,r.status);
const plan=await(await user('/anglais/api/lecon/G01')).json();const total=plan.etapes.length;
r=await user('/anglais/api/progression/G01',{method:'POST',body:JSON.stringify({vues:total,faites:total,total,termine:true})});check('chapitre terminé',r.status===200,r.status);check('complétion relue',(await(await user('/anglais/api/progression/G01')).json()).termine===true);
r=await user('/anglais/api/progression/G01',{method:'POST',body:JSON.stringify({vues:0,faites:0,total,termine:true})});check('complétion incohérente refusée',r.status===400,r.status);
const manifest=JSON.parse(await fs.readFile('.local/medias-inventaire.json','utf8'));
for(const ext of ['.mp3','.mp4','.jpg']){const f=manifest.find(f=>f.chemin.endsWith(ext));r=await user('/anglais/'+f.chemin,{headers:{Range:'bytes=0-1023'}});check('Range '+ext,r.status===206&&r.headers.get('content-range')===`bytes 0-1023/${f.taille}`,{status:r.status,range:r.headers.get('content-range')});await r.arrayBuffer();}
const vf=manifest.find(f=>f.chemin.endsWith('.mp4'));const vr=await user('/anglais/'+vf.chemin,{headers:{Range:'bytes=0-'}});const vb=Buffer.from(await vr.arrayBuffer());check('vidéo complète 206 empreinte identique',vr.status===206&&createHash('sha256').update(vb).digest('hex')===vf.sha256);
const f=manifest.find(f=>f.chemin.endsWith('.mp3'));r=await user('/anglais/'+f.chemin,{headers:{Range:'bytes=-128'}});check('Range suffixe',r.status===206&&(await r.arrayBuffer()).byteLength===128);
r=await user('/anglais/'+f.chemin,{headers:{Range:'bytes=999999999-'}});check('Range hors fichier',r.status===416,r.status);
r=await user('/anglais/api/prononciation',{method:'POST',body:'test'});const note=await r.json();check('note indisponible',note.code==='indisponible'&&note.ok===false,note.code);
const admin=await login(comptes.admin);r=await admin('/anglais/api/lecon/BLANC1');check('aperçu admin blanc',r.status===200,r.status);
r=await fetch(base+'/api/anglais/import',{method:'POST',body:'{}'});check('import sans secret',r.status===401,r.status);
await fs.writeFile('.local/api-recette.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}catch(e){await fs.writeFile('.local/api-recette.json',JSON.stringify(results,null,2));throw e;}
