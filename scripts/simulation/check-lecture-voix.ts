/**
 * Régression des play() différés : aucune attente audio dans la démonstration,
 * aucune ancienne promesse ne peut reprendre, couper ou déclarer en échec la
 * voix suivante. Deux lecteurs représentent les hooks consigne et bulle.
 *
 * npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node","target":"ES2020"}' scripts/simulation/check-lecture-voix.ts
 */
import assert from "node:assert/strict"
import { ArbitreVoix, LecteurVoix } from "../../lib/simulation/lecture-voix"

class AudioDiffere extends EventTarget {
  src = ""
  paused = true
  error: unknown = null
  chargements = 0
  pauses = 0
  erreurSynchrone: unknown = null
  ancienNavigateur = false
  appels: { url: string; annule: boolean; resolve: () => void; reject: (e: unknown) => void }[] = []

  play(): Promise<void> | undefined {
    if (this.erreurSynchrone) throw this.erreurSynchrone
    if (this.ancienNavigateur) {
      this.paused = false
      return undefined
    }
    return new Promise<void>((resolve, reject) => {
      this.appels.push({ url: this.src, annule: false, resolve, reject })
    })
  }
  pause(): void {
    this.pauses++
    this.paused = true
  }
  removeAttribute(nom: string): void {
    assert.equal(nom, "src")
    this.src = ""
  }
  load(): void {
    this.chargements++
    for (const appel of this.appels) appel.annule = true
  }
  commencer(index = this.appels.length - 1): void {
    const appel = this.appels[index]
    if (!appel.annule) {
      this.paused = false
      this.dispatchEvent(new Event("playing"))
    }
    // Une ancienne promesse peut encore se résoudre malgré l'annulation :
    // c'est précisément le callback qu'on vérifie, indépendamment du moteur.
    appel.resolve()
  }
  finir(): void {
    this.paused = true
    this.dispatchEvent(new Event("ended"))
  }
}

class HorlogeFausse {
  temps = 0
  prochain = 0
  taches = new Map<number, { fn: () => void; a: number }>()
  maintenant = () => this.temps
  programmer = (fn: () => void, ms: number): ReturnType<typeof setTimeout> => {
    const id = ++this.prochain
    this.taches.set(id, { fn, a: this.temps + ms })
    return id as unknown as ReturnType<typeof setTimeout>
  }
  annuler = (id: ReturnType<typeof setTimeout>) => { this.taches.delete(id as unknown as number) }
  avancer(ms: number): void {
    this.temps += ms
    for (const [id, t] of [...this.taches]) {
      if (t.a <= this.temps) {
        this.taches.delete(id)
        t.fn()
      }
    }
  }
}

const viderPromesses = async () => { await Promise.resolve(); await Promise.resolve() }
function banc(arbitre = new ArbitreVoix()) {
  const audio = new AudioDiffere()
  const horloge = new HorlogeFausse()
  const lecteur = new LecteurVoix(() => audio as unknown as HTMLAudioElement, arbitre, horloge)
  return { audio, horloge, lecteur }
}
let controles = 0
async function verifier(nom: string, fn: () => void | Promise<void>) {
  await fn()
  controles++
  console.log(`✓ ${nom}`)
}

