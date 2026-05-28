# Veritas 项目地图

Last synchronized: 2026-05-28

## 用途

本文件只做代码导航，不做产品规格。产品真相源是 `docs/design-guide.md`，Agent 和工程规则看 `AGENTS.md`。

当前代码已经具备 v3.0 第一条可用链路和桌面端三栏工作台第一版。旧字段和旧组件仍有少量兼容保留，后续改造应继续打磨本地历史、报告体验并清理兼容字段，而不是回到“三轮追问”版本。

## 当前差距

已完成的 v3.0 基线：

- 文件上传后抽知识点。
- Agent 1 最多抽 8 个节点，少材料不凑数。
- Agent 2 按认知层级推进，不再按固定轮次推进。
- 每个知识点有独立对话记录；点击中间知识点列表会切换对应对话。
- 对话请求返回时按 `nodeId` 写回目标知识点，避免用户切换节点后异步回复污染当前对话。
- 知识点完成后会写入完成状态，并在知识点栏和对话区提示已完成。
- Agent 3 已生成 v3.0 报告数据，分数使用本地快速路径计分；报告弹层现在按文件级摘要 + 折叠知识点条目展示，避免把所有问答平铺。
- 状态仍会写入 `sessionStorage` 做当前会话恢复，同时 `/exam` 已用 IndexedDB 自动保存本地诊断历史。左侧“最近”显示诊断记录，一条上传材料对应一条记录，记录下的知识点只显示在中间知识点栏。`sessionStorage` 只负责刷新当前页后的快速恢复，IndexedDB 是跨会话本地历史来源。

v3.0 目标：

- 上传材料 -> 抽高价值知识节点 -> 节点导航 -> 分层追问 -> 诊断报告。
- Agent 1 单次最多 8 个节点，少材料不凑数，并输出适用层级。
- Agent 2 按认知层级推进，不再按固定轮次推进。
- 每个节点先走快速路径 1-3，再由用户选择“完成”或“深入”。
- 提示和答案由 Agent 2 基于当前上下文动态生成。
- 报告以层级通过情况、用户原话证据和盲点诊断为主，分数只是辅助。
- 主界面目标是三栏工作台：左侧本地工作区，中间对话，右侧诊断面板。

## 改造优先级

1. 数据结构、流程状态和状态层接入已完成：`lib/types.ts`、`lib/examFlow.ts`、`lib/score.ts` 已具备 v3.0 底座，`store/examStore.tsx` 已能承载节点、层级、路径、提示/答案/类比记录、Agent 2 结构化响应和报告状态。
2. Agent 1 和 `/api/analyze` 节点链路已完成：Agent 1 负责节点质量校验和最多 8 个节点限制，`/api/analyze` 负责把已校验节点薄转发给页面链路。
3. Agent 2 和 `/api/question` 已完成第一条 v3.0 可验证切片：返回自然回复、当前层级、是否通过、下一步动作、盲点摘要、支持方式和可选下一层级，并保留旧 `question` 字段作为页面迁移桥接。当前代码只接受真实用户作答后的通过判断，空提交和“完成/继续深入”等流程控制文本不会被当作诊断作答。
   TODO：`lib/types.ts` 里的旧 `levelPassed` 和 `question` 兼容字段仍待后续清理；当前 store 已优先读取 `passedCurrentLevel`。
4. `/exam` 的页面入口已解耦：`app/exam/page.tsx` 只负责装配工作台；上传分析、本地历史、Agent 请求、层级推进、报告生成和 UI 区块分别拆到 `app/exam/_hooks`、`app/exam/_lib` 和 `app/exam/_components`。
5. Agent 3、`/api/evaluate`、评分集成已完成第一条 v3.0 报告数据链路；报告弹层已改成摘要优先和知识点折叠展示。
6. 三栏 UI 第一版已完成：`/exam` 现在是桌面端三栏工作台，外层约为 260px 左栏 / 自适应中间 / 360px 右栏，中间区内嵌约 220px 知识点列表；支持空态上传/粘贴材料、上传后诊断计划消息、微信式对话区、右侧诊断旁注、报告弹层、上传材料标题清洗、IndexedDB 本地历史、新建诊断自动保留历史、用户消息即时入流、提示/答案用户气泡、答案后的层级选择，以及诊断记录和知识点的 DeepSeek 风格固定浮层三点菜单。

