/** Contre-tests de l'uploader réel ; SDK ET trousseau remplacés dans un bundle local. */
import { build } from "esbuild"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { resolve, basename } from "node:path"
import assert from "node:assert/strict"
import { readInventory } from "./common"

async function main() {
  const [privateFolder, output] = process.argv.slice(2)
  const folder = `${privateFolder}/mock-upload`; await mkdir(folder, { recursive: true, mode: 0o700 })
  const inventory = await readInventory(`${privateFolder}/fixture-word.json`)
  inventory.finalizedAt = new Date().toISOString()
  const bytes = Buffer.from("fichier de banc sans video R2\n"), sha256 = createHash("sha256").update(bytes).digest("hex")
  for (const e of inventory.entries) for (const o of e.objects) { o.size = bytes.length; o.sha256 = sha256; await writeFile(`${folder}/${basename(o.key)}`, bytes) }
  await writeFile(`${folder}/inventory.json`, JSON.stringify(inventory))
  const state = `${folder}/sdk-state.json`
  await writeFile(state, JSON.stringify({ objects: {}, puts: 0, gets: 0 }))
  const compiled = resolve("node_modules/.cache/bureautique-intros/upload.cjs")
  await build({ entryPoints: ["scripts/bureautique-intros/upload.ts"], outfile: compiled, bundle: true, platform: "node", format: "cjs", packages: "external", logLevel: "silent",
    plugins: [{ name: "r2-entierement-factice", setup(b) {
      b.onResolve({ filter: /^(@aws-sdk\/client-s3|node:child_process)$/ }, args => ({ path: args.path, namespace: "factice" }))
      b.onLoad({ filter: /^node:child_process$/, namespace: "factice" }, () => ({ loader: "js", contents: `export const execFileSync = () => "RECETTE_SANS_TROUSSEAU"` }))
      b.onLoad({ filter: /^@aws-sdk\/client-s3$/, namespace: "factice" }, () => ({ loader: "js", contents: `
        import fs from 'node:fs';
        export class HeadObjectCommand { constructor(input) { this.input=input; this.kind='head'; } }
        export class PutObjectCommand { constructor(input) { this.input=input; this.kind='put'; } }
        export class GetObjectCommand { constructor(input) { this.input=input; this.kind='get'; } }
        export class S3Client {
          async send(c) {
            const file=process.env.MOCK_R2_STATE; const s=JSON.parse(fs.readFileSync(file)); const x=c.input; const o=s.objects[x.Key];
            if(c.kind==='head') { if(!o) throw { $metadata:{httpStatusCode:404} }; return { ContentLength:o.size, Metadata:{sha256:o.sha256} }; }
            if(c.kind==='put') {
              if(x.IfNoneMatch!=='*'||o) throw new Error('Écrasement interdit');
              s.objects[x.Key]={size:x.Body.length,sha256:x.Metadata.sha256,body:x.Body.toString('base64')};s.puts++;fs.writeFileSync(file,JSON.stringify(s));return {};
            }
            if(!o) throw new Error('Absent');s.gets++;fs.writeFileSync(file,JSON.stringify(s));
            return { Body:(async function*(){yield Buffer.from(o.body,'base64')})() };
          }
          destroy() {}
        }
      ` }))
    } }] })
  const env = { ...process.env, INTRO_PHASE2_GO: "BUREAUTIQUE_207", MOCK_R2_STATE: state }
  const args = (proof: string) => [compiled, folder, `${folder}/inventory.json`, `${folder}/${proof}`, "0", "4", "--apply-after-go"]
  execFileSync(process.execPath, args("first.json"), { env, timeout: 60000 })
  let s = JSON.parse(await readFile(state, "utf8")); assert.equal(s.puts, 4); assert.equal(s.gets, 4)
  execFileSync(process.execPath, args("second.json"), { env, timeout: 60000 })
  s = JSON.parse(await readFile(state, "utf8")); assert.equal(s.puts, 4); assert.equal(s.gets, 8)
  const second = JSON.parse(await readFile(`${folder}/second.json`, "utf8")); assert.equal(second.length, 4); assert.ok(second.every((r: any) => r.operation === "identical-skip"))
  s.objects[inventory.entries[0].objects[0].key].sha256 = "0".repeat(64); await writeFile(state, JSON.stringify(s))
  const refused = spawnSync(process.execPath, args("conflict.json"), { env, timeout: 60000 }); assert.equal(refused.status, 1)
  assert.deepEqual(JSON.parse(await readFile(state, "utf8")), s)
  await writeFile(output, JSON.stringify({ mode: "SDK et trousseau factices : aucun appel réseau/R2", created: 4, identicalSkip: 4, getVerified: 8, remoteConflictRefused: true, overwrite: 0 }, null, 2) + "\n")
  console.log("Upload simulé PASS : création conditionnelle, reprise sans écrasement, GET vérifié, conflit distant refusé ; zéro appel R2")
}
main().catch(() => { console.error("Contre-test uploader interrompu ; stockage totalement factice"); process.exitCode = 1 })
