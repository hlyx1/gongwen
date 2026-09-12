import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_CONFIG } from '../../../types/documentConfig'
import { NodeType } from '../../../types/ast'
import type { GongwenAST, DocumentNode } from '../../../types/ast'
import type { AIProofreadResult } from '../../../types/aiProofread'
import { buildLayout } from '../../../layout'
import type { LayoutParagraphBlock } from '../../../layout/types'
import { splitNodeIntoSentences } from '../../../utils/sentenceSplitter'
import { sentencesForBlock } from '../renderContentFlow'
import { A4Page } from '../A4Page'

/**
 * AI 高亮罩句行为测试（task-0007 工作单元-2 交付物）
 *
 * 锁定「高亮侧切句复用送审切句（sentenceSplitter）」的用户可感行为面：
 * - 正文族（PARAGRAPH/ADDRESSEE）句子边界与送审逐句一致
 *   （差异样例集见对照测试——双字省略号不碎片、配对符号内句号不切高亮等）
 * - 标题体（一至四级）：首句边界含 ？！；……，剩余句序号自 2 起连续
 *   （消灭旧「剩余自 1 重起算」的 id 碰撞与 k/k+1 错位）
 * - 整节点族（SIGNATURE/DATE/REMARK）：整段单句 seq=1，命中罩全段
 * - 多段标题：统一查送审合并句 id（DOCUMENT_TITLE-<首行>-1）
 *
 * 断言用 renderToStaticMarkup 的静态标记（事件处理器不出现——
 * 与 previewStructure.test.tsx 同口径）；CSS 表现不在此测试面。
 */

// ---- 测试辅助 ----

/** 构造普通 AST 节点（as 收窄：宽松 NodeType 参数 → 判别联合，待办-0029） */
function makeNode(type: NodeType, content: string, lineNumber = 1): DocumentNode {
  return { type, content, lineNumber } as DocumentNode
}

/** 构造单段落 AST → 经决策层取段落块（高亮侧消费的真实块形态） */
function paragraphBlockOf(type: NodeType, content: string, lineNumber = 1): LayoutParagraphBlock {
  const ast: GongwenAST = { title: [], body: [makeNode(type, content, lineNumber)] }
  const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'preview' })
  const paragraph = layout.blocks.find(function (b) {
    return b.kind === 'paragraph' && b.sourceType === type
  })
  return paragraph as LayoutParagraphBlock
}

/** 构造单条命中（hasIssue=true）的校对结果 */
function hit(id: string, originalText: string): [string, AIProofreadResult] {
  return [id, {
    sentenceId: id,
    seqNum: 1,
    originalText,
    suggestion: originalText + '（建议）',
    hasIssue: true,
  }]
}

/** AST＋结果 Map → A4Page 静态标记（经决策层 renderer='preview' 驱动） */
function renderWithAi(ast: GongwenAST, entries: Array<[string, AIProofreadResult]>): string {
  const layout = buildLayout(ast, DEFAULT_CONFIG, { renderer: 'preview' })
  return renderToStaticMarkup(
    <A4Page
      layout={layout}
      pageNumber={1}
      offsetY={0}
      clipHeight={800}
      isFirstPage
      isLastPage
      aiProofreadResults={new Map(entries)}
    />
  )
}

// ---- 正文族：边界一致化的罩句面 ----

describe('正文族高亮罩句（条款1：与送审切句逐句一致）', () => {
  it('双字省略号：整对「……」随前句高亮，不再拆出碎片句', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.PARAGRAPH, '未尽事宜另行通知……请联系办公室。', 1)],
    }
    const markup = renderWithAi(ast, [hit('PARAGRAPH-1-1', '未尽事宜另行通知……')])
    // 送审切句＝["未尽事宜另行通知……","请联系办公室。"]——首句命中罩整对省略号
    expect(markup).toContain('<span class="a4-highlight-sentence">未尽事宜另行通知……</span>')
    // 旧正则按单字符「…」切分产生的碎片 span 消灭
    expect(markup).not.toContain('<span>…</span>')
  })

  it('书名号内句号：受配对符号保护，整段单句命中罩全段', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.PARAGRAPH, '依据《某某管理办法（试行）。的相关规定》执行。', 1)],
    }
    const markup = renderWithAi(ast, [hit('PARAGRAPH-1-1', '依据《某某管理办法（试行）。的相关规定》执行。')])
    expect(markup).toContain(
      '<span class="a4-highlight-sentence">依据《某某管理办法（试行）。的相关规定》执行。</span>'
    )
  })
})

