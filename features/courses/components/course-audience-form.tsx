"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, Clock3, GraduationCap, Loader2, Pencil, Plus, Search, Target, UserRound, UsersRound, X } from "lucide-react";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import { PersonEditorDialog } from "@/features/people/components/person-form-drawer";
import type { CourseAudienceDetail, EnglishLevel, PeopleListResponse, PersonProfile, PersonRole, PresetOption } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

type AudiencePerson = PersonProfile & { profileChanged?: boolean };

export function CourseAudienceForm({ courseId }: { courseId?: string }) {
  const router = useRouter();
  const createKey = useRef(crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<30 | 45 | 60 | null>(null);
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

  async function fetchPerson(id: string, role: PersonRole) {
    const response = await fetch(`/api/people?role=${role}&status=active&limit=100`);
    const data = (await response.json()) as PeopleListResponse;
    return data.people.find((person) => person.id === id) ?? null;
  }

  useEffect(() => {
    void fetch("/api/presets?kind=grammar").then((response) => response.json()).then((data: { presets?: PresetOption[] }) => setKnowledgePoints(data.presets ?? [])).catch(() => undefined);
  }, []);

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
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "授课对象加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [courseId]);

  const disabledReason = !title.trim() ? "填写课程名称" : !teacher ? "添加老师" : !students.length ? "添加学生" : !duration ? "选择时长" : !englishLevel ? "选择英语难度" : !selectedKnowledgePointIds.length ? "选择知识点" : null;

  function replacePerson(saved: PersonProfile) {
    if (saved.role === "teacher" && teacher?.id === saved.id) setTeacher(saved);
    if (saved.role === "student") setStudents((current) => current.map((person) => person.id === saved.id ? saved : person));
  }

  async function submitRequest(resetDownstream = false) {
    const payload = {
      title: title.trim(),
      teacherId: teacher!.id,
      studentIds: students.map((student) => student.id),
      durationMinutes: duration,
      englishLevel,
      knowledgePointIds: selectedKnowledgePointIds,
      ...(resetDownstream ? { resetDownstream: true } : {}),
    };
    return fetch(courseId ? `/api/courses/${courseId}/audience` : "/api/courses", {
      method: courseId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...(courseId ? {} : { "Idempotency-Key": createKey.current }) },
      body: JSON.stringify(payload),
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabledReason) return;
    setSaving(true);
    setError("");
    try {
      let response = await submitRequest(false);
      let data = (await response.json()) as { course?: { id: string }; message?: string; requiresReset?: boolean };
      if (response.status === 409 && data.requiresReset) {
        const confirmed = window.confirm("修改老师、学生、课程时长、英语难度或知识点会重置后续内容，但会保留已成功图片作为过期版本。是否继续？");
        if (!confirmed) return;
        response = await submitRequest(true);
        data = (await response.json()) as typeof data;
      }
      if (!response.ok || !data.course) throw new Error(data.message || "课程保存失败");
      router.push(`/courses/${data.course.id}/create/story-outline`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "课程保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-5xl space-y-5"><div className="skeleton h-12 rounded-md" /><div className="skeleton h-80 rounded-lg" /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <CourseCreateSteps currentStep={1} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">基础信息</h2>
        </div>
      </div>

      <form className="space-y-5" onSubmit={submit}>
        <section className="rounded-lg bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary-50 text-primary" data-testid="course-title-icon"><BookOpen className="size-4" /></span>
            <h3 className="text-sm font-semibold text-foreground">课程名称</h3>
          </div>
          <label className="block">
            <span className="sr-only">课程名称</span>
            <input
              aria-label="课程名称"
              autoFocus
              className="mt-3 min-h-12 w-full rounded-md border border-input bg-background px-4 text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary-100"
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：海底图书馆"
              value={title}
            />
          </label>
        </section>

        <section className="rounded-lg bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary-50 text-primary"><UserRound className="size-4" /></span>
              <h3 className="text-sm font-semibold text-foreground">老师</h3>
            </div>
          </div>
          <div className="mt-4">
            {teacher ? <SelectedPerson person={teacher} onEdit={() => setEditing(teacher)} onRemove={() => setTeacher(null)} /> : <AddPersonButton label="添加老师" onClick={() => setPickerRole("teacher")} />}
          </div>
        </section>

        <section className="rounded-lg bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary-50 text-primary"><UsersRound className="size-4" /></span>
              <h3 className="text-sm font-semibold text-foreground">学生</h3>
            </div>
            <span className="text-xs text-muted-foreground">{students.length ? `${students.length} 位` : "未选择"}</span>
          </div>
          <div className="mt-4 space-y-2">
            {students.map((student) => <SelectedPerson key={student.id} person={student} onEdit={() => setEditing(student)} onRemove={() => setStudents((current) => current.filter((person) => person.id !== student.id))} />)}
            <AddPersonButton label={students.length ? "继续添加学生" : "添加学生"} onClick={() => setPickerRole("student")} />
          </div>
        </section>

        <section className="rounded-lg bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary-50 text-primary"><Clock3 className="size-4" /></span>
            <h3 className="text-sm font-semibold text-foreground">课程时长</h3>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-muted p-1">
            {([30, 45, 60] as const).map((value) => <button aria-pressed={duration === value} className={cn("min-h-11 rounded-md px-3 text-sm font-medium transition-colors", duration === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")} key={value} onClick={() => setDuration(value)} type="button">{value} 分钟</button>)}
          </div>
        </section>

        <section className="rounded-lg bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-md bg-primary-50 text-primary"><GraduationCap className="size-4" /></span><div><h3 className="text-sm font-semibold text-foreground">英语难度</h3><p className="mt-0.5 text-xs text-muted-foreground">用于计算正文词数，并帮助 AI 控制知识密度。</p></div></div>
          <div className="mt-4 grid grid-cols-6 gap-2">{(["A1", "A2", "B1", "B2", "C1", "C2"] as const).map((level) => <button aria-pressed={englishLevel === level} className={cn("min-h-11 rounded-md border px-3 text-sm font-semibold transition-colors", englishLevel === level ? "border-primary bg-primary-50 text-primary-700" : "border-border bg-background text-muted-foreground hover:border-primary-300 hover:text-foreground")} key={level} onClick={() => setEnglishLevel(level)} type="button">{level}</button>)}</div>
        </section>

        <section className="rounded-lg bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-md bg-primary-50 text-primary"><Target className="size-4" /></span><div><h3 className="text-sm font-semibold text-foreground">全课知识点</h3><p className="mt-0.5 text-xs text-muted-foreground">明确教学目标；AI 会在下一步按章节智能匹配。</p></div></div><Button onClick={() => setKnowledgePickerOpen(true)} type="button" variant="outline">选择知识点</Button></div>
          <div className="mt-4 flex min-h-12 flex-wrap gap-2 rounded-md bg-muted/45 p-3">{selectedKnowledgePointIds.length ? selectedKnowledgePointIds.map((id) => { const point = knowledgePoints.find((item) => item.id === id); return point ? <span className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm shadow-sm" key={id}>{point.label}<button aria-label={`移除${point.label}`} onClick={() => setSelectedKnowledgePointIds((current) => current.filter((item) => item !== id))} type="button"><X className="size-3.5 text-muted-foreground" /></button></span> : null; }) : <span className="text-sm text-muted-foreground">至少选择 1 个知识点</span>}</div>
          {selectedKnowledgePointIds.length > 10 ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">已选择 {selectedKnowledgePointIds.length} 个知识点，知识密度可能偏高。AI 会优先匹配适合各章节的重点，未推荐内容可在配置页调整。</p> : null}
        </section>

        {error ? <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}

        <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 shadow-md sm:px-5">
          <p className="text-sm text-muted-foreground">{disabledReason ? `还需：${disabledReason}` : `已选择 1 位老师、${students.length} 位学生`}</p>
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
        />
      ) : null}
      {knowledgePickerOpen ? <KnowledgePointPicker knowledgePoints={knowledgePoints} onClose={() => setKnowledgePickerOpen(false)} onConfirm={(ids) => { setSelectedKnowledgePointIds(ids); setKnowledgePickerOpen(false); }} selectedIds={selectedKnowledgePointIds} /> : null}
      <PersonEditorDialog defaultRole={editing?.role ?? "student"} key={editing?.id ?? "closed-course-person-form"} onClose={() => setEditing(null)} onSaved={replacePerson} open={Boolean(editing)} person={editing} />
    </div>
  );
}

function KnowledgePointPicker({ knowledgePoints, selectedIds, onClose, onConfirm }: { knowledgePoints: PresetOption[]; selectedIds: string[]; onClose: () => void; onConfirm: (ids: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set(selectedIds));
  const [activeCategory, setActiveCategory] = useState("全部");
  const categories = [...new Set(knowledgePoints.map((item) => item.category || "未分类"))];
  const filtered = knowledgePoints.filter((item) => {
    const categoryMatches = activeCategory === "全部" || (item.category || "未分类") === activeCategory;
    return categoryMatches && `${item.label} ${item.category ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  return <Dialog description="按类别选择本课教学目标。AI 只会在已选知识点中进行章节匹配。" onClose={onClose} open title="选择全课知识点"><div className="flex max-h-[70dvh] min-h-[500px] flex-col"><div className="border-b p-4"><div aria-label="知识点类别" className="mb-3 flex gap-1 overflow-x-auto rounded-md bg-muted p-1" role="tablist">{["全部", ...categories].map((category) => <button aria-selected={activeCategory === category} className={cn("min-h-9 shrink-0 rounded px-3 text-sm font-medium transition-colors", activeCategory === category ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")} key={category} onClick={() => setActiveCategory(category)} role="tab" type="button">{category}</button>)}</div><label className="relative block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus className="min-h-11 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前类别" value={query} /></label></div><div className="min-h-0 flex-1 overflow-y-auto p-4"><div className="flex flex-wrap gap-2">{filtered.map((item) => { const active = selected.has(item.id); return <button aria-pressed={active} className={cn("rounded-full border px-3 py-2 text-sm transition-colors", active ? "border-primary bg-primary-50 text-primary-700" : "border-border hover:border-primary-300")} key={item.id} onClick={() => setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} type="button">{item.label}</button>; })}</div>{!filtered.length ? <p className="py-10 text-center text-sm text-muted-foreground">当前类别没有匹配的知识点</p> : null}</div><div className="flex items-center justify-between border-t p-4"><span className="text-sm text-muted-foreground">已选择 {selected.size} 个</span><div className="flex gap-2"><Button onClick={onClose} type="button" variant="outline">取消</Button><Button disabled={!selected.size} onClick={() => onConfirm([...selected])} type="button">确认选择</Button></div></div></div></Dialog>;
}

function AddPersonButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700" onClick={onClick} type="button"><Plus className="size-4" />{label}</button>;
}

function SelectedPerson({ person, onEdit, onRemove }: { person: AudiencePerson; onEdit: () => void; onRemove: () => void }) {
  return (
    <article className="flex flex-col gap-3 rounded-md bg-muted/45 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <PersonAvatar avatarUrl={person.role === "teacher" ? person.activeVisual?.publicUrl : undefined} gender={person.gender} name={person.chineseName} seed={person.id} size={48} />
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="truncate text-sm font-semibold text-foreground">{person.chineseName}</h4><span className="text-xs text-muted-foreground">{person.englishName} · {person.age} 岁 · {person.gender === "female" ? "女" : "男"}</span>{person.profileChanged ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">档案已更新，保存后同步</span> : null}</div></div>
      </div>
      <div className="flex shrink-0 gap-1 sm:justify-end"><Button className="border-border bg-card shadow-sm hover:border-primary hover:bg-primary-50 hover:text-primary-700" onClick={onEdit} size="sm" type="button" variant="outline"><Pencil className="size-4" />编辑</Button><Button onClick={onRemove} size="icon-sm" title="移除" type="button" variant="ghost"><X className="size-4" /></Button></div>
    </article>
  );
}

function PeoplePicker({ role, selectedPeople, onClose, onConfirm }: { role: PersonRole; selectedPeople: PersonProfile[]; onClose: () => void; onConfirm: (people: PersonProfile[]) => void }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [selected, setSelected] = useState<Map<string, PersonProfile>>(() => new Map(selectedPeople.map((person) => [person.id, person])));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ role, status: "active", sort: "recent", limit: "100" });
      if (query.trim()) params.set("query", query.trim());
      try { const response = await fetch(`/api/people?${params}`, { signal: controller.signal }); const data = (await response.json()) as PeopleListResponse; if (response.ok) setPeople(data.people); } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, role]);

  function toggle(person: PersonProfile) {
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
    <Dialog description={role === "teacher" ? "选择一位老师。" : "可以选择多位学生。"} onClose={onClose} open title={role === "teacher" ? "添加老师" : "添加学生"}>
      <div className="flex max-h-[70dvh] min-h-[480px] flex-col">
        <div className="border-b border-border p-4"><label className="relative block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">搜索人物</span><input autoFocus className="min-h-11 w-full rounded-md border border-input bg-muted/40 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100" onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文名或英文名" value={query} /></label></div>
        <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {loading ? <p className="p-6 text-center text-sm text-muted-foreground">正在查找人物…</p> : people.map((person) => { const active = selected.has(person.id); return <button aria-pressed={active} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50" key={person.id} onClick={() => toggle(person)} type="button"><PersonAvatar avatarUrl={person.role === "teacher" ? person.activeVisual?.publicUrl : undefined} gender={person.gender} name={person.chineseName} seed={person.id} size={44} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{person.chineseName} <span className="font-normal text-muted-foreground">· {person.englishName}</span></span><span className="mt-1 block text-xs text-muted-foreground">{person.age} 岁 · {person.gender === "female" ? "女" : "男"} · {person.activeVisual ? "形象可用" : "未创建形象"}</span></span><span className={cn("flex size-6 items-center justify-center rounded-full border", active ? "border-primary bg-primary text-white" : "border-border")} >{active ? <Check className="size-4" /> : null}</span></button>; })}
          {!loading && !people.length ? <p className="p-8 text-center text-sm text-muted-foreground">没有找到可选人物，请先到人物档案新增。</p> : null}
        </div>
        {role === "student" ? <div className="flex items-center justify-between border-t border-border p-4"><span className="text-sm text-muted-foreground">已选择 {selected.size} 位学生</span><div className="flex gap-2"><Button onClick={onClose} type="button" variant="outline">取消</Button><Button disabled={!selected.size} onClick={() => onConfirm(Array.from(selected.values()))} type="button">确认选择</Button></div></div> : null}
      </div>
    </Dialog>
  );
}
