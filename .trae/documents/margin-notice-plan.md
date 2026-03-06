# 页面边距设置说明实施计划

## 任务概述
在设置弹窗的"页面边距"部分增加一个正式的规范说明，解释上边距的规范要求。

## 需求分析

### 背景说明
- GB/T 9704-2012 规定"天头（上白边）为37mm"
- 办公软件中的"上边距"与标准中的"上白边"定义不同
- GB/T 33476.2-2016 明确了电子公文的页面边距参数：
  - 上边距：34.58mm
  - 下边距：32.58mm

### 说明文案（正式书面语）
> **规范说明**
> 
> GB/T 9704-2012 规定的"天头（上白边）为37mm"与办公软件中的"上边距"概念存在差异。根据 GB/T 33476.2-2016《党政机关电子公文格式规范 第2部分：显现》，电子公文页面边距应设置为：上边距 34.58mm、下边距 32.58mm。

## 实施步骤

### 步骤1：修改 SettingsModal.tsx
在页面边距设置区块（约第240行）的标题下方添加说明组件。

**修改位置**：`src/components/SettingsModal/SettingsModal.tsx`

在 `<h3 className="settings-section-title">页面边距</h3>` 之后添加：
```tsx
<div className="settings-notice">
  <div className="settings-notice-header">
    <span className="settings-notice-icon">!</span>
    <span className="settings-notice-title">规范说明</span>
  </div>
  <p className="settings-notice-content">
    GB/T 9704-2012 规定的"天头（上白边）为37mm"与办公软件中的"上边距"概念存在差异。根据 GB/T 33476.2-2016《党政机关电子公文格式规范 第2部分：显现》，电子公文页面边距应设置为：上边距 34.58mm、下边距 32.58mm。
  </p>
</div>
```

### 步骤2：添加样式
**修改位置**：`src/components/SettingsModal/SettingsModal.css`

在 `.settings-hint` 样式附近添加说明框样式：
```css
/* 规范说明框 */
.settings-notice {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 6px;
}

.settings-notice-header {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.settings-notice-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  border-radius: 50%;
  background: #f59e0b;
  color: white;
  font-size: 11px;
  font-weight: 600;
  font-style: normal;
}

.settings-notice-title {
  font-size: 13px;
  font-weight: 600;
  color: #92400e;
}

.settings-notice-content {
  font-size: 12px;
  line-height: 1.6;
  color: #78350f;
  margin: 0;
}
```

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/SettingsModal/SettingsModal.tsx` | 修改 | 添加规范说明组件 |
| `src/components/SettingsModal/SettingsModal.css` | 修改 | 添加说明框样式 |

## 设计要点

1. **视觉层次**：使用黄色警告色调，与普通提示文字区分
2. **信息结构**：标题 + 内容的双层结构，便于快速理解
3. **兼容性**：不使用 gap 属性，使用 margin 实现间距
