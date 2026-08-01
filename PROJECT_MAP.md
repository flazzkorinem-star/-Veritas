# Veritas 项目地图

> 本文只记录当前真实代码结构与职责。新增、移动或删除关键入口后必须同步更新。

## 当前阶段

阶段 1：工程脚手架与质量门。

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
- `tests/fixtures/end-to-end/water-cycle.md`：首条纵向验收用 Markdown 材料。

## 源代码

- `src/app/layout.tsx`：全局 HTML 外壳与页面元数据。
- `src/app/page.tsx`：当前阶段的最小应用入口。
- `src/app/globals.css`：Tailwind 入口与最小全局样式。
- `src/config/security-headers.ts`：同源 CSP、嵌入防护、内容嗅探与浏览器权限限制。
- `src/lib/env/server.ts`：只在服务端调用边界校验 DeepSeek 环境配置。
- `src/lib/errors/public-error.ts`：定义不含堆栈、原因和上游正文的公共错误契约。

## 测试

- `e2e/smoke.spec.ts`：验证桌面与移动端均可打开基础页面。
