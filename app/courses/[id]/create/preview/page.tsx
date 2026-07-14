"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">加载预览中…</p>
      </div>
    );
  }

  if (error || !data || !draftPresentation || !courseId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error ?? "加载失败"}</p>
        <button
          type="button"
          onClick={() => courseId && loadPreview(courseId)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          重试
        </button>
      </div>
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
    <div className="min-h-screen bg-slate-50 flex flex-col print:bg-white print:p-0">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4 print:hidden">
        <div className="flex-1">
          <CourseCreateSteps currentStep={5} courseId={courseId} />
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setMode("html")}
              className={`px-3 py-1.5 transition ${
                mode === "html" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              课件预览
            </button>
            <button
              type="button"
              onClick={() => setMode("pdf")}
              className={`px-3 py-1.5 transition ${
                mode === "pdf" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              打印预览
            </button>
          </div>
          {mode === "pdf" && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50"
            >
              {downloadingPdf ? "生成中…" : "下载 PDF"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/courses/${courseId}/create/resources`}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
          >
            返回 Step 4
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存草稿"}
          </button>
          <button
            type="button"
            onClick={() => setShowPublishConfirm(true)}
            disabled={publishing}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {publishing ? "发布中…" : "发布课程"}
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden print:overflow-visible print:block">
        {/* Preview area */}
        <main className="flex-1 p-6 overflow-auto print:p-0 print:overflow-visible">
          {mode === "html" ? (
            <div className="max-w-6xl mx-auto h-[calc(100vh-120px)]">
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
          ) : (
            <div className="max-w-5xl mx-auto">
              <CourseSlideDeck
                pages={data.pages}
                mode="pdf"
                canEdit={false}
                courseId={courseId}
                showAllPages
                presentation={draftPresentation}
              />
            </div>
          )}
        </main>

        {/* Right property panel */}
        {mode === "html" && (
          <aside className="w-80 bg-white border-l border-slate-200 print:hidden">
            <PropertyPanel
              selectedPage={selectedPage}
              presentation={draftPresentation}
              onChange={handlePresentationChange}
              onSlideOverrideChange={handleSlideOverride}
              onSlideReset={handleSlideReset}
              hasUnsavedChanges={hasUnsavedChanges}
            />
          </aside>
        )}
      </div>

      {/* Publish confirm modal */}
      {showPublishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">确认发布课程？</h3>
            <p className="text-sm text-slate-600 mb-5">
              发布后课程将进入授课模式，课件内容不可再编辑。如需修改，请重新回到创建流程。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPublishConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50"
                disabled={publishing}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {publishing ? "发布中…" : "确认发布"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
