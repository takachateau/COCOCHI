/**
 * GET    /api/competitors              — 競合商品一覧（?productId=xxx で絞り込み可）
 * POST   /api/competitors              — 競合商品を登録
 * DELETE /api/competitors?id=xxx       — 競合商品を削除
 */
import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import {
  dbLoadCompetitorProducts,
  dbSaveCompetitorProduct,
  dbDeleteCompetitorProduct,
} from "@/lib/supabase"

export async function GET(req: NextRequest) {
  try {
    const productId = req.nextUrl.searchParams.get("productId") ?? undefined
    const products = await dbLoadCompetitorProducts(productId)
    return NextResponse.json({ products })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    const productId   = form.get("productId")   as string
    const brandName   = form.get("brandName")   as string
    const productName = form.get("productName") as string
    const price       = form.get("price")       as string | null
    const features    = form.get("features")    as string
    const pros        = form.get("pros")        as string
    const cons        = form.get("cons")        as string
    const category    = form.get("category")    as string | null
    const tagsRaw     = form.get("tags")        as string | null
    const imageFile   = form.get("image")       as File | null

    if (!productId || !brandName || !productName || !features || !pros || !cons || !imageFile) {
      return NextResponse.json(
        { error: "productId / brandName / productName / features / pros / cons / image は必須です" },
        { status: 400 },
      )
    }

    const arrayBuffer = await imageFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mime = imageFile.type || "image/jpeg"
    const ts = Date.now()

    const { url: imageUrl } = await put(
      `cocochi/competitors/${ts}_${imageFile.name}`,
      buffer,
      { access: "public", contentType: mime, addRandomSuffix: true },
    )

    const tags = tagsRaw ? JSON.parse(tagsRaw) as string[] : []

    const product = await dbSaveCompetitorProduct({
      productId,
      brandName,
      productName,
      price:    price || null,
      features,
      pros,
      cons,
      imageUrl,
      imageMime: mime,
      category: category || null,
      tags,
    })

    return NextResponse.json({ product })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })
    await dbDeleteCompetitorProduct(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
