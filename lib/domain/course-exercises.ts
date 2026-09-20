import type {
  CourseContentChapter,
  CourseGrammarQuestion,
  CourseVocabularyMatchingItem,
  GrammarExerciseType,
  TeachingPlan,
} from "@/lib/contracts/api";

export type CourseHomework = {
  grammar: CourseGrammarQuestion[];
  vocabularyMatching: CourseVocabularyMatchingItem[];
};

function questionSetMatches(
  questions: CourseGrammarQuestion[],
  requiredKnowledgePointIds: string[],
  enabledTypes: GrammarExerciseType[],
  total: number,
  questionsPerKnowledgePoint?: number,
) {
  if (questions.length !== total) return false;
  if (questions.some((question) => !enabledTypes.includes(question.type))) return false;
  if (requiredKnowledgePointIds.some((id) => !questions.some((question) => question.knowledgePointId === id))) return false;
  if (questionsPerKnowledgePoint !== undefined && requiredKnowledgePointIds.some((id) => questions.filter((question) => question.knowledgePointId === id).length !== questionsPerKnowledgePoint)) return false;
  return true;
}

export function exerciseContentSatisfiesPlan(
  plan: TeachingPlan,
  chapters: CourseContentChapter[] | unknown,
  homework: CourseHomework | null | unknown,
) {
  const storedChapters = Array.isArray(chapters) ? chapters as CourseContentChapter[] : [];
  for (const planChapter of plan.chapters) {
    if (!planChapter.chapterPractice.enabled) continue;
    const stored = storedChapters.find((chapter) => chapter?.outlineChapterId === planChapter.outlineChapterId);
    if (!stored || !Array.isArray(stored.chapterPractice) || !questionSetMatches(
      stored.chapterPractice,
      planChapter.knowledgePointIds,
      planChapter.chapterPractice.grammar.enabledTypes,
      planChapter.chapterPractice.grammar.total,
    )) return false;
  }

  const homeworkPlan = plan.afterClassPractice;
  if (!homeworkPlan.enabled || !homeworkPlan.practice.enabled) return true;
  if (!homework || typeof homework !== "object" || !Array.isArray(Reflect.get(homework, "grammar"))) return false;
  return questionSetMatches(
    Reflect.get(homework, "grammar") as CourseGrammarQuestion[],
    homeworkPlan.knowledgePointIds,
    homeworkPlan.practice.enabledTypes,
    homeworkPlan.knowledgePointIds.length * homeworkPlan.practice.questionsPerKnowledgePoint,
    homeworkPlan.practice.questionsPerKnowledgePoint,
  );
}

export function visibleExerciseContent(
  plan: TeachingPlan,
  chapters: CourseContentChapter[],
  homework: CourseHomework | null,
) {
  const chapterPlans = new Map(plan.chapters.map((chapter) => [chapter.outlineChapterId, chapter]));
  const visibleChapters = chapters.map((chapter) => ({
    ...chapter,
    chapterPractice: chapterPlans.get(chapter.outlineChapterId)?.chapterPractice.enabled !== false ? chapter.chapterPractice : [],
  }));
  const homeworkPlan = plan.afterClassPractice;
  const visibleHomework = homeworkPlan.enabled
    ? {
        grammar: homeworkPlan.practice.enabled ? homework?.grammar ?? [] : [],
        vocabularyMatching: homeworkPlan.vocabularyReviewEnabled ? homework?.vocabularyMatching ?? [] : [],
      }
    : null;
  return { chapters: visibleChapters, homework: visibleHomework };
}
