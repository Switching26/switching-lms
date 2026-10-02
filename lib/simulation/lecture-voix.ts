/**
 * Une lecture garde son identité jusqu'à sa fin, même si `play()` attend que le
 * navigateur reprenne le son. L'arrêt retire la source et appelle `load()` :
 * la promesse en attente est alors abandonnée, sans charger l'URL de la page.
 * Ses callbacks ne peuvent plus modifier la lecture suivante.
 */
export class ArbitreVoix {
  private courant: { interrompre: () => void } | null = null

  prendre(interrompre: () => void): () => void {
    const avant = this.courant
    const nouveau = { interrompre }
    this.courant = nouveau
    avant?.interrompre()
    return () => {
      if (this.courant === nouveau) this.courant = null
    }
  }
}

// Les consignes et les bulles ont deux éléments Audio, mais une seule voix peut
// parler dans la page. Le silence de déblocage ne prend pas cette priorité.
const arbitreCommun = new ArbitreVoix()

type Horloge = {
  maintenant: () => number
  programmer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  annuler: (id: ReturnType<typeof setTimeout>) => void
}

type OptionsLecture = {
  onDemarre?: () => void
  onFin?: () => void
  onEchec?: (erreur: unknown) => void
  onArret?: () => void
  /** Une bulle n'a le droit de parler que pendant sa fenêtre d'affichage. */
  limiteMs?: number
}

type Lecture = {
  audio: HTMLAudioElement
  options: OptionsLecture
  demarree: boolean
  echeance: number | null
  minuterie: ReturnType<typeof setTimeout> | null
  liberer: (() => void) | null
  detacher: () => void
}

export class LecteurVoix {
  private courante: Lecture | null = null

  constructor(
    private obtenirAudio: () => HTMLAudioElement | null,
    private arbitre: ArbitreVoix = arbitreCommun,
    private horloge: Horloge = {
      maintenant: () => performance.now(),
      programmer: (fn, ms) => setTimeout(fn, ms),
      annuler: (id) => clearTimeout(id),
    },
  ) {}

  arreter(notifier = true): void {
    const lecture = this.courante
    if (!lecture) return
    // Invalider AVANT pause/load, qui peuvent rejeter l'ancien play.
    this.nettoyer(lecture)
    lecture.audio.pause()
    lecture.audio.removeAttribute("src")
    lecture.audio.load()
    if (notifier) lecture.options.onArret?.()
  }

  jouer(url: string, options: OptionsLecture = {}): void {
    this.lancer(url, options, true)
  }

  debloquer(silence: string, onDebloque?: () => void): void {
    const audio = this.obtenirAudio()
    // Un play encore en attente est aussi une lecture : paused ne suffit pas.
    if (!audio || this.courante || !audio.paused) return
    this.lancer(silence, {
      onDemarre: () => {
        this.arreter(false)
        onDebloque?.()
      },
    }, false)
  }

  private nettoyer(lecture: Lecture): void {
    if (this.courante === lecture) this.courante = null
    lecture.detacher()
    if (lecture.minuterie !== null) this.horloge.annuler(lecture.minuterie)
    lecture.liberer?.()
  }

  private lancer(url: string, options: OptionsLecture, exclusif: boolean): void {
    this.arreter()
    const audio = this.obtenirAudio()
    if (!audio) return
    const lecture: Lecture = {
      audio,
      options,
      demarree: false,
      echeance: options.limiteMs == null ? null : this.horloge.maintenant() + options.limiteMs,
      minuterie: null,
      liberer: null,
      detacher: () => {},
    }
    this.courante = lecture
    if (exclusif) lecture.liberer = this.arbitre.prendre(() => this.arreter())

    const demarre = () => {
      if (this.courante !== lecture) return
      // Les minuteries peuvent être suspendues en arrière-plan. Un playing
      // tardif doit respecter l'échéance même avant la reprise de sa minuterie.
      if (lecture.echeance !== null && this.horloge.maintenant() >= lecture.echeance) {
        this.arreter()
        return
      }
      if (lecture.demarree) return
      lecture.demarree = true
      options.onDemarre?.()
    }
    const fin = () => {
      if (this.courante !== lecture) return
      this.nettoyer(lecture)
      options.onFin?.()
    }
    const echec = (erreur: unknown) => {
      if (this.courante !== lecture) return
      this.arreter(false)
      options.onEchec?.(erreur)
    }
    const erreurMedia = () => echec(audio.error)
    audio.addEventListener("playing", demarre)
    audio.addEventListener("ended", fin)
    audio.addEventListener("error", erreurMedia)
    lecture.detacher = () => {
      audio.removeEventListener("playing", demarre)
      audio.removeEventListener("ended", fin)
      audio.removeEventListener("error", erreurMedia)
    }
    if (options.limiteMs != null) {
      lecture.minuterie = this.horloge.programmer(() => {
        if (this.courante === lecture) this.arreter()
      }, options.limiteMs)
    }
    try {
      audio.src = url
      const promesse = audio.play()
      if (promesse && typeof promesse.then === "function") promesse.then(demarre, echec)
      else demarre()
    } catch (erreur) {
      echec(erreur)
    }
  }
}
