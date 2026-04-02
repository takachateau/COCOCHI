/**
 * COCOCHI E2E テストスクリプト
 *
 * 使い方:
 *   1. npm run dev でアプリを起動しておく
 *   2. 別ターミナルで実行:
 *      node scripts/test-e2e.mjs <商品画像パス> [商品名]
 *
 * 例:
 *   node scripts/test-e2e.mjs ~/Desktop/serum.jpg "ハトムギ美容液"
 */

import fs from "fs"
import path from "path"

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000"

// ─── 引数パース ───────────────────────────────────────────────
const imagePath = process.argv[2]
const productNameArg = process.argv[3]

if (!imagePath) {
  console.error("使い方: node scripts/test-e2e.mjs <商品画像パス> [商品名]")
  console.error("例:   node scripts/test-e2e.mjs ~/Desktop/serum.jpg \"ハトムギ美容液\"")
  process.exit(1)
}

if (!fs.existsSync(imagePath)) {
  console.error(`ファイルが見つかりません: ${imagePath}`)
  process.exit(1)
}

// ─── テストデータ ─────────────────────────────────────────────
const imageBuffer = fs.readFileSync(imagePath)
const imageBase64 = imageBuffer.toString("base64")
const ext = path.extname(imagePath).toLowerCase()
const imageMime = ext === ".png" ? "image/png" : "image/jpeg"

const body = {
  productName: productNameArg ?? "テスト化粧品 モイスチャーセラム",
  efficacy: "高保湿・美白・毛穴ケア\nセラミド配合で乾燥から守る\nヒアルロン酸3種配合",
  howToUse: "洗顔後、化粧水の前に適量（2〜3プッシュ）を手のひらに取り、顔全体になじませる",
  target: "20代〜30代女性・乾燥肌・毛穴が気になる方",
  productImageBase64: imageBase64,
  productImageMime: imageMime,
}

// ─── 実行 ─────────────────────────────────────────────────────
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
console.log("COCOCHI E2E テスト開始")
console.log(`商品名  : ${body.productName}`)
console.log(`画像    : ${imagePath} (${(imageBuffer.length / 1024).toFixed(1)} KB, ${imageMime})`)
console.log(`送信先  : ${BASE_URL}/api/generate`)
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

const startTime = Date.now()

let res
try {
  res = await fetch(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
} catch (err) {
  console.error("接続エラー: アプリが起動していますか？ (npm run dev)")
  console.error(err.message)
  process.exit(1)
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

if (!res.ok) {
  const text = await res.text()
  console.error(`❌ APIエラー (${res.status}):`)
  console.error(text.slice(0, 500))
  process.exit(1)
}

const data = await res.json()
const group = data.group

console.log(`\n✅ 生成完了 (${elapsed}秒)`)
console.log(`グループID: ${group.id}`)
console.log(`商品名    : ${group.productName}`)
console.log(`パターン数: ${group.posts.length}`)

group.posts.forEach((post, i) => {
  const status = post.images.every(url => url && url.length > 0) ? "✅" : "⚠️"
  console.log(`\n${status} パターン ${i + 1}: ${post.patternName}`)
  console.log(`   タイトル  : ${post.overallTitle}`)
  console.log(`   切り口    : ${post.angle}`)
  console.log(`   スライド数: ${post.images.length}`)
  post.images.forEach((url, j) => {
    const isBlob = url?.startsWith("https://")
    const isLocal = url?.startsWith("/api/media/")
    const icon = isBlob ? "☁️ Blob" : isLocal ? "📁 Local" : "❌ 空"
    console.log(`   画像${j + 1}    : [${icon}] ${url ? url.slice(0, 80) : "なし"}`)
  })
})

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
const allImagesOk = group.posts.every(p => p.images.every(u => u && u.length > 0))
console.log(allImagesOk
  ? "✅ 全画像の生成・保存を確認。E2Eテスト成功！"
  : "⚠️  一部画像が空です。ログを確認してください。"
)
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
