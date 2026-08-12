import { z } from "zod";

import type { CourseContentChapter, StoryWritingProvider, TeachingPlanState } from "@/lib/contracts/api";
import { buildCleanParagraphText } from "@/lib/domain/course-content";
import { createStoryOutlineProvider } from "@/lib/server/ai/story-outline-provider";
import { devAiLog } from "@/lib/server/ai/dev-ai-log";
import {
  generatedExercisesSchema,
  generatedMainIdeaSchema,
  generatedModificationSchema,
  generatedReadingBundleSchema,
  generatedReadingSchema,
  parseAiJson,
} from "@/lib/server/validation/course-content";

export type CourseContentPromptPerson = { role: "teacher" | "student"; chineseName: string; englishName: string };
export type CourseContentPromptInput = Pick<TeachingPlanState, "course" | "outline" | "knowledgePoints" | "plan"> & { promptPeople?: CourseContentPromptPerson[] };
export type CleanChapterInput = { outlineChapterId: string; title: string; cleanText: string };

function replacePersonNames(value: string, people: CourseContentPromptPerson[]) {
  return people.reduce((text, person) => person.chineseName ? text.replaceAll(person.chineseName, person.englishName) : text, value);
}

function pointMap(input: CourseContentPromptInput) {
  return new Map(input.knowledgePoints.map((point, index) => [point.id, { key: `KP${index + 1}`, label: point.label }]));
}

function selectedPoints(ids: string[], points: ReturnType<typeof pointMap>) {
  return ids.map((id) => points.get(id)).filter((point): point is { key: string; label: string } => Boolean(point));
}

function englishWordCount(text: string) {
  return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).length;
}

export function readingWordCountPolicy(targetWordCount: number) {
  const tolerance = Math.max(10, Math.round(targetWordCount * 0.12));
  const acceptedRange: [number, number] = [Math.max(1, targetWordCount - tolerance), targetWordCount + tolerance];
  const aimMin = Math.min(acceptedRange[1], targetWordCount + Math.ceil(tolerance * 0.4));
  const aimRange: [number, number] = [aimMin, Math.max(aimMin, acceptedRange[1] - 2)];
  return { acceptedRange, aimRange };
}

export function buildReadingPromptContext(input: CourseContentPromptInput) {
  const people = input.promptPeople ?? [];
  const points = pointMap(input);
  return {
    storyTitle: replacePersonNames(input.outline.title, people),
    englishLevel: input.course.englishLevel,
    people: people.map(({ role, englishName }) => ({ role, englishName })),
    chapters: input.outline.chapters.map((outline) => {
      const plan = input.plan.chapters.find((chapter) => chapter.outlineChapterId === outline.id)!;
      const targetWordCount = plan.targetWordCount ?? 90;
      const wordCountPolicy = readingWordCountPolicy(targetWordCount);
      return {
        id: outline.id,
        order: outline.order,
        title: replacePersonNames(outline.title, people),
        summary: replacePersonNames(outline.summary, people),
        targetWordCount,
        acceptedWordCountRange: wordCountPolicy.acceptedRange,
        generationAimRange: wordCountPolicy.aimRange,
        paragraphCount: plan.paragraphCount,
        grammarPoints: selectedPoints(plan.knowledgePointIds, points),
        exerciseCounts: {
          optionCloze: plan.readingExercises.grammar.optionCloze,
          wordForm: plan.readingExercises.grammar.wordForm,
          vocabulary: plan.readingExercises.vocabulary.chineseHint,
        },
      };
    }),
    mainIdea: mainIdeaWordCountPolicy(input.plan.mainIdeaTargetWordCount ?? 120),
  };
}

export function mainIdeaWordCountPolicy(targetWordCount: number) {
  return {
    targetWordCount,
    preferredRange: [Math.max(80, targetWordCount - 5), Math.min(150, targetWordCount + 5)] as [number, number],
    acceptedRange: [Math.max(80, targetWordCount - 10), Math.min(150, targetWordCount + 10)] as [number, number],
  };
}

