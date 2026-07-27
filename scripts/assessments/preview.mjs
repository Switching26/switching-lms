#!/usr/bin/env node
/**
 * Génère un aperçu HTML autonome d'un test, à partir du MÊME fichier JSON qui
 * servira à l'injection en base. Aucune divergence possible entre ce qui est
 * validé et ce qui sera intégré.
 *
 *   node scripts/assessments/preview.mjs anglais-positionnement.json > out.html
 */
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const file = resolve(here, process.argv[2] || "anglais-positionnement.json")
const A = JSON.parse(readFileSync(file, "utf8"))

const ACCENT = "#10ABAF"
const NAVY = "#0F172A"

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const nl = (s) => esc(s).replace(/\n/g, "<br>")

const allQ = A.sections.flatMap((s) => s.questions.map((q) => ({ ...q, section: s.name })))
const scored = allQ.filter((q) => q.points > 0 && q.type !== "TEXTE")
const written = allQ.filter((q) => q.type === "TEXTE")
const declarative = allQ.filter((q) => q.points === 0 && q.type !== "TEXTE")
const maxScore = scored.reduce((n, q) => n + q.points, 0)

const byLevel = {}
for (const q of scored) byLevel[q.level] = (byLevel[q.level] || 0) + 1

/* ─── Rendu fidèle d'une question, tel que le candidat la voit ─── */
function renderQuestion(q, index, { picked = [], scale = null, text = "" } = {}) {
  let body = ""
  if (q.type === "ECHELLE") {
    const btns = Array.from({ length: q.scaleMax - q.scaleMin + 1 }, (_, i) => {
      const v = q.scaleMin + i
      const on = scale === v
      return `<button class="scale${on ? " on" : ""}">${v}</button>`
    }).join("")
    body = `<div class="scale-row">${btns}</div>
      <div class="scale-lab"><span>${esc(q.scaleMinLabel)}</span><span>${esc(q.scaleMaxLabel)}</span></div>`
  } else if (q.type === "TEXTE") {
    body = `<div class="ta">${text ? nl(text) : '<span class="ph">Votre réponse…</span>'}</div>`
  } else {
    body = `<div class="choices">${q.choices
      .map((c, i) => {
        const on = picked.includes(i)
        const shape = q.type === "QCM_MULTI" ? "sq" : "ci"
        return `<div class="choice${on ? " on" : ""}">
          <span class="mark ${shape}${on ? " on" : ""}"></span>
          <span>${esc(c.t)}</span></div>`
      })
      .join("")}</div>`
  }
  return `<div class="q">
    <div class="qhead"><span class="num">${index}</span>
      <div><p class="qtext">${nl(q.text)}</p>
      ${q.helpText ? `<p class="qhelp">${nl(q.helpText)}</p>` : ""}</div></div>
    ${body}</div>`
}

const q1 = allQ[0]
const qGram = allQ.find((q) => q.level === "B1" && q.type === "QCM_SINGLE")
const qRead = allQ.find((q) => q.helpText && q.helpText.startsWith("TEXTE 2"))
const qC2 = allQ.filter((q) => q.level === "C2" && q.type === "QCM_SINGLE").pop()

const bands = A.levelBands
  .map(
    (b) => `<tr>
      <td class="mono">${b.min} – ${b.max}</td>
      <td class="mono">${Math.round((b.min / maxScore) * 100)} – ${Math.round((b.max / maxScore) * 100)} %</td>
      <td><span class="lvl">${b.level}</span> ${esc(b.label)}</td>
      <td class="parc">${esc(b.parcours)}</td></tr>`
  )
  .join("")

