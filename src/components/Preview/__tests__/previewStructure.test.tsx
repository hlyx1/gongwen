import { describe, it, expect, vi } from 'vitest'
import React from 'react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_CONFIG } from '../../../types/documentConfig'
import type { DocumentConfig, HeaderConfig, FooterNoteConfig } from '../../../types/documentConfig'
import { NodeType } from '../../../types/ast'
import type { GongwenAST, DocumentNode, AttachmentNode, TableNode, TableRowData } from '../../../types/ast'
import type { AIProofreadResult } from '../../../types/aiProofread'
import { A4Page } from '../A4Page'

/**
 * 预览侧结构特征快照（工作单元-5 交付物；裁定 §二）
 *
 * 用 react-dom/server 的 renderToStaticMarkup（既有依赖，零新增）对
 * A4Page 与 Preview 度量容器做 className＋文本结构快照：
 * - 本文件在单元5 动刀前建立基线，重构全程快照零变化——预览侧
 *   行为保持的机械证据（A4Page.css 零改动、DOM 类名与层级不变）。
 * - Preview 依赖 context 与 DOM 度量 hook，测试中以 vi.mock 固定
 *   useDocumentConfig（DEFAULT_CONFIG 打补丁）与 usePagination（固定分页片），
 *   快照覆盖度量容器（a4-measurer）与分页后的 A4Page 全量 DOM。
 * - 事件处理器（onMouseEnter/onMouseLeave）不出现在静态标记中，
 *   AI 高亮的锁定面为 span 结构与 className（a4-highlight-sentence）。
 * - 快照中的署名右缩进（如 4.414999999999999em）是预览侧 em 口径的
 *   浮点现状特征，用于锁定决策层供给的换算口径逐位一致（待办-0018 族）。
 */

// ---- Preview 依赖 mock（vi.mock 提升到文件顶部执行，配置经 vi.hoisted 传递） ----

const previewState = vi.hoisted(() => ({
  config: null as DocumentConfig | null,
}))

vi.mock('../../../contexts/DocumentConfigContext', () => ({
  useDocumentConfig: () => ({ config: previewState.config }),
}))

vi.mock('../../../hooks/usePagination', () => ({
  usePagination: () => [
    { offsetY: 0, clipHeight: 300 },
    { offsetY: 300, clipHeight: 420 },
  ],
}))

import { Preview } from '../Preview'

// ---- 测试辅助 ----

/** 构造普通 AST 节点 */
function makeNode(type: NodeType, content: string, lineNumber = 1): DocumentNode {
  return { type, content, lineNumber }
}

/** 构造附件说明节点 */
function makeAttachment(
  items: Array<{ index: number; name: string }>,
  isMultiple: boolean,
  lineNumber = 1
): AttachmentNode {
  return { type: NodeType.ATTACHMENT, content: '附件：', lineNumber, isMultiple, items }
}

/** 构造表格节点 */
function makeTable(headerCells: string[], dataRows: string[][], lineNumber = 1): TableNode {
  const toRow = (cells: string[]): TableRowData => ({
    cells: cells.map((content) => ({ content })),
  })
  return {
    type: NodeType.TABLE,
    content: '',
    lineNumber,
    header: toRow(headerCells),
    rows: dataRows.map(toRow),
    columnCount: headerCells.length,
  }
}

/** 深拷贝默认配置后打补丁 */
function configWith(patch: (c: DocumentConfig) => void): DocumentConfig {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DocumentConfig
  patch(cloned)
  return cloned
}

/** 版头默认关闭 */
const HEADER_OFF: HeaderConfig = { enabled: false, orgName: '', docNumber: '', signer: '' }

/** 版记默认关闭 */
const FOOTER_OFF: FooterNoteConfig = { enabled: false, cc: '', printer: '', printDate: '' }

/**
 * 全节点类型样例公文（覆盖：多段标题、主送、正文多句、一至四级标题、
 * 时间冒号、表格、单附件、多附件（名称含英文句点）、署名＋日期＋备注）
 */
const FULL_AST: GongwenAST = {
  title: [
    makeNode(NodeType.DOCUMENT_TITLE, '某某市人民政府办公室', 1),
    makeNode(NodeType.DOCUMENT_TITLE, '关于印发《公文排版管理办法》的通知', 2),
  ],
  body: [
    makeNode(NodeType.ADDRESSEE, '各县（市、区）人民政府，市政府各部门：', 4),
    makeNode(NodeType.PARAGRAPH, '为规范公文排版工作。提高公文处理质量。', 5),
    makeNode(NodeType.HEADING_1, '一、总体要求。坚持以体式规范为基准。', 6),
    makeNode(NodeType.HEADING_2, '（一）指导思想。', 8),
    makeNode(NodeType.HEADING_3, '1.加强组织领导。要压实各方责任。', 10),
    makeNode(NodeType.HEADING_4, '（1）制定实施方案。', 12),
    makeNode(NodeType.PARAGRAPH, '会议时间为9:00至11:30，请提前入场。', 13),
    makeTable(['序号', '事项'], [['1', '制定方案'], ['2', '组织培训']], 14),
    makeAttachment([{ index: 1, name: '公文排版管理办法' }], false, 15),
    makeAttachment(
      [
        { index: 1, name: '公文格式自查清单' },
        { index: 2, name: '责任分工表.xlsx' },
      ],
      true,
      16
    ),
    makeNode(NodeType.SIGNATURE, 'X市发改', 17),
    makeNode(NodeType.DATE, '2026年12月31日', 18),
    makeNode(NodeType.REMARK, '（联系人：张三，电话0001-1234567）', 19),
  ],
}

