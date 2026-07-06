import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { CourseBasicValidationError, getStoryGenerationContext } from "@/lib/server/repositories/courses";
import {
  saveGeneratedStoryOptions,
  StoryOptionsLockedError,
  StoryOptionsValidationError,
} from "@/lib/server/repositories/story-options";
import { generateStoryOptions, getExpectedChapterCount } from "@/lib/server/ai/story-generator";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  try {
    const context = await getStoryGenerationContext(db, id);

    if (!context) {
      return NextResponse.json({ message: "课程不存在" }, { status: 404 });
    }

    const options = await generateStoryOptions(context);
    const result = await saveGeneratedStoryOptions(db, id, options, getExpectedChapterCount(context.course.durationMinutes));

    return NextResponse.json({ options: result.options }, { status: 201 });
  } catch (error) {
    if (error instanceof CourseBasicValidationError) {
      return NextResponse.json({ message: "课程基础信息不完整" }, { status: 400 });
    }

    if (error instanceof StoryOptionsLockedError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    if (error instanceof StoryOptionsValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "故事方案生成失败" }, { status: 500 });
  }
}
