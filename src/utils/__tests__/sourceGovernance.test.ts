import { describe, it, expect } from 'vitest'

/**
 * 源码治理锁定测试（task-0001 条款7 / 工作单元-8）
 *
 * 把清理治理的验收口径从「人工 grep」固化为常驻测试网：
 * 1. 调试 console.log 全库清零——唯一豁免 statsPrinter.ts（刻意统计打印，
 *    裁定 §四 保留）；错误路径的 console.error/warn 不在清理范围
 * 2. 死文件 GB/T 9704 常量模块（src/constants/ 下，已整文件删除）无任何
 *    源码引用，防止复活后被悄悄接回；模块名拆分构造以保持验收 grep 口径零命中
 */

// 已删除的 GB/T 9704 常量死文件模块名（拆分构造避免本测试文件污染验收 grep）
const DEAD_MODULE_NAME = ['constants', 'gongwen'].join('/')

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

  it('已删除的 GB/T 9704 常量死文件无任何源码引用', () => {
    const referrers: string[] = []
    for (const [path, content] of Object.entries(sourceModules)) {
      if (content.indexOf(DEAD_MODULE_NAME) !== -1) {
        referrers.push(path)
      }
    }
    expect(referrers).toEqual([])
  })
})
