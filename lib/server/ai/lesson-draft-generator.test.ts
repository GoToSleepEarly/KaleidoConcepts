import { afterEach, describe, expect, test, vi } from "vitest";

import type { CourseBasicDetail, PersonProfile, StoryOption } from "@/lib/contracts/api";

import { assembleLessonDraftFromPlan, buildDeepSeekRequestBody, generateLessonDraft } from "./lesson-draft-generator";
import { validateLessonDraft } from "../repositories/lesson-drafts";

const course: CourseBasicDetail = {
  id: "course-1",
  title: "Forest Grammar Quest",
  teacherId: "teacher-1",
  studentIds: ["student-1"],
  englishLevel: "A1",
  durationMinutes: 45,
  theme: "Magic Forest",
  grammar: ["Past Simple"],
  storyIdeaMode: "manual",
  storyIdea: "The class finds a forest gate.",
  status: "draft",
};

const teacher: PersonProfile = {
  id: "teacher-1",
  role: "teacher",
  name: "Ms. Lin",
  gender: "female",
  appearance: "kind teacher with black hair and round glasses",
  interests: [],
  notes: "Gentle guide.",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const student: PersonProfile = {
  id: "student-1",
  role: "student",
  name: "Summer",
  chineseName: "夏天",
  englishName: "Summer",
  age: 8,
  gender: "female",
  appearance: "girl with black hair and a green dress",
  interests: ["plants", "drawing"],
  learningGoal: "Practice retelling story actions.",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const storyOption: StoryOption = {
  id: "option-1",
  title: "The Forest Gate",
  logline: "The teacher and student enter a magical forest and solve a gentle mystery.",
  chapters: [
    {
      title: "The Gate Opens",
      summary: "Ms. Lin and Summer enter the forest and find a glowing map.",
      knowledgeHook: "Practice past simple actions inside the story.",
    },
  ],
  teachingDesign: {
    grammarIntegration: "Past actions drive the clues.",
    studentFit: "Fits plant and drawing interests.",
    teacherGuidance: "Teacher guides choices.",
    difficultyFit: "Fits A1.",
  },
};

const context = { course, teacher, students: [student], storyOption };

function deepSeekResponse(content: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function shotPlan(action: string) {
  return {
    characterIds: ["teacher-1", "student-1"],
    location: "quiet forest gate",
    action,
    mood: "curious and safe",
    scenePrompt: `${action} in a warm watercolor forest scene.`,
    composition: "Wide 4:3 picture-book scene with both characters clearly visible.",
    continuityNotes: "Keep character consistency.",
  };
}

function basePlan(markedText: string) {
  return {
    title: "The Forest Gate",
    visualStyle: {
      artStyle: "warm watercolor picture book",
      colorPalette: "soft greens and gold light",
      consistencyPrompt: "Use a consistent watercolor picture-book style.",
    },
    characters: [],
    chapters: [
      {
        title: "The Gate Opens",
        paragraphs: [
          {
            markedText,
            shot: shotPlan("Ms. Lin and Summer discover the first arrow beside the gate."),
          },
          {
            markedText:
              "Inside the forest, Ms. Lin [verb:help|helped] Summer read the glowing [vocab:m _ p|map], and they [verb:follow|followed] the trail across a tiny bridge. Summer [verb:share|shared] her idea while a bright clue pointed toward the next tree.",
            shot: shotPlan("Summer studies the glowing map while Ms. Lin helps her choose the trail."),
          },
        ],
      },
    ],
    closingReading: {
      title: "After the Forest Gate",
      text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lesson draft AI plan assembly", () => {
  test("code parses AI inline exercise markers into ids, exercise blocks, and shot coverage", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [
          {
            id: "teacher-1",
            name: "Ms. Lin",
            role: "teacher",
            appearance: "kind teacher with black hair and round glasses",
            outfit: "blue cardigan and white shirt",
            consistencyPrompt: "Ms. Lin keeps the same glasses, hair, and cardigan.",
          },
          {
            id: "student-1",
            name: "Summer",
            role: "student",
            appearance: "girl with black hair and a green dress",
            outfit: "green dress and yellow backpack",
            consistencyPrompt: "Summer keeps the same hair, dress, and backpack.",
          },
        ],
        chapters: [
          {
            title: "The Gate Opens",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "quiet forest gate",
                  action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                  mood: "curious and safe",
                  scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                  composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                  continuityNotes: "Keep Ms. Lin's glasses and Summer's green dress consistent.",
                },
              },
              {
                markedText:
                  "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer touched the page and found a hidden [vocab:t _ _ _ l|trail]. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "tiny forest bridge",
                  action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                  mood: "hopeful and focused",
                  scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                  composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                  continuityNotes: "Use the same forest light, character outfits, and watercolor style.",
                },
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and clue became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs. The End.",
        },
      },
      context,
    );

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.chapters[0].blocks.filter((block) => block.type === "exercise")).toHaveLength(10);
    expect(draft.chapters[0].shots[0].coveredBlockIds).toEqual(draft.chapters[0].blocks.slice(0, 11).map((block) => block.id));
    expect(draft.chapters[0].shots[1].coveredBlockIds).toEqual(draft.chapters[0].blocks.slice(11).map((block) => block.id));
    expect(draft.closingReading.vocabularyTerms).toEqual(["gate", "map", "trail"]);
    expect(draft.closingReading.text).not.toMatch(/the end\.?$/i);

    const shotExerciseAnswers = draft.chapters[0].shots.map((shot) =>
      draft.chapters[0].blocks
        .filter((block) => block.type === "exercise" && shot.coveredBlockIds.includes(block.id))
        .map((block) => draft.chapters[0].exercises.find((exercise) => exercise.id === block.exerciseId)?.type),
    );
    expect(shotExerciseAnswers[0]).toContain("vocabulary_hint");
    expect(shotExerciseAnswers[1]).toContain("vocabulary_hint");

    const rendered = draft.chapters[0].blocks
      .map((block) => (block.type === "text" ? block.text : `[${draft.chapters[0].exercises.find((exercise) => exercise.id === block.exerciseId)?.answer}]`))
      .join("");
    expect(rendered).toContain("[walked] toward");
    expect(rendered).not.toContain("[walked]walked");
    expect(rendered).not.toContain("[gate]gate");
    expect(draft.chapters[0].shots[0].scenePrompt).toContain("kind teacher with black hair and round glasses");
    expect(draft.chapters[0].shots[0].scenePrompt).toContain("girl with black hair and a green dress");
  });

  test("accepts 8 AI markers without exact 7 to 3 ratio", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [],
        chapters: [
          {
            title: "The Gate Opens",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "quiet forest gate",
                  action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                  mood: "curious and safe",
                  scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                  composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                  continuityNotes: "Keep character consistency.",
                },
              },
              {
                markedText:
                  "Inside the forest, Summer touched the page and found a hidden trail. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "tiny forest bridge",
                  action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                  mood: "hopeful and focused",
                  scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                  composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                  continuityNotes: "Use the same forest light.",
                },
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The gate became a useful story word. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
        },
      },
      context,
    );

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.chapters[0].exercises).toHaveLength(8);
    expect(draft.chapters[0].exercises.filter((exercise) => exercise.type === "verb_blank")).toHaveLength(7);
    expect(draft.chapters[0].exercises.filter((exercise) => exercise.type === "vocabulary_hint")).toHaveLength(1);
  });

  test("accepts 7 AI markers as the hard minimum", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [],
        chapters: [
          {
            title: "The Gate Opens",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "quiet forest gate",
                  action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                  mood: "curious and safe",
                  scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                  composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                  continuityNotes: "Keep character consistency.",
                },
              },
              {
                markedText:
                  "Inside the forest, Ms. Lin [verb:help|helped] Summer read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and shared her idea.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "tiny forest bridge",
                  action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                  mood: "hopeful and focused",
                  scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                  composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                  continuityNotes: "Use the same forest light.",
                },
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The gate became a useful story word. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
        },
      },
      context,
    );

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.chapters[0].exercises).toHaveLength(7);
  });

  test("rejects 5 AI markers before generation repair", () => {
    expect(() =>
      assembleLessonDraftFromPlan(
        {
          title: "The Forest Gate",
          visualStyle: {
            artStyle: "warm watercolor picture book",
            colorPalette: "soft greens and gold light",
            consistencyPrompt: "Use a consistent watercolor picture-book style.",
          },
          characters: [],
          chapters: [
            {
              title: "The Gate Opens",
              paragraphs: [
                {
                  markedText:
                    "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer carried her sketchbook and looked at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                  shot: {
                    characterIds: ["teacher-1", "student-1"],
                    location: "quiet forest gate",
                    action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                    mood: "curious and safe",
                    scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                    composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                    continuityNotes: "Keep character consistency.",
                  },
                },
                {
                  markedText:
                    "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer touched the page and found a hidden trail. Ms. Lin [verb:help|helped] her read the marks, and they followed the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and shared her idea.",
                  shot: {
                    characterIds: ["teacher-1", "student-1"],
                    location: "tiny forest bridge",
                    action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                    mood: "hopeful and focused",
                    scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                    composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                    continuityNotes: "Use the same forest light.",
                  },
                },
              ],
            },
          ],
          closingReading: {
            title: "After the Forest Gate",
            text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
          },
        },
        context,
      ),
    ).toThrow("第 1 章练习数量不足：需要 7-10 个，当前 5 个");
  });

  test("renders duplicate answer markers as text after the first occurrence", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [],
        chapters: [
          {
            title: "The Gate Opens",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer [verb:walk|walked] past a second stone arch.",
                shot: shotPlan("Ms. Lin and Summer discover the first arrow beside the gate."),
              },
              {
                markedText:
                  "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer [verb:touch|touched] the page and found a hidden [vocab:t _ _ _ l|trail]. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge.",
                shot: shotPlan("Summer studies the glowing map while Ms. Lin helps her choose the trail."),
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
        },
      },
      context,
    );

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.chapters[0].exercises.map((exercise) => exercise.answer)).toEqual(["walked", "gate", "carried", "looked", "asked", "map", "touched", "trail", "helped", "followed"]);
    const rendered = draft.chapters[0].blocks
      .map((block) => (block.type === "text" ? block.text : `[${draft.chapters[0].exercises.find((exercise) => exercise.id === block.exerciseId)?.answer}]`))
      .join("");
    expect(rendered).toContain("walked past a second stone arch");
  });

  test("caps excess AI markers at 10 exercises and renders overflow as text", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [],
        chapters: [
          {
            title: "The Gate Opens",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer [verb:notice|noticed] a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                shot: shotPlan("Ms. Lin and Summer discover the first arrow beside the gate."),
              },
              {
                markedText:
                  "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer [verb:touch|touched] the page and found a hidden [vocab:t _ _ _ l|trail]. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. Summer [verb:share|shared] her idea and [verb:smile|smiled] at the bright tree.",
                shot: shotPlan("Summer studies the glowing map while Ms. Lin helps her choose the trail."),
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
        },
      },
      context,
    );

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.chapters[0].exercises).toHaveLength(10);
    const rendered = draft.chapters[0].blocks
      .map((block) => (block.type === "text" ? block.text : `[${draft.chapters[0].exercises.find((exercise) => exercise.id === block.exerciseId)?.answer}]`))
      .join("");
    expect(rendered).toContain("shared her idea and smiled at the bright tree");
  });

  test("generates vocabulary pattern from answer when AI leaves pattern empty", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [],
        chapters: [
          {
            title: "The Gate Opens",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "quiet forest gate",
                  action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                  mood: "curious and safe",
                  scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                  composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                  continuityNotes: "Keep character consistency.",
                },
              },
              {
                markedText:
                  "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer touched the page and found a hidden [vocab:t _ _ _ l|trail]. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "tiny forest bridge",
                  action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                  mood: "hopeful and focused",
                  scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                  composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                  continuityNotes: "Use the same forest light.",
                },
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
        },
      },
      context,
    );

    const gate = draft.chapters[0].exercises.find((exercise) => exercise.type === "vocabulary_hint" && exercise.answer === "gate");
    expect(gate).toMatchObject({ pattern: "g _ _ e", letterCount: 4 });
  });

  test("rejects AI markers with empty answers", () => {
    expect(() =>
      assembleLessonDraftFromPlan(
        {
          title: "The Forest Gate",
          visualStyle: {
            artStyle: "warm watercolor picture book",
            colorPalette: "soft greens and gold light",
            consistencyPrompt: "Use a consistent watercolor picture-book style.",
          },
          characters: [],
          chapters: [
            {
              title: "The Gate Opens",
              paragraphs: [
                {
                  markedText:
                    "Yesterday morning, Ms. Lin and Summer [verb:walk|] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                  shot: {
                    characterIds: ["teacher-1", "student-1"],
                    location: "quiet forest gate",
                    action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                    mood: "curious and safe",
                    scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                    composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                    continuityNotes: "Keep character consistency.",
                  },
                },
                {
                  markedText:
                    "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer touched the page and found a hidden [vocab:t _ _ _ l|trail]. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
                  shot: {
                    characterIds: ["teacher-1", "student-1"],
                    location: "tiny forest bridge",
                    action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                    mood: "hopeful and focused",
                    scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                    composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                    continuityNotes: "Use the same forest light.",
                  },
                },
              ],
            },
          ],
          closingReading: {
            title: "After the Forest Gate",
            text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
          },
        },
        context,
      ),
    ).toThrow("AI marked exercise is incomplete");
  });

  test("rejects invalid AI marker counts instead of code backfilling exercises", () => {
    expect(() =>
      assembleLessonDraftFromPlan(
        {
          title: "The Forest Gate",
          visualStyle: {
            artStyle: "warm watercolor picture book",
            colorPalette: "soft greens and gold light",
            consistencyPrompt: "Use a consistent watercolor picture-book style.",
          },
          characters: [],
          chapters: [
            {
              title: "The Gate Opens",
              paragraphs: [
                {
                  markedText:
                    "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer carried her sketchbook and looked at the silver leaves. Ms. Lin asked one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                  shot: {
                    characterIds: ["teacher-1", "student-1"],
                    location: "quiet forest gate",
                    action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                    mood: "curious and safe",
                    scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                    composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                    continuityNotes: "Keep character consistency.",
                  },
                },
                {
                  markedText:
                    "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer touched the page and found a hidden trail. Ms. Lin helped her read the marks, and they followed the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and shared her idea.",
                  shot: {
                    characterIds: ["teacher-1", "student-1"],
                    location: "tiny forest bridge",
                    action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                    mood: "hopeful and focused",
                    scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                    composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                    continuityNotes: "Use the same forest light.",
                  },
                },
              ],
            },
          ],
          closingReading: {
            title: "After the Forest Gate",
            text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and clue became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
          },
        },
        context,
      ),
    ).toThrow("第 1 章练习数量不足：需要 7-10 个，当前 3 个");
  });

  test("accepts the formerly brittle 8 verb and 2 vocabulary split", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [],
        chapters: [
          {
            title: "The Map Clue",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "quiet forest gate",
                  action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                  mood: "curious and safe",
                  scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                  composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                  continuityNotes: "Keep character consistency.",
                },
              },
              {
                markedText:
                  "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer [verb:touch|touched] the page and found a hidden trail. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "tiny forest bridge",
                  action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                  mood: "hopeful and focused",
                  scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                  composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                  continuityNotes: "Use the same forest light.",
                },
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map and gate became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
        },
      },
      context,
    );

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.chapters[0].exercises.filter((exercise) => exercise.type === "verb_blank")).toHaveLength(8);
    expect(draft.chapters[0].exercises.filter((exercise) => exercise.type === "vocabulary_hint")).toHaveLength(2);
  });

  test("does not search paragraph text for AI targets like library", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [],
        chapters: [
          {
            title: "The Gate Opens",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:l _ _ _ _ _ y|library]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "quiet forest gate",
                  action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                  mood: "curious and safe",
                  scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                  composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                  continuityNotes: "Keep character consistency.",
                },
              },
              {
                markedText:
                  "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer touched the page and found a hidden [vocab:t _ _ _ l|trail]. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "tiny forest bridge",
                  action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                  mood: "hopeful and focused",
                  scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                  composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                  continuityNotes: "Use the same forest light.",
                },
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and clue became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
        },
      },
      context,
    );

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.closingReading.vocabularyTerms).toEqual(["library", "map", "trail"]);
  });

  test("keeps AI exercise distribution exactly five per paragraph with vocabulary in both shots", () => {
    const draft = assembleLessonDraftFromPlan(
      {
        title: "The Forest Gate",
        visualStyle: {
          artStyle: "warm watercolor picture book",
          colorPalette: "soft greens and gold light",
          consistencyPrompt: "Use a consistent watercolor picture-book style.",
        },
        characters: [],
        chapters: [
          {
            title: "The Gate Opens",
            paragraphs: [
              {
                markedText:
                  "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "quiet forest gate",
                  action: "Ms. Lin and Summer discover the first arrow beside the gate.",
                  mood: "curious and safe",
                  scenePrompt: "Ms. Lin and Summer stand at a silver forest gate while a small arrow glows on the stone path.",
                  composition: "Wide 4:3 picture-book scene with the gate on one side and both characters clearly visible.",
                  continuityNotes: "Keep character consistency.",
                },
              },
              {
                markedText:
                  "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer touched the page and found a hidden [vocab:t _ _ _ l|trail]. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
                shot: {
                  characterIds: ["teacher-1", "student-1"],
                  location: "tiny forest bridge",
                  action: "Summer studies the glowing map while Ms. Lin helps her choose the trail.",
                  mood: "hopeful and focused",
                  scenePrompt: "Summer studies a glowing map beside a tiny bridge as Ms. Lin points toward a bright tree.",
                  composition: "Medium 4:3 picture-book scene centered on the glowing map and the bridge.",
                  continuityNotes: "Use the same forest light.",
                },
              },
            ],
          },
        ],
        closingReading: {
          title: "After the Forest Gate",
          text: "After the forest gate adventure, Summer remembered how each clue helped her speak in English. She described what she saw, what she did, and what changed in the forest. Ms. Lin helped her slow down and notice the important actions. The map, trail, and clue became useful story words. Summer felt proud because she solved the mystery step by step and could retell the journey with clear past tense verbs.",
        },
      },
      context,
    );

    expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
    expect(draft.chapters[0].shots.map((shot) => shot.coveredBlockIds.filter((id) => draft.chapters[0].blocks.find((block) => block.id === id)?.type === "exercise").length)).toEqual([5, 5]);
    expect(draft.chapters[0].shots.map((shot) =>
      shot.coveredBlockIds.some((id) => {
        const block = draft.chapters[0].blocks.find((item) => item.id === id);
        return block?.type === "exercise" && draft.chapters[0].exercises.find((exercise) => exercise.id === block.exerciseId)?.type === "vocabulary_hint";
      }),
    )).toEqual([true, true]);
  });
});

