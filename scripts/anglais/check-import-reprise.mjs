import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
const env=await fs.readFile('.env.local','utf8');const secret=/^ANGLAIS_IMPORT_SECRET=(.+)$/m.exec(env)[1];const url='http://127.0.0.1:3096/api/anglais/import';
const results=[];function assert(n,v){results.push({test:n,ok:v});if(!v)throw Error(n)}
async function r(q='',method='GET',body){const res=await fetch(url+q,{method,headers:{Authorization:'Bearer '+secret},body});return{status:res.status,...await res.json()}}
const buf=Buffer.alloc(3000,65),sha256=createHash('sha256').update(buf).digest('hex');const chemin='recette/reprise-'+Date.now()+'.txt';
let init=await r('','POST',JSON.stringify({action:'initialiser',fichiers:[{chemin,taille:buf.length,sha256}]}));const q='?id='+init.id+'&fichier=0';
assert('import commence',(await r(q+'&offset=0','PUT',buf.subarray(0,1024))).offset===1024);
assert('offset relu après interruption',(await r(q)).offset===1024);
assert('morceau doublé refusé',(await r(q+'&offset=0','PUT',buf.subarray(0,1024))).status===409);
assert('reprise et empreinte',(await r(q+'&offset=1024','PUT',buf.subarray(1024))).termine===true);
assert('renvoi identique idempotent',(await r(q+'&offset=0','PUT',buf.subarray(0,1024))).termine===true);
let other=await r('','POST',JSON.stringify({action:'initialiser',fichiers:[{chemin,taille:buf.length,sha256:'a'.repeat(64)}]}));assert('écrasement différent refusé',(await r('?id='+other.id+'&fichier=0')).status===409);
assert('traversée refusée',(await r('','POST',JSON.stringify({action:'initialiser',fichiers:[{chemin:'../hors-volume',taille:1,sha256}]}))).status===400);
await fs.symlink('/etc', '.local/uploads/anglais/recette/lien-test');
let link=await r('','POST',JSON.stringify({action:'initialiser',fichiers:[{chemin:'recette/lien-test/test',taille:1,sha256}]}));assert('lien symbolique refusé',(await r('?id='+link.id+'&fichier=0')).status===400);
await fs.unlink('.local/uploads/anglais/recette/lien-test');await fs.unlink('.local/uploads/anglais/'+chemin);
await fs.writeFile('.local/import-reprise.json',JSON.stringify(results,null,2));console.log(results)
