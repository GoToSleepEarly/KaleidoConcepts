import { NextResponse } from "next/server";
import { z } from "zod";

import { generateLessonDraft } from "@/lib/server/ai/lesson-draft-generator";
import { getDb } from "@/lib/server/db";
import { CourseBasicValidationError, getStoryGenerationContext } from "@/lib/server/repositories/courses";
import {
  claimLessonDraftGeneration,
  getLessonDraft,
  getLessonDraftPrerequisites,
  LessonDraftNotFoundError,
  LessonDraftPrerequisiteError,
  LessonDraftValidationError,
  markLessonDraftGenerationFailed,
  markLessonDraftGenerationSucceeded,
  saveLessonDraft,
} from "@/lib/server/repositories/lesson-drafts";

const generateRequestSchema = z.object({
  llmModel: z.enum(["deepseek_chat", "gpt_5_5"]).default("deepseek_chat"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  try {
    // Idempotency: an existing draft means generation already succeeded, so never pay for it again.
    const existing = await getLessonDraft(db, id);

    if (existing.draft) {
      return NextResponse.json(existing);
    }

    const body = await request.json().catch(() => ({}));
    const parsed = generateRequestSchema.safeParse(body);
    const llmModel = parsed.success ? parsed.data.llmModel : "deepseek_chat";

    await db.course.update({
      where: { id },
      data: { llmModel },
    });

    // Validate prerequisites before claiming the lock so a misconfigured course fails fast with 400/404
    // instead of being marked "running".
    const context = await getStoryGenerationContext(db, id);

    if (!context) {
      return NextResponse.json({ message: "课程不存在" }, { status: 404 });
    }

    const { option } = await getLessonDraftPrerequisites(db, id);

    // Optimistic lock: only one caller flips idle/failed -> running, so concurrent clicks / tabs cannot
    // launch a second paid DeepSeek generation.
    const claim = await claimLessonDraftGeneration(db, id);

    if (!claim.claimed) {
      return NextResponse.json({ draft: null, generation: claim.generation }, { status: 202 });
    }

    // Background task: keep generating after the response returns. The process staying alive in the
    // single-instance monolith lets this finish; if it dies, GET's timeout release recovers the stuck state.
    void (async () => {
      try {
        const draft = await generateLessonDraft({ ...context, storyOption: option });
        await saveLessonDraft(db, id, draft);
        await markLessonDraftGenerationSucceeded(db, id);
      } catch (backgroundError) {
        console.error("Lesson draft generation failed", backgroundError);
        const reason = backgroundError instanceof Error ? backgroundError.message : "课文草稿生成失败";
        await markLessonDraftGenerationFailed(db, id, reason);
      }
    })();

    return NextResponse.json({ draft: null, generation: claim.generation }, { status: 202 });
  } catch (error) {
    if (error instanceof LessonDraftNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof LessonDraftPrerequisiteError || error instanceof CourseBasicValidationError || error instanceof LessonDraftValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Lesson draft generation failed", error);
    return NextResponse.json({ message: "课文草稿生成失败" }, { status: 500 });
  }
}
