async (page) => {
  if (!page.url().startsWith("http://lms-video-r2.localhost:3412/learner/formation")) throw new Error("Uniquement le lecteur local QA")
  if (!await page.evaluate(() => document.querySelector("video").ended)) {
    await page.evaluate(async () => { const v = document.querySelector("video"); v.muted = true; await v.play() })
    await page.waitForFunction(() => document.querySelector("video").ended, null, { timeout: 70000 })
  }
  await page.waitForTimeout(800)
  return await page.evaluate(() => ({ check: "Lecture jusqu’à la fin réelle du média", time: document.querySelector("video").currentTime, ended: document.querySelector("video").ended }))
}
