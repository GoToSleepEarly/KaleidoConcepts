import { createPersonVisualProvider } from "@/lib/server/ai/person-visual-provider";
import {
  persistPersonVisual,
  readPersonVisualAsDataUrl,
  removeTemporaryPersonPhoto,
} from "@/lib/server/storage/person-visuals";

export function createPersonVisualGenerationDeps() {
  let provider: ReturnType<typeof createPersonVisualProvider> | null = null;
  const client = () => (provider ??= createPersonVisualProvider());
  return {
    generate: (input: { prompt: string }) => client().generate(input),
    edit: (input: { prompt: string; imageDataUrl: string }) => client().edit(input),
    persist: persistPersonVisual,
    readAsDataUrl: readPersonVisualAsDataUrl,
    removeTemporarySource: removeTemporaryPersonPhoto,
  };
}
