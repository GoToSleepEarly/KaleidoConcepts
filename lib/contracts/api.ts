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
export type CourseImageSlotType = "visual_cover" | "lesson_shot";
export type CourseImageProvider = "tencent_hunyuan";

export type CourseVisualProfile = {
  style: string;
  palette: string;
  world: string;
  mood: string;
  characters: Array<{
    alias: string;
    appearance: string;
    hairstyle: string;
    clothing: string;
    accessories: string[];
    signatureColor: string;
  }>;
};

export type CourseResourcePlanShot = {
  chapterId: string;
  shotId: string;
  shotOrder: 1 | 2;
  sourceParagraphId: string;
  sourceSentenceIds: string[];
  heroMomentSentenceId: string;
  sourceExcerpt: string;
  focus: string;
  characters: string[];
  keyObjects: string[];
  composition: string;
  continuityNotes: string;
};

export type CourseResourcePlan = {
  schemaVersion: "course_resource_plan_v1";
  visualProfile: CourseVisualProfile;
  coverBrief: {
    description: string;
    characters: string[];
    setting: string;
    storyElements: string[];
  };
  shots: CourseResourcePlanShot[];
  version: number;
  confirmedCoverImageId: string | null;
};

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
  sourceParagraphId: string | null;
  sourceSentenceIds: string[];
  heroMomentSentenceId: string | null;
  sourceExcerpt: string;
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
  referenceImageIds: string[];
  width: 1280;
  height: 720;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CourseResourcesResponse = {
  plan: CourseResourcePlan | null;
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
      text: string;
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

export type StoryOptionVariant = "faithful" | "enhanced" | "creative";

export type StoryChapter = {
  title: string;
  summary: string;
};

export type StoryOption = {
  id: string;
  variant: StoryOptionVariant;
  title: string;
  storyline: string;
  chapters: StoryChapter[];
};

export type StoryOptionsListResponse = {
  options: StoryOption[];
  selectedOptionId: string | null;
};

export type LessonDraft = LessonContentDraft;

export type CastAlias = {
  alias: string;
  displayName: string;
};

export type LessonContentDraft = {
  schemaVersion: "lesson_content_v1";
  sourceStoryOptionId: string;
  generationMode: "ai";
  title: string;
  language: "en";
  castAliases: CastAlias[];
  chapters: LessonContentChapter[];
  closingReading: LessonClosingReading;
};

export type LessonClosingReading = {
  title: string;
  sentences: string[];
  vocabularyTerms: string[];
};

export type LessonContentChapter = {
  id: string;
  sourceOutlineChapterIndex: number;
  title: string;
  paragraphs: LessonParagraph[];
  exercises: LessonExercise[];
};

export type LessonParagraph = {
  id: string;
  order: 1 | 2;
  sentences: LessonSentence[];
};

export type LessonSentence = {
  id: string;
  text: string;
  segments: LessonSegment[];
};

export type LessonSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "exercise";
      exerciseId: string;
    };

export type LessonExerciseTargetCategory = "grammar" | "modal" | "vocab" | "verb_phrase";

export type LessonExercise =
  | {
      id: string;
      order: number;
      type: "given_word_blank";
      targetCategory: "grammar" | "modal" | "vocab";
      target: string;
      sentenceId: string;
      answer: string;
      prompt: string;
      baseWord?: string;
    }
  | {
      id: string;
      order: number;
      type: "choice_blank";
      targetCategory: "grammar" | "modal" | "vocab";
      target: string;
      sentenceId: string;
      answer: string;
      choices: string[];
    }
  | {
      id: string;
      order: number;
      type: "vocab_hint";
      targetCategory: "vocab";
      target: "Vocabulary";
      sentenceId: string;
      answer: string;
      hint: string;
      pattern: string;
      letterCount: number;
    }
  | {
      id: string;
      order: number;
      type: "phrase_hint";
      targetCategory: "verb_phrase";
      target: "Verb Phrases";
      sentenceId: string;
      answer: string;
      hint: string;
      pattern: string;
      letterCount: string;
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
