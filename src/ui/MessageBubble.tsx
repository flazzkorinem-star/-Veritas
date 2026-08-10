import type { ReactNode } from "react";

import { Vita, type VitaState } from "@/ui/Vita";

export function MessageBubble({
  role,
  children,
  vitaState = "default",
}: {
  role: "USER" | "ASSISTANT";
  children: ReactNode;
  vitaState?: VitaState;
}) {
  const isAssistant = role === "ASSISTANT";
  return (
    <article
      aria-label={isAssistant ? "维塔的消息" : "我的消息"}
      className={`message-bubble message-bubble-${isAssistant ? "assistant" : "user"}`}
    >
      {isAssistant ? (
        <span aria-hidden="true" className="message-avatar">
          <Vita avatar size={48} state={vitaState} />
        </span>
      ) : null}
      {children}
      {!isAssistant ? (
        <span aria-hidden="true" className="message-avatar-user">
          <span />
        </span>
      ) : null}
    </article>
  );
}
