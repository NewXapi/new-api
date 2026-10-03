# 前端 MD3 统一规范（第二阶段）

本规范是 `apps/web` 的可执行硬规则，适用于本轮新增与修改的页面、共享组件和主题代码。[仓库根约定](../../AGENTS.md) 提供通用工程约定；本文件独立记录前端落地边界、组件契约与检查要求，不依赖工作区外的计划文件或绝对路径。

## 1. 边界与所有权

- 只做页面组装和视觉系统工作；不得改变 API、计费、权限、路由、schema、业务语义、请求参数、缓存策略或状态语义。
- 共享组件 owner 负责 `src/styles/*`、`src/components/ui/*`、`src/components/layout/*`、`src/components/data-table/*`、dialog、共享 auth/i18n、主题 provider/config drawer。其他 feature 目录由其 owner 维护；跨 owner 需求必须先交接口请求，不直接编辑。
- 不新增与现有 Card、Main、SectionPageLayout、Button、data-table、dialog 重叠的私有副本。新增公共能力须先确认有至少两个真实消费者并报告给基础 owner。
- 不改依赖清单、锁文件或生成产物；不运行本地安装、build、compile、test。

## 2. 组件契约

- 现有导出名、props、事件、ref 转发、`className` 合并、`render`/受控行为、data-slot、ARIA 语义必须保持兼容；增强只能是向后兼容。
- 所有视觉颜色、表面、边框、阴影、圆角和动效参数优先使用 `theme.css`/`theme-presets.css` 令牌，不在页面散落硬编码颜色或重复阴影。
- 卡片使用现有 `Card` 及 `CardHeader`、`CardContent`、`CardFooter`；页面骨架使用 `Main`、`SectionPageLayout`。Portal 浮层必须自带完整表面、前景、边框和 scrim 令牌，不能依赖页面祖先选择器。
- 禁止嵌套交互元素（按钮/链接/菜单触发器不得互相包裹）。图标按钮必须有明确 `aria-label`；装饰图标使用 `aria-hidden`。
- 密集表格保持可读性：不牺牲行高、对比度、键盘焦点、横向滚动和批量操作来追求卡片化。

## 3. 页面与表面

- 页面背景使用 `bg-background`，主要容器使用 `bg-card`/`bg-popover`/`bg-muted` 等语义令牌；禁止以透明度复制一套独立表面语义。
- 标题、面包屑、主要动作、筛选工具栏和内容区遵循 `SectionPageLayout` 的既有槽位；toolbar 不嵌套表单交互，筛选/重置/视图动作保留现有契约。
- 空、加载、错误状态优先复用现有 `Empty`、`Skeleton`、`Spinner`、`Alert` 等组件；状态文字必须可读且可被辅助技术识别。
- Card 与登录卡片使用 `theme.css` 的 82% 表面令牌；页面使用派生 tonal 背景，表格正文及 Portal 浮层保留不透明语义表面保证可读。模糊只 gate backdrop-filter，默认关闭，与透明度独立；全站与登录页只允许使用同一个 customization provider 状态，不得另建 localStorage/cookie/state。

## 4. 主题、i18n 与无障碍

- 主题切换必须复用 `useTheme` 的 `resolvedTheme`/`setTheme`；不得另建主题状态。亮暗切换控件的名称说明目标状态，键盘可达，视觉动画必须兼容 reduced motion。
- 新文字沿用现有 `useTranslation()` 与 flat locale key 约定；若确需新增 key，必须在所有支持语言提供 fallback，不以业务英文硬编码替代翻译。
- 保留 focus-visible、键盘操作、对比度和屏幕阅读器名称；不可用颜色作为唯一状态提示。

## 5. 动效与资源清理

- 动效只使用轻量 `transform`/`opacity` 或已有组件动画；所有非必要动画在 `prefers-reduced-motion: reduce` 下禁用或缩短。
- effect 创建的监听器、请求、订阅和定时器必须在 cleanup 中释放；组件卸载后不得更新状态。
- 不为视觉改动顺手修复邻近业务 bug；发现契约或真实性问题只记录给对应 owner。

## 6. 交付检查

提交给主代理前必须：逐个阅读实际 diff，确认没有跨 owner 文件、业务/API 变更、重复共享实现或嵌套交互；仅做轻量静态检查（`git diff --check`、定向 grep、JSON 解析等）。未运行浏览器或 CI 时明确标记为未验证，不得声称视觉、构建或功能验证通过。
