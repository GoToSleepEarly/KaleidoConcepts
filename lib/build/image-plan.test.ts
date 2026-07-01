import { describe, expect, it } from "vitest";

import { planCourseImages } from "./image-plan";

describe("planCourseImages", () => {
  it("reuses succeeded images when the section source hash did not change", () => {
    const plan = planCourseImages({
      sections: [
        { id: "section-1", sourceHash: "same", imageSlots: ["section-1-image-1", "section-1-image-2"] },
      ],
      existingImages: [
        {
          id: "image-1",
          sectionId: "section-1",
          slotId: "section-1-image-1",
          sourceHash: "same",
          status: "succeeded",
        },
        {
          id: "image-2",
          sectionId: "section-1",
          slotId: "section-1-image-2",
          sourceHash: "old",
          status: "succeeded",
        },
      ],
    });

    expect(plan.reused.map((image) => image.id)).toEqual(["image-1"]);
    expect(plan.toGenerate).toEqual([
      {
        sectionId: "section-1",
        slotId: "section-1-image-2",
        slotIndex: 2,
        sourceHash: "same",
      },
    ]);
  });
});
