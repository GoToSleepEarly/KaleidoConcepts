"use client";

import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Edit3, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { StudentProfile } from "@/lib/api-contract";
import { defaultStudentAvatars, mockStudents } from "@/lib/mock-course-data";
import { cn } from "@/lib/utils";

type StudentFormState = {
  chineseName: string;
  englishName: string;
  age: string;
  gender: "male" | "female";
  interests: string[];
  learningGoal: string;
  notes: string;
};

const emptyForm: StudentFormState = {
  chineseName: "",
  englishName: "",
  age: "",
  gender: "female",
  interests: [],
  learningGoal: "",
  notes: "",
};

const storageKey = "kaleido.mock.students";

function toFormState(student?: StudentProfile): StudentFormState {
  if (!student) {
    return emptyForm;
  }

  return {
    chineseName: student.chineseName,
    englishName: student.englishName,
    age: String(student.age),
    gender: student.gender,
    interests: student.interests,
    learningGoal: student.learningGoal ?? "",
    notes: student.notes ?? "",
  };
}

function toStudentPayload(form: StudentFormState) {
  return {
    chineseName: form.chineseName.trim(),
    englishName: form.englishName.trim(),
    age: Number(form.age),
    gender: form.gender,
    interests: form.interests,
    learningGoal: form.learningGoal.trim(),
    notes: form.notes.trim(),
  };
}

function hasRequiredFields(form: StudentFormState) {
  return Boolean(form.chineseName.trim() && form.englishName.trim() && form.age.trim() && Number.isFinite(Number(form.age)));
}

function createStudentFromForm(form: StudentFormState): StudentProfile {
  const now = new Date().toISOString();
  const payload = toStudentPayload(form);

  return {
    id: `student-${Date.now()}`,
    ...payload,
    name: payload.englishName,
    avatarUrl: defaultStudentAvatars[payload.gender],
    createdAt: now,
    updatedAt: now,
  };
}

