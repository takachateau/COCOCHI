// remove.bg API — 商品画像の背景を除去して透過PNGのBufferを返す

export async function removeBackground(imageBase64: string): Promise<Buffer> {
  const apiKey = process.env.REMOVE_BG_API_KEY
  if (!apiKey) throw new Error("REMOVE_BG_API_KEY が設定されていません")

  const params = new URLSearchParams({
    image_file_b64: imageBase64,
    size: "auto",
  })

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`remove.bg エラー: ${res.status} ${text.slice(0, 200)}`)
  }

  const arrayBuf = await res.arrayBuffer()
  return Buffer.from(arrayBuf)
}
