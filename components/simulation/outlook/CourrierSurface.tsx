"use client"

/**
 * OUTLOOK — la surface de travail.
 *
 * L'équivalent d'`ExcelGrid`, à une différence près qui simplifie tout : il n'y
 * a AUCUN moteur tiers. Pas d'Univer, pas de canvas, pas de CSS de preset à
 * importer, pas de licence à vérifier. L'état applicatif EST le modèle, et cette
 * surface n'en est que le rendu — d'où sa forme : une fonction de `etat` vers du
 * DOM, plus des callbacks qui remontent les gestes.
 *
 * ═══ INVARIANTS DU CONTRAT §6 TENUS ICI ═══
 *
 *  1. La surface n'est JAMAIS démontée : la fenêtre de rédaction et les boîtes
 *     se superposent en `position:absolute`, elles ne remplacent rien. Démonter
 *     ferait perdre le travail de l'apprenant (leçon `DesktopLayer`).
 *  2. Zéro scroll garanti par la STRUCTURE : colonne `overflow:hidden`, volets
 *     en `flex:1; min-height:0`. Aucun calcul du type `innerHeight - 305`.
 *  3. `pointer-events: none` sur tout ce qui est décoratif.
 *  4. Styles INLINE et `@keyframes` embarqués : le JIT Tailwind ne génère que
 *     les classes présentes au build, une classe inédite serait inerte.
 *  5. Aucun `requestFullscreen`.
 *
 * ⚠️ LE MOBILE N'EST PAS DÉDUIT DE `window.innerWidth` mais de la LARGEUR
 * MESURÉE de la zone de travail. C'est plus juste — l'atelier n'occupe pas
 * toujours toute la fenêtre — et cela évite un écart de rendu entre serveur et
 * client, `window` n'existant pas au rendu serveur.
 */

import { useEffect, useState } from "react"
import type { EtatOutlook, Message, OutlookObservation } from "@/lib/simulation/outlook/observations"
import type { GesteOutlook } from "@/lib/simulation/outlook/document"
import { CONTROLES as C, messagesVisibles } from "@/lib/simulation/outlook/document"
import {
  ACCENT,
  BTN,
  BarreMobile,
  BoutonCourrier,
  BoutonDossiers,
  RailDossiers,
  TiroirDossiers,
} from "./CourrierChrome"

/** Sous cette largeur, trois volets ne tiennent pas : on bascule en mobile. */
const SEUIL_MOBILE = 720

export type EmetteurGeste = (
  geste: GesteOutlook | null,
  obs: OutlookObservation | null,
  opts?: { tentative?: boolean },
) => void

