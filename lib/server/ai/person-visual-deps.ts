import { createPersonVisualProvider } from "@/lib/server/ai/person-visual-provider";
import { normalizeAiProviderSettings, type AiProviderSettingsInput } from "@/lib/ai-gateway";
import {
  persistPersonVisual,
  readPersonVisualAsDataUrl,
  removeTemporaryPersonPhoto,
} from "@/lib/server/storage/person-visuals";

export function createPersonVisualGenerationDeps(input: AiProviderSettingsInput = "quickrouter") {
  const settings = normalizeAiProviderSettings(input);
  const aiGateway = settings.aiGateway;
  let provider: ReturnType<typeof createPersonVisualProvider> | null = null;
  const client = () => (provider ??= createPersonVisualProvider(undefined, settings));
  return {
    provider: aiGateway === "crazyrouter" ? "crazyrouter_gpt_image_2" as const : "quickrouter_gpt_image_2" as const,
    generate: (input: { prompt: string }) => client().generate(input),
    edit: (input: { prompt: string; imageDataUrl: string }) => client().edit(input),
    persist: persistPersonVisual,
    readAsDataUrl: readPersonVisualAsDataUrl,
    removeTemporarySource: removeTemporaryPersonPhoto,
  };
}
