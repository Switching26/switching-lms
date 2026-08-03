import React, { useEffect, useState } from 'react'
import { createRoot, createPortal } from 'react-dom/client'
import ReactDOM from 'react-dom'
import SimulationPlayer from '@/components/simulation/SimulationPlayer'

/**
 * Banc fidèle du mode ATELIER — copie d'audit, port 8890.
 *
 * Identique au banc durable (navigation LMS de 64 px, conteneur portant
 * `animate-fade-in-up` dont le transform résiduel devient containing block,
 * rendu par PORTAIL vers document.body comme `SimulationChapter`), avec UNE
 * addition : `window.__BANC_OUVRIR(fichier, step)` remonte l'atelier sans
 * recharger la page.
 *
 * POURQUOI CETTE ADDITION
 * L'audit du rejeu doit ouvrir 1 587 étapes, chacune deux fois (premier passage
 * puis « Revoir »). Recharger la page à chaque fois fait ré-analyser 22 Mo de
 * bundle : ~1,5 s perdues par étape, soit 40 minutes de pure analyse. Le
 * remontage par clé neuve donne exactement le même état initial — c'est ce que
 * fait React au montage — sans repayer l'analyse.
 */

const q = new URLSearchParams(location.search)
const NOM0 = q.get('s') || 'm06-l01.json'
const STEP0 = Number(q.get('step') || 0)

function Atelier({ scenario, step, cle }) {
  const [monte, setMonte] = useState(false)
  useEffect(() => {
    setMonte(true)
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = avant }
  }, [])

  const player = React.createElement(SimulationPlayer, {
    key: 'banc-' + cle,
    chapterId: 'banc-atelier',
    mode: scenario.mode || 'LESSON',
    scenario,
    initialStep: step,
    preview: false,
    pleinCadre: true,
    onCompleted: () => { window.__BANC_DONE = true },
    sommaire: [
      { id: 'banc-atelier', titre: scenario.title || 'Chapitre', module: scenario.moduleTitle || null,
        genre: 'lecon', termine: false, etapes: (scenario.steps || []).length, secondes: 600 },
    ],
    onNaviguer: () => {},
    onQuitter: () => { window.__BANC_QUITTE = true },
    note: '',
    onNote: () => {},
    notesHref: '#',
  })

  if (!monte) return React.createElement('div', { style: { height: 420 } })

  return ReactDOM.createPortal(
    React.createElement('div', {
      style: {
        position: 'fixed',
        top: 'calc(var(--app-impersonation-offset, 0px) + var(--app-nav-height, 64px))',
        left: 0, right: 0, bottom: 0, zIndex: 30,
        background: '#0B1512', overflow: 'hidden',
      },
    }, player),
    document.body,
  )
}

const cache = new Map()

function Banc() {
  const [etat, setEtat] = useState({ scenario: null, nom: null, step: STEP0, cle: 0 })

  useEffect(() => {
    let cle = 0
    /** Ouvre un scénario à une étape, en remontant complètement le player. */
    window.__BANC_OUVRIR = async (nom, step) => {
      window.__BANC_PRET = false
      window.__BANC_DONE = false
      // Démontage explicite d'abord : sans ce passage par null, React réutilise
      // l'arbre et Univer garde son classeur — l'état d'entrée serait celui de
      // l'étape précédente, ce qui invaliderait toute la mesure.
      setEtat((e) => ({ ...e, scenario: null }))
      let sc = cache.get(nom)
      if (!sc) {
        sc = await fetch('./scenarios/' + nom).then((r) => r.json())
        cache.set(nom, sc)
      }
      await new Promise((r) => setTimeout(r, 60))
      cle += 1
      setEtat({ scenario: sc, nom, step: step | 0, cle })
      window.__BANC_SCENARIO_COURANT = nom
      return { etapes: sc.steps.length, mode: sc.mode || 'LESSON' }
    }
    window.__BANC_OUVRIR(NOM0, STEP0)
  }, [])

  useEffect(() => {
    if (etat.scenario) window.__BANC_PRET = true
  }, [etat])

  return React.createElement(React.Fragment, null,
    React.createElement('nav', {
      style: {
        position: 'fixed', top: 0, left: 0, right: 0, height: 64, zIndex: 40,
        background: '#fff', borderBottom: '1px solid #E7E3DC',
        display: 'flex', alignItems: 'center', padding: '0 20px',
        font: '600 14px system-ui', color: '#171a18',
      },
    }, 'LMS — navigation (banc audit)'),
    React.createElement('div', { style: { paddingTop: 64 } },
      React.createElement('div', { className: 'space-y-5 min-w-0 scroll-mt-20 animate-fade-in-up' },
        etat.scenario
          ? React.createElement(Atelier, { scenario: etat.scenario, step: etat.step, cle: etat.cle })
          : React.createElement('p', { id: 'banc-attente' }, 'chargement du scénario…'),
      ),
    ),
  )
}

createRoot(document.getElementById('root')).render(React.createElement(Banc))
window.__BANC_READY = true
/* Repère UNIQUE de ce banc : c'est le seul moyen de distinguer « mon code
   tourne » de « un code tourne » quand deux sessions travaillent sur le même
   dépôt. Vérifié par curl sur le bundle SERVI, pas sur celui du disque. */
window.__EMPREINTE_AUDIT_REJEU = 'OPUS5-REJEU-8890'
