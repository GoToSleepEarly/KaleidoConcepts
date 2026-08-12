import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { updateCourseContentProvider } from "@/lib/server/repositories/course-content";
import { contentProviderSchema } from "@/lib/server/validation/course-content";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = contentProviderSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "请选择有效的文本模型" }, { status: 400 });
  const { id } = await params;
  try { return NextResponse.json(await updateCourseContentProvider(getDb(), id, parsed.data.writingProvider)); }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "模型设置保存失败" }, { status: 500 }); }
}
