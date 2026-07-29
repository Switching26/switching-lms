"use client"

/**
 * Le bureau autour d'Excel — direction C, validée par Samuel le 29/07/2026.
 *
 * Il enveloppe la fenêtre Excel : quand le scénario ne déclare pas de `poste`,
 * ce composant n'est même pas monté et les 243 chapitres existants s'ouvrent
 * comme avant, directement dans le classeur.
 *
 * DÉCOR NEUTRE, PAS UNE COPIE DE WINDOWS (choix Samuel). Barre des tâches,
 * bouton Démarrer, icônes : assez reconnaissable pour que l'apprenant
 * transpose sur sa propre machine, sans reprendre les visuels de Microsoft et
 * sans se périmer à la prochaine version de Windows.
 *
 * Les gestes passent par les mêmes `data-control` que le ruban : le simulateur
 * ne fait pas de différence entre cliquer « Gras » et cliquer « Démarrer »,
 * c'est le scénario qui juge. Une couche de plus, pas un moteur de plus.
 */

import { useEffect, useRef, useState } from "react"
import type { PosteState } from "@/lib/simulation/types"
import { CONTROLES_POSTE } from "@/lib/simulation/poste"

type Props = {
  poste: PosteState
  /** Contrôle cliqué : remonté tel quel au simulateur, comme un bouton du ruban. */
  onControl: (controlId: string) => void
  /** Enregistrement validé depuis la boîte de dialogue. */
  onEnregistrer: (nom: string) => void
  /** Ouverture validée depuis la boîte « Ouvrir ». */
  onOuvrir: (nom: string) => void
  /** Contrôle à mettre en évidence (halo d'aide). */
  highlight?: string | null
  /** La fenêtre Excel — rendue seulement quand un classeur est ouvert. */
  children: React.ReactNode
}

/** Halo d'aide, identique à celui du ruban. */
const halo = (actif: boolean): React.CSSProperties =>
  actif ? { boxShadow: "0 0 0 3px rgba(232,163,61,.85)", animation: "sim-poste-pulse 1.3s ease-in-out infinite" } : {}

