"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  Clock3,
  ImageIcon,
  ImagePlus,
  Loader2,
  MessageSquareText,
  Palette,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type {
  AppearanceConfig,
  PersonProfile,
  PersonVisualAsset,
} from "@/lib/contracts/api";
import {
  createDefaultAppearanceConfig,
  DEFAULT_PHOTO_STYLE_PROMPT,
  findClipboardImage,
  isSupportedImage,
} from "@/lib/people/appearance-input";
import {
  formatGenerationWait,
  generationWaitMessage,
} from "@/lib/people/generation-wait";
import {
  buildVisualRevisionChain,
  resolveVisualWorkspaceMode,
  type VisualWorkspaceMode,
} from "@/lib/people/visual-workspace";
import { cn } from "@/lib/utils";
import { createRequestId } from "@/lib/utils/request-id";

type OptionSet = {
  key: keyof AppearanceConfig;
  label: string;
  values: string[];
};

const appearanceGroups: { label: string; options: OptionSet[] }[] = [
  {
    label: "整体印象",
    options: [
      {
        key: "temperament",
        label: "气质",
        values: [
          "温柔",
          "活泼",
          "淘气",
          "内敛",
          "开朗",
          "沉稳",
          "阳光",
          "自信",
          "好奇",
          "亲切",
          "知性",
          "干练",
        ],
      },
      {
        key: "bodyShape",
        label: "身形轮廓",
        values: ["小巧", "匀称", "修长", "结实", "圆润"],
      },
    ],
  },
  {
    label: "外貌细节",
    options: [
      {
        key: "hairstyle",
        label: "发型",
        values: [
          "短碎发",
          "齐耳短发",
          "波波头",
          "齐肩直发",
          "齐肩卷发",
          "长直发",
          "长卷发",
          "高马尾",
          "低马尾",
          "双马尾",
          "单辫",
          "双辫",
          "丸子头",
          "半扎发",
          "自然卷",
          "利落侧分",
        ],
      },
      {
        key: "hairColor",
        label: "发色",
        values: [
          "自然黑",
          "蓝黑",
          "深棕",
          "栗棕",
          "红棕",
          "浅棕",
          "金棕",
          "自然灰",
        ],
      },
      {
        key: "faceShape",
        label: "脸型",
        values: ["圆脸", "鹅蛋脸", "心形脸", "偏长脸", "柔和方脸", "菱形脸"],
      },
      {
        key: "glasses",
        label: "眼镜",
        values: [
          "不戴眼镜",
          "细圆框",
          "粗圆框",
          "细方框",
          "粗方框",
          "椭圆框",
          "半框",
          "猫眼框",
        ],
      },
      {
        key: "signatureFeature",
        label: "标志性特征",
        values: [
          "大而明亮的眼睛",
          "细长眼睛",
          "微微上扬的眼角",
          "微微下垂的眼角",
          "浓眉",
          "弯眉",
          "雀斑",
          "酒窝",
          "红润脸颊",
          "眼角小痣",
          "发带",
          "蝴蝶结",
          "星形发夹",
          "彩色发夹",
          "额前小卷发",
          "明显的侧刘海",
        ],
      },
    ],
  },
  {
    label: "穿搭",
    options: [
      {
        key: "outfitStyle",
        label: "衣着",
        values: [
          "校园休闲",
          "运动套装",
          "连帽卫衣",
          "针织衫",
          "衬衫马甲",
          "背带装",
          "简约连衣裙",
          "衬衫长裤",
          "休闲西装",
          "温柔通勤",
          "文艺休闲",
          "户外活力",
        ],
      },
      {
        key: "outfitColor",
        label: "服装主色",
        values: [
          "红色",
          "橙色",
          "暖黄色",
          "草绿色",
          "墨绿色",
          "天蓝色",
          "深蓝色",
          "紫色",
          "粉色",
          "米白色",
          "卡其色",
          "灰色",
        ],
      },
    ],
  },
];

