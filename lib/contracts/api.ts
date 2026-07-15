import type { StructuredLesson } from "@/lib/lesson/types";

export type Gender = "male" | "female";
export type EnglishLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type CourseStatus = "draft" | "building_resources" | "ready" | "build_failed" | "published";
export type CourseCreateStep = "basic" | "story_options" | "lesson_draft" | "resources" | "preview";
export type PersonRole = "teacher" | "student";
export type StoryIdeaMode = "manual" | "ai";
export type LlmModel = "deepseek_chat" | "gpt_5_5";

export type PresetKind = "theme" | "grammar";

export type PresetOption = {
  id: string;
  kind: PresetKind;
  label: string;
  category?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PresetOptionInput = {
  kind: PresetKind;
  label: string;
  category?: string;
};

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
      chineseName: string;
      englishName: string;
      age: number;
      gender: Gender;
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

export type CourseResourcePlanShot = {
  chapterId: string;
  shotId: string;
  shotOrder: 1 | 2;
  sourceParagraphId: string;
  focus: string;
  keyObjects: string[];
  imagePrompt: string;
};

export type CourseResourcePlan = {
  schemaVersion: "course_resource_plan_v1";
  coverBrief: {
    description: string;
    storyElements: string[];
    imagePrompt: string;
  };
  shots: CourseResourcePlanShot[];
  version: number;
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
  chapterId: string | null;
  chapterTitle: string;
  shotId: string;
  shotOrder: 1 | 2;
  slotId: string;
  slotType: CourseImageSlotType;
  slotIndex: number;
  sourceParagraphId: string | null;
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

export type CoursePreviewResourceProgress = ResourceProgress;

export type CoursePreviewImage = {
  status: ResourceImageStatus;
  publicUrl: string | null;
  stale: boolean;
  failureReason: string | null;
};

export type CoursePreviewCourse = {
  id: string;
  title: string;
  status: CourseStatus;
  teacherName: string | null;
  studentNames: string[];
};

export type CoursePresentationConfig = {
  coverTheme: string;
  coverTitleFontSize: number;
  chapterTheme: string;
  slideOverrides: Record<string, SlideTextOverride>;
};

export type SlideTextOverride = {
  textBox?: { opacity?: number; fontSize?: number };
};

export type TextBoxStyle = {
  opacity: number;
  fontSize: number;
};

export type CoursePreviewExerciseInline = {
  id: string;
  order: number;
  type: "given_word_blank" | "choice_blank" | "pattern_blank";
  answer: string;
  prompt: string;
  choices?: string[];
  pattern?: string;
  letterCount?: string | number;
  hint?: string;
  colorClass: "violet" | "blue" | "amber";
};

export type CoursePreviewSegment =
  | { type: "text"; text: string }
  | { type: "exercise"; exercise: CoursePreviewExerciseInline };

export type CoursePreviewSentence = {
  id: string;
  segments: CoursePreviewSegment[];
};

export type CoursePreviewParagraph = {
  id: string;
  sentences: CoursePreviewSentence[];
};

export type CoursePreviewPage =
  | {
      id: string;
      type: "cover_pure";
      image: CoursePreviewImage;
      editable: boolean;
    }
  | {
      id: string;
      type: "cover_title";
      image: CoursePreviewImage;
      title: string;
      teacherName: string | null;
      studentNames: string[];
      editable: boolean;
    }
  | {
      id: string;
      type: "chapter_divider";
      chapterIndex: number;
      chapterTitleEn: string;
      editable: boolean;
    }
  | {
      id: string;
      type: "shot_image";
      chapterId: string;
      chapterIndex: number;
      shotOrder: 1 | 2;
      image: CoursePreviewImage;
      editable: boolean;
    }
  | {
      id: string;
      type: "shot_text";
      chapterId: string;
      chapterIndex: number;
      shotOrder: 1 | 2;
      image: CoursePreviewImage;
      paragraphs: CoursePreviewParagraph[];
      textBox: TextBoxStyle;
      editable: boolean;
    }
  | {
      id: string;
      type: "closing_image";
      image: CoursePreviewImage;
      editable: boolean;
    }
  | {
      id: string;
      type: "closing_text";
      image: CoursePreviewImage;
      title: string;
      paragraphs: CoursePreviewParagraph[];
      textBox: TextBoxStyle;
      editable: boolean;
    };

export type CoursePreviewResponse = {
  course: CoursePreviewCourse;
  presentation: CoursePresentationConfig;
  resourceProgress: CoursePreviewResourceProgress;
  canEdit: boolean;
  pages: CoursePreviewPage[];
};

export type CoursePresentationUpdate = {
  coverTheme: string;
  coverTitleFontSize: number;
  chapterTheme: string;
  slideOverrides: Record<string, SlideTextOverride>;
};

export type PublishCourseResponse = {
  redirectUrl: string;
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
  llmModel?: LlmModel;
};

export type UpdateLlmModelInput = {
  llmModel: LlmModel;
};

export type CourseBasicDetail = Omit<CourseBasicInput, "llmModel"> & {
  id: string;
  status: CourseStatus;
  llmModel: LlmModel;
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
  lessonDraftExists: boolean;
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

export type LessonDraftGenStatus = "idle" | "running" | "succeeded" | "failed";

export type LessonDraftGeneration = {
  status: LessonDraftGenStatus;
  startedAt: string | null;
  error: string | null;
};

export type LessonDraftResponse = {
  draft: LessonDraft | null;
  generation: LessonDraftGeneration;
  llmModel: LlmModel;
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
