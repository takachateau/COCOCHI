/**
 * 参考画像ムード自動タグ付けスクリプト
 *
 * 使い方:
 *   node scripts/tag-references.mjs
 *
 * やること:
 *   - reference/ 以下の各 postフォルダの 01_thumbnail.jpg を Claude Vision に送る
 *   - ムード（natural / luxury / pop / cool）を自動判定
 *   - reference/metadata.json を新形式で上書き
 */

import Anthropic from "@anthropic-ai/sdk"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REF_DIR = path.join(__dirname, "../reference")
const META_PATH = path.join(REF_DIR, "metadata.json")

const PATTERN_DIRS = [
  "B_手持ちUGC型",
  "C_直置きUGC型",
  "D_記事投稿型",
]

const MOODS = ["natural", "luxury", "pop", "cool"]

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function detectMood(imagePath) {
  const imageData = fs.readFileSync(imagePath)
  const base64 = imageData.toString("base64")

  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 64,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: base64 },
        },
        {
          type: "text",
          text: `これはInstagramのコスメ系UGC投稿のサムネイル画像です。
以下の4つのムードのうち、この画像に最も近いものを1単語で答えてください。

- natural（ナチュラル・ミニマル・オーガニック系）
- luxury（ラグジュアリー・高級感・洗練系）
- pop（ポップ・カラフル・明るい・若者向け）
- cool（クール・スタイリッシュ・モノトーン・エディトリアル系）

回答は必ず上記4つのいずれか1単語のみ。`,
        },
      ],
    }],
  })

  const text = res.content[0].text.trim().toLowerCase()
  const matched = MOODS.find(m => text.includes(m))
  return matched ?? "natural"
}

async function main() {
  const posts = {}

  for (const patternDir of PATTERN_DIRS) {
    const patternPath = path.join(REF_DIR, patternDir)
    if (!fs.existsSync(patternPath)) continue

    const entries = fs.readdirSync(patternPath)
    const postFolders = entries.filter(e => e.startsWith("post"))

    for (const postFolder of postFolders.sort()) {
      const thumbPath = path.join(patternPath, postFolder, "01_thumbnail.jpg")
      if (!fs.existsSync(thumbPath)) {
        console.log(`⚠ サムネなし: ${patternDir}/${postFolder}`)
        continue
      }

      process.stdout.write(`🔍 ${patternDir}/${postFolder} ... `)
      try {
        const mood = await detectMood(thumbPath)
        const key = `${patternDir}/${postFolder}`
        posts[key] = { mood }
        console.log(mood)
      } catch (e) {
        console.log(`エラー: ${e.message}`)
      }
    }
  }

  const newMeta = { posts }
  fs.writeFileSync(META_PATH, JSON.stringify(newMeta, null, 2), "utf8")
  console.log(`\n✅ metadata.json を更新しました（${Object.keys(posts).length}件）`)
  console.log(JSON.stringify(newMeta, null, 2))
}

main().catch(console.error)
