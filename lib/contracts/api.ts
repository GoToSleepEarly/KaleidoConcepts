import type { StructuredLesson } from "@/lib/lesson/types";

export type Gender = "male" | "female";
export type EnglishLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type CourseStatus = "draft" | "building_resources" | "ready" | "build_failed";
export type CourseCreateStep = "basic" | "story_options" | "lesson_draft" | "resources" | "preview";
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

export type ResourceImageStatus = "missing" | "pending" | "submitting" | "generating" | "succeeded" | "failed";
export type CourseImageSlotType = "lesson_shot";
export type CourseImageProvider = "tencent_hunyuan";

export type ResourceProgress = {
  total: number;
  succeeded: number;
  generating: number;
  failed: number;
  missing: number;
  stale: number;
};

export type CourseResourceImage = {
  id: string | null;
  courseId: string;
  chapterId: string;
  chapterTitle: string;
  shotId: string;
  shotOrder: 1 | 2;
  slotId: string;
  slotType: CourseImageSlotType;
  slotIndex: number;
  prompt: string;
  sourceHash: string | null;
  currentSourceHash: string;
  stale: boolean;
  status: ResourceImageStatus;
  provider: CourseImageProvider;
  providerTaskId: string | null;
  providerImageUrl: string | null;
  publicUrl: string | null;
  failureReason: string | null;
  action: string;
  scenePrompt: string;
  sourceText: string;
  focus: string | null;
  keyObjects: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type CourseResourcesResponse = {
  progress: ResourceProgress;
  images: CourseResourceImage[];
};

export type CoursePreviewCourse = {
  id: string;
  title: string;
  teacherName: string | null;
  studentNames: string[];
  englishLevel: EnglishLevel;
  durationMinutes: number;
  theme: string;
  grammar: string[];
};

export type CoursePreviewResourceProgress = ResourceProgress;

export type CoursePreviewImage = {
  status: ResourceImageStatus;
  publicUrl: string | null;
  stale: boolean;
  failureReason: string | null;
};

export type CoursePreviewBlock = LessonBlock;

export type CoursePreviewExercise = LessonExercise;

export type CoursePreviewPage =
  | {
      id: string;
      type: "cover";
      title: string;
    }
  | {
      id: string;
      type: "lesson_shot";
      chapterId: string;
      chapterTitle: string;
      chapterIndex: number;
      shotId: string;
      shotOrder: 1 | 2;
      title: string;
      image: CoursePreviewImage;
      blocks: CoursePreviewBlock[];
      exercises: CoursePreviewExercise[];
    }
  | {
      id: string;
      type: "closing_reading";
      title: string;
      text: string;
      vocabularyTerms: string[];
    };

export type CoursePreviewResponse = {
  course: CoursePreviewCourse;
  resourceProgress: CoursePreviewResourceProgress;
  pages: CoursePreviewPage[];
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
  selectedStoryOptionId: string | null;
  lessonDraftExists: boolean;
  currentStep: CourseCreateStep;
  nextEditPath: string;
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
  closingReading: LessonClosingReading;
};

export type LessonClosingReading = {
  title: string;
  text: string;
  vocabularyTerms: string[];
};

export type LessonVisualStyle = {
  artStyle: string;
  colorPalette: string;
  aspectRatio: "4:3";
  consistencyPrompt: string;
  studentAppealPrompt?: string;
};

export type LessonVisualCharacter = {
  id: string;
  name: string;
  role: "teacher" | "student";
  appearance: string;
  outfit: string;
  consistencyPrompt: string;
  faceAndEyes?: string;
  hair?: string;
  signatureFeatures?: string[];
  personalityVisualCue?: string;
};

export type LessonChapter = {
  id: string;
  sourceOutlineChapterIndex: number;
  title: string;
  wordTarget: {
    min: number;
    max: number;
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
  focus?: string;
  keyObjects?: string[];
  spatialDetails?: string;
  studentAppeal?: string;
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
