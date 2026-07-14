import Image from "next/image";

import type { Gender } from "@/lib/contracts/api";
import { avatarBackgroundColor, avatarInitial } from "@/lib/avatar";
import { cn } from "@/lib/utils";

type PersonAvatarProps = {
  name: string;
  seed: string;
  gender?: Gender;
  avatarUrl?: string;
  size?: number;
  className?: string;
};

export function PersonAvatar({ name, seed, gender, avatarUrl, size = 56, className }: PersonAvatarProps) {
  if (avatarUrl) {
    return (
      <Image
        alt=""
        className={cn("rounded-full object-cover ring-4 ring-slate-50", className)}
        height={size}
        src={avatarUrl}
        width={size}
      />
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
