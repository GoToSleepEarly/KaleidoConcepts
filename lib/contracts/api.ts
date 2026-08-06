export type Gender = "male" | "female";
export type PersonRole = "teacher" | "student";
export type PersonVisualStatus = "pending" | "submitting" | "succeeded" | "failed";
export type PersonVisualSourceMode = "photo" | "description" | "revision";
export type PersonVisualProvider = "quickrouter_gpt_image_2";
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
  nextCursor: string | null;
};

export type CourseLifecycleStatus = "draft" | "published" | "archived";
export type CourseStage = "audience" | "story_outline" | "teaching_plan" | "content" | "visual_resources" | "preview";

export type CourseAudienceInput = {
  title: string;
  teacherId: string;
  studentIds: string[];
  durationMinutes: 30 | 45 | 60;
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
  lifecycleStatus: CourseLifecycleStatus;
  currentStage: CourseStage;
  people: CourseAudiencePerson[];
};

export type CourseListItem = {
  id: string;
  title: string;
  durationMinutes: number;
  lifecycleStatus: CourseLifecycleStatus;
  currentStage: CourseStage;
  teacherName: string | null;
  studentNames: string[];
  nextEditPath: string;
  updatedAt: string;
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
    | "regenerate_outline";
  targetId?: string;
  researchPlan?: CourseResearchPlan;
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
  classroomValue: string;
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
};

export type CourseStoryOutline = {
  id: string;
  courseId: string;
  chapterCount: number;
  title: string;
  summary: string;
  narrativeType?: string;
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
  };
  chatMessages: CourseStoryChatMessage[];
  settings: {
    chapterCount: number;
    writingProvider: StoryWritingProvider;
  };
  directions: CourseStoryDirection[];
  referenceMaterials: CourseSourceReference[];
  outline: CourseStoryOutline | null;
  coursePeople: CourseAudiencePerson[];
};

export type CourseStoryMessageInput = {
  message: string;
  mode: "idea" | "random" | "revise";
  action?: CourseStoryChatAction["action"];
  targetId?: string;
  researchPlan?: CourseResearchPlan;
  chapterCount?: number;
  writingProvider?: StoryWritingProvider;
};

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
