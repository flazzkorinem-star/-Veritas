# Veritas 项目地图

> 本文只记录当前真实代码结构与职责。新增、移动或删除关键入口后必须同步更新。

## 当前阶段

通用 AI 学习伙伴纠偏后的本地正式版已经通过完整 Mock 与真实 DeepSeek 验收；后续改动从当前稳定基线继续。

## 根目录

- `package.json`：本地开发、解析资源准备、检查、测试与生产构建命令入口。
- `AGENTS.md`：当前开发规则、权威顺序、验证要求与归档读取边界。
- `README.md`：面向用户和面试官的功能概览、快速开始、本地运行、架构、隐私、验收基线与已知限制。
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
- `归档文件/`：只保存历史探索、首版实施过程和早期参考；日常开发不得读取、搜索或引用。
- `docs/acceptance/first-e2e.md`：首条纵向验收材料的预期行为。
- `docs/brand/vita-assets.md`：记录维塔最终身份锁、七态动作、聊天头像与资产来源。
- `tests/fixtures/end-to-end/water-cycle.md`：首条纵向验收用 Markdown 材料。
- `public/vita/*-final.png`、`*-avatar-final.png`：从最终维塔母版直接提取的七态动作与聊天近景头像。
- `public/vita/waiting-hd.png`：空任务状态使用的高清欢迎动作，避免放大小尺寸裁图造成模糊。
- `public/vita/error-full.png`：失败状态使用的完整全身扩展稿，避免近景源素材在空状态中呈现为裁切角色。
- `public/brand/veritas-book-sprout-final.png`：从最终维塔母版直接提取的“打开的书 + 小芽”品牌符号。
- `public/ocr-worker.js`：启动同源 Tesseract Worker，并只过滤官方语言数据产生的已知无害参数警告。

## 源代码

