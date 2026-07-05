"use client";

import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Edit3, Plus, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Gender, PersonInput, PersonProfile, PersonRole } from "@/lib/api-contract";
import { cn } from "@/lib/utils";

type PersonFormState = {
  role: PersonRole;
  name: string;
  chineseName: string;
  englishName: string;
  age: string;
  gender: Gender | "";
  appearance: string;
  interests: string[];
  learningGoal: string;
  notes: string;
};

const emptyForm: PersonFormState = {
  role: "student",
  name: "",
  chineseName: "",
  englishName: "",
  age: "",
  gender: "female",
  appearance: "",
  interests: [],
  learningGoal: "",
  notes: "",
};

const filters: Array<{ label: string; value: PersonRole }> = [
  { label: "学生", value: "student" },
  { label: "老师", value: "teacher" },
];

function toFormState(person?: PersonProfile): PersonFormState {
  if (!person) {
    return emptyForm;
  }

  return {
    role: person.role,
    name: person.name,
    chineseName: person.chineseName ?? "",
    englishName: person.englishName ?? "",
    age: person.age ? String(person.age) : "",
    gender: person.gender ?? "",
    appearance: person.appearance ?? "",
    interests: person.interests,
    learningGoal: person.learningGoal ?? "",
    notes: person.notes ?? "",
  };
}

function toPersonPayload(form: PersonFormState): PersonInput {
  if (form.role === "teacher") {
    return {
      role: "teacher",
      name: form.name.trim(),
      gender: form.gender || undefined,
      appearance: form.appearance.trim(),
      notes: form.notes.trim(),
    };
  }

  return {
    role: "student",
    chineseName: form.chineseName.trim(),
    englishName: form.englishName.trim(),
    age: Number(form.age),
    gender: (form.gender || "female") as Gender,
    appearance: form.appearance.trim(),
    interests: form.interests,
    learningGoal: form.learningGoal.trim(),
    notes: form.notes.trim(),
  };
}

function hasRequiredFields(form: PersonFormState) {
  if (form.role === "teacher") {
    return Boolean(form.name.trim());
  }

  return Boolean(
    form.chineseName.trim() &&
      form.englishName.trim() &&
      form.age.trim() &&
      Number.isFinite(Number(form.age)) &&
      form.gender &&
      form.appearance.trim(),
  );
}

