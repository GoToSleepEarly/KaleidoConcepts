"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Plus, X } from "lucide-react";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type { CourseBasicDetail, CourseBasicInput, EnglishLevel, PersonProfile, PresetOption, StoryIdeaMode } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

const englishLevels: EnglishLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const durations = [30, 45, 60] as const;

type FormState = {
  title: string;
  teacherId: string;
  studentIds: string[];
  englishLevel: EnglishLevel;
  durationMinutes: 30 | 45 | 60;
  theme: string;
  grammar: string[];
  storyIdeaMode: StoryIdeaMode;
  storyIdea: string;
};

const emptyForm: FormState = {
  title: "",
  teacherId: "",
  studentIds: [],
  englishLevel: "A1",
  durationMinutes: 45,
  theme: "",
  grammar: [],
  storyIdeaMode: "ai",
  storyIdea: "",
};

function toFormState(course?: CourseBasicDetail): FormState {
  if (!course) {
    return emptyForm;
  }

  return {
    title: course.title,
    teacherId: course.teacherId,
    studentIds: course.studentIds,
    englishLevel: course.englishLevel,
    durationMinutes: course.durationMinutes,
    theme: course.theme,
    grammar: course.grammar,
    storyIdeaMode: course.storyIdeaMode,
    storyIdea: course.storyIdea ?? "",
  };
}

function toPayload(form: FormState): CourseBasicInput {
  return {
    title: form.title.trim(),
    teacherId: form.teacherId,
    studentIds: form.studentIds,
    englishLevel: form.englishLevel,
    durationMinutes: form.durationMinutes,
    theme: form.theme.trim(),
    grammar: form.grammar.map((item) => item.trim()).filter(Boolean),
    storyIdeaMode: form.storyIdeaMode,
    storyIdea: form.storyIdea.trim(),
  };
}

function validateForm(form: FormState) {
  if (!form.title.trim()) {
    return "请填写课程标题";
  }

  if (!form.teacherId) {
    return "请选择老师";
  }

  if (form.studentIds.length < 1) {
    return "请至少选择 1 个学生";
  }

  if (!form.theme.trim()) {
    return "请选择或输入主题";
  }

  if (form.grammar.length < 1) {
    return "请至少选择或输入 1 个语法点";
  }

  if (form.storyIdeaMode === "manual" && !form.storyIdea.trim()) {
    return "请填写故事大纲";
  }

  return "";
}