export default function CourrierSurface({
  etat,
  onGeste,
  largeur,
}: {
  etat: EtatOutlook
  onGeste: EmetteurGeste
  /** Largeur mesurée de la zone de travail. 0 avant la première mesure. */
  largeur: number
}) {
  /**
   * Volet visible sur téléphone. C'est de l'affichage pur, pas de l'état métier :
   * il ne remonte jamais au moteur et ne peut donc pas influencer un verdict.
   */
  const [voletMobile, setVoletMobile] = useState<"liste" | "lecture">("liste")
  /**
   * Tiroir des dossiers — mobile seulement (D13).
   *
   * Affichage pur, comme `voletMobile` : il ne remonte jamais au moteur et ne
   * peut donc pas influencer un verdict.
   */
  const [tiroirDossiers, setTiroirDossiers] = useState(false)
  const mobile = largeur > 0 && largeur < SEUIL_MOBILE

  const messageActif = etat.messageActif
    ? etat.messages.find((m) => m.id === etat.messageActif) ?? null
    : null

  /**
   * SUR TÉLÉPHONE, REVENIR À LA LISTE DÈS QU'IL N'Y A PLUS DE MESSAGE OUVERT.
   *
   * Déplacer ou supprimer un message remet `messageActif` à `null` — c'est le
   * comportement du moteur, et il est juste. Mais en mobile, liste et lecture
   * ALTERNENT : l'apprenant restait alors sur un volet de lecture VIDE, et le
   * bouton « ‹ Liste » n'est rendu qu'en présence d'un message. Plus aucun
   * moyen de revenir à sa boîte : une impasse, mesurée au banc sur l'évaluation
   * du module (« rangez ces deux messages » — le second devenait inatteignable
   * après le premier).
   *
   * Même famille que l'impasse Courrier / Calendrier trouvée par le joueur du
   * spike, et même leçon : sur mobile, tout état qui vide un volet doit ramener
   * là où il y a quelque chose à faire. C'est aussi ce que fait le vrai Outlook.
   */
  useEffect(() => {
    if (mobile && !etat.messageActif) setVoletMobile("liste")
  }, [mobile, etat.messageActif])

  /**
   * Filet de sécurité : si l'écran repasse au-dessus de 720 px, le rail reprend
   * la main et un tiroir resté ouvert n'aurait plus de sens.
   *
   * La fermeture au CHOIX D'UN DOSSIER, elle, ne passe pas par ici : elle se
   * fait dans le geste lui-même (`TiroirDossiers`). Un effet aurait laissé le
   * tiroir ouvert le temps que React vide sa file — assez pour qu'un geste
   * enchaîné vise un bouton en train de disparaître.
   */
  useEffect(() => {
    if (!mobile) setTiroirDossiers(false)
  }, [mobile])

  const ouvrirMessage = (id: string) => {
    setVoletMobile("lecture")
    onGeste({ type: "ouvrirMessage", id }, { kind: "o:selectMessage", id })
  }

  return (
    <div
      data-zone-travail="outlook"
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {/* Animations embarquées : une classe Tailwind inédite serait inerte. */}
      <style>{`
        @keyframes o-monte { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes o-boite { from { opacity: 0; transform: scale(.97) } to { opacity: 1; transform: none } }
        @keyframes o-tiroir { from { transform: translateX(-101%) } to { transform: translateX(0) } }
      `}</style>

      {etat.vue === "calendrier" ? (
        <VueCalendrier etat={etat} mobile={mobile} onGeste={onGeste} />
      ) : (
        <VueCourrier
          etat={etat}
          mobile={mobile}
          voletMobile={voletMobile}
          messageActif={messageActif}
          onGeste={onGeste}
          onOuvrirMessage={ouvrirMessage}
          onRetourListe={() => setVoletMobile("liste")}
          tiroirDossiers={tiroirDossiers}
          onBasculerTiroir={() => setTiroirDossiers((v) => !v)}
          onFermerTiroir={() => setTiroirDossiers(false)}
        />
      )}

      {/* Le rail porte déjà les vues sur desktop : ne rendre la barre basse que
          sur mobile évite d'avoir DEUX `cr-vue-courrier` dans le DOM. */}
      {mobile && (
        <BarreMobile etat={etat} onVue={(v) => onGeste({ type: "vue", vue: v }, { kind: "o:control", control: C.vue(v) })} />
      )}

      {etat.redaction && <FenetreRedaction etat={etat} onGeste={onGeste} />}
      {etat.boite !== "aucune" && <BoiteDialogue etat={etat} onGeste={onGeste} />}
    </div>
  )
}

/* ═══════════════════ VUE COURRIER ═══════════════════ */

function VueCourrier({
  etat,
  mobile,
  voletMobile,
  messageActif,
  onGeste,
  onOuvrirMessage,
  onRetourListe,
  tiroirDossiers,
  onBasculerTiroir,
  onFermerTiroir,
}: {
  etat: EtatOutlook
  mobile: boolean
  voletMobile: "liste" | "lecture"
  messageActif: Message | null
  onGeste: EmetteurGeste
  onOuvrirMessage: (id: string) => void
  onRetourListe: () => void
  tiroirDossiers: boolean
  onBasculerTiroir: () => void
  onFermerTiroir: () => void
}) {
  const montrerListe = !mobile || voletMobile === "liste"
  const montrerLecture = !mobile || voletMobile === "lecture"

  return (
    // `position: relative` : le tiroir se pose EN ABSOLU par-dessus les volets.
    // Sans lui il remonterait jusqu'au portail de l'atelier et couvrirait aussi
    // le cockpit et la bande de consigne.
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
      {!mobile && (
        <RailDossiers
          etat={etat}
          onNouveau={() => onGeste({ type: "nouveauMessage" }, { kind: "o:control", control: C.nouveau })}
          onDossier={(id) => onGeste({ type: "dossier", dossier: id }, { kind: "o:selectFolder", dossier: id })}
          onVue={(v) => onGeste({ type: "vue", vue: v }, { kind: "o:control", control: C.vue(v) })}
        />
      )}
      {montrerListe && (
        <ListeMessages
          etat={etat}
          mobile={mobile}
          onGeste={onGeste}
          onOuvrir={onOuvrirMessage}
          tiroirDossiers={tiroirDossiers}
          onBasculerTiroir={onBasculerTiroir}
        />
      )}
      {montrerLecture && (
        <VoletLecture
          etat={etat}
          message={messageActif}
          mobile={mobile}
          onGeste={onGeste}
          onRetour={onRetourListe}
        />
      )}
      {/* D13 — le volet des dossiers, en tiroir. Rendu SEULEMENT en mobile et
          seulement ouvert : c'est ce qui garantit qu'un `cr-dossier-*` n'existe
          jamais deux fois dans le DOM. */}
      {mobile && tiroirDossiers && (
        <TiroirDossiers
          etat={etat}
          onDossier={(id) => onGeste({ type: "dossier", dossier: id }, { kind: "o:selectFolder", dossier: id })}
          onFermer={onFermerTiroir}
        />
      )}
    </div>
  )
}