export function buildExercisePromptContext(input: CourseContentPromptInput, cleanChapters: CleanChapterInput[]) {
  const points = pointMap(input);
  return {
    englishLevel: input.course.englishLevel,
    chapters: cleanChapters.flatMap((clean) => {
      const plan = input.plan.chapters.find((chapter) => chapter.outlineChapterId === clean.outlineChapterId)!;
      if (!plan.chapterPractice.enabled) return [];
      return [{
        id: clean.outlineChapterId,
        title: clean.title,
        cleanText: clean.cleanText,
        grammarPoints: selectedPoints(plan.knowledgePointIds, points),
        counts: { ...plan.chapterPractice.grammar },
      }];
    }),
    homework: {
      enabled: input.plan.afterClassPractice.enabled,
      grammarPoints: selectedPoints(input.plan.afterClassPractice.knowledgePointIds, points),
      counts: input.plan.afterClassPractice.enabled ? { ...input.plan.afterClassPractice.practice.grammar } : { optionCloze: 0, wordForm: 0 },
    },
  };
}

export function buildReadingRepairPromptContext(input: CourseContentPromptInput, failedChapters: CourseContentChapter[]) {
  const knowledgePointKeys = new Map(input.knowledgePoints.map((point, index) => [point.id, `KP${index + 1}`]));
  return failedChapters.map((chapter) => ({
    outlineChapterId: chapter.outlineChapterId,
    title: chapter.title,
    paragraphs: chapter.paragraphs.map((paragraph) => ({
      parts: paragraph.parts.map((part) => {
        if (part.type === "text") return { type: "text" as const, text: part.text };
        if (part.type === "vocabulary") return { type: "vocabulary" as const, answer: part.answer, canonicalForm: part.canonicalForm, meaningZh: part.meaningZh };
        const knowledgePointKey = knowledgePointKeys.get(part.knowledgePointId) ?? "UNKNOWN_KP";
        if (part.exerciseType === "wordForm") return { type: "grammar" as const, exerciseType: "wordForm" as const, knowledgePointKey, answer: part.answer, baseForm: part.baseForm };
        const answer = part.answer.trim().toLocaleLowerCase();
        const distractors = (part.options ?? []).filter((option) => option.trim().toLocaleLowerCase() !== answer).slice(0, 2);
        return { type: "grammar" as const, exerciseType: "optionCloze" as const, knowledgePointKey, answer: part.answer, distractors };
      }),
    })),
  }));
}

export function buildReadingRepairRequirements(input: CourseContentPromptInput, failedChapters: CourseContentChapter[]) {
  return failedChapters.map((chapter) => {
    const targetWordCount = input.plan.chapters.find((item) => item.outlineChapterId === chapter.outlineChapterId)?.targetWordCount ?? chapter.targetWordCount;
    const { acceptedRange, aimRange } = readingWordCountPolicy(targetWordCount);
    const currentWordCount = englishWordCount(chapter.paragraphs.map(buildCleanParagraphText).join(" "));
    const base = { outlineChapterId: chapter.outlineChapterId, currentWordCount, targetWordCount, acceptedRange, aimRange };
    if (currentWordCount < acceptedRange[0]) return {
      ...base,
      minimumNetWordsToAdd: acceptedRange[0] - currentWordCount,
      recommendedNetWordsToAddRange: [aimRange[0] - currentWordCount, aimRange[1] - currentWordCount] as [number, number],
    };
    if (currentWordCount > acceptedRange[1]) return {
      ...base,
      minimumNetWordsToRemove: currentWordCount - acceptedRange[1],
      recommendedNetWordsToRemoveRange: [currentWordCount - aimRange[1], currentWordCount - aimRange[0]] as [number, number],
    };
    return base;
  });
}

export function buildModificationPromptContext(
  targetType: string,
  target: unknown,
  instruction: string,
  constraints: unknown,
  relatedContext: Record<string, unknown>,
) {
  return { targetType, target, instruction, constraints, ...relatedContext };
}

function jsonOnly(instructions: string[], context: unknown) {
  return [...instructions, "只返回严格 JSON，不要 Markdown 代码块或额外说明。", "<context>", JSON.stringify(context), "</context>"].join("\n");
}

