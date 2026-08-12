import type {
  CourseContentChapter,
  CourseContentPart,
  CourseGrammarQuestion,
  CoursePresentationConfig,
  CoursePreviewPage,
  CoursePreviewReadingPart,
  CourseVocabularyMatchingItem,
  GrammarExerciseType,
} from "@/lib/contracts/api";
import { courseContentQuestionPageSize, courseContentVocabularyPageSize, paginateBalanced } from "@/lib/domain/course-content";

type PreviewSlot = {
  id: string;
  slotType: "visual_cover" | "lesson_shot" | "character_baseline";
  chapterId: string | null;
  paragraphId: string | null;
  publicUrl: string | null;
};

type CompileInput = {
  title: string;
  teacherName: string | null;
  studentNames: string[];
  knowledgePoints: Array<{ id: string; label: string }>;
  chapterKnowledgePointIds?: Record<string, string[]>;
  homeworkKnowledgePointIds?: string[];
  chapters: CourseContentChapter[];
  mainIdea: { id: string; title: string; text: string } | null;
  homework: { grammar: CourseGrammarQuestion[]; vocabularyMatching: CourseVocabularyMatchingItem[] } | null;
  slots: PreviewSlot[];
};

const DEFAULT_TEXT_BOX = { opacity: 0.85, fontSize: 1 };
export const DEFAULT_COURSE_PRESENTATION: CoursePresentationConfig = {
  coverTheme: "dark",
  coverTitleFontSize: 1,
  chapterTheme: "blue-purple",
  slideOverrides: {},
};

export function vocabularyMatchingMeanings(items: CourseVocabularyMatchingItem[]) {
  return items.length > 1 ? [...items.slice(1), items[0]] : items;
}

export function previewPageAnswerText(page: CoursePreviewPage): string | null {
  if (page.type === "shot_text" && page.readingExerciseMode === "interactive") {
    const answers = page.parts
      .filter((part): part is Extract<CoursePreviewReadingPart, { type: "exercise" }> => part.type === "exercise")
      .map((part) => `${part.number}. ${part.answer}`);
    return answers.length ? answers.join("；") : null;
  }
  if (page.type === "grammar_practice") {
    return page.questions.map((question, index) => `${page.questionStartNumber + index}. ${question.answer}`).join("；") || null;
  }
  if (page.type === "vocabulary_matching") {
    const meanings = vocabularyMatchingMeanings(page.items);
    return page.items.map((item, index) => `${index + 1}-${String.fromCharCode(65 + meanings.findIndex((meaning) => meaning.id === item.id))}`).join("；") || null;
  }
  return null;
}

function previewParts(parts: CourseContentPart[], labels: Map<string, string>): CoursePreviewReadingPart[] {
  let number = 0;
  let previousLexical = "";
  return parts.map((part) => {
    const lexical = part.type === "text" ? part.text : part.answer;
    const missingSpace = previousLexical.length > 0 && !/\s$/.test(previousLexical) && !/^\s/.test(lexical) && /[\p{L}\p{N})\]]$/u.test(previousLexical) && /^(?:[\p{L}\p{N}]|[([])/u.test(lexical);
    previousLexical = lexical;
    if (part.type === "text") return { ...part, text: `${missingSpace ? " " : ""}${part.text}` };
    number += 1;
    if (part.type === "vocabulary") return { type: "exercise", id: part.id, number, exerciseType: "vocabulary", answer: part.answer, knowledgePointId: null, knowledgePointLabel: "词汇", spaceBefore: missingSpace, hint: part.meaningZh };
    return {
      type: "exercise",
      id: part.id,
      number,
      exerciseType: part.exerciseType,
      answer: part.answer,
      knowledgePointId: part.knowledgePointId,
      knowledgePointLabel: labels.get(part.knowledgePointId) ?? "未命名知识点",
      spaceBefore: missingSpace,
      ...(part.exerciseType === "wordForm" ? { hint: part.baseForm } : { options: part.options }),
    };
  });
}

function pointList(ids: string[], labels: Map<string, string>) {
  return [...new Set(ids)].map((id) => ({ id, label: labels.get(id) ?? "未命名知识点" }));
}

function splitBilingualTitle(title: string) {
  const [first, ...rest] = title.split(/\s+\/\s+/);
  const second = rest.join(" / ").trim();
  if (second && second !== first.trim()) return { zh: first.trim(), en: second };
  return /\p{Script=Han}/u.test(title) ? { zh: title.trim(), en: "" } : { zh: "", en: title.trim() };
}

