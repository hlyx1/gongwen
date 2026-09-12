# AGENTS.md - 公文排版工具项目指南

本文档旨在帮助编程 AI Agent 快速了解和上手本项目。

## 项目概述

**公文排版工具** 是一个基于 GB/T 9704 国标的党政机关公文在线排版工具，支持实时预览、智能分页、DOCX 导出与 AI 校对。
**目标用户**: 需要按照国标格式排版公文的党政机关工作人员

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | React | 19.x |
| 语言 | TypeScript | 5.9.x |
| 构建工具 | Vite（target chrome78） | 7.x |
| DOCX 生成 | docx | 9.x |
| DOCX 解析 | mammoth | 1.x |
| 文件下载 | file-saver | 2.x |
| 统计后端 | FastAPI（仓库根 backend/） | - |
| 测试 | Vitest | 4.x |

## 核心架构

### 数据流

```
用户输入文本
    ↓
sanitizeText() - 标点净化、空白清理（utils/sanitize.ts）
    ↓
parseGongwen() - 文本解析为 AST（parser/）
    ↓
GongwenAST - 公文抽象语法树（title 为数组，支持多段标题）
    ↓
buildLayout() - 排版决策层（layout/，渲染器无关的单一真值纯函数）
    ↓
┌──────────────┬───────────────┬──────────────┐
│  Preview     │  DOCX 导出     │ DetectionPanel│
│  (预览渲染器)  │  (翻译层渲染)  │ + AI 校对链路  │
└──────────────┴───────────────┴──────────────┘
```

- **排版决策层是单一真值**：字体角色、run 分段、缩进、空行、版头/版记/页码参数全部决策于 `layout/`；预览与导出均为纯渲染器（详见裁定于 tasks/task-0001）。
- **已知预览/导出偏差**（待办-0001~0004）以显式开关集中登记于 `layout/deviations.ts`，默认值＝两渲染器现状；修复偏差＝晋升对应待办并翻转开关，禁止散落 if。
- **AI 校对链路**：`useAIProofread` → `sentenceSplitter`（切句）→ `textBlockSplitter`（分块）→ `aiProofreadService`（SSE 流式请求＋并发＋重试）→ `aiResponseParser`（表格行解析）。sentenceId 格式与切句边界为冻结项（高亮依赖）。

### 目录结构