const contentBlocks = A.sections
  .map((s) => {
    const rows = s.questions
      .map((q, i) => {
        let ans = ""
        if (q.type === "QCM_SINGLE" || q.type === "QCM_MULTI") {
          if (q.points === 0) {
            ans = `<div class="opts">${q.choices.map((c) => `<span class="opt">${esc(c.t)}</span>`).join("")}</div>
              <p class="meta">Aucune bonne réponse — question de profilage, non notée.</p>`
          } else {
            ans = `<div class="opts">${q.choices
              .map((c) => `<span class="opt${c.c ? " good" : ""}">${c.c ? "✓ " : ""}${esc(c.t)}</span>`)
              .join("")}</div>`
          }
        } else if (q.type === "ECHELLE") {
          ans = `<p class="meta">Échelle ${q.scaleMin} à ${q.scaleMax} — « ${esc(q.scaleMinLabel)} » → « ${esc(
            q.scaleMaxLabel
          )} ». Non notée.</p>`
        } else {
          ans = `<p class="meta">Réponse rédigée — corrigée à la main, hors score automatique.</p>`
        }
        return `<div class="item">
          <div class="ihead"><span class="ilvl${q.level === "—" ? " none" : ""}">${esc(q.level)}</span>
          <p class="itext">${nl(q.text)}</p>
          <span class="ipts">${q.points > 0 ? q.points + " pt" : "—"}</span></div>
          ${q.helpText ? `<div class="ihelp">${nl(q.helpText)}</div>` : ""}
          ${ans}</div>`
      })
      .join("")
    return `<section class="sec"><h3>${esc(s.name)}</h3><p class="secnote">${esc(s.note)}</p>${rows}</section>`
  })
  .join("")

