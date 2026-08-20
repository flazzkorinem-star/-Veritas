# Veritas

Veritas 是一个本地运行的 AI 学习伙伴。上传一份已经学过的材料，Vita 会先把内容读完，再通过对话找出理解缺口，陪用户把遗漏补上。

它不是答题表单。用户可以随时追问、讨论或请 Vita 解释内容；只有真正回答当前问题的消息才会进入记忆、理解、应用和分析四层诊断。

当前版本面向本地单用户使用，不部署公网。三个 Agent 都使用 `deepseek-v4-flash`，文件、聊天和学习进度保存在当前浏览器的 IndexedDB。

## 能做什么

- 读取 PDF、DOCX、PPTX、Markdown、TXT、PNG、JPG/JPEG 和 WebP，图片与扫描 PDF 使用本地 OCR。
- 从整份材料生成可追溯的知识地图，再提出第一个值得回答的问题。
- 支持自由对话、四层诊断、三级提示、查看答案、语音转写和学习目标调整。
- 为每个主题独立保存聊天、问题、得分和完成状态，刷新后可以恢复。
- 生成整份材料的学习报告，可下载 Markdown、打印为 PDF 或分享摘要。
- 支持桌面、平板和手机布局。

## 本地运行

需要 Node.js 20.9.0 或更高版本、npm、现代 Chromium 浏览器和 DeepSeek API Key。

```bash
npm ci
```

复制 `.env.example` 为 `.env.local`，只在本机填写：

```text
DEEPSEEK_API_KEY=你的本地开发密钥
```

启动开发环境：

```bash
npm run dev
```

然后打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

运行本地生产版本：

```bash
npm run build
npm start
```

不要提交、打印或截图 `.env.local`。代码只会在本地服务端读取 Key。

## 开发命令

| 命令                | 用途                                   |
| ------------------- | -------------------------------------- |
| `npm run dev`       | 准备本地解析资源并启动开发服务器       |
| `npm run lint`      | 检查代码规范                           |
| `npm run typecheck` | 生成 Next.js 路由类型并检查 TypeScript |
| `npm run test`      | 运行 Vitest 单元、组件和集成测试       |
| `npm run test:e2e`  | 构建生产版本并运行核心 Edge 验收       |
| `npm run test:real` | 运行显式开启的真实 DeepSeek 回归       |
| `npm run build`     | 生成本地生产构建                       |

日常开发使用 `test:e2e`。真实模型测试默认跳过，避免误花费用。需要验收完整真实链路时，可在 PowerShell 中运行：

```powershell
$env:VERITAS_REAL_DEEPSEEK="1"
npm run test:real -- full-journey-real --project=desktop-edge --workers=1
```

测试分层、真实模型开关和验收范围见 [docs/testing.md](docs/testing.md)。

## 代码在哪里

```text
src/app/                 页面、API 路由和全局样式
src/domain/              状态机、领域类型和 Zod 契约
src/features/            材料处理、诊断、报告与工作区
src/server/              DeepSeek 客户端和三个 Agent 的服务端编排
src/storage/             IndexedDB 仓储
src/ui/                  复用组件和 Vita 角色映射
e2e/core/                不调用真实模型的生产浏览器验收
e2e/real/                显式开启的真实 DeepSeek 回归
tests/fixtures/          自动化测试材料
scripts/                 解析资源准备和 E2E 启动脚本
```

更细的职责边界见 [PROJECT_MAP.md](PROJECT_MAP.md)。产品行为以 [DESIGN_GUIDE.md](DESIGN_GUIDE.md) 为准，安全底线见 [SECURITY.md](SECURITY.md)，开发规则见 [AGENTS.md](AGENTS.md)。

## 系统边界

浏览器负责文件校验、解析、OCR、界面和本地数据；同源 `/api/agents` 路由负责请求限制并在服务端读取密钥。模型负责理解和生成自然语言，代码负责状态转移、计分、权限、校验和持久化。

所有材料、用户消息和模型输出都按不可信数据处理。结构化模型输出必须通过 Zod；运行时 Agent 没有代码执行、文件系统读取、环境变量读取或任意网络工具。

原始文件不会永久保存在服务端。清除浏览器站点数据会删除本地任务，当前没有账号、云同步或跨设备恢复。

## 文件限制

- 单文件最大 30 MB。
- PDF/PPTX 最多 200 页或幻灯片。
- 扫描 PDF 最多 OCR 50 页。
- 图片最多 4000 万像素。
- 最终解析文本最多 30 万字符。
- 只支持现代 `.docx` 与 `.pptx`，不支持旧版 `.doc` 与 `.ppt`。

不超过 5 MB 且解析后不超过 30 万字符的文本型 PDF、DOCX、PPTX，以三分钟内完成为目标。扫描 PDF 和图片走 OCR 慢路径，耗时取决于材料与本机性能。

## 当前限制

- 只支持本地单用户运行，不应直接暴露到公网。
- 一项任务只接收一个文件，不支持多文件合并。
- 已完成主题可以回看，但不能重做四层或改分。
- 语音取决于浏览器和系统权限，不可用时仍可使用文字。
- 账号、云同步、多人协作、完整游戏化、复杂知识图谱和公网部署不在当前版本范围内。

历史真实链路与回归结果的简要记录见 [docs/validation.md](docs/validation.md)。
