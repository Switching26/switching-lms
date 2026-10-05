async (page) => {
  if (!page.url().startsWith("http://lms-video-r2.localhost:3412/learner/formation")) throw new Error("Uniquement le lecteur local QA")
  const screenshots = []
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024]]) {
    await page.setViewportSize({ width, height })
    // Portrait uses the existing chapter-list collapse control; no CSS change.
    if (width === 768) {
      const collapse = page.getByRole("button", { name: "Replier les chapitres", exact: true })
      if (await collapse.count()) await collapse.click()
    }
    await page.waitForTimeout(700)
    const measurement = await page.evaluate(() => { const v = document.querySelector("video"); const r = v.getBoundingClientRect(); return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth, video: { x: r.x, y: r.y, width: r.width, height: r.height, time: v.currentTime, readyState: v.readyState } } })
    if (measurement.width !== width || measurement.height !== height || measurement.overflow || measurement.video.readyState < 2 || measurement.video.width < 100 || measurement.video.height < 80) throw new Error("Capture invalide : " + JSON.stringify(measurement))
    await page.screenshot({ path: `/Users/switchingformation/checkos/work/lms-video-r2/.local/lecteur-${width}x${height}.png`, fullPage: false })
    screenshots.push(measurement)
  }
  return { check: "Captures du lecteur réel aux trois tailles", screenshots }
}
