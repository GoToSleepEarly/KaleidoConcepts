"use client";

import { FormEvent, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  IdCard,
  Languages,
  NotebookPen,
  Signature,
  UserRound,
  UsersRound,
  WandSparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PersonVisualStudio } from "@/features/people/components/person-visual-studio";
import type { Gender, PersonProfile, PersonRole } from "@/lib/contracts/api";

type FormState = {
  role: PersonRole;
  chineseName: string;
  englishName: string;
  age: string;
  gender: Gender;
  notes: string;
};

const emptyForm = (role: PersonRole): FormState => ({
  role,
  chineseName: "",
  englishName: "",
  age: "",
  gender: "female",
  notes: "",
});

export function PersonEditorDialog({
  open,
  person,
  defaultRole = "student",
  onClose,
  onSaved,
}: {
  open: boolean;
  person: PersonProfile | null;
  defaultRole?: PersonRole;
  onClose: () => void;
  onSaved: (person: PersonProfile) => void;
}) {
  const [workingPerson, setWorkingPerson] = useState<PersonProfile | null>(
    person,
  );
  const [activeTab, setActiveTab] = useState<"profile" | "visual">("profile");
  const [form, setForm] = useState<FormState>(() =>
    person
      ? {
          role: person.role,
          chineseName: person.chineseName,
          englishName: person.englishName,
          age: String(person.age),
          gender: person.gender,
          notes: person.notes ?? "",
        }
      : emptyForm(defaultRole),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const age = Number(form.age);
    if (
      !form.chineseName.trim() ||
      !form.englishName.trim() ||
      !Number.isInteger(age) ||
      age < 0 ||
      age > 99
    ) {
      setError("请完整填写中文名、英文名和 0–99 岁的年龄");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        ...(workingPerson ? {} : { role: form.role }),
        chineseName: form.chineseName.trim(),
        englishName: form.englishName.trim(),
        age,
        gender: form.gender,
        notes: form.notes.trim(),
      };
      const response = await fetch(
        workingPerson ? `/api/people/${workingPerson.id}` : "/api/people",
        {
          method: workingPerson ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await response.json()) as {
        person?: PersonProfile;
        message?: string;
      };
      if (!response.ok || !data.person)
        throw new Error(data.message || "保存失败");
      setWorkingPerson(data.person);
      onSaved(data.person);
      if (!workingPerson) setActiveTab("visual");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      description={
        workingPerson
          ? `${workingPerson.chineseName} · ${workingPerson.englishName}`
          : `创建${form.role === "student" ? "学生" : "老师"}档案`
      }
      icon={<UserRound className="size-5" />}
      onClose={onClose}
      open={open}
      size="medium"
      title={
        workingPerson
          ? `编辑${form.role === "student" ? "学生" : "老师"}`
          : `新增${form.role === "student" ? "学生" : "老师"}`
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 justify-center border-b border-border bg-card px-4 py-3 sm:px-6">
          <div
            aria-label="编辑内容"
            className="inline-flex w-full rounded-lg bg-muted p-1 sm:w-auto"
            role="tablist"
          >
            <TabButton
              active={activeTab === "profile"}
              icon={IdCard}
              label="基础资料"
              onClick={() => setActiveTab("profile")}
            />
            <TabButton
              active={activeTab === "visual"}
              disabled={!workingPerson}
              icon={WandSparkles}
              label="人物形象"
              onClick={() => setActiveTab("visual")}
            />
          </div>
        </div>

        {activeTab === "profile" ? (
          <form
            className="flex min-h-0 flex-1 flex-col bg-card"
            onSubmit={submit}
          >
            <div className="grid min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 lg:py-8">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <IdCard className="size-5 text-primary" />
                    人物信息
                  </h3>

                  <div className="mt-5 grid gap-x-5 gap-y-5 sm:grid-cols-2">
                    <TextField
                      autoFocus
                      icon={Signature}
                      label="中文名"
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          chineseName: value,
                        }))
                      }
                      placeholder="例如：夏天"
                      value={form.chineseName}
                    />
                    <TextField
                      icon={Languages}
                      label="英文名"
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          englishName: value,
                        }))
                      }
                      placeholder="例如：Summer"
                      value={form.englishName}
                    />
                    <TextField
                      icon={CalendarDays}
                      inputMode="numeric"
                      label="年龄"
                      max={99}
                      min={0}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, age: value }))
                      }
                      type="number"
                      value={form.age}
                    />
                    <fieldset className="group">
                      <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <UsersRound className="size-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                        性别{" "}
                        <span className="text-primary" aria-hidden="true">
                          *
                        </span>
                      </legend>
                      <div className="grid grid-cols-2 gap-2">
                        {(["female", "male"] as const).map((gender) => (
                          <button
                            aria-pressed={form.gender === gender}
                            className={`min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${form.gender === gender ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-card text-muted-foreground hover:border-primary-300 hover:text-foreground"}`}
                            key={gender}
                            onClick={() =>
                              setForm((current) => ({ ...current, gender }))
                            }
                            type="button"
                          >
                            {gender === "female" ? "女" : "男"}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>

                  <label className="mt-6 block border-t border-border pt-5">
                    <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <NotebookPen className="size-4 text-muted-foreground" />
                      备注{" "}
                      <span className="font-normal text-muted-foreground">
                        选填
                      </span>
                    </span>
                    <textarea
                      className="min-h-24 w-full resize-y rounded-lg border border-input bg-card px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary-100"
                      maxLength={500}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="记录课堂特点、称呼偏好等补充信息"
                      value={form.notes}
                    />
                  </label>

                  {error ? (
                    <p
                      className="mt-4 rounded-lg bg-red-50 px-3.5 py-3 text-sm font-medium text-red-700"
                      role="alert"
                    >
                      {error}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border bg-card px-5 py-4 sm:px-8">
              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  className="min-h-11 flex-1 sm:min-h-10 sm:flex-none"
                  onClick={onClose}
                  type="button"
                  variant="outline"
                >
                  取消
                </Button>
                <Button
                  className="min-h-11 flex-[2] sm:min-h-10 sm:min-w-36 sm:flex-none"
                  loading={saving}
                  type="submit"
                >
                  {saving ? (
                    "保存中"
                  ) : workingPerson ? (
                    "保存修改"
                  ) : (
                    <>
                      保存并创建形象
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        ) : workingPerson ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <PersonVisualStudio
              embedded
              onChanged={() => onSaved(workingPerson)}
              onClose={onClose}
              open
              person={workingPerson}
            />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function TabButton({
  active,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: typeof IdCard;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors duration-200 sm:flex-none ${active ? "bg-card text-primary-700 shadow-sm" : "text-muted-foreground hover:text-foreground"} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
      disabled={disabled}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function TextField({
  icon: Icon,
  label,
  value,
  onChange,
  inputMode,
  placeholder,
  type = "text",
  min,
  max,
  autoFocus = false,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "numeric";
  placeholder?: string;
  type?: "text" | "number";
  min?: number;
  max?: number;
  autoFocus?: boolean;
}) {
  return (
    <label className="group block">
      <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon className="size-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
        {label}{" "}
        <span className="text-primary" aria-hidden="true">
          *
        </span>
      </span>
      <input
        autoFocus={autoFocus}
        className="min-h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary-100"
        inputMode={inputMode}
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required
        type={type}
        value={value}
      />
    </label>
  );
}