export default function DesktopLayer({ poste, onControl, onEnregistrer, onOuvrir, highlight, children }: Props) {
  const [nomFichier, setNomFichier] = useState("")
  useEffect(() => {
    // Excel propose « Classeur1 » quand rien n'a encore été enregistré : sans
    // ce défaut, valider une boîte vide ne produisait aucun fichier et l'étape
    // restait bloquée sans que l'apprenant comprenne pourquoi.
    if (poste.boite === "enregistrer") setNomFichier(poste.classeur ?? "Classeur1")
  }, [poste.boite, poste.classeur])

  // Sélection dans la boîte « Ouvrir ». Le premier fichier est présélectionné :
  // une liste où rien n'est choisi rend le bouton Ouvrir incompréhensible.
  const [choisi, setChoisi] = useState<string | null>(null)
  useEffect(() => {
    if (poste.boite === "ouvrir") setChoisi(poste.fichiers[0]?.nom ?? null)
  }, [poste.boite, poste.fichiers])

  // La fenêtre restant montée, son animation d'ouverture ne se rejoue plus
  // toute seule : on la relance à chaque lancement d'Excel. Sans elle, la
  // fenêtre apparaîtrait d'un coup et le clic n'aurait aucun accusé de réception.
  const fenetreRef = useRef<HTMLDivElement>(null)
  const ferme = poste.excel === "ferme"
  useEffect(() => {
    if (ferme) return
    const el = fenetreRef.current
    if (!el) return
    el.classList.remove("sim-poste-fen-in")
    void el.offsetWidth // force le navigateur à repartir de zéro
    el.classList.add("sim-poste-fen-in")
  }, [ferme])

  const fichiersBureau = poste.fichiers.filter((f) => f.surBureau !== false)

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      // Hauteur plancher : la fenêtre Excel et le menu Démarrer sont positionnés
      // en absolu et n'imposent donc aucune hauteur. Dans un parent qui n'en
      // donne pas, le bureau s'effondrait à la seule barre des tâches et le menu
      // s'ouvrait hors de l'écran, en coordonnées négatives.
      style={{ minHeight: 520, background: "linear-gradient(155deg,#123027 0%,#1B4536 45%,#0D211B 100%)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(680px 300px at 74% 16%, rgba(78,208,138,.14), transparent 70%)" }}
      />

      {/* Icônes du bureau. Les classeurs enregistrés viennent s'y poser : c'est
          la preuve visible, pour l'apprenant, que son travail a été sauvegardé. */}
      <div className="absolute left-2.5 top-2.5 z-[2] flex flex-col gap-3">
        <div className="text-center text-[9.5px] leading-tight" style={{ width: 64, color: "#D6E4DE" }}>
          <span
            aria-hidden
            className="mx-auto mb-1 flex items-center justify-center rounded-lg"
            style={{ width: 34, height: 34, background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.15)", fontSize: 15 }}
          >
            🗑
          </span>
          Corbeille
        </div>
        {fichiersBureau.map((f) => (
          <button
            key={f.nom}
            type="button"
            data-control={CONTROLES_POSTE.fichier(f.nom)}
            onClick={() => onControl(CONTROLES_POSTE.fichier(f.nom))}
            className="text-center text-[9.5px] leading-tight"
            style={{ width: 64, color: "#D6E4DE", ...halo(highlight === CONTROLES_POSTE.fichier(f.nom)) }}
            title={`${f.nom}.xlsx`}
          >
            <span
              aria-hidden
              className="mx-auto mb-1 flex items-center justify-center rounded-lg font-extrabold"
              style={{ width: 34, height: 34, background: "#fff", color: "#107C41", border: "1px solid #D8D3C9", fontSize: 12 }}
            >
              X
            </span>
            <span className="line-clamp-2 block">{f.nom}</span>
          </button>
        ))}
      </div>

      {/* Menu Démarrer */}
      {poste.menu && (
        <div
          className="absolute z-20 rounded-xl p-3"
          style={{
            left: 8,
            bottom: 44,
            width: "min(300px, 76%)",
            background: "rgba(16,32,27,.97)",
            border: "1px solid rgba(255,255,255,.12)",
            boxShadow: "0 24px 60px -20px rgba(0,0,0,.7)",
            animation: "sim-poste-menu .18s ease both",
          }}
        >
          <p className="mb-2 text-[10px] uppercase tracking-[.1em]" style={{ color: "#7E938C" }}>
            Applications
          </p>
          {/* Grille posée en style, pas en classe utilitaire : `grid-cols-4`
              peut manquer du CSS livré, et les tuiles retombaient alors en
              colonne unique — un menu Démarrer haut comme la moitié de l'écran. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
            {poste.apps.map((a) => (
              <button
                key={a.id}
                type="button"
                data-control={CONTROLES_POSTE.app(a.id)}
                onClick={() => onControl(CONTROLES_POSTE.app(a.id))}
                className="rounded-lg px-1 py-2 text-center text-[9.5px]"
                style={{
                  background: "rgba(255,255,255,.07)",
                  border: "1px solid rgba(255,255,255,.08)",
                  color: "#DCE9E4",
                  ...halo(highlight === CONTROLES_POSTE.app(a.id)),
                }}
              >
                <span
                  aria-hidden
                  className="mb-1 block text-[15px] font-extrabold"
                  style={{ color: a.ouvrable ? "#4ED08A" : "#B7C6C0" }}
                >
                  {a.ouvrable ? "X" : a.nom.slice(0, 1)}
                </span>
                {a.nom}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* La fenêtre. Elle reste MONTÉE même Excel fermé, et seulement masquée :
          la démonter détruirait le moteur du tableur, qu'il faudrait recharger
          en entier au lancement suivant — et le travail déjà saisi serait perdu
          si l'apprenant ferme la fenêtre puis revient en arrière. */}
      {
        <div
          ref={fenetreRef}
          className="absolute z-10 flex-col overflow-hidden"
          style={{
            left: "4%",
            right: "4%",
            top: "3.5%",
            bottom: "4%",
            borderRadius: "9px 9px 0 0",
            boxShadow: "0 30px 70px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.08)",
            display: poste.excel === "ferme" ? "none" : "flex",
          }}
        >
          <div
            className="flex flex-shrink-0 items-center gap-2 px-2.5 py-1 text-[11px] text-white"
            style={{ background: "#107C41" }}
          >
            <span
              aria-hidden
              className="flex items-center justify-center rounded-[3px] text-[8px] font-bold"
              style={{ width: 15, height: 15, background: "rgba(255,255,255,.22)" }}
            >
              X
            </span>
            <span className="truncate">
              {poste.classeur ? `${poste.classeur}.xlsx` : "Classeur1"} — Excel
              {poste.modifie ? " •" : ""}
            </span>
            <span className="ml-auto flex gap-0.5">
              <button
                type="button"
                data-control={CONTROLES_POSTE.reduire}
                onClick={() => onControl(CONTROLES_POSTE.reduire)}
                title="Réduire"
                aria-label="Réduire la fenêtre"
                className="rounded px-2 text-[11px] hover:bg-white/20"
                style={halo(highlight === CONTROLES_POSTE.reduire)}
              >
                ─
              </button>
              <button
                type="button"
                title="Agrandir"
                aria-label="Agrandir la fenêtre"
                className="rounded px-2 text-[11px] hover:bg-white/20"
              >
                ▢
              </button>
              <button
                type="button"
                data-control={CONTROLES_POSTE.fermer}
                onClick={() => onControl(CONTROLES_POSTE.fermer)}
                title="Fermer"
                aria-label="Fermer la fenêtre"
                className="rounded px-2 text-[11px]"
                style={{ ...halo(highlight === CONTROLES_POSTE.fermer) }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#D1382E")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                ✕
              </button>
            </span>
          </div>

          {poste.excel === "accueil" ? (
            /* Écran d'accueil d'Excel : c'est par là qu'on choisit un classeur
               vierge ou un modèle — la leçon « Créer à partir d'un modèle »
               n'avait aucun endroit où se jouer. */
            <div className="flex min-h-0 flex-1 bg-white">
              <div
                className="flex-shrink-0 border-r px-1.5 py-3 text-[10px]"
                style={{ width: 92, background: "#F5F3EF", borderColor: "#E4E0D8", color: "#6E6A62" }}
              >
                <div className="rounded-md bg-white px-1 py-1.5 text-center font-bold" style={{ color: "#107C41" }}>
                  Accueil
                </div>
                <div className="px-1 py-1.5 text-center">Nouveau</div>
                {/* « Ouvrir » est le seul chemin vers un fichier existant tant
                    qu'aucun classeur n'est chargé : le ruban, lui, n'existe pas
                    encore sur cet écran. */}
                <button
                  type="button"
                  data-control={CONTROLES_POSTE.ouvrir}
                  onClick={() => onControl(CONTROLES_POSTE.ouvrir)}
                  className="w-full rounded-md px-1 py-1.5 text-center"
                  style={halo(highlight === CONTROLES_POSTE.ouvrir)}
                >
                  Ouvrir
                </button>
              </div>
              <div className="min-w-0 flex-1 overflow-hidden p-3.5">
                <p className="mb-2.5 text-[15px] font-bold text-ink">Bonjour</p>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    data-control={CONTROLES_POSTE.nouveau}
                    onClick={() => onControl(CONTROLES_POSTE.nouveau)}
                    className="text-left"
                    style={{ width: 86, ...halo(highlight === CONTROLES_POSTE.nouveau) }}
                  >
                    <span
                      className="mb-1 flex items-center justify-center rounded-md text-[9px]"
                      style={{ height: 56, border: "1px solid #107C41", boxShadow: "inset 0 0 0 1px #107C41", color: "#9B958B", background: "#fff" }}
                    >
                      vide
                    </span>
                    <span className="block text-center text-[9.5px] text-ink">Nouveau classeur</span>
                  </button>
                  {/* Modèles : structure, formules et présentation déjà en
                      place. Les ouvrir donne une COPIE — le modèle ne bouge
                      pas, et c'est toute la leçon. */}
                  {poste.modeles.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      data-control={CONTROLES_POSTE.modele(m.id)}
                      onClick={() => onControl(CONTROLES_POSTE.modele(m.id))}
                      className="text-left"
                      style={{ width: 86, ...halo(highlight === CONTROLES_POSTE.modele(m.id)) }}
                    >
                      <span
                        className="mb-1 flex flex-col justify-center rounded-md px-1.5 py-1"
                        style={{ height: 56, gap: 3, border: "1px solid #DDD8CE", background: "#fff" }}
                        aria-hidden
                      >
                        <span className="block h-[4px] rounded-sm" style={{ background: "#107C41", width: "68%" }} />
                        <span className="block h-[3px] rounded-sm" style={{ background: "#E4E0D8" }} />
                        <span className="block h-[3px] rounded-sm" style={{ background: "#E4E0D8", width: "82%" }} />
                        <span className="block h-[3px] rounded-sm" style={{ background: "#E4E0D8", width: "60%" }} />
                        <span className="mt-[2px] block h-[4px] rounded-sm" style={{ background: "#C9BFA8", width: "44%" }} />
                      </span>
                      <span className="block truncate text-center text-[9.5px] text-ink">{m.nom}</span>
                    </button>
                  ))}
                  {poste.fichiers.slice(0, 2).map((f) => (
                    <button
                      key={f.nom}
                      type="button"
                      data-control={CONTROLES_POSTE.fichier(f.nom)}
                      onClick={() => onControl(CONTROLES_POSTE.fichier(f.nom))}
                      className="text-left"
                      style={{ width: 86, ...halo(highlight === CONTROLES_POSTE.fichier(f.nom)) }}
                    >
                      <span
                        className="mb-1 flex items-center justify-center rounded-md px-1 text-center text-[9px]"
                        style={{ height: 56, border: "1px solid #DDD8CE", color: "#9B958B", background: "#fff" }}
                      >
                        récent
                      </span>
                      <span className="block truncate text-center text-[9.5px] text-ink">{f.nom}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {/* Le classeur reste MONTÉ même sur l'écran d'accueil : démonter la
              grille perdrait l'état d'Univer et coûterait un rechargement complet
              du moteur. On le masque, et le player le notifie d'un resize au
              retour — Univer exige une hauteur définie pour se rendre. */}
          <div
            className="min-h-0 flex-1 flex-col overflow-hidden bg-white"
            style={{ display: poste.excel === "classeur" ? "flex" : "none" }}
          >
            {children}
          </div>
        </div>
      }

      {/* Boîte « Enregistrer sous ». Son animation lui est propre : celle de la
          fenêtre écraserait le transform de centrage. */}
      {poste.boite === "enregistrer" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enregistrer sous"
          className="absolute z-30 overflow-hidden rounded-xl bg-white"
          style={{
            left: "50%",
            top: "50%",
            width: "min(380px, 86%)",
            transform: "translate(-50%,-50%)",
            boxShadow: "0 30px 70px -18px rgba(0,0,0,.6)",
            animation: "sim-poste-boite .22s cubic-bezier(.2,.9,.2,1) both",
          }}
        >
          <p className="border-b px-3 py-2 text-[11.5px] font-bold" style={{ background: "#F5F3EF", borderColor: "#E4E0D8" }}>
            Enregistrer sous
          </p>
          <div className="p-3">
            <label className="mb-1 block text-[10.5px] text-warm-500" htmlFor="poste-nom">
              Nom du fichier
            </label>
            <input
              id="poste-nom"
              value={nomFichier}
              onChange={(e) => setNomFichier(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  onEnregistrer(nomFichier)
                }
              }}
              className="mb-2.5 w-full rounded-lg border px-2.5 py-1.5 text-[12px] text-ink outline-none"
              style={{ borderColor: "#DDD8CE" }}
            />
            <label className="mb-1 block text-[10.5px] text-warm-500" htmlFor="poste-lieu">
              Emplacement
            </label>
            <select
              id="poste-lieu"
              className="mb-3 w-full rounded-lg border px-2.5 py-1.5 text-[12px] text-ink outline-none"
              style={{ borderColor: "#DDD8CE" }}
            >
              <option>Bureau</option>
              <option>Documents</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-control={CONTROLES_POSTE.enregistrerAnnuler}
                onClick={() => onControl(CONTROLES_POSTE.enregistrerAnnuler)}
                className="rounded-lg border px-3 py-1.5 text-[12px] font-bold text-warm-600"
                style={{ borderColor: "#E2DCD1" }}
              >
                Annuler
              </button>
              <button
                type="button"
                data-control={CONTROLES_POSTE.enregistrerValider}
                onClick={() => onEnregistrer(nomFichier)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white"
                style={{ background: "#107C41", ...halo(highlight === CONTROLES_POSTE.enregistrerValider) }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Boîte « Ouvrir ». Un classeur existant se choisit dans une liste : le
          double-clic ouvre directement, comme dans l'explorateur. */}
      {poste.boite === "ouvrir" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ouvrir"
          className="absolute z-30 overflow-hidden rounded-xl bg-white"
          style={{
            left: "50%",
            top: "50%",
            width: "min(380px, 86%)",
            transform: "translate(-50%,-50%)",
            boxShadow: "0 30px 70px -18px rgba(0,0,0,.6)",
            animation: "sim-poste-boite .22s cubic-bezier(.2,.9,.2,1) both",
          }}
        >
          <p className="border-b px-3 py-2 text-[11.5px] font-bold" style={{ background: "#F5F3EF", borderColor: "#E4E0D8" }}>
            Ouvrir
          </p>
          <div className="p-3">
            <p className="mb-1 text-[10.5px] text-warm-500">Bureau</p>
            <ul
              className="mb-3 overflow-auto rounded-lg border"
              style={{ maxHeight: 132, borderColor: "#DDD8CE" }}
            >
              {poste.fichiers.length === 0 && (
                <li className="px-2.5 py-2 text-[11px] text-warm-500">Aucun classeur ici.</li>
              )}
              {poste.fichiers.map((f) => (
                <li key={f.nom}>
                  <button
                    type="button"
                    data-control={CONTROLES_POSTE.listeFichier(f.nom)}
                    onClick={() => setChoisi(f.nom)}
                    onDoubleClick={() => onOuvrir(f.nom)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11.5px]"
                    style={{
                      background: choisi === f.nom ? "#E8F3EC" : "transparent",
                      color: "#2C2A26",
                      ...halo(highlight === CONTROLES_POSTE.listeFichier(f.nom)),
                    }}
                  >
                    <span
                      aria-hidden
                      className="flex items-center justify-center rounded-[3px] text-[8px] font-bold text-white"
                      style={{ width: 15, height: 15, background: "#107C41" }}
                    >
                      X
                    </span>
                    <span className="truncate">{f.nom}.xlsx</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-control={CONTROLES_POSTE.ouvrirAnnuler}
                onClick={() => onControl(CONTROLES_POSTE.ouvrirAnnuler)}
                className="rounded-lg border px-3 py-1.5 text-[12px] font-bold text-warm-600"
                style={{ borderColor: "#E2DCD1" }}
              >
                Annuler
              </button>
              <button
                type="button"
                data-control={CONTROLES_POSTE.ouvrirValider}
                onClick={() => choisi && onOuvrir(choisi)}
                disabled={!choisi}
                className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-45"
                style={{ background: "#107C41", ...halo(highlight === CONTROLES_POSTE.ouvrirValider) }}
              >
                Ouvrir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barre des tâches */}
      <div
        className="relative z-[5] mt-auto flex flex-shrink-0 items-center gap-2 px-2.5 py-1.5 text-white"
        style={{ background: "rgba(8,18,15,.94)", borderTop: "1px solid rgba(255,255,255,.09)" }}
      >
        <button
          type="button"
          data-control={CONTROLES_POSTE.demarrer}
          onClick={() => onControl(CONTROLES_POSTE.demarrer)}
          aria-label="Menu Démarrer"
          title="Démarrer"
          className="flex items-center justify-center rounded-lg text-[13px]"
          style={{ width: 30, height: 26, background: "rgba(255,255,255,.12)", ...halo(highlight === CONTROLES_POSTE.demarrer) }}
        >
          ⊞
        </button>
        <div className="flex gap-1.5">
          {poste.apps
            .filter((a) => a.ouvrable)
            .map((a) => (
              <span
                key={a.id}
                aria-hidden
                className="flex items-center justify-center rounded-md text-[11px] font-bold"
                style={{
                  width: 26,
                  height: 26,
                  background: poste.excel !== "ferme" ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.08)",
                  color: "#CFDAD5",
                  boxShadow: poste.excel !== "ferme" ? "inset 0 -2px 0 #4ED08A" : undefined,
                }}
              >
                X
              </span>
            ))}
        </div>
        <span className="ml-auto text-right text-[10px] leading-tight" style={{ color: "#9FB3AC" }}>
          Excel 2024
        </span>
      </div>

      <style>{`
@keyframes sim-poste-pulse{0%,100%{box-shadow:0 0 0 3px rgba(232,163,61,.8)}50%{box-shadow:0 0 0 7px rgba(232,163,61,0)}}
@keyframes sim-poste-menu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes sim-poste-fen{from{opacity:0;transform:scale(.97) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
.sim-poste-fen-in{animation:sim-poste-fen .26s cubic-bezier(.2,.9,.2,1) both}
@keyframes sim-poste-boite{from{opacity:0;transform:translate(-50%,-50%) scale(.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@media (prefers-reduced-motion: reduce){
  [style*="sim-poste-"],.sim-poste-fen-in{animation-duration:.01ms !important;animation-iteration-count:1 !important}
}
`}</style>
    </div>
  )
}
