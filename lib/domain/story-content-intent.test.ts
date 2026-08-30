import { describe, expect, test } from "vitest";

import { storyContentIntentFromAlignmentDetails } from "./story-content-intent";

describe("storyContentIntentFromAlignmentDetails", () => {
  test("derives only downstream teaching obligations from a confirmed concept brief", () => {
    expect(storyContentIntentFromAlignmentDetails({
      schemaVersion: 2,
      requirement: {
        kind: "resolved",
        storyMode: "new_story",
        classroomPresence: "participant",
        brief: {
          kind: "concept",
          objective: "用故事帮助学生理解 MBTI 偏好",
          learningTargets: [{ concept: "E/I", expectedUnderstanding: "能量偏好，不等于外向或害羞" }],
          assumedPriorKnowledge: [],
          sourceRequirements: [{ name: "MBTI", useInCourse: "只讲四组基础偏好" }],
          requiredNamedCharacters: [],
          fixedPlot: null,
          additionalConstraints: { required: ["避免贴标签"], preferred: [], excluded: ["测试学生类型"] },
        },
      },
    })).toEqual({
      kind: "concept",
      storyMode: "new_story",
      classroomPresence: "participant",
      objective: "用故事帮助学生理解 MBTI 偏好",
      learningTargets: [{ concept: "E/I", expectedUnderstanding: "能量偏好，不等于外向或害羞" }],
      assumedPriorKnowledge: [],
      sourceRequirements: [{ name: "MBTI", useInCourse: "只讲四组基础偏好" }],
      required: ["避免贴标签"],
      excluded: ["测试学生类型"],
    });
  });

  test("preserves faithful adaptation and classroom presence as downstream hard boundaries", () => {
    expect(storyContentIntentFromAlignmentDetails({
      schemaVersion: 2,
      requirement: {
        kind: "resolved",
        storyMode: "faithful",
        classroomPresence: "observer",
        brief: {
          kind: "narrative",
          objective: "跟随《浮士德》的关键剧情",
          sourceRequirements: [{ name: "《浮士德》", useInCourse: "保留关键人物、事件因果和结局" }],
          requiredNamedCharacters: ["浮士德", "梅菲斯特"],
          fixedPlot: "课堂人物见证原作剧情，不改变事件",
          additionalConstraints: { required: [], preferred: [], excluded: [] },
        },
      },
    })).toMatchObject({ storyMode: "faithful", classroomPresence: "observer" });
  });

  test("does not infer intent from legacy or unconfirmed alignment data", () => {
    expect(storyContentIntentFromAlignmentDetails({ summary: "旧摘要" })).toBeUndefined();
    expect(storyContentIntentFromAlignmentDetails({ schemaVersion: 2, requirement: { kind: "clarification" } })).toBeUndefined();
    expect(storyContentIntentFromAlignmentDetails({ schemaVersion: 2, requirement: { kind: "resolved", storyMode: "new_story", classroomPresence: "participant", brief: { kind: "narrative" } } })).toBeUndefined();
  });
});
