import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import { getImagePath } from "@/lib/storage"

export const runtime = "nodejs"

export function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return params.then(({ path: segments }) => {
    if (segments.length < 2) return new NextResponse("Not found", { status: 404 })

    const [groupId, filename] = segments
    const filePath = getImagePath(groupId, filename)

    if (!filePath) return new NextResponse("Not found", { status: 404 })

    const buf = fs.readFileSync(filePath)
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  })
}
