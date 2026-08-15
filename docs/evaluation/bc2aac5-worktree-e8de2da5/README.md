# bc2aac5 工作区真实 20-session 回归

本目录记录在 `bc2aac5832355e5caabc473a183311e5994a54d7` 上，对任务 3、任务 4 未提交工作区进行的真实回归。运行前后，已跟踪差异指纹均为 `e8de2da52e8962bb8c946c9c0573c3355f7a67be`，说明测试没有改动用户已有产品代码。

## 正式样本口径

- 分母：S01—S20，共 20 个 session；沿用旧评测的材料、用户输入和顺序。
- 链路：Microsoft Edge 1440×900 → 真实文件输入 → Next.js 生产构建 → `/api/agents` → `deepseek-v4-flash` → IndexedDB → Agent 3 报告。
- 没有 Mock、直接 API 调用、内部函数调用、人工写入状态或人工替换模型输出。
- Playwright 的 `setInputFiles` 代替操作系统文件选择窗口，但文件进入的是产品真实上传、解析、抽取、审计和首问链路。
- IndexedDB 仅做只读观测。
- 每个 case 的目标交互结束后先截图；为生成四层最终报告，脚本再点击可见的“看答案”。两部分在 JSON 中分别标记为“目标交互”和“自动补全”，不得混为用户自主表现。
- 20 个 case 均使用自动补全生成报告，共自动点击答案 67 次；因此报告评测覆盖的是“完整上下文与状态忠实度”，不是 20 个用户都自然完成了四层。

## 证据

- `raw/S01.json`—`raw/S20.json`：完整步骤、操作前后状态、去敏 Agent 请求/响应、重试、浏览器问题和最终存储。
- `screenshots/S01-target.png`—`screenshots/S20-target.png`：目标交互结束时的真实界面。
- `reports/S01.md`—`reports/S20.md`：真实下载报告。
- `reports/S01.png`—`reports/S20.png`：真实报告界面。
- `execution-log.md`：执行批次、失败与重试口径。
- `assessments.md`：20 个 case 的逐案评分。
- `badcases.md`：结构化问题、根因和优先级。
- `comparison.md`：修复前后量化对照与简历边界。
- `summary.md`：最终结论。

## 总结口径

- 技术链路：20 / 20 最终完成；19 / 20 无需用户侧重试。
- 产品判定：13 PASS、7 PARTIAL、0 FAIL；平均 4.00 / 5。
- 四项修复中，任务 1、2、4 得到真实正向证据；任务 3 显著改善但未完全修复。
- 仍不应描述为“全面通过”或“生产稳定性已验证”：存在 1 次 502、2 次双正式问题、1 次非回答被计入停滞、报告语义残留问题，以及 20 / 20 Markdown 内部枚举泄漏。