- `src/app/layout.tsx`：全局 HTML 外壳与页面元数据。
- `src/app/page.tsx`：挂载本地学习工作区。
- `src/app/globals.css`：全局令牌、两区工作区、固定视口内的消息滚动与输入区、按需主题/进度浮层、语音状态、报告与打印页面，以及含安全区、横竖屏和软键盘边界的移动端布局。
- `src/app/icon.svg`：本地应用图标，避免页面请求外部或缺失图标。
- `src/config/agent-limits.ts`：集中定义同源 Agent 请求体上限、Agent 2 浏览器与上游整包字节预算、最近消息预算、路由总并发数、材料处理总预算、模型阶段预算和 Agent 1 分块并发数。
- `src/config/security-headers.ts`：同源 CSP、嵌入防护、内容嗅探与浏览器权限限制。
- `src/lib/env/server.ts`：只在服务端调用边界校验 DeepSeek 环境配置。
- `src/lib/errors/public-error.ts`：定义不含堆栈、原因和上游正文的公共错误契约。
- `src/domain/types.ts`：任务、材料、知识地图、主题、层级、消息与报告的稳定领域类型。
- `src/domain/diagnostic/contracts.ts`：主题会话状态与 reducer 事件契约。
- `src/domain/diagnostic/reducer.ts`：唯一四层状态机，授权层级推进、提示、停滞、完成与计分。
- `src/domain/diagnostic/selectors.ts`：从唯一层级状态派生主题得分、材料进度和任务诊断状态。
- `src/domain/knowledge-map/contracts.ts`：用 Zod 校验材料模块、知识条目、诊断主题、覆盖归属，以及由材料判断和唯一主问题组成的首问；单个分块内的模块与条目 ID 必须唯一。
- `src/domain/knowledge-map/stable-extraction-ids.ts`：按分块和原始顺序为抽取结果重分配稳定命名空间 ID，并同步条目到模块的引用。
- `src/domain/knowledge-map/audit-assembly.ts`：校验只含合并谱系、诊断主题和条目归属的精简审计；由代码确定性组装最终知识地图、条目类型、节点顺序和来源覆盖。
- `src/domain/agents/contracts.ts`：限制浏览器只能提交固定的材料处理、Vita 对话、诊断辅助与报告操作；Agent 2 的线上材料上下文只接受精简目录。
- `src/domain/agents/context-budget.ts`：按整包 JSON 字节预算确定性组装 Agent 2 请求，优先保留当前主题、最新消息和模块/条目目录，剩余空间再加入摘要。
- `src/domain/diagnostic/agent-contracts.ts`：用独立 Zod 契约校验通用回复、语义提示/答案意图、学习目标更新、回答分类、证据、误解、教学动作、问题、提示与答案。
- `src/domain/report/contracts.ts`：校验 Agent 3 的有序完整对话输入与洞察结构，并拒绝引用助理消息、伪造用户原话、支架、来源或在用户文案中暴露内部术语。
- `src/domain/report/build-report.ts`：由本地确定性证据回填任务级报告，并生成转义后的 Markdown 下载文本。
- `src/storage/database.ts`：声明 IndexedDB 表、版本迁移与浏览器数据库单例。
- `src/storage/types.ts`：定义带显式 `taskId` 的本地记录与短时删除快照。
- `src/storage/task-repository.ts`：负责任务、材料、节点会话、消息、草稿、主动支架、报告、完成状态、界面状态和事务性删除/撤销，并把配额耗尽与损坏报告转换为稳定本地错误。
- `src/features/materials/material-file.ts`：统一读取文件，并组合校验扩展名、MIME、签名、ZIP 目录、解压规模、压缩比和安全路径。
- `src/features/materials/text-reader.ts`：在统一文件入口后严格解码 UTF-8 Markdown/TXT。
- `src/features/materials/chunk-text.ts`：按 Markdown 标题与字符上限建立最多 40 个可追溯来源块。
- `src/features/materials/parsed-material.ts`、`chunk-source-blocks.ts`：定义多格式解析结果，并在保留页、幻灯片或段落来源的前提下分块。
- `src/features/materials/docx-parser.ts`：使用 Mammoth 浏览器构建只提取 DOCX 纯文本段落。
- `src/features/materials/pptx-parser.ts`：使用 JSZip 和受控 DOMParser 按演示文稿关系顺序提取 PPTX 文字。
- `src/features/materials/pdf-parser.ts`：使用 PDF.js 逐页提取文字，并将无文字页面渲染为受限像素交给 OCR。
- `src/features/materials/image-parser.ts`、`ocr-engine.ts`：校验图片像素并使用可取消、必释放的同源 Tesseract Worker 做中英文 OCR。
- `src/features/materials/parse-material.ts`：在一次字节读取后按已验证格式动态加载并分派唯一解析实现，避免大型解析依赖进入首屏代码。
- `src/features/materials/agent-client.ts`：从浏览器调用同源 Agent 路由并再次校验稳定响应。
- `src/features/materials/process-text-material.ts`：在材料与模型总预算内编排多格式解析、固定两路分块提取、稳定 ID 重分配、精简覆盖审计和首个有意义问题，按实际完成数报告进度、保持原文顺序并传播取消信号。
- `src/features/diagnostic/diagnostic-turn.ts`：编排 Agent 2 通用消息、诊断回答、提示与答案回合；发送前应用整包字节预算，普通消息保持状态不变，文字提示/答案请求复用按钮流程，状态变化只交给唯一 reducer。
- `src/app/api/agents/route.ts`：实施同源、JSON、请求大小、频率与并发边界，并返回脱敏错误。
- `src/server/deepseek/client.ts`：固定 DeepSeek 地址、模型与 JSON Output；一次调用只发送一次物理请求，并把上游状态、无效响应和取消转换为不含正文的稳定错误。
- `src/server/agents/service.ts`：组装材料处理、精简知识审计、通用 Vita 对话、诊断辅助与报告的隔离提示，确定性恢复最终知识地图；作为唯一重试所有者统一限制尝试次数和绝对截止时间，限制 Agent 2 上游整包字节数，反馈脱敏校验路径、剥离白名单空字段、校验业务状态，并记录不含材料与模型正文的操作元数据。
- `src/features/report/generate-report.ts`：在主题完成后汇集本任务的学习目标、有序完整对话和已验证状态，调用 Agent 3 并保存任务级报告。
- `src/features/report/report-actions.ts`：提供安全文件名、Markdown 下载、Web Share API 与复制摘要回退。
- `src/features/report/ReportView.tsx`：以 React 转义文本渲染独立全屏报告，不解析模型 HTML。
- `src/features/speech/use-speech-input.ts`：封装浏览器 SpeechRecognition 的中文转写、开始/停止、释放和稳定错误文案。
- `src/features/workspace/WorkspaceApp.tsx`：组合主工作区状态、两区主界面、按需主题/进度浮层、报告页面、移动抽屉、返回行为与任务对话框。
- `src/features/workspace/use-workspace.ts`：协调仓储读取、通用对话、按需诊断与报告重试，以及学习目标、草稿和报告写入队列；异步处理结束前核对当前任务，避免覆盖用户已切换到的学习数据。
- `src/features/workspace/WorkspaceSidebar.tsx`：显示上传入口、搜索和任务列表；单任务菜单通过视口级浮层避开滚动裁剪，并处理外部点击、Esc 与焦点归还。
- `src/features/workspace/LearningPanels.tsx`：显示精简页头、白色核心对话、按需主题/进度、节点历史、通用文字与语音消息、Enter/Shift+Enter 键盘行为，以及只在诊断题激活时出现的提示与答案操作。
- `src/features/workspace/TaskDialogs.tsx`：提供带焦点约束、Esc 关闭和焦点归还的重命名与单任务删除确认模态框。
- `src/features/workspace/UploadButton.tsx`：提供统一的本地文件选择入口。
- `src/ui/tokens.css`：锁定品牌字体、颜色、间距、圆角、阴影、焦点与动效令牌。
- `src/ui/components.css`：实现按钮、表面、消息气泡、进度条与状态标签的公共外观。
- `src/ui/Icon.tsx`：提供当前流程需要的原创线性 SVG 图标。
- `src/ui/BrandSymbol.tsx`：提供与 Vita 胸前一致的“打开的书 + 小芽”品牌符号。
- `src/ui/Button.tsx`、`Card.tsx`：提供保留原生语义的基础交互与表面组件。
- `src/ui/MessageBubble.tsx`、`ProgressBar.tsx`、`StatusBadge.tsx`：提供诊断对话与反馈基础组件。
- `src/ui/Vita.tsx`：将七种角色状态映射到最终全身图、聊天近景头像与替代文本。

