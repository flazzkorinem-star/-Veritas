# Veritas 代码地图

> 只做代码导航与模块边界。产品规格看 `docs/design-guide.md`，工作规则看 `AGENTS.md`，本文件不复述这两者。
> 最后对照真实代码：2026-07-28

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
- `localHistory.ts` — IndexedDB 材料记录；每条 v4 记录对应一张书架卡片及其诊断状态，提供保存 / 读取 / 排序 / 删除和卡片元数据同步。
- `apiResponse.ts` / `parseJSON.ts` — 防御性响应解析 / JSON 抽取。
- `pdf.ts` — 上传文件抽文本（PDF/DOCX/PPTX/TXT/MD）。
- `llm.ts` — DeepSeek 客户端封装；全局关闭思考模式（`thinking:disabled`，防答案漏进 reasoning_content 致 content 空白）；未经确认不改 provider / 模型名。

## lib/agents/（LLM 调用 + 输出清洗，唯一允许清洗的地方）

- `analyzer.ts` — Agent 1 抽节点：1–15 个、过滤非法字段。
- `questioner.ts` — Agent 2 分层对话：判官调用(判定通过/盲点，JSON) + 对话调用(自然语言，不套 JSON) + 场景 fallback；层级推进等确定性状态归代码。
- `evaluator.ts` — Agent 3 报告：过滤伪造原话，用本地分覆盖模型分。

## app/api/（薄转发层，不做清洗）

- `analyze/route.ts` → `analyzer`；`question/route.ts` → `questioner`；`evaluate/route.ts` → `evaluator`。

## app/（书架首页）

- `page.tsx` — 材料库入口，装配 `MaterialLibrary` 与 `useMaterialLibrary`。
- `_hooks/useMaterialLibrary.ts` — 加载材料记录、批量逐份解析及其进度状态、卡片打开 / 置顶 / 重命名 / 删除。
- `_lib/materialApi.ts` — `/api/analyze` 客户端请求与响应校验。
- `_lib/materialLibrary.ts` — 材料记录构造、进度派生、批量导入隔离。
- `_lib/materialFile.ts` — 书架与工作台共用的文件类型 / 大小校验和上传格式声明。
- `_lib/materialRecord.ts` — 书架与工作台共用的记录标题、id 和诊断计划文本纯函数。
- `_components/MaterialLibrary.tsx` / `MaterialCard.tsx` — 书架布局、上传入口、逐份解析进度、材料卡片与三点菜单。

## app/exam/（诊断工作台）

`page.tsx` 只装配 UI；行为聚合在 `useExamController`。

- `_hooks/useExamController.ts` — 编排层，把下面 4 个 hook + store 组合成页面 view model。
- `_hooks/useMaterialAnalysis.ts` — 上传材料 → `/api/analyze`。
- `_hooks/useQuestionFlow.ts` — 对话/提示/答案请求编排 → `/api/question`；按 `nodeId` 写回，防节点间串位。
- `_hooks/useReportFlow.ts` — 报告生成 → `/api/evaluate`，含失败重试。
- `_hooks/useLocalDiagnosisHistory.ts` — 当前材料自动保存、工作台材料切换及材料记录置顶 / 重命名 / 删除。
- `_lib/examPageTypes.ts` — hooks 间共享契约（改它影响多个 hook）。
- `_lib/examPageHelpers.ts` — 纯展示工具（层级中文名、状态样式、阶段文案）。
- `_lib/questionFlowTransitions.ts` — Agent 2 响应后的状态推进动作构建（纯函数，hook 负责 dispatch）。
- `_lib/questionApi.ts` / `reportApi.ts` — fetch 薄封装 + 前端响应归一化。
- `_components/` — `WorkspaceSidebar`（返回书架 + 材料切换）、`KnowledgeMap`（中左知识地图）、`ConversationPanel`（对话+输入，含语音 mock 按钮）、`DiagnosticPanel`（右诊断旁注）、`ReportModal`（报告弹层）。

## 其他

- `app/layout.tsx` — 全局布局 + `ExamProvider`。
- `components/ActionMenu.tsx` — 书架卡片、材料列表和知识节点共用的三点菜单。
- `components/ReportCard.tsx` — 报告卡片，被 `ReportModal` 使用。

## 数据流

1. **书架上传**：`useMaterialLibrary` → `materialApi` → `/api/analyze` → `pdf` → `analyzer` → `localHistory`（逐份保存）
2. **选择材料**：书架卡片 → `RESTORE` 对应材料状态 → `/exam`
3. **对话**：`useQuestionFlow` → `/api/question` → `questioner`（推进用 `examFlow`）→ `store` → 自动保存材料记录
4. **报告**：`useReportFlow` → `/api/evaluate` → `evaluator` → `score` → `ReportModal` → `ReportCard`

## 测试

`tests/` 覆盖：`analyzer`、`analyzeRoute`、`questioner`、`evaluator`、`examFlow`、`examPageHelpers`、`score`、`examStore`、`useQuestionFlow`、`questionFlowTransitions`、`localHistory`、`apiResponse`、`pdf`、`llm`、`ReportCard`、`KnowledgeMap`、`MaterialLibrary`、`WorkspaceSidebar`、材料库进度 / 批量导入。

验证命令见 `AGENTS.md`。