export function PersonVisualStudio({
  open,
  person,
  onClose,
  onChanged,
  embedded = false,
}: {
  open: boolean;
  person: PersonProfile | null;
  onClose: () => void;
  onChanged: () => void;
  embedded?: boolean;
}) {
  const [visuals, setVisuals] = useState<PersonVisualAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(
    person?.activeVisual?.id ?? null,
  );
  const [workspaceMode, setWorkspaceMode] = useState<VisualWorkspaceMode>(
    person?.activeVisual ? "refine" : "create",
  );
  const [mode, setMode] = useState<"description" | "photo">("photo");
  const [config, setConfig] = useState<AppearanceConfig>(() =>
    createDefaultAppearanceConfig(person?.gender ?? "female"),
  );
  const [photoStylePrompt, setPhotoStylePrompt] = useState(
    DEFAULT_PHOTO_STYLE_PROMPT,
  );
  const [descriptionPrompt, setDescriptionPrompt] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [generationKind, setGenerationKind] = useState<
    "create" | "refine" | null
  >(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [deletingVisualId, setDeletingVisualId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [justGeneratedId, setJustGeneratedId] = useState<string | null>(null);
  const [returnToVisualId, setReturnToVisualId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoInputId = person ? `person-photo-${person.id}` : "person-photo";

  const selected = useMemo(
    () => visuals.find((visual) => visual.id === selectedId) ?? null,
    [selectedId, visuals],
  );
  const revisionChain = useMemo(
    () => buildVisualRevisionChain(visuals, selectedId),
    [selectedId, visuals],
  );
  const photoPreviewUrl = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  );

  useEffect(
    () => () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    },
    [photoPreviewUrl],
  );

  useEffect(() => {
    if (!generationKind) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [generationKind]);

  const acceptPhoto = useCallback((file: File | null) => {
    if (!file) return;
    if (!isSupportedImage(file)) {
      setError("请选择 JPG、PNG 或 WebP 图片");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("图片不能超过 10 MB");
      return;
    }
    setPhoto(file);
    setError("");
  }, []);

  const load = useCallback(async () => {
    if (!person) return;
    const response = await fetch(`/api/people/${person.id}/visuals`);
    const data = (await response.json()) as {
      visuals?: PersonVisualAsset[];
      message?: string;
    };
    if (!response.ok) throw new Error(data.message || "人物形象加载失败");
    const next = data.visuals ?? [];
    setVisuals(next);
    setWorkspaceMode(resolveVisualWorkspaceMode(next));
    setSelectedId((current) =>
      current && next.some((visual) => visual.id === current)
        ? current
        : (person.activeVisual?.id ??
          next.find((visual) => visual.status === "succeeded")?.id ??
          next[0]?.id ??
          null),
    );
  }, [person]);

  useEffect(() => {
    if (!open || !person) return;
    const controller = new AbortController();
    fetch(`/api/people/${person.id}/visuals`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as {
          visuals?: PersonVisualAsset[];
          message?: string;
        };
        if (!response.ok) throw new Error(data.message || "人物形象加载失败");
        return data.visuals ?? [];
      })
      .then((next) => {
        setVisuals(next);
        setActiveId(person.activeVisual?.id ?? null);
        setWorkspaceMode(resolveVisualWorkspaceMode(next));
        setSelectedId(
          person.activeVisual?.id ??
            next.find((visual) => visual.status === "succeeded")?.id ??
            next[0]?.id ??
            null,
        );
      })
      .catch((caught) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error ? caught.message : "人物形象加载失败",
          );
      });
    return () => controller.abort();
  }, [open, person]);

  useEffect(() => {
    if (!open || mode !== "photo") return;
    const handlePaste = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;
      const image = findClipboardImage(event.clipboardData);
      if (!image) return;
      event.preventDefault();
      acceptPhoto(image);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [acceptPhoto, mode, open]);

  async function run(
    request: () => Promise<Response>,
    waitKind: "create" | "refine" | null = null,
  ) {
    setLoading(true);
    if (waitKind) {
      setElapsedSeconds(0);
      setGenerationKind(waitKind);
    }
    setError("");
    try {
      const response = await request();
      const data = (await response.json()) as {
        visual?: PersonVisualAsset;
        message?: string;
      };
      if (!response.ok || !data.visual)
        throw new Error(data.message || "人物形象生成失败");
      await load();
      setSelectedId(data.visual.id);
      setInstruction("");
      if (data.visual.status === "succeeded") setWorkspaceMode("refine");
      onChanged();
      return data.visual;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "人物形象生成失败");
      await load().catch(() => undefined);
      return null;
    } finally {
      setLoading(false);
      if (waitKind) setGenerationKind(null);
    }
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!person) return;
    const key = createRequestId();
    if (mode === "photo") {
      if (!photo) {
        setError("请先选择一张照片");
        return;
      }
      const body = new FormData();
      body.set("photo", photo);
      body.set("customPrompt", photoStylePrompt);
      const visual = await run(
        () =>
          fetch(`/api/people/${person.id}/visuals/from-photo`, {
            method: "POST",
            headers: { "Idempotency-Key": key },
            body,
          }),
        "create",
      );
      if (visual?.status === "succeeded") setJustGeneratedId(visual.id);
      return;
    }
    const visual = await run(
      () =>
        fetch(`/api/people/${person.id}/visuals/from-description`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({
            appearanceConfig: config,
            customPrompt: descriptionPrompt,
          }),
        }),
      "create",
    );
    if (visual?.status === "succeeded") setJustGeneratedId(visual.id);
  }

  async function refine() {
    if (!person || !selected || !instruction.trim()) return;
    const visual = await run(
      () =>
        fetch(`/api/people/${person.id}/visuals/${selected.id}/refine`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createRequestId(),
          },
          body: JSON.stringify({ instruction: instruction.trim() }),
        }),
      "refine",
    );
    if (visual?.status === "succeeded") setJustGeneratedId(visual.id);
  }

  async function selectCurrent(target = selected) {
    if (!person || !target) return;
    const visual = await run(() =>
      fetch(`/api/people/${person.id}/visuals/${target.id}/select`, {
        method: "POST",
      }),
    );
    if (visual) {
      setActiveId(target.id);
      setJustGeneratedId(null);
    }
  }

  async function deleteVisual(visual: PersonVisualAsset) {
    if (!person || visual.id === activeId) return;
    setDeletingVisualId(visual.id);
    setError("");
    try {
      const response = await fetch(`/api/people/${person.id}/visuals/${visual.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(data?.message || "人物形象删除失败");
      const remaining = visuals.filter((item) => item.id !== visual.id);
      setVisuals(remaining);
      setSelectedId((current) => current === visual.id ? (remaining.find((item) => item.id === activeId)?.id ?? remaining[0]?.id ?? null) : current);
      setWorkspaceMode(resolveVisualWorkspaceMode(remaining));
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "人物形象删除失败");
    } finally {
      setDeletingVisualId(null);
    }
  }

  function startOver() {
    setReturnToVisualId(selectedId);
    setWorkspaceMode("create");
    setMode("photo");
    setPhoto(null);
    setPhotoStylePrompt(DEFAULT_PHOTO_STYLE_PROMPT);
    setDescriptionPrompt("");
    setConfig(createDefaultAppearanceConfig(person?.gender ?? "female"));
    setInstruction("");
    setError("");
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function cancelStartOver() {
    const restoreId = returnToVisualId && visuals.some((visual) => visual.id === returnToVisualId)
      ? returnToVisualId
      : (visuals.find((visual) => visual.id === activeId)?.id ?? visuals[0]?.id ?? null);
    setSelectedId(restoreId);
    setWorkspaceMode("refine");
    setReturnToVisualId(null);
    setError("");
  }

  const content = person ? (
    <div
      className={cn(
        "grid min-h-0 overflow-hidden lg:grid-cols-2",
        embedded && "h-full",
      )}
    >
      <section className="flex min-h-0 flex-col overflow-hidden border-b border-border bg-muted/35 p-4 sm:p-5 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ImageIcon className="size-4 text-primary" />
            形象预览
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {selected?.id === activeId ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="size-3.5" />当前使用</span> : selected?.id === justGeneratedId ? <span className="inline-flex items-center gap-1 text-xs font-medium text-primary"><Sparkles className="size-3.5" />新生成</span> : selected?.status === "succeeded" ? <Button disabled={loading} onClick={() => void selectCurrent()} size="sm" type="button" variant="outline"><Check className="size-4" />设为当前形象</Button> : null}
            {workspaceMode === "create" && visuals.length ? <Button onClick={cancelStartOver} size="sm" type="button" variant="outline">取消重新创建</Button> : workspaceMode === "refine" ? <Button onClick={startOver} size="sm" type="button" variant="outline"><RotateCcw className="size-4" />重新创建</Button> : null}
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
          {selected?.publicUrl ? (
            <button aria-label="查看人物形象大图" className="group/preview relative aspect-[2/3] h-full max-h-[460px] max-w-full overflow-hidden border border-border bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setPreviewOpen(true)} type="button">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={`${person.chineseName} 的全身人物形象`} className="size-full object-contain" src={selected.publicUrl} />
              <span className="absolute inset-x-0 bottom-0 bg-slate-950/65 py-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100">查看大图</span>
            </button>
          ) : (
            <div className="flex aspect-[2/3] h-full max-h-[460px] max-w-full flex-col items-center justify-center border border-dashed border-border bg-card px-8 text-center">
              <span className="rounded-full bg-primary-50 p-3 ring-8 ring-primary-50/60">
                <PersonAvatar
                  gender={person.gender}
                  name={person.chineseName}
                  seed={person.id}
                  size={72}
                />
              </span>
              <p className="mt-6 text-sm font-semibold text-foreground">
                暂无人物形象
              </p>
            </div>
          )}
        </div>

        {visuals.length ? (
          <div className="mt-3 flex h-[98px] shrink-0 gap-3 overflow-x-auto px-1 pt-2 pb-1">
            {visuals.map((visual) => (
              <div className="relative shrink-0" key={visual.id}>
                <button
                aria-label="查看形象版本"
                className={cn(
                  "relative flex h-[84px] w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-border bg-card text-xs text-muted-foreground",
                  selectedId === visual.id && "border-primary",
                )}
                onClick={() => {
                  setSelectedId(visual.id);
                  setJustGeneratedId(null);
                  setWorkspaceMode("refine");
                }}
                type="button"
              >
                {visual.publicUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="size-full object-contain"
                    src={visual.publicUrl}
                  />
                ) : visual.status === "failed" ? (
                  "失败"
                ) : (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {visual.id === activeId ? (
                  <span className="absolute bottom-1 right-1 flex size-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="size-3" />
                  </span>
                ) : null}
                </button>
                {visual.id !== activeId ? <button aria-label="删除这个形象版本" className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600" disabled={deletingVisualId === visual.id} onClick={() => void deleteVisual(visual)} type="button">{deletingVisualId === visual.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}</button> : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section
        className={cn(
          "h-full min-h-0 overflow-hidden bg-card",
          workspaceMode === "refine"
            ? "flex flex-col"
            : "overflow-y-auto p-4 sm:p-6",
        )}
      >
        {workspaceMode === "refine" ? (
          <>
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                  <MessageSquareText className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-foreground">
                    继续调整
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    基于左侧选中的版本
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {generationKind === "refine" ? (
                <GenerationWaitingState
                  elapsedSeconds={elapsedSeconds}
                  kind="refine"
                />
              ) : selected?.status === "succeeded" ? (
                <div className="space-y-5">
                  {revisionChain.map((visual, index) => (
                    <div className="space-y-3" key={visual.id}>
                      {visual.parentAssetId && visual.userInstruction ? (
                        <div className="ml-auto max-w-[88%] rounded-lg bg-primary px-3.5 py-2.5 text-sm leading-6 text-primary-foreground">
                          {visual.userInstruction}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-3">
                        {visual.publicUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt=""
                            className="h-[72px] w-12 rounded-md bg-white object-contain"
                            src={visual.publicUrl}
                          />
                        ) : (
                          <span className="flex h-[72px] w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <ImageIcon className="size-4" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {index === 0 ? "初始形象" : `调整版本 ${index}`}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {visual.id === selected.id
                              ? "当前正在查看"
                              : "历史版本"}
                          </p>
                        </div>
                        {visual.id === justGeneratedId ? (
                          visual.id === activeId ? <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="size-3.5" />当前使用</span> : <Button className="ml-auto shrink-0" disabled={loading} onClick={() => void selectCurrent(visual)} size="sm" type="button"><Check className="size-4" />使用这个新形象</Button>
                        ) : null}
                      </div>
                    </div>
                  ))}

                </div>
              ) : (
                <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  正在生成版本
                </div>
              )}

              {error ? (
                <p
                  className="mt-4 rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </div>

            {selected?.status === "succeeded" && generationKind !== "refine" ? (
              <div className="shrink-0 border-t border-border p-4 sm:p-5">
                <label className="block">
                  <span className="sr-only">修改要求</span>
                  <div className="flex items-end gap-2 rounded-lg border border-input bg-card p-2 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-100">
                    <textarea
                      className="min-h-16 max-h-32 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                      onChange={(event) => setInstruction(event.target.value)}
                      placeholder="说说想怎么修改，例如：头发改成红色"
                      value={instruction}
                    />
                    <Button
                      aria-label="生成修改版本"
                      disabled={loading || !instruction.trim()}
                      onClick={refine}
                      size="icon"
                      type="button"
                    >
                      {loading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <SendHorizontal className="size-4" />
                      )}
                    </Button>
                  </div>
                </label>
              </div>
            ) : null}
          </>
        ) : generationKind === "create" ? (
          <GenerationWaitingState
            elapsedSeconds={elapsedSeconds}
            kind="create"
          />
        ) : (
          <form onSubmit={generate}>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary-50 text-primary">
                <Palette className="size-4" />
              </span>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  创建人物形象
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  选择一种创建方式
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                active={mode === "photo"}
                icon={Upload}
                label="上传照片"
                onClick={() => setMode("photo")}
              />
              <ModeButton
                active={mode === "description"}
                icon={ImagePlus}
                label="描述生成"
                onClick={() => setMode("description")}
              />
            </div>

            {mode === "photo" ? (
              <div
                className="mt-5 overflow-hidden rounded-xl border border-dashed border-primary-200 bg-primary-50/25"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  acceptPhoto(event.dataTransfer.files[0] ?? null);
                }}
              >
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  id={photoInputId}
                  onChange={(event) =>
                    acceptPhoto(event.target.files?.[0] ?? null)
                  }
                  ref={photoInputRef}
                  tabIndex={-1}
                  type="file"
                />
                {photo && photoPreviewUrl ? (
                  <div>
                    <div className="flex h-52 items-center justify-center bg-card p-3 sm:h-60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt="待生成照片预览"
                        className="size-full object-contain"
                        src={photoPreviewUrl}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card px-3 py-3">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                        {photo.name}
                      </span>
                      <label
                        className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-primary hover:bg-primary-50"
                        htmlFor={photoInputId}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            photoInputRef.current?.click();
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <ImagePlus className="size-3.5" />
                        更换图片
                      </label>
                      <button
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-red-600"
                        onClick={() => {
                          setPhoto(null);
                          if (photoInputRef.current)
                            photoInputRef.current.value = "";
                        }}
                        type="button"
                      >
                        <Trash2 className="size-3.5" />
                        移除
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-48 flex-col items-center justify-center px-5 py-6 text-center">
                    <span className="flex size-12 items-center justify-center rounded-xl bg-card text-primary shadow-sm ring-1 ring-primary-100">
                      <ImagePlus className="size-5" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-foreground">
                      添加人物照片
                    </p>
                    <Button
                      asChild
                      className="mt-4 min-h-11 px-5"
                      variant="outline"
                    >
                      <label
                        className="cursor-pointer"
                        htmlFor={photoInputId}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            photoInputRef.current?.click();
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <ImagePlus className="size-4" />
                        选择照片
                      </label>
                    </Button>
                    <p className="mt-2 hidden text-xs text-muted-foreground sm:block">
                      也可以拖入图片或按 Ctrl + V 粘贴
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground sm:hidden">
                      从设备相册或文件中选择
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {appearanceGroups.map((group) => (
                  <fieldset
                    className="rounded-xl bg-muted/35 p-3.5"
                    key={group.label}
                  >
                    <legend className="px-1 text-xs font-semibold tracking-wide text-foreground">
                      {group.label}
                    </legend>
                    <div className="grid grid-cols-2 gap-3">
                      {group.options.map((set) => (
                        <AppearanceSelect
                          config={config}
                          key={set.key}
                          onChange={setConfig}
                          set={set}
                        />
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-foreground">
                {mode === "photo" ? "风格要求" : "补充要求"}{" "}
                <span className="font-normal text-muted-foreground">
                  {mode === "photo" ? "可修改" : "选填"}
                </span>
              </span>
              <textarea
                className="min-h-24 w-full rounded-lg border border-input bg-card px-3.5 py-3 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary-100"
                onChange={(event) =>
                  mode === "photo"
                    ? setPhotoStylePrompt(event.target.value)
                    : setDescriptionPrompt(event.target.value)
                }
                placeholder={
                  mode === "photo"
                    ? "描述希望生成的人物风格"
                    : "补充选项中没有覆盖的特征"
                }
                value={mode === "photo" ? photoStylePrompt : descriptionPrompt}
              />
            </label>

            {error ? (
              <p
                className="mt-4 rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-700"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <Button
              className="mt-5 min-h-11 w-full"
              disabled={loading || (mode === "photo" && !photo)}
              type="submit"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {loading ? "正在生成全身形象" : "生成全身形象"}
            </Button>
          </form>
        )}
      </section>

      <Dialog onClose={() => setPreviewOpen(false)} open={previewOpen} size="compact" title={`${person.chineseName} · 人物形象`}>
        <div className="flex max-h-[calc(100dvh-8rem)] items-center justify-center bg-[#F8FBFE] p-4 sm:p-6">
          {selected?.publicUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`${person.chineseName} 的人物形象大图`} className="aspect-[2/3] max-h-[calc(100dvh-12rem)] max-w-full bg-white object-contain" src={selected.publicUrl} />
          ) : null}
        </div>
      </Dialog>
    </div>
  ) : null;

  if (embedded) return content;
  return (
    <Dialog onClose={onClose} open={open} size="wide" title="人物形象">
      {content}
    </Dialog>
  );
}

function AppearanceSelect({
  set,
  config,
  onChange,
}: {
  set: OptionSet;
  config: AppearanceConfig;
  onChange: React.Dispatch<React.SetStateAction<AppearanceConfig>>;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
        {set.label}
      </span>
      <select
        className="min-h-11 w-full rounded-lg border border-input bg-card px-2.5 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
        onChange={(event) =>
          onChange((current) => ({
            ...current,
            [set.key]: event.target.value || undefined,
          }))
        }
        value={config[set.key] ?? ""}
      >
        <option value="">暂不指定</option>
        {set.values.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
}

function GenerationWaitingState({
  elapsedSeconds,
  kind,
}: {
  elapsedSeconds: number;
  kind: "create" | "refine";
}) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-5 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-50 text-primary ring-1 ring-primary-100">
        <Loader2 className="size-6 animate-spin motion-reduce:animate-none" />
      </span>
      <h3
        aria-live="polite"
        className="mt-5 text-balance text-base font-semibold text-foreground"
        role="status"
      >
        {kind === "create" ? "正在生成全身形象" : "正在生成修改版本"}
      </h3>
      <p className="mt-2 max-w-sm text-pretty text-sm leading-6 text-muted-foreground">
        {generationWaitMessage(elapsedSeconds)}
      </p>
      <div
        aria-hidden="true"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
      >
        <Clock3 className="size-3.5" />
        已等待
        <span className="min-w-14 tabular-nums text-foreground">
          {formatGenerationWait(elapsedSeconds)}
        </span>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {kind === "create"
          ? "完成后会自动进入继续调整"
          : "完成后会自动显示新版本"}
      </p>
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Upload;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex min-h-12 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-[border-color,background-color,color,box-shadow] duration-200",
        active
          ? "border-primary bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-100"
          : "border-border bg-card text-muted-foreground hover:border-primary-200 hover:bg-muted hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
