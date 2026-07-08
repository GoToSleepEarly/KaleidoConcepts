import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

function getStorageDir() {
  if (!process.env.STORAGE_DIR) {
    throw new Error("STORAGE_DIR is required");
  }
  return process.env.STORAGE_DIR;
}

function isSafeSegment(value: string) {
  return /^[a-zA-Z0-9_-]+(?:\.png)?$/.test(value);
}

export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string; imageFile: string }> }) {
  const { courseId, imageFile } = await params;

  if (!isSafeSegment(courseId) || !isSafeSegment(imageFile) || !imageFile.endsWith(".png")) {
    return NextResponse.json({ message: "图片路径无效" }, { status: 400 });
  }

  try {
    const root = path.resolve(getStorageDir(), "course-images");
    const filePath = path.resolve(root, courseId, imageFile);

    if (!filePath.startsWith(`${root}${path.sep}`)) {
      return NextResponse.json({ message: "图片路径无效" }, { status: 400 });
    }

    const image = await readFile(filePath);
    return new Response(image, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ message: "图片不存在" }, { status: 404 });
  }
}