function ListeMessages({
  etat,
  mobile,
  onGeste,
  onOuvrir,
  tiroirDossiers,
  onBasculerTiroir,
}: {
  etat: EtatOutlook
  mobile: boolean
  onGeste: EmetteurGeste
  onOuvrir: (id: string) => void
  tiroirDossiers: boolean
  onBasculerTiroir: () => void
}) {
  const liste = messagesVisibles(etat)

  return (
    <div
      style={{
        ...(mobile ? { flex: 1 } : { flexShrink: 0, width: 274 }),
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #E4E0D8",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "7px 9px",
          borderBottom: "1px solid #E4E0D8",
          background: "#FAF9F7",
        }}
      >
        {/* D13 — l'accès aux dossiers sur téléphone. En tête de la liste, à
            gauche de la recherche : c'est là que l'œil et le pouce le
            cherchent, et c'est l'emplacement du vrai Outlook mobile. */}
        {mobile && (
          <BoutonDossiers etat={etat} ouvert={tiroirDossiers} onBascule={onBasculerTiroir} />
        )}
        <input
          data-control={C.recherche}
          placeholder="Rechercher"
          aria-label="Rechercher dans les messages"
          value={etat.recherche}
          onChange={(e) =>
            onGeste(
              { type: "recherche", texte: e.target.value },
              { kind: "o:typed", champ: "recherche", text: e.target.value },
            )
          }
          style={{
            flex: 1,
            minWidth: 0,
            padding: "5px 9px",
            border: "1px solid #DDD8CE",
            borderRadius: 14,
            font: "inherit",
            // 16 px minimum sur mobile, sinon iOS zoome sur le champ à la mise
            // au point et l'apprenant perd l'écran de vue.
            fontSize: mobile ? 16 : 12,
            outline: "none",
          }}
        />
        {/* Sur mobile le rail n'existe pas : « Nouveau message » se replie ici,
            et c'est la SEULE occurrence de `cr-nouveau` dans ce cas. */}
        {mobile && (
          <BoutonCourrier
            id={C.nouveau}
            actif
            titre="Nouveau message"
            onClick={() => onGeste({ type: "nouveauMessage" }, { kind: "o:control", control: C.nouveau })}
            style={{ flexShrink: 0, fontWeight: 800 }}
          >
            <span aria-hidden>✚</span>
          </BoutonCourrier>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {liste.length === 0 ? (
          <p style={{ padding: 16, fontSize: 12, color: "#8C948F" }}>Aucun message ici.</p>
        ) : (
          liste.map((m) => <LigneMessage key={m.id} etat={etat} m={m} onOuvrir={onOuvrir} />)
        )}
      </div>
    </div>
  )
}

function LigneMessage({
  etat,
  m,
  onOuvrir,
}: {
  etat: EtatOutlook
  m: Message
  onOuvrir: (id: string) => void
}) {
  const actif = etat.messageActif === m.id
  return (
    <button
      type="button"
      data-control={C.message(m.id)}
      onClick={() => onOuvrir(m.id)}
      style={{
        ...BTN,
        display: "block",
        width: "100%",
        padding: "9px 11px",
        textAlign: "left",
        borderBottom: "1px solid #EFECE6",
        borderLeft: `3px solid ${actif ? ACCENT : "transparent"}`,
        ...(actif ? { background: "#F3F8FD" } : {}),
      }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 12.5,
            ...(m.lu ? { color: "#5A6660" } : { fontWeight: 800, color: "#0F1F17" }),
          }}
        >
          {m.de}
        </span>
        {m.indicateur && (
          <span aria-label="Suivi" style={{ color: "#D1382E", pointerEvents: "none" }}>
            ⚑
          </span>
        )}
        {m.pieces.length > 0 && (
          <span aria-label="Pièce jointe" style={{ opacity: 0.5, pointerEvents: "none" }}>
            📎
          </span>
        )}
        <span style={{ fontSize: 10.5, color: "#8C948F", pointerEvents: "none" }}>
          {String(m.date).slice(11, 16)}
        </span>
      </span>
      <span
        style={{
          display: "block",
          marginTop: 2,
          fontSize: 12,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          ...(m.lu ? { color: "#3C4A43" } : { fontWeight: 700, color: "#0F1F17" }),
        }}
      >
        {/* L'icône « répondu » permet à l'apprenant de vérifier son propre
            travail sans quitter la liste. */}
        {m.repondu && <span style={{ color: ACCENT }}>↩ </span>}
        {m.transfere && <span style={{ color: ACCENT }}>➜ </span>}
        {m.objet}
      </span>
      <span
        style={{
          display: "block",
          marginTop: 1,
          fontSize: 11,
          color: "#8C948F",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {m.corps.replace(/\n/g, " ").slice(0, 70)}
      </span>
      {m.categories.length > 0 && (
        <span style={{ display: "block", marginTop: 4 }}>
          {m.categories.map((cid) => {
            const cat = etat.categories.find((x) => x.id === cid)
            if (!cat) return null
            return (
              <span
                key={cid}
                style={{
                  display: "inline-block",
                  marginRight: 4,
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontSize: 9.5,
                  color: "#fff",
                  background: cat.couleur,
                  pointerEvents: "none",
                }}
              >
                {cat.nom}
              </span>
            )
          })}
        </span>
      )}
    </button>
  )
}

function VoletLecture({
  etat,
  message,
  mobile,
  onGeste,
  onRetour,
}: {
  etat: EtatOutlook
  message: Message | null
  mobile: boolean
  onGeste: EmetteurGeste
  onRetour: () => void
}) {
  if (!message) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <p style={{ fontSize: 12.5, color: "#9BA5A0", textAlign: "center" }}>
          Sélectionnez un message pour le lire.
        </p>
      </div>
    )
  }

  const m = message
  const inv = m.invitation
  const ctrl = (id: string) => ({ kind: "o:control" as const, control: id })

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexWrap: "wrap",
          gap: 3,
          padding: "7px 11px",
          borderBottom: "1px solid #E4E0D8",
          background: "#FAF9F7",
        }}
      >
        {mobile && (
          <BoutonCourrier id="cr-retour" onClick={onRetour} style={{ fontWeight: 700 }}>
            ‹ Liste
          </BoutonCourrier>
        )}
        <BoutonCourrier
          id={C.repondre}
          onClick={() => onGeste({ type: "repondre", id: m.id }, ctrl(C.repondre))}
        >
          <span aria-hidden>↩</span> Répondre
        </BoutonCourrier>
        <BoutonCourrier
          id={C.repondreTous}
          onClick={() => onGeste({ type: "repondreATous", id: m.id }, ctrl(C.repondreTous))}
        >
          <span aria-hidden>↩↩</span> Répondre à tous
        </BoutonCourrier>
        <BoutonCourrier
          id={C.transferer}
          onClick={() => onGeste({ type: "transferer", id: m.id }, ctrl(C.transferer))}
        >
          <span aria-hidden>➜</span> Transférer
        </BoutonCourrier>
        <BoutonCourrier
          id={C.deplacer}
          onClick={() => onGeste({ type: "boite", boite: "deplacer" }, ctrl(C.deplacer))}
        >
          <span aria-hidden>🗂</span> Déplacer
        </BoutonCourrier>
        <BoutonCourrier
          id={C.indicateur}
          titre="Indicateur de suivi"
          onClick={() => onGeste({ type: "indicateur", id: m.id }, ctrl(C.indicateur), { tentative: true })}
        >
          <span aria-hidden>⚑</span>
        </BoutonCourrier>
        <BoutonCourrier
          id={C.supprimer}
          titre="Supprimer"
          onClick={() => onGeste({ type: "supprimer", id: m.id }, ctrl(C.supprimer), { tentative: true })}
        >
          <span aria-hidden>🗑</span>
        </BoutonCourrier>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "13px 15px" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 15, color: "#0F1F17" }}>{m.objet}</h2>
        <div style={{ fontSize: 12, color: "#5A6660", marginBottom: 3 }}>
          <b style={{ color: "#0F1F17" }}>{m.de}</b>
        </div>
        <div style={{ fontSize: 11.5, color: "#8C948F" }}>
          À : {m.a.join(", ")}
          {m.cc.length > 0 && ` · Cc : ${m.cc.join(", ")}`}
        </div>

        {m.pieces.length > 0 && (
          <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {m.pieces.map((p) => (
              <span
                key={p.nom}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 8px",
                  border: "1px solid #DDD8CE",
                  borderRadius: 6,
                  fontSize: 11.5,
                  background: "#fff",
                }}
              >
                <span aria-hidden>📎</span> {p.nom}
                <span style={{ color: "#9BA5A0" }}>{p.taille ?? ""}</span>
              </span>
            ))}
          </div>
        )}

        {inv && (
          <div
            style={{
              marginTop: 11,
              padding: "10px 12px",
              border: "1px solid #DDE7F2",
              borderRadius: 9,
              background: "#F3F8FD",
            }}
          >
            <b style={{ fontSize: 12.5, color: "#0B3C66" }}>
              Invitation — {inv.evenement?.titre ?? ""}
            </b>
            <p style={{ margin: "3px 0 8px", fontSize: 11.5, color: "#5A6660" }}>
              {inv.evenement?.date ?? ""} · {inv.evenement?.debut ?? ""}–{inv.evenement?.fin ?? ""} ·{" "}
              {inv.evenement?.lieu ?? ""}
            </p>
            {inv.reponse === "aucune" ? (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <BoutonCourrier
                  id={C.accepter}
                  onClick={() =>
                    onGeste({ type: "repondreInvitation", id: m.id, reponse: "accepte" }, ctrl(C.accepter), {
                      tentative: true,
                    })
                  }
                  style={{ background: "#2E9E63", color: "#fff" }}
                >
                  ✓ Accepter
                </BoutonCourrier>
                <BoutonCourrier
                  id={C.provisoire}
                  onClick={() =>
                    onGeste({ type: "repondreInvitation", id: m.id, reponse: "provisoire" }, ctrl(C.provisoire))
                  }
                  style={{ border: "1px solid #DDD8CE" }}
                >
                  ? Provisoire
                </BoutonCourrier>
                <BoutonCourrier
                  id={C.refuser}
                  onClick={() =>
                    onGeste({ type: "repondreInvitation", id: m.id, reponse: "refuse" }, ctrl(C.refuser))
                  }
                  style={{ border: "1px solid #DDD8CE" }}
                >
                  ✕ Refuser
                </BoutonCourrier>
              </div>
            ) : (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "#2E9E63" }}>
                Réponse envoyée : {inv.reponse}
              </span>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: 13,
            fontSize: 12.5,
            lineHeight: 1.6,
            color: "#2C3A33",
            whiteSpace: "pre-wrap",
          }}
        >
          {m.corps}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════ FENÊTRE DE RÉDACTION ═══════════════════ */

