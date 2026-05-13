/**
 * POST /api/benchmark/analyze
 * v2では /api/benchmark/upload でアップロード時に自動分析するため、
 * このエンドポイントは廃止済み。後方互換性のためエラーを返す。
 */
import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    { error: "v2では /api/benchmark/upload を使用してください" },
    { status: 410 },
  )
}
