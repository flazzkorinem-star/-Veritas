import Image from "next/image";

export const VITA_STATES = [
  "default",
  "waiting",
  "processing",
  "hint",
  "encourage",
  "answer",
  "error",
] as const;
export type VitaState = (typeof VITA_STATES)[number];

const assets: Record<VitaState, { src: string; alt: string }> = {
  default: { src: "/vita/default.png", alt: "维塔安静地陪在这里" },
  waiting: { src: "/vita/waiting.png", alt: "维塔等你递来学习材料" },
  processing: { src: "/vita/processing.png", alt: "维塔正在认真整理材料" },
  hint: { src: "/vita/hint.png", alt: "维塔递来一条小提示" },
  encourage: { src: "/vita/encouragement.png", alt: "维塔在为你的进步鼓掌" },
  answer: { src: "/vita/answer.png", alt: "维塔打开答案供你核对" },
  error: { src: "/vita/error.png", alt: "维塔准备和你一起重试" },
};

export function Vita({
  state = "default",
  size = 180,
  className = "",
}: {
  state?: VitaState;
  size?: number;
  className?: string;
}) {
  const asset = assets[state];
  return (
    <Image
      alt={asset.alt}
      className={className}
      data-testid={`vita-${state}`}
      height={size}
      priority={state === "waiting"}
      sizes={`${size}px`}
      src={asset.src}
      width={size}
    />
  );
}