报告分两步处理：Agent 3 的报告数据结构已完成第一条 v3.0 数据链路；`/exam` 报告弹层已完成摘要优先和知识点折叠展示，独立 `/report` 页面仍是备用容器。

不要先重写全部 UI，也不要先删除旧代码。旧代码里的文件解析、LLM 调用、错误处理、测试和部署配置仍然有价值。

## 主要入口

### 根目录

- `docs/design-guide.md` — 产品规格真相源。
- `AGENTS.md` — Agent 协作、工程原则、验证规则。
- `README.md` — 面向用户和面试官的项目说明，已对齐 v3.0 当前状态。
- `package.json` — 脚本和依赖。
- `.env.local` — 本地密钥文件，禁止读取、打印或修改真实值。

### 页面与 API

- `app/page.tsx` — 根路径入口。当前直接重定向到 `/exam`，避免继续露出旧首页 UI。
- `app/exam/page.tsx` — 当前主诊断页入口。现在只做页面装配：左侧工作区、中间知识点栏、对话区、右侧诊断旁注和报告弹层都从独立组件引入，行为由 `useExamController` 聚合。
- `app/exam/_hooks/useExamController.ts` — `/exam` 的轻量编排层。负责把 store、上传分析、对话推进、报告、本地历史和 UI 状态组合成页面需要的 view model；对页面显式列出返回字段，避免子 hook 返回值通过 spread 隐式外泄。
- `app/exam/_hooks/useMaterialAnalysis.ts` — 上传或粘贴材料后的分析流程，负责文件提交、标题清洗、诊断计划消息和分析状态。
- `app/exam/_hooks/useQuestionFlow.ts` — Agent 2 请求、初始问题触发、提示/答案、层级跳转、快速路径完成和节点切换。用户提交普通回答、提示或答案时，用户气泡会先写入当前节点对话，再请求 Agent 回复；异步请求会捕获发起时的 `nodeId`，返回后只写回目标节点，避免知识点之间记忆串位。
- `app/exam/_hooks/useReportFlow.ts` — Agent 3 报告生成、报告弹层状态、报告按钮决策和报告失败重试。
- `app/exam/_hooks/useLocalDiagnosisHistory.ts` — IndexedDB 本地历史加载、自动保存、记录加载、置顶、重命名和删除。
- `app/report/page.tsx` — 当前报告页容器。它只读取 `overallScore`、`summary` 和 `nodes`，报告字段展示由 `components/ReportCard.tsx` 承担。
- `app/api/analyze/route.ts` — 调用 Agent 1，返回 `id`、`name`、`context`、`sourceExcerpt`、`suitableLevels` 和 `priorityReason`；节点质量校验留在 `lib/agents/analyzer.ts`。
- `app/api/question/route.ts` — 调用 Agent 2。当前接收节点、当前层级、层级状态、对话历史和 `normal` / `hint` / `answer` 请求类型；不再拒绝 3 个用户回答后的历史，返回 Agent 2 的结构化诊断响应。
- `app/api/evaluate/route.ts` — 调用 Agent 3。当前接收 `nodeConversations` 和 `nodeLevelStates`，由 Agent 3 生成 v3.0 报告并用本地快速路径分数覆盖模型分数。

### 组件

