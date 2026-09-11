# AGENTS.md - 公文排版工具项目指南

本文档旨在帮助编程 AI Agent 快速了解和上手本项目。

## 项目概述

**公文排版工具** 是一个基于 GB/T 9704 国标的党政机关公文在线排版工具，支持实时预览、智能分页和 DOCX 导出。
**目标用户**: 需要按照国标格式排版公文的党政机关工作人员

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | React | 19.x |
| 语言 | TypeScript | 5.9.x |
| 构建工具 | Vite | 7.x |
| DOCX 生成 | docx | 9.x |
| DOCX 解析 | mammoth | 1.x |
| 文件下载 | file-saver | 2.x |
| 测试 | Vitest | 4.x |

## 核心架构

### 数据流

```
用户输入文本
    ↓
sanitizeText() - 标点净化、空白清理
    ↓
parseGongwen() - 文本解析为 AST
    ↓
GongwenAST - 公文抽象语法树
    ↓
buildLayout() - 排版决策层（src/layout/，渲染器无关的单一真值）
    ↓
┌─────────────┬──────────────┐
│  Preview    │  DOCX 导出    │
│  (实时预览)  │  (翻译层渲染) │
└─────────────┴──────────────┘
```

### 目录结构

```
src/
├── components/           # UI 组件
│   ├── Editor/          # 文本编辑器（支持拖拽上传）
│   ├── Preview/         # A4 分页预览
│   │   ├── A4Page.tsx        # 单页装配（决策层渲染器，分页裁剪 + 悬停浮层状态）
│   │   ├── Preview.tsx       # 预览容器 + CSS 变量注入 + 度量容器
│   │   ├── renderContentFlow.tsx  # 内容流共享渲染器（块序列 → React 节点）
│   │   ├── aiHighlight.tsx   # AI 高亮包装层（切句正则 + sentenceId 冻结现状）
│   │   ├── A4HeaderSection.tsx    # 版头子组件
│   │   ├── A4FooterNote.tsx  # 版记子组件
│   │   └── A4PageNumber.tsx  # 页码子组件
│   ├── DetectionPanel/  # 检测点面板（实时解析公文结构）
│   │   ├── DetectionPanel.tsx  # 主组件
│   │   └── DetectionPanel.css  # 样式
│   ├── SettingsModal/   # 格式配置弹窗
│   ├── StandardModal/   # 国标规范弹窗
│   └── Toolbar/         # 顶部工具栏
├── contexts/            # React Context 全局状态
│   └── DocumentConfigContext.tsx  # 文档配置状态管理
├── exporter/            # DOCX 导出（翻译层：决策中间表示 → docx 对象）
│   ├── docxBuilder.ts   # 版头/正文/版记三段组装（消费 buildLayout）
│   ├── styleFactory.ts  # 决策块 → docx 段落/文本/表格纯翻译
│   └── download.ts      # 文件下载封装
├── hooks/               # 自定义 Hooks
│   ├── useDocumentParser.ts  # 文本 → AST 解析
│   ├── usePagination.ts      # 分页计算
│   ├── useCustomFonts.ts     # 自定义字体加载
│   └── useDetectionData.ts   # 检测数据计算（标题层级、序号检测）
├── layout/              # 排版决策层（渲染器无关的单一真值，纯函数）
│   ├── index.ts         # buildLayout：AST+配置 → 块序列+版头/版记/页码参数
│   ├── types.ts         # 决策中间表示（IR）类型
│   ├── fonts.ts         # 字体角色规格（roleSpec/bodyPunctSpec）
│   ├── runs.ts          # run 分段决策（标题首句/时间冒号/序号句点拆分）
│   ├── metrics.ts       # 度量与缩进决策（charSpacing/charWidth/签名缩进）
│   ├── deviations.ts    # 已知预览/导出偏差显式开关（默认＝现状）
│   └── constants.ts     # 版式常量单源
├── parser/              # 公文文本解析器
│   ├── parser.ts        # 主解析器
│   └── matchers.ts      # 正则匹配规则
├── types/               # TypeScript 类型定义
│   ├── ast.ts           # AST 节点类型
│   ├── detection.ts     # 检测点相关类型
│   └── documentConfig.ts # 文档配置类型
├── utils/               # 工具函数
│   ├── sanitize.ts      # 标点净化
│   └── fileImporter.ts  # 文件导入
├── constants/           # 常量定义
│   └── gongwen.ts       # GB/T 9704 排版常量
├── data/                # 国标数据
│   ├── gb9704.ts        # GB/T 9704 规范数据
│   └── gb33476.ts       # GB/T 33476 规范数据
└── public/              # 静态资源
    ├── 正确.svg         # 检测点正确状态图标
    ├── 暂无.svg         # 检测点缺失状态图标
    └── 警告.svg         # 检测点警告状态图标
```

