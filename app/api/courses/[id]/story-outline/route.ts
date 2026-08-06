import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseStoryOutlineConflictError,
  CourseStoryOutlineNotFoundError,
  getStoryOutlineState,
  saveStoryOutline,
} from "@/lib/server/repositories/story-outline";
import { storyOutlineSaveSchema } from "@/lib/server/validation/story-outline";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await getStoryOutlineState(getDb(), id));
  } catch (error) {
    if (error instanceof CourseStoryOutlineNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: "故事大纲加载失败" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body: unknown = await request.json();
  const parsed = storyOutlineSaveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "请完整填写故事标题、概括、角色和章节" }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(await saveStoryOutline(getDb(), id, parsed.data.outline, parsed.data.resetDownstream === true));
  } catch (error) {
    if (error instanceof CourseStoryOutlineNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseStoryOutlineConflictError) return NextResponse.json({ message: error.message, requiresReset: true }, { status: 409 });
    return NextResponse.json({ message: "故事大纲保存失败" }, { status: 500 });
  }
}