async function main() {
  await verifier("arrêt : source retirée, load appelé, succès différé ignoré", async () => {
    const { audio, lecteur } = banc()
    let demarres = 0
    lecteur.jouer("ancienne.mp3", { onDemarre: () => demarres++ })
    lecteur.arreter()
    assert.equal(audio.src, "")
    assert.equal(audio.chargements, 1)
    audio.commencer(0)
    await viderPromesses()
    assert.equal(demarres, 0)
    assert(audio.paused)
  })

  await verifier("ancien rejet : ne vide ni ne met en échec la nouvelle lecture", async () => {
    const { audio, lecteur } = banc()
    let erreurs = 0, demarres = 0
    lecteur.jouer("ancienne.mp3", { onEchec: () => erreurs++ })
    lecteur.jouer("nouvelle.mp3", { onDemarre: () => demarres++ })
    audio.appels[0].reject({ name: "NotAllowedError" })
    audio.commencer(1)
    await viderPromesses()
    assert.equal(erreurs, 0)
    assert.equal(demarres, 1)
    assert.equal(audio.src, "nouvelle.mp3")
    assert(!audio.paused)
    lecteur.arreter()
  })

  await verifier("succès du silence différé : ne coupe pas la consigne suivante", async () => {
    const { audio, lecteur } = banc()
    let debloques = 0
    lecteur.debloquer("silence.wav", () => debloques++)
    lecteur.jouer("consigne.mp3")
    audio.commencer(1)
    await viderPromesses()
    const pauses = audio.pauses
    audio.commencer(0)
    await viderPromesses()
    assert.equal(debloques, 0)
    assert.equal(audio.pauses, pauses)
    assert(!audio.paused)
    lecteur.arreter()
  })

  await verifier("rejet du silence différé : aucune erreur de la nouvelle piste", async () => {
    const { audio, lecteur } = banc()
    let erreurs = 0
    lecteur.debloquer("silence.wav")
    lecteur.jouer("consigne.mp3", { onEchec: () => erreurs++ })
    audio.appels[0].reject({ name: "AbortError" })
    audio.commencer(1)
    await viderPromesses()
    assert.equal(erreurs, 0)
    assert(!audio.paused)
    lecteur.arreter()
  })

  await verifier("bulle : play en attente annulé à l'échéance sans attendre le son", async () => {
    const { audio, lecteur, horloge } = banc()
    let demarres = 0
    lecteur.jouer("bulle.mp3", { limiteMs: 3430, onDemarre: () => demarres++ })
    horloge.avancer(3429)
    assert.equal(audio.src, "bulle.mp3")
    horloge.avancer(1)
    assert.equal(audio.src, "")
    audio.commencer()
    await viderPromesses()
    assert.equal(demarres, 0)
  })

  await verifier("arrière-plan : playing tardif s'arrête même avant la minuterie suspendue", async () => {
    const { audio, lecteur, horloge } = banc()
    let demarres = 0
    lecteur.jouer("bulle.mp3", { limiteMs: 8000, onDemarre: () => demarres++ })
    horloge.temps = 240000 // aucun callback de minuterie exécuté
    audio.commencer()
    await viderPromesses()
    assert(audio.paused)
    assert.equal(audio.src, "")
    assert.equal(demarres, 0)
    assert.equal(horloge.taches.size, 0)
  })

  await verifier("deux canaux : la consigne annule la dernière bulle différée", async () => {
    const arbitre = new ArbitreVoix()
    const bulle = banc(arbitre), guide = banc(arbitre)
    let bullesDemarrees = 0
    bulle.lecteur.jouer("bulle4.mp3", { onDemarre: () => bullesDemarrees++ })
    guide.lecteur.jouer("consigne.mp3")
    assert.equal(bulle.audio.src, "")
    guide.audio.commencer()
    bulle.audio.commencer()
    await viderPromesses()
    assert.equal(bullesDemarrees, 0)
    assert(bulle.audio.paused)
    assert(!guide.audio.paused)
    guide.lecteur.arreter()
  })

  await verifier("deux canaux : une bulle coupe la consigne et annule sa file", async () => {
    const arbitre = new ArbitreVoix()
    const guide = banc(arbitre), bulle = banc(arbitre)
    let file = ["suite.mp3"], fins = 0
    guide.lecteur.jouer("consigne.mp3", { onArret: () => { file = [] }, onFin: () => fins++ })
    guide.audio.commencer()
    bulle.lecteur.jouer("bulle.mp3")
    guide.audio.finir()
    await viderPromesses()
    assert.deepEqual(file, [])
    assert.equal(fins, 0)
    assert(guide.audio.paused)
    bulle.lecteur.arreter()
  })

  await verifier("fin naturelle : enchaînement des segments sans interruption", async () => {
    const { audio, lecteur } = banc()
    let arrets = 0
    lecteur.jouer("premier.mp3", {
      onArret: () => arrets++,
      onFin: () => lecteur.jouer("second.mp3"),
    })
    audio.commencer()
    audio.finir()
    audio.commencer()
    await viderPromesses()
    assert.equal(arrets, 0)
    assert.equal(audio.src, "second.mp3")
    lecteur.arreter()
  })

  await verifier("refus actuel : erreur signalée une fois puis rejeu possible", async () => {
    const { audio, lecteur } = banc()
    const refus = { name: "NotAllowedError" }
    const erreurs: unknown[] = []
    lecteur.jouer("consigne.mp3", { onEchec: (e) => erreurs.push(e) })
    audio.appels[0].reject(refus)
    await viderPromesses()
    assert.deepEqual(erreurs, [refus])
    assert.equal(audio.src, "")
    lecteur.jouer("consigne.mp3")
    audio.commencer()
    await viderPromesses()
    assert(!audio.paused)
    lecteur.arreter()
  })

  await verifier("erreur média actuelle : libère la voix et vide la source", () => {
    const { audio, lecteur } = banc()
    let erreurs = 0
    lecteur.jouer("illisible.mp3", { onEchec: () => erreurs++ })
    audio.error = { code: 3 }
    audio.dispatchEvent(new Event("error"))
    assert.equal(erreurs, 1)
    assert.equal(audio.src, "")
  })

  await verifier("exception synchrone de play : traitée comme un échec courant", () => {
    const { audio, lecteur } = banc()
    let erreurs = 0
    audio.erreurSynchrone = { name: "NotAllowedError" }
    lecteur.jouer("consigne.mp3", { onEchec: () => erreurs++ })
    assert.equal(erreurs, 1)
    assert.equal(audio.src, "")
  })

  await verifier("ancien navigateur sans promesse : début signalé une seule fois", () => {
    const { audio, lecteur } = banc()
    let demarres = 0
    audio.ancienNavigateur = true
    lecteur.jouer("consigne.mp3", { onDemarre: () => demarres++ })
    audio.dispatchEvent(new Event("playing"))
    assert.equal(demarres, 1)
    lecteur.arreter()
  })

  await verifier("fin de bulle : ancienne minuterie ne coupe pas la piste suivante", () => {
    const { audio, lecteur, horloge } = banc()
    lecteur.jouer("bulle.mp3", { limiteMs: 3430 })
    audio.commencer()
    audio.finir()
    lecteur.jouer("consigne.mp3")
    audio.commencer()
    horloge.avancer(10000)
    assert.equal(audio.src, "consigne.mp3")
    assert(!audio.paused)
    lecteur.arreter()
  })

  await verifier("démontage : succès tardif ne notifie plus le composant", async () => {
    const { audio, lecteur } = banc()
    let notifications = 0
    lecteur.jouer("consigne.mp3", { onDemarre: () => notifications++, onArret: () => notifications++ })
    lecteur.arreter(false)
    audio.commencer()
    await viderPromesses()
    assert.equal(notifications, 0)
  })

  await verifier("déblocage : ne remplace pas un play réel encore en attente", () => {
    const { audio, lecteur } = banc()
    lecteur.jouer("consigne.mp3")
    assert(audio.paused)
    lecteur.debloquer("silence.wav")
    assert.equal(audio.appels.length, 1)
    assert.equal(audio.src, "consigne.mp3")
    lecteur.arreter()
  })

  await verifier("deux silences : les déblocages des deux éléments restent indépendants", async () => {
    const arbitre = new ArbitreVoix()
    const guide = banc(arbitre), bulle = banc(arbitre)
    let debloques = 0
    guide.lecteur.debloquer("silence.wav", () => debloques++)
    bulle.lecteur.debloquer("silence.wav", () => debloques++)
    guide.audio.commencer()
    bulle.audio.commencer()
    await viderPromesses()
    assert.equal(debloques, 2)
    assert(guide.audio.paused && bulle.audio.paused)
  })

  await verifier("arbitrage : l'ancien propriétaire ne libère pas la nouvelle voix", () => {
    const arbitre = new ArbitreVoix()
    const premier = banc(arbitre), second = banc(arbitre), dernier = banc(arbitre)
    premier.lecteur.jouer("premier.mp3")
    second.lecteur.jouer("second.mp3")
    dernier.lecteur.jouer("dernier.mp3")
    assert.equal(premier.audio.src, "")
    assert.equal(second.audio.src, "")
    assert.equal(dernier.audio.src, "dernier.mp3")
    dernier.lecteur.arreter()
  })

  console.log(`${controles} contrôles comportementaux de lecture différée réussis.`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
