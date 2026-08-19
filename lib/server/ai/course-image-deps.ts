import { createCourseImageProvider } from "@/lib/server/ai/course-image-provider";
import { imageQualityForModel } from "@/lib/server/ai/image-model-capabilities";
import type { AiGateway } from "@/lib/ai-gateway";
import { composeCourseImageReferences, persistCourseImage, removeTemporaryCourseImage } from "@/lib/server/storage/course-images";

export function createCourseImageGenerationDeps(aiGateway: AiGateway = "quickrouter") {
  let provider: ReturnType<typeof createCourseImageProvider> | null = null;
  const client = () => (provider ??= createCourseImageProvider(undefined, aiGateway));
  const model = aiGateway === "crazyrouter"
    ? process.env.CRAZYROUTER_IMAGE_MODEL || "gpt-image-2"
    : process.env.QUICKROUTER_IMAGE_MODEL || "gpt-image-2";
  return {
    provider: aiGateway === "crazyrouter" ? "crazyrouter_gpt_image_2" as const : "quickrouter_gpt_image_2" as const,
    generate: (input: Parameters<ReturnType<typeof createCourseImageProvider>["generate"]>[0]) => client().generate(input),
    edit: (input: Parameters<ReturnType<typeof createCourseImageProvider>["edit"]>[0]) => client().edit(input),
    persist: persistCourseImage,
    composeReferences: composeCourseImageReferences,
    removeTemporarySource: removeTemporaryCourseImage,
    normalizeQuality: (quality: Parameters<typeof imageQualityForModel>[1]) => imageQualityForModel(model, quality),
  };
}
