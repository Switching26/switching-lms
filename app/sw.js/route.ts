// Service worker servi par une route (le service statique public/ ne
// fonctionne pas en standalone Railway). Volontairement SANS cache offline :
// il remplit uniquement le prérequis d'installabilité PWA — aucun risque de
// servir des pages/données périmées.
const SW_SOURCE = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
`

export function GET() {
  return new Response(SW_SOURCE, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Service-Worker-Allowed": "/",
    },
  })
}