## 核心类型

### GongwenAST (公文抽象语法树)

```typescript
interface GongwenAST {
  title: DocumentNode | null  // 公文标题
  body: DocumentNode[]        // 正文节点数组
}

enum NodeType {
  DOCUMENT_TITLE = 'DOCUMENT_TITLE',  // 公文标题
  HEADING_1 = 'HEADING_1',            // 一级标题「一、」
  HEADING_2 = 'HEADING_2',            // 二级标题「（一）」
  HEADING_3 = 'HEADING_3',            // 三级标题「1.」
  HEADING_4 = 'HEADING_4',            // 四级标题「（1）」
  PARAGRAPH = 'PARAGRAPH',            // 正文段落
  ADDRESSEE = 'ADDRESSEE',            // 主送机关
  ATTACHMENT = 'ATTACHMENT',          // 附件说明
  SIGNATURE = 'SIGNATURE',            // 发文机关署名
  DATE = 'DATE',                      // 成文日期
}
```

### DocumentConfig (文档配置)

```typescript
interface DocumentConfig {
  margins: MarginsConfig        // 页边距 (cm)
  title: TitleConfig            // 标题格式
  headings: HeadingsConfig      // 标题与主送机关字体（单一真值，含中文字体/英数字体/字号）
  body: BodyConfig              // 正文格式
  specialOptions: SpecialOptionsConfig  // 特殊选项
  header: HeaderConfig          // 版头配置
  footerNote: FooterNoteConfig  // 版记配置
  // ... 更多配置项
}
```

## 关键模块详解

### 1. 解析器 (parser/)

**parseGongwen(text: string): GongwenAST**

将纯文本解析为公文 AST，识别规则：
- 第一个非空行 → 公文标题
- 标题后第一个冒号结尾行 → 主送机关
- 「一、」开头 → 一级标题（黑体）
- 「（一）」开头 → 二级标题（楷体）
- 「1.」开头 → 三级标题（仿宋加粗）
- 「（1）」开头 → 四级标题（仿宋）
- 「附件：」开头 → 附件说明
- 「XXXX年X月X日」格式 → 成文日期
- 成文日期前的短句（含机关关键词）→ 发文机关署名

### 2. 排版决策层 (layout/)

**buildLayout(ast: GongwenAST, config: DocumentConfig, options): LayoutDocument**

排版决策的单一真值（渲染器无关的纯函数模块，禁止 import docx/react/DOM）：
- 输入 AST + 配置 + 目标渲染器（`preview` / `docx`），输出块序列
  （段落/空行指令/表格，含对齐、缩进、行距、字体角色分段 runs）
  与版头/版记/页码版式参数
- 字体角色规格：`fonts.ts` 的 `roleSpec`（节点类型 → 字体四槽/字号/字符间距）
- run 分段决策：`runs.ts`（标题首句、时间冒号、三级标题序号句点、附件序号句点拆分）
- 度量与缩进：`metrics.ts`（charSpacing/charWidth/首行缩进/签名居中缩进）
- 已知偏差开关：`deviations.ts` 集中定义（待办-0001~0004，默认值＝两渲染器现状；
  偏差修复＝晋升待办并翻转开关）
