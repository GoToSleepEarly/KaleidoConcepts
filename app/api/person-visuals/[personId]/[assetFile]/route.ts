import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { resolvePersonVisualFile } from "@/lib/server/storage/person-visuals";

export async function GET(_request: Request, { params }: { params: Promise<{ personId: string; assetFile: string }> }) {
  const { personId, assetFile } = await params;
  const file = resolvePersonVisualFile(personId, assetFile);
  if (!file) return NextResponse.json({ message: "图片不存在" }, { status: 404 });
  try {
    return new NextResponse(await readFile(file), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return NextResponse.json({ message: "图片不存在" }, { status: 404 });
  }
}
