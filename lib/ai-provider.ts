import type { Student } from "@prisma/client";

import type { z } from "zod";

import type { lessonBriefSchema } from "./validation";

type LessonBrief = z.infer<typeof lessonBriefSchema>;

export type StoryOption = {
  id: string;
  title: string;
  summary: string;
};

export function generateStoryOptions(student: Student, brief: LessonBrief): StoryOption[] {
  const theme = brief.theme || "daily discovery";
  const vocabulary = brief.targetVocabulary || "target vocabulary";

  return [
    {
      id: "option-1",
      title: `${student.name}'s ${theme} mission`,
      summary: `A gentle five-stage story using ${vocabulary} at ${brief.cefrLevel}.`,
    },
    {
      id: "option-2",
      title: `${student.name} solves a classroom mystery`,
      summary: `A teacher-led mystery that practices ${brief.knowledgePoints}.`,
    },
    {
      id: "option-3",
      title: `${student.name} and the picture-book journey`,
      summary: `A warm adventure shaped by ${student.interests}.`,
    },
  ];
}

export function generateLessonText(student: Student, option: StoryOption) {
  return `Introduction
${student.name} is the main character in a picture-book English lesson called ${option.title}.

第一阶段：A New Morning
${student.name} opens the window. The sky is ____. Today feels ____.

第二阶段：A Small Problem
${student.name} sees a ____ on the desk. The teacher asks a ____ question.

第三阶段：A Brave Try
${student.name} reads one ____ sentence. Then ${student.name} draws a ____ picture.

第四阶段：A Helpful Friend
A friend gives ${student.name} a ____. They practice the words ____.

第五阶段：A Happy Ending
${student.name} finishes the story. Everyone says, "____ work!" ${student.name} feels ____.

Answer Key
bright
exciting
card
kind
short
colorful
book
together
Great
proud

Homework Reading
Read the story again. Underline the new words and draw your favorite scene.`;
}
