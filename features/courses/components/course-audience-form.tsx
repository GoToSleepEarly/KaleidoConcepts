"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, Check, Clock3, GraduationCap, Loader2, Pencil, Plus, Search, Target, Trash2, UserRound, UsersRound, X } from "lucide-react";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CourseCreateSteps, courseStageStep } from "@/features/courses/components/course-create-steps";
import { KnowledgePointPickerDialog } from "@/features/courses/components/knowledge-point-picker-dialog";
import { PersonEditorDialog } from "@/features/people/components/person-form-drawer";
import type { CourseAudienceDetail, EnglishLevel, PeopleListResponse, PersonProfile, PersonRole, PresetOption } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";
import { createRequestId } from "@/lib/utils/request-id";
import { readJsonResponse } from "@/lib/utils/response-json";

type AudiencePerson = PersonProfile & { profileChanged?: boolean };

function audienceSnapshot(values: { title: string; duration: 30 | 45 | 60 | null; englishLevel: EnglishLevel | null; teacherId: string | null; studentIds: string[]; knowledgePointIds: string[] }) {
  return JSON.stringify({ ...values, studentIds: [...values.studentIds].sort(), knowledgePointIds: [...values.knowledgePointIds].sort() });
}

export function CourseAudienceForm({ courseId }: { courseId?: string }) {
  const router = useRouter();
  const createKey = useRef(createRequestId());
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<30 | 45 | 60 | null>(60);
  const [englishLevel, setEnglishLevel] = useState<EnglishLevel | null>(null);
  const [knowledgePoints, setKnowledgePoints] = useState<PresetOption[]>([]);
  const [selectedKnowledgePointIds, setSelectedKnowledgePointIds] = useState<string[]>([]);
  const [knowledgePickerOpen, setKnowledgePickerOpen] = useState(false);
  const [teacher, setTeacher] = useState<AudiencePerson | null>(null);
  const [students, setStudents] = useState<AudiencePerson[]>([]);
  const [loading, setLoading] = useState(Boolean(courseId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pickerRole, setPickerRole] = useState<PersonRole | null>(null);
  const [editing, setEditing] = useState<PersonProfile | null>(null);
  const [returnToPickerRole, setReturnToPickerRole] = useState<PersonRole | null>(null);
  const [furthestStep, setFurthestStep] = useState(1);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(courseId ? null : "");
  const [downstreamChoice, setDownstreamChoice] = useState<{ targetPath?: string; affectedResources: string[] } | null>(null);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null);
  const [missingPeopleRoles, setMissingPeopleRoles] = useState<PersonRole[]>([]);
  const [personNotice, setPersonNotice] = useState("");

  const currentSnapshot = audienceSnapshot({ title, duration, englishLevel, teacherId: teacher?.id ?? null, studentIds: students.map((student) => student.id), knowledgePointIds: selectedKnowledgePointIds });
  const hasUnsavedChanges = Boolean(courseId && savedSnapshot !== null && currentSnapshot !== savedSnapshot);

  async function fetchPerson(id: string, role: PersonRole) {
    const response = await fetch(`/api/people?role=${role}&status=active&pageSize=100`);
    const data = (await response.json()) as PeopleListResponse;
    return data.people.find((person) => person.id === id) ?? null;
  }

  useEffect(() => {
    void fetch("/api/presets?kind=grammar").then((response) => response.json()).then((data: { presets?: PresetOption[] }) => setKnowledgePoints(data.presets ?? [])).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (courseId) return;
    let active = true;
    async function checkPeople() {
      try {
        const roles = await Promise.all((["teacher", "student"] as const).map(async (role) => {
          const response = await fetch(`/api/people?role=${role}&status=active&pageSize=1`);
          const data = (await response.json()) as Partial<PeopleListResponse>;
          if (!response.ok) return null;
          const count = typeof data.total === "number" ? data.total : data.people?.length;
          return count === 0 ? role : null;
        }));
        if (active) setMissingPeopleRoles(roles.filter((role): role is PersonRole => Boolean(role)));
      } catch {
        // 人物查询失败不伪装成空数据；选择器仍会展示自己的可恢复加载结果。
      }
    }
    void checkPeople();
    return () => { active = false; };
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/courses/${courseId}/audience`);
        const data = (await response.json()) as { audience?: CourseAudienceDetail; message?: string };
        if (!response.ok || !data.audience) throw new Error(data.message || "授课对象加载失败");
        const audience = data.audience;
        const live = await Promise.all(audience.people.map((person) => fetchPerson(person.personId, person.role)));
        if (!active) return;
        const mapped = audience.people.map((person, index): AudiencePerson => live[index] ?? {
          id: person.personId,
          role: person.role,
          chineseName: person.chineseName,
          englishName: person.englishName,
          age: person.age,
          gender: person.gender,
          activeVisual: person.visualUrl && person.visualAssetId ? { id: person.visualAssetId, publicUrl: person.visualUrl, sourceMode: "description", createdAt: "" } : null,
          visualStatus: person.visualUrl ? "ready" : "missing",
          createdAt: "",
          updatedAt: "",
          profileChanged: person.profileChanged,
        });
        setTitle(audience.title);
        setDuration(audience.durationMinutes);
        setEnglishLevel(audience.englishLevel);
        setSelectedKnowledgePointIds(audience.knowledgePointIds ?? []);
        setTeacher(mapped.find((person) => person.role === "teacher") ?? null);
        setStudents(mapped.filter((person) => person.role === "student"));
        setFurthestStep(courseStageStep(audience.currentStage));
        setSavedSnapshot(audienceSnapshot({ title: audience.title, duration: audience.durationMinutes, englishLevel: audience.englishLevel, teacherId: mapped.find((person) => person.role === "teacher")?.id ?? null, studentIds: mapped.filter((person) => person.role === "student").map((person) => person.id), knowledgePointIds: audience.knowledgePointIds ?? [] }));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "授课对象加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [courseId]);

  const disabledReason = !title.trim() ? "填写课程名称" : !teacher ? "添加老师" : !teacher.activeVisual ? "完善老师形象" : !students.length ? "添加学生" : students.some((student) => !student.activeVisual) ? "完善学生形象" : !duration ? "选择时长" : !englishLevel ? "选择英语难度" : !selectedKnowledgePointIds.length ? "选择知识点" : null;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (hasUnsavedChanges) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasUnsavedChanges]);

  function replacePerson(saved: PersonProfile) {
    if (saved.role === "teacher" && teacher?.id === saved.id) setTeacher(saved);
    if (saved.role === "student") setStudents((current) => current.map((person) => person.id === saved.id ? saved : person));
    setPersonNotice(`${saved.chineseName}的人物资料已更新`);
  }

  async function submitRequest(preserveDownstream = false) {
    const payload = {
      title: title.trim(),
      teacherId: teacher!.id,
      studentIds: students.map((student) => student.id),
      durationMinutes: duration,
      englishLevel,
      knowledgePointIds: selectedKnowledgePointIds,
      ...(preserveDownstream ? { preserveDownstream: true } : {}),
    };
    return fetch(courseId ? `/api/courses/${courseId}/audience` : "/api/courses", {
      method: courseId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...(courseId ? {} : { "Idempotency-Key": createKey.current }) },
      body: JSON.stringify(payload),
    });
  }

  async function saveAndNavigate(targetPath?: string, preserveDownstream = false) {
    if (disabledReason) { setError(`还需：${disabledReason}，当前修改尚未保存。`); return; }
    setSaving(true);
    setError("");
    try {
      const response = await submitRequest(preserveDownstream);
      const data = await readJsonResponse<{ course?: { id: string }; message?: string; requiresReset?: boolean; affectedResources?: string[] }>(response);
      if (response.status === 409 && data.requiresReset) {
        setDownstreamChoice({ targetPath, affectedResources: data.affectedResources ?? ["故事大纲", "教学规划", "文案与练习", "视觉资源和图片", "预览发布设置"] });
        return;
      }
      if (!response.ok || !data.course) throw new Error(data.message || "课程保存失败");
      setSavedSnapshot(currentSnapshot);
      router.push(targetPath ?? `/courses/${data.course.id}/create/story-outline`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "课程保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await saveAndNavigate();
  }

  if (loading) return <div className="mx-auto max-w-5xl space-y-5"><div className="skeleton h-12 rounded-md" /><div className="skeleton h-80 rounded-lg" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <CourseCreateSteps courseId={courseId} currentStep={1} furthestStep={furthestStep} onNavigate={(href) => { if (hasUnsavedChanges) setPendingNavigationHref(href); else router.push(href); }} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">基础信息</h2>
        </div>
      </div>

      {missingPeopleRoles.length ? (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between" role="status">
          <div>
            <p className="font-semibold text-amber-950">
              {missingPeopleRoles.length === 2
                ? "创建课程前，请先创建老师和学生人物，并完成人物形象"
                : `创建课程前，请先创建${missingPeopleRoles[0] === "teacher" ? "老师" : "学生"}人物，并完成人物形象`}
            </p>
            <p className="mt-1 text-sm text-amber-800">人物形象设为当前形象后，才能加入课程。</p>
          </div>
          <Button asChild className="shrink-0"><Link href="/people">前往人物档案</Link></Button>
        </div>
      ) : null}

      {personNotice ? <div aria-live="polite" className="rounded-md bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status">{personNotice}</div> : null}

      <form className="space-y-4" onSubmit={submit}>
        <AudienceSection icon={<BookOpen className="size-4" />} title="课程名称">
          <label className="block">
            <span className="sr-only">课程名称</span>
            <input
              aria-label="课程名称"
              autoFocus
              className="min-h-12 w-full rounded-md border border-input bg-background px-4 text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary-100"
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：海底图书馆"
              value={title}
            />
          </label>
        </AudienceSection>

        <AudienceSection icon={<UserRound className="size-4" />} title="老师">
          <div>
            {teacher ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><SelectedPerson person={teacher} onEdit={() => setEditing(teacher)} onRemove={() => setTeacher(null)} /></div> : <AddPersonButton label="添加老师" onClick={() => setPickerRole("teacher")} />}
          </div>
        </AudienceSection>

        <AudienceSection icon={<UsersRound className="size-4" />} title="学生">
          <div className="space-y-3">
            {students.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{students.map((student) => <SelectedPerson key={student.id} person={student} onEdit={() => setEditing(student)} onRemove={() => setStudents((current) => current.filter((person) => person.id !== student.id))} />)}</div> : null}
            <AddPersonButton label={students.length ? "继续添加学生" : "添加学生"} onClick={() => setPickerRole("student")} />
          </div>
        </AudienceSection>

        <AudienceSection icon={<Clock3 className="size-4" />} title="课程时长">
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-1">
            {([30, 45, 60] as const).map((value) => <button aria-pressed={duration === value} className={cn("min-h-11 rounded-md px-3 text-sm font-medium transition-colors", duration === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")} key={value} onClick={() => setDuration(value)} type="button">{value} 分钟</button>)}
          </div>
        </AudienceSection>

        <AudienceSection icon={<GraduationCap className="size-4" />} title="英语难度">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">{(["Starter", "A1", "A2", "B1", "B2", "C1", "C2"] as const).map((level) => <button aria-pressed={englishLevel === level} className={cn("min-h-11 rounded-md border px-3 text-sm font-semibold transition-colors", englishLevel === level ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background text-muted-foreground hover:border-primary-300 hover:text-foreground")} key={level} onClick={() => setEnglishLevel(level)} type="button">{level}</button>)}</div>
        </AudienceSection>

        <AudienceSection action={<Button onClick={() => setKnowledgePickerOpen(true)} size="sm" type="button" variant="outline">选择知识点</Button>} icon={<Target className="size-4" />} title="全课知识点">
          <div className="flex min-h-12 flex-wrap gap-2 rounded-md border border-primary-100 bg-primary-50/45 p-3">{selectedKnowledgePointIds.length ? selectedKnowledgePointIds.map((id) => { const point = knowledgePoints.find((item) => item.id === id); return point ? <span className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary-800" key={id}>{knowledgePointName(point)}<button aria-label={`移除${point.labelZh ?? point.label}`} onClick={() => setSelectedKnowledgePointIds((current) => current.filter((item) => item !== id))} type="button"><X aria-hidden className="size-3.5 text-primary-600" /></button></span> : null; }) : <span className="text-sm text-muted-foreground">至少选择 1 个知识点</span>}</div>
          {selectedKnowledgePointIds.length > 10 ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">已选择 {selectedKnowledgePointIds.length} 个知识点，知识密度可能偏高。AI 会优先匹配适合各章节的重点，未推荐内容可在配置页调整。</p> : null}
        </AudienceSection>

        {error ? <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}

        <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 shadow-md sm:px-5">
          <p aria-live="polite" className={cn("text-sm font-medium", disabledReason ? "text-red-600" : "text-muted-foreground")}>{disabledReason ? `还需：${disabledReason}` : saving ? "正在保存…" : hasUnsavedChanges ? "有未确认修改" : courseId ? "当前信息已确认" : `已选择 1 位老师、${students.length} 位学生`}</p>
          <Button disabled={Boolean(disabledReason) || saving} type="submit">{saving ? <Loader2 className="size-4 animate-spin" /> : null}{saving ? "保存中" : "下一步：故事大纲"}</Button>
        </div>
      </form>

      {pickerRole ? (
        <PeoplePicker
          onClose={() => setPickerRole(null)}
          onConfirm={(selected) => {
            if (pickerRole === "teacher") setTeacher(selected[0] ?? null);
            else setStudents(selected);
            setPickerRole(null);
          }}
          role={pickerRole}
          selectedPeople={pickerRole === "teacher" ? teacher ? [teacher] : [] : students}
          onCompleteVisual={(person) => { setReturnToPickerRole(pickerRole); setPickerRole(null); setEditing(person); }}
        />
      ) : null}
      {knowledgePickerOpen ? <KnowledgePointPickerDialog description="按类别选择本课教学目标。AI 只会在已选知识点中进行章节匹配。" knowledgePoints={knowledgePoints} onClose={() => setKnowledgePickerOpen(false)} onConfirm={(ids) => { setSelectedKnowledgePointIds(ids); setKnowledgePickerOpen(false); }} selectedIds={selectedKnowledgePointIds} title="选择全课知识点" /> : null}
      {downstreamChoice ? <Dialog description="本次修改尚未保存" onClose={() => setDownstreamChoice(null)} open size="compact" title="后续内容需要更新">
        <div className="space-y-5 p-5 sm:p-6">
          <div className="space-y-2 text-pretty text-sm leading-6">
            <p className="text-muted-foreground">保存后，以下内容仍会保留修改前的版本：</p>
            <ul className="list-disc pl-5 text-foreground">{downstreamChoice.affectedResources.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-amber-950"><AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-600" /><div className="text-sm leading-6"><p className="font-semibold">系统不会自动删除这些内容</p><p className="text-amber-900">进入下一步后，请到对应阶段手动重置。</p></div></div>
          <div className="flex justify-end">
            <Button disabled={saving} onClick={() => { const choice = downstreamChoice; setDownstreamChoice(null); void saveAndNavigate(choice.targetPath, true); }} type="button">保存修改并继续</Button>
          </div>
        </div>
      </Dialog> : null}
      <Dialog onClose={() => setPendingNavigationHref(null)} open={Boolean(pendingNavigationHref)} size="compact" title="放弃未保存的修改？"><div className="space-y-5 p-5 sm:p-6"><p className="text-sm leading-6 text-muted-foreground">离开后，本页尚未确认的修改不会保留。</p><div className="flex justify-end gap-2"><Button onClick={() => setPendingNavigationHref(null)} type="button" variant="outline">继续编辑</Button><Button onClick={() => { const href = pendingNavigationHref; setPendingNavigationHref(null); if (href) router.push(href); }} type="button" variant="destructive">放弃修改并离开</Button></div></div></Dialog>
      <PersonEditorDialog defaultRole={editing?.role ?? "student"} key={editing?.id ?? "closed-course-person-form"} onClose={() => { setEditing(null); if (returnToPickerRole) setPickerRole(returnToPickerRole); setReturnToPickerRole(null); }} onSaved={replacePerson} open={Boolean(editing)} person={editing} />
    </div>
  );
}

function RequiredMark() {
  return <span aria-hidden className="ml-0.5 text-red-500">*</span>;
}

function AudienceSection({ action, children, icon, title }: { action?: React.ReactNode; children: React.ReactNode; icon: React.ReactNode; title: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b border-[#CCD8F8] bg-[#E9EEFF] px-4 py-2.5 sm:px-5" data-testid="audience-section-header">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-md bg-white/80 text-[#4659DC] ring-1 ring-[#CCD8F8]" data-testid={title === "课程名称" ? "course-title-icon" : undefined}>{icon}</span>
          <h3 className="text-balance text-sm font-bold text-[#30459E]">{title} <RequiredMark /></h3>
        </div>
        {action}
      </div>

      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function knowledgePointName(point: Pick<PresetOption, "label" | "labelZh">) {
  return point.labelZh ? `${point.labelZh} · ${point.label}` : point.label;
}

function AddPersonButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700" onClick={onClick} type="button"><Plus className="size-4" />{label}</button>;
}

function SelectedPerson({ person, onEdit, onRemove }: { person: AudiencePerson; onEdit: () => void; onRemove: () => void }) {
  return (
    <article className="relative flex min-h-32 w-full max-w-sm gap-3 rounded-lg border border-border bg-card p-3 pr-11" data-testid={`selected-person-${person.id}`}>
      <PersonAvatar avatarUrl={person.activeVisual?.publicUrl} gender={person.gender} imageHeight={120} imageWidth={80} name={person.chineseName} seed={person.id} shape={person.activeVisual ? "square" : "circle"} size={64} />
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center self-stretch rounded-md bg-primary-50/70 px-3 py-2 text-center">
        <h4 className="max-w-full truncate text-base font-bold text-foreground">{person.chineseName}</h4>
        <p className="mt-0.5 max-w-full truncate text-sm font-medium text-muted-foreground">{person.englishName}</p>
        <PersonMetaBadges person={person} />
        {person.profileChanged ? <span className="mt-2 w-fit rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">档案已更新</span> : null}
      </div>
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 flex-col gap-0.5"><Button aria-label={`编辑${person.chineseName}`} className="text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onEdit} size="icon-sm" title="编辑" type="button" variant="ghost"><Pencil className="size-3.5" /></Button><Button aria-label={`移除${person.chineseName}`} className="text-muted-foreground hover:bg-red-50 hover:text-red-600" onClick={onRemove} size="icon-sm" title="移除" type="button" variant="ghost"><Trash2 className="size-3.5" /></Button></div>
    </article>
  );
}

function PeoplePicker({ role, selectedPeople, onClose, onConfirm, onCompleteVisual }: { role: PersonRole; selectedPeople: PersonProfile[]; onClose: () => void; onConfirm: (people: PersonProfile[]) => void; onCompleteVisual: (person: PersonProfile) => void }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [selected, setSelected] = useState<Map<string, PersonProfile>>(() => new Map(selectedPeople.map((person) => [person.id, person])));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ role, status: "active", sort: "recent", pageSize: "100" });
      if (query.trim()) params.set("query", query.trim());
      try { const response = await fetch(`/api/people?${params}`, { signal: controller.signal }); const data = (await response.json()) as PeopleListResponse; if (response.ok) setPeople(data.people); } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, role]);

  function toggle(person: PersonProfile) {
    if (!person.activeVisual) return;
    if (role === "teacher") {
      onConfirm([person]);
      return;
    }
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(person.id)) next.delete(person.id);
      else next.set(person.id, person);
      return next;
    });
  }
  return (
    <Dialog onClose={onClose} open size="medium-fit" title={role === "teacher" ? "添加老师" : "添加学生"}>
      <div className="flex max-h-[70dvh] flex-col">
        <div className="border-b border-border p-4"><label className="relative block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">搜索人物</span><input autoFocus className="min-h-11 w-full rounded-md border border-input bg-muted/40 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文名或英文名" value={query} /></label></div>
        <div className="min-h-0 overflow-y-auto p-4">
          {loading ? <p className="p-6 text-center text-sm text-muted-foreground">正在查找人物…</p> : <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="person-picker-grid">{people.map((person) => { const active = selected.has(person.id); return person.activeVisual ? <button aria-label={`${active ? "取消选择" : "选择"}${person.chineseName}`} aria-pressed={active} className={cn("relative flex h-36 min-w-0 w-full self-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2", active ? "border-primary bg-primary-50/60" : "border-slate-200 bg-card hover:border-primary-300 hover:bg-primary-50/25")} data-testid={`person-picker-card-${person.id}`} key={person.id} onClick={() => toggle(person)} type="button"><PersonPickerCardContent active={active} person={person} /></button> : <article className="relative flex h-36 min-w-0 w-full self-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3" data-testid={`person-picker-card-${person.id}`} key={person.id}><PersonPickerCardContent onCompleteVisual={() => onCompleteVisual(person)} person={person} /></article>; })}</div>}
          {!loading && !people.length ? <div className="flex flex-col items-center gap-3 p-8 text-center"><p className="text-sm text-muted-foreground">没有找到可选{role === "teacher" ? "老师" : "学生"}。</p><Button asChild size="sm"><Link href="/people">前往人物档案创建{role === "teacher" ? "老师" : "学生"}</Link></Button></div> : null}
        </div>
        {role === "student" ? <div className="flex items-center justify-between border-t border-border p-4"><span className="text-sm text-muted-foreground">已选择 {selected.size} 位学生</span><div className="flex gap-2"><Button onClick={onClose} type="button" variant="outline">取消</Button><Button disabled={!selected.size} onClick={() => onConfirm(Array.from(selected.values()))} type="button">确认选择</Button></div></div> : null}
      </div>
    </Dialog>
  );
}

function PersonPickerCardContent({ active = false, person, onCompleteVisual }: { active?: boolean; person: PersonProfile; onCompleteVisual?: () => void }) {
  const hasVisual = Boolean(person.activeVisual);
  return (
    <>
      <div className={cn("flex h-[108px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-md", hasVisual ? "bg-white" : "bg-[#E9EEFF]")}>
        <PersonAvatar avatarUrl={person.activeVisual?.publicUrl} gender={person.gender} imageHeight={108} imageWidth={72} name={person.chineseName} seed={person.id} shape={hasVisual ? "square" : "circle"} size={60} />
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col items-center justify-center rounded-md px-2.5 py-2 text-center", active ? "bg-white/85" : "bg-white")}>
        <h3 className="max-w-full truncate text-sm font-bold text-[#19324D]">{person.chineseName}</h3>
        <p className="mt-0.5 max-w-full truncate text-xs font-medium text-[#69829B]">{person.englishName}</p>
        <PersonMetaBadges person={person} />
        {!hasVisual ? <div className="mt-2 flex max-w-full items-center justify-center gap-1.5"><span className="truncate rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">形象未生成</span><button aria-label={`创建${person.chineseName}的形象`} className="min-h-7 shrink-0 rounded-md border border-primary-200 bg-primary-50 px-2 text-xs font-semibold text-primary-700 hover:bg-primary-100" onClick={onCompleteVisual} type="button">创建形象</button></div> : null}
      </div>
      {active ? <span aria-hidden className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-white shadow-sm"><Check className="size-3.5" /></span> : null}
    </>
  );
}

function PersonMetaBadges({ person }: { person: Pick<PersonProfile, "age" | "gender"> }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
      <span className="inline-flex rounded-full bg-[#E9EEFF] px-2.5 py-1 text-xs font-semibold text-[#30459E]">{person.age} 岁</span>
      <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", person.gender === "female" ? "bg-pink-50 text-pink-700" : "bg-sky-50 text-sky-700")}>{person.gender === "female" ? "女" : "男"}</span>
    </div>
  );
}
