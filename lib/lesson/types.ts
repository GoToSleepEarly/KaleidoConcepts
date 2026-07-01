export type LessonSegment =
  | { type: "text"; text: string }
  | { type: "blank"; id: string; answerKeyId: string };

export type LessonBlock = {
  type: "paragraph";
  segments: LessonSegment[];
};

export type LessonImageSlot = {
  id: string;
  slotIndex: number;
};

export type LessonSection = {
  id: string;
  title: string;
  blocks: LessonBlock[];
  imageSlots: LessonImageSlot[];
  sourceHash: string;
};

export type StructuredLesson = {
  title: string;
  intro: string;
  sections: LessonSection[];
  answerKey: Array<{ id: string; text: string }>;
  homework: string;
};

export type NormalizeErrorCode =
  | "MISSING_INTRODUCTION"
  | "SECTION_COUNT_INVALID"
  | "EMPTY_SECTION"
  | "MISSING_ANSWER_KEY"
  | "MISSING_HOMEWORK"
  | "BLANK_ANSWER_MISMATCH";

export type NormalizeResult =
  | { ok: true; lesson: StructuredLesson }
  | { ok: false; error: { code: NormalizeErrorCode; message: string } };
