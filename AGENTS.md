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
┌─────────────┬──────────────┐
│  Preview    │  DOCX 导出    │
│  (实时预览)  │  (Word下载)   │
└─────────────┴──────────────┘
```

### 目录结构

```
src/
├── components/           # UI 组件
│   ├── Editor/          # 文本编辑器（支持拖拽上传）
│   ├── Preview/         # A4 分页预览
│   │   ├── A4Page.tsx   # 单页渲染 + 分页裁剪逻辑
│   │   └── Preview.tsx  # 预览容器 + CSS 变量注入
│   ├── DetectionPanel/  # 检测点面板（实时解析公文结构）
│   │   ├── DetectionPanel.tsx  # 主组件
│   │   └── DetectionPanel.css  # 样式
│   ├── SettingsModal/   # 格式配置弹窗
│   ├── StandardModal/   # 国标规范弹窗
│   └── Toolbar/         # 顶部工具栏
├── contexts/            # React Context 全局状态
│   └── DocumentConfigContext.tsx  # 文档配置状态管理
├── exporter/            # DOCX 导出模块
│   ├── docxBuilder.ts   # AST → docx Document 转换
│   ├── styleFactory.ts  # 段落/文本样式工厂
│   └── download.ts      # 文件下载封装
├── hooks/               # 自定义 Hooks
│   ├── useDocumentParser.ts  # 文本 → AST 解析
│   ├── usePagination.ts      # 分页计算
│   ├── useCustomFonts.ts     # 自定义字体加载
│   └── useDetectionData.ts   # 检测数据计算（标题层级、序号检测）
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
  headings: HeadingsConfig      // 各级标题字体
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

### 2. 导出器 (exporter/)

**buildDocument(ast: GongwenAST, config: DocumentConfig): Document**

将 AST 转换为 docx 库的 Document 对象：
- 支持版头（发文机关标志、发文字号、签发人、红色分隔线）
- 支持版记（抄送机关、印发机关、印发日期）
- 支持奇偶页不同页码位置
- 支持附件说明的单/多附件模式

### 3. 预览组件 (components/Preview/)

**Preview.tsx**: 预览容器
- 注入 CSS 自定义属性（字体、字号、行距、页边距）
- 调用 usePagination 进行分页计算
- 渲染多个 A4Page 组件

**A4Page.tsx**: 单页渲染
- 模拟 A4 纸张尺寸 (210mm × 297mm)
- 通过 offsetY + clipHeight 实现分页裁剪
- 渲染版头、正文、版记、页码

### 4. 配置管理 (contexts/DocumentConfigContext.tsx)

**DocumentConfigProvider**: 全局配置状态
- 支持多配置保存/切换
- localStorage 持久化
- 提供 updateConfig、switchConfig、saveAsCustomConfig 等方法

### 5. 检测点面板 (components/DetectionPanel/)

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
4. 在 `exporter/styleFactory.ts` 中添加样式映射
5. 在 `components/Preview/A4Page.tsx` 中添加渲染逻辑

### 修改默认配置

1. 修改 `types/documentConfig.ts` 中的 `DEFAULT_CONFIG`
2. 确保符合 GB/T 9704 国标要求

### 添加新的配置项

1. 在 `types/documentConfig.ts` 中扩展接口
2. 在 `DEFAULT_CONFIG` 中添加默认值
3. 在 `components/SettingsModal/` 中添加 UI 控件
4. 在 `exporter/` 和 `components/Preview/` 中应用配置

## 测试

测试文件位于 `parser/__tests__/` 目录，使用 Vitest 框架：

```bash
# 运行测试
npm test

# 监听模式
npm test -- --watch
```

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
