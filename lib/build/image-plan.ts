type ImageStatus = "pending" | "generating" | "succeeded" | "failed";

type ExistingImage = {
  id: string;
  sectionId: string;
  slotId: string;
  sourceHash: string;
  status: ImageStatus;
};

type SectionInput = {
  id: string;
  sourceHash: string;
  imageSlots: string[];
};

type ImagePlanInput = {
  sections: SectionInput[];
  existingImages: ExistingImage[];
};

type GenerateImagePlan = {
  sectionId: string;
  slotId: string;
  slotIndex: number;
  sourceHash: string;
};

export function planCourseImages(input: ImagePlanInput) {
  const reused: ExistingImage[] = [];
  const toGenerate: GenerateImagePlan[] = [];

  for (const section of input.sections) {
    section.imageSlots.forEach((slotId, index) => {
      const reusable = input.existingImages.find(
        (image) =>
          image.sectionId === section.id &&
          image.slotId === slotId &&
          image.sourceHash === section.sourceHash &&
          image.status === "succeeded",
      );

      if (reusable) {
        reused.push(reusable);
        return;
      }

      toGenerate.push({
        sectionId: section.id,
        slotId,
        slotIndex: index + 1,
        sourceHash: section.sourceHash,
      });
    });
  }

  return { reused, toGenerate };
}