export function CourseBasicForm({ courseId }: { courseId?: string }) {
  const router = useRouter();
  const [teachers, setTeachers] = useState<PersonProfile[]>([]);
  const [students, setStudents] = useState<PersonProfile[]>([]);
  const [themePresets, setThemePresets] = useState<string[]>([]);
  const [grammarPresets, setGrammarPresets] = useState<PresetOption[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [customTheme, setCustomTheme] = useState("");
  const [customGrammar, setCustomGrammar] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(courseId));
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const submitLabel = courseId ? "保存并继续" : "保存并生成故事方案";

  const themeOptions = useMemo(
    () => (form.theme && !themePresets.includes(form.theme) ? [...themePresets, form.theme] : themePresets),
    [form.theme, themePresets],
  );
  const grammarCategories = useMemo(() => {
    const groups = new Map<string, PresetOption[]>();
    for (const preset of grammarPresets) {
      const category = preset.category ?? "其他";
      const bucket = groups.get(category);
      if (bucket) {
        bucket.push(preset);
      } else {
        groups.set(category, [preset]);
      }
    }
    return [...groups.entries()].map(([category, presets]) => ({ category, presets }));
  }, [grammarPresets]);
  const knownGrammarLabels = useMemo(() => new Set(grammarPresets.map((preset) => preset.label)), [grammarPresets]);
  const customGrammarItems = useMemo(
    () => form.grammar.filter((item) => !knownGrammarLabels.has(item)),
    [form.grammar, knownGrammarLabels],
  );
  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { category, presets } of grammarCategories) {
      counts.set(category, presets.filter((preset) => form.grammar.includes(preset.label)).length);
    }
    return counts;
  }, [grammarCategories, form.grammar]);

  useEffect(() => {
    let isActive = true;

    async function loadData() {
      setIsLoading(true);
      setLoadError("");

      try {
        const [teacherResponse, studentResponse, themeResponse, grammarResponse, courseResponse] = await Promise.all([
          fetch("/api/people?role=teacher"),
          fetch("/api/people?role=student"),
          fetch("/api/presets?kind=theme"),
          fetch("/api/presets?kind=grammar"),
          courseId ? fetch(`/api/courses/${courseId}/basic`) : Promise.resolve(null),
        ]);

        if (
          !teacherResponse.ok ||
          !studentResponse.ok ||
          !themeResponse.ok ||
          !grammarResponse.ok ||
          (courseResponse && !courseResponse.ok)
        ) {
          throw new Error("基础信息加载失败");
        }

        const teacherData = (await teacherResponse.json()) as { people: PersonProfile[] };
        const studentData = (await studentResponse.json()) as { people: PersonProfile[] };
        const themeData = (await themeResponse.json()) as { presets: PresetOption[] };
        const grammarData = (await grammarResponse.json()) as { presets: PresetOption[] };
        const courseData = courseResponse ? ((await courseResponse.json()) as { course: CourseBasicDetail }) : null;

        if (isActive) {
          setTeachers(teacherData.people);
          setStudents(studentData.people);
          setThemePresets(themeData.presets.map((preset) => preset.label));
          setGrammarPresets(grammarData.presets);
          setForm(toFormState(courseData?.course));
        }
      } catch {
        if (isActive) {
          setLoadError("基础信息加载失败，请稍后重试。");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isActive = false;
    };
  }, [courseId]);

  function toggleStudent(studentId: string) {
    setForm((current) => ({
      ...current,
      studentIds: current.studentIds.includes(studentId)
        ? current.studentIds.filter((id) => id !== studentId)
        : [...current.studentIds, studentId],
    }));
  }

  function toggleGrammar(grammar: string) {
    setForm((current) => ({
      ...current,
      grammar: current.grammar.includes(grammar)
        ? current.grammar.filter((item) => item !== grammar)
        : [...current.grammar, grammar],
    }));
  }

  function addCustomTheme() {
    const value = customTheme.trim();

    if (!value) {
      return;
    }

    setForm((current) => ({ ...current, theme: value }));
    setCustomTheme("");
  }

  function addCustomGrammar() {
    const value = customGrammar.trim();

    if (!value) {
      return;
    }

    setForm((current) => ({ ...current, grammar: current.grammar.includes(value) ? current.grammar : [...current.grammar, value] }));
    setCustomGrammar("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm(form);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(courseId ? `/api/courses/${courseId}/basic` : "/api/courses", {
        method: courseId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "课程基础信息保存失败");
      }

      const data = (await response.json()) as { course: { id: string } };
      router.push(`/courses/${data.course.id}/create/story-options`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "课程基础信息保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 text-sm text-slate-500">正在加载基础信息...</div>;
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-950">基础信息加载失败</h2>
        <p className="mt-2 text-sm text-slate-500">{loadError}</p>
        <Button className="mt-6" onClick={() => window.location.reload()} type="button" variant="outline">
          重新加载
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <CourseCreateSteps courseId={courseId} currentStep={1} />

      <div className="flex items-start justify-between gap-6">
        <div>
          <Button asChild className="mb-4 h-9 px-3 text-sm" variant="outline">
            <Link href="/courses">
              <ArrowLeft className="size-4" />
              返回课程列表
            </Link>
          </Button>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">基础信息</h2>
          <p className="mt-2 text-sm text-slate-500">{courseId ? "保存基础信息后继续进入故事方案。" : "保存后会创建草稿课程，并进入故事方案生成。"}</p>
        </div>
        <Button className="bg-violet-600 text-white hover:bg-violet-700" disabled={isSaving} type="submit">
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>

      <section className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <TextField label="课程标题" onChange={(value) => setForm((current) => ({ ...current, title: value }))} required value={form.title} />
          <SegmentedField
            label="英语等级"
            options={englishLevels}
            renderLabel={(value) => value}
            value={form.englishLevel}
            onChange={(value) => setForm((current) => ({ ...current, englishLevel: value }))}
          />
        </div>
        <div className="mt-5">
          <SegmentedField
            label="课程时长"
            options={durations}
            renderLabel={(value) => `${value} 分钟`}
            value={form.durationMinutes}
            onChange={(value) => setForm((current) => ({ ...current, durationMinutes: value }))}
          />
        </div>
      </section>

      <PeopleSection title="选择老师" description="单选，后续生成会引用老师形象。">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {teachers.map((teacher) => (
            <PersonChoiceCard
              key={teacher.id}
              person={teacher}
              selected={form.teacherId === teacher.id}
              onClick={() => setForm((current) => ({ ...current, teacherId: teacher.id }))}
            />
          ))}
        </div>
      </PeopleSection>

      <PeopleSection title="选择学生" description="至少选择 1 个学生，AI 会结合学生画像生成故事。">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {students.map((student) => (
            <PersonChoiceCard
              key={student.id}
              person={student}
              selected={form.studentIds.includes(student.id)}
              onClick={() => toggleStudent(student.id)}
            />
          ))}
        </div>
      </PeopleSection>

      <section className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <FieldHeader description="主题是整体世界观或场景框架，本期只允许选择一个。" title="主题" />
        <div className="mt-4 flex flex-wrap gap-2">
          {themeOptions.map((theme) => (
            <ChoiceChip key={theme} selected={form.theme === theme} onClick={() => setForm((current) => ({ ...current, theme }))}>
              {theme}
            </ChoiceChip>
          ))}
        </div>
        <InlineAddField
          buttonLabel="添加主题"
          onAdd={addCustomTheme}
          onChange={setCustomTheme}
          onEnter={addCustomTheme}
          placeholder="输入自定义主题"
          value={customTheme}
        />
      </section>

      <section className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <FieldHeader description="先选择语法大类，再在展开的列表里勾选具体语法点，可跨类累加。" title="语法点" />

        {form.grammar.length ? (
          <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50/60 p-3">
            <div className="text-xs font-medium text-violet-700">已选 {form.grammar.length} 个语法点</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {form.grammar.map((grammar) => (
                <button
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-violet-500 bg-white px-3 text-xs font-medium text-violet-700 transition-colors duration-200 hover:bg-violet-100"
                  key={grammar}
                  onClick={() => toggleGrammar(grammar)}
                  type="button"
                >
                  {grammar}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {grammarCategories.map(({ category }) => {
            const selectedCount = countByCategory.get(category) ?? 0;
            return (
              <ChoiceChip
                key={category}
                selected={expandedCategory === category}
                onClick={() => setExpandedCategory((current) => (current === category ? null : category))}
              >
                {category}
                {selectedCount ? <span className="text-violet-700">· {selectedCount}</span> : null}
              </ChoiceChip>
            );
          })}
        </div>

        {expandedCategory ? (
          <div className="mt-3 rounded-lg border border-[#E5E7EB] bg-slate-50/60 p-4">
            <div className="flex flex-wrap gap-2">
              {(grammarCategories.find((group) => group.category === expandedCategory)?.presets ?? []).map((preset) => (
                <ChoiceChip key={preset.id} selected={form.grammar.includes(preset.label)} onClick={() => toggleGrammar(preset.label)}>
                  {preset.label}
                </ChoiceChip>
              ))}
            </div>
          </div>
        ) : null}

        {customGrammarItems.length ? (
          <div className="mt-3">
            <div className="text-xs font-medium text-slate-500">自定义语法点</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {customGrammarItems.map((grammar) => (
                <ChoiceChip key={grammar} selected onClick={() => toggleGrammar(grammar)}>
                  {grammar}
                </ChoiceChip>
              ))}
            </div>
          </div>
        ) : null}

        <InlineAddField
          buttonLabel="添加语法点"
          onAdd={addCustomGrammar}
          onChange={setCustomGrammar}
          onEnter={addCustomGrammar}
          placeholder="输入自定义语法点"
          value={customGrammar}
        />
      </section>

      <section className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <FieldHeader description="故事想法是当前主题下的具体故事大纲。" title="故事想法" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ModeCard
            description="老师输入具体故事大纲。"
            label="老师手动输入"
            selected={form.storyIdeaMode === "manual"}
            onClick={() => setForm((current) => ({ ...current, storyIdeaMode: "manual" }))}
          />
          <ModeCard
            description="AI 基于主题、老师、学生和语法点构思。"
            label="AI 构思"
            selected={form.storyIdeaMode === "ai"}
            onClick={() => setForm((current) => ({ ...current, storyIdeaMode: "ai" }))}
          />
        </div>
        {form.storyIdeaMode === "manual" ? (
          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium text-slate-700">
              故事大纲 <span className="text-red-500">*</span>
            </span>
            <textarea
              className="min-h-28 w-full resize-none rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm leading-6 outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              onChange={(event) => setForm((current) => ({ ...current, storyIdea: event.target.value }))}
              value={form.storyIdea}
            />
          </label>
        ) : (
          <div className="mt-4 rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-700">
            AI 会基于已选主题、老师、学生和语法点自动生成故事大纲。
          </div>
        )}
      </section>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}

      <div className="flex justify-end gap-3">
        <Button asChild type="button" variant="outline">
          <Link href="/courses">取消</Link>
        </Button>
        <Button className="bg-violet-600 text-white hover:bg-violet-700" disabled={isSaving} type="submit">
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function FieldHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function PeopleSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <FieldHeader description={description} title={title} />
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PersonChoiceCard({ person, selected, onClick }: { person: PersonProfile; selected: boolean; onClick: () => void }) {
  const displayName = person.chineseName ?? person.name;
  const roleLabel = person.role === "teacher" ? "老师" : "学生";
  const metaParts = [
    person.englishName,
    typeof person.age === "number" ? `${person.age} 岁` : null,
    person.gender === "male" ? "男" : person.gender === "female" ? "女" : null,
    roleLabel,
  ].filter(Boolean);

  return (
    <button
      className={cn(
        "relative flex min-h-32 w-full items-start gap-4 rounded-lg border border-[#E5E7EB] bg-white p-4 text-left transition duration-200 hover:border-violet-200 hover:bg-violet-50/40",
        selected && "border-violet-500 bg-violet-50 ring-2 ring-violet-100",
      )}
      onClick={onClick}
      type="button"
    >
      <PersonAvatar avatarUrl={person.avatarUrl} gender={person.gender} name={displayName} seed={person.id} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-semibold text-slate-950">{displayName}</h4>
          {selected ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white">
              <Check className="size-3" />
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-slate-500">{metaParts.join(" · ")}</p>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{person.appearance || "暂无外貌描述"}</p>
      </div>
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      <input
        className="h-10 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function SegmentedField<T extends string | number>({
  label,
  options,
  value,
  onChange,
  renderLabel,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  renderLabel: (value: T) => string;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-slate-700">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            className={cn(
              "h-9 rounded-lg border border-[#E5E7EB] px-3 text-sm font-medium text-slate-600 transition-colors duration-200 hover:border-violet-200 hover:text-violet-700",
              value === option && "border-violet-500 bg-violet-50 text-violet-700",
            )}
            key={String(option)}
            onClick={() => onChange(option)}
            type="button"
          >
            {renderLabel(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full border border-[#E5E7EB] px-3 text-xs font-medium text-slate-600 transition-colors duration-200 hover:border-violet-200 hover:text-violet-700",
        selected && "border-violet-500 bg-violet-50 text-violet-700",
      )}
      onClick={onClick}
      type="button"
    >
      {selected ? <Check className="size-3" /> : null}
      {children}
    </button>
  );
}

function InlineAddField({
  value,
  onChange,
  onAdd,
  onEnter,
  placeholder,
  buttonLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  onEnter: () => void;
  placeholder: string;
  buttonLabel: string;
}) {
  return (
    <div className="mt-4 flex max-w-xl gap-2">
      <input
        className="h-10 min-w-0 flex-1 rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter();
          }
        }}
        placeholder={placeholder}
        value={value}
      />
      <Button onClick={onAdd} type="button" variant="outline">
        <Plus className="size-4" />
        {buttonLabel}
      </Button>
    </div>
  );
}

function ModeCard({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-lg border border-[#E5E7EB] p-4 text-left transition duration-200 hover:border-violet-200 hover:bg-violet-50/40",
        selected && "border-violet-500 bg-violet-50 ring-2 ring-violet-100",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-950">{label}</span>
        {selected ? <X className="size-4 rotate-45 text-violet-700" /> : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </button>
  );
}
