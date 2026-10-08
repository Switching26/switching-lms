"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { Maximize2, Minimize2 } from "lucide-react"

/** Changer la géométrie, jamais l'emplacement React des lecteurs persistants. */
export function useImmersion(visible = true) {
  const cadre = useRef<HTMLDivElement>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const [active, setActive] = useState(false)
  const reduire = useCallback(() => {
    setActive(false)
    bouton.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    const media = matchMedia("(min-width: 768px)")
    const synchroniser = () => { if (!media.matches) setActive(false) }
    media.addEventListener("change", synchroniser)
    return () => media.removeEventListener("change", synchroniser)
  }, [])
  useEffect(() => { if (!visible) setActive(false) }, [visible])
  useEffect(() => {
    const el = cadre.current
    if (!active || !visible || !el) return
    const restaurer: (() => void)[] = []
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    // Aussi en aperçu admin : neutraliser les ancêtres qui capturent un fixed,
    // sans déplacer l'iframe ni le canvas dans un portail à l'entrée du mode.
    let enfant: HTMLElement = el
    while (enfant.parentElement) {
      const parent = enfant.parentElement
      for (const voisin of Array.from(parent.children)) {
        if (!(voisin instanceof HTMLElement) || voisin === enfant || /^(SCRIPT|STYLE|LINK)$/.test(voisin.tagName)) continue
        const inert = voisin.inert, aria = voisin.getAttribute("aria-hidden")
        voisin.inert = true
        voisin.setAttribute("aria-hidden", "true")
        voisin.classList.add("lms-immersion-masque")
        restaurer.push(() => {
          voisin.inert = inert
          if (aria === null) voisin.removeAttribute("aria-hidden"); else voisin.setAttribute("aria-hidden", aria)
          voisin.classList.remove("lms-immersion-masque")
        })
      }
      if (parent === document.body) break
      const avant = parent.getAttribute("style")
      parent.style.setProperty("transform", "none", "important")
      parent.style.setProperty("filter", "none", "important")
      parent.style.setProperty("perspective", "none", "important")
      parent.style.setProperty("contain", "none", "important")
      parent.style.setProperty("animation", "none", "important")
      parent.style.setProperty("overflow", "visible", "important")
      restaurer.push(() => { if (avant === null) parent.removeAttribute("style"); else parent.setAttribute("style", avant) })
      enfant = parent
    }
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || el.querySelector("[data-immersion-panel-open]")) return
      e.preventDefault()
      reduire()
    }
    window.addEventListener("keydown", echap)
    // Le clavier d'une iframe de même origine ne remonte pas au parent.
    const cadres = Array.from(el.querySelectorAll("iframe"))
    const fenetres = new Set<Window>()
    const brancher = () => cadres.forEach(frame => {
      try {
        const w = frame.contentWindow
        if (w && w.location.origin === location.origin && !fenetres.has(w)) {
          w.addEventListener("keydown", echap); fenetres.add(w)
        }
      } catch { /* HLS conserve son clavier et son lecteur persistants. */ }
    })
    brancher(); cadres.forEach(frame => frame.addEventListener("load", brancher))
    return () => {
      window.removeEventListener("keydown", echap)
      cadres.forEach(frame => frame.removeEventListener("load", brancher))
      fenetres.forEach(w => { try { w.removeEventListener("keydown", echap) } catch {} })
      restaurer.reverse().forEach(fn => fn())
      document.body.style.overflow = overflow
    }
  }, [active, visible, reduire])
  return { cadre, bouton, active: active && visible, basculer: () => {
    if (active) reduire()
    else if (matchMedia("(min-width: 768px)").matches) setActive(true)
  } }
}

export const ContexteImmersion = createContext<ReturnType<typeof useImmersion> | null>(null)

export function BoutonImmersion({ controle, sombre = false }: { controle?: ReturnType<typeof useImmersion>; sombre?: boolean }) {
  const contexte = useContext(ContexteImmersion)
  const mode = controle ?? contexte
  if (!mode) return null
  const Icone = mode.active ? Minimize2 : Maximize2
  return <button ref={mode.bouton} type="button" className={`lms-agrandir lms-bar-button lms-bar-icon${sombre ? " lms-agrandir-sombre" : ""}`} data-control="formation-agrandir" aria-label={mode.active ? "Réduire" : "Agrandir"} aria-pressed={mode.active} title={mode.active ? "Réduire" : "Agrandir"} onClick={mode.basculer}>
    <Icone size={18} aria-hidden="true" />
  </button>
}
