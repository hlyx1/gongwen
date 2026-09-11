import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 决策层依赖纯净性（task-0001 条款2 验收法）
 *
 * 机械断言（人工「检查 import 列表」步骤的自动化）：
 * - src/layout/ 源文件（不含 __tests__）不得 import docx / react / DOM 相关模块
 * - 不得引用浏览器全局对象（决策层为纯函数模块，裁定 §六）
 */

/** 决策层根目录（本文件位于 src/layout/__tests__/） */
const LAYOUT_DIR = fileURLToPath(new URL('..', import.meta.url))

/** 禁止出现的模块说明符 */
const BANNED_MODULES = [
  'docx',
  'react',
  'react-dom',
  'react/jsx-runtime',
  'jsdom',
  'node:html-parser',
]

/** 禁止出现的浏览器全局访问形式（作为子串匹配） */
const BANNED_GLOBAL_PATTERNS = [
  'document.',
  'window.',
  'navigator.',
  'getElementById',
  'querySelector',
  'createElement',
  'HTMLDivElement',
  'HTMLElement',
  'DOMParser',
]

/** 递归收集决策层源文件（.ts，跳过 __tests__ 目录） */
function listSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__snapshots__') {
        continue
      }
      files.push(...listSourceFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(full)
    }
  }
  return files
}

/** 提取源文件全部 import/export-from 的模块说明符 */
function importedModules(source: string): string[] {
  const modules: string[] = []
  const pattern = /from\s+['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    modules.push(match[1])
  }
  // 动态 import
  const dynamicPattern = /import\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = dynamicPattern.exec(source)) !== null) {
    modules.push(match[1])
  }
  return modules
}

describe('决策层 import 纯净性（条款2 验收法）', () => {
  it('决策层源文件非空（扫描有效）', () => {
    const files = listSourceFiles(LAYOUT_DIR)
    expect(files.length).toBeGreaterThanOrEqual(6)
  })

  it('全部源文件 import 列表不含 docx / react / DOM 模块', () => {
    for (const file of listSourceFiles(LAYOUT_DIR)) {
      const modules = importedModules(readFileSync(file, 'utf-8'))
      for (const moduleName of modules) {
        for (const banned of BANNED_MODULES) {
          expect(
            moduleName === banned || moduleName.startsWith(banned + '/'),
            `${file} 引入了被禁模块 ${moduleName}`
          ).toBe(false)
        }
      }
    }
  })

  it('全部源文件不引用浏览器全局对象', () => {
    for (const file of listSourceFiles(LAYOUT_DIR)) {
      const source = readFileSync(file, 'utf-8')
      for (const pattern of BANNED_GLOBAL_PATTERNS) {
        expect(
          source.includes(pattern),
          `${file} 引用了浏览器全局 ${pattern}`
        ).toBe(false)
      }
    }
  })

  it('决策层模块依赖白名单（仅 types 与同目录内部模块）', () => {
    // 允许的对外依赖：AST 类型、文档配置（含单位换算单源）——均为纯数据/纯函数
    const ALLOWED_EXTERNAL = ['../types/ast', '../types/documentConfig']
    for (const file of listSourceFiles(LAYOUT_DIR)) {
      const modules = importedModules(readFileSync(file, 'utf-8'))
      for (const moduleName of modules) {
        const isRelative = moduleName.startsWith('.')
        const isAllowed =
          isRelative &&
          (moduleName.startsWith('./') || ALLOWED_EXTERNAL.includes(moduleName))
        expect(isAllowed, `${file} 引入了白名单外模块 ${moduleName}`).toBe(true)
      }
    }
  })
})
