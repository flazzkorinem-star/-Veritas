import type { ReactNode } from "react";

export function MessageBubble({
  role,
  children,
}: {
  role: "USER" | "ASSISTANT";
  children: ReactNode;
}) {
  const isAssistant = role === "ASSISTANT";
  return (
    <article
      aria-label={isAssistant ? "维塔的消息" : "我的消息"}
      className={`message-bubble message-bubble-${isAssistant ? "assistant" : "user"}`}
    >
      {children}
    </article>
  );
}