- `app/exam/_components/WorkspaceSidebar.tsx` — `/exam` 左侧工作区，包含新建诊断、本地历史、记录菜单和设置入口占位。
- `app/exam/_components/KnowledgeNodeRail.tsx` — `/exam` 中间左侧知识点栏，包含材料标题、书本图标、阶段文字、选中态和知识点菜单。
- `app/exam/_components/ConversationPanel.tsx` — `/exam` 中间对话区和底部输入区，包含消息气泡、提示/答案、重试、拖拽上传和语音 mock 入口。
- `app/exam/_components/DiagnosticPanel.tsx` — `/exam` 右侧诊断旁注，包含层级状态、分数、目标、路径状态、盲点和报告按钮。
- `app/exam/_components/ReportModal.tsx` — `/exam` 当前页报告弹层，负责摘要指标和知识点折叠展示。
- `app/exam/_components/ActionMenu.tsx` — 诊断记录和知识点共用的三点操作菜单。当前是固定定位浮层，按触发按钮锚点定位，支持点击外部和 Esc 关闭；分享入口保留禁用态。
- `components/InputForm.tsx` — 文件上传入口。当前仍可保留。
- `components/VoiceInput.tsx` — 语音输入。不是 v3.0 核心，改造早期不要优先动。
- `components/ProgressBar.tsx` — 旧进度条。后续可能被右侧诊断面板替代。
- `components/ReportCard.tsx` — 报告卡片。已从旧掌握等级字段切到 v3.0 字段读取，最小展示层级状态、盲点、用户原话证据、支持使用、正确理解、下一步和材料证据；当前由 `/exam` 报告弹层放进折叠条目中展示。
- `components/Mascot.tsx` — 非核心组件。除非阻碍新 UI，否则暂不处理。

### 核心逻辑

- `lib/types.ts` — 已完成 v3.0 第一阶段底座。新增 `CognitiveLevel`、`LevelStatus`、`SupportRecord`、`NodeLevelState`、`QuestionNextAction`、`KnowledgeNode.suitableLevels`、`KnowledgeNode.priorityReason`、`KnowledgeNode.pinned`，并扩展 `QuestionResponse` 支持自然回复、当前层级、通过状态、下一步动作和盲点摘要。`LevelStatus` 包含 `answer_assisted`，用于表达看过答案后继续推进但不计独立通过的层级。`ExamReport` / `NodeEvaluation` 已切到 v3.0 报告字段：层级状态、用户原话证据、盲点、支持记录、正确理解和下一步建议；旧掌握等级字段已从 `NodeEvaluation` 移除。
- `app/exam/_lib/examPageHelpers.ts` — `/exam` 页面纯工具，包含层级中文名、书本颜色、报告关注判断、状态样式、知识点阶段文案和诊断计划文本；知识点完成时阶段文案优先显示“已完成”。上传后的诊断计划通过 `ConversationTurn.kind = 'diagnosis_plan'` 标识，不再依赖中文文案嗅探。
- `app/exam/_lib/materialFile.ts` — `/exam` 文件类型和大小校验。
- `app/exam/_lib/questionApi.ts` — `/exam` 调用 `/api/question` 的薄封装，包含前端响应归一化。
- `app/exam/_lib/reportApi.ts` — `/exam` 调用 `/api/evaluate` 的薄封装。
- `lib/examFlow.ts` — 提供层级推进纯函数：认知层级常量、快速/深入路径常量、适用层级判断、初始层级状态、下一适用层级、深入路径入口、下一步动作、支持记录、状态更新、按 `nodeId` 追加对话和节点完成提示。当前深入路径只自动覆盖分析和评价，创造层不自动进入。当前已被 `store/examStore.tsx` 和 `app/exam/_hooks/useQuestionFlow.ts` 用于层级推进。
- `lib/score.ts` — 已保留旧掌握等级评分，并新增快速路径评分：记忆 33、理解 33、应用 34；深入层级不参与基础分；看答案后通过不计该层分。
- `lib/apiResponse.ts` — 保留。前端 API 响应仍应走防御性解析。
- `lib/localHistory.ts` — IndexedDB 本地历史。保存一条诊断记录的标题、置顶状态、创建/更新时间、`schemaVersion` 和 `PersistedDiagnosisState`。`PersistedDiagnosisState` 是显式持久化 schema，只包含跨会话需要恢复的诊断态；`currentAgentResponse`、`error` 等运行态字段不写入 IndexedDB。顶层 `title` 和 `pinned` 是列表索引缓存，保存时从持久化状态派生；加载旧记录时通过 `migrateDiagnosisRecord` 归一化到当前 schema。当前只做当前浏览器本地保存，不涉及账号或云同步。
- `lib/pdf.ts` — 保留。文件解析不是当前改造重点。
- `lib/llm.ts` — 保留。不要未经确认修改 DeepSeek provider 或模型名。

