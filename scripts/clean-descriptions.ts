/**
 * Nettoie les Chapter.description :
 *  - Décode toutes les entités HTML (&nbsp; &agrave; &icirc; &eacute; ...)
 *  - Convertit les tags simples en line-breaks
 *  - Convertit les <ol><li> en "1. " "2. " ...
 *  - Strip le reste des tags
 *  - Trim espaces multiples
 *
 * Idempotent : safe à re-run.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Décodage exhaustif des entités HTML les plus courantes en français
const HTML_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  agrave: "à", Agrave: "À", acirc: "â", Acirc: "Â", aelig: "æ", AElig: "Æ", aring: "å", Aring: "Å", atilde: "ã", Atilde: "Ã", auml: "ä", Auml: "Ä",
  ccedil: "ç", Ccedil: "Ç",
  egrave: "è", Egrave: "È", eacute: "é", Eacute: "É", ecirc: "ê", Ecirc: "Ê", euml: "ë", Euml: "Ë",
  igrave: "ì", Igrave: "Ì", iacute: "í", Iacute: "Í", icirc: "î", Icirc: "Î", iuml: "ï", Iuml: "Ï",
  ograve: "ò", Ograve: "Ò", oacute: "ó", Oacute: "Ó", ocirc: "ô", Ocirc: "Ô", oslash: "ø", Oslash: "Ø", otilde: "õ", Otilde: "Õ", ouml: "ö", Ouml: "Ö",
  ugrave: "ù", Ugrave: "Ù", uacute: "ú", Uacute: "Ú", ucirc: "û", Ucirc: "Û", uuml: "ü", Uuml: "Ü",
  yacute: "ý", Yacute: "Ý", yuml: "ÿ", Yuml: "Ÿ",
  ntilde: "ñ", Ntilde: "Ñ",
  laquo: "«", raquo: "»", hellip: "…", mdash: "—", ndash: "–", lsquo: "'", rsquo: "'", ldquo: "“", rdquo: "”", bull: "•", middot: "·",
  euro: "€", pound: "£", yen: "¥", cent: "¢", copy: "©", reg: "®", trade: "™",
  deg: "°", plusmn: "±", times: "×", divide: "÷",
  szlig: "ß",
}

function decodeEntities(s: string): string {
  // Named entities
  let out = s.replace(/&([a-zA-Z]+);/g, (m, name) => {
    if (HTML_ENTITIES[name] !== undefined) return HTML_ENTITIES[name]
    return m
  })
  // Numeric &#123;
  out = out.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
  // Hex &#xAB;
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
  return out
}

function cleanDescription(raw: string): string {
  if (!raw) return ""
  let s = raw

  // 1. Décoder les entités HTML
  s = decodeEntities(s)

  // 2. Convertir les listes ordonnées <ol><li>X</li></ol> → "1. X\n2. Y..."
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let n = 0
    return "\n" + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, item) => {
      n++
      return `${n}. ${item.trim()}\n`
    })
  })

  // 3. <ul><li>X</li></ul> → "• X\n"
  s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    return "\n" + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, item) => `• ${item.trim()}\n`)
  })

  // 4. <br> et <br/> → "\n"
  s = s.replace(/<br\s*\/?>/gi, "\n")

  // 5. <p>...</p> → "\n...\n"
  s = s.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
  s = s.replace(/<p[^>]*>/gi, "")
  s = s.replace(/<\/p>/gi, "\n")

  // 6. <div> idem
  s = s.replace(/<\/div>\s*<div[^>]*>/gi, "\n")
  s = s.replace(/<div[^>]*>|<\/div>/gi, "")

  // 7. <strong>/<b>/<em>/<i>/<span>/<u> → strip tags, garder contenu
  s = s.replace(/<\/?(?:strong|b|em|i|span|u|font|a)[^>]*>/gi, "")

  // 8. Strip tout autre tag restant
  s = s.replace(/<[^>]+>/g, " ")

  // 9. Insérer un saut de ligne entre phrases collées (minuscule|chiffre + Majuscule au milieu d'un mot)
  // Pattern courant Rise Up : 2 <p>...</p> consécutifs strippés → "consoleExplication"
  // On évite ASCII anglais simple ("McDonald") en ne taggant que les chaînes 6+ lettres avant la majuscule
  s = s.replace(/([a-zàâäéèêëîïôöùûüç])([A-Z][a-zà-ÿ]{4,})/g, "$1\n$2")

  // 10. Caractères de ligature corrompus (ﬁ ﬂ ﬀ ﬃ ﬄ ﬆ)
  s = s.replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/ﬀ/g, "ff").replace(/ﬃ/g, "ffi").replace(/ﬄ/g, "ffl").replace(/ﬆ/g, "st")

  // 11. Normaliser les espaces et lignes
  s = s.replace(/[ \t]+/g, " ")              // multi-spaces → single
  s = s.replace(/\n{3,}/g, "\n\n")           // 3+ lignes → 2
  s = s.replace(/^\s+|\s+$/g, "")            // trim
  s = s.replace(/[ \t]*\n[ \t]*/g, "\n")     // trim chaque ligne

  return s
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const chapters = await prisma.chapter.findMany({
    where: { description: { not: null } },
    select: { id: true, title: true, description: true },
  })

  let cleaned = 0
  let unchanged = 0

  for (const ch of chapters) {
    const original = ch.description || ""
    const next = cleanDescription(original)
    if (next === original) { unchanged++; continue }

    if (cleaned < 3) {
      console.log(`\n📝 ${ch.title.slice(0, 70)}`)
      console.log(`   AVANT: ${original.slice(0, 120).replace(/\n/g, " | ")}`)
      console.log(`   APRÈS: ${next.slice(0, 120).replace(/\n/g, " | ")}`)
    }

    if (!dryRun) {
      await prisma.chapter.update({
        where: { id: ch.id },
        data: { description: next },
      })
    }
    cleaned++
  }

  console.log(`\n🏁 ${dryRun ? "[DRY-RUN] " : ""}${cleaned} descriptions nettoyées · ${unchanged} déjà propres · ${chapters.length} total`)
  await prisma.$disconnect()
}

main().catch(e => { console.error("FATAL:", e); process.exit(1) })
