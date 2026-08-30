import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CourseGrammarQuestion, TeachingPlan, TeachingPlanKnowledgePoint } from "../../lib/contracts/api";
import { stableShuffle } from "../../lib/domain/course-content";
import { exerciseQuestionIssues } from "../../lib/server/repositories/course-content";
import { generatedExercisesSchema } from "../../lib/server/validation/course-content";

function argument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const configPath = argument("--config");
  const responsePath = argument("--response");
  const outputPath = argument("--output");
  if (!configPath || !responsePath || !outputPath) throw new Error("Usage: --config <config.json> --response <raw.txt> --output <validation.json>");
  const config = JSON.parse(await readFile(path.resolve(configPath), "utf8")) as {
    args: [{ knowledgePoints: TeachingPlanKnowledgePoint[]; plan: Pick<TeachingPlan, "chapters" | "afterClassPractice"> }];
  };
  const input = config.args[0];
  const generated = generatedExercisesSchema.parse(JSON.parse(await readFile(path.resolve(responsePath), "utf8")));
  const keys = new Map<string, string>(input.knowledgePoints.map((point: { id: string }, index: number) => [`KP${index + 1}`, point.id]));
  const normalize = (question: (typeof generated.homeworkGrammar)[number], prefix: string, index: number): CourseGrammarQuestion => {
    const id = `${prefix}-${index + 1}`;
    const knowledgePointId = keys.get(question.knowledgePointKey) ?? question.knowledgePointKey;
    if (question.type === "wordForm") return { id, type: question.type, knowledgePointId, before: question.before, after: question.after, answer: question.answer, baseForm: question.baseForm };
    return { id, type: question.type, knowledgePointId, before: question.before, after: question.after, answer: question.answer, options: stableShuffle([question.answer, ...question.distractors], id) };
  };
  const chapters = input.plan.chapters.flatMap((plan) => {
    if (!plan.chapterPractice.enabled) return [];
    const raw = generated.chapters.find((chapter) => chapter.outlineChapterId === plan.outlineChapterId)?.questions ?? [];
    const questions = raw.map((question, index) => normalize(question, `chapter-${plan.outlineChapterId}`, index));
    const issues = exerciseQuestionIssues(input.knowledgePoints, plan.knowledgePointIds, plan.chapterPractice.grammar, questions);
    return [{ id: plan.outlineChapterId, pass: issues.length === 0, issues, questionCount: questions.length }];
  });
  const homeworkPlan = input.plan.afterClassPractice;
  const homework = homeworkPlan.practice.enabled
    ? (() => {
        const questions = generated.homeworkGrammar.map((question, index) => normalize(question, "homework", index));
        const issues = exerciseQuestionIssues(input.knowledgePoints, homeworkPlan.knowledgePointIds, homeworkPlan.practice.grammar, questions);
        return { pass: issues.length === 0, issues, questionCount: questions.length };
      })()
    : { pass: generated.homeworkGrammar.length === 0, issues: generated.homeworkGrammar.length ? ["课后语法练习应为空"] : [], questionCount: generated.homeworkGrammar.length };
  const report = { firstPassReady: chapters.every((chapter) => chapter.pass) && homework.pass, chapters, homework };
  await writeFile(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
