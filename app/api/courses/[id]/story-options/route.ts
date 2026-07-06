import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  listStoryOptions,
  StoryOptionsLockedError,
  StoryOptionsNotFoundError,
  StoryOptionsValidationError,
  updateStoryOptions,
} from "@/lib/server/repositories/story-options";
import { storyOptionsPayloadSchema } from "@/lib/server/validation/story-options";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await listStoryOptions(getDb(), id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StoryOptionsNotFoundError) {
      return NextResponse.json({ message: "课程不存在" }, { status: 404 });
    }

    return NextResponse.json({ message: "故事方案加载失败" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = storyOptionsPayloadSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "故事方案信息不完整" }, { status: 400 });
  }

  try {
    const result = await updateStoryOptions(getDb(), id, payload.data.options);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StoryOptionsNotFoundError) {
      return NextResponse.json({ message: "课程不存在" }, { status: 404 });
    }

    if (error instanceof StoryOptionsLockedError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    if (error instanceof StoryOptionsValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "故事方案保存失败" }, { status: 500 });
  }
}
