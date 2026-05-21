# Veritas 项目地图

Last synchronized: 2026-05-21

## 用途

本文件只做代码导航，不做产品规格。产品真相源是 `docs/design-guide.md`，Agent 和工程规则看 `AGENTS.md`。

当前代码仍保留旧 V1 闭环，新的目标流程已经在 `docs/design-guide.md` v3.0 中定义。后续改造应优先让代码对齐 v3.0，而不是继续补强旧的“三轮追问”版本。

## 当前差距

旧代码基线：

- 文件上传后抽知识点。
- Agent 1 最多抽 5 个节点。
- Agent 2 每个节点固定 3 个用户回答轮次，只负责提问。
- 前端代码控制节点切换。
- Agent 3 已生成 v3.0 报告数据，分数使用本地快速路径计分；报告卡片已最小接入 v3.0 字段，但视觉细化仍后置。
- 状态主要保存在 `sessionStorage`，没有本地历史工作台。

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
4. `app/exam/page.tsx` 已移除固定 3 轮结束节点的核心依赖，改为根据 `/api/question` 的 `nextAction`、当前层级和路径状态推进；快速路径完成后会等待“完成 / 深入”选择。
5. Agent 3、`/api/evaluate`、评分集成已完成第一条 v3.0 报告数据链路；报告展示 UI 后续再细化。
6. 最后改三栏 UI 和本地历史。

报告分两步处理：Agent 3 的报告数据结构已完成第一条 v3.0 数据链路；报告页的视觉展示可以后置到 UI 阶段。

不要先重写全部 UI，也不要先删除旧代码。旧代码里的文件解析、LLM 调用、错误处理、测试和部署配置仍然有价值。

## 主要入口

### 根目录

- `docs/design-guide.md` — 产品规格真相源。
- `AGENTS.md` — Agent 协作、工程原则、验证规则。
- `README.md` — 面向用户和面试官的项目说明，需要后续对齐 v3.0。
- `package.json` — 脚本和依赖。
- `.env.local` — 本地密钥文件，禁止读取、打印或修改真实值。

### 页面与 API

- `app/page.tsx` — 当前首页入口。后续应弱化旧首页感，转向“上传材料开始诊断”。
- `app/exam/page.tsx` — 当前主诊断页。已接入 Agent 2 v3.0 结构化响应和层级推进；空回答不能提交，避免报告把系统合成文本当成用户原话；仍保留旧视觉结构，后续会成为三栏工作台的主要改造点。
- `app/report/page.tsx` — 当前报告页容器。它只读取 `overallScore`、`summary` 和 `nodes`，报告字段展示由 `components/ReportCard.tsx` 承担。
- `app/api/analyze/route.ts` — 调用 Agent 1，返回 `id`、`name`、`context`、`sourceExcerpt`、`suitableLevels` 和 `priorityReason`；节点质量校验留在 `lib/agents/analyzer.ts`。
- `app/api/question/route.ts` — 调用 Agent 2。当前接收节点、当前层级、层级状态、对话历史和 `normal` / `hint` / `answer` 请求类型；不再拒绝 3 个用户回答后的历史，返回 Agent 2 的结构化诊断响应。
- `app/api/evaluate/route.ts` — 调用 Agent 3。当前接收 `nodeConversations` 和 `nodeLevelStates`，由 Agent 3 生成 v3.0 报告并用本地快速路径分数覆盖模型分数。

### 组件

- `components/InputForm.tsx` — 文件上传入口。当前仍可保留。
- `components/VoiceInput.tsx` — 语音输入。不是 v3.0 核心，改造早期不要优先动。
- `components/ProgressBar.tsx` — 旧进度条。后续可能被右侧诊断面板替代。
- `components/ReportCard.tsx` — 报告卡片。已从旧掌握等级字段切到 v3.0 字段读取，最小展示层级状态、盲点、用户原话证据、支持使用、正确理解、下一步和材料证据；视觉细化后续再做。
- `components/Mascot.tsx` — 非核心组件。除非阻碍新 UI，否则暂不处理。

### 核心逻辑

