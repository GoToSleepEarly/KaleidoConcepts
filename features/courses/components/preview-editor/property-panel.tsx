"use client";

import { ChapterDividerProperties } from "./chapter-divider-properties";
import { CoverTitleProperties } from "./cover-title-properties";
import { SlideTextProperties } from "./slide-text-properties";
import type {
  CoursePresentationConfig,
  CoursePreviewPage,
  SlideTextOverride,
} from "@/lib/contracts/api";

type Props = {
  selectedPage: CoursePreviewPage | null;
  presentation: CoursePresentationConfig;
  onChange: (patch: Partial<CoursePresentationConfig>) => void;
  onSlideOverrideChange: (pageId: string, override: SlideTextOverride) => void;
  onSlideReset: (pageId: string) => void;
  hasUnsavedChanges: boolean;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-slate-900 mb-3">{children}</h3>;
}

function PageBadge({ type }: { type: string }) {
  const labelMap: Record<string, string> = {
    cover_pure: "纯封面",
    cover_title: "标题封面",
    chapter_divider: "章节标题页",
    shot_image: "绘本图片页",
    shot_text: "文本练习页",
    closing_image: "课后阅读图",
    closing_text: "课后阅读文本",
  };
  return (
    <div className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 mb-3">
      {labelMap[type] ?? type}
    </div>
  );
}

function ScopeNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
      {children}
    </div>
  );
}

export function PropertyPanel({
  selectedPage,
  presentation,
  onChange,
  onSlideOverrideChange,
  onSlideReset,
  hasUnsavedChanges,
}: Props) {
  return (
    <div className="touch-scroll h-full overflow-y-auto p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900">课件样式</h2>
        {hasUnsavedChanges && (
          <span className="w-2 h-2 rounded-full bg-amber-500" title="有未保存更改" />
        )}
      </div>

      {!selectedPage && (
        <div className="space-y-6">
          <div>
            <SectionTitle>全局设置</SectionTitle>
            <ScopeNote>影响范围：所有未单独覆盖的课件页面。点击左侧预览页后，可切换为当前页设置。</ScopeNote>
          </div>
          <div>
            <SectionTitle>默认封面样式</SectionTitle>
            <CoverTitleProperties
              value={presentation.coverTheme}
              fontScale={presentation.coverTitleFontSize}
              onChange={(theme, scale) => onChange({ coverTheme: theme, coverTitleFontSize: scale })}
            />
          </div>
          <div>
            <SectionTitle>章节配色</SectionTitle>
            <ChapterDividerProperties
              value={presentation.chapterTheme}
              onChange={(theme) => onChange({ chapterTheme: theme })}
            />
          </div>
        </div>
      )}

      {selectedPage && selectedPage.type === "cover_title" && (
        <div>
          <PageBadge type={selectedPage.type} />
          <ScopeNote>正在编辑：封面标题页。影响范围：封面主题和标题字号属于全局封面设置。</ScopeNote>
          <SectionTitle>封面标题设置</SectionTitle>
          <CoverTitleProperties
            value={presentation.coverTheme}
            fontScale={presentation.coverTitleFontSize}
            onChange={(theme, scale) => onChange({ coverTheme: theme, coverTitleFontSize: scale })}
          />
        </div>
      )}

      {selectedPage && selectedPage.type === "chapter_divider" && (
        <div>
          <PageBadge type={selectedPage.type} />
          <ScopeNote>正在编辑：章节标题页。影响范围：所有章节标题页共用此配色。</ScopeNote>
          <SectionTitle>章节配色（所有章节共用）</SectionTitle>
          <ChapterDividerProperties
            value={presentation.chapterTheme}
            onChange={(theme) => onChange({ chapterTheme: theme })}
          />
        </div>
      )}

      {selectedPage && (selectedPage.type === "shot_text" || selectedPage.type === "closing_text") && (
        <div>
          <PageBadge type={selectedPage.type} />
          <ScopeNote>正在编辑：当前文本页。影响范围：仅当前页文本框；翻页后会自动切换到新页面。</ScopeNote>
          <SectionTitle>文本框样式</SectionTitle>
          <SlideTextProperties
            pageId={selectedPage.id}
            textBox={selectedPage.textBox}
            override={presentation.slideOverrides[selectedPage.id]}
            onChange={onSlideOverrideChange}
            onReset={onSlideReset}
          />
        </div>
      )}

      {selectedPage && (selectedPage.type === "cover_pure" || selectedPage.type === "shot_image" || selectedPage.type === "closing_image") && (
        <div>
          <PageBadge type={selectedPage.type} />
          <ScopeNote>正在查看：当前纯图片页。影响范围：此页没有样式控件。</ScopeNote>
          <p className="text-sm text-slate-500">纯图片页无可编辑样式。如需替换图片请返回 Step 4。</p>
        </div>
      )}
    </div>
  );
}