const schemaDescriptions = {
  reading: "{chapters:[{outlineChapterId,title,paragraphs:[{parts:[textPart|optionGrammarPart|wordFormGrammarPart|vocabularyPart]}]}],mainIdea:{title,text}}；textPart={type:'text',text}；optionGrammarPart={type:'grammar',exerciseType:'optionCloze',knowledgePointKey,answer,distractors:[string,string]}；wordFormGrammarPart={type:'grammar',exerciseType:'wordForm',knowledgePointKey,answer,baseForm}；vocabularyPart={type:'vocabulary',answer,canonicalForm,meaningZh}",
  readingRepair: "{chapters:[{outlineChapterId,title,paragraphs:[{parts:[textPart|optionGrammarPart|wordFormGrammarPart|vocabularyPart]}]}]}；各 part 字段与首次正文契约完全一致",
  mainIdea: "{title,text}",
  exercises: "{chapters:[{outlineChapterId,questions:[optionQuestion|wordFormQuestion]}],homeworkGrammar:[optionQuestion|wordFormQuestion]}；optionQuestion={type:'optionCloze',knowledgePointKey,before,after,answer,distractors:[string,string]}；wordFormQuestion={type:'wordForm',knowledgePointKey,before,after,answer,baseForm}",
  modification: "{kind,chapter?,paragraph?,questions?,mainIdea?}；只保留 kind 对应的一个结果字段；chapter/paragraph 的 part 和 questions 使用正文与练习的严格题型契约",
} as const;

const optionOutputRule = "选项填空必须返回 answer 和 distractors；distractors 恰好两个、互不重复且都不等于 answer。禁止返回 options，程序会把 answer 与 distractors 合并并打乱。";
const wordFormOutputRule = "给词变形必须返回 answer 和 baseForm；baseForm 是题目括号中显示的原形，answer 必须发生真实词形变化。禁止 answer 与 baseForm 相同；禁止用 can/could/may/might/must/shall/should/will/would + 原形冒充词形变化。情态动词等不发生词形变化的知识点必须使用选项填空，给词变形只分配给适合动词变形的知识点。";
const questionPositionRule = "before 是空格前文本，after 是空格后文本；不得包含下划线、题号、括号提示或答案，程序会在两者之间插入空格和提示。";

export const courseContentPromptExamples = {
  reading: "正确的正文 parts 示例：optionCloze 片段=[{\"type\":\"text\",\"text\":\"Yesterday, Mia \"},{\"type\":\"grammar\",\"exerciseType\":\"optionCloze\",\"knowledgePointKey\":\"KP1\",\"answer\":\"found\",\"distractors\":[\"finds\",\"will find\"]},{\"type\":\"text\",\"text\":\" the hidden door.\"}]；wordForm 片段=[{\"type\":\"text\",\"text\":\"Later, she \"},{\"type\":\"grammar\",\"exerciseType\":\"wordForm\",\"knowledgePointKey\":\"KP1\",\"answer\":\"opened\",\"baseForm\":\"open\"},{\"type\":\"text\",\"text\":\" it carefully.\"}]；vocabulary={\"type\":\"vocabulary\",\"answer\":\"looked after\",\"canonicalForm\":\"look after\",\"meaningZh\":\"照顾\"}。题目 answer 拼回前后 text 后必须语法正确。",
  questions: "正确的独立题目示例：optionCloze={\"type\":\"optionCloze\",\"knowledgePointKey\":\"KP1\",\"before\":\"Yesterday, Mia \",\"after\":\" the hidden door.\",\"answer\":\"found\",\"distractors\":[\"finds\",\"will find\"]}；wordForm={\"type\":\"wordForm\",\"knowledgePointKey\":\"KP1\",\"before\":\"Yesterday, Mia \",\"after\":\" the hidden door.\",\"answer\":\"found\",\"baseForm\":\"find\"}。程序渲染为 Yesterday, Mia ______ (find) the hidden door.，提示紧跟空格。",
} as const;

