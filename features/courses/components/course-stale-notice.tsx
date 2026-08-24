import React from "react";
import { AlertTriangle } from "lucide-react";

import type { CourseStage } from "@/lib/contracts/api";
import { isCourseStageStale } from "@/lib/domain/course-stage";

export function CourseStaleNotice({ staleFromStage, stage }: { staleFromStage?: CourseStage | null; stage: CourseStage }) {
  if (!isCourseStageStale(staleFromStage, stage)) return null;
  return (
    <section className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950" role="status">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-600" />
      <div className="text-sm leading-6">
        <h2 className="font-semibold">当前内容仍是旧版本</h2>
        <p className="text-amber-900">{stage === "preview" ? "上游内容已经更新，请重新检查当前课件；确认无误后可重新发布。" : "上游配置已经修改，本阶段不会自动更新。需要按最新配置重新制作时，请主动重置本阶段。"}</p>
      </div>
    </section>
  );
}
