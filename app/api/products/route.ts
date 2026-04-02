import { NextRequest, NextResponse } from "next/server"
import { loadProducts, createProduct } from "@/lib/products"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json(loadProducts())
}

export async function POST(req: NextRequest) {
  const { name, efficacy, howToUse, price, imageBase64, imageMime } = await req.json()
  if (!name || !efficacy || !howToUse || !imageBase64) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 })
  }
  const product = await createProduct({ name, efficacy, howToUse, price, imageBase64, imageMime: imageMime || "image/jpeg" })
  return NextResponse.json(product)
}
