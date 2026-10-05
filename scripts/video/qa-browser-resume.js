async (page) => {
  if (!page.url().startsWith("http://lms-video-r2.localhost:3412/learner/formation")) throw new Error("Uniquement le lecteur local QA")
  // Page exit exercises the keepalive save, not an artificial progress PUT.
  const before = await page.evaluate(() => document.querySelector("video").currentTime)
  await page.goto("http://lms-video-r2.localhost:3412/learner/accueil")
  await page.goto("http://lms-video-r2.localhost:3412/learner/formation?id=r2-formation&chapitre=r2-chapter")
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 2 && v.currentTime >= 11 })
  const resumed = await page.evaluate(() => document.querySelector("video").currentTime)
  if (Math.abs(resumed - Math.floor(before)) > 1) throw new Error("Position à la reprise incorrecte")
  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll("video[data-video-provider=r2]").length === 1)
  const playerCount = await page.locator("video[data-video-provider=r2]").count()
  if (await page.locator("iframe").count()) throw new Error("Lecteur externe inattendu")
  return { check: "Sauvegarde à la sortie et reprise réelle, un seul lecteur HLS", before, resumed, playerCount }
}
