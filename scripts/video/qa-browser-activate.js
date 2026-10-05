async (page) => {
  if (!page.url().startsWith("http://lms-video-r2.localhost:3412/")) throw new Error("Uniquement le LMS local QA")
  const choose = page.getByRole("button", { name: "Utiliser la vidéo prête, puis enregistrer le chapitre" })
  if (await choose.count()) await choose.click()
  await page.getByRole("button", { name: "Enregistrer chapitre", exact: true }).click()
  await page.getByText("Chapitre enregistré", { exact: true }).waitFor()
  await page.reload()
  await page.getByRole("button", { name: "Modifier", exact: true }).first().click()
  await page.waitForFunction(() => { const v = document.querySelector("video[data-video-provider=r2]"); return v && v.readyState >= 2 }, { timeout: 30000 })
  return await page.evaluate(() => ({ check: "Activation par UI et aperçu après réouverture", duration: document.querySelector("video").duration, provider: document.querySelector("video").dataset.videoProvider }))
}