// `meta charset` obligatoire : sans lui, un serveur qui ne renvoie pas le
// charset fait interpréter l'UTF-8 en latin-1 et tous les accents cassent.
const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test de positionnement Anglais — aperçu</title>
<style>
  :root{--a:${ACCENT};--n:${NAVY};--ink:#0F172A;--i70:rgba(15,23,42,.70);--i50:rgba(15,23,42,.52);
        --line:rgba(15,23,42,.10);--bg:#F1F5F9;--card:#fff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:400 15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
       -webkit-text-size-adjust:100%}
  .wrap{max-width:1080px;margin:0 auto;padding:24px 16px 64px}
  h1{font-size:26px;line-height:1.2;margin:0 0 6px;letter-spacing:-.02em}
  h2{font-size:19px;margin:40px 0 4px;letter-spacing:-.01em}
  h3{font-size:16px;margin:0 0 2px}
  .sub{color:var(--i50);margin:0 0 24px;font-size:14px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:20px 0 8px}
  .kpi{background:var(--card);border-radius:14px;padding:14px 16px}
  .kpi b{display:block;font-size:22px;letter-spacing:-.02em;color:var(--a)}
  .kpi span{font-size:12px;color:var(--i50)}
  .lead{color:var(--i70);font-size:14px;margin:6px 0 0}

  /* ── maquette téléphone ── */
  .screens{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-top:16px}
  .phone{background:var(--card);border-radius:22px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.10)}
  .plab{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--i50);
        padding:12px 16px 0}
  .app{background:#F8FAFC;padding:0 0 16px}
  .bar{background:#fff;border-bottom:1px solid rgba(15,23,42,.06);padding:12px 16px;display:flex;
       align-items:center;gap:8px}
  .bar b{color:var(--a);font-size:14px}
  .body{padding:16px}
  .eyebrow{font-size:10px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:var(--a);margin:0 0 6px}
  .title{font-size:18px;font-weight:600;margin:0 0 8px;letter-spacing:-.01em}
  .desc{font-size:12.5px;color:var(--i50);margin:0 0 14px}
  .card{background:#fff;border-radius:16px;padding:14px;margin-bottom:10px;box-shadow:0 1px 2px rgba(15,23,42,.05)}
  .field{margin-bottom:10px}
  .field label{display:block;font-size:11px;font-weight:600;color:var(--i70);margin-bottom:4px}
  .input{border:1px solid var(--line);border-radius:10px;padding:9px 11px;font-size:13px;color:var(--i50);background:#fff}
  .input.filled{color:var(--ink)}
  .cta{background:var(--a);color:#fff;text-align:center;border-radius:12px;padding:12px;font-weight:600;
       font-size:14px;margin-top:12px}
  .q{background:#fff;border-radius:16px;padding:14px;margin-bottom:10px;box-shadow:0 1px 2px rgba(15,23,42,.05)}
  .qhead{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}
  .num{flex:none;width:26px;height:26px;border-radius:50%;background:var(--a);color:#fff;font-size:11px;
       font-weight:600;display:grid;place-items:center}
  .qtext{margin:0;font-weight:500;font-size:13.5px}
  .qhelp{margin:5px 0 0;font-size:11.5px;color:var(--i50);white-space:pre-line}
  .choices{display:flex;flex-direction:column;gap:7px}
  .choice{display:flex;gap:9px;align-items:center;border:1px solid var(--line);border-radius:11px;
          padding:9px 11px;font-size:13px;color:var(--i70)}
  .choice.on{border-color:var(--a);background:rgba(16,171,175,.07);color:var(--ink);font-weight:500}
  .mark{flex:none;width:15px;height:15px;border:1.5px solid rgba(15,23,42,.25)}
  .mark.ci{border-radius:50%} .mark.sq{border-radius:4px}
  .mark.on{border-color:var(--a);background:var(--a);box-shadow:inset 0 0 0 2.5px #fff}
  .scale-row{display:flex;gap:6px}
  .scale{flex:1;min-height:38px;border:1px solid var(--line);border-radius:11px;background:#fff;
         font:600 13px/1 inherit;color:var(--i70)}
  .scale.on{background:var(--a);border-color:var(--a);color:#fff}
  .scale-lab{display:flex;justify-content:space-between;font-size:10.5px;color:var(--i50);margin-top:5px}
  .ta{border:1px solid var(--line);border-radius:11px;padding:10px;min-height:60px;font-size:12.5px;color:var(--i70)}
  .ta .ph{color:rgba(15,23,42,.35)}
  .res{text-align:center;padding:8px 0 4px}
  .tick{width:52px;height:52px;border-radius:50%;background:rgba(16,171,175,.12);display:grid;place-items:center;
        margin:0 auto 12px;color:var(--a);font-size:24px}
  .res h4{font-size:19px;margin:0 0 4px;font-weight:600}
  .res p{margin:0;color:var(--i50);font-size:12.5px}
  .score{font-size:36px;font-weight:600;color:var(--a);letter-spacing:-.02em;margin:2px 0}
  .corr{font-size:12px;color:var(--i50);display:flex;gap:7px;align-items:center;margin-top:5px}
  .corr .ok{color:#059669;font-weight:500} .corr .ko{color:#DC2626}

  /* ── tableaux / contenu ── */
  .tblwrap{overflow-x:auto;background:var(--card);border-radius:16px;margin-top:12px}
  table{border-collapse:collapse;width:100%;min-width:460px;font-size:13.5px}
  th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line)}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--i50);font-weight:600}
  tr:last-child td{border-bottom:0}
  .mono{font-variant-numeric:tabular-nums;color:var(--i70)}
  .lvl{display:inline-block;background:var(--n);color:#fff;border-radius:6px;padding:1px 7px;font-size:11px;
       font-weight:600;margin-right:6px}
  .parc{color:var(--a);font-weight:500}
  .sec{background:var(--card);border-radius:16px;padding:18px;margin-top:14px}
  .secnote{color:var(--i50);font-size:12.5px;margin:0 0 14px}
  .item{border-top:1px solid var(--line);padding:13px 0}
  .item:last-child{padding-bottom:0}
  .ihead{display:flex;gap:9px;align-items:flex-start}
  .ilvl{flex:none;background:rgba(15,23,42,.06);border-radius:5px;padding:1px 6px;font-size:10.5px;
        font-weight:700;color:var(--i70);margin-top:2px}
  .ilvl.none{opacity:.45}
  .itext{margin:0;flex:1;font-size:13.5px}
  .ipts{flex:none;font-size:11px;color:var(--i50)}
  .ihelp{margin:8px 0 6px 38px;padding:10px 12px;background:#F8FAFC;border-radius:10px;font-size:12px;
         color:var(--i70);white-space:pre-line}
  .opts{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0 38px}
  .opt{font-size:12px;border:1px solid var(--line);border-radius:8px;padding:3px 9px;color:var(--i50)}
  .opt.good{border-color:rgba(5,150,105,.4);background:rgba(5,150,105,.08);color:#047857;font-weight:600}
  .meta{margin:7px 0 0 38px;font-size:12px;color:var(--i50);font-style:italic}
  .note{background:#fff;border-left:3px solid var(--a);border-radius:0 12px 12px 0;padding:13px 16px;
        margin-top:10px;font-size:13.5px;color:var(--i70)}
  .note b{color:var(--ink)}
  @media(max-width:520px){.wrap{padding:18px 12px 48px}h1{font-size:22px}}
</style>

<div class="wrap">
  <h1>${esc(A.title)}</h1>
  <p class="sub">Aperçu avant intégration — généré depuis le fichier qui servira à l'injection.</p>

  <div class="kpis">
    <div class="kpi"><b>${allQ.length}</b><span>questions au total</span></div>
    <div class="kpi"><b>${maxScore}</b><span>points notés</span></div>
    <div class="kpi"><b>${written.length}</b><span>rédactions à corriger</span></div>
    <div class="kpi"><b>~20 min</b><span>durée estimée</span></div>
  </div>
  <p class="lead">Répartition des ${maxScore} questions notées par niveau :
    ${Object.entries(byLevel).map(([l, n]) => `<b>${l}</b> ${n}`).join(" · ")}.
    Les ${written.length} productions écrites sont corrigées à la main, hors score automatique.</p>

  <h2>1. Ce que voit le candidat</h2>
  <p class="sub">Reproduction fidèle du rendu réel, aux couleurs Switching.</p>
  <div class="screens">

    <div class="phone"><p class="plab">1 · Identification</p><div class="app">
      <div class="bar"><b>Switching Formation</b></div>
      <div class="body">
        <p class="eyebrow">Test de positionnement</p>
        <p class="title">${esc(A.title)}</p>
        <p class="desc">${nl(A.description.split("\n\n")[0])}</p>
        <div class="card">
          <div class="field"><label>Prénom</label><div class="input filled">Marie</div></div>
          <div class="field"><label>Nom</label><div class="input filled">DUPONT</div></div>
          <div class="field"><label>Email</label><div class="input filled">marie.dupont@exemple.fr</div></div>
        </div>
        <div class="cta">Commencer le test</div>
      </div></div></div>

    <div class="phone"><p class="plab">2 · Questions</p><div class="app">
      <div class="bar"><b>Switching Formation</b></div>
      <div class="body">
        ${renderQuestion(q1, 1, { picked: [0] })}
        ${renderQuestion(qGram, 9, { picked: [0] })}
        ${renderQuestion(qC2, 24, { picked: [1] })}
      </div></div></div>

    <div class="phone"><p class="plab">3 · Compréhension &amp; résultat</p><div class="app">
      <div class="bar"><b>Switching Formation</b></div>
      <div class="body">
        ${renderQuestion(qRead, 39, { picked: [0] })}
        <div class="card res">
          <div class="tick">✓</div>
          <h4>Merci Marie !</h4>
          <p>Vos réponses ont bien été enregistrées.</p>
        </div>
        <div class="card" style="text-align:center">
          <p style="font-size:12px;color:var(--i50);margin:0">Votre résultat</p>
          <p class="score">58 %</p>
          <p style="font-size:12px;color:var(--i50);margin:0">23 / ${maxScore} points</p>
          <p style="font-size:11px;color:var(--i50);margin:8px 0 0">Certaines réponses rédigées seront corrigées
             manuellement : votre score peut encore évoluer.</p>
        </div>
        <div class="card">
          <p style="font-size:13px;font-weight:600;margin:0 0 8px">Correction</p>
          <div class="corr"><span class="ok">✓ have lived</span></div>
          <div class="corr"><span class="ko">✗ am living</span><span>(votre réponse)</span></div>
        </div>
      </div></div></div>
  </div>

  <h2>2. Du score au niveau</h2>
  <p class="sub">Le test est calibré en difficulté croissante : le score total place le candidat sur l'échelle CECRL.</p>
  <div class="tblwrap"><table>
    <tr><th>Score</th><th>%</th><th>Niveau CECRL</th><th>Orientation</th></tr>
    ${bands}
  </table></div>
  <div class="note"><b>À savoir :</b> cette grille n'est pas encore automatique dans le LMS — aujourd'hui le
    candidat et toi voyez le score en %, et c'est toi qui lis le niveau dans ce tableau. Je peux l'automatiser
    (niveau affiché dans ton mail de notification et, si tu veux, au candidat) : c'est un ajout court.</div>

  <h2>3. Contenu intégral</h2>
  <p class="sub">Les bonnes réponses sont en vert. Elles ne quittent jamais le serveur avant que le candidat ait
    validé son test.</p>
  ${contentBlocks}
</div>`

process.stdout.write(html)
