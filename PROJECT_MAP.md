# Veritas 项目地图

> 本文只记录当前真实代码结构与职责。新增、移动或删除关键入口后必须同步更新。

## 当前阶段

阶段 10：语音输入。

## 根目录

- `package.json`：本地开发、解析资源准备、检查、测试与生产构建命令入口。
- `next.config.ts`：Next.js 运行配置并为全部路由接入安全响应头。
- `tsconfig.json`：TypeScript 严格模式与 `@/*` 源码别名；类型检查前由 Next.js 生成路由类型。
- `eslint.config.mjs`：Next.js、TypeScript 与 Prettier 的静态检查规则。
- `postcss.config.mjs`：Tailwind CSS 的 PostCSS 入口。
- `vitest.config.mts`、`vitest.setup.ts`：单元与组件测试环境，只收集 `src` 下的 Vitest 用例。
- `playwright.config.ts`：桌面 Edge 与移动端 Edge 的真实浏览器项目配置。
- `scripts/run-e2e.mjs`：启动本地生产服务器、等待就绪、运行 Playwright 并回收进程。
- `scripts/prepare-parser-assets.mjs`：从锁定依赖复制 PDF Worker、OCR Worker、WASM 与中英文语言数据到同源生成目录。
- `DESIGN_GUIDE.md`：唯一产品事实来源。
- `SECURITY.md`：安全实现与测试底线。
- `IMPLEMENTATION_PLAN.md`：阶段顺序与验收检查点。
- `docs/acceptance/first-e2e.md`：首条纵向验收材料的预期行为。
- `docs/brand/vita-assets.md`：记录维塔原创身份锁、七态动作与透明资产处理方式。
- `tests/fixtures/end-to-end/water-cycle.md`：首条纵向验收用 Markdown 材料。
- `public/vita/*.png`：维塔默认、等待上传、处理中、给提示、鼓励、展示答案和错误七态透明图片。
- `public/ocr-worker.js`：启动同源 Tesseract Worker，并只过滤官方语言数据产生的已知无害参数警告。

## 源代码

