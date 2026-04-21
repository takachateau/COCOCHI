/**
 * ローカルの data/groups.json と data/products.json を
 * Vercel Blob にアップロードして本番データを復元するスクリプト
 */

import { put } from "@vercel/blob"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, "../data")

async function upload(localFile, blobPath) {
  if (!fs.existsSync(localFile)) {
    console.log(`⚠ ファイルなし: ${localFile}`)
    return
  }
  const content = fs.readFileSync(localFile, "utf-8")
  const parsed = JSON.parse(content)
  console.log(`📤 ${path.basename(localFile)} (${parsed.length}件) → ${blobPath}`)
  await put(blobPath, content, {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  })
  console.log(`✅ 完了: ${blobPath}`)
}

async function main() {
  await upload(path.join(DATA_DIR, "groups.json"),   "cocochi/db/groups.json")
  await upload(path.join(DATA_DIR, "products.json"), "cocochi/db/products.json")
  console.log("\n🎉 復元完了！ローカル・本番どちらでも表示されます。")
}

main().catch(console.error)
