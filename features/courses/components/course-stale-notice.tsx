"use client";

import React, { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import type { CourseStage } from "@/lib/contracts/api";
import { isCourseStageStale } from "@/lib/domain/course-stage";

export function CourseStaleNotice({ staleFromStage, stage }: { staleFromStage?: CourseStage | null; stage: CourseStage }) {
  const noticeId = `${stage}:${staleFromStage ?? "current"}`;
  const [dismissedNoticeId, setDismissedNoticeId] = useState<string | null>(null);
  if (!isCourseStageStale(staleFromStage, stage) || dismissedNoticeId === noticeId) return null;
  return (
    <section className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-amber-950" role="status">
      <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1 text-sm leading-5">
        <span className="font-semibold">当前内容仍是旧版本。</span>{" "}
        <span className="text-amber-900">{stage === "preview" ? "请重新检查课件，确认后可重新发布。" : "如需同步最新配置，请重置本阶段。"}</span>
      </div>
      <button aria-label="关闭旧版本提示" className="flex size-11 shrink-0 items-center justify-center rounded-md text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600" onClick={() => setDismissedNoticeId(noticeId)} type="button">
        <X aria-hidden="true" className="size-4" />
      </button>
    </section>
  );
}
