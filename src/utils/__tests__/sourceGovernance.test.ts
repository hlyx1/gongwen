import { describe, it, expect } from 'vitest'

/**
 * 源码治理锁定测试（task-0001 条款7 / 工作单元-8）
 *
 * 把清理治理的验收口径从「人工 grep」固化为常驻测试网：
 * 1. 调试 console.log 全库清零——唯一豁免 statsPrinter.ts（刻意统计打印，
 *    裁定 §四 保留）；错误路径的 console.error/warn 不在清理范围
 * 2. 死文件 constants/gongwen.ts 无任何源码引用（整文件已删除，
 *    防止复活后被悄悄接回）
 */

// 全量读入 src 下源码文本（排除测试自身），eager 模式直接得到 路径→内容 映射
const sourceModules = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '!/src/**/__tests__/**'],
  { query: '?raw', import: 'default', eager: true }
)

/** 刻意保留统计打印的唯一豁免文件 */
const CONSOLE_LOG_ALLOWLIST = ['/src/utils/statsPrinter.ts']

describe('源码治理锁定（工作单元-8）', () => {
  it('源码中 console.log 仅存在于 statsPrinter（刻意统计打印）', () => {
    const offenders: string[] = []
    for (const [path, content] of Object.entries(sourceModules)) {
      if (content.indexOf('console.log') !== -1 && CONSOLE_LOG_ALLOWLIST.indexOf(path) === -1) {
        offenders.push(path)
      }
    }
    expect(offenders).toEqual([])
  })

  it('已删除的死文件 constants/gongwen.ts 无任何源码引用', () => {
    const referrers: string[] = []
    for (const [path, content] of Object.entries(sourceModules)) {
      if (content.indexOf('constants/gongwen') !== -1) {
        referrers.push(path)
      }
    }
    expect(referrers).toEqual([])
  })
})