```
src/
├── components/           # UI 组件
│   ├── AIProofreadButton/    # AI 校对启动/进度按钮
│   ├── AIProofreadSettings/  # AI 校对设置弹窗（自定义检查项/示例）
│   ├── DetectionPanel/       # 检测点面板（实时解析公文结构）
│   ├── Editor/               # 文本编辑器（支持拖拽上传）
│   ├── HistoryModal/         # 历史记录弹窗
│   ├── Preview/              # A4 分页预览（决策层渲染器）
│   │   ├── A4Page.tsx            # 单页装配（分页裁剪 + AI 悬停浮层状态）
│   │   ├── Preview.tsx           # 预览容器 + CSS 变量注入 + 度量容器
│   │   ├── renderContentFlow.tsx # 内容流共享渲染器（页面与度量容器同源）
│   │   ├── aiHighlight.tsx       # AI 高亮包装层（切句正则/sentenceId 冻结现状）
│   │   ├── A4HeaderSection.tsx   # 版头子组件
│   │   ├── A4FooterNote.tsx      # 版记子组件
│   │   └── A4PageNumber.tsx      # 页码子组件
│   ├── SettingsModal/        # 格式配置弹窗（含 FontSelectField 自定义字体下拉）
│   ├── StandardModal/        # 国标规范弹窗
│   └── Toolbar/              # 顶部工具栏
├── contexts/             # React Context 全局状态
│   └── DocumentConfigContext.tsx  # 文档配置状态管理（多配置保存/切换）
├── exporter/             # DOCX 导出（翻译层：决策中间表示 → docx 对象）
│   ├── docxBuilder.ts    # 版头/正文/版记三段组装（消费 buildLayout）
│   ├── styleFactory.ts   # 决策块 → docx 段落/文本/表格纯翻译
│   └── download.ts       # 文件下载封装
├── hooks/                # 自定义 Hooks
│   ├── useAIProofread.ts     # AI 校对流程管理（状态机/进度/结果聚合）
│   ├── useCustomFonts.ts     # 自定义字体加载
│   ├── useDetectionData.ts   # 检测数据计算（标题层级、序号检测）
│   ├── useDocumentParser.ts  # 文本 → AST 解析
│   └── usePagination.ts      # DOM 度量分页（视窗裁剪方案）
├── layout/               # 排版决策层（渲染器无关的单一真值，纯函数，
│   │                     #  禁止 import docx/react/DOM——有 purity 测试锁定）
│   ├── index.ts          # buildLayout：AST+配置 → 块序列+版头/版记/页码参数
│   ├── types.ts          # 决策中间表示（IR）类型
│   ├── fonts.ts          # 字体角色规格（roleSpec/bodyPunctSpec）
│   ├── runs.ts           # run 分段决策（标题首句/时间冒号/序号句点拆分）
│   ├── metrics.ts        # 度量与缩进决策（charSpacing/签名缩进）
│   ├── deviations.ts     # 已知预览/导出偏差显式开关（默认＝现状）
│   └── constants.ts      # 版式常量单源
├── parser/               # 公文文本解析器（行为锚点，有测试锁定）
│   ├── parser.ts         # 主解析器
│   └── matchers.ts       # 正则匹配规则
├── services/             # AI 服务
│   ├── aiProofreadService.ts  # 请求管线（提示词构建/SSE 流式解析/并发/重试）
│   └── aiServiceConfig.ts     # AI 服务配置（环境变量读取与校验）
├── types/                # TypeScript 类型定义
│   ├── aiProofread.ts    # AI 校对类型（配置/状态/结果）
│   ├── ast.ts            # AST 节点类型
│   ├── detection.ts      # 检测点相关类型
│   ├── documentConfig.ts # 文档配置类型+默认值+旧配置迁移（含备份）
│   └── history.ts        # 历史记录类型
├── utils/                # 工具函数
│   ├── aiResponseParser.ts    # AI 流式响应表格行解析（状态机）
│   ├── fileImporter.ts        # 文件导入（mammoth/txt）
│   ├── historyStorage.ts      # 历史记录 localStorage 存取
│   ├── sanitize.ts            # 标点净化（行为锚点，有测试锁定）
│   ├── sentenceSplitter.ts    # AI 校对用切句（含配对符号保护）
│   ├── statsPrinter.ts        # 使用统计控制台打印（刻意保留，勿删）
│   ├── statsReporter.ts       # 使用统计上报（/api/stats → backend）
│   └── textBlockSplitter.ts   # 切句后按字符数分块
├── data/                 # 国标数据
│   ├── gb9704.ts         # GB/T 9704 规范数据
│   └── gb33476.ts        # GB/T 33476 规范数据
└── main.tsx / App.tsx / index.css / App.css

backend/                  # FastAPI 统计服务（使用行为记录/防抖/汇总，供 statsReporter 上报）
gongwen-docker/           # docker-compose 部署配置（nginx 反代前端+统计后端）
tasks/                    # 任务档案（llm-tech-lead 工作流：详细需求/勘探/裁定/工作单元，
                          #  ctl 命令管理派工与验收；问题一律先入 待办池.md 分诊）
```

## 核心类型

### GongwenAST (公文抽象语法树)

```typescript
interface GongwenAST {
  title: DocumentNode[]   // 公文标题数组（支持多段标题，每段一行）
  body: DocumentNode[]    // 正文节点数组
}

enum NodeType {
  DOCUMENT_TITLE = 'DOCUMENT_TITLE',  // 公文标题
  HEADING_1 = 'HEADING_1',            // 一级标题「一、」
  HEADING_2 = 'HEADING_2',            // 二级标题「（一）」
  HEADING_3 = 'HEADING_3',            // 三级标题「1.」
  HEADING_4 = 'HEADING_4',            // 四级标题「（1）」
  PARAGRAPH = 'PARAGRAPH',            // 正文段落
  ADDRESSEE = 'ADDRESSEE',            // 主送机关
  ATTACHMENT = 'ATTACHMENT',          // 附件说明（AttachmentNode 含单/多附件项）
  SIGNATURE = 'SIGNATURE',            // 发文机关署名
  DATE = 'DATE',                      // 成文日期
  REMARK = 'REMARK',                  // 备注（成文日期后括号内容）
  TABLE = 'TABLE',                    // Markdown 表格（TableNode 含表头/数据行）
}
```

