# Veritas / 你真的懂吗

Veritas 是面向备考和面试场景的 AI 理解诊断工具。

用户上传自己的学习材料后，Veritas 会主动抽取高价值知识节点，通过分层追问暴露理解盲点，最后生成基于用户原话的诊断报告。它不替用户学习完整课程，也不做通用答疑。

核心流程：

```text
上传材料 -> 抽知识节点 -> 苏格拉底追问 -> 诊断报告
```

## 当前状态

产品规格已更新到 `docs/design-guide.md` v3.0。

当前代码仍保留旧 V1 闭环，正在向 v3.0 改造。旧代码里的文件解析、LLM 调用、错误处理、测试和部署配置仍然可复用，但核心诊断流程需要从“固定轮次提问”改为“按认知层级推进”。

下一步改造优先级见 `docs/project-map.md`。

## 产品方向

Veritas 当前阶段只做核心诊断体验：

- 用户上传 PDF / DOCX / PPTX / TXT / Markdown。
- Agent 1 抽取最多 8 个高诊断价值知识节点。
- Agent 2 按记忆、理解、应用、分析、评价推进；创造层暂不强制进入。
- 每个节点先完成快速路径 1-3，再由用户选择完成或深入。
- 用户可随时请求提示或答案。
- Agent 3 生成引用用户原话的个人化诊断报告。
- 分数保留为 0-100，但只作为辅助摘要。

当前不做账号、云同步、分享链接、真实 RAG、OCR、图片理解、知识图谱、游戏化和选择题主流程。

## 技术栈

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- OpenAI SDK，调用 DeepSeek-compatible chat completions
- `pdf-parse`、`mammoth`、`jszip`、`fast-xml-parser` 用于文件文本提取
- `@napi-rs/canvas` 用于 Vercel Serverless 下的 PDF.js 兼容
- Vitest / Testing Library / jsdom

## 本地运行

安装依赖：

```bash
npm install
```

创建 `.env.local`：

```text
DEEPSEEK_API_KEY=<your key>
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL_FAST=<confirmed fast model>
LLM_MODEL_SMART=<confirmed smart model>
```

启动开发服务器：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

Windows 环境可使用等价命令：

```powershell
npm.cmd install
npm.cmd run dev
```

如果本机 3000 端口不可用，可以换端口：

```powershell
npm.cmd run dev -- --port 3127 --hostname 127.0.0.1
```

## 验证

运行测试：

```bash
npm run test:run
```

生产构建：

```bash
npm run build
```

Windows 环境可使用：

```powershell
npm.cmd run test:run
npm.cmd run build
```

## 部署

当前生产地址：

```text
https://veritas-red.vercel.app
```

Vercel Production 环境变量在 Vercel 后台配置，不提交到仓库。`.env.local` 不应打印、提交或修改真实密钥。

## 文档

- `docs/design-guide.md` — 产品真相源。
- `docs/project-map.md` — 代码导航和 v3.0 改造入口。
- `AGENTS.md` — Agent 协作规则、工程原则和验证要求。
- `docs/operator-runbook.md` — 运行、测试、部署手册，后续可继续精简。
- `docs/handoff.md` — 当前阶段交接和并行开发说明。

`docs/architecture.md` 已归档，等 v3.0 核心流程实现后再重写。
