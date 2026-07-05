import type { StructuredLesson } from "@/lib/lesson/types";

export type Gender = "male" | "female";
export type EnglishLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type CourseStatus = "draft" | "building_resources" | "ready" | "build_failed";
export type PersonRole = "teacher" | "student";
export type StoryIdeaMode = "manual" | "ai";

export type PersonProfile = {
  id: string;
  role: PersonRole;
  name: string;
  chineseName?: string;
  englishName?: string;
  age?: number;
  gender?: Gender;
  appearance?: string;
  interests: string[];
  learningGoal?: string;
  notes?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonInput =
  | {
      role: "teacher";
      name: string;
      gender?: Gender;
      appearance?: string;
      notes?: string;
      avatarUrl?: string;
    }
  | {
      role: "student";
      chineseName: string;
      englishName: string;
      age: number;
      gender: Gender;
      appearance: string;
      interests: string[];
      learningGoal?: string;
      notes?: string;
      avatarUrl?: string;
    };

export type StudentProfile = {
  id: string;
  chineseName: string;
  englishName: string;
  gender: Gender;
  name: string;
  age: number;
  appearance: string;
  interests: string[];
  learningGoal?: string;
  notes?: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type StudentInput = {
  chineseName: string;
  englishName: string;
  age: number;
  gender: Gender;
  appearance: string;
  interests: string[];
  learningGoal?: string;
  notes?: string;
};

export type CourseBrief = {
  studentIds: string[];
  age: number;
  englishLevel: EnglishLevel;
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

export type CourseListItem = {
  id: string;
  title: string;
  teacherName: string | null;
  studentNames: string[];
  englishLevel: EnglishLevel;
  theme: string;
  status: CourseStatus;
  storyOptionsCount: number;
  updatedAt: string;
};

export type CourseBasicInput = {
  title: string;
  teacherId: string;
  studentIds: string[];
  englishLevel: EnglishLevel;
  durationMinutes: 30 | 45 | 60;
  theme: string;
  grammar: string[];
  storyIdeaMode: StoryIdeaMode;
  storyIdea?: string;
};

export type CourseBasicDetail = CourseBasicInput & {
  id: string;
  status: CourseStatus;
};

export type CourseBasicMutationResponse = {
  course: {
    id: string;
    status: CourseStatus;
  };
};

export type StoryChapter = {
  title: string;
  summary: string;
  knowledgeHook: string;
};

export type StoryTeachingDesign = {
  grammarIntegration: string;
  studentFit: string;
  teacherGuidance: string;
  difficultyFit: string;
};

export type StoryOption = {
  id: string;
  title: string;
  logline: string;
  chapters: StoryChapter[];
  teachingDesign: StoryTeachingDesign;
};

export type StoryOptionsListResponse = {
  options: StoryOption[];
  selectedOptionId: string | null;
};

export type LessonDraft = {
  schemaVersion: "lesson_draft_v1";
  sourceStoryOptionId: string;
  generationMode: "ai";
  title: string;
  language: "en";
  visualStyle: LessonVisualStyle;
  characters: LessonVisualCharacter[];
  chapters: LessonChapter[];
};

export type LessonVisualStyle = {
  artStyle: string;
  colorPalette: string;
  aspectRatio: "4:3";
  consistencyPrompt: string;
};

export type LessonVisualCharacter = {
  id: string;
  name: string;
  role: "teacher" | "student";
  appearance: string;
  outfit: string;
  consistencyPrompt: string;
};

export type LessonChapter = {
  id: string;
  sourceOutlineChapterIndex: number;
  title: string;
  wordTarget: {
    min: 120;
    max: 180;
  };
  exerciseTarget: {
    verbBlankCount: 7;
    vocabularyHintCount: 3;
  };
  blocks: LessonBlock[];
  exercises: LessonExercise[];
  shots: LessonShot[];
};

export type LessonBlock =
  | {
      id: string;
      order: number;
      type: "text";
      text: string;
    }
  | {
      id: string;
      order: number;
      type: "exercise";
      exerciseId: string;
      display: LessonBlankDisplay;
    };

export type LessonBlankDisplay =
  | {
      kind: "verb_blank";
      placeholder: "________";
      prompt: string;
    }
  | {
      kind: "vocabulary_hint";
      placeholder: "________";
      pattern: string;
      letterCount: number;
    };

export type LessonExercise =
  | {
      id: string;
      type: "verb_blank";
      answer: string;
      baseVerb: string;
    }
  | {
      id: string;
      type: "vocabulary_hint";
      answer: string;
      pattern: string;
      letterCount: number;
    };

export type LessonShot = {
  id: string;
  order: 1 | 2;
  imageSlotId: string;
  coveredBlockIds: string[];
  characterIds: string[];
  location: string;
  action: string;
  mood: string;
  scenePrompt: string;
  composition: string;
  continuityNotes: string;
};

export type LessonDraftResponse = {
  draft: LessonDraft | null;
};

export type CreateCourseResponse = {
  course: CourseDetail;
};

export type CoursesListResponse = {
  courses: CourseListItem[];
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

export type PeopleListResponse = {
  people: PersonProfile[];
};