- **DocumentNode 为按 `type` 判别的封闭联合**（task-0002/待办-0029）：11 个同形状成员＋AttachmentNode＋TableNode＋Exclude 兜底成员（接住未来新增枚举值，保证联合 type 域跟随 NodeType 全集）。新增 NodeType 枚举成员时，4 处 switch 穷尽断言（layout/fonts.ts、layout/index.ts×2、hooks/useDetectionData.ts，经 types/ast.ts 的 `assertNever`）与各 `Record<NodeType, …>` 表（renderContentFlow 的 NODE_CLASS_MAP、detection 的 NODE_TO_DETECTION_MAP、sentenceSplitter 的两张切句表）会在 tsc 层强制报错——新增分支须同步补齐，禁止绕过。

### DocumentConfig (文档配置——合并后单一真值结构)

```typescript
interface DocumentConfig {
  margins: MarginsConfig        // 页边距 (cm)
  title: TitleConfig            // 标题格式
  headings: HeadingsConfig      // 标题字体单一真值（旧 headings/advanced 双轨已合并）
  body: BodyConfig              // 正文格式
  table: TableConfig            // 表格格式
  specialOptions: SpecialOptionsConfig  // 特殊选项（页码/印章）
  header: HeaderConfig          // 版头配置
  footerNote: FooterNoteConfig  // 版记配置
}

// 每级标题一组三控件：中文字体/英数字体（空串＝跟随中文）/字号
interface HeadingsConfig {
  h1: FontElementConfig
  h2: FontElementConfig
  h3: FontElementConfig
  addressee: FontElementConfig  // 主送机关（原高级设置扩展字段并入）
}
```

- 预览与导出消费**同一份** headings 数据（双轨时期「基础区只改预览、高级区只改导出」的分裂已消除）。
- 旧版 localStorage（键 `docx-document-config-v2`）读时自动迁移合并（两轨冲突以 advanced 为准），迁移前旧结构原样备份至 `docx-document-config-v2.backup-<时间戳>` 键——详见 `types/documentConfig.ts` 与其迁移测试。

## 关键模块详解

### 1. 解析器 (parser/)

**parseGongwen(text: string): GongwenAST**

将纯文本解析为公文 AST，识别规则：
- 第一个非空行（可多行）→ 公文标题
- 标题后第一个冒号结尾行 → 主送机关
- 「一、」开头 → 一级标题（黑体）
- 「（一）」开头 → 二级标题（楷体）
- 「1.」开头 → 三级标题（仿宋加粗）
- 「（1）」开头 → 四级标题（仿宋）
- 「附件：」开头 → 附件说明（自动识别单/多附件）
- 「XXXX年X月X日」格式 → 成文日期
- 成文日期前的短句（含机关关键词）→ 发文机关署名
- Markdown 表格 → TABLE 节点

### 2. 排版决策层 (layout/)

**buildLayout(ast, config, { renderer: 'preview' | 'docx' }): LayoutDocument**

排版决策的单一真值（纯函数模块）：
- 输入 AST + 配置 + 目标渲染器，输出块序列（段落/空行指令/表格，含对齐、缩进、行距、字体角色分段 runs）与版头/版记/页码版式参数
- 字体角色规格：`fonts.ts` 的 `roleSpec`（节点类型 → 字体四槽/字号/字符间距）
- run 分段决策：`runs.ts`（标题首句、时间冒号、三级标题序号句点、附件序号句点拆分）
- 度量与缩进：`metrics.ts`（charSpacing/首行缩进/签名居中缩进）
- 偏差开关：`deviations.ts` 集中登记已知预览/导出偏差（默认值＝现状）
- 纯度约束由 `layout/__tests__/purity.test.ts` 锁定（禁止 docx/react/DOM 依赖）

