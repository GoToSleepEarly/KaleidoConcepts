"use client";

import Image from "next/image";
import Link from "next/link";
import type { CoursePreviewImage } from "@/lib/contracts/api";

type Props = {
  image: CoursePreviewImage;
  alt: string;
  backToEditHref?: string;
  className?: string;
};

export function CoursePreviewImageFrame({ image, alt, backToEditHref, className }: Props) {
  if (image.status === "succeeded" && image.publicUrl && !image.stale) {
    return (
      <div className={`relative w-full h-full overflow-hidden ${className ?? ""}`}>
        <Image
          src={image.publicUrl}
          alt={alt}
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
      </div>
    );
  }

  if (image.status === "succeeded" && image.publicUrl && image.stale) {
    return (
      <div className={`relative w-full h-full overflow-hidden ${className ?? ""}`}>
        <Image
          src={image.publicUrl}
          alt={alt}
          fill
          sizes="100vw"
          className="object-cover opacity-70"
        />
        <div className="absolute top-4 right-4 bg-amber-500/90 text-white text-xs px-2 py-1 rounded">
          内容已更新，请重新生成图片
        </div>
      </div>
    );
  }

  if (image.status === "pending" || image.status === "submitting" || image.status === "generating") {
    return (
      <div className={`flex w-full h-full items-center justify-center bg-slate-200 ${className ?? ""}`}>
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 border-4 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">图片生成中…</p>
          {backToEditHref && (
            <Link
              href={backToEditHref}
              className="inline-block mt-2 text-xs text-indigo-600 hover:underline"
            >
              返回编辑资源
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (image.status === "failed") {
    return (
      <div className={`flex w-full h-full items-center justify-center bg-red-50 ${className ?? ""}`}>
        <div className="text-center px-6">
          <p className="text-red-600 text-sm font-medium mb-2">图片生成失败</p>
          {image.failureReason && (
            <p className="text-red-400 text-xs mb-3 max-w-xs mx-auto truncate">{image.failureReason}</p>
          )}
          {backToEditHref && (
            <Link
              href={backToEditHref}
              className="inline-block text-xs text-indigo-600 hover:underline"
            >
              返回 Step 4 处理
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full h-full items-center justify-center bg-slate-100 ${className ?? ""}`}>
      <div className="text-center">
        <p className="text-slate-400 text-sm mb-2">图片未生成</p>
        {backToEditHref && (
          <Link
            href={backToEditHref}
            className="inline-block text-xs text-indigo-600 hover:underline"
          >
            去 Step 4 生成图片
          </Link>
        )}
      </div>
    </div>
  );
}
