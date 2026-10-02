async page => {
 const c=__COMPTES__;const base=__BASE__;const checks=[],captures=[];
 page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
 const check=(nom,ok)=>{checks.push({nom,ok});if(!ok)throw Error(nom)};
 const role=__ROLE__;
 const cliquerLecteur=async selector=>{const l=page.frameLocator('iframe.anglais-frame').locator(selector);await l.scrollIntoViewIfNeeded();await l.click();};
 try{
 await page.goto(base+'/login',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Email',{exact:false}).fill(c[role]);await page.getByLabel('Mot de passe',{exact:true}).fill(c.password);
 await page.getByRole('button',{name:'Se connecter →',exact:true}).click();await page.waitForURL(role==='admin'?'**/super-admin/**':'**/learner/**');
 await page.goto(base+(role==='admin'?'/super-admin/formations/'+c.formationId+'/preview':'/learner/formation?id='+c.formationId+'&chapitre='+c.chapitres.U10),{waitUntil:'domcontentloaded'});
 const ouvrir=async id=>{await page.frameLocator('iframe.anglais-frame').locator('#app[data-pret]').waitFor();const frame=page.frames().find(f=>f.url().includes('/anglais/index.html'));await frame.waitForSelector('#app[data-pret]');await frame.evaluate(id=>parent.postMessage({type:'anglais:naviguer',vers:'chapitre',id},location.origin),id);await page.locator('iframe.anglais-frame[src*="id='+id+'"]').waitFor();await page.frameLocator('iframe.anglais-frame').locator('#app[data-pret]').waitFor()};
 for(const width of [390,768,1440]){
  await page.bringToFront();await page.setViewportSize({width,height:width===390?844:width===768?1024:900});await page.reload({waitUntil:'domcontentloaded'});await ouvrir('U10');await page.frameLocator('iframe.anglais-frame').locator('body').evaluate(()=>{window.__clic=[];document.addEventListener('click',e=>window.__clic.push({t:Date.now(),target:e.target.outerHTML.slice(0,200)}),true);});
  const fermer=page.locator('.lms-reader-sidebar button[aria-label="Fermer"]');if(width===768&&await fermer.isVisible())await fermer.click();
  const f=page.frameLocator('iframe.anglais-frame');check(role+' mots '+width,await f.locator('.mots-unite li').count()===32);
  check(role+' largeur hôte '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check(role+' largeur lecteur '+width,await f.locator('html').evaluate(e=>e.scrollWidth<=innerWidth));
  check(role+' cibles '+width,await f.locator('.mots-unite button,.fiches-unite a').evaluateAll(ns=>ns.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44})));
  await cliquerLecteur('.fiches-unite a[href="#/unite/V04"]');await page.locator('iframe.anglais-frame[src*="id=V04"]').waitFor();await page.frameLocator('iframe.anglais-frame').locator('#app[data-pret]').waitFor();
  check(role+' clic V04 '+width,true);await ouvrir('U10');check(role+' retour U10 '+width,await page.frameLocator('iframe.anglais-frame').locator('.mots-unite li').count()===32);
  const dossier='/Users/switchingformation/checkos/scratchpads/lms-anglais-l1/ENRICH/';
  await f.locator('#titre-mots').scrollIntoViewIfNeeded();await page.waitForTimeout(400);const mots=dossier+'lms-final-'+role+'-'+width+'.png';await page.screenshot({path:mots});captures.push(mots);
  await cliquerLecteur('a[href$="/etape/l10-lex-decouverte-4"]');await f.locator('.xa-image.forme-entiere').waitFor();await f.locator('[data-rejouer]').click();
  check(role+' forme entière '+width,await f.locator('.xa-image').evaluate(el=>getComputedStyle(el).backgroundSize==='contain'&&getComputedStyle(el).transform==='none'));
  await f.locator('.xa-scene').scrollIntoViewIfNeeded();await page.waitForTimeout(400);const forme=dossier+'lms-forme-'+role+'-'+width+'.png';await page.screenshot({path:forme});captures.push(forme);

 }
 await ouvrir('U03');await cliquerLecteur('.fiches-unite a[href="#/unite/G20"]');await page.locator('iframe.anglais-frame[src*="id=G20"]').waitFor();check(role+' clic G20',true);
 return {checks,captures};
 }catch(error){return {checks,captures,failure:error.message,url:page.url(),clics:await page.frameLocator('iframe.anglais-frame').locator('body').evaluate(()=>({clics:window.__clic,attente:Object.entries(localStorage).filter(([k,v])=>k.startsWith('lmsang:lms:')&&JSON.parse(v).en_attente).map(([k])=>k)}))}};
}