### 3. 导出器 (exporter/)

**buildDocument(ast, config): Document** — 纯翻译层

- **docxBuilder.ts**：版头段 → 正文流（逐块翻译）→ 版记浮动表格 + 奇偶页码页脚 + A4 页面骨架
- **styleFactory.ts**：决策块 → docx 段落/文本/表格（可选字段只在决策层给出时翻译）
- 行为锚点：`exporter/__tests__/docxBuilder.test.ts` 的 13 条导出快照（Packer 序列化核心部件结构快照，改动导出行为前先看该测试）

**特殊字符处理（决策在 layout/runs.ts，导出侧为翻译）：**

1. **时间格式中的半角冒号**（`9:00`）→ 正文字体四槽独立 run（清洗阶段 sanitize 已把全角还原半角）
2. **三级标题序号后的英文句号**（`1.xxx` 的 `.`）→ 正文字体（受偏差开关控制）
3. **附件说明序号后的英文句号**（多附件模式）→ 正文字体

### 4. 预览组件 (components/Preview/)

预览侧为排版决策层渲染器，DOM 类名与层级结构由 `__tests__/previewStructure.test.tsx` 的 14 条结构特征快照锁定（A4Page.css 与快照基线为行为保持红线）。

- **Preview.tsx**：注入 CSS 自定义属性；一次性调用 buildLayout，页面与度量容器消费同一份块序列；调用 usePagination 分页
- **renderContentFlow.tsx**：决策块序列 → React 节点共享渲染器（measurer 模式下表格按段落测量＝待办-0005 冻结现状）
- **aiHighlight.tsx**：AI 高亮包装层（切句正则与 sentenceId 拼接为冻结项）
- **A4Page.tsx**：单页装配（offsetY + clipHeight 分页裁剪，AI 悬停浮层状态）
- **usePagination.ts**：隐藏度量容器中 DOM 度量逐行计算分页断点（首页扣版头、末页避让版记），ResizeObserver 监听重算

### 5. 配置管理 (contexts/DocumentConfigContext.tsx)

**DocumentConfigProvider**: 全局配置状态
- 支持多配置保存/切换（reducer）
- localStorage 持久化（读时自动迁移旧双轨结构并备份，见上）
- 提供 updateConfig、switchConfig、saveAsCustomConfig、saveCurrentConfig、deleteCustomConfig
- 注意：AI 校对配置**不在**此处——App.tsx 用独立 state + 独立键 `ai-proofread-config` 管理

### 6. AI 校对链路 (services/ + hooks/useAIProofread + utils)

- **useAIProofread.ts**：流程状态机（idle/loading/success/error）、进度、结果 Map 聚合
- **sentenceSplitter.ts**：切句（含配对符号保护）；**textBlockSplitter.ts**：按字符数分块
- **aiProofreadService.ts**：构建提示词（内置+自定义检查项/示例）→ SSE 流式请求 → 逐行解析回调；多块并发（默认 3）＋失败重试（递增延迟）
- **aiResponseParser.ts**：流式 Markdown 表格行解析状态机
- **aiServiceConfig.ts**：环境变量（VITE_AI_BASE_URL/MODEL/API_KEY 等）读取与完整性校验

### 7. 检测点面板 (components/DetectionPanel/)

- 实时展示公文解析关键节点（标题/主送/正文统计/署名/成文日期），树形布局＋SVG 状态图标（正确/暂无/警告）
- 成文日期偏离当前日期 7 天以上警告；标题层级与序号依次递增检测（useDetectionData.ts）

### 8. 统计 (utils/statsPrinter+statsReporter / backend/)

- `statsReporter.ts` 上报使用行为到 `/api/stats/record`（dev 由 vite proxy 转 localhost:8000）
- `statsPrinter.ts` 启动时向控制台打印统计概览——**刻意保留的统计打印**，勿当调试日志清理（有治理测试豁免名单锁定）
- `backend/`：FastAPI 统计服务（记录防抖/日志/汇总查询）

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器（统计接口代理到 localhost:8000）
npm run dev

# 构建生产版本
npm run build

