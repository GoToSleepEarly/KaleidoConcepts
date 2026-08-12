import { createCourseImageProvider } from "@/lib/server/ai/course-image-provider";
import { composeCourseImageReferences, persistCourseImage, removeTemporaryCourseImage } from "@/lib/server/storage/course-images";

export function createCourseImageGenerationDeps() {
  let provider: ReturnType<typeof createCourseImageProvider> | null = null;
  const client = () => (provider ??= createCourseImageProvider());
  return {
    generate: (input: Parameters<ReturnType<typeof createCourseImageProvider>["generate"]>[0]) => client().generate(input),
    edit: (input: Parameters<ReturnType<typeof createCourseImageProvider>["edit"]>[0]) => client().edit(input),
    persist: persistCourseImage,
    composeReferences: composeCourseImageReferences,
    removeTemporarySource: removeTemporaryCourseImage,
  };
}
