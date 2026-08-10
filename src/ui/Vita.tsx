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

const assets: Record<VitaState, { src: string; avatarSrc: string; alt: string }> = {
  default: {
    src: "/vita/default-final.png",
    avatarSrc: "/vita/default-avatar-final.png",
    alt: "维塔安静地陪在这里",
  },
  waiting: {
    src: "/vita/waiting-hd.png",
    avatarSrc: "/vita/waiting-avatar-final.png",
    alt: "维塔挥手欢迎你开始学习",
  },
  processing: {
    src: "/vita/processing-final.png",
    avatarSrc: "/vita/processing-avatar-final.png",
    alt: "维塔正在认真整理材料",
  },
  hint: {
    src: "/vita/hint-final.png",
    avatarSrc: "/vita/hint-avatar-final.png",
    alt: "维塔举起手给出一条提示",
  },
  encourage: {
    src: "/vita/encouragement-final.png",
    avatarSrc: "/vita/encouragement-avatar-final.png",
    alt: "维塔竖起拇指肯定你的进步",
  },
  answer: {
    src: "/vita/answer-final.png",
    avatarSrc: "/vita/answer-avatar-final.png",
    alt: "维塔打开书陪你核对答案",
  },
  error: {
    src: "/vita/error-full.png",
    avatarSrc: "/vita/error-avatar-final.png",
    alt: "维塔准备和你一起重试",
  },
};

export function Vita({
  state = "default",
  size = 180,
  className = "",
  avatar = false,
}: {
  state?: VitaState;
  size?: number;
  className?: string;
  avatar?: boolean;
}) {
  const asset = assets[state];
  return (
    <Image
      alt={asset.alt}
      className={className}
      data-testid={`vita-${state}`}
      height={size}
      loading={avatar ? "lazy" : "eager"}
      sizes={`${size}px`}
      src={avatar ? asset.avatarSrc : asset.src}
      unoptimized
      width={size}
    />
  );
}
