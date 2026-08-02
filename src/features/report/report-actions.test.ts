import { describe, expect, it, vi } from "vitest";

import { reportFileName, shareReport } from "./report-actions";

describe("报告下载与分享", () => {
  it("把不安全文件名收敛为本地 Markdown 文件名", () => {
    expect(reportFileName("../水循环<script>报告.md")).toBe(
      "水循环-script-报告-学习诊断报告.md",
    );
  });

  it("支持文件分享时只分享报告文件和摘要", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const clipboard = { writeText: vi.fn() };
    const navigatorLike = {
      canShare: vi.fn().mockReturnValue(true),
      share,
      clipboard,
    };

    await shareReport(
      { title: "水循环", summary: "已理解主要动力。", markdown: "# 报告" },
      navigatorLike,
    );

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "已理解主要动力。",
        files: [expect.objectContaining({ name: "水循环-学习诊断报告.md" })],
      }),
    );
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it("无 Web Share API 时只复制报告摘要", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(
      shareReport(
        { title: "水循环", summary: "已理解主要动力。", markdown: "# 报告" },
        { clipboard: { writeText } },
      ),
    ).resolves.toBe("COPIED");
    expect(writeText).toHaveBeenCalledWith("已理解主要动力。");
  });
});