// ---- 标题体：seq 连续与首句边界同源（条款2） ----

describe('标题体高亮罩句（条款2：seq 连续＋首句边界同源）', () => {
  it('一级标题第二句以 seq=2 命中高亮（剩余序号接续送审 localSeq）', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.HEADING_1, '一、总体要求。坚持以体式规范为基准。', 6)],
    }
    const markup = renderWithAi(ast, [hit('HEADING_1-6-2', '坚持以体式规范为基准。')])
    // 剩余句查询 HEADING_1-6-2 命中（旧实现查询 seq=1 → 罩不住）
    expect(markup).toContain(
      '<span class="a4-paragraph-inline"><span class="a4-highlight-sentence">坚持以体式规范为基准。</span></span>'
    )
    // 首句 seq=1 无命中 → 不高亮（旧实现剩余句与首句同 id 双高亮消灭）
    expect(markup).toContain('<span class="a4-h1-inline">一、总体要求。</span>')
  })

  it('标题含「？」：首句边界止于「？」，不再罩全段', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.HEADING_1, '一、完成任务？后续。', 6)],
    }
    const markup = renderWithAi(ast, [hit('HEADING_1-6-1', '一、完成任务？')])
    // 首句高亮止于「？」——？！；……同入首句边界（送审切句同源）
    expect(markup).toContain('<span class="a4-h1-inline a4-highlight-sentence">一、完成任务？</span>')
    // 「？」后内容不再被 seq=1 罩住（旧实现首句聚合只认「。」→罩全段）
    expect(markup).not.toContain('一、完成任务？后续。</span>')
    // 剩余部分以 seq=2 句渲染（无命中 → 纯 span）
    expect(markup).toContain('<span class="a4-paragraph-inline"><span>后续。</span></span>')
  })
})

// ---- 整节点族：整段单句命中罩全段（条款3） ----

describe('整节点族高亮罩句（条款3：SIGNATURE/DATE/REMARK 整节点 seq=1）', () => {
  it('备注含分号：整段以 REMARK-<line>-1 单句命中、高亮罩全段', () => {
    const ast: GongwenAST = {
      title: [],
      body: [makeNode(NodeType.REMARK, '（联系人：张三；电话0001-1234567）', 19)],
    }
    const markup = renderWithAi(ast, [hit('REMARK-19-1', '（联系人：张三；电话0001-1234567）')])
    // 送审整节点 seq=1——含「；」也不再切句分配 seq（旧实现只罩「；」前半）
    expect(markup).toContain(
      '<span class="a4-highlight-sentence">（联系人：张三；电话0001-1234567）</span>'
    )
    expect(markup).not.toContain(
      '<span class="a4-highlight-sentence">（联系人：张三；</span>'
    )
  })
})

// ---- 多段标题：统一查送审合并句 id（条款4） ----

describe('公文标题高亮罩句（条款4：多段标题合并句 id）', () => {
  it('两行标题：第二行标题块以 DOCUMENT_TITLE-1-1 命中并获得 a4-highlight-sentence', () => {
    const ast: GongwenAST = {
      title: [
        makeNode(NodeType.DOCUMENT_TITLE, '某某市人民政府办公室', 1),
        makeNode(NodeType.DOCUMENT_TITLE, '关于印发《公文排版管理办法》的通知', 2),
      ],
      body: [],
    }
    const markup = renderWithAi(ast, [hit('DOCUMENT_TITLE-1-1', '某某市人民政府办公室关于印发《公文排版管理办法》的通知')])
    // 两行均查送审合并句 id（首行行号）——旧实现第二行查自身行号 → miss
    expect(markup).toContain('<span class="a4-highlight-sentence">某某市人民政府办公室</span>')
    expect(markup).toContain(
      '<span class="a4-highlight-sentence">关于印发《公文排版管理办法》的通知</span>'
    )
  })

  it('单段标题：行为不变（仍以自身行号 seq=1 命中）', () => {
    const ast: GongwenAST = {
      title: [makeNode(NodeType.DOCUMENT_TITLE, '某某市人民政府办公室', 3)],
      body: [],
    }
    const markup = renderWithAi(ast, [hit('DOCUMENT_TITLE-3-1', '某某市人民政府办公室')])
    expect(markup).toContain('<span class="a4-highlight-sentence">某某市人民政府办公室</span>')
  })
})

