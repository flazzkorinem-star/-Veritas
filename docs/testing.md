# 测试与验收

Veritas 把测试分成三层。日常检查不调用真实模型，真实 DeepSeek 回归必须由开发者明确开启。

## 日常质量门禁

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

`npm run test` 运行 `src` 下的 Vitest 单元、组件和集成测试。它覆盖状态机、材料解析、Agent 契约、API 边界、IndexedDB、工作区和报告。

`npm run test:e2e` 只运行 `e2e/core/`，使用本地生产构建和 Edge：

| 文件                          | 主要范围                         |
| ----------------------------- | -------------------------------- |
| `workspace.spec.ts`           | 工作区、任务操作、键盘和刷新恢复 |
| `material-processing.spec.ts` | 取消、重试和处理中断恢复         |
| `file-formats.spec.ts`        | 全部支持格式、OCR 和来源         |
| `learning-flow.spec.ts`       | 提示、答案、四层诊断和报告       |
| `speech.spec.ts`              | 语音转写与权限失败               |
| `mobile.spec.ts`              | 390×844、横屏、软键盘和移动浮层  |
| `security.spec.ts`            | 安全响应头、错误脱敏和纯文本渲染 |
| `acceptance.spec.ts`          | 可访问性、平板断点和资源预算     |

核心 E2E 同时使用 1440×900 桌面项目和 390×844 移动项目。只适用于某一设备的断言会在另一项目明确跳过。

## 真实模型回归

`e2e/real/` 保留少量高价值真实链路，默认不会产生 DeepSeek 调用。完整链路示例：

```powershell
$env:VERITAS_REAL_DEEPSEEK="1"
npm run test:real -- full-journey-real --project=desktop-edge --workers=1
```

材料性能测试还需要：

```powershell
$env:RUN_REAL_PERFORMANCE="1"
```

真实回归使用 `tests/fixtures/real-agent/` 中的合成或公开测试材料。证据写到已忽略的 `output/real-e2e/`，不修改文档，也不读取个人材料。

不要在命令、日志、截图或测试附件中输出 API Key。真实测试失败时，先检查脱敏后的错误类型；不要通过打印环境变量定位问题。

## 核心验收口径

- 上传后生成可追溯知识地图和记忆层首问，提示与答案入口可用。
- 普通对话不会改变诊断状态；真正回答问题时才进入确定性状态机。
- 连续三轮没有进展后，Vita 自动讲清答案，再用同层小题验证。
- 任务、消息、草稿、主题进度和报告可从 IndexedDB 恢复。
- 所有模型结构化输出通过 Zod；模型文本不能直接改层级、分数或完成状态。
- API、日志、浏览器分块和测试产物不暴露 Key、系统提示词或上游正文。
- 1440×900 与 390×844 均可完成主流程，没有横向溢出或未处理的浏览器错误。
- 文本型 PDF、DOCX、PPTX 在文件不超过 5 MB、解析文本不超过 30 万字符时，以三分钟内完成为目标。

历史真实材料、容量和模型回归结果只保留简要结论，见 [validation.md](validation.md)。
