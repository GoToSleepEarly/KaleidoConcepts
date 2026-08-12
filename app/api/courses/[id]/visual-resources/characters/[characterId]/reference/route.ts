import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { idempotencyKey, visualResourcesError } from "@/lib/server/http/visual-resources";
import { saveUploadedCharacterReference } from "@/lib/server/repositories/visual-resources";
import { persistCourseImage, prepareCourseCharacterReference, removeTemporaryCourseImage } from "@/lib/server/storage/course-images";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; characterId: string }> }) {
  const { id, characterId } = await params;
  let temporarySourcePath: string | null = null;
  try {
    const key = idempotencyKey(request);
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ message: "请选择参考图" }, { status: 400 });
    const prepared = await prepareCourseCharacterReference(id, key, file);
    temporarySourcePath = prepared.temporarySourcePath;
    const asset = await saveUploadedCharacterReference(getDb(), id, characterId, key, prepared, { persist: persistCourseImage });
    return NextResponse.json(asset);
  } catch (error) {
    return visualResourcesError(error);
  } finally {
    if (temporarySourcePath) await removeTemporaryCourseImage(temporarySourcePath).catch(() => undefined);
  }
}
