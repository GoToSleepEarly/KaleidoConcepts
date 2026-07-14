import { createQuickRouterImageClient } from "@/lib/server/ai/quickrouter-image";
import type { CourseImageGenerationDeps } from "@/lib/server/repositories/course-images";
import { downloadCourseImage } from "@/lib/server/storage/course-images";

// The image client validates config (API key) at construction. Build it lazily so a request that never needs to
// generate (e.g. it exits on the claim guard) does not fail when the provider is misconfigured.
export function createImageGenerationDeps(): CourseImageGenerationDeps {
  let client: ReturnType<typeof createQuickRouterImageClient> | null = null;
  const getClient = () => (client ??= createQuickRouterImageClient());
  return {
    provider: {
      submit: (input) => getClient().submit(input),
    },
    download: downloadCourseImage,
  };
}