export function PeopleManager() {
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [activeFilter, setActiveFilter] = useState<PersonRole>("student");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonProfile | null>(null);
  const [form, setForm] = useState<PersonFormState>(emptyForm);
  const [initialForm, setInitialForm] = useState<PersonFormState>(emptyForm);
  const [interestInput, setInterestInput] = useState("");
  const [error, setError] = useState("");

  async function loadPeople() {
    setIsLoading(true);
    setLoadError("");

    try {
      const response = await fetch("/api/people");
      if (!response.ok) {
        throw new Error("人物档案加载失败");
      }

      const data = (await response.json()) as { people: PersonProfile[] };
      setPeople(data.people);
    } catch {
      setLoadError("人物档案加载失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function loadInitialPeople() {
      try {
        const response = await fetch("/api/people");
        if (!response.ok) {
          throw new Error("人物档案加载失败");
        }

        const data = (await response.json()) as { people: PersonProfile[] };

        if (isActive) {
          setPeople(data.people);
        }
      } catch {
        if (isActive) {
          setLoadError("人物档案加载失败，请稍后重试。");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialPeople();

    return () => {
      isActive = false;
    };
  }, []);

  const visiblePeople = useMemo(() => people.filter((person) => person.role === activeFilter), [activeFilter, people]);
  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

  function openCreateDrawer(role: PersonRole = activeFilter) {
    const nextForm = { ...emptyForm, role };
    setEditingPerson(null);
    setForm(nextForm);
    setInitialForm(nextForm);
    setInterestInput("");
    setError("");
    setIsDrawerOpen(true);
  }

  function openEditDrawer(person: PersonProfile) {
    const nextForm = toFormState(person);
    setEditingPerson(person);
    setForm(nextForm);
    setInitialForm(nextForm);
    setInterestInput("");
    setError("");
    setIsDrawerOpen(true);
  }

  function requestCloseDrawer() {
    if (isDirty && !window.confirm("放弃未保存的修改？")) {
      return;
    }

    setIsDrawerOpen(false);
  }

  function addInterest() {
    const value = interestInput.trim();

    if (!value || form.interests.includes(value)) {
      setInterestInput("");
      return;
    }

    setForm((current) => ({ ...current, interests: [...current.interests, value] }));
    setInterestInput("");
  }

  function removeInterest(value: string) {
    setForm((current) => ({ ...current, interests: current.interests.filter((item) => item !== value) }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasRequiredFields(form)) {
      setError(form.role === "teacher" ? "请填写教师名称" : "请填写中文名、英文名、年龄、性别和外貌描述");
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(editingPerson ? `/api/people/${editingPerson.id}` : "/api/people", {
        method: editingPerson ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPersonPayload(form)),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "人物保存失败");
      }

      const data = (await response.json()) as { person: PersonProfile };

      if (editingPerson) {
        setPeople((current) => current.map((person) => (person.id === editingPerson.id ? data.person : person)));
      } else {
        setPeople((current) => [data.person, ...current]);
      }

      setIsDrawerOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "人物保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className="space-y-6">
        <div className="flex items-center justify-between gap-6">
          <p className="text-sm text-slate-500">维护教案和插图生成会引用的人物资料。</p>
          <Button className="bg-violet-600 text-white hover:bg-violet-700" onClick={() => openCreateDrawer()} type="button">
            <Plus className="size-4" />
            新增人物
          </Button>
        </div>

        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {filters.map((filter) => (
            <button
              className={cn(
                "h-9 rounded-md px-4 text-sm font-medium text-slate-600 transition-colors duration-200",
                activeFilter === filter.value && "bg-white text-violet-700 shadow-sm",
              )}
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 text-sm text-slate-500">正在加载人物档案...</div>
        ) : loadError ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-red-200 bg-white text-center">
            <h2 className="text-lg font-semibold text-slate-950">人物档案加载失败</h2>
            <p className="mt-2 text-sm text-slate-500">{loadError}</p>
            <Button className="mt-6" onClick={() => void loadPeople()} type="button" variant="outline">
              重试
            </Button>
          </div>
        ) : visiblePeople.length > 0 ? (
          <div className="grid grid-cols-2 gap-5 2xl:grid-cols-3">
            {visiblePeople.map((person) => (
              <PersonCard key={person.id} onEdit={openEditDrawer} person={person} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-[#E5E7EB] bg-white text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <UserRound className="size-7" />
            </div>
            <h2 className="text-lg font-semibold text-slate-950">还没有人物档案</h2>
            <p className="mt-2 text-sm text-slate-500">新增教师或学生后，即可在教案生成时引用。</p>
            <Button className="mt-6 bg-violet-600 text-white hover:bg-violet-700" onClick={() => openCreateDrawer()} type="button">
              新增人物
            </Button>
          </div>
        )}
      </section>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50">
          <button aria-label="关闭抽屉" className="absolute inset-0 bg-slate-950/20" onClick={requestCloseDrawer} type="button" />
          <aside className="absolute right-0 top-0 flex h-full w-[460px] flex-col border-l border-[#E5E7EB] bg-white shadow-xl">
            <header className="flex h-[72px] items-center justify-between border-b border-[#E5E7EB] px-6">
              <h2 className="text-lg font-semibold text-slate-950">{editingPerson ? "编辑人物" : "新增人物"}</h2>
              <button
                aria-label="关闭"
                className="flex size-9 items-center justify-center rounded-md text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700"
                onClick={requestCloseDrawer}
                type="button"
              >
                <X className="size-4" />
              </button>
            </header>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
                <RoleSelector disabled={Boolean(editingPerson)} onChange={(role) => setForm({ ...emptyForm, role })} value={form.role} />

                {form.role === "teacher" ? (
                  <>
                    <TextField label="名称" onChange={(value) => setForm((current) => ({ ...current, name: value }))} required value={form.name} />
                    <GenderSelector optional onChange={(gender) => setForm((current) => ({ ...current, gender }))} value={form.gender} />
                    <TextAreaField label="外貌描述" onChange={(value) => setForm((current) => ({ ...current, appearance: value }))} value={form.appearance} />
                    <TextAreaField label="备注" onChange={(value) => setForm((current) => ({ ...current, notes: value }))} value={form.notes} />
                  </>
                ) : (
                  <>
                    <TextField label="中文名" onChange={(value) => setForm((current) => ({ ...current, chineseName: value }))} required value={form.chineseName} />
                    <TextField label="英文名" onChange={(value) => setForm((current) => ({ ...current, englishName: value }))} required value={form.englishName} />
                    <TextField label="年龄" onChange={(value) => setForm((current) => ({ ...current, age: value }))} required type="number" value={form.age} />
                    <GenderSelector onChange={(gender) => setForm((current) => ({ ...current, gender }))} value={form.gender} />
                    <TextAreaField label="外貌描述" onChange={(value) => setForm((current) => ({ ...current, appearance: value }))} required value={form.appearance} />
                    <InterestsField
                      addInterest={addInterest}
                      interestInput={interestInput}
                      interests={form.interests}
                      removeInterest={removeInterest}
                      setInterestInput={setInterestInput}
                    />
                    <TextAreaField label="学习目标" onChange={(value) => setForm((current) => ({ ...current, learningGoal: value }))} value={form.learningGoal} />
                    <TextAreaField label="备注" onChange={(value) => setForm((current) => ({ ...current, notes: value }))} value={form.notes} />
                  </>
                )}

                {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}
              </div>

              <footer className="flex justify-end gap-3 border-t border-[#E5E7EB] px-6 py-4">
                <Button onClick={requestCloseDrawer} type="button" variant="outline">取消</Button>
                <Button className="bg-violet-600 text-white hover:bg-violet-700" disabled={isSaving} type="submit">
                  {isSaving ? "保存中..." : "保存"}
                </Button>
              </footer>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function PersonCard({ person, onEdit }: { person: PersonProfile; onEdit: (person: PersonProfile) => void }) {
  function handleEditClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onEdit(person);
  }

  return (
    <article
      className="group cursor-pointer rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
      onClick={() => onEdit(person)}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {person.avatarUrl ? (
            <Image alt="" className="size-14 rounded-full object-cover ring-4 ring-slate-50" height={56} src={person.avatarUrl} width={56} />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-full bg-violet-50 text-violet-700 ring-4 ring-slate-50">
              <UserRound className="size-6" />
            </div>
          )}
          <div>
            <div className="mb-1 inline-flex h-6 items-center rounded-full bg-slate-100 px-2 text-xs font-medium text-slate-600">
              {person.role === "teacher" ? "教师" : "学生"}
            </div>
            <h2 className="text-lg font-semibold text-slate-950">{person.role === "teacher" ? person.name : person.chineseName}</h2>
            <p className="text-sm text-slate-500">{person.role === "teacher" ? person.gender ? genderCopy(person.gender) : "未填写性别" : person.englishName}</p>
            {person.role === "student" ? <p className="mt-1 text-xs text-slate-500">{person.age} 岁 · {genderCopy(person.gender)}</p> : null}
          </div>
        </div>
        <button
          aria-label="编辑人物"
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors duration-200 hover:bg-violet-50 hover:text-violet-700"
          onClick={handleEditClick}
          type="button"
        >
          <Edit3 className="size-4" />
        </button>
      </div>

      {person.role === "teacher" ? (
        <>
          <InfoBlock label="外貌描述" value={person.appearance || "暂无外貌描述"} />
          <InfoBlock label="备注" value={person.notes || "暂无备注"} />
        </>
      ) : (
        <>
          <InfoBlock label="外貌描述" value={person.appearance || "暂无外貌描述"} />
          <InterestTags interests={person.interests} />
          <InfoBlock label="学习目标" value={person.learningGoal || "暂无学习目标"} />
          <InfoBlock label="备注" value={person.notes || "暂无备注"} />
        </>
      )}
    </article>
  );
}

function RoleSelector({ value, onChange, disabled }: { value: PersonRole; onChange: (role: PersonRole) => void; disabled?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-slate-700">类型</div>
      <div className={cn("grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1", disabled && "opacity-70")}>
        {[
          { label: "学生", value: "student" },
          { label: "教师", value: "teacher" },
        ].map((item) => (
          <button
            className={cn(
              "h-9 rounded-md text-sm font-medium text-slate-600 transition-colors duration-200",
              value === item.value && "bg-white text-violet-700 shadow-sm",
            )}
            disabled={disabled}
            key={item.value}
            onClick={() => onChange(item.value as PersonRole)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GenderSelector({ value, onChange, optional }: { value: Gender | ""; onChange: (gender: Gender | "") => void; optional?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-slate-700">性别 {optional ? null : <span className="text-red-500">*</span>}</div>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
        {[
          { label: "女", value: "female" },
          { label: "男", value: "male" },
        ].map((item) => (
          <button
            className={cn(
              "h-9 rounded-md text-sm font-medium text-slate-600 transition-colors duration-200",
              value === item.value && "bg-white text-violet-700 shadow-sm",
            )}
            key={item.value}
            onClick={() => onChange(item.value as Gender)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function InterestsField({
  interests,
  interestInput,
  setInterestInput,
  addInterest,
  removeInterest,
}: {
  interests: string[];
  interestInput: string;
  setInterestInput: (value: string) => void;
  addInterest: () => void;
  removeInterest: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="interest-input">
        兴趣爱好
      </label>
      <div className="flex gap-2">
        <input
          className="h-10 min-w-0 flex-1 rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          id="interest-input"
          onChange={(event) => setInterestInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addInterest();
            }
          }}
          placeholder="输入后回车添加"
          value={interestInput}
        />
        <Button onClick={addInterest} type="button" variant="outline">添加</Button>
      </div>
      {interests.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {interests.map((interest) => (
            <button
              className="inline-flex h-7 items-center gap-1 rounded-full bg-violet-50 px-3 text-xs font-medium text-violet-700"
              key={interest}
              onClick={() => removeInterest(interest)}
              type="button"
            >
              {interest}
              <X className="size-3" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InterestTags({ interests }: { interests: string[] }) {
  const visibleInterests = interests.slice(0, 3);
  const hiddenInterestCount = Math.max(interests.length - visibleInterests.length, 0);

  return (
    <div className="mb-4 flex min-h-7 flex-wrap gap-2">
      {visibleInterests.length > 0 ? (
        <>
          {visibleInterests.map((interest) => (
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700" key={interest}>
              {interest}
            </span>
          ))}
          {hiddenInterestCount > 0 ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">+{hiddenInterestCount}</span> : null}
        </>
      ) : (
        <span className="text-xs text-slate-400">暂无兴趣爱好</span>
      )}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1 text-xs font-medium text-slate-400">{label}</div>
      <p className="line-clamp-2 min-h-10 text-sm leading-5 text-slate-700">{value}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
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
        type={type}
        value={value}
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      <textarea
        className="min-h-24 w-full resize-none rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm leading-6 outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function genderCopy(gender?: Gender) {
  if (gender === "male") {
    return "男";
  }

  if (gender === "female") {
    return "女";
  }

  return "未填写";
}
