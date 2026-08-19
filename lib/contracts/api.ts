export type Gender = "male" | "female";
export type PersonRole = "teacher" | "student";
export type PersonVisualStatus = "pending" | "submitting" | "succeeded" | "failed";
export type PersonVisualSourceMode = "photo" | "description" | "revision";
export type PersonVisualProvider = "quickrouter_gpt_image_2" | "crazyrouter_gpt_image_2" | "haoai_gpt_image_2" | "easy88ai_gpt_image_2";
export type PersonProfileVisualStatus = "missing" | "generating" | "ready" | "failed";

export type PersonVisualSummary = {
  id: string;
  publicUrl: string;
  sourceMode: PersonVisualSourceMode;
  createdAt: string;
};

export type PersonProfile = {
  id: string;
  role: PersonRole;
  chineseName: string;
  englishName: string;
  age: number;
  gender: Gender;
  notes?: string;
  archivedAt?: string;
  activeVisual: PersonVisualSummary | null;
  visualStatus: PersonProfileVisualStatus;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonCreateInput = {
  role: PersonRole;
  chineseName: string;
  englishName: string;
  age: number;
  gender: Gender;
  notes?: string;
};

export type PersonUpdateInput = Omit<PersonCreateInput, "role">;

export type AppearanceConfig = {
  hairstyle?: string;
  hairColor?: string;
  faceShape?: string;
  bodyShape?: string;
  glasses?: string;
  temperament?: string;
  outfitStyle?: string;
  outfitColor?: string;
  signatureFeature?: string;
};

export type PersonVisualAsset = {
  id: string;
  personId: string;
  parentAssetId: string | null;
  sourceMode: PersonVisualSourceMode;
  appearanceConfig: AppearanceConfig | null;
  userInstruction: string | null;
  status: PersonVisualStatus;
  publicUrl: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PeopleListResponse = {
  people: PersonProfile[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CourseLifecycleStatus = "draft" | "published" | "archived";
export type CourseStage = "audience" | "story_outline" | "teaching_plan" | "content" | "visual_resources" | "preview";

export type CourseAudienceInput = {
  title: string;
  teacherId: string;
  studentIds: string[];
  durationMinutes: 30 | 45 | 60;
  englishLevel: EnglishLevel;
  knowledgePointIds: string[];
};

export type CourseAudiencePerson = {
  personId: string;
  role: PersonRole;
  chineseName: string;
  englishName: string;
  age: number;
  gender: Gender;
  visualAssetId: string | null;
  visualUrl: string | null;
  profileChanged: boolean;
};

export type CourseAudienceDetail = {
  id: string;
  title: string;
  durationMinutes: 30 | 45 | 60;
  englishLevel: EnglishLevel | null;
  knowledgePointIds: string[];
  lifecycleStatus: CourseLifecycleStatus;
  currentStage: CourseStage;
  people: CourseAudiencePerson[];
};

export type CourseListItem = {
  id: string;
  title: string;
  durationMinutes: number;
  englishLevel: EnglishLevel | null;
  storyTitle: string | null;
  lessonDraftExists: boolean;
  lifecycleStatus: CourseLifecycleStatus;
  currentStage: CourseStage;
  teacherName: string | null;
  studentNames: string[];
  nextEditPath: string;
  updatedAt: string;
};

export type CoursesListResponse = {
  courses: CourseListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type StoryWritingProvider = "quickrouter_gpt" | "quickrouter_deepseek";
export type StoryResearchProvider = "quickrouter_gpt" | "none";
export type CourseStoryChatRole = "teacher" | "assistant" | "system";
export type CourseSourceReferenceType =
  | "real_person"
  | "historical_person"
  | "public_figure"
  | "ip"
  | "game_character"
  | "fictional_character"
  | "other";
export type CourseSourceStatus = "confirmed" | "insufficient" | "teacher_supplied";
export type CourseCharacterSourceType = "person" | "referenced" | "original";
export type CourseResearchPlan = {
  researchGoal: string;
  packets: Array<{
    title: string;
    subjects: Array<{
      name: string;
      context?: string;
    }>;
    researchQuestions: string[];
    storyUseGoals: string[];
  }>;
};

export type StoryAlignmentQuestion = {
  id: string;
  label: string;
  reason?: string;
  required: boolean;
  answerMode: "single_choice" | "multi_choice" | "text";
  options?: Array<{
    id: string;
    label: string;
    enablesTextInput?: boolean;
    textPlaceholder?: string;
  }>;
  allowCustom: boolean;
  recommendedOptionId?: string;
  recommendationReason?: string;
  /** 兼容已持久化的旧消息；新响应统一使用 recommendedOptionId。 */
  allowRecommendation?: boolean;
  /** 兼容已持久化的旧消息；不得直接把 value 渲染为用户文案。 */
  recommendation?: { value: string; reason: string };
};

export type StoryAlignmentState = {
  status: "idle" | "needs_clarification" | "ready_for_confirmation" | "confirmed";
  planningMode: "explore_options" | "follow_defined_plot";
  storyMode?: "faithful" | "new_story";
  classroomPresence?: "observer" | "participant" | "absent";
  requiredNamedCharacters?: string[];
  resolvedUnderstanding: string[];
  unresolvedIssues: string[];
  questions: StoryAlignmentQuestion[];
  summary?: string;
  needsBackgroundRefresh?: boolean;
  artifactsOutdated?: boolean;
  pendingChange?: {
    id: string;
    kind: "outline_revision" | "requirement_change";
    request: string;
    reason: string;
    targetScope: "direction" | "outline" | "chapter";
    needsBackgroundRefresh: boolean;
  };
};

export type CourseStoryChatAction = {
  id: string;
  label: string;
  action:
    | "choose_direction"
    | "confirm_reference_object"
    | "request_reference_search"
    | "supply_reference_material"
    | "choose_reference_search"
    | "confirm_reference_materials"
    | "choose_story_usage"
    | "describe_story_usage"
    | "generate_directions"
    | "generate_from_reference"
    | "regenerate_outline"
    | "submit_alignment_answers"
    | "confirm_requirements"
    | "modify_requirements"
    | "revise_direction"
    | "confirm_direction"
    | "revise_outline"
    | "revise_chapter"
    | "confirm_story_change"
    | "cancel_story_change"
    | "retry_operation";
  targetId?: string;
  researchPlan?: CourseResearchPlan;
  questions?: StoryAlignmentQuestion[];
};

export type CourseStoryChatMessage = {
  id: string;
  courseId: string;
  role: CourseStoryChatRole;
  content: string;
  actions: CourseStoryChatAction[];
  createdAt: string;
};

export type CourseStoryDirection = {
  id: string;
  courseId: string;
  title: string;
  hook: string;
  whyFits: string;
  mainCharacters: string[];
  storyHighlight?: string;
  growthCore?: string;
  classroomValue?: string;
  seedPrompt: string;
  selectedAt: string | null;
  createdAt: string;
};

export type CourseSourceReference = {
  id: string;
  courseId: string;
  name: string;
  type: CourseSourceReferenceType;
  sourceStatus: CourseSourceStatus;
  summary: string;
  usableFacts: string[];
  avoidTopics: string[];
  adaptationBoundary: string;
  researchProvider: StoryResearchProvider;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CourseCharacter = {
  id: string;
  courseId: string;
  displayName: string;
  englishName: string;
  sourceType: CourseCharacterSourceType;
  sourcePersonId?: string | null;
  sourceReferenceId?: string | null;
  roleInStory: string;
  shortDescription: string;
  visualDescription?: string | null;
  shouldAppearInImages: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CourseStoryOutlineChapter = {
  id: string;
  order: number;
  title: string;
  titleZh?: string;
  titleEn?: string;
  storyGoal: string;
  keyEvents: string[];
  whatHappens?: string;
  characterActions?: string;
  mainlineProgress?: string;
  characterIds: string[];
  setting: string;
  endingHook: string;
  recommendedKnowledgePointIds?: string[];
  knowledgePointRecommendationSummary?: string;
};

export type CourseStoryOutline = {
  id: string;
  courseId: string;
  chapterCount: number;
  title: string;
  summary: string;
  storyHook?: string;
  writingProvider: StoryWritingProvider;
  sourceReferences: CourseSourceReference[];
  characters: CourseCharacter[];
  chapters: CourseStoryOutlineChapter[];
  createdAt: string;
  updatedAt: string;
};

export type CourseStoryOutlineState = {
  course: {
    id: string;
    title: string;
    durationMinutes: 30 | 45 | 60;
    currentStage: CourseStage;
    englishLevel?: EnglishLevel;
    knowledgePointIds?: string[];
  };
  selectedKnowledgePoints?: TeachingPlanKnowledgePoint[];
  unrecommendedKnowledgePoints?: TeachingPlanKnowledgePoint[];
  chatMessages: CourseStoryChatMessage[];
  settings: {
    chapterCount: number;
    writingProvider: StoryWritingProvider;
  };
  alignment?: StoryAlignmentState;
  directions: CourseStoryDirection[];
  referenceMaterials: CourseSourceReference[];
  outline: CourseStoryOutline | null;
  coursePeople: CourseAudiencePerson[];
  operation?: {
    requestId: string;
    action: string;
    phase: "aligning" | "repairing_alignment_format" | "preparing_reference" | "searching_reference" | "generating_directions" | "generating_outline" | "revising";
    status: "running" | "succeeded" | "failed" | "result_unknown" | "superseded";
    errorMessage: string | null;
    startedAt: string;
    updatedAt: string;
  } | null;
};

export type CourseStoryMessageInput = {
  message: string;
  mode: "idea" | "random" | "revise";
  action?: CourseStoryChatAction["action"];
  targetId?: string;
  targetChapterOrder?: number;
  alignmentAnswers?: Record<string, string | string[]>;
  researchPlan?: CourseResearchPlan;
  chapterCount?: number;
  writingProvider?: StoryWritingProvider;
  requestId?: string;
  resetDownstream?: boolean;
};

export type PresetKind = "theme" | "story_type" | "story_tone" | "grammar";

export type PresetOption = {
  id: string;
  kind: PresetKind;
  label: string;
  labelZh?: string;
  category?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PresetOptionInput = {
  kind: PresetKind;
  label: string;
  labelZh?: string;
  category: string;
};

export type EnglishLevel = "Starter" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type TeachingPlanStatus = "draft" | "confirmed";
export type GrammarExerciseType = "optionCloze" | "wordForm";
export type ReadingExerciseMode = "complete" | "interactive";

export type GrammarExerciseCounts = Record<GrammarExerciseType, number>;

export type ReadingExerciseConfig = {
  enabled: boolean;
  grammar: GrammarExerciseCounts;
  vocabulary: { chineseHint: number };
};

export type GrammarPracticeConfig = {
  enabled: boolean;
  grammar: GrammarExerciseCounts;
};

export type TeachingPlanChapter = {
  outlineChapterId: string;
  targetWordCount: number | null;
  paragraphCount: number;
  knowledgePointIds: string[];
  readingExerciseMode: ReadingExerciseMode;
  readingExercises: ReadingExerciseConfig;
  chapterPractice: GrammarPracticeConfig;
  touched: {
    targetWordCount: boolean;
    paragraphCount: boolean;
    knowledgePointIds?: boolean;
    readingExerciseMode: boolean;
    readingExercises: boolean;
    chapterPractice: boolean;
  };
};

export type AfterClassPracticeConfig = {
  enabled: boolean;
  vocabularyReviewEnabled: boolean;
  knowledgePointIds: string[];
  practice: GrammarPracticeConfig;
  touched: {
    knowledgePointIds: boolean;
    practice: boolean;
  };
};

export type TeachingPlan = {
  courseId: string;
  status: TeachingPlanStatus;
  englishLevel: EnglishLevel | null;
  mainIdeaTargetWordCount?: number;
  chapters: TeachingPlanChapter[];
  afterClassPractice: AfterClassPracticeConfig;
  updatedAt: string;
  confirmedAt: string | null;
};

export type TeachingPlanKnowledgePoint = {
  id: string;
  label: string;
  labelZh?: string;
  category?: string;
};

export type TeachingPlanState = {
  course: {
    id: string;
    title: string;
    durationMinutes: 30 | 45 | 60;
    currentStage: CourseStage;
    englishLevel?: EnglishLevel;
    knowledgePointIds?: string[];
  };
  outline: {
    id: string;
    title: string;
    summary?: string;
    chapters: Array<{
      id: string;
      order: number;
      title: string;
      summary: string;
      recommendedKnowledgePointIds: string[];
      knowledgePointRecommendationSummary: string;
    }>;
  };
  knowledgePoints: TeachingPlanKnowledgePoint[];
  plan: TeachingPlan;
};

export type CourseContentStatus = "empty" | "generating_reading" | "reading_ready" | "generating_exercises" | "ready" | "failed" | "confirmed";
export type CourseContentPhase = "preparing" | "generating_chapters" | "validating_chapters" | "repairing_chapters" | "validating_main_idea" | "repairing_main_idea" | "generating_exercises" | "validating_exercises" | null;
export type CourseContentTargetType = "chapter" | "paragraph" | "chapter_practice" | "main_idea" | "homework";

export type CourseContentTextPart = { type: "text"; text: string };
export type CourseContentGrammarPart = {
  type: "grammar";
  id: string;
  exerciseType: GrammarExerciseType;
  knowledgePointId: string;
  answer: string;
  baseForm?: string;
  options?: string[];
};
export type CourseContentVocabularyPart = {
  type: "vocabulary";
  id: string;
  answer: string;
  canonicalForm: string;
  meaningZh: string;
};
export type CourseContentPart = CourseContentTextPart | CourseContentGrammarPart | CourseContentVocabularyPart;

export type CourseContentParagraph = {
  id: string;
  parts: CourseContentPart[];
};

export type CourseGrammarQuestion = {
  id: string;
  type: GrammarExerciseType;
  knowledgePointId: string;
  before: string;
  after: string;
  answer: string;
  baseForm?: string;
  options?: string[];
};

export type CourseContentChapter = {
  id: string;
  outlineChapterId: string;
  order: number;
  title: string;
  targetWordCount: number;
  readingExerciseMode: ReadingExerciseMode;
  paragraphs: CourseContentParagraph[];
  chapterPractice: CourseGrammarQuestion[];
  validationIssues: string[];
};

export type CourseVocabularyMatchingItem = {
  id: string;
  canonicalForm: string;
  meaningZh: string;
};

export type CourseContentMessage = {
  id: string;
  role: "teacher" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type CourseContentState = {
  course: { id: string; title: string; currentStage: CourseStage; englishLevel: EnglishLevel };
  storyTitle: string;
  knowledgePoints: Array<{ id: string; label: string }>;
  chapterKnowledgePointIds: Record<string, string[]>;
  homeworkKnowledgePointIds: string[];
  status: CourseContentStatus;
  phase: CourseContentPhase;
  writingProvider: StoryWritingProvider;
  sourceRevision: string;
  contentVersion: number;
  chapters: CourseContentChapter[];
  mainIdea: { id: string; title: string; text: string } | null;
  homework: { grammar: CourseGrammarQuestion[]; vocabularyMatching: CourseVocabularyMatchingItem[] } | null;
  exercisesStale: boolean;
  messages: CourseContentMessage[];
  errorMessage: string | null;
  updatedAt: string | null;
  operation: {
    id: string;
    type: "reading" | "exercises" | "modify";
    status: "running";
    startedAt: string;
    updatedAt: string;
  } | null;
};

export type CourseImageQuality = "low" | "medium" | "high";
export type CharacterVisualIntent = "preserve_identity" | "originalize";
export type CharacterVisualSource = "person_asset" | "uploaded_reference" | "generated_baseline";
export type CharacterVisualStatus = "missing" | "generating" | "ready" | "failed" | "stale";
export type CourseImageStatus = "pending" | "submitting" | "generating" | "succeeded" | "failed";
export type CourseImageSlotType = "character_baseline" | "visual_cover" | "lesson_shot";
export type VisualPlanMode = "faithful" | "originalized";
export type CharacterVisualAnchorMode = "reference" | "semantic" | "description";
export type CourseImageFailureCode = "retryable" | "storage_recoverable" | "invalid_request" | "policy_blocked" | "unknown";

export type CourseVisualAsset = {
  id: string;
  parentAssetId: string | null;
  operation: "initial" | "revision";
  userInstruction: string | null;
  quality: CourseImageQuality;
  planRevision: number;
  status: CourseImageStatus;
  publicUrl: string | null;
  failureCode: CourseImageFailureCode | null;
  failureReason: string | null;
  startedAt: string | null;
  createdAt: string;
};

export type CourseCharacterVisual = {
  id: string;
  characterId: string;
  displayName: string;
  chineseName: string;
  englishName: string;
  sourceType: CourseCharacterSourceType;
  sourceReferenceType: CourseSourceReferenceType | null;
  sourceReferenceName: string | null;
  visualAnchorMode: CharacterVisualAnchorMode | null;
  visualAnchorLabel: string | null;
  visualAnchorContext: string | null;
  appearanceDescription: string | null;
  shouldAppearInImages: boolean;
  isMain: boolean;
  intent: CharacterVisualIntent | null;
  source: CharacterVisualSource | null;
  status: CharacterVisualStatus;
  personVisualUrl: string | null;
  storyVisualDesign: string | null;
  activeAssetId: string | null;
  activeAsset: CourseVisualAsset | null;
  versions: CourseVisualAsset[];
};

export type CourseVisualImageSlot = {
  id: string;
  stableKey: string;
  slotType: CourseImageSlotType;
  chapterId: string | null;
  chapterOrder: number | null;
  chapterTitle: string | null;
  paragraphId: string | null;
  sourceText: string;
  characterIds: string[];
  focus: string;
  sceneDescription: string;
  prompt: string;
  hasUnsyncedChanges: boolean;
  activeAssetId: string | null;
  activeAsset: CourseVisualAsset | null;
  versions: CourseVisualAsset[];
};

export type CourseVisualResourcesState = {
  course: { id: string; title: string; currentStage: CourseStage };
  quality: CourseImageQuality;
  planReady: boolean;
  planRevision: number | null;
  planMode: VisualPlanMode | null;
  confirmedCoverAssetId: string | null;
  policyBlocked: boolean;
  characters: CourseCharacterVisual[];
  slots: CourseVisualImageSlot[];
};

export type CoursePreviewImage = { publicUrl: string | null };
export type CoursePreviewReadingPart =
  | { type: "text"; text: string }
  | { type: "exercise"; id: string; number: number; exerciseType: GrammarExerciseType | "vocabulary"; answer: string; knowledgePointId: string | null; knowledgePointLabel: string; spaceBefore: boolean; hint?: string; meaningZh?: string; options?: string[] };

export type CoursePreviewKnowledgePoint = { id: string; label: string };

export type CoursePreviewPage =
  | { id: string; type: "cover_pure"; image: CoursePreviewImage }
  | { id: string; type: "cover_title"; image: CoursePreviewImage; title: string; teacherName: string | null; studentNames: string[] }
  | { id: string; type: "chapter_divider"; chapterOrder: number; chapterTitleZh: string; chapterTitleEn: string }
  | { id: string; type: "shot_image"; chapterId: string; paragraphId: string; image: CoursePreviewImage }
  | { id: string; type: "shot_text"; chapterId: string; paragraphId: string; image: CoursePreviewImage; readingExerciseMode: ReadingExerciseMode; knowledgePoints: CoursePreviewKnowledgePoint[]; parts: CoursePreviewReadingPart[]; textBox: PreviewTextBox }
  | { id: string; type: "grammar_practice"; scope: "chapter" | "homework"; chapterId?: string; chapterTitleZh?: string; chapterTitleEn?: string; exerciseType: GrammarExerciseType; pageNumber: number; questionStartNumber: number; knowledgePoints: CoursePreviewKnowledgePoint[]; questions: CourseGrammarQuestion[] }
  | { id: string; type: "main_idea"; title: string; text: string }
  | { id: string; type: "vocabulary_matching"; pageNumber: number; items: CourseVocabularyMatchingItem[] };

export type PreviewTextBox = { opacity: number; fontSize: number };
export type SlideTextOverride = { textBox?: Partial<PreviewTextBox> };
export type CoursePresentationConfig = {
  coverTheme: string;
  coverTitleFontSize: number;
  chapterTheme: string;
  slideOverrides: Record<string, SlideTextOverride>;
};
export type CoursePresentationUpdate = CoursePresentationConfig;
export type CoursePreviewResponse = {
  course: { id: string; title: string; lifecycleStatus: CourseLifecycleStatus; teacherName: string | null; studentNames: string[] };
  pages: CoursePreviewPage[];
  presentation: CoursePresentationConfig;
};
export type PublishCourseResponse = { redirectUrl: string };