/** 空公文 */
const EMPTY_AST: GongwenAST = { title: [], body: [] }

/** AI 校对结果样例：标题命中、正文首句命中、正文次句有结果无问题、一级标题首句命中 */
function makeAiResults(): Map<string, AIProofreadResult> {
  const results: Array<[string, string, string, boolean]> = [
    ['DOCUMENT_TITLE-1-1', '某某市人民政府办公室', '某某市人民政府办公室（建议）', true],
    ['PARAGRAPH-5-1', '为规范公文排版工作。', '为规范公文排版工作！', true],
    ['PARAGRAPH-5-2', '提高公文处理质量。', '提高公文处理的质量。', false],
    ['HEADING_1-6-1', '一、总体要求。', '一、总体要求：', true],
  ]
  const map = new Map<string, AIProofreadResult>()
  results.forEach(function (entry, i) {
    map.set(entry[0], {
      sentenceId: entry[0],
      seqNum: i + 1,
      originalText: entry[1],
      suggestion: entry[2],
      hasIssue: entry[3],
    })
  })
  return map
}

/** 渲染 A4Page 为静态标记 */
function renderA4Page(props: Partial<Parameters<typeof A4Page>[0]>): string {
  return renderToStaticMarkup(
    <A4Page
      title={FULL_AST.title}
      body={FULL_AST.body}
      pageNumber={1}
      totalPages={1}
      offsetY={0}
      clipHeight={800}
      showPageNumber
      headerConfig={HEADER_OFF}
      footerNoteConfig={FOOTER_OFF}
      isFirstPage
      isLastPage
      hasStamp={false}
      {...props}
    />
  )
}

// ---- A4Page 结构快照（基线＝动刀前现状） ----

describe('A4Page 结构特征快照（className＋文本结构）', () => {
  it('全节点样例·首页·无 AI·无版头版记·页码开（奇数页）', () => {
    expect(renderA4Page({})).toMatchSnapshot()
  })

  it('全节点样例·第 2 页（偶数页码类）', () => {
    expect(
      renderA4Page({ pageNumber: 2, isFirstPage: false, isLastPage: false, offsetY: 300, clipHeight: 420 })
    ).toMatchSnapshot()
  })

  it('版头开·含签发人', () => {
    expect(
      renderA4Page({
        headerConfig: { enabled: true, orgName: '某某市人民政府文件', docNumber: '某政发〔2026〕1号', signer: '张三' },
      })
    ).toMatchSnapshot()
  })

  it('版头开·无签发人', () => {
    expect(
      renderA4Page({
        headerConfig: { enabled: true, orgName: '某某市人民政府文件', docNumber: '某政发〔2026〕1号', signer: '' },
      })
    ).toMatchSnapshot()
  })

  it('版记开·抄送＋印发（末页）', () => {
    expect(
      renderA4Page({
        footerNoteConfig: { enabled: true, cc: '市委各部门，市人大常委会办公室', printer: '某某市人民政府办公室', printDate: '2026年9月11日' },
      })
    ).toMatchSnapshot()
  })

  it('版记开·仅印发无抄送', () => {
    expect(
      renderA4Page({
        footerNoteConfig: { enabled: true, cc: '', printer: '某某市人民政府办公室', printDate: '2026年9月11日' },
      })
    ).toMatchSnapshot()
  })

  it('页码关闭', () => {
    expect(renderA4Page({ showPageNumber: false })).toMatchSnapshot()
  })

  it('AI 校对结果：标题/正文句子/一级标题首句高亮', () => {
    expect(renderA4Page({ aiProofreadResults: makeAiResults() })).toMatchSnapshot()
  })

  it('AI 校对结果为空 Map：退化为无高亮', () => {
    expect(renderA4Page({ aiProofreadResults: new Map() })).toMatchSnapshot()
  })

  it('加盖印章：日期右空四字、署名基准四字', () => {
    expect(renderA4Page({ hasStamp: true })).toMatchSnapshot()
  })

  it('空文档：占位段落', () => {
    expect(renderA4Page({ title: [], body: [] })).toMatchSnapshot()
  })
})

// ---- Preview（mock 分页）结构快照：度量容器＋分页页面 ----

describe('Preview 结构特征快照（度量容器同源化基线）', () => {
  it('全节点样例·版记开·度量容器＋双页', () => {
    previewState.config = configWith(function (c) {
      c.footerNote.enabled = true
      c.footerNote.cc = '市委各部门'
      c.footerNote.printer = '某某市人民政府办公室'
      c.footerNote.printDate = '2026年9月11日'
    })
    expect(renderToStaticMarkup(React.createElement(Preview, { ast: FULL_AST }))).toMatchSnapshot()
  })

  it('空文档·版记关', () => {
    previewState.config = configWith(function () {
      /* 保持默认 */
    })
    expect(renderToStaticMarkup(React.createElement(Preview, { ast: EMPTY_AST }))).toMatchSnapshot()
  })

  it('加盖印章·含 AI 高亮：度量容器无高亮、页面有高亮', () => {
    previewState.config = configWith(function (c) {
      c.specialOptions.hasStamp = true
    })
    expect(
      renderToStaticMarkup(
        React.createElement(Preview, { ast: FULL_AST, aiProofreadResults: makeAiResults() })
      )
    ).toMatchSnapshot()
  })
})