/**
 * Superposée, jamais dans le flux.
 *
 * En `position:absolute` par-dessus la surface : la liste et le volet de lecture
 * restent montés dessous. C'est l'invariant n°6 du contrat — démonter puis
 * remonter ferait perdre l'état de la surface, et sur mobile la rédaction occupe
 * tout l'écran, ce qui est aussi le comportement du vrai Outlook.
 */
function FenetreRedaction({ etat, onGeste }: { etat: EtatOutlook; onGeste: EmetteurGeste }) {
  const r = etat.redaction
  if (!r) return null
  const ctrl = (id: string) => ({ kind: "o:control" as const, control: id })

  const champ = (cle: "a" | "cc" | "cci" | "objet", libelle: string, valeur: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #EFECE6" }}>
      {/* 46 px : à 34, « Objet » touchait sa valeur (« ObjetRE : Demande… »).
          Défaut invisible à la mesure, trouvé en REGARDANT la capture du spike. */}
      <label
        htmlFor={`o-champ-${cle}`}
        style={{
          flexShrink: 0,
          width: 46,
          padding: "7px 6px 7px 11px",
          fontSize: 11.5,
          fontWeight: 700,
          color: "#6E7A74",
        }}
      >
        {libelle}
      </label>
      <input
        id={`o-champ-${cle}`}
        data-control={C.champ(cle)}
        value={valeur}
        onChange={(e) => {
          const val = e.target.value
          const geste: GesteOutlook =
            cle === "objet"
              ? { type: "champ", champ: "objet", valeur: val }
              : { type: "destinataires", champ: cle, valeur: val }
          onGeste(geste, { kind: "o:typed", champ: cle, text: val }, { tentative: true })
        }}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "7px 11px 7px 0",
          border: 0,
          font: "inherit",
          fontSize: 12.5,
          color: "#0F1F17",
          outline: "none",
          background: "transparent",
        }}
      />
    </div>
  )

  return (
    <div
      role="dialog"
      aria-label="Message en cours de rédaction"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        animation: "o-monte .2s cubic-bezier(.2,.9,.2,1) both",
        zIndex: 20,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexWrap: "wrap",
          gap: 3,
          alignItems: "center",
          padding: "7px 11px",
          borderBottom: "1px solid #E4E0D8",
          background: "#FAF9F7",
        }}
      >
        <BoutonCourrier
          id={C.envoyer}
          onClick={() => onGeste({ type: "envoyer" }, ctrl(C.envoyer), { tentative: true })}
          style={{ background: ACCENT, color: "#fff", fontWeight: 700 }}
        >
          <span aria-hidden>➤</span> Envoyer
        </BoutonCourrier>
        <BoutonCourrier
          id={C.joindre}
          onClick={() => onGeste({ type: "boite", boite: "joindre" }, ctrl(C.joindre))}
        >
          <span aria-hidden>📎</span> Joindre
        </BoutonCourrier>
        {/* Le champ Cci est masqué par défaut dans Outlook : l'afficher est un
            geste enseignable, et l'ignorer est l'erreur professionnelle que la
            formation corrige. Le bouton disparaît une fois le champ affiché,
            pour ne pas laisser deux chemins vers le même état. */}
        {!r.champCciVisible && (
          <BoutonCourrier
            id={C.afficherCci}
            onClick={() => onGeste({ type: "afficherCci" }, ctrl(C.afficherCci))}
          >
            Cci
          </BoutonCourrier>
        )}
        <span style={{ marginLeft: "auto" }} />
        <BoutonCourrier
          id={C.abandonner}
          titre="Abandonner le message"
          onClick={() => onGeste({ type: "abandonner" }, ctrl(C.abandonner))}
        >
          ✕
        </BoutonCourrier>
      </div>

      <div style={{ flexShrink: 0 }}>
        {champ("a", "À", r.a.join("; "))}
        {champ("cc", "Cc", r.cc.join("; "))}
        {r.champCciVisible && champ("cci", "Cci", r.cci.join("; "))}
        {champ("objet", "Objet", r.objet)}
      </div>

      {r.pieces.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: 5,
            padding: "7px 11px",
            borderBottom: "1px solid #EFECE6",
            background: "#FBFAF8",
          }}
        >
          {r.pieces.map((p) => (
            <span
              key={p.nom}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 5px 3px 8px",
                border: "1px solid #DDD8CE",
                borderRadius: 6,
                fontSize: 11.5,
                background: "#fff",
              }}
            >
              <span aria-hidden>📎</span>
              {p.nom}
              {/* 26 px de côté : mesuré à 15 × 24 au banc, donc sous le seuil
                  tactile et intouchable au doigt sur téléphone. La croix reste
                  visuellement discrète, c'est sa BOÎTE qui grandit — même
                  principe que le bouton Guide du cockpit, dont la pastille fait
                  28 px dans un bouton de 44. */}
              <button
                type="button"
                data-control={`cr-retirer-${p.nom}`}
                aria-label={`Retirer ${p.nom}`}
                onClick={() => onGeste({ type: "retirerPiece", nom: p.nom }, null, { tentative: true })}
                style={{
                  ...BTN,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 26,
                  minHeight: 26,
                  padding: 0,
                  color: "#9BA5A0",
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        data-control={C.champ("corps")}
        aria-label="Corps du message"
        placeholder="Rédigez votre message…"
        value={r.corps}
        onChange={(e) =>
          onGeste(
            { type: "champ", champ: "corps", valeur: e.target.value },
            { kind: "o:typed", champ: "corps", text: e.target.value },
            { tentative: true },
          )
        }
        style={{
          flex: 1,
          minHeight: 0,
          padding: 12,
          border: 0,
          resize: "none",
          font: "inherit",
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "#0F1F17",
          outline: "none",
        }}
      />

      {r.signature && (
        <div
          style={{
            flexShrink: 0,
            padding: "8px 12px",
            borderTop: "1px solid #EFECE6",
            fontSize: 11,
            color: "#8C948F",
            whiteSpace: "pre-wrap",
            pointerEvents: "none",
          }}
        >
          {etat.signatures.find((s) => s.id === r.signature)?.contenu ?? ""}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════ BOÎTES DE DIALOGUE ═══════════════════ */

function BoiteDialogue({ etat, onGeste }: { etat: EtatOutlook; onGeste: EmetteurGeste }) {
  const joindre = etat.boite === "joindre"

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(15,31,23,.28)",
      }}
    >
      <div
        role="dialog"
        aria-label={joindre ? "Joindre un fichier" : "Déplacer le message"}
        style={{
          width: "min(330px, 100%)",
          maxHeight: "100%",
          overflowY: "auto",
          padding: 13,
          borderRadius: 12,
          background: "#fff",
          boxShadow: "0 26px 60px -18px rgba(0,0,0,.5)",
          animation: "o-boite .2s cubic-bezier(.2,.9,.2,1) both",
        }}
      >
        <p style={{ margin: "0 0 9px", fontSize: 11.5, color: "#6E7A74" }}>
          {joindre ? "Choisissez un fichier à joindre." : "Déplacer le message vers…"}
        </p>

        {joindre
          ? etat.fichiers.map((f) => (
              <button
                key={f.nom}
                type="button"
                data-control={C.fichier(f.nom)}
                onClick={() => onGeste({ type: "joindre", nom: f.nom }, { kind: "o:control", control: C.fichier(f.nom) }, { tentative: true })}
                style={{
                  ...BTN,
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 9px",
                  borderRadius: 7,
                  textAlign: "left",
                  fontSize: 12.5,
                  minHeight: 40,
                  border: "1px solid #EFECE6",
                  marginBottom: 5,
                }}
              >
                <span aria-hidden>📎</span>
                <span style={{ flex: 1 }}>{f.nom}</span>
                <span style={{ fontSize: 11, color: "#9BA5A0" }}>{f.taille}</span>
              </button>
            ))
          : etat.dossiers
              .filter((d) => d.id !== etat.dossierActif)
              .map((d) => (
                <button
                  key={d.id}
                  type="button"
                  data-control={`cr-vers-${d.id}`}
                  onClick={() => {
                    // Fermer AVANT de déplacer : le geste de déplacement doit
                    // produire l'état final observé, boîte close comprise.
                    onGeste({ type: "boite", boite: "aucune" }, null)
                    onGeste(
                      { type: "deplacer", id: etat.messageActif ?? "", dossier: d.id },
                      { kind: "o:control", control: `cr-vers-${d.id}` },
                      { tentative: true },
                    )
                  }}
                  style={{
                    ...BTN,
                    display: "flex",
                    width: "100%",
                    gap: 8,
                    padding: "8px 9px",
                    borderRadius: 7,
                    textAlign: "left",
                    fontSize: 12.5,
                    minHeight: 40,
                    border: "1px solid #EFECE6",
                    marginBottom: 5,
                  }}
                >
                  <span aria-hidden>🗂</span> {d.nom}
                </button>
              ))}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 5 }}>
          <BoutonCourrier
            id="cr-fermer-boite"
            onClick={() => onGeste({ type: "boite", boite: "aucune" }, null)}
            style={{ border: "1px solid #E2DCD1" }}
          >
            Annuler
          </BoutonCourrier>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════ VUE CALENDRIER ═══════════════════ */

function VueCalendrier({
  etat,
  mobile,
  onGeste,
}: {
  etat: EtatOutlook
  mobile: boolean
  onGeste: EmetteurGeste
}) {
  const rdv = etat.rendezVous
  const jours = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"]
  const noms = ["Lun 2", "Mar 3", "Mer 4", "Jeu 5", "Ven 6"]

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          gap: 4,
          padding: "7px 11px",
          borderBottom: "1px solid #E4E0D8",
          background: "#FAF9F7",
        }}
      >
        <BoutonCourrier
          id={C.nouveauRdv}
          onClick={() => onGeste({ type: "nouveauRendezVous" }, { kind: "o:control", control: C.nouveauRdv })}
          style={{ background: ACCENT, color: "#fff", fontWeight: 700 }}
        >
          <span aria-hidden>✚</span> Nouveau rendez-vous
        </BoutonCourrier>
        {/* Sur mobile ce retour vit dans la barre basse : le rendre ici aussi
            créerait DEUX `cr-vue-courrier` dans le DOM, et un clic automatisé
            comme le halo d'aide viseraient l'élément caché. */}
        {!mobile && (
          <BoutonCourrier
            id={C.vue("courrier")}
            onClick={() => onGeste({ type: "vue", vue: "courrier" }, { kind: "o:control", control: C.vue("courrier") })}
          >
            <span aria-hidden>✉</span> Courrier
          </BoutonCourrier>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#8C948F", alignSelf: "center" }}>
          Semaine du 2 mars 2026
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {jours.map((jour, i) => {
          const evs = etat.evenements.filter((e) => e.date === jour)
          return (
            <div
              key={jour}
              style={{
                flex: 1,
                minWidth: 0,
                borderRight: "1px solid #EFECE6",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  padding: "6px 4px",
                  textAlign: "center",
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "#3C4A43",
                  borderBottom: "1px solid #E4E0D8",
                  background: "#FAF9F7",
                }}
              >
                {noms[i]}
              </div>
              <div style={{ flex: 1, minHeight: 0, padding: 4, overflowY: "auto" }}>
                {evs.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      marginBottom: 4,
                      padding: "5px 6px",
                      borderRadius: 6,
                      borderLeft: `3px solid ${ACCENT}`,
                      background: "#EAF2FA",
                    }}
                  >
                    <b
                      style={{
                        display: "block",
                        fontSize: 11,
                        color: "#0B3C66",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {e.titre}
                    </b>
                    <span style={{ fontSize: 10, color: "#5A6660" }}>
                      {e.debut}–{e.fin}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {rdv && <FormulaireRdv rdv={rdv} onGeste={onGeste} />}
    </div>
  )
}

function FormulaireRdv({
  rdv,
  onGeste,
}: {
  rdv: NonNullable<EtatOutlook["rendezVous"]>
  onGeste: EmetteurGeste
}) {
  const champs: Array<{ cle: "titre" | "date" | "debut" | "fin" | "lieu"; lib: string; type: string }> = [
    { cle: "titre", lib: "Objet", type: "text" },
    { cle: "date", lib: "Date", type: "date" },
    { cle: "debut", lib: "Début", type: "time" },
    { cle: "fin", lib: "Fin", type: "time" },
    { cle: "lieu", lib: "Lieu", type: "text" },
  ]

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 25,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(15,31,23,.28)",
      }}
    >
      <div
        role="dialog"
        aria-label="Nouveau rendez-vous"
        style={{
          width: "min(360px, 100%)",
          maxHeight: "100%",
          overflowY: "auto",
          padding: 14,
          borderRadius: 12,
          background: "#fff",
          boxShadow: "0 26px 60px -18px rgba(0,0,0,.5)",
        }}
      >
        <b style={{ display: "block", marginBottom: 10, fontSize: 13, color: "#0F1F17" }}>
          Nouveau rendez-vous
        </b>
        {champs.map(({ cle, lib, type }) => (
          <label key={cle} style={{ display: "block", marginBottom: 8 }}>
            <span
              style={{
                display: "block",
                marginBottom: 3,
                fontSize: 11,
                fontWeight: 700,
                color: "#6E7A74",
              }}
            >
              {lib}
            </span>
            <input
              type={type}
              data-control={`cr-rdv-${cle}`}
              value={String(rdv[cle] ?? "")}
              onChange={(e) =>
                onGeste({ type: "champRdv", champ: cle, valeur: e.target.value }, null)
              }
              style={{
                width: "100%",
                padding: "7px 9px",
                border: "1px solid #DDD8CE",
                borderRadius: 7,
                font: "inherit",
                fontSize: 12.5,
                minHeight: 36,
                outline: "none",
              }}
            />
          </label>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 11 }}>
          <BoutonCourrier
            id="cr-annuler-rdv"
            onClick={() => onGeste({ type: "annulerRdv" }, null)}
            style={{ border: "1px solid #E2DCD1" }}
          >
            Annuler
          </BoutonCourrier>
          <BoutonCourrier
            id={C.enregistrerRdv}
            onClick={() =>
              onGeste({ type: "enregistrerRdv" }, { kind: "o:control", control: C.enregistrerRdv }, { tentative: true })
            }
            style={{ background: ACCENT, color: "#fff", fontWeight: 700 }}
          >
            Enregistrer
          </BoutonCourrier>
        </div>
      </div>
    </div>
  )
}
