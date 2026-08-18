"use client";

import React from "react";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Pencil, Plus, Search, Trash2, UsersRound } from "lucide-react";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonEditorDialog } from "@/features/people/components/person-form-drawer";
import type { PeopleListResponse, PersonProfile, PersonRole } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

export function PeopleManager() {
  const [role, setRole] = useState<PersonRole>("student");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PersonProfile | null>(null);
  const [personToDelete, setPersonToDelete] = useState<PersonProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [previewPerson, setPreviewPerson] = useState<PersonProfile | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ role, status: "active", sort: "recent", page: String(page), pageSize: "6" });
      if (query.trim()) params.set("query", query.trim());
      const response = await fetch(`/api/people?${params}`, { signal });
      const data = (await response.json()) as PeopleListResponse & { message?: string };
      if (!response.ok) throw new Error(data.message || "人物档案加载失败");
      setPeople(data.people);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "人物档案加载失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, query, role]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(person: PersonProfile) {
    setEditing(person);
    setFormOpen(true);
  }

  async function deletePerson() {
    if (!personToDelete) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/people/${personToDelete.id}/archive`, { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message || "删除失败，请重试");
      }
      const nextTotal = Math.max(0, total - 1);
      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / 6));
      setPeople((current) => current.filter((person) => person.id !== personToDelete.id));
      setTotal(nextTotal);
      setTotalPages(nextTotalPages);
      setPersonToDelete(null);
      if (page > nextTotalPages) setPage(nextTotalPages);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "删除失败，请重试");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <section>
        <div className="flex flex-col gap-3 rounded-xl border border-[#CCD8F8] bg-[#E9EEFF] p-3 shadow-[0_2px_8px_rgba(46,78,108,0.08)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-lg bg-white/55 p-1" role="tablist" aria-label="人物类型">
            {(["student", "teacher"] as const).map((value) => (
              <button
                aria-selected={role === value}
                className={cn("min-h-9 rounded-lg px-5 text-sm font-semibold transition-colors", role === value ? "bg-[#5365EC] text-white shadow-sm" : "text-[#30459E] hover:bg-white/80 hover:text-[#20327F]")}
                key={value}
                onClick={() => { setRole(value); setPage(1); }}
                role="tab"
                type="button"
              >
                {value === "student" ? "学生" : "老师"}
              </button>
            ))}
          </div>

          <div className="flex flex-1 gap-3 sm:max-w-xl sm:justify-end">
            <label className="relative flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <span className="sr-only">搜索人物</span>
              <input
                className="min-h-10 w-full rounded-md border border-input bg-muted/40 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary-100"
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                placeholder="搜索中文名或英文名"
                value={query}
              />
            </label>
            <Button className="shrink-0" onClick={openCreate} type="button"><Plus className="size-4" />新增{role === "student" ? "学生" : "老师"}</Button>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {loading ? Array.from({ length: 3 }).map((_, index) => <PersonRowSkeleton key={index} />) : null}
          {!loading && people.map((person) => (
            <article className="group flex min-h-[190px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-[#BFC9F7] hover:shadow-sm" key={person.id}>
              <div className="flex flex-1 items-center gap-4 bg-[#F8FBFE] px-4 py-3">
                {person.activeVisual ? (
                  <button aria-label={`查看${person.chineseName}大图`} className="group/image relative flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden bg-white outline-none focus-visible:ring-2 focus-visible:ring-[#5365EC]" onClick={() => setPreviewPerson(person)} type="button">
                    <PersonAvatar avatarUrl={person.activeVisual.publicUrl} gender={person.gender} imageHeight={144} imageWidth={96} name={person.chineseName} seed={person.id} shape="square" size={64} />
                    <span className="absolute inset-x-0 top-0 flex items-center justify-center gap-1 bg-slate-950/65 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover/image:opacity-100 group-focus-visible/image:opacity-100"><Expand className="size-3.5" />查看大图</span>
                  </button>
                ) : (
                  <div className="flex size-24 shrink-0 items-center justify-center">
                    <PersonAvatar gender={person.gender} name={person.chineseName} seed={person.id} size={72} />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
                  <h3 className="truncate text-base font-bold text-[#19324D]">{person.chineseName}</h3>
                  <p className="mt-0.5 truncate text-sm font-medium text-[#69829B]">{person.englishName}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-flex rounded-full bg-[#E9EEFF] px-2.5 py-1 text-xs font-semibold text-[#30459E]">{person.age} 岁</span>
                    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", person.gender === "female" ? "bg-pink-50 text-pink-700" : "bg-sky-50 text-sky-700")}>{person.gender === "female" ? "女" : "男"}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-[#E5EFF7] bg-white px-3 py-2.5">
                <Button className="hover:border-[#BFC9F7] hover:bg-[#EEF0FF] hover:text-[#4659DC]" onClick={() => openEdit(person)} size="sm" type="button" variant="outline"><Pencil className="size-4" />编辑</Button>
                <Button aria-label={`删除${person.chineseName}`} className="text-slate-500 hover:bg-red-50 hover:text-red-600" onClick={() => { setDeleteError(""); setPersonToDelete(person); }} size="sm" type="button" variant="ghost"><Trash2 className="size-4" />删除</Button>
              </div>
            </article>
          ))}
        </div>

        {!loading && !people.length ? (
          <div className="mt-4 rounded-xl bg-white p-8">
            <EmptyState
              action={<Button onClick={openCreate}><Plus className="size-4" />新增人物</Button>}
              description={query ? "试试其他关键词。" : "新增后即可在课程中选择。"}
              icon={UsersRound}
              title={query ? "没有找到人物" : "还没有人物"}
            />
          </div>
        ) : null}

        {!loading && total > 0 ? (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
            <span className="text-sm text-slate-500">共 {total} 人</span>
            <div className="flex items-center gap-2">
              <Button aria-label="上一页" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} size="icon-sm" type="button" variant="outline"><ChevronLeft className="size-4" /></Button>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600"><span className="sr-only">选择页码</span><select aria-label="选择页码" className="h-8 rounded-md border border-[#D7E5F1] bg-white px-2 text-sm font-semibold text-[#38536E] outline-none focus:border-[#5365EC] focus:ring-2 focus:ring-[#DDE2FF]" onChange={(event) => setPage(Number(event.target.value))} value={page}>{Array.from({ length: totalPages }, (_, index) => <option key={index + 1} value={index + 1}>第 {index + 1} 页</option>)}</select><span>/ {totalPages} 页</span></label>
              <Button aria-label="下一页" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} size="icon-sm" type="button" variant="outline"><ChevronRight className="size-4" /></Button>
            </div>
          </div>
        ) : null}
      </section>

      <PersonEditorDialog
        defaultRole={role}
        key={formOpen ? editing?.id ?? `new-${role}` : "closed-person-form"}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
        open={formOpen}
        person={editing}
      />

      <Dialog onClose={() => { if (!deleting) setPersonToDelete(null); }} open={Boolean(personToDelete)} size="compact" title="确认删除">
        <div className="px-6 py-6">
          <p className="text-sm leading-6 text-slate-600">删除「{personToDelete?.chineseName}」？</p>
          {deleteError ? <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{deleteError}</div> : null}
        </div>
        <footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <Button disabled={deleting} onClick={() => setPersonToDelete(null)} type="button" variant="outline">取消</Button>
          <Button disabled={deleting} onClick={() => void deletePerson()} type="button" variant="destructive">{deleting ? "删除中..." : "删除"}</Button>
        </footer>
      </Dialog>

      <Dialog onClose={() => setPreviewPerson(null)} open={Boolean(previewPerson)} size="compact" title={previewPerson?.chineseName ?? "人物形象"}>
        <div className="flex max-h-[calc(100dvh-8rem)] items-center justify-center bg-[#F8FBFE] p-5 sm:p-6">
          {previewPerson?.activeVisual ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`${previewPerson.chineseName} 的人物形象`} className="aspect-[2/3] max-h-[calc(100dvh-12rem)] max-w-full bg-white object-contain" src={previewPerson.activeVisual.publicUrl} />
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}

function PersonRowSkeleton() {
  return (
    <div className="min-h-[190px] overflow-hidden rounded-xl bg-white">
      <div className="flex gap-4 bg-[#F8FBFE] px-4 py-3">
        <div className="skeleton h-36 w-24" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-4 w-28 rounded" />
          <div className="skeleton h-3 w-36 rounded" />
          <div className="skeleton h-6 w-20 rounded-full" />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 px-3 py-2.5"><div className="skeleton h-8 w-16 rounded" /><div className="skeleton h-8 w-16 rounded" /></div>
    </div>
  );
}