# 构建单文件离线版本（vite build --mode single，与 SINGLE_FILE=1 npx vite build 双入口等价）
npm run build:single

# 本地预览构建产物
npm run preview

# 运行测试
npm test

# 代码检查（门禁：必须零 error）
npm run lint
```

## 兼容性要求

**重要**: 目标浏览器为 Chrome 78 内核。构建目标已设为 `chrome78`（vite.config.ts 的 build.target 与 cssTarget）。

### JavaScript 语法（源码已放宽）

源码**可以使用**现代语法（可选链 `?.`、空值合并 `??`、模板字符串、`Array.at()` 等）——esbuild 按 chrome78 目标自动转译产物，产物兼容性由构建保证。旧版「源码禁用 `?.`/`??`」的限制已废止，无需手写 `obj && obj.prop` 等替代。

### CSS 限制（保留，必须遵守）

CSS 由 esbuild/LightningCSS 按 cssTarget chrome78 处理，但仍有特性需手动规避：

| 特性 | Chrome 版本 | 替代方案 |
|------|-------------|----------|
| `gap` (flexbox) | 84+ | `margin` + `> * + *` |
| `aspect-ratio` | 88+ | `padding-bottom` 百分比 |
| `:has()` | 105+ | JavaScript 动态类名 |
| `:is()`, `:where()` | 88+ | 展开选择器列表 |
| `clamp()`, `min()`, `max()` | 79+ | `calc()` 或媒体查询 |
| `inset` | 87+ | 拆分为四个属性 |

### 其他限制

- 不使用 emoji 表情
- 注释必须使用中文
- 仅考虑 1920×1080 桌面分辨率
- 不考虑移动端适配

## CSS 变量规范

**重要**: 所有颜色、阴影、圆角、过渡时间等样式值必须使用 `src/index.css` 中定义的 CSS 变量，禁止硬编码颜色值。

### 可用变量列表

| 变量名 | 用途 | 示例值 |
|--------|------|--------|
| `--color-primary` | 主色调（绿色） | `#047857` |
| `--color-primary-light` | 主色调浅色 | `#10b981` |
| `--color-primary-dark` | 主色调深色 | `#065f46` |
| `--color-primary-bg` | 主色调背景 | `#ecfdf5` |
| `--color-primary-border` | 主色调边框 | `#a7f3d0` |
| `--color-success` | 成功状态 | `#059669` |
| `--color-success-light` | 成功状态浅色 | `#10b981` |
| `--color-warning` | 警告状态 | `#d97706` |
| `--color-warning-light` | 警告状态浅色 | `#f59e0b` |
| `--color-error` | 错误状态 | `#dc2626` |
| `--color-error-light` | 错误状态浅色 | `#ef4444` |
| `--color-text-primary` | 主要文字 | `#0f172a` |
| `--color-text-secondary` | 次要文字 | `#64748b` |
| `--color-text-muted` | 弱化文字 | `#94a3b8` |
| `--color-border` | 边框颜色 | `#e2e8f0` |
| `--color-border-hover` | 边框悬停 | `#cbd5e1` |
| `--color-bg-main` | 主背景 | `#f1f5f9` |
| `--color-bg-card` | 卡片背景 | `#ffffff` |
| `--radius-sm` | 小圆角 | `6px` |
| `--radius-md` | 中圆角 | `8px` |
| `--radius-lg` | 大圆角 | `12px` |
| `--transition-fast` | 快速过渡 | `0.15s ease` |
| `--transition-normal` | 正常过渡 | `0.2s ease` |

### 使用示例

```css
/* 正确：使用 CSS 变量 */
.my-button {
  background-color: var(--color-primary);
  color: #ffffff;
  border-radius: var(--radius-md);
}

/* 错误：硬编码颜色值 */
.my-button {
  background-color: #047857;  /* 禁止 */
  color: #ffffff;
}
```

### 添加新变量

如需添加新的 CSS 变量，请在 `src/index.css` 的 `:root` 中定义，并更新此文档。

## 国标规范

### GB/T 9704-2012 主要参数

