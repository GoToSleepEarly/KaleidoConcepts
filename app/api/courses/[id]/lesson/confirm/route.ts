import { NextResponse } from "next/server";

import { planCourseImages } from "@/lib/build/image-plan";
import { prisma } from "@/lib/db";
import { normalizeLessonText } from "@/lib/lesson/normalize";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const course = await prisma.course.findUniqueOrThrow({
    where: { id },
    include: { images: true },
  });

  if (!course.lessonText?.trim()) {
    return NextResponse.json({ error: "Lesson Text is required." }, { status: 400 });
  }

  const normalized = normalizeLessonText(course.lessonText);

  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 422 });
  }

  const imagePlan = planCourseImages({
    sections: normalized.lesson.sections.map((section) => ({
      id: section.id,
      sourceHash: section.sourceHash,
      imageSlots: section.imageSlots.map((slot) => slot.id),
    })),
    existingImages: course.images.map((image) => ({
      id: image.id,
      sectionId: image.sectionId,
      slotId: image.slotId,
      sourceHash: image.sourceHash,
      status: image.status,
    })),
  });

  const toGenerateSlotIds = imagePlan.toGenerate.map((image) => image.slotId);

  const transaction = [
    prisma.courseImage.deleteMany({
      where: {
        courseId: id,
        slotId: { in: toGenerateSlotIds },
      },
    }),
    prisma.course.update({
      where: { id },
      data: {
        structuredLesson: normalized.lesson,
        visualStyleGuide:
          course.visualStyleGuide ??
          "Consistent warm picture-book style, same child protagonist across all scenes, clear classroom-friendly composition.",
        status: imagePlan.toGenerate.length === 0 ? "ready" : "building_resources",
        buildStartedAt: new Date(),
        buildUpdatedAt: new Date(),
      },
    }),
    prisma.aiUsageLog.create({
      data: {
        courseId: id,
        resourceType: "normalize",
        provider: "local",
        status: "succeeded",
      },
    }),
  ];

  if (imagePlan.toGenerate.length > 0) {
    transaction.splice(
      2,
      0,
      prisma.courseImage.createMany({
        data: imagePlan.toGenerate.map((image) => ({
          courseId: id,
          sectionId: image.sectionId,
          slotId: image.slotId,
          slotIndex: image.slotIndex,
          sourceHash: image.sourceHash,
          prompt: `Create picture-book illustration for ${image.sectionId}, image ${image.slotIndex}. Follow the course visual style guide.`,
          status: "pending",
        })),
      }),
    );
  }

  await prisma.$transaction(transaction);

  return NextResponse.redirect(new URL(`/courses/${id}`, request.url), 303);
}
