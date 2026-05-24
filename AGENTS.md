<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Veritas 项目规则

所有输出必须使用中文。

## 产品真相源

`docs/design-guide.md` 是产品设计唯一真相源。做任何产品、Agent、流程、UI 或报告相关决策前，先读它。

如果用户需求和 `docs/design-guide.md` 冲突，先指出冲突，再确认是改需求还是改设计文档。

## 当前产品红线

- 不把 Veritas 做成完整学习平台、通用答疑工具或知识社区。
- 不加入选择题作为主流程。
- 当前先做本地保存，不做账号、云同步、分享链接、权限系统。
- 不做真实 RAG、OCR、图片理解、复杂知识图谱或游戏化。
- Agent 可以构造场景和类比，但考察对象必须服务于材料中出现的概念。

## Agent 规则摘要

- Agent 1：抽取高诊断价值知识节点，不泛泛总结材料。单次诊断最多 8 个节点；材料少就少抽，不凑数。输出至少包含节点名称、一句话说明、材料证据片段、适用层级、优先级理由。
- Agent 2：诊断对话者，不是冷冰冰的考官。按认知层级推进，判断是否通过当前层级；可以反馈、追问、纠错、给类比、给动态提示或答案。
- Agent 3：生成个人化诊断报告。必须引用用户真实原话，说明层级通过情况、提示/答案/类比使用情况、具体盲点、正确理解和下一步怎么补。

Agent 1 决定每个节点的适用层级上限，Agent 2 决定对话中实际推进到哪里。Agent 2 不能进入 Agent 1 标记为不适用的层级。

层级最低通过标准：

- 记忆：能识别概念或说出基本定义。
- 理解：能用自己的话解释，不只是复述材料原文。
- 应用：能把概念放进具体场景，并说明怎么用。
- 分析：能拆出机制、因果、边界或对比关系。
- 评价：能做判断和取舍，并说出理由。
- 创造：能提出新方案、变式或迁移用法，且和概念逻辑一致。

Agent 2 错误处理：

- 事实性错误：先轻量纠正，再问一个对比问题。
- 逻辑错误：不直接给完整答案，用反例或追问暴露断点。
- 应用错误：换一个更具体的场景，让用户重新判断。

Agent 2 主动类比触发条件：用户明确说不知道；连续停留在同一模糊点；只复述关键词但解释不了原因；多次答非所问；对抽象概念明显卡住。

提示和答案由 Agent 2 根据当前层级、当前问题、最近回答和材料证据动态生成，不做预生成；同一层级、同一问题下生成过的提示可以缓存复用。

不要用固定轮次模拟理解。

## 项目导航

改代码前先看 `docs/project-map.md`，用它定位模块职责和数据流。

只改完成任务所需的最小文件集。如果 `project-map.md` 过时，先按真实代码完成改动，再只更新受影响部分。

## 工程原则

- 单一职责：每个模块职责要能一句话说清楚。
- 先定义成功标准：动手前明确本次改动要解决什么，以及用什么测试、构建或人工检查验证。
- 小步实现：把大改拆成最小可验证切片，优先完成一条端到端路径。
- 适用时 TDD：改行为逻辑、修 bug、改核心流程、改 Agent 行为或数据流时，优先先写或更新失败测试；纯文档、简单样式和探索讨论不强制。
- 简单优先：遵守 KISS / YAGNI，不加当前用不到的抽象、配置和预留能力。
- 外科手术式修改：只改任务需要的文件，不重构无关代码，不清理 unrelated dead code。
- 验证闭环：改完运行相关测试；影响核心流程时跑 `npm run test:run`；声称生产可用前跑 build。
- 确定性状态由代码维护，语义判断交给 Agent。
- 不信任模型输出的分数或结构，关键结果要由代码校验。
- 工程流程按需启用：根据任务风险选择规格、实现、测试、审查、安全、性能或上线检查；不为流程扩大任务范围。

## API Route 边界规则

- API route 是薄转发层。只做：解析请求、调用 agent、返回结果、错误码映射。
- LLM 输出清洗、字段合法性校验、结构归一化全部放在 `lib/agents/*.ts` 的 parse 函数里。
- route 测试只证明"字段贯通"，不重复 agent 的清洗规则测试。

## 项目特定约束

- 前端 API 响应解析应使用 `lib/apiResponse.ts` 或同等防御性解析。
- 不修改 `.env.local`，不打印密钥。
- DeepSeek 模型名和 provider 不要未经确认改动。
- 保留 `@napi-rs/canvas` 作为直接依赖，`pdf-parse` 在 Vercel Serverless 需要它。

## 文件和删除安全

禁止批量删除文件或目录。

不要使用：

- `del /s`
- `rd /s`
- `rmdir /s`
- `Remove-Item -Recurse`
- `rm -rf`

需要删除文件时，只能一次删除一个明确路径的文件：

```powershell
Remove-Item "C:\path\to\file.txt"
```

如果需要批量删除文件，停止操作，让用户手动删除。

## 环境变量

- `DEEPSEEK_API_KEY`：DeepSeek API key，禁止打印或编辑真实值。
- `LLM_BASE_URL`：OpenAI-compatible base URL。
- `LLM_MODEL_FAST`：快速模型。
- `LLM_MODEL_SMART`：强模型。

## 文档同步

每次任务结束前检查是否改变了文档相关事实。只更新受影响部分。

| 文件 | 何时更新 |
|---|---|
| `AGENTS.md` | Agent 行为、产品红线、工程约束、验证规则变化 |
| `docs/design-guide.md` | 产品规格、流程、Agent 职责、评分、UI 基准变化 |
| `docs/project-map.md` | 模块结构、数据流、文件职责变化 |
| `README.md` | 用户可见功能、运行方式、部署方式、公开描述变化 |

最终回复必须列出改动过的文档和一句原因；如果无需文档同步，写：`无需同步文档`。

## 验证

- 代码修复完成前运行：`npm run test:run`
- 声称生产可用前运行：`npm run build`
- Windows 环境可使用等价命令：`npm.cmd run test:run`、`npm.cmd run build`
- 如果命令因 sandbox `spawn EPERM` 失败，用批准的提权方式重跑同一命令，不要绕过测试。
- 当前生产地址：`https://veritas-red.vercel.app`
