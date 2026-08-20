# Veritas 项目地图

本文只说明当前代码放在哪里、各层负责什么。产品行为见 `DESIGN_GUIDE.md`，安全规则见 `SECURITY.md`，运行方式见 `README.md`。

## 请求与数据流

```text
浏览器校验、解析文件和 OCR
  → 材料分片与紧凑知识编译
  → 同源 /api/agents
  → deepseek-v4-flash
  → Zod 校验
  → 确定性状态机与 IndexedDB
  → React 对话、进度与报告
```

模型只产生语义判断和自然语言。状态转移、计分、完成、权限、来源守恒和持久化都由代码决定。

## 根目录

- `README.md`：项目介绍、运行命令和入口导航。
- `AGENTS.md`：开发规则和验证要求。
- `DESIGN_GUIDE.md`：当前产品行为的唯一事实来源。
- `SECURITY.md`：文件、模型、API、存储、渲染和秘密管理底线。
- `package.json`：开发、检查、测试和构建命令。
- `next.config.ts`、`tsconfig.json`、`eslint.config.mjs`、`playwright.config.ts`、`vitest.config.mts`：框架与质量工具配置。

## 源代码

### `src/app/`

Next.js 页面、全局样式和同源 Agent API。`api/agents/route.ts` 负责来源、格式、体积、频率和并发限制，并把内部错误转换为脱敏响应。

### `src/domain/`

不依赖界面的领域规则：

- `diagnostic/`：四层会话契约、唯一状态机和计分派生。
- `knowledge-map/`：知识地图、紧凑编译、来源覆盖和 Zod 契约。
- `agents/`：发送给 Agent 的上下文预算。
- `report/`：报告证据和确定性 Markdown。

### `src/features/`

按用户能力组织的业务模块：

- `materials/`：格式解析、OCR、来源分片和知识地图编译流程。
- `diagnostic/`：通用对话、回答判断、提示、答案和停滞处理。
- `report/`：报告生成、展示、下载与分享。
- `workspace/`：任务工作区、主题切换、上传和本地交互状态。
- `speech/`：浏览器中文语音转写。

### `src/server/`

- `deepseek/client.ts`：固定模型、超时、取消和脱敏错误。
- `agents/service.ts`：三个 Agent 的提示隔离、重试预算与结构校验。

### `src/storage/`

IndexedDB schema 与仓储。材料、任务、会话、消息和报告在这里持久化，跨表写入使用事务。

### `src/ui/`

视觉令牌、基础组件、图标、品牌符号和 Vita 七种状态映射。业务状态不在这一层实现。

### `src/config/` 与 `src/lib/`

集中放置容量限制、安全响应头、服务端环境校验和公共错误契约。

## 测试

- `src/**/*.test.ts(x)`：Vitest 单元、组件和集成测试。
- `e2e/core/`：不调用真实 DeepSeek 的生产 Edge 验收，是 `npm run test:e2e` 的默认范围。
- `e2e/real/`：需要显式环境开关的真实 DeepSeek 回归，不进入日常测试。
- `tests/fixtures/`：测试材料；运行测试时不读取个人材料目录。
- `output/`、`test-results/`、`playwright-report/`：本地生成产物，全部忽略。

具体测试分层与开关见 `docs/testing.md`。

## 脚本与静态资源

- `scripts/prepare-parser-assets.mjs`：从锁定依赖复制 PDF/OCR Worker、WASM 和语言数据到本地同源目录。
- `scripts/run-e2e.mjs`：启动生产服务器、等待就绪、运行 Playwright 并回收进程。
- `public/vita/`：Vita 当前七态全身图与头像。
- `public/brand/`：品牌符号。
- `references/vita-final-reference.png`：Vita 角色的最终视觉母版，不参与运行时加载。

## 维护约束

- 新增、移动或删除关键入口后更新本文件。
- 不在根目录保存截图、调试报告或测试输出。
- 不把历史评测原始数据、个人材料或一次性诊断脚本放回主工作树。
- 新模块必须能用一句话说明职责；如果说明需要列出多个无关动作，应继续拆分。