## 测试

- `e2e/smoke.spec.ts`：在桌面与移动 Edge 验证区域宽度、抽屉、长任务列表底部菜单完整可见、重命名模态键盘操作、控制台、溢出和 IndexedDB 刷新恢复。
- `src/domain/diagnostic/reducer.test.ts`：固定四层顺序、计分、提示、答案、停滞与非法转移测试。
- `src/domain/diagnostic/selectors.test.ts`：任务完成与材料主题进度的确定性派生测试。
- `src/storage/task-repository.test.ts`：验证 schema 迁移、任务操作、跨表删除/撤销和隔离错误。
- `src/features/workspace/WorkspaceApp.test.tsx`：验证空状态、搜索、切换、刷新恢复、处理中断恢复、取消和任务菜单交互。
- `src/ui/components.test.tsx`：验证图标、按钮、表面、气泡、进度、状态标签和维塔七态契约。
- `src/features/materials/*.test.ts`：验证全部格式入口、ZIP/XML 资源边界、来源分块、PDF/OCR 限制、同源客户端与处理编排。
- `src/server/deepseek/client.test.ts`：验证固定上游、思考开关、错误脱敏、单次物理请求与调用方取消传播。
- `src/domain/agents/context-budget.test.ts`：验证 Agent 2 整包 JSON 字节上限、确定性裁剪、当前主题完整保留、最新消息优先和目录先于摘要。
- `src/domain/knowledge-map/stable-extraction-ids.test.ts`、`audit-assembly.test.ts`：验证多分块重复 ID 隔离，以及精简审计到完整知识地图、类型、节点顺序和来源覆盖的确定性恢复。
- `src/server/agents/service.test.ts`：验证提示隔离、精简审计、覆盖完整性、Zod 拒绝、单一重试预算、共享截止时间、定向结构修复、白名单归一化与日志脱敏。
- `src/server/agents/request-guard.test.ts`：验证每分钟请求上限、全局并发上限和幂等释放。
- `src/app/api/agents/route.test.ts`：验证同源、Content-Type、声明与实际请求体限制，以及稳定错误响应。
- `src/storage/material-processing-repository.test.ts`：验证处理任务、原始文件、知识地图、会话、消息和失败状态的事务持久化。
- `e2e/phase5-real.spec.ts`：显式开启时用真实 DeepSeek 验收 Markdown 至首个有意义问题、核心覆盖、双端布局与刷新恢复。
- `e2e/phase5-processing-control.spec.ts`：在双端生产 Edge 中验证模型请求进行中取消可立即重试，以及处理中刷新后恢复为明确中断状态。
- `e2e/phase6-formats.spec.ts`：用真实 DOCX、PPTX、文本/扫描 PDF、MD、TXT、PNG、JPEG 与 WebP 字节在生产 Edge 中验收解析、OCR、来源和双端布局。
- `src/features/diagnostic/diagnostic-turn.test.ts`：验证通用对话绕行、同题追问、答对推进、三轮停滞、按钮与文字语义触发的提示/答案编排。
- `src/storage/diagnostic-repository.test.ts`：验证节点独立会话、消息、草稿、主动支架和诊断完成等待报告的事务性持久化。
- `src/features/workspace/WorkspaceDiagnostic.test.tsx`：验证默认首问、通用对话绕行、提示、答案、分数、节点切换和草稿恢复的组件闭环。
- `e2e/phase7-diagnostic.spec.ts`：在双端生产 Edge 中走完一个节点四层和报告查看、下载、分享，并在桌面验证发送失败、草稿保留和原地重试。
- `e2e/phase7-real.spec.ts`：显式启用时以真实 `deepseek-v4-flash` 验证 Agent 2 的通用绕行、语义提示/答案、问题、评价和越权字段隔离。
- `src/domain/report/*.test.ts`：验证报告证据引用、确定性回填和安全 Markdown 生成。
- `src/storage/report-repository.test.ts`：验证报告与完成主题严格匹配，并只在最终报告保存后完成任务。
- `src/features/report/*.test.tsx`：验证报告编排、全屏渲染、下载文件名、系统分享与复制回退。
- `e2e/phase9-real.spec.ts`：显式启用时以真实 `deepseek-v4-flash` 验证 Agent 3 的忠实报告结构和越权字段隔离。
- `src/features/speech/use-speech-input.test.tsx`：验证中文转写、停止、权限、无声音、设备失败、中断、不支持和卸载释放。
- `e2e/phase10-speech.spec.ts`：在双端生产 Edge 验证原生 API 支持、语音转写至回答，并在桌面验证权限拒绝和草稿保留。
- `e2e/phase11-mobile.spec.ts`：在 390×844 生产 Edge 中从上传走到报告，并验证移动浮层、返回、软键盘、长内容、下一主题、横屏和溢出。
- `e2e/phase12-security.spec.ts`：在双端生产 Edge 验证生产 CSP、安全响应头、API 错误脱敏、客户端静态分块秘密隔离和恶意文本纯文本渲染。
- `e2e/phase13-acceptance.spec.ts`：在生产 Edge 验证键盘与语义基线、减少动效偏好、1024×768 平板断点、全同源首屏网络和初始 JavaScript 资源预算。
- `e2e/phase14-real-journey.spec.ts`：显式启用时在同一个生产 Edge 任务中调用真实 DeepSeek，连续验收上传、知识地图、默认首问、通用对话绕行、语义提示/答案、四层推进、未诊断范围和报告。
- `e2e/phase15-performance-real.spec.ts`：仅显式启用时串行生成并处理 10、50、200 KiB 合成 Markdown，记录端到端耗时、同源请求字节数、调用数、状态和主题数，不进入普通 CI 的真实模型调用。
