import type { SVGProps } from "react";

export type IconName =
  | "upload"
  | "search"
  | "menu"
  | "close"
  | "microphone"
  | "send"
  | "chevron-left"
  | "tasks"
  | "topics"
  | "progress"
  | "hint"
  | "answer";

const paths: Record<IconName, React.ReactNode> = {
  upload: <path d="M12 4v16m-8-8h16" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  menu: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  microphone: (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  send: <path d="m5 12 7-7 7 7m-7-7v14" />,
  "chevron-left": <path d="m14 6-6 6 6 6" />,
  tasks: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4m8-4v4M8 11h8m-8 4h5" />
    </>
  ),
  topics: (
    <>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z" />
      <path d="M8 4v13a3 3 0 0 0-3 3" />
    </>
  ),
  progress: (
    <>
      <path d="M4 19V9m6 10V5m6 14v-7m4 7V3" />
    </>
  ),
  hint: (
    <>
      <path d="M18.5 4.5C12 4.8 7.3 8.3 6.2 15.2c3.7.7 6.9-.3 9-2.6 2.1-2.3 2.9-5.4 3.3-8.1Z" />
      <path d="M5 20c1.5-4.2 4.2-7.2 8.5-9.2" />
    </>
  ),
  answer: (
    <>
      <path d="M4 5.5c3.1-.7 5.8.1 8 2.2v11c-2.2-2.1-4.9-2.9-8-2.2Z" />
      <path d="M20 5.5c-3.1-.7-5.8.1-8 2.2v11c2.2-2.1 4.9-2.9 8-2.2Z" />
    </>
  ),
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  label?: string;
  size?: number;
}

export function Icon({ name, label, size = 20, ...props }: IconProps) {
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      data-icon={name}
      fill="none"
      height={size}
      role={label ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.6"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
