import { test } from "node:test"
import assert from "node:assert/strict"
import { hasVideo, resolveHlsReference, rewriteHls } from "../../lib/video/hls"
const master = "videos/job/attempt/master.m3u8"
test("references stay inside the package, including key and init URIs", async () => {
  for (const uri of ["../../secret.ts", "https://external.invalid/seg.ts", "//external/seg.ts", "%2e%2e/seg.ts", "seg.ts?secret=1", "file:seg.ts", "\\secret.ts"]) {
    assert.throws(() => resolveHlsReference(master, master, uri))
  }
  assert.equal(resolveHlsReference(master, "videos/job/attempt/720/index.m3u8", "../audio/seg.aac"), "videos/job/attempt/audio/seg.aac")
  const playlist = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../key.key"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nseg.m4s\n#EXT-X-ENDLIST\n'
  const seen: string[] = []
  const result = await rewriteHls(playlist, async uri => { seen.push(uri); return "https://signed.invalid/" + uri })
  assert.equal(seen.length, 3)
  assert.match(result, /URI="https:\/\/signed.invalid\/init.mp4"/)
  await assert.rejects(() => rewriteHls('#EXTM3U\n#EXT-X-DEFINE:NAME="x",VALUE="secret"\n', async s => s))
  await assert.rejects(() => rewriteHls('#EXTM3U\n#EXT-X-KEY:URI=key.key\n', async s => s))
})
test("video gate applies equally to Vimeo, R2 and dual chapters", () => {
  assert.equal(hasVideo({ videoUrl: "123" }), true)
  assert.equal(hasVideo({ videoR2Key: master }), true)
  assert.equal(hasVideo({ videoUrl: "123", videoR2Key: master }), true)
  assert.equal(hasVideo({ videoUrl: null, videoR2Key: null }), false)
})
