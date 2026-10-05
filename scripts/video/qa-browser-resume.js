async (page) => {
  if (!page.url().startsWith("http://lms-video-r2.localhost:3412/learner/formation")) throw new Error("Uniquement le lecteur local QA")
  // Page exit exercises the keepalive save, not an artificial progress PUT.
  const before = await page.evaluate(() => document.querySelector("video").currentTime)
  await page.goto("http://lms-video-r2.localhost:3412/learner/accueil")
  await page.goto("http://lms-video-r2.localhost:3412/learner/formation?id=r2-formation&chapitre=r2-chapter")
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 2 && v.currentTime >= 11 })
  const resumed = await page.evaluate(() => document.querySelector("video").currentTime)
  if (Math.abs(resumed - Math.floor(before)) > 1) throw new Error("Position à la reprise incorrecte")
  // Verify that the untouched chapter still selects exactly one Vimeo iframe.
  await page.goto("http://lms-video-r2.localhost:3412/learner/formation?id=r2-formation&chapitre=r2-vimeo")
  await page.waitForFunction(() => document.querySelectorAll("iframe[src*='player.vimeo.com']").length === 1)
  const vimeo = await page.evaluate(() => ({ iframeCount: document.querySelectorAll("iframe[src*='player.vimeo.com']").length, r2Count: document.querySelectorAll("video[data-video-provider=r2]").length }))
  if (vimeo.r2Count) throw new Error("Le chapitre Vimeo a changé de lecteur")
  await page.goto("http://lms-video-r2.localhost:3412/learner/formation?id=r2-formation&chapitre=r2-chapter")
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 2 })
  return { check: "Sauvegarde à la sortie et reprise réelle, sélection Vimeo inchangée", before, resumed, vimeo }
}