| 参数 | 数值 |
|------|------|
| 纸张 | A4 (210mm × 297mm) |
| 每页行数 | 22 行 |
| 每行字数 | 28 字 |
| 标题字体 | 方正小标宋_GBK, 22pt (二号) |
| 正文字体 | 仿宋_GB2312, 16pt (三号) |
| 一级标题 | 黑体, 三号 |
| 二级标题 | 楷体_GB2312, 三号 |
| 行距 | 29.6 磅 (固定值) |

### 页边距默认值

| 边距 | 数值 (cm) |
|------|-----------|
| 上 | 3.458 |
| 下 | 3.258 |
| 左 | 2.8 |
| 右 | 2.6 |

## 常见开发场景

### 添加新的节点类型

1. 在 `types/ast.ts` 中添加 NodeType 枚举值
2. 在 `parser/matchers.ts` 中添加正则匹配规则
3. 在 `parser/parser.ts` 的 detectNodeType 中添加识别逻辑
4. 在 `layout/fonts.ts`（角色规格）与 `layout/index.ts`（对齐/缩进/分段）中添加排版决策
5. 在 `components/Preview/renderContentFlow.tsx` 中添加渲染逻辑

### 修改默认配置

1. 修改 `types/documentConfig.ts` 中的 `DEFAULT_CONFIG`
2. 确保符合 GB/T 9704 国标要求
3. 若涉及存储结构变化，同步维护 `migrateDocumentConfig`/`migrateConfigStorage` 与迁移测试

### 添加新的配置项

1. 在 `types/documentConfig.ts` 中扩展接口
2. 在 `DEFAULT_CONFIG` 中添加默认值
3. 在 `components/SettingsModal/` 中添加 UI 控件
4. 在 `layout/`（决策）中消费——预览与导出自动同源

## 测试

测试文件位于各模块 `__tests__/` 目录（共 16 个测试文件、340 个用例：parser 42 / sanitize 36 / aiResponseParser 14 / layout 六件套 134 / styleFactory 60 / docxBuilder 10（含 13 条导出快照）/ previewStructure 14（结构快照）/ documentConfigMigration 19 / Toolbar 6 / useAIProofread 3 / sourceGovernance 2），使用 Vitest 框架（environment=node）：

```bash
# 运行测试
npm test

# 监听模式
npm test -- --watch
```

注意：
- `exporter/__tests__/__snapshots__/` 的导出产物结构快照与 `components/Preview/__tests__/__snapshots__/` 的预览结构快照是行为保持基线，快照变更即意味着渲染行为改变，须确认有意为之。
- `utils/__tests__/sourceGovernance.test.ts` 锁定源码治理口径：调试 console.log 仅允许存在于 statsPrinter.ts、死文件不得复活。

## 部署

### GitHub Pages

- 自动部署：推送到 main 分支触发 GitHub Actions
- 路径前缀：`/gongwen/`

### Vercel

- 支持 One-Click Deploy
- 无需路径前缀

### Docker（gongwen-docker/）

- docker-compose 编排 nginx（前端）＋ FastAPI 统计后端

### 离线版本

- 运行 `npm run build:single` 生成 `dist/index.html`
- 双击 HTML 文件即可使用

## 注意事项

1. **代码风格**: 函数级注释必须使用中文；lint 门禁零 error（var/未用变量等由 eslint 约束）
2. **兼容性**: 产物兼容 Chrome 78 由构建目标保证；CSS 限制仍需手动遵守（见上）
3. **国标合规**: 修改排版参数时参考 GB/T 9704-2012
4. **预览性能**: 预览为全量渲染＋视窗裁剪分页（offsetY+clipHeight），非虚拟滚动
5. **持久化**: 用户内容和配置自动保存到 localStorage（编辑文本、文档配置、AI 校对配置、历史记录各自独立键）
6. **调试日志**: 生产源码不允许调试 console.log（statsPrinter 刻意统计除外，治理测试锁定）；错误路径可用 console.error

## 相关文档

- [GB/T 9704-2012 党政机关公文格式](http://www.gov.cn/zhengce/content/2012-07/01/content_2610878.htm)
- [docx 库文档](https://docx.js.org/)
- [React 19 文档](https://react.dev/)
- [Vite 文档](https://vite.dev/)