describe("lesson draft generation repair", () => {
  test("repairs an underfilled chapter once and returns a valid draft", async () => {
    const originalApiKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "test-key";
    const underfilledPlan = basePlan(
      "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer carried her sketchbook and looked at the silver leaves. Ms. Lin asked one calm question, and Summer noticed a small arrow on the stone path.",
    );
    const repairedChapter = {
      title: "The Gate Opens",
      paragraphs: [
        {
          markedText:
            "Yesterday morning, Ms. Lin and Summer [verb:walk|walked] toward the quiet forest [vocab:g _ _ e|gate]. Summer [verb:carry|carried] her sketchbook and [verb:look|looked] at the silver leaves. Ms. Lin [verb:ask|asked] one calm question, and Summer noticed a small arrow on the stone path. They opened the gate together and stepped into warm green light.",
          shot: shotPlan("Ms. Lin and Summer discover the first arrow beside the gate."),
        },
        {
          markedText:
            "Inside the forest, the [vocab:m _ p|map] shone under a blue flower. Summer touched the page and found a hidden [vocab:t _ _ _ l|trail]. Ms. Lin [verb:help|helped] her read the marks, and they [verb:follow|followed] the trail across a tiny bridge. The clue pointed to a bright tree, so Summer smiled and [verb:share|shared] her idea.",
          shot: shotPlan("Summer studies the glowing map while Ms. Lin helps her choose the trail."),
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(deepSeekResponse(underfilledPlan))
      .mockResolvedValueOnce(deepSeekResponse(repairedChapter));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const draft = await generateLessonDraft(context);

      expect(validateLessonDraft(draft, storyOption)).toEqual(draft);
      expect(draft.chapters[0].exercises).toHaveLength(10);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).thinking).toEqual({ type: "disabled" });
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = originalApiKey;
      }
    }
  });
});