function splitChapterTitle(title: string, order?: number) {
  const bilingual = splitBilingualTitle(title);
  const genericChapter = order ? new RegExp(`^chapter\\s*0*${order}$`, "i") : null;
  return {
    zh: bilingual.zh || (order ? `第 ${order} 章` : ""),
    en: genericChapter?.test(bilingual.en) ? "" : bilingual.en,
  };
}

function addGrammarPages(pages: CoursePreviewPage[], scope: "chapter" | "homework", questions: CourseGrammarQuestion[], labels: Map<string, string>, configuredIds: string[], chapter?: Pick<CourseContentChapter, "id" | "title" | "order">) {
  const chapterTitle = chapter?.title;
  const chapterOrder = chapter?.order;
  const bilingualTitle = chapterTitle ? splitChapterTitle(chapterTitle, chapterOrder) : null;
  (["optionCloze", "wordForm"] as GrammarExerciseType[]).forEach((exerciseType) => {
    let questionStartNumber = 1;
    paginateBalanced(questions.filter((question) => question.type === exerciseType), courseContentQuestionPageSize).forEach((group, pageIndex) => {
      pages.push({
      id: `${scope}-${chapterTitle ?? "course"}-${exerciseType}-${pageIndex + 1}`,
      type: "grammar_practice",
      scope,
      chapterId: chapter?.id,
      chapterTitleZh: bilingualTitle?.zh,
      chapterTitleEn: bilingualTitle?.en,
      exerciseType,
      pageNumber: pageIndex + 1,
      questionStartNumber,
      knowledgePoints: pointList(configuredIds.length ? configuredIds : questions.map((question) => question.knowledgePointId), labels),
      questions: group,
      });
      questionStartNumber += group.length;
    });
  });
}

export function compilePreviewPages(input: CompileInput): CoursePreviewPage[] {
  const labels = new Map(input.knowledgePoints.map((point) => [point.id, point.label]));
  const cover = input.slots.find((slot) => slot.slotType === "visual_cover")?.publicUrl ?? null;
  const pages: CoursePreviewPage[] = [
    { id: "cover-pure", type: "cover_pure", image: { publicUrl: cover } },
    { id: "cover-title", type: "cover_title", image: { publicUrl: cover }, title: input.title, teacherName: input.teacherName, studentNames: input.studentNames },
  ];

  [...input.chapters].sort((a, b) => a.order - b.order).forEach((chapter) => {
    const chapterPointIds = input.chapterKnowledgePointIds?.[chapter.outlineChapterId]
      ?? [...chapter.paragraphs.flatMap((paragraph) => paragraph.parts).filter((part): part is Extract<CourseContentPart, { type: "grammar" }> => part.type === "grammar").map((part) => part.knowledgePointId), ...chapter.chapterPractice.map((question) => question.knowledgePointId)];
    const chapterPoints = pointList(chapterPointIds, labels);
    const chapterTitle = splitChapterTitle(chapter.title, chapter.order);
    pages.push({ id: `chapter-${chapter.id}`, type: "chapter_divider", chapterOrder: chapter.order, chapterTitleZh: chapterTitle.zh, chapterTitleEn: chapterTitle.en });
    chapter.paragraphs.forEach((paragraph) => {
      const imageUrl = input.slots.find((slot) => slot.slotType === "lesson_shot" && slot.chapterId === chapter.id && slot.paragraphId === paragraph.id)?.publicUrl ?? null;
      pages.push({ id: `paragraph-${paragraph.id}-image`, type: "shot_image", chapterId: chapter.id, paragraphId: paragraph.id, image: { publicUrl: imageUrl } });
      pages.push({
        id: `paragraph-${paragraph.id}-text`, type: "shot_text", chapterId: chapter.id, paragraphId: paragraph.id,
        image: { publicUrl: imageUrl },
        readingExerciseMode: chapter.readingExerciseMode,
        knowledgePoints: chapterPoints,
        parts: previewParts(paragraph.parts, labels),
        textBox: DEFAULT_TEXT_BOX,
      });
    });
    addGrammarPages(pages, "chapter", chapter.chapterPractice, labels, chapterPointIds, chapter);
  });

  if (input.mainIdea) pages.push({ id: `main-idea-${input.mainIdea.id}`, type: "main_idea", title: input.mainIdea.title, text: input.mainIdea.text });
  if (input.homework) {
    addGrammarPages(pages, "homework", input.homework.grammar, labels, input.homeworkKnowledgePointIds ?? []);
    paginateBalanced(input.homework.vocabularyMatching, courseContentVocabularyPageSize).forEach((items, index) => pages.push({ id: `homework-vocabulary-${index + 1}`, type: "vocabulary_matching", pageNumber: index + 1, items }));
  }
  return pages;
}
