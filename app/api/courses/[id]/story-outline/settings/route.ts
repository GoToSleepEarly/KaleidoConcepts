import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseStoryOutlineConflictError,
  CourseStoryOutlineNotFoundError,
  updateStoryOutlineSettings,
} from "@/lib/server/repositories/story-outline";
import { storyOutlineSettingsSchema } from "@/lib/server/validation/story-outline";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body: unknown = await request.json();
  const parsed = storyOutlineSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "请选择章节数和故事复杂度" }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(await updateStoryOutlineSettings(getDb(), id, parsed.data));
  } catch (error) {
    if (error instanceof CourseStoryOutlineNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseStoryOutlineConflictError) return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json({ message: "故事设置保存失败" }, { status: 500 });
  }
}
