"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, Save, Send } from "lucide-react";

import { ProtectedLayout } from "@/components/protected-layout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import { CourseSlideDeck } from "@/features/courses/components/course-slide-deck";
import { PropertyPanel } from "@/features/courses/components/preview-editor/property-panel";
import type {
  CoursePresentationConfig,
  CoursePresentationUpdate,
  CoursePreviewPage,
  CoursePreviewResponse,
  SlideTextOverride,
} from "@/lib/contracts/api";
import { cn } from "@/lib/utils";
import { exportSlidesToPDF } from "@/lib/utils/pdf-export";

type PreviewMode = "html" | "pdf";

export default function CreatePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [data, setData] = useState<CoursePreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<PreviewMode>("html");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [draftPresentation, setDraftPresentation] = useState<CoursePresentationConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const hasUnsavedChanges = Boolean(
    draftPresentation &&
      JSON.stringify(draftPresentation) !== JSON.stringify(data?.presentation),
  );

  const loadPreview = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${id}/preview`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "加载失败");
      }
      const json = (await res.json()) as CoursePreviewResponse;
      setData(json);
      setDraftPresentation(json.presentation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    params.then((p) => {
      setCourseId(p.id);
      loadPreview(p.id);
    });
  }, [params, loadPreview]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const handlePresentationChange = (patch: Partial<CoursePresentationConfig>) => {
    if (!draftPresentation) return;
    setDraftPresentation({ ...draftPresentation, ...patch });
  };

  const handleSlideOverride = (pageId: string, override: SlideTextOverride) => {
    if (!draftPresentation) return;
    setDraftPresentation({
      ...draftPresentation,
      slideOverrides: {
        ...draftPresentation.slideOverrides,
        [pageId]: override,
      },
    });
  };

  const handleSlideReset = (pageId: string) => {
    if (!draftPresentation) return;
    const next = { ...draftPresentation.slideOverrides };
    delete next[pageId];
    setDraftPresentation({ ...draftPresentation, slideOverrides: next });
  };

  const handleSave = async () => {
    if (!courseId || !draftPresentation) return;
    setSaving(true);
    try {
      const body: CoursePresentationUpdate = {
        coverTheme: draftPresentation.coverTheme,
        coverTitleFontSize: draftPresentation.coverTitleFontSize,
        chapterTheme: draftPresentation.chapterTheme,
        slideOverrides: draftPresentation.slideOverrides,
      };
      const res = await fetch(`/api/courses/${courseId}/presentation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("保存失败");
      await loadPreview(courseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!courseId || !draftPresentation) return;
    setPublishing(true);
    try {
      const body: CoursePresentationUpdate = {
        coverTheme: draftPresentation.coverTheme,
        coverTitleFontSize: draftPresentation.coverTitleFontSize,
        chapterTheme: draftPresentation.chapterTheme,
        slideOverrides: draftPresentation.slideOverrides,
      };
      const res = await fetch(`/api/courses/${courseId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "发布失败");
      }
      const json = (await res.json()) as { redirectUrl: string };
      window.open(json.redirectUrl, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "发布失败");
    } finally {
      setPublishing(false);
      setShowPublishConfirm(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!data) return;
    setDownloadingPdf(true);
    try {
      const safeTitle = data.course.title.replace(/[^\w\u4e00-\u9fa5\-_]/g, "_").slice(0, 50) || "course";
      await exportSlidesToPDF(".preview-deck-pdf", `${safeTitle}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF 下载失败");
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading && !data) {
    return (
      <ProtectedLayout>
        <div className="mx-auto max-w-6xl space-y-6">
          <CourseCreateSteps currentStep={5} courseId={courseId ?? undefined} />
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Spinner />
              <span className="text-sm font-medium">加载预览中…</span>
            </div>
          </div>
        </div>
      </ProtectedLayout>
    );
  }

  if (error || !data || !draftPresentation || !courseId) {
    return (
      <ProtectedLayout>
        <div className="mx-auto max-w-6xl space-y-6">
          <CourseCreateSteps currentStep={5} courseId={courseId ?? undefined} />
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card text-center">
            <p className="text-sm text-destructive">{error ?? "加载失败"}</p>
            <Button onClick={() => courseId && loadPreview(courseId)} variant="outline">
              重试
            </Button>
          </div>
        </div>
      </ProtectedLayout>
    );
  }

  const rawSelectedPage: CoursePreviewPage | null = selectedPageId
    ? data.pages.find((p) => p.id === selectedPageId) ?? null
    : null;

  const selectedPage: CoursePreviewPage | null = (() => {
    if (!rawSelectedPage || !draftPresentation) return rawSelectedPage;
    if (rawSelectedPage.type === "shot_text" || rawSelectedPage.type === "closing_text") {
      const override = draftPresentation.slideOverrides[rawSelectedPage.id];
      return {
        ...rawSelectedPage,
        textBox: { ...rawSelectedPage.textBox, ...(override?.textBox ?? {}) },
      };
    }
    return rawSelectedPage;
  })();

  return (
    <ProtectedLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <CourseCreateSteps currentStep={5} courseId={courseId} />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Button asChild variant="outline" size="sm" className="mb-4">
              <Link href={`/courses/${courseId}/create/resources`}>
                <ArrowLeft className="size-4" />
                返回资源生成
              </Link>
            </Button>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">课程预览与发布</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              检查课件版式与文本框，确认无误后发布进入授课模式。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-border text-sm">
              <button
                type="button"
                onClick={() => setMode("html")}
                className={cn(
                  "px-3 py-1.5 transition-colors duration-200",
                  mode === "html"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-secondary",
                )}
              >
                课件预览
              </button>
              <button
                type="button"
                onClick={() => setMode("pdf")}
                className={cn(
                  "px-3 py-1.5 transition-colors duration-200",
                  mode === "pdf"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-secondary",
                )}
              >
                打印预览
              </button>
            </div>
            {mode === "pdf" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                loading={downloadingPdf}
              >
                <Download className="size-4" />
                下载 PDF
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
              loading={saving}
            >
              <Save className="size-4" />
              保存草稿
            </Button>
            <Button
              size="sm"
              onClick={() => setShowPublishConfirm(true)}
              disabled={publishing}
              loading={publishing}
            >
              <Send className="size-4" />
              发布课程
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {mode === "html" ? (
          <div className="flex min-h-[520px] gap-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <main className="flex-1 overflow-auto p-6">
              <div className="mx-auto h-[calc(100vh-22rem)] min-h-[440px] max-w-4xl">
                <CourseSlideDeck
                  pages={data.pages}
                  mode="html"
                  canEdit={data.canEdit}
                  courseId={courseId}
                  selectedPageId={selectedPageId ?? undefined}
                  onSelectPage={(id) => setSelectedPageId(id)}
                  variant="editor"
                  presentation={draftPresentation}
                />
              </div>
            </main>
            <aside className="w-80 shrink-0 border-l border-border">
              <PropertyPanel
                selectedPage={selectedPage}
                presentation={draftPresentation}
                onChange={handlePresentationChange}
                onSlideOverrideChange={handleSlideOverride}
                onSlideReset={handleSlideReset}
                hasUnsavedChanges={hasUnsavedChanges}
              />
            </aside>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mx-auto max-w-4xl">
              <CourseSlideDeck
                pages={data.pages}
                mode="pdf"
                canEdit={false}
                courseId={courseId}
                showAllPages
                presentation={draftPresentation}
              />
            </div>
          </div>
        )}
      </div>

      {showPublishConfirm ? (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold text-foreground">确认发布课程？</h3>
            <p className="mb-5 text-sm text-muted-foreground">
              发布后课程将进入授课模式，课件内容不可再编辑。如需修改，请重新回到创建流程。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPublishConfirm(false)} disabled={publishing}>
                取消
              </Button>
              <Button onClick={handlePublish} disabled={publishing} loading={publishing}>
                确认发布
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ProtectedLayout>
  );
}
