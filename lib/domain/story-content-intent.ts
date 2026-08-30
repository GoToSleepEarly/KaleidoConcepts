import type { StoryContentIntent, StoryRequirementBrief } from "@/lib/contracts/api";

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function storyContentIntentFromAlignmentDetails(value: unknown): StoryContentIntent | undefined {
  const details = recordValue(value);
  const requirement = recordValue(details?.requirement);
  const brief = recordValue(requirement?.brief);
  if (details?.schemaVersion !== 2 || requirement?.kind !== "resolved" || !brief) return undefined;
  const storyMode = requirement.storyMode;
  const classroomPresence = requirement.classroomPresence;
  if (storyMode !== "faithful" && storyMode !== "new_story") return undefined;
  if (classroomPresence !== "observer" && classroomPresence !== "participant" && classroomPresence !== "absent") return undefined;
  if (brief.kind !== "narrative" && brief.kind !== "concept" && brief.kind !== "factual") return undefined;
  const constraints = recordValue(brief.additionalConstraints);
  if (!constraints || !stringArray(constraints.required) || !stringArray(constraints.excluded)) return undefined;
  if (!Array.isArray(brief.sourceRequirements) || !brief.sourceRequirements.every((item) => {
    const source = recordValue(item);
    return source && typeof source.name === "string" && typeof source.useInCourse === "string";
  })) return undefined;
  if (brief.kind !== "factual" && typeof brief.objective !== "string") return undefined;
  if (brief.kind === "concept" && (!Array.isArray(brief.learningTargets) || !brief.learningTargets.every((item) => {
    const target = recordValue(item);
    return target && typeof target.concept === "string" && typeof target.expectedUnderstanding === "string";
  }) || !stringArray(brief.assumedPriorKnowledge))) return undefined;
  if (brief.kind === "factual" && (typeof brief.factualFocus !== "string" || !Array.isArray(brief.subjects))) return undefined;
  const typed = brief as StoryRequirementBrief;
  const common: StoryContentIntent = {
    kind: typed.kind,
    storyMode,
    classroomPresence,
    objective: typed.kind === "factual" ? typed.factualFocus : typed.objective,
    sourceRequirements: typed.sourceRequirements,
    required: typed.additionalConstraints.required,
    excluded: typed.additionalConstraints.excluded,
  };
  if (typed.kind === "concept") return { ...common, learningTargets: typed.learningTargets, assumedPriorKnowledge: typed.assumedPriorKnowledge };
  if (typed.kind === "factual") return { ...common, factualFocus: typed.factualFocus, subjects: typed.subjects };
  return common;
}
