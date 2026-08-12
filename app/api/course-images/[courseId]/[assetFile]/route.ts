import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { resolveCourseImageFile } from "@/lib/server/storage/course-images";

export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string; assetFile: string }> }) {
  const { courseId, assetFile } = await params;
  const file = resolveCourseImageFile(courseId, assetFile);
  if (!file) return NextResponse.json({ message: "图片不存在" }, { status: 404 });
  try {
    return new NextResponse(await readFile(file), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch {
    return NextResponse.json({ message: "图片不存在" }, { status: 404 });
  }
}
