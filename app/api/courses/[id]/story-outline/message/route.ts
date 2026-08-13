import { NextResponse } from "next/server";

import { createStoryOutlineGenerationDeps } from "@/lib/server/ai/story-outline-deps";
import { getDb } from "@/lib/server/db";
import {
  CourseStoryOutlineNotFoundError,
  CourseStoryOutlineOperationConflictError,
  handleStoryOutlineMessage,
} from "@/lib/server/repositories/story-outline";
import { storyOutlineMessageSchema } from "@/lib/server/validation/story-outline";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body: unknown = await request.json();
  const parsed = storyOutlineMessageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "请输入故事想法或选择一个操作" }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(await handleStoryOutlineMessage(getDb(), id, parsed.data, createStoryOutlineGenerationDeps()));
  } catch (error) {
    if (error instanceof CourseStoryOutlineNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseStoryOutlineOperationConflictError) return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json({ message: error instanceof Error ? error.message : "故事大纲生成失败" }, { status: 500 });
  }
}
