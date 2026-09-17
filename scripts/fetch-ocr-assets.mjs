// Copies tesseract.js runtime assets (worker script + WASM core) from
// node_modules into /public/vendor/tesseract and downloads the English
// traineddata. Everything is self-hosted so OCR works offline and the CSP
// never needs a third-party origin ("worker-src 'self' blob:").
//
// Run:  npm run ocr:assets   (idempotent — existing files are kept)
//
// Traineddata (~11MB gz) is fetched from tessdata.projectnaptha.com the
// first time; a network connection is required for that one download.

import { mkdir, copyFile, access } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createWriteStream } from "node:fs"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const out = resolve(root, "public/vendor/tesseract")
const tessdataOut = resolve(out, "tessdata")

const TESSDATA_URL = "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz"
const TESSDATA_FILE = "eng.traineddata.gz"

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function copyIfMissing(src, dest) {
  if (await exists(dest)) {
    console.log(`  kept   ${dest.replace(root, ".")}`)
    return
  }
  await copyFile(src, dest)
  console.log(`  copied ${dest.replace(root, ".")}`)
}

async function downloadIfMissing(url, dest) {
  if (await exists(dest)) {
    console.log(`  kept   ${dest.replace(root, ".")}`)
    return
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  console.log(`  fetched ${dest.replace(root, ".")}`)
}

await mkdir(out, { recursive: true })
await mkdir(tessdataOut, { recursive: true })

const tj = resolve("node_modules/tesseract.js")
const core = resolve("node_modules/tesseract.js-core")

await copyIfMissing(resolve(tj, "dist/worker.min.js"), resolve(out, "worker.min.js"))
await copyIfMissing(
  resolve(core, "tesseract-core-relaxedsimd-lstm.wasm.js"),
  resolve(out, "tesseract-core-relaxedsimd-lstm.wasm.js")
)
await copyIfMissing(
  resolve(core, "tesseract-core-relaxedsimd-lstm.wasm"),
  resolve(out, "tesseract-core-relaxedsimd-lstm.wasm")
)
await downloadIfMissing(`${TESSDATA_URL}`, resolve(tessdataOut, TESSDATA_FILE))

console.log("\nOCR assets ready under public/vendor/tesseract/")