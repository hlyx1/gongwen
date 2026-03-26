---
trigger: always_on
---
目标：Chrome 78 内核

核心要求：

- 不使用 ES2020 及以上新特性
- 不使用新标准 CSS
- 不使用 emoji 表情
- 仅考虑 1920×1080 桌面分辨率

JavaScript 不兼容特性及替代：

- `?.` (Chrome 80+) → 使用 `obj && obj.prop`
- `??` (Chrome 80+) → 使用 `||`
- `??=`, `||=`, `&&=` (Chrome 85) → 完整条件判断
- `replaceAll()` (Chrome 85) → `str.split(old).join(new)` 或正则 `/old/g`
- `Promise.any()` (Chrome 85) → `Promise.race()` + 自定义逻辑
- `Array.at()` (Chrome 92) → `arr[arr.length - n]`
- `Object.hasOwn()` (Chrome 93) → `Object.prototype.hasOwnProperty.call(obj, prop)`
- `globalThis` → 使用 `window` 或 `self`
- `navigator.clipboard.writeText()` → 使用 `document.execCommand('copy')`

CSS 不兼容特性及替代：

- `gap` (flexbox, Chrome 84) → `margin` + 相邻选择器 `> * + *`
- `aspect-ratio` (Chrome 88) → `padding-bottom` 百分比技巧
- `inset` (Chrome 87) → 拆分为 top/right/bottom/left 四个属性
- `:has()` (Chrome 105) → JavaScript 动态添加类名
- `:is()`, `:where()` (Chrome 88) → 展开选择器列表
- `clamp()`, `min()`, `max()` (Chrome 79) → `calc()` 或媒体查询
- `@layer` (Chrome 99) → 通过选择器优先级和加载顺序控制
- `accent-color` (Chrome 93) → `appearance: none` 或默认颜色
- `content-visibility` (Chrome 85) → 不使用该优化

