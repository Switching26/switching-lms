async (page) => {
  if (!page.url().startsWith("http://lms-video-r2.localhost:3412/")) throw new Error("Uniquement le LMS local QA")
  await page.goto("http://lms-video-r2.localhost:3412/login")
  await page.locator("input[type=email]").fill("r2-learner@test.invalid")
  await page.locator("input[type=password]").fill("video-r2-local-qa-2026")
  await page.getByRole("button", { name: "Se connecter →", exact: true }).click()
  await page.waitForURL("**/learner/**")
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("http://lms-video-r2.localhost:3412/learner/formation?id=r2-formation&chapitre=r2-chapter")
  await page.waitForFunction(() => { const v = document.querySelector("video[data-video-provider=r2]"); return v && v.readyState >= 2 })
  const resumed = await page.evaluate(() => document.querySelector("video").currentTime)
  if (resumed < 7 || resumed > 10) throw new Error("Reprise à la dernière position incorrecte : " + resumed)
  await page.evaluate(async () => { const v = document.querySelector("video"); v.muted = true; await v.play() })
  await page.waitForFunction(() => document.querySelector("video").currentTime >= 12)
  const result = await page.evaluate(() => { const v = document.querySelector("video"); v.pause(); return { currentTime: v.currentTime, duration: v.duration, readyState: v.readyState, width: innerWidth, height: innerHeight, paused: v.paused, iframeCount: document.querySelectorAll("iframe").length } })
  if (result.iframeCount) throw new Error("Un lecteur externe persiste sur le chapitre R2")
  return { check: "Lecture réelle HLS et reprise", resumed, ...result }
}