- **docx 导出已接线决策层**（exporter/ 为纯翻译层）；预览侧接线属后续单元

### 3. 导出器 (exporter/)

**buildDocument(ast: GongwenAST, config: DocumentConfig): Document**

docx 渲染器翻译层——先经 `buildLayout(ast, config, { renderer: 'docx' })` 取得
决策中间表示，再按三段组装为 docx Document：
- **docxBuilder.ts**：版头段（机关标志/空行/字号签发人/红色分隔线）→
  正文流（`blocksToDocx` 逐块翻译）→ 版记浮动表格 + 奇偶页码页脚 + A4 页面骨架
- **styleFactory.ts**：决策块 → docx 段落/文本/表格的纯翻译
  （可选字段只在决策层给出时翻译，不补默认值——docx 对空对象产出空标签）
- 行为锚点：`exporter/__tests__/docxBuilder.test.ts` 的 13 条导出快照
  （Packer 序列化核心部件结构快照，改动导出行为前先看该测试）

**特殊字符处理（决策在 layout/，导出侧为翻译）：**

1. **时间格式中的半角冒号**（如 `9:00`、`14:30`）使用正文字体四槽：
   - 清洗阶段：`sanitize.ts` 将时间格式的全角冒号还原为半角冒号（`3：00` → `3:00`）
   - 决策阶段：`layout/runs.ts` 的 `splitTimeColonRuns` 将半角冒号独立成
     bodyPunct 角色 run（字号随宿主段落）
2. **三级标题序号后的英文句号**（如 `1.xxx` 中的 `.`）使用正文字体：
   - 决策阶段：`splitHeading3NumberDotRuns`（受待办-0001/0004 偏差开关控制，
     docx 现状＝拆分且全角句点不拆）
3. **附件说明序号后的英文句号**（多附件模式）使用正文字体：
   - 决策阶段：`layout/runs.ts` 的 `splitAttachmentRuns`（单附件不拆分）

### 4. 预览组件 (components/Preview/)

预览侧为排版决策层（`src/layout/`，`buildLayout(renderer='preview')`）的渲染器，
DOM 类名与层级结构由结构特征快照测试锁定（`__tests__/previewStructure.test.tsx`，
renderToStaticMarkup，A4Page.css 与快照基线为行为保持红线）。

**Preview.tsx**: 预览容器
- 注入 CSS 自定义属性（字体、字号、行距、页边距）
- 一次性调用 buildLayout，页面与度量容器消费同一份块序列渲染输出
- 调用 usePagination 进行分页计算
- 渲染多个 A4Page 组件

**renderContentFlow.tsx**: 内容流共享渲染器
- 把决策层块序列翻译为 React 节点（A4Page 视窗与度量容器共用）
- mode='measurer'：度量容器形态——表格按段落测量（待办-0005 冻结现状）
- 标题首句 inline 类名按段落源类型映射（a4-h4-inline 等冻结表现）

**aiHighlight.tsx**: AI 高亮包装层
- 切句正则与 sentenceId 拼接自旧 A4Page 原样迁移（与 sentenceSplitter
  的既有差异为冻结项，待办-0013）

**A4Page.tsx**: 单页装配
- 模拟 A4 纸张尺寸 (210mm × 297mm)
- 通过 offsetY + clipHeight 实现分页裁剪
- 装配版头/版记/页码子组件与内容流，AI 悬停浮层状态保留于此

**A4HeaderSection / A4FooterNote / A4PageNumber**: 版头/版记/页码子组件
- 消费决策层版式参数（buildLayout.header/footerNote/pageNumber）

### 5. 配置管理 (contexts/DocumentConfigContext.tsx)

