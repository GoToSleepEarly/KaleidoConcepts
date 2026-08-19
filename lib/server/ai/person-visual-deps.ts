import { createPersonVisualProvider } from "@/lib/server/ai/person-visual-provider";
import type { AiGateway } from "@/lib/ai-gateway";
import {
  persistPersonVisual,
  readPersonVisualAsDataUrl,
  removeTemporaryPersonPhoto,
} from "@/lib/server/storage/person-visuals";

export function createPersonVisualGenerationDeps(aiGateway: AiGateway = "quickrouter") {
  let provider: ReturnType<typeof createPersonVisualProvider> | null = null;
  const client = () => (provider ??= createPersonVisualProvider(undefined, aiGateway));
  return {
    provider: aiGateway === "crazyrouter" ? "crazyrouter_gpt_image_2" as const : "quickrouter_gpt_image_2" as const,
    generate: (input: { prompt: string }) => client().generate(input),
    edit: (input: { prompt: string; imageDataUrl: string }) => client().edit(input),
    persist: persistPersonVisual,
    readAsDataUrl: readPersonVisualAsDataUrl,
    removeTemporarySource: removeTemporaryPersonPhoto,
  };
}