- `lib/types.ts` — 已完成 v3.0 第一阶段底座。新增 `CognitiveLevel`、`LevelStatus`、`SupportRecord`、`NodeLevelState`、`QuestionNextAction`、`KnowledgeNode.suitableLevels`、`KnowledgeNode.priorityReason`，并扩展 `QuestionResponse` 支持自然回复、当前层级、通过状态、下一步动作和盲点摘要。`ExamReport` / `NodeEvaluation` 已切到 v3.0 报告字段：层级状态、用户原话证据、盲点、支持记录、正确理解和下一步建议；旧掌握等级字段已从 `NodeEvaluation` 移除。
- `lib/examFlow.ts` — 提供层级推进纯函数：认知层级常量、快速/深入路径常量、适用层级判断、初始层级状态、下一适用层级、深入路径入口、下一步动作、支持记录和状态更新。当前深入路径只自动覆盖分析和评价，创造层不自动进入。当前已被 `store/examStore.tsx` 和 `app/exam/page.tsx` 用于层级推进。
- `lib/score.ts` — 已保留旧掌握等级评分，并新增快速路径评分：记忆 33、理解 33、应用 34；深入层级不参与基础分；看答案后通过不计该层分。
- `lib/apiResponse.ts` — 保留。前端 API 响应仍应走防御性解析。
- `lib/pdf.ts` — 保留。文件解析不是当前改造重点。
- `lib/llm.ts` — 保留。不要未经确认修改 DeepSeek provider 或模型名。

### Agent

- `lib/agents/analyzer.ts` — Agent 1。已对齐 v3.0：最多 8 个节点、少材料不凑数、输出 `suitableLevels`（共享英文 `CognitiveLevel`）和 `priorityReason`；缺字段或非法层级会被丢弃，不连续层级会归一化为从 `memory` 到最高适用层级的连续路径。
- `lib/agents/questioner.ts` — Agent 2。已从“只提问”升级为“诊断对话者”：负责提示词、LLM 输出解析、层级推进归一化、hint/answer 不独立通过、suitableLevels 约束和 malformed 输出 fallback；没有真实用户作答时不会接受模型给出的通过判断。
- `lib/agents/evaluator.ts` — Agent 3。已改成基于层级通过、原话证据、盲点和下一步建议生成报告；会过滤伪造原话和流程控制文本，汇总提示/答案/类比记录，并使用本地快速路径分数覆盖模型分数。

### 状态管理

- `store/examStore.tsx` — 已接入 v3.0 状态层底座，同时保留旧字段兼容页面渐进迁移。当前支持 `currentNodeId`、`currentLevel`、`nodeLevelStates`、`nodePathStates`、`currentAgentResponse` 和 `reportStatus`；提示、答案、主动类比记录只存放在对应节点层级的 `supportRecords` 中，避免重复状态；旧 `currentQuestion`、`currentNodeIndex`、`nodeConversations` 仍保留桥接。`getDialogueStatus` 从 `currentAgentResponse` 派生当前对话状态，不单独持久化。
- 本地诊断历史尚未实现；当前仍只做 `sessionStorage` 会话恢复。

### 测试

- `tests/lib/analyzer.test.ts` — 改 Agent 1 时同步改；当前覆盖最多 8 个节点、少材料不凑数、必填字段过滤和 `suitableLevels` 连续路径归一化。
- `tests/app/analyzeRoute.test.ts` — 覆盖 `/api/analyze` 文件上传和 v3.0 节点字段透传；节点质量规则由 `tests/lib/analyzer.test.ts` 覆盖。
- `tests/lib/questioner.test.ts` — 覆盖 Agent 2 结构化解析、normal/hint/answer、suitableLevels 约束、malformed fallback、三轮后不固定停止，以及无真实用户作答时不通过。
- `tests/lib/evaluator.test.ts` — 覆盖 Agent 3 v3.0 报告结构、用户原话过滤、流程控制文本过滤、本地分数覆盖、深入层级不计分、支持记录透传和 malformed fallback。
- `tests/lib/examFlow.test.ts` — 覆盖层级推进、快速路径后的深入选择、深入入口、提示/答案支持记录，以及创造层当前不自动进入；旧 3 轮结束节点预期已不再作为测试目标。
- `tests/lib/score.test.ts` — 改评分时同步改。
- `tests/store/examStore.test.ts` — 覆盖 v3.0 store 初始状态、`SET_NODES` 初始化、层级状态更新、提示/答案/类比记录、Agent 2 结构化响应、快速/深入路径、节点选择和 `RESET`。
- `tests/components/ReportCard.test.tsx` — 覆盖报告卡片读取 v3.0 字段和材料证据展示。

## 目标数据流

### 1. 材料上传与节点分析

```text
app/page.tsx
  -> components/InputForm.tsx
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
  -> POST /api/evaluate
  -> app/api/evaluate/route.ts
  -> lib/agents/evaluator.ts
  -> lib/score.ts
  -> app/report/page.tsx
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

当前只有 `sessionStorage` 会话恢复。v3.0 目标是本地保存诊断历史、节点、对话、层级状态和报告。

优先实现可以从 `localStorage` 或 IndexedDB 起步。账号、云同步、分享链接暂不做。

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