**DocumentConfigProvider**: 全局配置状态
- 支持多配置保存/切换
- localStorage 持久化
- 提供 updateConfig、switchConfig、saveAsCustomConfig 等方法

### 6. 检测点面板 (components/DetectionPanel/)

**DetectionPanel.tsx**: 检测点面板组件
- 实时展示公文解析结果的关键节点信息
- 树形结构布局：左侧竖线主干 + 横线连接叶子节点
- 使用 SVG 图标展示节点状态（正确/暂无/警告）
- 根据状态动态调整颜色（绿色/灰色/红色）

**检测点类型**：
- 公文标题
- 主送机关
- 正文内容（字数统计、标题统计）
- 发文机关署名
- 成文日期

**检测功能**：
- 成文日期偏离当前日期 7 天以上时警告
- 标题层级检测：检查标题是否符合树形结构规范
- 标题序号检测：检查各级标题序号是否依次递增

**useDetectionData.ts**: 检测数据计算 Hook
- 计算正文统计信息（字数、段落数、各级标题数量）
- 检查标题层级是否正确
- 检查标题序号是否正确
- 检查成文日期是否偏离

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 构建单文件离线版本
npm run build:single

# 本地预览构建产物
npm run preview

# 运行测试
npm test

# 代码检查
npm run lint
```

## 兼容性要求

**重要**: 目标浏览器为 Chrome 78 内核，必须遵守以下限制：

### JavaScript 限制

| 特性 | Chrome 版本 | 替代方案 |
|------|-------------|----------|
| 可选链 `?.` | 80+ | `obj && obj.prop` |
| 空值合并 `??` | 80+ | `\|\|` |
| `replaceAll()` | 85+ | `str.split(old).join(new)` |
| `Array.at()` | 92+ | `arr[arr.length - n]` |
| 逻辑赋值 `??=`, `\|\|=`, `&&=` | 85+ | 完整条件判断 |

### CSS 限制

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

.my-button:hover {
  background-color: var(--color-primary-light);
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

### 添加新的配置项

1. 在 `types/documentConfig.ts` 中扩展接口
2. 在 `DEFAULT_CONFIG` 中添加默认值
3. 在 `components/SettingsModal/` 中添加 UI 控件
4. 在 `exporter/` 和 `components/Preview/` 中应用配置

## 测试

测试文件位于 `parser/__tests__/`、`utils/__tests__/`、`layout/__tests__/`、`exporter/__tests__/`、`components/Preview/__tests__/` 目录（公文解析、清洗规则、AI 响应解析、排版决策、导出翻译与产物结构、预览结构特征快照），使用 Vitest 框架：

```bash
# 运行测试
npm test

# 监听模式
npm test -- --watch
```

注意：`exporter/__tests__/__snapshots__/` 中的导出产物结构快照是导出行为基线
（重构前后一致性对照标准），快照变更即意味着导出行为改变，须确认行为变化有意为之后方可更新。

## 部署

### GitHub Pages

- 自动部署：推送到 main 分支触发 GitHub Actions
- 路径前缀：`/gongwen/`

### Vercel

- 支持 One-Click Deploy
- 无需路径前缀

### 离线版本

- 运行 `npm run build:single` 生成 `dist/index.html`
- 双击 HTML 文件即可使用

## 注意事项

1. **代码风格**: 函数级注释必须使用中文
2. **兼容性**: 始终考虑 Chrome 78 内核限制
3. **国标合规**: 修改排版参数时参考 GB/T 9704-2012
4. **性能**: 预览使用虚拟滚动，避免渲染过多页面
5. **持久化**: 用户内容和配置自动保存到 localStorage

## 相关文档

- [GB/T 9704-2012 党政机关公文格式](http://www.gov.cn/zhengce/content/2012-07/01/content_2610878.htm)
- [docx 库文档](https://docx.js.org/)
- [React 19 文档](https://react.dev/)
- [Vite 文档](https://vite.dev/)
