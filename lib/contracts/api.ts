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
