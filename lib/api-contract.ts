import type { StructuredLesson } from "@/lib/lesson/types";

export type StudentProfile = {
  id: string;
  chineseName: string;
  englishName: string;
  gender: "male" | "female";
  name: string;
  age: number;
  interests: string[];
  learningGoal?: string;
  notes?: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type CourseBrief = {
  studentIds: string[];
  age: number;
  englishLevel: "A1" | "A2" | "B1";
  grammar: string[];
  durationMinutes: 30 | 45 | 60;
  theme: string;
  storyIdea: string;
};

export type StoryPlan = {
  id: string;
  title: string;
  summary: string;
  chapters: string[];
  imageUrl: string;
  accent: "green" | "blue" | "violet";
};

export type CourseImage = {
  id: string;
  sectionId: string;
  slotIndex: number;
  status: "pending" | "generating" | "succeeded" | "failed";
  url: string | null;
};

export type BuildProgress = {
  structureDone: boolean;
  generatedImages: number;
  totalImages: number;
  htmlDone: boolean;
  pdfDone: boolean;
};

export type CourseDetail = {
  id: string;
  title: string;
  students: StudentProfile[];
  brief: CourseBrief;
  storyPlans: StoryPlan[];
  selectedStoryPlanId: string;
  lessonText: string;
  structuredLesson: StructuredLesson;
  images: CourseImage[];
  progress: BuildProgress;
};

export type CreateCourseResponse = {
  course: CourseDetail;
};

export type StoryOptionsResponse = {
  options: StoryPlan[];
};

export type LessonTextResponse = {
  lessonText: string;
};

export type BuildStatusResponse = {
  progress: BuildProgress;
  images: CourseImage[];
};
