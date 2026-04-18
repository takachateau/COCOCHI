import { NextRequest, NextResponse } from "next/server"
import { updateProduct, deleteProduct } from "@/lib/products"

export const runtime = "nodejs"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  // backward compat: efficacy → ingredients
  if (body.efficacy && !body.ingredients) body.ingredients = body.efficacy
  try {
    const product = await updateProduct(id, body)
    return NextResponse.json(product)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteProduct(id)
  return NextResponse.json({ ok: true })
}
