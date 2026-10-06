/** Moteur local de l'aperçu V3 : mêmes seuils, pondérations et départage. */
export type SearchChapter = { id: string; title: string; module: string; theme?: string; index: number }
export function normalize(s: string) { return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, ' ').trim() }
function distance(a: string, b: string) {
  const d = Array.from({length:a.length+1}, (_,i) => [i])
  for(let j=0;j<=b.length;j++) d[0][j]=j
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) {
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1))
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]) d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1)
  }
  return d[a.length][b.length]
}
export function wordScore(q: string,w: string) {
  if(q===w)return 1
  if(w===q+'s'||q===w+'s')return .97
  if(q.length<3)return 0
  if(w.startsWith(q))return .5+.35*q.length/w.length
  const dist=distance(q,w)
  return dist<=Math.min(3,Math.ceil(q.length*.45))?1-dist/Math.max(q.length,w.length):0
}
export function tokens(s: string) { return normalize(s).split(' ').filter(w=>w.length>1&&!['le','la','les','de','des','du','un','une','et','au','aux'].includes(w)) }
export function prepareIndex<T extends SearchChapter>(chapters: readonly T[]) {
  return chapters.map(c=>({c,fields:[{words:tokens(c.title),weight:1},{words:tokens(c.module),weight:.84},{words:tokens(c.theme||''),weight:.95}]}))
}
export function findLessons<T extends SearchChapter>(index: ReturnType<typeof prepareIndex<T>>,query: string) {
  const qs=tokens(query.slice(0,120)).slice(0,12)
  if(!qs.length)return []
  const rows: { c:T; score:number }[]=[]
  for(const {c,fields} of index) {
    const scores=qs.map(q=>Math.max(...fields.flatMap(f=>f.words.map(w=>wordScore(q,w)*f.weight))))
    if(scores.some(v=>v<.53))continue
    const titleOnly=qs.every(q=>fields[0].words.some(w=>wordScore(q,w)>=.53))
    rows.push({c,score:scores.reduce((a,b)=>a+b,0)/qs.length+(titleOnly?.12:0)})
  }
  return rows.sort((a,b)=>b.score-a.score||a.c.index-b.c.index)
}