- `src/app/layout.tsx`：全局 HTML 外壳与页面元数据。
- `src/app/page.tsx`：挂载本地学习工作区。
- `src/app/globals.css`：全局令牌、四列工作区、语音状态、报告与打印页面、窄屏抽屉和移动端布局样式。
- `src/app/icon.svg`：本地应用图标，避免页面请求外部或缺失图标。
- `src/config/security-headers.ts`：同源 CSP、嵌入防护、内容嗅探与浏览器权限限制。
- `src/lib/env/server.ts`：只在服务端调用边界校验 DeepSeek 环境配置。
- `src/lib/errors/public-error.ts`：定义不含堆栈、原因和上游正文的公共错误契约。
- `src/domain/types.ts`：任务、材料、知识地图、主题、层级、消息与报告的稳定领域类型。
- `src/domain/diagnostic/contracts.ts`：主题会话状态与 reducer 事件契约。
- `src/domain/diagnostic/reducer.ts`：唯一四层状态机，授权层级推进、提示、停滞、完成与计分。
- `src/domain/diagnostic/selectors.ts`：从唯一层级状态派生主题得分、材料进度和任务诊断状态。
- `src/domain/knowledge-map/contracts.ts`：用 Zod 校验材料模块、知识条目、诊断主题、覆盖归属与首问。
- `src/domain/agents/contracts.ts`：限制浏览器只能提交固定的材料处理、诊断教学与报告操作。
- `src/domain/diagnostic/agent-contracts.ts`：用独立 Zod 契约校验回答分类、证据、误解、教学动作、支架、问题、提示与答案。
- `src/domain/report/contracts.ts`：校验 Agent 3 输入与洞察结构，并拒绝伪造用户原话、支架和来源引用。
- `src/domain/report/build-report.ts`：由本地确定性证据回填任务级报告，并生成转义后的 Markdown 下载文本。
- `src/storage/database.ts`：声明 IndexedDB 表、版本迁移与浏览器数据库单例。
- `src/storage/types.ts`：定义带显式 `taskId` 的本地记录与短时删除快照。
- `src/storage/task-repository.ts`：负责任务、材料、节点会话、消息、草稿、主动支架、报告、完成状态、界面状态和事务性删除/撤销。
- `src/features/materials/material-file.ts`：统一读取文件，并组合校验扩展名、MIME、签名、ZIP 目录、解压规模、压缩比和安全路径。
- `src/features/materials/text-reader.ts`：在统一文件入口后严格解码 UTF-8 Markdown/TXT。
- `src/features/materials/chunk-text.ts`：按 Markdown 标题与字符上限建立最多 40 个可追溯来源块。
- `src/features/materials/parsed-material.ts`、`chunk-source-blocks.ts`：定义多格式解析结果，并在保留页、幻灯片或段落来源的前提下分块。
- `src/features/materials/docx-parser.ts`：使用 Mammoth 浏览器构建只提取 DOCX 纯文本段落。
- `src/features/materials/pptx-parser.ts`：使用 JSZip 和受控 DOMParser 按演示文稿关系顺序提取 PPTX 文字。
- `src/features/materials/pdf-parser.ts`：使用 PDF.js 逐页提取文字，并将无文字页面渲染为受限像素交给 OCR。
- `src/features/materials/image-parser.ts`、`ocr-engine.ts`：校验图片像素并使用可取消、必释放的同源 Tesseract Worker 做中英文 OCR。
- `src/features/materials/parse-material.ts`：在一次字节读取后按已验证格式分派唯一解析实现。
- `src/features/materials/agent-client.ts`：从浏览器调用同源 Agent 路由并再次校验稳定响应。
- `src/features/materials/process-text-material.ts`：顺序编排多格式解析、来源分块、覆盖审计和首问生成，并传播取消信号。
- `src/features/diagnostic/diagnostic-turn.ts`：编排 Agent 2 回答、提示与答案回合，把所有状态转移交给唯一 reducer，并生成下一层主问题。
- `src/app/api/agents/route.ts`：实施同源、JSON、请求大小、频率与并发边界，并返回脱敏错误。
- `src/server/deepseek/client.ts`：固定 DeepSeek 地址、模型、JSON Output、超时、有限重试与外部取消信号。
- `src/server/agents/service.ts`：组装材料处理、诊断教学与报告的隔离提示，独立校验输出并只重试受影响操作。
- `src/features/report/generate-report.ts`：在主题完成后只汇集本任务的已验证证据，调用 Agent 3 并保存任务级报告。
- `src/features/report/report-actions.ts`：提供安全文件名、Markdown 下载、Web Share API 与复制摘要回退。
- `src/features/report/ReportView.tsx`：以 React 转义文本渲染独立全屏报告，不解析模型 HTML。
- `src/features/speech/use-speech-input.ts`：封装浏览器 SpeechRecognition 的中文转写、开始/停止、释放和稳定错误文案。
- `src/features/workspace/WorkspaceApp.tsx`：组合主工作区状态、四个可见区域、报告页面、移动抽屉与任务对话框。
- `src/features/workspace/use-workspace.ts`：协调仓储读取、任务交互、诊断与报告重试，以及草稿和报告写入队列，不承载视图结构。
- `src/features/workspace/WorkspaceSidebar.tsx`：显示上传入口、搜索、任务列表，以及含报告分享状态的单任务菜单。
- `src/features/workspace/LearningPanels.tsx`：显示可折叠主题、节点历史、文字与语音回答、提示与答案、生成中状态、回到最新消息，以及实时进度、分数和报告入口。
- `src/features/workspace/TaskDialogs.tsx`：提供重命名与单任务删除确认对话框。
- `src/features/workspace/UploadButton.tsx`：提供统一的本地文件选择入口。
- `src/ui/tokens.css`：锁定品牌字体、颜色、间距、圆角、阴影、焦点与动效令牌。
- `src/ui/components.css`：实现按钮、表面、消息气泡、进度条与状态标签的公共外观。
- `src/ui/Icon.tsx`：提供当前流程需要的原创线性 SVG 图标。
- `src/ui/Button.tsx`、`Card.tsx`：提供保留原生语义的基础交互与表面组件。
- `src/ui/MessageBubble.tsx`、`ProgressBar.tsx`、`StatusBadge.tsx`：提供诊断对话与反馈基础组件。
- `src/ui/Vita.tsx`：将七种角色状态映射到固定本地资产与替代文本。

