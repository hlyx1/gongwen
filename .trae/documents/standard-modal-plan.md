# 公文格式规范弹窗功能实施计划

## 任务概述
为工具栏中的"依据 《党政机关公文格式》（GB/T 9704-2012）"说明文字添加点击弹窗功能，展示规范原文。

## 需求分析

### 1. 规范原文结构
规范原文共11个章节，具有层级结构：
- **一级标题**：1 范围、2 规范性引用文件、3 术语和定义...
- **二级标题**：5.1 幅面尺寸、5.2 版面、7.2 版头...
- **三级标题**：5.2.1 页边与版心尺寸、7.2.1 份号...
- **四级标题**：7.3.5.1 加盖印章的公文...

### 2. 设计要求
- 弹窗美观，有层次有结构展示
- 支持目录导航（左侧目录 + 右侧内容）
- 说明文字需要明显的可点击样式提示

## 实施步骤

### 步骤1：创建规范数据文件
**文件**: `src/data/gb9704.ts`

将规范原文解析为结构化数据：
```typescript
interface Section {
  id: string;           // 如 "5.2.1"
  title: string;        // 如 "页边与版心尺寸"
  content?: string;     // 正文内容
  children?: Section[]; // 子章节
}
```

### 步骤2：创建规范弹窗组件
**文件**: `src/components/StandardModal/StandardModal.tsx`

组件结构：
- 左侧：固定目录导航（可折叠）
- 右侧：内容区域（可滚动）
- 顶部：标题栏 + 关闭按钮

### 步骤3：创建弹窗样式文件
**文件**: `src/components/StandardModal/StandardModal.css`

样式要点：
- 弹窗尺寸：宽度 900px，高度 80vh
- 左侧目录宽度：220px
- 目录项高亮当前选中
- 内容区域滚动时自动高亮对应目录项
- 兼容 Chrome 78（不使用 gap、:has() 等新特性）

### 步骤4：修改 Toolbar 组件
**文件**: `src/components/toolbar/Toolbar.tsx`

修改内容：
- 添加 `showStandard` 状态控制弹窗显示
- 将说明文字改为可点击按钮
- 引入 StandardModal 组件

### 步骤5：修改 Toolbar 样式
**文件**: `src/components/toolbar/Toolbar.css`

修改 `.toolbar-badge` 样式：
- 添加 cursor: pointer
- 添加 hover 效果（背景色变化 + 下划线）
- 添加点击提示图标（如问号或书卷图标）
- 保持与整体设计风格一致

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/data/gb9704.ts` | 新建 | 规范原文结构化数据 |
| `src/components/StandardModal/StandardModal.tsx` | 新建 | 规范弹窗组件 |
| `src/components/StandardModal/StandardModal.css` | 新建 | 弹窗样式 |
| `src/components/toolbar/Toolbar.tsx` | 修改 | 添加弹窗触发逻辑 |
| `src/components/toolbar/Toolbar.css` | 修改 | 添加可点击样式 |

## 技术要点

### Chrome 78 兼容性
- 使用 `grid-row-gap` 和 `grid-column-gap` 替代 `gap`
- 使用 `> * + *` 相邻选择器实现间距
- 不使用 `:has()`、`:is()` 等新选择器
- 不使用 `clamp()`、`min()`、`max()` 等 CSS 函数

### 目录导航交互
- 点击目录项滚动到对应内容
- 内容滚动时自动高亮当前目录项（使用 IntersectionObserver）
- 目录支持折叠/展开

### 样式设计
- 参考现有 SettingsModal 的设计风格
- 目录使用深色背景区分
- 内容区域使用清晰的层级标题样式
