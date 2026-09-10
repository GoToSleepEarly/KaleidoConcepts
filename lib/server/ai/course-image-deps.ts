import { createCourseImageProvider } from "@/lib/server/ai/course-image-provider";
import { imageQualityForModel } from "@/lib/server/ai/image-model-capabilities";
import {
  imageProviderSettings,
  normalizeAiProviderSettings,
  type AccountAiSettings,
  type AiProviderSettingsInput,
  type ImageProviderSettings,
} from "@/lib/ai-gateway";
import { loadCourseImageReferences, persistCourseImage, removeTemporaryCourseImage } from "@/lib/server/storage/course-images";

function resolvedImageSettings(input: AiProviderSettingsInput | AccountAiSettings | ImageProviderSettings): ImageProviderSettings {
  if (typeof input === "object" && "imageGateway" in input) return imageProviderSettings(input);
  if (typeof input === "object" && "imageModel" in input) return input;
  return { ...normalizeAiProviderSettings(input), imageModel: "gpt-image-2" };
}

export function createCourseImageGenerationDeps(input: AiProviderSettingsInput | AccountAiSettings | ImageProviderSettings = "quickrouter") {
  const settings = resolvedImageSettings(input);
  const aiGateway = settings.aiGateway;
  let provider: ReturnType<typeof createCourseImageProvider> | null = null;
  const client = () => (provider ??= createCourseImageProvider(undefined, settings));
  const model = settings.imageModel;
  return {
    provider: aiGateway === "crazyrouter" ? "crazyrouter_gpt_image_2" as const : aiGateway === "easy88ai" ? "easy88ai_gpt_image_2" as const : "quickrouter_gpt_image_2" as const,
    generate: (input: Parameters<ReturnType<typeof createCourseImageProvider>["generate"]>[0]) => client().generate(input),
    edit: (input: Parameters<ReturnType<typeof createCourseImageProvider>["edit"]>[0]) => client().edit(input),
    persist: persistCourseImage,
    loadReferences: loadCourseImageReferences,
    removeTemporarySource: removeTemporaryCourseImage,
    normalizeQuality: (quality: Parameters<typeof imageQualityForModel>[1]) => imageQualityForModel(model, quality),
  };
}
