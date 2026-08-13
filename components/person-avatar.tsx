import Image from "next/image";
import React from "react";

import type { Gender } from "@/lib/contracts/api";
import { avatarBackgroundColor, avatarInitial } from "@/lib/avatar";
import { cn } from "@/lib/utils";

type PersonAvatarProps = {
  name: string;
  seed: string;
  gender?: Gender;
  avatarUrl?: string;
  size?: number;
  imageWidth?: number;
  imageHeight?: number;
  className?: string;
  shape?: "circle" | "square";
};

export function PersonAvatar({ name, seed, gender, avatarUrl, size = 56, imageWidth, imageHeight, className, shape = "circle" }: PersonAvatarProps) {
  if (avatarUrl) {
    const width = imageWidth ?? size;
    const height = imageHeight ?? size;
    return (
      <div className={cn("relative shrink-0 overflow-visible", className)} style={{ width, height }}>
        <Image alt={`${name}的人物形象`} className={cn("block size-full object-contain", shape === "circle" ? "rounded-full" : "rounded-none")} height={height} src={avatarUrl} width={width} />
        {gender ? <span aria-label={gender === "male" ? "男" : "女"} className={cn("absolute bottom-1 right-1 z-10 flex size-5 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ring-2 ring-white", gender === "male" ? "bg-sky-500" : "bg-pink-500")}>{gender === "male" ? "♂" : "♀"}</span> : null}
      </div>
    );
  }

  const background = avatarBackgroundColor(seed);
  const initial = avatarInitial(name);
  const badgeSize = Math.max(Math.round(size * 0.34), 16);

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <div
        className="flex size-full items-center justify-center rounded-full font-semibold text-white ring-4 ring-slate-50"
        style={{ backgroundColor: background, fontSize: Math.round(size * 0.42) }}
      >
        {initial}
      </div>
      {gender ? (
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full font-bold text-white ring-2 ring-white",
            gender === "male" ? "bg-sky-500" : "bg-pink-500",
          )}
          style={{ width: badgeSize, height: badgeSize, fontSize: Math.round(badgeSize * 0.68) }}
        >
          {gender === "male" ? "♂" : "♀"}
        </span>
      ) : null}
    </div>
  );
}
