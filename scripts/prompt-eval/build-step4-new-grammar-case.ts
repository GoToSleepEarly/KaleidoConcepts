import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { grammarCatalogBooks } from "../../prisma/grammar-catalog-data";

function argument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const output = argument("--output");
  if (!output) throw new Error("Usage: --output <config.json>");
  const book = grammarCatalogBooks.find((candidate) => candidate.id === "english-grammar-in-use-5");
  if (!book) throw new Error("English Grammar in Use catalog is missing");
  const pointIds = ["english-grammar-in-use-5-u5", "english-grammar-in-use-5-u3-4", "english-grammar-in-use-5-u7-8", "english-grammar-in-use-5-u31", "english-grammar-in-use-5-u38"];
  const catalogPoints = new Map(book.sections.flatMap((section) => section.points.map((point) => [point.id, { ...point, section: section.officialTitle }] as const)));
  const knowledgePoints = pointIds.map((id) => {
    const point = catalogPoints.get(id);
    if (!point) throw new Error(`Grammar point is missing: ${id}`);
    return {
      id: point.id,
      label: point.title,
      category: point.section,
      bookTitle: book.title,
      edition: book.edition,
      officialLevel: book.officialLevel,
      unitStart: point.unitStart,
      unitEnd: point.unitEnd,
      units: point.units,
    };
  });
  const chapters = [
    { id: "new-grammar-ch1", order: 1, title: "控制室上锁 / The Locked Control Room", summary: "Noah和Ms. Rivera来到社区天文馆准备晚上的开放活动，却发现控制室被锁住，主电源也在暴雨后停止工作。Noah在旧值班记录中找到备用钥匙的位置，Ms. Rivera联系管理员Dr. Hall确认安全流程，两人进入控制室并发现一只被水浸湿的保险盒。", pointId: pointIds[0], usage: "Use Past simple to narrate the completed discovery and entry into the control room." },
    { id: "new-grammar-ch2", order: 2, title: "控制台上的信号 / Signals on the Console", summary: "控制台重新通电后，指示灯不断闪烁，穹顶却仍然不动。Noah观察此刻正在变化的电压读数，Ms. Rivera对照设备平时的运行规则，发现冷却风扇现在没有转动。两人决定先处理风扇，而不是强行启动穹顶。", pointId: pointIds[1], usage: "Contrast actions happening now with the console's normal operating behaviour." },
    { id: "new-grammar-ch3", order: 3, title: "已经完成的修复 / What the Team Has Repaired", summary: "同学Mina带来干燥工具，三人清理保险盒并重新连接风扇。Noah逐项汇报团队已经完成的修复和仍未解决的问题；Ms. Rivera根据这些最新结果判断主系统可以进入低功率测试，但穹顶传感器仍需要检查。", pointId: pointIds[2], usage: "Use Present perfect for completed repairs whose results matter to the current test." },
    { id: "new-grammar-ch4", order: 4, title: "安全测试 / The Safety Test", summary: "Dr. Hall远程说明安全要求：测试前必须清空穹顶轨道，所有人必须站在黄色线外，Noah还需要确认紧急停止按钮。团队逐项完成要求，随后发现一把维修梯仍挡在轨道旁，于是暂停测试并把它移走。", pointId: pointIds[3], usage: "Use have to and must for external safety requirements and strong necessary actions." },
    { id: "new-grammar-ch5", order: 5, title: "如果穹顶打开 / If the Dome Opens", summary: "正式测试前，Noah比较现实方案和假设方案：如果传感器通过，他们就按原计划开放天文馆；如果传感器仍然失败，他们会把活动改成小型星图课。传感器最终通过，穹顶顺利打开，团队保留星图课作为备用方案并按时迎接参观者。", pointId: pointIds[4], usage: "Use real and hypothetical if-clauses to compare the available plans without changing the confirmed outcome." },
  ];
  const input = {
    course: { id: "new-grammar-planetarium", title: "停电后的天文馆", durationMinutes: 45, currentStage: "content", englishLevel: "B1", storyComplexity: "conflict_driven", knowledgePointIds: pointIds },
    outline: {
      id: "new-grammar-outline",
      title: "停电后的天文馆 / The Planetarium After the Storm",
      summary: "暴雨让社区天文馆的控制系统停止工作。Noah、Ms. Rivera、Mina和管理员Dr. Hall没有冒险强行启动设备，而是根据记录、实时读数、已经完成的修复和安全要求逐步排查。团队为传感器测试准备了现实方案和备用方案，最终安全打开穹顶并按时举行活动。",
      chapters: chapters.map(({ pointId, usage, ...chapter }) => ({ ...chapter, recommendedKnowledgePointIds: [pointId], knowledgePointRecommendationSummary: usage })),
    },
    knowledgePoints,
    plan: {
      courseId: "new-grammar-planetarium",
      status: "confirmed",
      englishLevel: "B1",
      mainIdeaTargetWordCount: 120,
      chapters: chapters.map((chapter) => ({
        outlineChapterId: chapter.id,
        targetWordCount: 110,
        paragraphCount: 2,
        knowledgePointIds: [chapter.pointId],
        readingExerciseMode: "interactive",
        readingExercises: { enabled: true, grammar: { optionCloze: 4, wordForm: 3 }, vocabulary: { chineseHint: 3 } },
        chapterPractice: { enabled: true, grammar: { optionCloze: 2, wordForm: 2 } },
        touched: { targetWordCount: true, paragraphCount: false, knowledgePointIds: false, readingExerciseMode: false, readingExercises: false, chapterPractice: true },
      })),
      afterClassPractice: { enabled: true, vocabularyReviewEnabled: true, knowledgePointIds: pointIds, practice: { enabled: true, grammar: { optionCloze: 3, wordForm: 2 } }, touched: { knowledgePointIds: false, practice: true } },
      updatedAt: "2026-08-29T00:00:00.000Z",
      confirmedAt: "2026-08-29T00:00:00.000Z",
    },
    promptPeople: [
      { role: "teacher", chineseName: "老师", englishName: "Ms. Rivera" },
      { role: "student", chineseName: "学生", englishName: "Noah" },
    ],
    promptCharacters: [
      { displayName: "米娜", englishName: "Mina", roleInStory: "带来干燥工具并协助完成保险盒和风扇修复", shortDescription: "Noah的同学，负责协助维修和复核步骤" },
      { displayName: "霍尔管理员", englishName: "Dr. Hall", roleInStory: "远程确认进入控制室和启动设备的安全流程", shortDescription: "社区天文馆管理员，提供必要但不替学生解决问题的安全指导" },
    ],
    contentIntent: {
      kind: "concept",
      storyMode: "new_story",
      classroomPresence: "participant",
      objective: "在真实任务中理解证据驱动的排查与备用方案",
      learningTargets: [
        { concept: "证据驱动排查", expectedUnderstanding: "先根据记录、实时状态和测试结果定位问题，再决定下一步行动" },
        { concept: "安全边界", expectedUnderstanding: "安全要求必须先满足，不能为了赶进度跳过检查" },
      ],
      assumedPriorKnowledge: [],
      sourceRequirements: [],
      required: ["穹顶最终安全打开", "星图课作为备用方案保留"],
      excluded: ["魔法修复", "跳过安全步骤", "成年人直接替学生完成全部排查"],
    },
  };
  const config = { scope: "content", method: "generateReading", args: [input, "quickrouter_gpt"] };
  const resolved = path.resolve(output);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
