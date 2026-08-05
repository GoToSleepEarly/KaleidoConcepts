"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Search, UsersRound } from "lucide-react";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonEditorDialog } from "@/features/people/components/person-form-drawer";
import type { PeopleListResponse, PersonProfile, PersonRole } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

export function PeopleManager() {
  const [role, setRole] = useState<PersonRole>("student");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PersonProfile | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ role, status: "active", sort: "recent", limit: "100" });
      if (query.trim()) params.set("query", query.trim());
      const response = await fetch(`/api/people?${params}`, { signal });
      const data = (await response.json()) as PeopleListResponse & { message?: string };
      if (!response.ok) throw new Error(data.message || "人物档案加载失败");
      setPeople(data.people);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "人物档案加载失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [query, role]);

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

  return (
    <div className="mx-auto max-w-6xl">
      <section className="rounded-lg bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-md bg-muted p-1" role="tablist" aria-label="人物类型">
            {(["student", "teacher"] as const).map((value) => (
              <button
                aria-selected={role === value}
                className={cn("min-h-9 rounded px-4 text-sm font-medium transition-colors", role === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                key={value}
                onClick={() => setRole(value)}
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
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索中文名或英文名"
                value={query}
              />
            </label>
            <Button className="shrink-0" onClick={openCreate} type="button"><Plus className="size-4" />新增{role === "student" ? "学生" : "老师"}</Button>
          </div>
        </div>

        {error ? <div className="m-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}

        <div className="divide-y divide-border">
          {loading ? Array.from({ length: 3 }).map((_, index) => <PersonRowSkeleton key={index} />) : null}
          {!loading && people.map((person) => (
            <article className="group flex flex-col gap-4 px-4 py-5 transition-colors hover:bg-muted/35 sm:flex-row sm:items-center sm:px-5" key={person.id}>
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="shrink-0">
                  <PersonAvatar avatarUrl={person.role === "teacher" ? person.activeVisual?.publicUrl : undefined} gender={person.gender} name={person.chineseName} seed={person.id} size={56} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="truncate text-base font-semibold text-foreground">{person.chineseName}</h3>
                    <span className="truncate text-sm text-muted-foreground">{person.englishName}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{person.age} 岁 · {person.gender === "female" ? "女" : "男"}</span>
                  </div>
                  {person.notes ? <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{person.notes}</p> : null}
                </div>
              </div>

              <div className="shrink-0 sm:justify-end">
                <Button className="border-border bg-card shadow-sm hover:border-primary hover:bg-primary-50 hover:text-primary-700" onClick={() => openEdit(person)} size="sm" type="button" variant="outline"><Pencil className="size-4" />编辑</Button>
              </div>
            </article>
          ))}
        </div>

        {!loading && !people.length ? (
          <div className="p-8">
            <EmptyState
              action={<Button onClick={openCreate}><Plus className="size-4" />新增人物</Button>}
              description={query ? "试试其他关键词。" : "新增后即可在课程中选择。"}
              icon={UsersRound}
              title={query ? "没有找到人物" : "还没有人物"}
            />
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
    </div>
  );
}

function PersonRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-5">
      <div className="skeleton size-14 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-40 rounded" />
        <div className="skeleton h-3 w-64 max-w-full rounded" />
      </div>
    </div>
  );
}
