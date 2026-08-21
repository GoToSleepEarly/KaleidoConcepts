import { NextResponse } from "next/server";

import { createStoryOutlineGenerationDeps, StoryAlignmentResponseError, StoryOutlineResponseError } from "@/lib/server/ai/story-outline-deps";
import { devAiLog } from "@/lib/server/ai/dev-ai-log";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import type { AiGateway } from "@/lib/ai-gateway";
import { getDb } from "@/lib/server/db";
import {
  CourseStoryOutlineNotFoundError,
  CourseStoryOutlineOperationConflictError,
  getStoryOutlineState,
  handleStoryOutlineMessage,
  publicStoryOutlineErrorMessage,
} from "@/lib/server/repositories/story-outline";
import { storyOutlineMessageSchema } from "@/lib/server/validation/story-outline";
import { hasCourseDownstream, runBeforeCourseDownstreamReset, type CourseDownstreamDb } from "@/lib/server/repositories/course-downstream";

const outlineMutationActions = new Set([
  "confirm_direction",
  "generate_from_reference",
  "regenerate_outline",
  "revise_outline",
  "revise_chapter",
  "confirm_story_change",
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body: unknown = await request.json();
  const parsed = storyOutlineMessageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "请输入故事想法或选择一个操作" }, { status: 400 });
  const { id } = await params;
  let aiGateway: AiGateway | undefined;
  try {
    const db = getDb();
    aiGateway = await aiGatewayFromRequest(request, db);
    if (parsed.data.action && outlineMutationActions.has(parsed.data.action)) {
      const downstreamDb = db as unknown as CourseDownstreamDb;
      const hasDownstream = await hasCourseDownstream(downstreamDb, id, "story_outline");
      if (hasDownstream && parsed.data.resetDownstream !== true) {
        return NextResponse.json({ message: "修改故事大纲会删除已有的教学规划、文案与练习、视觉资源、图片和预览发布设置", requiresReset: true }, { status: 409 });
      }
      if (hasDownstream) {
        await runBeforeCourseDownstreamReset(downstreamDb, id, "story_outline", () => handleStoryOutlineMessage(db, id, parsed.data, createStoryOutlineGenerationDeps(aiGateway)));
        return NextResponse.json(await getStoryOutlineState(db, id));
      }
    }
    return NextResponse.json(await handleStoryOutlineMessage(db, id, parsed.data, createStoryOutlineGenerationDeps(aiGateway)));
  } catch (error) {
    if (error instanceof CourseStoryOutlineNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseStoryOutlineOperationConflictError) return NextResponse.json({ message: error.message }, { status: 409 });
    devAiLog({
      operation: "story_outline_request",
      phase: "error",
      context: {
        courseId: id,
        ...(parsed.data.requestId ? { requestId: parsed.data.requestId } : {}),
        ...(aiGateway ? { gateway: aiGateway } : {}),
      },
      error,
    });
    if (error instanceof StoryAlignmentResponseError) {
      return NextResponse.json({ message: error.message, errorCode: error.code, requestId: parsed.data.requestId }, { status: error.status });
    }
    if (error instanceof StoryOutlineResponseError) {
      return NextResponse.json({ message: error.message, requestId: parsed.data.requestId }, { status: error.status });
    }
    return NextResponse.json({
      message: publicStoryOutlineErrorMessage(error),
      requestId: parsed.data.requestId,
    }, { status: 500 });
  }
}