export const readingGrammarCoherenceRules = [
  "正文整体语法和故事时间线优先于题目植入：不得为了覆盖知识点或凑题量，写出与上下文不一致的时态、语态或动词形式。",
  "每章先确定清晰的叙事基准时态并保持一致。只有时间提示、事件先后、人物对话或语义明确要求时才能切换时态；切换后必须与前后句的时间关系一致。",
  "若某个语法知识点无法自然放入现有句子，必须改写该句及必要的局部语境来提供真实使用条件，不能只替换动词形式。",
  "每个 grammar answer 拼回句子后必须是唯一正确形式，并检查主谓一致、代词指代、单复数、时态与体、语序及前后逻辑。",
  "输出前按 parts 顺序拼接完整 clean text，通读并校对整章；发现题目答案破坏语法或时间线时，先修正文语境，再输出结构化 parts。",
] as const;

function modificationOutputRules(targetType: string) {
  if (targetType === "chapter_practice" || targetType === "homework") return [optionOutputRule, wordFormOutputRule, questionPositionRule, courseContentPromptExamples.questions];
  if (targetType === "chapter" || targetType === "paragraph") return [optionOutputRule, wordFormOutputRule, ...readingGrammarCoherenceRules, courseContentPromptExamples.reading];
  return [];
}

export function contentReadingTimeoutMs(value = process.env.COURSE_CONTENT_GENERATION_TIMEOUT_MS) {
  const configured = Number(value);
  return Number.isFinite(configured) && configured > 0 ? configured : 600_000;
}

