import type {
  CoursePresentationConfig,
  CoursePreviewExerciseInline,
  CoursePreviewImage,
  CoursePreviewPage,
  CoursePreviewParagraph,
  CoursePreviewResponse,
  CoursePreviewSegment,
  CourseResourcePlan,
  CourseStatus,
  LessonDraft,
  LessonExercise,
  ResourceImageStatus,
} from "@/lib/contracts/api";
import {
  deriveResourceImageSlots,
  mergeImageSlotsWithRecords,
  summarizeResourceProgress,
  type CourseImageRecord,
} from "@/lib/server/repositories/course-images";

type DbPerson = {
  role: "teacher" | "student";
  name: string;
  englishName: string | null;
  chineseName: string | null;
};

type CourseWithPreviewData = {
  id: string;
  title: string;
  status: CourseStatus;
  people: Array<{ person: DbPerson }>;
  lessonDraft: { content: LessonDraft } | null;
  resourcePlan: { plan: CourseResourcePlan } | null;
  presentation: {
    coverTheme: string;
    coverTitleFontSize: number;
    chapterTheme: string;
    slideOverrides: Record<string, unknown> | null;
  } | null;
};

export type CoursePreviewDb = {
  course: {
    findUnique: (query: {
      where: { id: string };
      include: {
        people: { include: { person: true } };
        lessonDraft: true;
        resourcePlan: true;
        presentation: true;
      };
    }) => Promise<CourseWithPreviewData | null>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  courseImage: {
    findMany: (query: {
      where: { courseId: string };
      orderBy: Array<{ slotIndex: "asc" } | { createdAt: "asc" }>;
    }) => Promise<CourseImageRecord[]>;
  };
  coursePresentation: {
    upsert: (args: {
      where: { courseId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<unknown>;
  };
};

export class CoursePreviewNotFoundError extends Error {
  constructor(message = "课程不存在") {
    super(message);
    this.name = "CoursePreviewNotFoundError";
  }
}

export class CoursePreviewPrerequisiteError extends Error {
  constructor(message = "请先生成课文草稿") {
    super(message);
    this.name = "CoursePreviewPrerequisiteError";
  }
}

const DEFAULT_TEXT_BOX = { opacity: 0.85, fontSize: 1.0 };

function personDisplayName(person: DbPerson) {
  return person.englishName || person.chineseName || person.name;
}

function stripRoleSuffix(name: string): string {
  return name.replace(/(Teacher|Student)$/i, "").trim();
}

function toCoursePreviewCourse(course: CourseWithPreviewData) {
  const teacher = course.people.find(({ person }) => person.role === "teacher")?.person;
  const students = course.people
    .filter(({ person }) => person.role === "student")
    .map(({ person }) => stripRoleSuffix(personDisplayName(person)));

  return {
    id: course.id,
    title: course.title,
    status: course.status,
    teacherName: teacher ? stripRoleSuffix(personDisplayName(teacher)) : null,
    studentNames: students,
  };
}

function toPreviewImage(img: {
  status: ResourceImageStatus;
  publicUrl: string | null;
  failureReason: string | null;
  stale?: boolean;
}): CoursePreviewImage {
  return {
    status: img.status,
    publicUrl: img.publicUrl,
    stale: img.stale ?? false,
    failureReason: img.failureReason,
  };
}

function missingPreviewImage(): CoursePreviewImage {
  return { status: "missing", publicUrl: null, stale: false, failureReason: null };
}

function replaceCastAliasesInText(text: string, castAliases: LessonDraft["castAliases"]): string {
  if (!castAliases.length) return text;
  const sorted = [...castAliases].sort((a, b) => b.alias.length - a.alias.length);
  return sorted.reduce(
    (result, item) =>
      result.replace(
        new RegExp(item.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
        () => item.displayName,
      ),
    text,
  );
}

function exerciseColorClass(ex: LessonExercise): CoursePreviewExerciseInline["colorClass"] {
  if (ex.type === "given_word_blank") return "violet";
  if (ex.type === "choice_blank") return "blue";
  return "amber";
}

function toInlineExercise(ex: LessonExercise): CoursePreviewExerciseInline {
  const base = {
    id: ex.id,
    order: ex.order,
    answer: ex.answer,
    colorClass: exerciseColorClass(ex),
  };
  if (ex.type === "given_word_blank") {
    return { ...base, type: "given_word_blank", prompt: ex.prompt };
  }
  if (ex.type === "choice_blank") {
    return { ...base, type: "choice_blank", prompt: "", choices: ex.choices };
  }
  return {
    ...base,
    type: "pattern_blank",
    prompt: ex.pattern,
    pattern: ex.pattern,
    letterCount: ex.letterCount,
    hint: ex.hint,
  };
}

function segmentsForSentence(
  sentence: LessonDraft["chapters"][number]["paragraphs"][number]["sentences"][number],
  exerciseById: Map<string, LessonExercise>,
  castAliases: LessonDraft["castAliases"],
): CoursePreviewSegment[] {
  return sentence.segments.map((seg): CoursePreviewSegment => {
    if (seg.type === "text") {
      return { type: "text", text: replaceCastAliasesInText(seg.text, castAliases) };
    }
    const ex = exerciseById.get(seg.exerciseId);
    if (!ex) {
      return { type: "text", text: "_____" };
    }
    return { type: "exercise", exercise: toInlineExercise(ex) };
  });
}

function paragraphsForShot(
  chapter: LessonDraft["chapters"][number],
  paragraph: LessonDraft["chapters"][number]["paragraphs"][number],
  castAliases: LessonDraft["castAliases"],
): CoursePreviewParagraph[] {
  const exerciseById = new Map(chapter.exercises.map((ex) => [ex.id, ex]));
  return [
    {
      id: paragraph.id,
      sentences: paragraph.sentences.map((s) => ({
        id: s.id,
        segments: segmentsForSentence(s, exerciseById, castAliases),
      })),
    },
  ];
}

function closingParagraphs(closing: LessonDraft["closingReading"]): CoursePreviewParagraph[] {
  return [
    {
      id: "closing",
      sentences: closing.sentences.map((text, idx) => ({
        id: `closing-sentence-${idx}`,
        segments: [{ type: "text" as const, text }],
      })),
    },
  ];
}

export function toPreviewPages(
  _courseId: string,
  draft: LessonDraft,
  imageRecords: Array<{ slotId: string } & CoursePreviewImage>,
  plan: CourseResourcePlan | null,
  presentation: CoursePresentationConfig,
  _courseStatus: CourseStatus,
  coverImage: CoursePreviewImage,
  teacherName?: string | null,
  studentNames?: string[],
): CoursePreviewPage[] {
  // 所有状态（含 published）均可回到 Step5 编辑版式，页面统一标记为可编辑。
  const editable = true;
  const imagesBySlot = new Map<string, CoursePreviewImage>();
  imageRecords.forEach((img) => imagesBySlot.set(img.slotId, img));

  const pages: CoursePreviewPage[] = [];
  const effectiveTeacher = teacherName ?? null;
  const effectiveStudents = studentNames ?? [];

  pages.push({
    id: "cover-pure",
    type: "cover_pure",
    image: coverImage,
    editable,
  });

  pages.push({
    id: "cover-title",
    type: "cover_title",
    image: coverImage,
    title: draft.title,
    teacherName: effectiveTeacher,
    studentNames: effectiveStudents,
    editable,
  });

  if (plan) {
    const shots = [...plan.shots].sort((left, right) => {
      const leftChapter = draft.chapters.find((c) => c.id === left.chapterId)?.sourceOutlineChapterIndex ?? 0;
      const rightChapter = draft.chapters.find((c) => c.id === right.chapterId)?.sourceOutlineChapterIndex ?? 0;
      return leftChapter - rightChapter || left.shotOrder - right.shotOrder;
    });

    const seenChapters = new Set<string>();
    shots.forEach((shot) => {
      const chapter = draft.chapters.find((c) => c.id === shot.chapterId);
      if (!chapter) return;

      if (!seenChapters.has(chapter.id)) {
        seenChapters.add(chapter.id);
        pages.push({
          id: `chapter-${chapter.id}-divider`,
          type: "chapter_divider",
          chapterIndex: chapter.sourceOutlineChapterIndex,
          chapterTitleEn: chapter.title,
          editable,
        });
      }

      const paragraph = chapter.paragraphs.find((p) => p.id === shot.sourceParagraphId) ?? null;
      const shotImg = imagesBySlot.get(shot.shotId) ?? missingPreviewImage();
      const overrideKey = `${shot.shotId}-text`;
      const override = presentation.slideOverrides[overrideKey];

      pages.push({
        id: `${shot.shotId}-image`,
        type: "shot_image",
        chapterId: chapter.id,
        chapterIndex: chapter.sourceOutlineChapterIndex,
        shotOrder: shot.shotOrder,
        image: shotImg,
        editable,
      });

      pages.push({
        id: `${shot.shotId}-text`,
        type: "shot_text",
        chapterId: chapter.id,
        chapterIndex: chapter.sourceOutlineChapterIndex,
        shotOrder: shot.shotOrder,
        image: shotImg,
        paragraphs: paragraph ? paragraphsForShot(chapter, paragraph, draft.castAliases) : [],
        textBox: { ...DEFAULT_TEXT_BOX, ...(override?.textBox ?? {}) },
        editable,
      });
    });
  }

  pages.push({
    id: "closing-image",
    type: "closing_image",
    image: coverImage,
    editable,
  });

  const closingOverride = presentation.slideOverrides["closing-text"];
  pages.push({
    id: "closing-text",
    type: "closing_text",
    image: coverImage,
    title: draft.closingReading.title,
    paragraphs: closingParagraphs(draft.closingReading),
    textBox: { ...DEFAULT_TEXT_BOX, ...(closingOverride?.textBox ?? {}) },
    editable,
  });

  return pages;
}

function defaultPresentation(): CoursePresentationConfig {
  return {
    coverTheme: "dark",
    coverTitleFontSize: 1.0,
    chapterTheme: "blue-purple",
    slideOverrides: {},
  };
}

export async function getCoursePreview(db: CoursePreviewDb, courseId: string): Promise<CoursePreviewResponse> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      people: { include: { person: true } },
      lessonDraft: true,
      resourcePlan: true,
      presentation: true,
    },
  });

  if (!course) throw new CoursePreviewNotFoundError();
  if (!course.lessonDraft) throw new CoursePreviewPrerequisiteError();

  const records = await db.courseImage.findMany({
    where: { courseId },
    orderBy: [{ slotIndex: "asc" }, { createdAt: "asc" }],
  });

  const previewImages: Array<{ slotId: string } & CoursePreviewImage> = records.map((r) => ({
    slotId: r.slotId,
    ...toPreviewImage(r),
  }));

  const slots = course.resourcePlan
    ? deriveResourceImageSlots(courseId, course.lessonDraft.content, course.resourcePlan.plan)
    : [];
  const mergedImages = mergeImageSlotsWithRecords(slots, records);
  const progress = summarizeResourceProgress(mergedImages);

  const coverRecord = previewImages.find((img) => img.slotId === "visual-cover");
  const coverImg = coverRecord
    ? { ...coverRecord }
    : missingPreviewImage();

  const presentationConfig: CoursePresentationConfig = course.presentation
    ? {
        coverTheme: course.presentation.coverTheme,
        coverTitleFontSize: course.presentation.coverTitleFontSize,
        chapterTheme: course.presentation.chapterTheme,
        slideOverrides: (course.presentation.slideOverrides as CoursePresentationConfig["slideOverrides"]) ?? {},
      }
    : defaultPresentation();

  const previewCourse = toCoursePreviewCourse(course);
  const canEdit = true;

  return {
    course: previewCourse,
    presentation: presentationConfig,
    resourceProgress: progress,
    canEdit,
    pages: toPreviewPages(
      courseId,
      course.lessonDraft.content,
      previewImages,
      course.resourcePlan?.plan ?? null,
      presentationConfig,
      course.status,
      coverImg,
      previewCourse.teacherName,
      previewCourse.studentNames,
    ),
  };
}