export function StudentsManager() {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentProfile | null>(null);
  const [form, setForm] = useState<StudentFormState>(emptyForm);
  const [initialForm, setInitialForm] = useState<StudentFormState>(emptyForm);
  const [interestInput, setInterestInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadStudents() {
      try {
        const stored = localStorage.getItem(storageKey);

        if (stored) {
          setStudents(JSON.parse(stored) as StudentProfile[]);
          setHasLoaded(true);
          return;
        }

        const response = await fetch("/api/students");
        const data = (await response.json()) as { students: StudentProfile[] };
        setStudents(data.students);
      } catch {
        const stored = localStorage.getItem(storageKey);
        setStudents(stored ? (JSON.parse(stored) as StudentProfile[]) : mockStudents);
      } finally {
        setHasLoaded(true);
      }
    }

    void loadStudents();
  }, []);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    // TODO: 前后端联调时删除 localStorage 测试逻辑，改为真实接口持久化。
    localStorage.setItem(storageKey, JSON.stringify(students));
  }, [hasLoaded, students]);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

  function openCreateDrawer() {
    setEditingStudent(null);
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setInterestInput("");
    setError("");
    setIsDrawerOpen(true);
  }

  function openEditDrawer(student: StudentProfile) {
    const nextForm = toFormState(student);
    setEditingStudent(student);
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
      setError("请填写中文名、英文名、年龄和性别");
      return;
    }

    setError("");
    const payload = toStudentPayload(form);

    if (editingStudent) {
      const updated: StudentProfile = {
        ...editingStudent,
        ...payload,
        name: payload.englishName,
        avatarUrl: defaultStudentAvatars[payload.gender],
        updatedAt: new Date().toISOString(),
      };

      await fetch(`/api/students/${editingStudent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setStudents((current) => current.map((student) => (student.id === editingStudent.id ? updated : student)));
      setIsDrawerOpen(false);
      return;
    }

    const created = createStudentFromForm(form);

    await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setStudents((current) => [created, ...current]);
    setIsDrawerOpen(false);
  }

  return (
    <>
      <section className="space-y-6">
        <div className="flex items-center justify-between gap-6">
          <p className="text-sm text-slate-500">管理可用于课程创建的学生档案。</p>
          <Button className="bg-violet-600 text-white hover:bg-violet-700" onClick={openCreateDrawer} type="button">
            <Plus className="size-4" />
            新增学生
          </Button>
        </div>

        {students.length > 0 ? (
          <div className="grid grid-cols-2 gap-5 2xl:grid-cols-3">
            {students.map((student) => (
              <StudentCard key={student.id} onEdit={openEditDrawer} student={student} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-[#E5E7EB] bg-white text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <Plus className="size-7" />
            </div>
            <h2 className="text-lg font-semibold text-slate-950">还没有学生</h2>
            <p className="mt-2 text-sm text-slate-500">新增学生后，即可在创建课程时选择。</p>
            <Button className="mt-6 bg-violet-600 text-white hover:bg-violet-700" onClick={openCreateDrawer} type="button">
              新增学生
            </Button>
          </div>
        )}
      </section>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50">
          <button aria-label="关闭抽屉" className="absolute inset-0 bg-slate-950/20" onClick={requestCloseDrawer} type="button" />
          <aside className="absolute right-0 top-0 flex h-full w-[460px] flex-col border-l border-[#E5E7EB] bg-white shadow-xl">
            <header className="flex h-[72px] items-center justify-between border-b border-[#E5E7EB] px-6">
              <h2 className="text-lg font-semibold text-slate-950">{editingStudent ? "编辑学生" : "新增学生"}</h2>
              <button
                className="flex size-9 items-center justify-center rounded-md text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700"
                onClick={requestCloseDrawer}
                type="button"
              >
                <X className="size-4" />
              </button>
            </header>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
                <TextField label="中文名" onChange={(value) => setForm((current) => ({ ...current, chineseName: value }))} required value={form.chineseName} />
                <TextField label="英文名" onChange={(value) => setForm((current) => ({ ...current, englishName: value }))} required value={form.englishName} />
                <TextField label="年龄" onChange={(value) => setForm((current) => ({ ...current, age: value }))} required type="number" value={form.age} />

                <div>
                  <div className="mb-2 text-sm font-medium text-slate-700">性别 <span className="text-red-500">*</span></div>
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                    {[
                      { label: "女", value: "female" },
                      { label: "男", value: "male" },
                    ].map((item) => (
                      <button
                        className={cn(
                          "h-9 rounded-md text-sm font-medium text-slate-600 transition-colors duration-200",
                          form.gender === item.value && "bg-white text-violet-700 shadow-sm",
                        )}
                        key={item.value}
                        onClick={() => setForm((current) => ({ ...current, gender: item.value as "male" | "female" }))}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

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
                  {form.interests.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {form.interests.map((interest) => (
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

                <TextAreaField label="学习目标" onChange={(value) => setForm((current) => ({ ...current, learningGoal: value }))} value={form.learningGoal} />
                <TextAreaField label="备注" onChange={(value) => setForm((current) => ({ ...current, notes: value }))} value={form.notes} />

                {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}
              </div>

              <footer className="flex justify-end gap-3 border-t border-[#E5E7EB] px-6 py-4">
                <Button onClick={requestCloseDrawer} type="button" variant="outline">取消</Button>
                <Button className="bg-violet-600 text-white hover:bg-violet-700" type="submit">保存</Button>
              </footer>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function StudentCard({ student, onEdit }: { student: StudentProfile; onEdit: (student: StudentProfile) => void }) {
  const visibleInterests = student.interests.slice(0, 3);
  const hiddenInterestCount = Math.max(student.interests.length - visibleInterests.length, 0);

  function handleEditClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onEdit(student);
  }

  return (
    <article
      className="group cursor-pointer rounded-lg border border-[#E5E7EB] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
      onClick={() => onEdit(student)}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Image alt="" className="size-14 rounded-full object-cover ring-4 ring-slate-50" height={56} src={student.avatarUrl} width={56} />
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{student.chineseName}</h2>
            <p className="text-sm text-slate-500">{student.englishName}</p>
            <p className="mt-1 text-xs text-slate-500">{student.age} 岁 · {student.gender === "male" ? "男" : "女"}</p>
          </div>
        </div>
        <button
          aria-label="编辑学生"
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors duration-200 hover:bg-violet-50 hover:text-violet-700"
          onClick={handleEditClick}
          type="button"
        >
          <Edit3 className="size-4" />
        </button>
      </div>

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

      <InfoBlock label="学习目标" value={student.learningGoal || "暂无学习目标"} />
      <InfoBlock label="备注" value={student.notes || "暂无备注"} />
    </article>
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

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <textarea
        className="min-h-24 w-full resize-none rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm leading-6 outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