export function createCourseContentGenerationDeps() {
  const provider = createStoryOutlineProvider();
  const call = async (writingProvider: StoryWritingProvider, operation: string, prompt: string, timeoutMs?: number) => {
    try { return (await provider.generateOutline({ writingProvider, operation, prompt, timeoutMs })).text; }
    catch (error) {
      const message = error instanceof Error ? error.message.replaceAll("故事大纲", "课程内容") : "课程内容生成失败";
      throw new Error(message, { cause: error });
    }
  };
  const structuredCall = async <Schema extends z.ZodTypeAny>(
    writingProvider: StoryWritingProvider,
    operation: string,
    prompt: string,
    schema: Schema,
    schemaKey: keyof typeof schemaDescriptions,
    parseMessage: string,
    timeoutMs?: number,
  ): Promise<z.output<Schema>> => {
    let raw = await call(writingProvider, operation, prompt, timeoutMs);
    for (let round = 0; round <= 2; round += 1) {
      try { return parseAiJson(raw, schema, parseMessage); }
      catch (error) {
        devAiLog({ operation, phase: "error", payload: { stage: "schema_parse", round: round + 1, parseMessage }, error });
        if (round === 2) throw error;
        raw = await call(writingProvider, `${operation}_repair_format`, jsonOnly([
          "只修复 JSON 或 Schema 格式，不重新创作语义内容。允许删除 Schema 不接受的多余字段、补齐缺失的结构字段或把旧字段转换为 expectedSchema；不得改写故事、题干、答案或知识点。",
        ], { rawOutput: raw, expectedSchema: schemaDescriptions[schemaKey], parseError: error instanceof Error ? error.message : parseMessage }), timeoutMs);
      }
    }
    throw new Error(parseMessage);
  };

  return {
    generateReading: async (input: CourseContentPromptInput, writingProvider: StoryWritingProvider) => structuredCall(writingProvider, "content_generate_reading", jsonOnly([
      "一次生成全部 CEFR 英语故事正文、正文内嵌题锚点和 Main Idea Reading Practice。",
      "返回 {chapters:[{outlineChapterId,title,paragraphs:[{parts:[]}]}],mainIdea:{title,text}}；章节顺序和 id 必须与 context 一致，章节 title 必须逐字复制 chapterSpecs.title，保留其中的中文 / English 双语格式。",
      "parts 只能为 text、optionGrammar、wordFormGrammar、vocabulary 四种严格结构，不得混用字段。",
      "optionGrammar={type:'grammar',exerciseType:'optionCloze',knowledgePointKey,answer,distractors:[string,string]}；wordFormGrammar={type:'grammar',exerciseType:'wordForm',knowledgePointKey,answer,baseForm}。",
      optionOutputRule,
      wordFormOutputRule,
      ...readingGrammarCoherenceRules,
      courseContentPromptExamples.reading,
      "拼接 parts（题锚点取 answer）必须形成自然连贯的正文，并严格满足每章 targetWordCount、paragraphCount、exerciseCounts 和 grammarPoints 独立覆盖。",
      "正文词数按拼接后的 clean text 计算，grammar 和 vocabulary 的 answer 都计入词数。每章必须落入 acceptedWordCountRange，并优先写到 generationAimRange，不能只大致接近 targetWordCount。",
      "每个 grammarPoints.key 只能用于对应语法点，且每个要求的语法点至少被一道语法题独立考查。词汇按 CEFR 难度从正文选择，不映射语法点。",
      "英文内容只能使用 people 中的英文名。mainIdea 是全故事纯阅读摘要，严格遵守 context.mainIdea 的 targetWordCount、preferredRange 和 acceptedRange，不含题目或标注。",
      "输出前自行核对每章 id、段落数、三种题量、语法点覆盖、题型必填字段和 Main Idea 词数；不要输出核对过程。",
    ], buildReadingPromptContext(input)), generatedReadingBundleSchema, "reading", "正文与 Main Idea 结构解析失败", contentReadingTimeoutMs()),

    repairReading: async (input: CourseContentPromptInput, writingProvider: StoryWritingProvider, failedChapters: unknown, issues: unknown) => {
      const failedIds = new Set(Array.isArray(failedChapters) ? failedChapters.map((chapter) => typeof chapter === "object" && chapter ? Reflect.get(chapter, "outlineChapterId") : null).filter((id): id is string => typeof id === "string") : []);
      const reading = buildReadingPromptContext(input);
      const failedChapterContent = Array.isArray(failedChapters) ? buildReadingRepairPromptContext(input, failedChapters as CourseContentChapter[]) : [];
      const repairRequirements = Array.isArray(failedChapters) ? buildReadingRepairRequirements(input, failedChapters as CourseContentChapter[]) : [];
      return structuredCall(writingProvider, "content_repair_reading", jsonOnly([
        "一次修复所有失败章节，只返回 {chapters:[...]}，不得返回或改写成功章节和 Main Idea。",
        "解决 issues 中全部问题，并保持与 surroundingContext 的剧情一致。",
        "正文题型继续严格使用首次生成契约。",
        optionOutputRule,
        wordFormOutputRule,
        ...readingGrammarCoherenceRules,
        courseContentPromptExamples.reading,
        "词数按拼接后的 clean text 计算，grammar 和 vocabulary 的 answer 都计入。repairRequirements.acceptedRange 是硬验收范围，aimRange 是本次必须瞄准的安全区间。",
        "章节偏短时，净增加词数不得少于 minimumNetWordsToAdd，并应达到 recommendedNetWordsToAddRange；不能只比当前版本略有改善。章节偏长时按对应 remove 字段处理。新增内容必须是有意义的故事细节，不能堆砌。",
        "输出前核对每个失败章节的段落数、题量、语法点覆盖和全部必填字段；不要输出核对过程。",
      ], { storyTitle: reading.storyTitle, englishLevel: reading.englishLevel, chapterSpecs: reading.chapters.filter((chapter) => failedIds.has(chapter.id)), repairRequirements, failedChapters: failedChapterContent, issues, surroundingContext: reading.chapters.map(({ id, order, title, summary }) => ({ id, order, title, summary })) }), generatedReadingSchema, "readingRepair", "正文修复结构解析失败");
    },

    repairMainIdea: async (writingProvider: StoryWritingProvider, currentMainIdea: unknown, issues: unknown, targetWordCount = 120) => structuredCall(writingProvider, "content_repair_main_idea", jsonOnly([
      "只修复 Main Idea，不修改或返回正文。保持原意，严格遵守 wordCountPolicy。",
      "返回 {title,text}。",
    ], { currentMainIdea, issues, wordCountPolicy: mainIdeaWordCountPolicy(targetWordCount) }), generatedMainIdeaSchema, "mainIdea", "Main Idea 修复结构解析失败"),

    generateExercises: async (input: CourseContentPromptInput, writingProvider: StoryWritingProvider, cleanChapters: CleanChapterInput[]) => structuredCall(writingProvider, "content_generate_exercises", jsonOnly([
      "生成章节练习和课后语法练习，返回 {chapters:[{outlineChapterId,questions:[]}],homeworkGrammar:[]}。",
      "question 只能是 optionQuestion={type:'optionCloze',knowledgePointKey,before,after,answer,distractors:[string,string]} 或 wordFormQuestion={type:'wordForm',knowledgePointKey,before,after,answer,baseForm}，不得混用字段。",
      optionOutputRule,
      wordFormOutputRule,
      questionPositionRule,
      courseContentPromptExamples.questions,
      "章节练习只依据本章 cleanText 改编，不复制原句、不与原文冲突，并严格满足本章 grammarPoints 和 counts。",
      "课后练习不得依赖正文，只依据 englishLevel、homework.grammarPoints 和 homework.counts。",
      "knowledgePointKey 只能取所属目标 grammarPoints 中的 key；每个要求的语法点至少被一道题独立考查。",
      "输出前逐目标核对 id、两种题量、语法点覆盖和全部必填字段；不要输出核对过程。",
    ], buildExercisePromptContext(input, cleanChapters)), generatedExercisesSchema, "exercises", "练习结构解析失败"),

    repairExercises: async (input: CourseContentPromptInput, writingProvider: StoryWritingProvider, failedTargets: Array<{ id: string; issues: string[] }>, currentExercises: z.infer<typeof generatedExercisesSchema>, cleanChapters: CleanChapterInput[]) => {
      const context = buildExercisePromptContext(input, cleanChapters);
      const targets = failedTargets.map((failed) => failed.id === "homework"
        ? { kind: "homework", spec: context.homework, currentQuestions: currentExercises.homeworkGrammar, issues: failed.issues }
        : { kind: "chapter", spec: context.chapters.find((chapter) => chapter.id === failed.id), currentQuestions: currentExercises.chapters.find((chapter) => chapter.outlineChapterId === failed.id)?.questions ?? [], issues: failed.issues });
      return structuredCall(writingProvider, "content_repair_exercises", jsonOnly([
        "一次修复 targets 中全部失败练习目标；只重写失败目标，不返回成功目标。",
        "章节目标返回到 chapters；若无失败章节则 chapters=[]。课后目标返回到 homeworkGrammar；若课后未失败则 homeworkGrammar=[]。严格解决每个目标的全部 issues。",
        optionOutputRule,
        wordFormOutputRule,
        questionPositionRule,
        courseContentPromptExamples.questions,
        "保持每个目标要求的 id、题量和 knowledgePointKey 覆盖；输出前核对全部必填字段，不要输出核对过程。",
      ], { englishLevel: context.englishLevel, targets }), generatedExercisesSchema, "exercises", "练习修复结构解析失败");
    },

    modifyContent: async (writingProvider: StoryWritingProvider, targetType: string, target: unknown, instruction: string, constraints: unknown, relatedContext: Record<string, unknown>) => structuredCall(writingProvider, "content_modify_target", jsonOnly([
      "只修改明确指定的目标，不联动改写任何其他区域。",
      "返回 {kind,chapter?,paragraph?,questions?,mainIdea?}；kind 等于 targetType，且只填写对应目标字段。",
      "严格执行 instruction，并满足 constraints。",
      "如目标含题目，必须保持原题型、题量和知识点映射，并使用严格题型契约。",
      ...modificationOutputRules(targetType),
      "输出前核对目标范围、必填字段和 constraints；不要输出核对过程。",
    ], buildModificationPromptContext(targetType, target, instruction, constraints, relatedContext)), generatedModificationSchema, "modification", "修改结果结构解析失败"),
  };
}

export type CourseContentGenerationDeps = ReturnType<typeof createCourseContentGenerationDeps>;
