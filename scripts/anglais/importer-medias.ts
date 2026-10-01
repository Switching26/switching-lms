/** Même script local/production. Inventaire puis transfert reprenable par fichiers/morceaux.
 * ANGLAIS_IMPORT_SECRET=... npx tsx scripts/anglais/importer-medias.ts --url http://localhost:3096 --apply
 * Sans --apply : mesure uniquement. --replace autorise explicitement les changements de médias.
 */
import fs from 'node:fs/promises'
import {inventaire,empreinte,Media} from './sources'
async function main(){
 const args=process.argv;const url=args[args.indexOf('--url')+1];const apply=args.includes('--apply')
 const {fichiers}=await inventaire();const manifest:Media[]=[]
 for(const [chemin,source] of fichiers){manifest.push({chemin,source,taille:(await fs.stat(source)).size,sha256:await empreinte(source)})}
 const octets=manifest.reduce((n,f)=>n+f.taille,0);console.log(JSON.stringify({nombre:manifest.length,octets,Mo:Math.round(octets/1024/1024),mode:apply?'transfert':'mesure'},null,2))
 await fs.mkdir('.local',{recursive:true});await fs.writeFile('.local/medias-inventaire.json',JSON.stringify(manifest,null,2))
 if(!apply)return
 if(!/^https?:\/\//.test(url)||!process.env.ANGLAIS_IMPORT_SECRET)throw Error('--url et ANGLAIS_IMPORT_SECRET requis')
 const endpoint=new URL('/api/anglais/import',url)
 const request=async(query:string,method='GET',body?:any,type='application/json')=>{
  for(let retry=0;;retry++){
   try{const r=await fetch(endpoint+query,{method,headers:{Authorization:'Bearer '+process.env.ANGLAIS_IMPORT_SECRET,'Content-Type':type},body,signal:AbortSignal.timeout(90000)});const result=await r.json();if(!r.ok)throw Error(`${r.status} ${JSON.stringify(result)}`);return result}
   catch(e){if(retry>=2||method==='PUT')throw e;await new Promise(r=>setTimeout(r,1000*(retry+1)))}
  }
 }
 const init=await request('','POST',JSON.stringify({action:'initialiser',fichiers:manifest.map(({source,...f})=>f),remplacer:args.includes('--replace')}))
 console.log(`Import ${init.id}, remplacement ${init.remplacer?'autorisé':'interdit'}`)
 const tranche=4*1024*1024
 const debut=Number(args[args.indexOf('--from')+1])||0;const limite=args.includes('--limit')?Number(args[args.indexOf('--limit')+1]):manifest.length
 if(!Number.isInteger(debut)||debut<0||!Number.isInteger(limite)||limite<1)throw Error('Bornes --from/--limit invalides')
 for(let i=debut;i<Math.min(manifest.length,debut+limite);i++){
  const f=manifest[i];const query=`?id=${init.id}&fichier=${i}`
  let state=await request(query)
  if(!state.termine){const file=await fs.open(f.source,'r');try{
   let incidents=0
   while(!state.termine){
    const buffer=Buffer.alloc(Math.min(tranche,f.taille-state.offset));await file.read(buffer,0,buffer.length,state.offset)
    try{state=await request(query+'&offset='+state.offset,'PUT',buffer,'application/octet-stream');incidents=0}
    catch(e){if(++incidents>3)throw e;state=await request(query)}
   }
  }finally{await file.close()}}
  if(i%100===0||i===manifest.length-1)console.log(`${i+1}/${manifest.length} vérifiés/transférés`)
 }
 if(debut+limite<manifest.length){console.log(`Lot terminé. Reprendre avec --from ${debut+limite} --limit ${limite}. La dernière passe vérifiera TOUT le manifeste.`);return}
 const verification=await request(`?id=${init.id}&action=verifier`,'POST',JSON.stringify({action:'verifier'}))
 await fs.writeFile('.local/medias-verification.json',JSON.stringify(verification,null,2));if(!verification.ok)throw Error(JSON.stringify(verification));console.log('Réception vérifiée :',JSON.stringify(verification))
}
main().catch(e=>{console.error(e);process.exitCode=1})
