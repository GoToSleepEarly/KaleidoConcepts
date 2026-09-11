import { createPersonVisualProvider } from "@/lib/server/ai/person-visual-provider";
import {
  imageProviderSettings,
  normalizeAiProviderSettings,
  type AccountAiSettings,
  type AiProviderSettingsInput,
  type ImageProviderSettings,
} from "@/lib/ai-gateway";
import {
  persistPersonVisual,
  readPersonVisualAsDataUrl,
  removeTemporaryPersonPhoto,
} from "@/lib/server/storage/person-visuals";

function resolvedImageSettings(input: AiProviderSettingsInput | AccountAiSettings | ImageProviderSettings): ImageProviderSettings {
  if (typeof input === "object" && "imageGateway" in input) return imageProviderSettings(input);
  if (typeof input === "object" && "imageModel" in input) return input;
  return { ...normalizeAiProviderSettings(input), imageModel: "gpt-image-2", imageQuality: "medium" };
}

export function createPersonVisualGenerationDeps(input: AiProviderSettingsInput | AccountAiSettings | ImageProviderSettings = "quickrouter") {
  const settings = resolvedImageSettings(input);
  const aiGateway = settings.aiGateway;
  let provider: ReturnType<typeof createPersonVisualProvider> | null = null;
  const client = () => (provider ??= createPersonVisualProvider(undefined, settings));
  return {
    provider: aiGateway === "crazyrouter" ? "crazyrouter_gpt_image_2" as const : aiGateway === "easy88ai" ? "easy88ai_gpt_image_2" as const : "quickrouter_gpt_image_2" as const,
    generate: (input: { prompt: string }) => client().generate(input),
    edit: (input: { prompt: string; imageDataUrl: string }) => client().edit(input),
    persist: persistPersonVisual,
    readAsDataUrl: readPersonVisualAsDataUrl,
    removeTemporarySource: removeTemporaryPersonPhoto,
  };
}
