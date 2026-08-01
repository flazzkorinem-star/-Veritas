# Veritas 项目地图

> 本文只记录当前真实代码结构与职责。新增、移动或删除关键入口后必须同步更新。

## 当前阶段

阶段 4：品牌基础与维塔资产。

## 根目录

- `package.json`：本地开发、检查、测试与生产构建命令入口。
- `next.config.ts`：Next.js 运行配置并为全部路由接入安全响应头。
- `tsconfig.json`：TypeScript 严格模式与 `@/*` 源码别名；类型检查前由 Next.js 生成路由类型。
- `eslint.config.mjs`：Next.js、TypeScript 与 Prettier 的静态检查规则。
- `postcss.config.mjs`：Tailwind CSS 的 PostCSS 入口。
- `vitest.config.mts`、`vitest.setup.ts`：单元与组件测试环境，只收集 `src` 下的 Vitest 用例。
- `playwright.config.ts`：桌面 Edge 与移动端 Edge 的真实浏览器项目配置。
- `scripts/run-e2e.mjs`：启动本地生产服务器、等待就绪、运行 Playwright 并回收进程。
- `DESIGN_GUIDE.md`：唯一产品事实来源。
- `SECURITY.md`：安全实现与测试底线。
- `IMPLEMENTATION_PLAN.md`：阶段顺序与验收检查点。
- `docs/acceptance/first-e2e.md`：首条纵向验收材料的预期行为。
- `docs/brand/vita-assets.md`：记录维塔原创身份锁、七态动作与透明资产处理方式。
- `tests/fixtures/end-to-end/water-cycle.md`：首条纵向验收用 Markdown 材料。
- `public/vita/*.png`：维塔默认、等待上传、处理中、给提示、鼓励、展示答案和错误七态透明图片。

## 源代码

- `src/app/layout.tsx`：全局 HTML 外壳与页面元数据。
- `src/app/page.tsx`：挂载本地学习工作区。
- `src/app/globals.css`：全局令牌、四列工作区、窄屏抽屉与移动端布局样式。
- `src/app/icon.svg`：本地应用图标，避免页面请求外部或缺失图标。
- `src/config/security-headers.ts`：同源 CSP、嵌入防护、内容嗅探与浏览器权限限制。
- `src/lib/env/server.ts`：只在服务端调用边界校验 DeepSeek 环境配置。
- `src/lib/errors/public-error.ts`：定义不含堆栈、原因和上游正文的公共错误契约。
- `src/domain/types.ts`：任务、材料、知识地图、主题、层级、消息与报告的稳定领域类型。
- `src/domain/diagnostic/contracts.ts`：主题会话状态与 reducer 事件契约。
- `src/domain/diagnostic/reducer.ts`：唯一四层状态机，授权层级推进、提示、停滞、完成与计分。
- `src/domain/diagnostic/selectors.ts`：从唯一层级状态派生主题得分、材料进度和任务诊断状态。
- `src/storage/database.ts`：声明 IndexedDB 表、版本迁移与浏览器数据库单例。
- `src/storage/types.ts`：定义带显式 `taskId` 的本地记录与短时删除快照。
- `src/storage/task-repository.ts`：负责任务搜索、恢复、重命名、置顶、界面状态和事务性删除/撤销。
- `src/features/workspace/WorkspaceApp.tsx`：组合主工作区状态、四个可见区域、移动抽屉与任务对话框。
- `src/features/workspace/use-workspace.ts`：协调仓储读取与任务交互状态，不承载视图结构。
- `src/features/workspace/WorkspaceSidebar.tsx`：显示上传入口、搜索、任务列表和单任务菜单。
- `src/features/workspace/LearningPanels.tsx`：显示主题、聊天、禁用输入区和两组诊断信息骨架。
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
