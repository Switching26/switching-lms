"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

/** Native dialog provides focus containment, Escape and restoration to the trigger. */
export default function Modal({ open, onClose, title, children, wide, headerAction, footer, panel = false }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
  wide?: boolean; headerAction?: React.ReactNode; footer?: React.ReactNode; panel?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    const node = dialog.current
    if (!open || !node) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    node.showModal()
    const containFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || Array.from(document.querySelectorAll("dialog[open]")).at(-1) !== node) return
      const controls = Array.from(node.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex='-1'])")).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")
      const first = controls[0], last = controls.at(-1)
      if (!first || !last) return
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", containFocus, true)
    const animation = surface.current && !matchMedia("(prefers-reduced-motion: reduce)").matches
      ? (() => {
          const r = surface.current!.getBoundingClientRect(), t = trigger?.getBoundingClientRect()
          const x = t ? t.left + t.width / 2 - (r.left + r.width / 2) : 0
          const y = t ? t.top + t.height / 2 - (r.top + r.height / 2) : 24
          return surface.current!.animate([{ opacity: 0, transform: `translate(${x * .12}px, ${y * .12}px) scale(.94)` }, { opacity: 1, transform: "translate(0, 0) scale(1)" }], { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" })
        })()
      : null
    return () => { document.removeEventListener("keydown", containFocus, true); animation?.cancel(); node.close(); document.body.style.overflow = previous; if (trigger?.isConnected) trigger.focus({ preventScroll: true }) }
  }, [open, mounted])
  useEffect(() => {
    const node = surface.current
    if (!open || !node || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let previous = node.getBoundingClientRect().height
    let moving = false, animation: Animation | undefined
    const observer = new ResizeObserver(() => {
      if (moving) return
      const height = node.getBoundingClientRect().height
      if (Math.abs(height - previous) < 2) return
      moving = true
      animation = node.animate([{ height: `${previous}px` }, { height: `${height}px` }], { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" })
      previous = height
      animation.onfinish = () => { moving = false }
    })
    observer.observe(node)
    return () => { observer.disconnect(); animation?.cancel() }
  }, [open, mounted])
  useEffect(() => {
    if (open && content.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const animation = content.current.animate([{ opacity: .45, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 180, easing: "ease-out" })
      return () => animation.cancel()
    }
  }, [title, open])
  if (!open || !mounted) return null
  return createPortal(<dialog ref={dialog} className="app-modal-overlay lms-fluid-modal" aria-label={title} onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div ref={surface} className={`app-modal-panel lms-sheet-panel ${wide ? "lms-sheet-wide" : ""} ${panel ? "lms-sheet-detail" : ""}`}>
      <div className="lms-sheet-head"><h2>{title}</h2><div className="flex items-center gap-2">{headerAction}<button aria-label="Fermer" onClick={onClose} className="lms-icon-button"><X size={20} /></button></div></div>
      <div ref={content} className="lms-sheet-content">{children}</div>
      {footer}
    </div>
  </dialog>, document.body)
}
