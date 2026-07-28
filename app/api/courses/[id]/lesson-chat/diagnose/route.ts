import { NextResponse } from "next/server";
import { z } from "zod";

import { collectLessonChatDraftFormatIssues } from "@/lib/server/ai/lesson-chat-structure";

const diagnoseSchema = z.object({
  draftText: z.string().default(""),
});

export async function POST(request: Request) {
  const parsed = diagnoseSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json({ message: "文本检测失败" }, { status: 400 });
  }

  return NextResponse.json({
    issues: collectLessonChatDraftFormatIssues(parsed.data.draftText),
  });
}
