async (page) => {
  if (!page.url().startsWith("http://lms-video-r2.localhost:3412/")) throw new Error("Uniquement le LMS local QA")
  await page.getByRole("button", { name: "Modifier", exact: true }).first().click()
  await page.getByLabel("Déposer une vidéo dans le LMS").setInputFiles("/Users/switchingformation/checkos/work/lms-video-r2/.local/qa-video.mp4")
  await page.getByText("Vidéo déposée. En attente de conversion.").waitFor({ timeout: 45000 })
  return { check: "Dépôt réel depuis l’éditeur admin", status: "QUEUED" }
}
