import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseStoryOutlineNotFoundError,
  updateReferenceMaterial,
} from "@/lib/server/repositories/story-outline";
import { referenceMaterialUpdateSchema } from "@/lib/server/validation/story-outline";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; referenceId: string }> }) {
  const body: unknown = await request.json();
  const parsed = referenceMaterialUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "请完整填写参考资料" }, { status: 400 });
  const { id, referenceId } = await params;
  try {
    return NextResponse.json(await updateReferenceMaterial(getDb(), id, referenceId, parsed.data));
  } catch (error) {
    if (error instanceof CourseStoryOutlineNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: "参考资料保存失败" }, { status: 500 });
  }
}
