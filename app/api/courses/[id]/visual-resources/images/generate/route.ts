import { NextResponse } from "next/server";
import { hasInFlightVisualVersion, shouldGenerateVisualSlot } from "@/lib/domain/visual-resource-status";
import { createCourseImageGenerationDeps } from "@/lib/server/ai/course-image-deps";
import { aiGatewayFromRequest } from "@/lib/server/ai/request-gateway";
import { getDb } from "@/lib/server/db";
import { idempotencyKey, visualResourcesError } from "@/lib/server/http/visual-resources";
import { generateVisualSlot, getCourseVisualResources, VisualImageGenerationError } from "@/lib/server/repositories/visual-resources";
import { visualGenerateSchema } from "@/lib/server/validation/visual-resources";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const key = idempotencyKey(request);
    const input = visualGenerateSchema.parse(await request.json());
    const state = await getCourseVisualResources(getDb(), id);
    const targets = state.slots.filter((slot) => shouldGenerateVisualSlot(slot, input, state.planRevision));
    if (targets.length === 0) {
      const requestedSlots = state.slots.filter((slot) => input.scope === "cover" ? slot.slotType === "visual_cover" : input.scope === "slot" ? slot.id === input.slotId : input.scope === "chapter" ? slot.chapterId === input.chapterId : true);
      if (requestedSlots.some((slot) => hasInFlightVisualVersion(slot.versions, state.planRevision))) return NextResponse.json({ message: "图片正在生成，请勿重复提交" }, { status: 409 });
      return NextResponse.json({ message: "没有需要生成的图片" }, { status: 400 });
    }
    const deps = createCourseImageGenerationDeps(aiGatewayFromRequest(request));
    const results: Array<{ slotId: string; assetId?: string; error?: string }> = [];
    for (const slot of targets) {
      try {
        const asset = await generateVisualSlot(getDb(), id, slot.id, `${key}:${slot.id}`, deps);
        results.push({ slotId: slot.id, assetId: asset?.id });
      } catch (error) {
        results.push({ slotId: slot.id, error: error instanceof Error ? error.message : "图片生成失败" });
        if (error instanceof VisualImageGenerationError && error.failureCode === "policy_blocked") break;
      }
    }
    return NextResponse.json({ results }, { status: results.some((result) => result.error) ? 207 : 200 });
  } catch (error) { return visualResourcesError(error); }
}
