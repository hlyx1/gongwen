import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GongwenAST, DocumentNode } from '../../../types/ast'
import { NodeType } from '../../../types/ast'
import { Toolbar } from '../Toolbar'

/**
 * Toolbar 判空与段落统计测试（task-0003 待办-0009，测试先行）
 *
 * 背景：ef2eb62 将 GongwenAST.title 数组化后 Toolbar 漏改——
 * `ast.title !== null` 恒真导致 hasContent 恒真（空文档可导出）、
 * `ast.title ? 1 : 0` 对空数组恒取 1（空文档统计恒显 1 个段落）。
 *
 * 空文档口径与 parser.test.ts:60-70 同源：
 * 经 sanitize＋parse 后 title 与 body 均为空数组。
 *
 * 检验面（renderToStaticMarkup 静态标记，零新增依赖）：
 * - 空文档：无「已识别 N 个段落」文案＋导出按钮带 disabled
 * - 仅标题/仅正文/多段标题：统计文案与按钮恢复设计意图
 * - 多段标题整体算 1 段的既有计数语义保持不变
 */

/** 构造普通 AST 节点（as 收窄：宽松 NodeType 参数 → 判别联合，同 previewStructure 惯例） */
function makeNode(type: NodeType, content: string, lineNumber = 1): DocumentNode {
  return { type, content, lineNumber } as DocumentNode
}

/** 静态渲染 Toolbar 并返回标记 */
function renderToolbar(ast: GongwenAST): string {
  return renderToStaticMarkup(React.createElement(Toolbar, { ast, onExport: () => {} }))
}

describe('Toolbar 判空（待办-0009）', () => {
  it('空文档（title/body 均空数组）不显示段落统计', () => {
    const markup = renderToolbar({ title: [], body: [] })
    expect(markup).not.toContain('已识别')
  })

  it('空文档（title/body 均空数组）导出按钮置灰', () => {
    const markup = renderToolbar({ title: [], body: [] })
    expect(markup).toContain('disabled')
  })

  it('仅标题时显示「已识别 1 个段落」且导出按钮可点', () => {
    const ast: GongwenAST = {
      title: [makeNode(NodeType.DOCUMENT_TITLE, '关于加强安全生产工作的通知')],
      body: [],
    }
    const markup = renderToolbar(ast)
    expect(markup).toContain('已识别 1 个段落')
    expect(markup).not.toContain('disabled')
  })

  it('多段标题整体仍算 1 段（既有计数语义保持）', () => {
    const ast: GongwenAST = {
      title: [
        makeNode(NodeType.DOCUMENT_TITLE, '关于加强安全生产工作的通知', 1),
        makeNode(NodeType.DOCUMENT_TITLE, '（续）', 2),
      ],
      body: [],
    }
    const markup = renderToolbar(ast)
    expect(markup).toContain('已识别 1 个段落')
  })

  it('空标题＋仅正文时不把空标题计入段落数', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.PARAGRAPH, '各部门要高度重视安全生产工作。')],
    }
    const markup = renderToolbar(ast)
    expect(markup).toContain('已识别 1 个段落')
  })

  it('标题＋多段正文按 1＋正文段数计数', () => {
    const ast: GongwenAST = {
      title: [makeNode(NodeType.DOCUMENT_TITLE, '关于加强安全生产工作的通知')],
      body: [
        makeNode(NodeType.HEADING_1, '一、总体要求'),
        makeNode(NodeType.PARAGRAPH, '各部门要高度重视安全生产工作。'),
      ],
    }
    const markup = renderToolbar(ast)
    expect(markup).toContain('已识别 3 个段落')
  })
})
