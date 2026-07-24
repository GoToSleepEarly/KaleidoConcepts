import { NextResponse } from "next/server";
import { z } from "zod";

import { structureLessonChatDraft } from "@/lib/server/ai/lesson-chat-structure";
import { getDb } from "@/lib/server/db";
import { getStoryGenerationContext } from "@/lib/server/repositories/courses";
import {
  LessonDraftValidationError,
  saveLessonDraft,
} from "@/lib/server/repositories/lesson-drafts";

const structureSchema = z.object({
  draftText: z.string().trim().min(1),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = structureSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ message: "请先生成文本教案" }, { status: 400 });
  }

  try {
    const db = getDb();
    const context = await getStoryGenerationContext(db, id);
    if (!context) return NextResponse.json({ message: "课程不存在" }, { status: 404 });

    const { storyOption, draft } = await structureLessonChatDraft(context, parsed.data.draftText);
    if (!db.courseStoryOption.upsert) throw new LessonDraftValidationError("故事大纲保存能力不可用");

    await db.courseStoryOption.upsert({
      where: { courseId_id: { courseId: id, id: storyOption.id } },
      update: {
        variant: storyOption.variant,
        title: storyOption.title,
        storyline: storyOption.storyline,
        chapters: storyOption.chapters,
      },
      create: { ...storyOption, courseId: id },
    });
    await db.course.update({
      where: { id },
      data: {
        selectedStoryOptionId: storyOption.id,
        lessonDraftGenStatus: "succeeded",
        lessonDraftGenStartedAt: null,
        lessonDraftGenError: null,
      },
    });
    const saved = await saveLessonDraft(db, id, draft);
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof LessonDraftValidationError || error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error instanceof z.ZodError ? "文本教案暂时无法整理成标准结构，请让 AI 修复后重试" : error.message },
        { status: 400 },
      );
    }

    console.error("Lesson chat structure failed", error);
    return NextResponse.json({ message: "标准教案生成失败" }, { status: 500 });
  }
}
