export interface ShareableReport {
  title: string;
  summary: string;
  markdown: string;
}

interface NavigatorLike {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText(value: string): Promise<void> };
}

export function reportFileName(title: string) {
  const withoutExtension = title.replace(/\.[^.]+$/, "");
  const safe = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/^\.+/, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safe || "学习材料"}-学习诊断报告.md`;
}

export async function shareReport(
  report: ShareableReport,
  navigatorLike: NavigatorLike = navigator,
) {
  if (navigatorLike.share) {
    const file = new File([report.markdown], reportFileName(report.title), {
      type: "text/markdown;charset=utf-8",
    });
    const fileData: ShareData = {
      title: `${report.title} · 学习诊断报告`,
      text: report.summary,
      files: [file],
    };
    try {
      await navigatorLike.share(
        navigatorLike.canShare?.(fileData)
          ? fileData
          : { title: fileData.title, text: report.summary },
      );
      return "SHARED" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "CANCELLED" as const;
      }
    }
  }
  if (!navigatorLike.clipboard) {
    throw new Error("当前浏览器无法分享或复制报告。 ");
  }
  await navigatorLike.clipboard.writeText(report.summary);
  return "COPIED" as const;
}

export function downloadReport(title: string, markdown: string) {
  const url = URL.createObjectURL(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(title);
  link.click();
  URL.revokeObjectURL(url);
}