// ---- 对照测试：高亮侧切句与 splitNodeIntoSentences 逐句一致（条款1） ----

describe('高亮侧切句对照（条款1：与送审切句逐句一致）', () => {
  /** 差异样例集（勘探 §二差异清单 1~10 号边界）：[名, 样例文本, 送审期望句文本] */
  const SAMPLES: Array<[string, string, string[]]> = [
    ['双字省略号中置', '未尽事宜另行通知……请联系办公室。', ['未尽事宜另行通知……', '请联系办公室。']],
    ['双字省略号接句号', '如下……。', ['如下……', '。']],
    ['单字省略号中置', '未尽事宜另行通知…请联系办公室。', ['未尽事宜另行通知…请联系办公室。']],
    ['书名号内句号', '依据《某某管理办法（试行）。的相关规定》执行。', ['依据《某某管理办法（试行）。的相关规定》执行。']],
    ['括号内句号首现受保护（首现即弃现状照单继承）', '先行。后续（含子项。共三项）。再后。', ['先行。', '后续（含子项。共三项）。再后。']],
    ['未闭合括号', '联系电话（见附件。详见附录。', ['联系电话（见附件。详见附录。']],
    ['引号内句号', '他说「先行。再行」后离开。', ['他说「先行。再行」后离开。']],
    ['连续句号', '如下。。。', ['如下。', '。', '。']],
    ['句间空白', '如下。 请示。', ['如下。', '请示。']],
  ]

  it.each(SAMPLES)('%s：sentencesForBlock 与 splitNodeIntoSentences 逐句一致', (_name, text) => {
    const block = paragraphBlockOf(NodeType.PARAGRAPH, text, 5)
    const submission = splitNodeIntoSentences(
      { type: NodeType.PARAGRAPH, content: text, lineNumber: 5 } as DocumentNode,
      { value: 0 }
    )
    const highlight = sentencesForBlock(block)
    expect(highlight.map(function (s) { return [s.id, s.text] })).toEqual(
      submission.map(function (s) { return [s.id, s.text] })
    )
  })

  it.each(SAMPLES)('%s：高亮侧句子文本锁定送审基线', (_name, text, expected) => {
    const block = paragraphBlockOf(NodeType.PARAGRAPH, text, 5)
    expect(
      sentencesForBlock(block).map(function (s) { return s.text })
    ).toEqual(expected)
  })

  it('主送机关（正文族）：对照一致', () => {
    const text = '各县（市、区）人民政府，市政府各部门：'
    const block = paragraphBlockOf(NodeType.ADDRESSEE, text, 4)
    const submission = splitNodeIntoSentences(
      { type: NodeType.ADDRESSEE, content: text, lineNumber: 4 } as DocumentNode,
      { value: 0 }
    )
    expect(sentencesForBlock(block).map(function (s) { return [s.id, s.text] })).toEqual(
      submission.map(function (s) { return [s.id, s.text] })
    )
  })

  it('标题体：sentencesForBlock 与送审同源（首句边界含 ？！；……）', () => {
    const block = paragraphBlockOf(NodeType.HEADING_1, '一、完成任务？后续。', 6)
    expect(sentencesForBlock(block).map(function (s) { return [s.id, s.text] })).toEqual([
      ['HEADING_1-6-1', '一、完成任务？'],
      ['HEADING_1-6-2', '后续。'],
    ])
  })

  it('整节点族（REMARK/SIGNATURE/DATE）：整段单句 seq=1，镜像送审 NON_SPLITTABLE 门', () => {
    const remark = paragraphBlockOf(NodeType.REMARK, '（联系人：张三；电话0001-1234567）', 19)
    expect(sentencesForBlock(remark).map(function (s) { return [s.id, s.text] })).toEqual([
      ['REMARK-19-1', '（联系人：张三；电话0001-1234567）'],
    ])
    const signature = paragraphBlockOf(NodeType.SIGNATURE, 'X市发改', 17)
    expect(sentencesForBlock(signature).map(function (s) { return [s.id, s.text] })).toEqual([
      ['SIGNATURE-17-1', 'X市发改'],
    ])
    const date = paragraphBlockOf(NodeType.DATE, '2026年12月31日', 18)
    expect(sentencesForBlock(date).map(function (s) { return [s.id, s.text] })).toEqual([
      ['DATE-18-1', '2026年12月31日'],
    ])
  })
})
