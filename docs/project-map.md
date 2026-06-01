# Veritas 代码地图

> 只做代码导航与模块边界。产品规格看 `docs/design-guide.md`，工作规则看 `AGENTS.md`，本文件不复述这两者。
> 最后对照真实代码：2026-05-29

## 依赖方向（单向）

```text
_components (UI)
  -> _hooks
  -> store/examStore + lib/*
  -> app/api/* (薄转发)
  -> lib/agents/*
  -> lib/llm
```

UI 组件不直接 fetch；fetch 封装在 `_lib/*Api.ts`；LLM 输出清洗只在 `lib/agents/*`。

## 状态中枢（改动波及面最大）

- `store/examStore.tsx` — store 门面，只导出 `ExamProvider` / `useExam` / Context，并 re-export 公共契约。所有 hook 和组件都经此依赖 store。
- `store/examState.ts` — store 类型、Action、`initialState`。
- `store/examReducer.ts` — 全局诊断 reducer，维护节点、对话、层级、报告状态。
- `store/examStateHelpers.ts` — store 纯函数（状态归一化、节点层级状态、支持记录、节点排序、对话状态派生）。
- `store/examSession.ts` — sessionStorage 当前会话恢复 / 保存。

## lib/（确定性逻辑，不调用 LLM）

- `types.ts` — 全栈共享类型；改字段会波及 store / agents / hooks / 组件。
- `examFlow.ts` — 层级推进纯函数（被 `store` 和 `useQuestionFlow` 用）。
- `score.ts` — 评分计算。
- `localHistory.ts` — IndexedDB 本地历史；`PersistedDiagnosisState` 持久化 schema（`LOCAL_DIAGNOSIS_SCHEMA_VERSION`），读取时丢弃版本不符的旧记录；只存跨会话需恢复的诊断态。
- `apiResponse.ts` / `parseJSON.ts` — 防御性响应解析 / JSON 抽取。
- `pdf.ts` — 上传文件抽文本（PDF/DOCX/PPTX/TXT/MD）。
- `llm.ts` — DeepSeek 客户端封装；未经确认不改 provider / 模型名。

## lib/agents/（LLM 调用 + 输出清洗，唯一允许清洗的地方）

- `analyzer.ts` — Agent 1 抽节点：最多 8 个、过滤非法字段。
- `questioner.ts` — Agent 2 分层对话：system prompt + LLM 输出解析 + 朴素 fallback。
- `evaluator.ts` — Agent 3 报告：过滤伪造原话，用本地分覆盖模型分。

## app/api/（薄转发层，不做清洗）

- `analyze/route.ts` → `analyzer`；`question/route.ts` → `questioner`；`evaluate/route.ts` → `evaluator`。

## app/exam/（唯一活跃页面）

`page.tsx` 只装配 UI；行为聚合在 `useExamController`。

- `_hooks/useExamController.ts` — 编排层，把下面 4 个 hook + store 组合成页面 view model。
- `_hooks/useMaterialAnalysis.ts` — 上传材料 → `/api/analyze`。
- `_hooks/useQuestionFlow.ts` — 对话/提示/答案请求编排 → `/api/question`；按 `nodeId` 写回，防节点间串位。
- `_hooks/useReportFlow.ts` — 报告生成 → `/api/evaluate`，含失败重试。
- `_hooks/useLocalDiagnosisHistory.ts` — IndexedDB 历史加载/保存/置顶/重命名/删除。
- `_lib/examPageTypes.ts` — hooks 间共享契约（改它影响多个 hook）。
- `_lib/examPageHelpers.ts` — 纯展示工具（层级中文名、状态样式、阶段文案、诊断计划文本）。
- `_lib/materialFile.ts` — 文件类型/大小校验。
- `_lib/questionFlowTransitions.ts` — Agent 2 响应后的状态推进动作构建（纯函数，hook 负责 dispatch）。
- `_lib/questionApi.ts` / `reportApi.ts` — fetch 薄封装 + 前端响应归一化。
- `_components/` — `WorkspaceSidebar`（左工作区）、`KnowledgeNodeRail`（中左节点栏）、`ConversationPanel`（对话+输入，含语音 mock 按钮）、`DiagnosticPanel`（右诊断旁注）、`ReportModal`（报告弹层）、`ActionMenu`（三点菜单）。

## 其他

- `app/page.tsx` — 重定向到 `/exam`。
- `app/layout.tsx` — 全局布局 + `ExamProvider`。
- `components/ReportCard.tsx` — 报告卡片，被 `ReportModal` 使用。

## 数据流

1. **上传**：`useMaterialAnalysis` → `/api/analyze` → `pdf` → `analyzer` → `store`
2. **对话**：`useQuestionFlow` → `/api/question` → `questioner`（推进用 `examFlow`）→ `store`
3. **报告**：`useReportFlow` → `/api/evaluate` → `evaluator` → `score` → `ReportModal` → `ReportCard`

## 测试

`tests/` 覆盖：`analyzer`、`analyzeRoute`、`questioner`、`evaluator`、`examFlow`、`examPageHelpers`、`score`、`examStore`、`useQuestionFlow`、`questionFlowTransitions`、`localHistory`、`apiResponse`、`pdf`、`llm`、`ReportCard`。

验证命令见 `AGENTS.md`。
