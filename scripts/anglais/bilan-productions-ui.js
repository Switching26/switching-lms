async rootPage => {
 const c=__COMPTES__;await rootPage.goto('http://127.0.0.1:3096/login',{waitUntil:'domcontentloaded'});await rootPage.getByLabel('Email',{exact:false}).fill(c.apprenant);await rootPage.getByLabel('Mot de passe',{exact:true}).fill(c.password);await rootPage.getByRole('button',{name:'Se connecter →',exact:true}).click();await rootPage.waitForURL('**/learner/**');
 await rootPage.goto('http://127.0.0.1:3096/learner/formation?id='+c.formationId+'&chapitre='+c.chapitres.T1,{waitUntil:'domcontentloaded'});await rootPage.frameLocator('iframe.anglais-frame').locator('#app[data-pret]').waitFor();const page=rootPage.frames().find(f=>f.url().includes('/anglais/index.html'));

 const base='http://127.0.0.1:3096/anglais',checks=[];
 rootPage.setDefaultTimeout(12000);await rootPage.bringToFront();
 const check=(nom,ok)=>{checks.push({nom,ok});if(!ok)throw Error(nom)};
 const goto=async route=>{await page.goto(base+'/index.html?lms=1&id=T1&bilan-qa='+Date.now()+'#/unite/T1/'+route,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#app')?.dataset.pret==='1',null,{polling:100});};
 const state=()=>page.evaluate(async()=> (await import('/anglais/services/evaluation.js')).etatTest('T1'));
 const reset=async()=>{await goto('');await page.evaluate(async()=>{(await import('/anglais/services/evaluation.js')).sauverTest({debut:Date.now(),remis:null,reponses:{}},'T1');await(await import('/anglais/services/etat-lms.js')).synchroniser();});};
 const submit=async()=>{await goto('bilan');await page.locator('[data-remettre]').click();await page.locator('[data-resultats] section').first().waitFor();};
 const section=nom=>page.locator('[data-resultats] section').filter({has:page.getByRole('heading',{name:nom,exact:true})});
 try {
 await reset();
 for(const fichier of ['ecoute','exercices']){
  const data=await(await rootPage.request.get(base+'/contenu/T1/script/'+fichier+'.json')).json();
  for(const et of data.etapes.filter(e=>e.id.startsWith('t1-lex-'))){
   await goto('etape/'+et.id);
   for(const [i,item] of et.items.entries()){
    await page.locator('[data-saisie]').waitFor();
    if(item.options)await page.locator('[data-saisie]').getByRole('button',{name:item.bonne,exact:true}).click();
    else await page.locator('[data-saisie] input').fill(item.reponse.attendues[0]);
    await page.locator('[data-valider]').click();
    await page.waitForFunction(async id=>Boolean((await import('/anglais/services/evaluation.js')).etatTest('T1').reponses[id]),et.id+':'+item.id,{polling:100});
   }
  }
 }
 const rs=Object.values((await state()).reponses);check('six réponses attendues réellement enregistrées',rs.length===6&&rs.every(r=>r.juste||r.mediaAbsent));check('quatre réponses lecture et écriture correctes',rs.filter(r=>r.juste&&!r.mediaAbsent).length>=4);
 await submit();
 check('écrit 33 % avec les questions automatiques non répondues', (await section('Écrire').innerText()).includes('33 %'));
 check('oral sans score automatique', (await section('Parler').innerText()).includes('Pas de score automatique'));
 check('deux productions jamais visitées non rendues',await page.getByText('Production non rendue',{exact:true}).count()===2);
 check('aucune production absente à relire',await page.locator('[data-resultats]').getByText(/1 à relire/).count()===0);
 await reset();
 for(const id of ['t1-ecrire2','t1-oral1']){await goto('etape/'+id);await page.locator('button[data-passer]').click();await page.waitForFunction(async id=>Object.values((await import('/anglais/services/evaluation.js')).etatTest('T1').reponses).some(r=>r.etape===id&&r.passe),id,{polling:100});}
 await submit();
 check('productions passées non rendues',await page.getByText('Production non rendue',{exact:true}).count()===2);
 check('écrit automatique vide reste zéro', (await section('Écrire').innerText()).includes('0 %'));
 check('oral passé sans score automatique', (await section('Parler').innerText()).includes('Pas de score automatique'));
 await reset();await goto('etape/t1-ecrire2');await page.locator('textarea').fill('Hello! My name is Alex. I am a teacher. I am from Bristol. I am ready. Where is Helen?');await page.locator('[data-valider]').click();
 await page.waitForFunction(async()=>Object.values((await import('/anglais/services/evaluation.js')).etatTest('T1').reponses).some(r=>r.etape==='t1-ecrire2'&&!r.passe),null,{polling:100});
 await submit();
 check('production écrite déposée à relire',(await section('Écrire').innerText()).includes('1 à relire'));
 check('texte déposé conservé',(await section('Écrire').innerText()).includes('My name is Alex'));
 check('oral seul non rendu',await page.getByText('Production non rendue',{exact:true}).count()===1);
 check('dépôt humain ne donne aucun point automatique',(await section('Écrire').innerText()).includes('0 %'));
 }catch(error){return {checks,failure:error.message,url:page.url()};}
 return {checks};
}
