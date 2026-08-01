import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Icon } from "@/ui/Icon";
import { MessageBubble } from "@/ui/MessageBubble";
import { ProgressBar } from "@/ui/ProgressBar";
import { StatusBadge } from "@/ui/StatusBadge";
import { VITA_STATES, Vita } from "@/ui/Vita";

describe("品牌基础组件", () => {
  it("装饰图标不进入无障碍树，有名称的图标可被识别", () => {
    const { rerender } = render(<Icon name="upload" />);
    expect(document.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    rerender(<Icon label="上传" name="upload" />);
    expect(screen.getByRole("img", { name: "上传" })).toBeVisible();
  });

  it("按钮保留原生行为并提供稳定变体", () => {
    render(
      <Button disabled variant="primary">
        开始学习
      </Button>,
    );

    expect(screen.getByRole("button", { name: "开始学习" })).toBeDisabled();
    expect(screen.getByRole("button")).toHaveClass("ui-button-primary");
  });

  it("卡片和聊天气泡保留语义与角色区别", () => {
    render(
      <Card aria-label="提示卡">
        <MessageBubble role="ASSISTANT">先说说你记得什么。</MessageBubble>
      </Card>,
    );

    expect(screen.getByLabelText("提示卡")).toHaveClass("ui-card");
    expect(screen.getByRole("article", { name: "维塔的消息" })).toHaveClass(
      "message-bubble-assistant",
    );
  });

  it("进度条约束越界数值并暴露可读进度", () => {
    render(<ProgressBar label="材料完成进度" max={100} value={140} />);

    const progress = screen.getByRole("progressbar", { name: "材料完成进度" });
    expect(progress).toHaveAttribute("aria-valuenow", "100");
    expect(progress.firstElementChild).toHaveStyle({ width: "100%" });
  });

  it("状态标签同时使用文案和色调表达状态", () => {
    render(<StatusBadge tone="success">已完成</StatusBadge>);

    expect(screen.getByText("已完成")).toHaveClass("status-badge-success");
  });

  it("维塔七态都有固定本地资产与替代文本", () => {
    render(
      <div>
        {VITA_STATES.map((state) => (
          <Vita key={state} state={state} />
        ))}
      </div>,
    );

    expect(screen.getAllByRole("img")).toHaveLength(7);
    for (const state of VITA_STATES) {
      const source = screen.getByTestId(`vita-${state}`).getAttribute("src") ?? "";
      expect(decodeURIComponent(source)).toContain(
        `/vita/${state === "encourage" ? "encouragement" : state}.png`,
      );
    }
  });
});
