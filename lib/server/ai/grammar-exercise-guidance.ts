export type GrammarExerciseFamily =
  | "tense"
  | "modal"
  | "sentence"
  | "nominal"
  | "modifier"
  | "clause"
  | "verb_structure";

const FAMILY_BY_LABEL: Record<string, GrammarExerciseFamily> = {
  "Present Simple": "tense",
  "Present Continuous": "tense",
  "Past Simple": "tense",
  "Past Continuous": "tense",
  "Future with Will": "tense",
  "Future with Be Going To": "tense",
  "Present Perfect": "tense",
  "Past Perfect": "tense",
  "Present Perfect Continuous": "tense",
  "Future Continuous": "tense",
  "Future Perfect": "tense",
  Can: "modal",
  Could: "modal",
  May: "modal",
  Might: "modal",
  Must: "modal",
  "Have To": "modal",
  Should: "modal",
  "There be": "sentence",
  Imperatives: "sentence",
  "Yes/No Questions": "sentence",
  "Wh- Questions": "sentence",
  "Indirect Questions": "sentence",
  "Question Tags": "sentence",
  "Singular and Plural Nouns": "nominal",
  "Noun Countability": "nominal",
  Articles: "nominal",
  "Personal Pronouns": "nominal",
  Possessives: "nominal",
  "Reflexive Pronouns": "nominal",
  Quantifiers: "nominal",
  "Subject–Verb Agreement": "nominal",
  "Adjective Order": "modifier",
  "Adverbs of Frequency": "modifier",
  "Adverbs of Manner": "modifier",
  "Comparative Adjectives": "modifier",
  "Superlative Adjectives": "modifier",
  Too: "modifier",
  Enough: "modifier",
  "Coordinate Clauses": "clause",
  "Reason Clauses": "clause",
  "Time Clauses": "clause",
  "Purpose Clauses": "clause",
  "Concession Clauses": "clause",
  "First Conditional": "clause",
  "Second Conditional": "clause",
  "Third Conditional": "clause",
  "Defining Relative Clauses": "clause",
  "Non-defining Relative Clauses": "clause",
  "Noun Clauses": "clause",
  "Passive Voice": "verb_structure",
  Infinitives: "verb_structure",
  Gerunds: "verb_structure",
  "Reported Speech": "verb_structure",
  "Used To": "verb_structure",
  Wish: "verb_structure",
  "Participle Clauses": "verb_structure",
};

const FAMILY_GUIDANCE: Record<GrammarExerciseFamily, string> = {
  tense: "给词提示填空必须让答案或紧邻上下文真实决定目标时态；可把助动词放在上下文中并填写词形，也可让答案包含完整助动结构。",
  modal: "给词提示填空必须在空格紧邻上下文中出现目标情态结构；优先把情态词放在空格前并填写动词原形，例如 must {{WF}} (stay)。",
  sentence: "给词提示填空允许 cue 是构成目标句型所需的词或短语；答案和紧邻上下文共同形成完整疑问句、祈使句或 there be 结构。",
  nominal: "给词提示填空使用名词、限定词或代词 cue，答案必须体现目标单复数、格、限定或一致关系。",
  modifier: "给词提示填空使用形容词或副词原形 cue，答案或其位置必须体现目标顺序、频率、方式、比较或程度结构。",
  clause: "给词提示填空允许 cue 是连接词、关系词或从句中的动词；答案与上下文共同形成目标从句，不得只在无关句子上贴知识点标签。",
  verb_structure: "给词提示填空使用核心动词 cue，答案和紧邻上下文必须形成目标语态、非谓语、间接引语或特殊动词结构。",
};

const EVIDENCE_PATTERNS: Partial<Record<string, RegExp>> = {
  Can: /\bcan(?:not|'t)?\b/i,
  Could: /\bcould(?:n't| not)?\b/i,
  May: /\bmay(?: not)?\b/i,
  Might: /\bmight(?: not)?\b/i,
  Must: /\bmust(?:n't| not)?\b/i,
  "Have To": /\b(?:have|has|had) to\b/i,
  Should: /\bshould(?:n't| not)?\b/i,
  "Future with Will": /\b(?:will(?: not)?|won't)\b/i,
  "Future with Be Going To": /\b(?:am|is|are|was|were) going to\b/i,
  "Present Continuous": /\b(?:am|is|are)\b[\s\S]*\b[a-z]+ing\b/i,
  "Past Continuous": /\b(?:was|were)\b[\s\S]*\b[a-z]+ing\b/i,
  "Present Perfect": /\b(?:has|have)\b[\s\S]+/i,
  "Past Perfect": /\bhad\b[\s\S]+/i,
  "Present Perfect Continuous": /\b(?:has|have) been\b[\s\S]*\b[a-z]+ing\b/i,
  "Future Continuous": /\bwill be\b[\s\S]*\b[a-z]+ing\b/i,
  "Future Perfect": /\bwill have\b[\s\S]+/i,
  "There be": /\bthere (?:is|are|was|were|will be|has been|have been)\b/i,
  Too: /\btoo\b/i,
  Enough: /\benough\b/i,
  "Passive Voice": /\b(?:am|is|are|was|were|be|been|being)\b[\s\S]+/i,
  "Used To": /\bused to\b/i,
  Wish: /\bwish(?:es|ed)?\b/i,
};

function normalizeEvidence(value: string) {
  return value.toLocaleLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
}

function containsAnswer(evidence: string, answer: string) {
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}($|[^a-z])`, "i").test(evidence);
}

export function grammarExerciseFamily(label: string) {
  return FAMILY_BY_LABEL[label] ?? null;
}

export function grammarExerciseGuidance(label: string) {
  const family = grammarExerciseFamily(label);
  return family ? { family, guidance: FAMILY_GUIDANCE[family] } : null;
}

export function validateGrammarEvidence(label: string, evidenceExcerpt: string, resolvedParagraph: string, answer?: string) {
  const evidence = normalizeEvidence(evidenceExcerpt);
  const paragraph = normalizeEvidence(resolvedParagraph);
  if (!evidence || !paragraph.includes(evidence)) return "知识点证据片段必须逐字出现在题目所在段落中";
  if (evidence.split(/\s+/).length < 2) return "知识点证据至少包含两个词，必须展示答案与紧邻语法上下文";
  if (answer && !containsAnswer(evidence, normalizeEvidence(answer))) return "知识点证据必须包含该槽位的实际答案";
  const pattern = EVIDENCE_PATTERNS[label];
  if (pattern && !pattern.test(evidence)) return `知识点证据没有体现 ${label} 的必要结构`;
  return null;
}

export const grammarExerciseFamilyLabels = Object.freeze({ ...FAMILY_BY_LABEL });
