import type { StructuredLesson } from "./lesson/types";

export const mockStudents = [
  {
    id: "student-lily",
    name: "Lily",
    age: "8",
    grade: "Grade 2",
    interests: "rainy days, drawing, classroom games",
    personality: "curious and careful",
    notes: "Enjoys stories with gentle mystery and repeated sentence patterns.",
    archivedAt: null,
  },
  {
    id: "student-max",
    name: "Max",
    age: "10",
    grade: "Grade 4",
    interests: "space, robots, football",
    personality: "energetic",
    notes: "Needs short paragraphs and clear visual context.",
    archivedAt: null,
  },
  {
    id: "student-ava",
    name: "Ava",
    age: "7",
    grade: "Grade 1",
    interests: "animals and music",
    personality: "quiet but imaginative",
    notes: "Archived mock record for history-view behavior.",
    archivedAt: "2026-06-28",
  },
];

export const mockStructuredLesson: StructuredLesson = {
  title: "A Rainy Morning",
  intro: "Lily learns weather words through a warm five-stage picture-book lesson.",
  answerKey: [
    { id: "answer-1", text: "gray" },
    { id: "answer-2", text: "yellow" },
    { id: "answer-3", text: "bus" },
    { id: "answer-4", text: "kind" },
    { id: "answer-5", text: "blue" },
    { id: "answer-6", text: "short" },
    { id: "answer-7", text: "friend" },
    { id: "answer-8", text: "puddle" },
    { id: "answer-9", text: "rainbow" },
    { id: "answer-10", text: "happy" },
  ],
  homework: "Read the story again. Circle the weather words and draw your favorite scene.",
  sections: [
    section("section-1", "A Rainy Morning", "Lily opens the window. The sky is ____. She puts on her ____ coat.", 1),
    section("section-2", "At the Bus Stop", "Lily sees a big ____. She says hello to the ____ driver.", 3),
    section("section-3", "In the Classroom", "The teacher draws a ____ cloud. Lily writes one ____ sentence.", 5),
    section("section-4", "After School", "Lily walks home with a ____. They jump over a small ____.", 7),
    section("section-5", "A Sunny Ending", "The rain stops. Lily sees a bright ____ and feels ____.", 9),
  ],
};

export const mockImages = mockStructuredLesson.sections.flatMap((lessonSection) =>
  lessonSection.imageSlots.map((slot) => ({
    id: `image-${slot.id}`,
    sectionId: lessonSection.id,
    slotIndex: slot.slotIndex,
    status: slot.slotIndex === 1 ? "succeeded" : "pending",
    url: null,
  })),
);

export const mockStoryOptions = [
  {
    id: "option-1",
    title: "Lily and the Rainy Morning",
    summary: "A gentle weather story with classroom vocabulary and repeated sentence frames.",
  },
  {
    id: "option-2",
    title: "The Missing Yellow Coat",
    summary: "A small mystery that practices adjectives, colors, and simple past clues.",
  },
  {
    id: "option-3",
    title: "A Rainbow After School",
    summary: "A warm friendship story with weather words and homework reading continuity.",
  },
];

export const mockLessonText = `Introduction
Lily learns weather words through a warm five-stage picture-book lesson.

第一阶段：A Rainy Morning
Lily opens the window. The sky is ____. She puts on her ____ coat.

第二阶段：At the Bus Stop
Lily sees a big ____. She says hello to the ____ driver.

第三阶段：In the Classroom
The teacher draws a ____ cloud. Lily writes one ____ sentence.

第四阶段：After School
Lily walks home with a ____. They jump over a small ____.

第五阶段：A Sunny Ending
The rain stops. Lily sees a bright ____ and feels ____.

Answer Key
gray
yellow
bus
kind
blue
short
friend
puddle
rainbow
happy

Homework Reading
Read the story again. Circle the weather words and draw your favorite scene.`;

export const mockCourses = [
  {
    id: "mock-course-1",
    studentName: "Lily",
    status: "ready",
    updatedAt: "2026-07-01 21:30",
    storyOptions: mockStoryOptions,
    selectedStoryOptionId: "option-1",
    lessonText: mockLessonText,
    structuredLesson: mockStructuredLesson,
    images: mockImages,
  },
  {
    id: "mock-course-2",
    studentName: "Max",
    status: "lesson_ready",
    updatedAt: "2026-07-01 20:10",
    storyOptions: mockStoryOptions,
    selectedStoryOptionId: "option-2",
    lessonText: mockLessonText,
    structuredLesson: null,
    images: [],
  },
];

function section(id: string, title: string, text: string, firstAnswerIndex: number) {
  const parts = text.split("____");
  let answerOffset = 0;

  return {
    id,
    title,
    sourceHash: `mock-${id}`,
    imageSlots: [
      { id: `${id}-image-1`, slotIndex: 1 },
      { id: `${id}-image-2`, slotIndex: 2 },
    ],
    blocks: [
      {
        type: "paragraph" as const,
        segments: parts.flatMap((part, index) => {
          if (index === parts.length - 1) {
            return part ? [{ type: "text" as const, text: part }] : [];
          }

          const answerIndex = firstAnswerIndex + answerOffset;
          answerOffset += 1;

          return [
            ...(part ? [{ type: "text" as const, text: part }] : []),
            {
              type: "blank" as const,
              id: `blank-${answerIndex}`,
              answerKeyId: `answer-${answerIndex}`,
            },
          ];
        }),
      },
    ],
  };
}
