import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * DetectionPanel 颜色治理锁定测试（task-0008 条款5 / 工作单元-2）
 *
 * 把「组件颜色一律走 index.css CSS 变量」的验收口径从人工 grep 固化为常驻测试网：
 * 1. DetectionPanel.tsx / DetectionPanel.css 零十六进制色值字面量
 *    （#rgb / #rgba / #rrggbb / #rrggbbaa，正则 #[0-9a-fA-F]{3,8}）
 * 2. rgba 色值字面量同禁——唯一豁免：.ai-issue-item:hover 的 box-shadow 阴影
 *    合成值 rgba(0, 0, 0, 0.05)。理由：属阴影族非颜色族，task-0008 详细需求
 *    「明确不做」钉死不动（改值即违视觉零变化红线）
 *
 * 先例口径：utils/__tests__/sourceGovernance.test.ts（源码文本治理断言＋豁免名单）
 */

// node 环境 fs 直读组件源码（css 不走模块图，故不用 import.meta.glob raw）
const tsxSource = readFileSync(new URL('../DetectionPanel.tsx', import.meta.url), 'utf-8')
const cssSource = readFileSync(new URL('../DetectionPanel.css', import.meta.url), 'utf-8')

/** 十六进制色值字面量（3~8 位 hex，覆盖 #abc/#abcd/#aabbcc/#aabbccdd） */
const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/

/** rgba 豁免清单（整行精确匹配）——仅 hover 阴影合成值，见文件头注释 */
const RGBA_ALLOWLIST = ['box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);']

/** 提取含十六进制色值字面量的行（带行号，红灯时直接定位） */
function findHexColorLines(source: string): string[] {
  const hits: string[] = []
  source.split('\n').forEach(function (line, index) {
    if (HEX_COLOR_RE.test(line)) {
      hits.push(index + 1 + ': ' + line.trim())
    }
  })
  return hits
}

/** 提取含 rgba( 的行（整行不在豁免清单即违规，带行号） */
function findRgbaLines(source: string): string[] {
  const hits: string[] = []
  source.split('\n').forEach(function (line, index) {
    if (line.indexOf('rgba(') !== -1 && RGBA_ALLOWLIST.indexOf(line.trim()) === -1) {
      hits.push(index + 1 + ': ' + line.trim())
    }
  })
  return hits
}

describe('DetectionPanel 颜色治理锁定（task-0008）', () => {
  it('DetectionPanel 组件源码无硬编码颜色字面量', () => {
    const offenders = findHexColorLines(tsxSource)
      .concat(findHexColorLines(cssSource))
      .concat(findRgbaLines(tsxSource))
      .concat(findRgbaLines(cssSource))
    expect(offenders).toEqual([])
  })
})
