用户的浏览器内核停留在chrome78版本的内核，所以在编写代码的时候。
- 你的操作环境是在windows而不是linux。
- 不要使用新的特性比如说ES2020的。
- 不要使用无法识别的新标准CSS，比如gap属性。
- 不要使用emoji表情，旧浏览器不识别
- 不需要考虑移动端，所有页面都只会在电脑上被1920*1080的分辨率浏览。
- 必须用中文回答问题
- 注释也必须使用中文
- 以下是示例
1.  CSS 样式冲突:
    *   在旧版浏览器（如 Chrome 78 内核）中，CSS 规则 `list-style: none;` 未能按预期隐藏 `<summary>` 元素的默认展开/折叠标记（小箭头）。
    *   同时，我们通过 `::before` 伪元素添加的自定义箭头 (`▶`/`▼`) 仍然显示，导致出现了两个箭头。
    还有，gap 10px，不生效，不能使用gap

2.  JavaScript API 不兼容:
    *   `navigator.clipboard.writeText()` 这个现代剪贴板 API 在目标旧版浏览器环境中不可用（返回 `undefined`），导致点击复制按钮时抛出 `TypeError` 并且无法复制内容。我们将其替换为了兼容性更好的 `document.execCommand('copy')` 方法。
3.  JavaScript 特性

可选链操作符 `?.`（Chrome 80+）
用于安全访问嵌套对象属性，替代方案：使用 `obj && obj.prop` 条件判断。

空值合并操作符 `??`（Chrome 80+）
用于提供默认值，仅当左侧为 null 或 undefined 时返回右侧，替代方案：使用 `||` 逻辑或。

逻辑赋值运算符 `??=`, `||=`, `&&=`（Chrome 85+）
结合逻辑运算和赋值的简写语法，替代方案：使用完整的条件判断和赋值语句。

`replaceAll()` 方法（Chrome 85+）
字符串全局替换方法，替代方案：使用 `str.split(oldStr).join(newStr)` 或正则表达式 `/oldStr/g`。

`Promise.any()` 方法（Chrome 85+）
返回第一个成功的 Promise，替代方案：使用 `Promise.race()` 配合自定义逻辑。

`Array.at()` 方法（Chrome 92+）
支持负索引的数组访问方法，替代方案：使用 `arr[arr.length - n]`。

`Object.hasOwn()` 方法（Chrome 93+）
安全的属性检查方法，替代方案：使用 `Object.prototype.hasOwnProperty.call(obj, prop)`。

`globalThis`（Chrome 71+，但建议避免使用）
跨环境全局对象引用，替代方案：使用 `window` 或 `self`。

`BigInt`（Chrome 67+，但需注意兼容性）
大整数类型，Chrome 78 支持但需注意某些场景的兼容性。

4.  CSS 特性

`gap` 属性用于 Flexbox（Chrome 84+）
在 flexbox 布局中设置子元素间距，替代方案：使用 `margin` 配合相邻选择器 `> * + *`。

`aspect-ratio` 属性（Chrome 88+）
设置元素宽高比，替代方案：使用 `padding-bottom` 百分比技巧模拟宽高比。

`inset` 简写属性（Chrome 87+）
`top/right/bottom/left` 的简写，替代方案：拆分为四个独立属性。

`:has()` 选择器（Chrome 105+）
父选择器，根据子元素选择父元素，替代方案：使用 JavaScript 动态添加类名。

`:is()` 和 `:where()` 选择器（Chrome 88+）
选择器列表简化语法，替代方案：展开为完整的选择器列表。

`clamp()` 函数（Chrome 79+）
区间值函数，Chrome 78 不支持，替代方案：使用 `min()` 和 `max()` 组合或媒体查询。

`min()` 和 `max()` 函数（Chrome 79+）
CSS 数学函数，Chrome 78 不支持，替代方案：使用 calc() 或媒体查询。

`@layer` 规则（Chrome 99+）
CSS 层级控制，替代方案：通过选择器优先级和加载顺序控制。

`accent-color` 属性（Chrome 93+）
表单控件强调色，替代方案：使用 `appearance: none` 完全自定义样式，或接受默认颜色。

`contain` 属性（Chrome 52+，但部分值需更高版本）
性能优化属性，建议谨慎使用或避免使用新值。

`content-visibility` 属性（Chrome 85+）
内容渲染优化，替代方案：不使用该优化。

`overscroll-behavior` 属性（Chrome 63+）
滚动链控制，Chrome 78 支持。

`scroll-behavior: smooth`（Chrome 61+）
平滑滚动，Chrome 78 支持。