### Agent

- `lib/agents/analyzer.ts` — Agent 1。已对齐 v3.0：最多 8 个节点、少材料不凑数、输出 `suitableLevels`（共享英文 `CognitiveLevel`）和 `priorityReason`；缺字段或非法层级会被丢弃，不连续层级会归一化为从 `memory` 到最高适用层级的连续路径。
- `lib/agents/questioner.ts` — Agent 2。已从“只提问”升级为“诊断对话者”：负责提示词、LLM 输出解析、层级推进归一化、hint/answer 不独立通过、suitableLevels 约束和 malformed 输出 fallback；没有真实用户作答时不会接受模型给出的通过判断。
- `lib/agents/evaluator.ts` — Agent 3。已改成基于层级通过、原话证据、盲点和下一步建议生成报告；会过滤伪造原话和流程控制文本，汇总提示/答案/类比记录，并使用本地快速路径分数覆盖模型分数。

### 状态管理

- `store/examStore.tsx` — 已接入 v3.0 状态层底座，同时保留旧字段兼容页面渐进迁移。当前支持 `currentNodeId`、`currentLevel`、`nodeLevelStates`、`nodePathStates`、`currentAgentResponse` 和 `reportStatus`；`nodePathStates` 记录每个节点的路径和完成状态，`COMPLETE_NODE` 会按节点写入完成标记；`SET_REPORT` 会进入 `reviewing` phase，表示正式报告已生成但诊断对话仍可继续，继续对话会把 `reportStatus` 标记为 `stale`；知识点支持重命名、置顶和删除；提示、答案、主动类比记录只存放在对应节点层级的 `supportRecords` 中，避免重复状态；`ADD_TURN`、`SET_AGENT_RESPONSE`、`SET_CURRENT_LEVEL` 和 `NEXT_NODE` 支持按 `nodeId` 定向更新，`NEXT_NODE.fromNodeId` 会阻止延迟请求在用户切换节点后误跳转；旧 `currentQuestion`、`currentNodeIndex`、`nodeConversations` 仍保留桥接。`getDialogueStatus` 从 `currentAgentResponse` 派生当前对话状态，不单独持久化。
- 本地诊断历史已接入 IndexedDB；当前仍保留 `sessionStorage` 做会话恢复。页面刷新优先恢复 `sessionStorage` 中的当前工作区；左栏历史列表和跨会话记录来自 IndexedDB。左栏“最近”显示诊断记录，记录下的知识点只显示在中间知识点栏。新建诊断会清空当前工作区，但当前诊断会自动保留在本地历史中。

### 测试

- `tests/lib/analyzer.test.ts` — 改 Agent 1 时同步改；当前覆盖最多 8 个节点、少材料不凑数、必填字段过滤和 `suitableLevels` 连续路径归一化。
- `tests/app/analyzeRoute.test.ts` — 覆盖 `/api/analyze` 文件上传和 v3.0 节点字段透传；节点质量规则由 `tests/lib/analyzer.test.ts` 覆盖。
- `tests/lib/questioner.test.ts` — 覆盖 Agent 2 结构化解析、normal/hint/answer、suitableLevels 约束、malformed fallback、三轮后不固定停止，以及无真实用户作答时不通过。
- `tests/lib/evaluator.test.ts` — 覆盖 Agent 3 v3.0 报告结构、用户原话过滤、流程控制文本过滤、本地分数覆盖、深入层级不计分、支持记录透传和 malformed fallback。
- `tests/lib/examFlow.test.ts` — 覆盖层级推进、快速路径后的深入选择、深入入口、提示/答案支持记录、按 `nodeId` 追加对话、节点完成提示，以及创造层当前不自动进入；旧 3 轮结束节点预期已不再作为测试目标。
- `tests/app/useQuestionFlow.test.tsx` — 覆盖 `/exam` 提交回答、点击提示或答案时先写入用户气泡，再请求 Agent 回复；同时守护请求历史包含刚提交的回答、失败重试不重复插入用户气泡、失败后不回填输入框。
- `tests/lib/score.test.ts` — 改评分时同步改。
- `tests/store/examStore.test.ts` — 覆盖 v3.0 store 初始状态、`SET_NODES` 初始化、层级状态更新、提示/答案/类比记录、Agent 2 结构化响应、快速/深入路径、节点选择、按 `nodeId` 写回延迟响应和 `RESET`。
- `tests/components/ReportCard.test.tsx` — 覆盖报告卡片读取 v3.0 字段和材料证据展示。