describe("lesson draft DeepSeek request", () => {
  test("uses non-thinking mode by default for faster normal generation", () => {
    const original = process.env.DEEPSEEK_THINKING;
    delete process.env.DEEPSEEK_THINKING;

    try {
      const body = buildDeepSeekRequestBody([{ role: "user", content: "Generate a lesson draft." }]);

      expect(body).toMatchObject({
        model: "deepseek-v4-flash",
        thinking: { type: "disabled" },
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_tokens: 32000,
      });
      expect(body).not.toHaveProperty("reasoning_effort");
    } finally {
      if (original === undefined) {
        delete process.env.DEEPSEEK_THINKING;
      } else {
        process.env.DEEPSEEK_THINKING = original;
      }
    }
  });

  test("enables thinking mode only through environment configuration", () => {
    const original = process.env.DEEPSEEK_THINKING;
    process.env.DEEPSEEK_THINKING = "enabled";

    try {
      const body = buildDeepSeekRequestBody([{ role: "user", content: "Generate a lesson draft." }]);

      expect(body).toMatchObject({
        model: "deepseek-v4-flash",
        thinking: { type: "enabled" },
        reasoning_effort: "high",
        response_format: { type: "json_object" },
        max_tokens: 64000,
      });
      expect(body).not.toHaveProperty("temperature");
    } finally {
      if (original === undefined) {
        delete process.env.DEEPSEEK_THINKING;
      } else {
        process.env.DEEPSEEK_THINKING = original;
      }
    }
  });
});
