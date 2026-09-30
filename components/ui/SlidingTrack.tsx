"use client"

import { useEffect, useRef, type ReactNode } from "react"

/** One persistent indicator, shared by navigation, filters and reader tabs. */
export default function SlidingTrack({ children, className = "", activeKey, label, role, gesture = true }: {
  children: ReactNode
  className?: string
  activeKey: string
  label: string
  role?: "tablist"
  gesture?: boolean
}) {
  const track = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const root = track.current, indicator = thumb.current
    if (!root || !indicator) return
    let drag: { x: number; y: number; moved: boolean; target?: HTMLElement; id: number } | null = null
    let cancelClick = false
    let pendingTarget: HTMLElement | null = null
    let pendingTimer: ReturnType<typeof setTimeout> | undefined
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(":scope > a, :scope > button")).filter(el => el.offsetWidth)
    const sync = () => {
      const selected = items().find(el => el.getAttribute("aria-current") === "page" || el.getAttribute("aria-selected") === "true")
      if (selected === pendingTarget) { pendingTarget = null; clearTimeout(pendingTimer) }
      const active = pendingTarget || selected
      if (!active) { indicator.style.opacity = "0"; return }
      indicator.style.opacity = "1"
      indicator.style.width = `${active.offsetWidth}px`
      indicator.style.height = `${active.offsetHeight}px`
      indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`
    }
    const down = (e: PointerEvent) => {
      if (!gesture || e.button !== 0) return
      drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }
    }
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (!drag.moved && Math.abs(dy) > Math.abs(dx) + 5) { drag = null; return }
      if (!drag.moved && Math.abs(dx) < 9) return
      drag.moved = true
      const buttons = items(), r = root.getBoundingClientRect()
      if (!buttons.length) return
      try { root.setPointerCapture(e.pointerId) } catch {}
      drag.target = buttons.reduce((a, b) => Math.abs(b.getBoundingClientRect().left + b.offsetWidth / 2 - e.clientX) < Math.abs(a.getBoundingClientRect().left + a.offsetWidth / 2 - e.clientX) ? b : a)
      indicator.style.transition = "none"
      indicator.style.width = `${drag.target.offsetWidth}px`
      indicator.style.height = `${drag.target.offsetHeight}px`
      indicator.style.transform = `translate(${Math.max(4, Math.min(root.offsetWidth - drag.target.offsetWidth - 4, e.clientX - r.left - drag.target.offsetWidth / 2))}px, ${drag.target.offsetTop}px)`
    }
    const up = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return
      const gesture = drag
      drag = null
      indicator.style.transition = ""
      if (gesture.moved && gesture.target) {
        e.preventDefault()
        pendingTarget = gesture.target
        clearTimeout(pendingTimer)
        pendingTimer = setTimeout(() => { pendingTarget = null; sync() }, 2500)
        gesture.target.click()
        cancelClick = true
        setTimeout(() => { cancelClick = false }, 0)
        queueMicrotask(sync)
      } else sync()
    }
    const cancel = () => { drag = null; indicator.style.transition = ""; sync() }
    const click = (e: MouseEvent) => { if (cancelClick && e.isTrusted) { e.preventDefault(); e.stopPropagation(); cancelClick = false } }
    const observer = new ResizeObserver(sync)
    observer.observe(root)
    items().forEach(el => observer.observe(el))
    const mutations = new MutationObserver(sync)
    mutations.observe(root, { subtree: true, attributes: true, attributeFilter: ["aria-current", "aria-selected"] })
    root.addEventListener("pointerdown", down)
    root.addEventListener("pointermove", move)
    root.addEventListener("pointerup", up)
    root.addEventListener("pointercancel", cancel)
    root.addEventListener("click", click, true)
    document.fonts.ready.then(sync)
    sync()
    return () => {
      clearTimeout(pendingTimer)
      observer.disconnect(); mutations.disconnect()
      root.removeEventListener("pointerdown", down); root.removeEventListener("pointermove", move)
      root.removeEventListener("pointerup", up); root.removeEventListener("pointercancel", cancel)
      root.removeEventListener("click", click, true)
    }
  }, [activeKey, gesture])
  return <div ref={track} className={`lms-sliding-track ${className}`} aria-label={label} role={role}>
    <span ref={thumb} className="lms-sliding-thumb" aria-hidden="true" />
    {children}
  </div>
}
