// Banc local via playwright-cli ; vrais MP4 via routes privées et relais S3 local.
async page => {
  const response = await page.request.get("http://127.0.0.1:3119/bootstrap")
  const bootstrap = response.ok() ? await response.json() : { examples: await (await page.request.get("http://127.0.0.1:3119/examples")).json() }
  if (bootstrap.cookies) await page.context().addCookies(bootstrap.cookies)
  const userAgent = await page.evaluate(() => navigator.userAgent)
  const browser = /Chrome/.test(userAgent) ? "chrome" : "webkit"
  if (browser === "webkit" && !/AppleWebKit/.test(userAgent)) throw new Error("Moteur WebKit non identifié")
  const errors = [], result = []
  const handler = e => errors.push({message:e.message.split("?")[0],stack:e.stack?.split("\n").slice(0,5).join("\n")})
  page.on("pageerror", handler)
  try {
    for (const example of bootstrap.examples) {
      for (const [width,height] of [[1440,900],[1024,768],[768,1024]]) {
        await page.waitForLoadState("networkidle",{timeout:20000})
        await page.setViewportSize({width,height})
        await page.goto(`http://127.0.0.1:3118/learner/formation?id=${example.formationId}&chapitre=${example.first}`, {waitUntil:"domcontentloaded",timeout:30000})
        await page.locator('[data-intro-video="module"]').waitFor({timeout:25000})
        await page.waitForLoadState("networkidle",{timeout:20000})
        const playback = []
        for (const kind of ["module","lesson"]) {
          const root = page.locator(`[data-intro-video="${kind}"]`)
          await root.waitFor({timeout:12000})
          if (await page.locator('video').count() !== 1) throw new Error("Lecteurs vidéo concurrents")
          const geometry = await root.evaluate(el => {const r=el.getBoundingClientRect();return {width:innerWidth,height:innerHeight,left:r.left,right:r.right,overflow:document.documentElement.scrollWidth>innerWidth+1}})
          if (geometry.width!==width || geometry.height!==height || geometry.left< -1 || geometry.right>width+1 || geometry.overflow) throw new Error("Dimensions ou débordement incorrects")
          const video = root.locator('video')
          if (width===1440) {
            await video.evaluate(v => {v.muted=true})
            await root.getByRole('button',{name:"Lire la présentation"}).click({timeout:12000})
            await page.waitForFunction(() => {const v=document.querySelector('[data-intro-video] video');return v && v.currentTime>=2.5 && v.played.length>0 && v.played.end(0)-v.played.start(0)>=2 && v.videoWidth===1920 && v.videoHeight===1080 && !v.error},null,{timeout:30000})
            const measured = await video.evaluate(v => {v.pause();return {duration:v.duration,playedSeconds:v.played.end(0)-v.played.start(0),videoWidth:v.videoWidth,videoHeight:v.videoHeight,readyState:v.readyState,error:v.error?.code??null}})
            if (!Number.isFinite(measured.duration) || measured.duration<=0 || measured.error) throw new Error("Lecture réelle refusée")
            playback.push({kind,...measured})
          }
          await page.waitForFunction(() => document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).every(a=>a.playState==='finished'),null,{timeout:15000})
          await page.screenshot({path:`/Users/switchingformation/lms-intros-mission/bureautique/preuves/${browser}-${example.app}-${width}x${height}-${kind}.png`})
          const button = root.locator(kind==='module' ? '[data-control="intro-module-commencer"]' : '[data-control="intro-commencer"], [data-control="sim-commencer"]').first()
          await button.scrollIntoViewIfNeeded({timeout:10000})
          if (!await button.isVisible() || !await button.isEnabled()) throw new Error("Bouton commencer inaccessible")
          if (kind==='module') await button.click({timeout:10000})
        }
        result.push({application:example.app,width,height,moduleThenLesson:true,buttonReachable:true,noHorizontalOverflow:true,playback})
      }
      await page.waitForLoadState("networkidle",{timeout:20000})
      await page.goto(`http://127.0.0.1:3118/learner/formation?id=${example.formationId}&chapitre=${example.second}`,{waitUntil:"domcontentloaded",timeout:30000})
      await page.locator('[data-intro-video="lesson"]').waitFor({timeout:25000})
      if (await page.locator('[data-intro-video="module"]').count()) throw new Error("Module sur leçon non première")
      await page.waitForLoadState("networkidle",{timeout:20000})
    }

    if (errors.length) throw new Error("Erreurs JavaScript : "+JSON.stringify(errors))
    return {browser,userAgent,result,javascriptErrors:0,realPlayback:true,mediaSource:"MP4 définitifs locaux, routes privées et redirections signées locales ; aucun envoi R2",playbackLimit:"Au moins 2 secondes décodées par introduction, sans saut de curseur ; audio AAC vérifié par inventaire, navigateur muet"}
  } finally {page.off("pageerror",handler)}
}