## 测试

- `e2e/smoke.spec.ts`：在桌面与移动 Edge 验证区域宽度、抽屉、控制台、溢出和 IndexedDB 刷新恢复。
- `src/domain/diagnostic/reducer.test.ts`：固定四层顺序、计分、提示、答案、停滞与非法转移测试。
- `src/domain/diagnostic/selectors.test.ts`：任务完成与材料主题进度的确定性派生测试。
- `src/storage/task-repository.test.ts`：验证 schema 迁移、任务操作、跨表删除/撤销和隔离错误。
- `src/features/workspace/WorkspaceApp.test.tsx`：验证空状态、搜索、切换、刷新恢复和任务菜单交互。
- `src/ui/components.test.tsx`：验证图标、按钮、表面、气泡、进度、状态标签和维塔七态契约。
- `src/features/materials/*.test.ts`：验证全部格式入口、ZIP/XML 资源边界、来源分块、PDF/OCR 限制、同源客户端与处理编排。
- `src/server/deepseek/client.test.ts`：验证固定上游、思考开关、错误脱敏与有限重试。
- `src/server/agents/service.test.ts`：验证提示隔离、覆盖完整性、Zod 拒绝和操作级重试。
- `src/app/api/agents/route.test.ts`：验证同源、Content-Type、请求体限制与稳定错误响应。
- `src/storage/material-processing-repository.test.ts`：验证处理任务、原始文件、知识地图、会话、消息和失败状态的事务持久化。
- `e2e/phase5-real.spec.ts`：显式开启时用真实 DeepSeek 验收 Markdown 至首问、核心覆盖、双端布局与刷新恢复。
- `e2e/phase6-formats.spec.ts`：用真实 DOCX、PPTX、文本/扫描 PDF、MD、TXT、PNG、JPEG 与 WebP 字节在生产 Edge 中验收解析、OCR、来源和双端布局。
- `src/features/diagnostic/diagnostic-turn.test.ts`：验证同题追问、答对推进、三轮停滞、三级提示与主动答案的确定性编排。
- `src/storage/diagnostic-repository.test.ts`：验证节点独立会话、消息、草稿、主动支架和诊断完成等待报告的事务性持久化。
- `src/features/workspace/WorkspaceDiagnostic.test.tsx`：验证提示、回答、分数、节点切换和草稿恢复的组件闭环。
- `e2e/phase7-diagnostic.spec.ts`：在双端生产 Edge 中走完一个节点四层和报告查看、下载、分享，并在桌面验证发送失败、草稿保留和原地重试。
- `e2e/phase7-real.spec.ts`：显式启用时以真实 `deepseek-v4-flash` 验证 Agent 2 的问题、评价、提示、答案和越权字段隔离。
- `src/domain/report/*.test.ts`：验证报告证据引用、确定性回填和安全 Markdown 生成。
- `src/storage/report-repository.test.ts`：验证报告与完成主题严格匹配，并只在最终报告保存后完成任务。
- `src/features/report/*.test.tsx`：验证报告编排、全屏渲染、下载文件名、系统分享与复制回退。
- `e2e/phase9-real.spec.ts`：显式启用时以真实 `deepseek-v4-flash` 验证 Agent 3 的忠实报告结构和越权字段隔离。
- `src/features/speech/use-speech-input.test.tsx`：验证中文转写、停止、权限、无声音、设备失败、中断、不支持和卸载释放。
- `e2e/phase10-speech.spec.ts`：在双端生产 Edge 验证原生 API 支持、语音转写至回答，并在桌面验证权限拒绝和草稿保留。