## 目标数据流

### 1. 材料上传与节点分析

```text
app/page.tsx
  -> app/exam/page.tsx
  -> app/exam/_hooks/useMaterialAnalysis.ts
  -> POST /api/analyze
  -> app/api/analyze/route.ts
  -> lib/pdf.ts
  -> lib/agents/analyzer.ts
  -> store/examStore.tsx
```

目标返回：

- 节点名称
- 一句话说明
- 材料证据片段
- 适用层级
- 优先级理由

注意：Agent 1 保持最多 8 个节点，材料少时不凑数；缺少材料证据片段、没有合法适用层级或缺少优先级理由的节点在 analyzer 层被过滤。不连续适用层级会按最高层级补成从记忆层开始的连续路径，避免诊断绕过快速路径。

### 2. 节点导航与分层对话

```text
app/exam/page.tsx
  -> app/exam/_hooks/useQuestionFlow.ts
  -> store/examStore.tsx
  -> POST /api/question
  -> app/api/question/route.ts
  -> lib/agents/questioner.ts
  -> lib/examFlow.ts
```

目标变化：

- 推进依据从“回答轮次”改为“当前层级是否通过”。
- 快速路径固定为记忆、理解、应用。
- 快速路径后显示“完成”或“深入”。
- 深入路径当前自动覆盖分析、评价；创造层不自动进入，后续如要开放需要单独设计入口。
- “给我提示”和“给我答案”是常驻操作，不是预生成内容。

### 3. 报告生成

```text
app/exam/page.tsx
  -> app/exam/_hooks/useReportFlow.ts
  -> POST /api/evaluate
  -> app/api/evaluate/route.ts
  -> lib/agents/evaluator.ts
  -> lib/score.ts
  -> app/exam/_components/ReportModal.tsx
  -> components/ReportCard.tsx
```

这一段属于 Agent 3 数据结构改造，不代表报告页 UI 要优先重写。页面展示可以等主对话流程跑通后再细化。

目标报告输入：

- 每个节点的层级通过情况。
- 用户原话证据。
- 提示、答案、主动类比使用记录。
- 当前盲点摘要。
- 材料证据片段。

目标报告输出：

- 0-100 分辅助摘要。
- 层级通过情况。
- 具体盲点和证据。
- 正确理解。
- 下一步怎么补。

### 4. 本地保存

当前有两层本地状态：`sessionStorage` 用于当前页面刷新后的工作区恢复；IndexedDB 用于跨会话本地诊断历史。每条 IndexedDB 记录保存 `schemaVersion`、`id`、清洗后的 `title`、`pinned`、`createdAt`、`updatedAt` 和显式的 `PersistedDiagnosisState`。`PersistedDiagnosisState` 保存材料、节点、对话、层级状态、路径状态、报告和记录元信息；不保存 `currentAgentResponse`、`error`、分析中或报告中请求等运行态字段。账号、云同步、分享链接暂不做。

## 文档状态

- `docs/design-guide.md` — 已更新到 v3.0，应作为后续改造依据。
- `AGENTS.md` — 已对齐 v3.0 的 Agent 规则和工程原则。
- `README.md` — 已对齐 v3.0 的公开项目描述。
- `docs/operator-runbook.md` — 运行、测试、部署和故障排查手册。
- `docs/handoff.md` — 当前阶段交接和并行开发说明。
- `docs/architecture.md` — 已归档，等 v3.0 核心流程实现后再重写。

## 验证

只改文档时不用跑测试。

改代码后至少运行：

```bash
npm run test:run
```

声称生产可用前再运行：

```bash
npm run build
```

Windows 环境可使用等价命令：`npm.cmd run test:run`、`npm.cmd run build`。
