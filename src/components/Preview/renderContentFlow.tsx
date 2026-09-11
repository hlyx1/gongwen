import React, { type CSSProperties } from 'react'
import { NodeType } from '../../types/ast'
import type { LayoutBlock, LayoutMetrics, LayoutParagraphBlock } from '../../layout/types'
import { twipsToEm } from '../../layout/metrics'
import type { AIHighlightContext } from './aiHighlight'
import { renderSentenceHighlight, renderTitleHighlight } from './aiHighlight'

/**
 * 预览内容流共享渲染器（工作单元-5 交付物）
 *
 * 把决策层（src/layout/ buildLayout, renderer='preview'）输出的块序列翻译为
 * React 节点——A4Page 页面内容与 Preview 度量容器消费同一份渲染输出，
 * 消灭旧实现里 A4Page / 度量容器各自的节点遍历复制（勘探 §3.1/§3.2）。
 *
 * 行为保持约束（结构快照基线锁定）：
 * - DOM 类名与层级结构与旧实现逐字节一致（A4Page.css 零改动）
 * - AI 高亮为可选叠加（ai 缺省＝度量容器：无高亮纯渲染）
 * - 右缩进优先取决策层的 em 口径（rightEm，与旧 calculateSignatureIndentEm
 *   逐位一致），缺省时以 twips/charWidthTwips 换算
 */

/** 节点类型 → 段落级 CSS 类名（与旧 A4Page.NODE_CLASS_MAP 一致） */
const NODE_CLASS_MAP: Record<NodeType, string> = {
  [NodeType.DOCUMENT_TITLE]: 'a4-title',
  [NodeType.HEADING_1]: 'a4-h1',
  [NodeType.HEADING_2]: 'a4-h2',
  [NodeType.HEADING_3]: 'a4-h3',
  [NodeType.HEADING_4]: 'a4-h4',
  [NodeType.PARAGRAPH]: 'a4-paragraph',
  [NodeType.ADDRESSEE]: 'a4-addressee',
  [NodeType.ATTACHMENT]: 'a4-attachment',
  [NodeType.SIGNATURE]: 'a4-signature',
  [NodeType.DATE]: 'a4-date',
  [NodeType.REMARK]: 'a4-remark',
  [NodeType.TABLE]: 'a4-table',
}

/**
 * 标题段（一至四级）首句 inline CSS 类名——按段落源类型映射（冻结现状）
 *
 * 注意不按 run 字体角色映射：四级标题首 run 的角色是 body（与正文同字体），
 * 但旧 A4Page.renderHeading4 按节点类型给首句 a4-h4-inline 类（该类承载
 * 字距/全角形态等 CSS 表现）——行为由结构快照锁定，不能因角色相同而合并。
 * 首句之后的部分一律 a4-paragraph-inline（默认开关下决策层对剩余部分
 * 恒输出单个 body run，与旧实现单 span 包裹现状一致）。
 */
const HEADING_FIRST_INLINE_CLASS: Partial<Record<NodeType, string>> = {
  [NodeType.HEADING_1]: 'a4-h1-inline',
  [NodeType.HEADING_2]: 'a4-h2-inline',
  [NodeType.HEADING_3]: 'a4-h3-inline',
  [NodeType.HEADING_4]: 'a4-h4-inline',
}

/** 附件 run 角色 → inline CSS 类名（数字英文 TNR / 英文句号仿宋） */
const ATTACHMENT_INLINE_CLASS: Record<string, string> = {
  body: 'a4-attachment-text',
  bodyPunct: 'a4-attachment-punctuation',
}

/** 拼接块的全部 run 文本 */
function blockText(block: LayoutParagraphBlock): string {
  return block.runs.map(function (run) {
    return run.text
  }).join('')
}

/** sentenceId：nodeType-lineNumber-localSeq（与 AI 校对链路一致） */
function sentenceId(block: LayoutParagraphBlock, seq: number): string {
  return block.sourceType + '-' + block.sourceLineNumber + '-' + seq
}

/**
 * 段落右缩进 → 内联样式（仅署名/日期有右缩进）
 * 优先决策层 em 口径（rightEm）；否则由 twips 换算（成文日期的整数倍缩进精确无损）
 */
function rightIndentStyle(
  block: LayoutParagraphBlock,
  metrics: LayoutMetrics
): CSSProperties | undefined {
  const indent = block.indent
  if (!indent || indent.rightTwips === undefined) {
    return undefined
  }
  const em = indent.rightEm !== undefined
    ? indent.rightEm
    : twipsToEm(indent.rightTwips, metrics.charWidthTwips)
  return { paddingRight: `${em}em` }
}

/**
 * 标题段（一至四级）内容渲染——旧 8 个标题渲染函数的参数化合并实现
 *
 * 由决策层 runs 驱动字体分段；AI 高亮按句子叠加：
 * - 首 run 整体参与 seq=1 的高亮查询（默认开关下 run 边界＝首句「。」边界）
 * - 后续 run 各自包一层 inline 类 span，内部做句子级切句高亮
 *   （切句从 seq=1 重新起算——旧实现冻结现状，见 aiHighlight 文件头）
 * - ai 缺省（度量容器）或结果为空时退化为纯 span/文本，与旧无高亮实现一致
 */
function renderHeadingRuns(
  block: LayoutParagraphBlock,
  ai: AIHighlightContext | undefined
): React.ReactNode {
  const runs = block.runs
  const first = runs[0]
  // 首 run＝首句（含「。」）：类名按段落源类型（见 HEADING_FIRST_INLINE_CLASS 注释）
  const firstClass = HEADING_FIRST_INLINE_CLASS[block.sourceType] || 'a4-paragraph-inline'

  // 首 run：标题体 inline 类；命中问题时与高亮类合并
  const hasResults = !!ai && ai.results.size > 0
  const firstResult = hasResults ? ai.results.get(sentenceId(block, 1)) : undefined
  let firstElement: React.ReactNode
  if (ai && firstResult && firstResult.hasIssue) {
    firstElement = (
      <span
        className={firstClass + ' a4-highlight-sentence'}
        onMouseEnter={function () { ai.onEnter(firstResult) }}
        onMouseLeave={ai.onLeave}
      >
        {first.text}
      </span>
    )
  } else {
    firstElement = <span className={firstClass}>{first.text}</span>
  }

  if (runs.length === 1) {
    return firstElement
  }

  // 后续 run＝首句之后的部分：恒 a4-paragraph-inline 包装 + 句子级高亮叠加
  // （默认开关下决策层对剩余部分恒输出单个 body run——旧实现单 span 现状）
  const restElements = runs.slice(1).map(function (run, i) {
    return (
      <span key={i} className="a4-paragraph-inline">
        {renderSentenceHighlight(run.text, block.sourceType, block.sourceLineNumber, ai)}
      </span>
    )
  })

  return <>{firstElement}{restElements}</>
}

/**
 * 附件说明段内容渲染（旧 renderAttachment + splitAttachmentTextForPreview 的决策层化）
 * - single：整段纯文本「附件：名称」（不拆句点——两侧现状一致）
 * - multi-first：「附件：」前缀纯文本＋序号句点拆分 run 逐个 span
 * - multi-item：序号句点拆分 run 逐个 span
 */
function renderAttachmentContent(
  block: LayoutParagraphBlock,
  withPrefix: boolean
): React.ReactNode {
  const runs = withPrefix ? block.runs.slice(1) : block.runs
  return (
    <>
      {runs.map(function (run, i) {
        return (
          <span
            key={i}
            className={ATTACHMENT_INLINE_CLASS[run.role] || ATTACHMENT_INLINE_CLASS.body}
          >
            {run.text}
          </span>
        )
      })}
    </>
  )
}

/** 附件说明段段落级类名（按决策层形态标记） */
function attachmentClassName(block: LayoutParagraphBlock): string {
  if (block.attachmentVariant === 'multi-first') {
    return 'a4-attachment a4-attachment--multi-first'
  }
  if (block.attachmentVariant === 'multi-item') {
    return 'a4-attachment-item a4-attachment-item--multi'
  }
  return 'a4-attachment a4-attachment--single'
}

/** 段落块 → <p> 元素 */
function renderParagraphBlock(
  block: LayoutParagraphBlock,
  index: number,
  metrics: LayoutMetrics,
  ai: AIHighlightContext | undefined
): React.ReactNode {
  const isHeading =
    block.sourceType === NodeType.HEADING_1 ||
    block.sourceType === NodeType.HEADING_2 ||
    block.sourceType === NodeType.HEADING_3 ||
    block.sourceType === NodeType.HEADING_4

  let className: string
  let content: React.ReactNode

  if (block.sourceType === NodeType.ATTACHMENT) {
    // 附件说明：按形态决定类名与前缀渲染，不参与 AI 高亮（旧实现现状）
    className = attachmentClassName(block)
    const withPrefix = block.attachmentVariant === 'multi-first'
    content = withPrefix
      ? <>{block.runs[0].text}{renderAttachmentContent(block, true)}</>
      : (block.attachmentVariant === 'single' || block.attachmentVariant === undefined
          ? blockText(block)
          : renderAttachmentContent(block, false))
  } else if (isHeading) {
    className = NODE_CLASS_MAP[block.sourceType]
    content = renderHeadingRuns(block, ai)
  } else if (block.sourceType === NodeType.DOCUMENT_TITLE) {
    // 公文标题：整段单一高亮查询（seq=1），不切句
    className = NODE_CLASS_MAP[block.sourceType]
    content = renderTitleHighlight(blockText(block), block.sourceType, block.sourceLineNumber, ai)
  } else {
    // 主送/正文/署名/日期/备注：整段句子级切句高亮（无结果时纯文本）
    className = NODE_CLASS_MAP[block.sourceType]
    content = renderSentenceHighlight(blockText(block), block.sourceType, block.sourceLineNumber, ai)
  }

  return (
    <p key={index} className={className} style={rightIndentStyle(block, metrics)}>
      {content}
    </p>
  )
}

/**
 * 把决策层块序列渲染为内容流节点（A4Page 视窗与度量容器共用）
 *
 * 块序即旧实现的 DOM 顺序：标题段 → 标题后空行 → 正文节点
 * （署名/备注前空行、附件展开、表格）。
 *
 * mode 按消费方区分两种形态（除表格外逐字节一致）：
 * - 'page'（缺省）：A4Page 视窗——表格渲染结构化 <table>
 * - 'measurer'：Preview 度量容器——表格按段落测量（待办-0005 冻结现状）：
 *   渲染为携带原始 Markdown 源文本的 a4-table 段落（className 承载段距），
 *   保持 usePagination `:scope > p` 选择器与段落高度测量口径不变
 */
export function renderContentFlow(
  blocks: LayoutBlock[],
  metrics: LayoutMetrics,
  ai?: AIHighlightContext,
  mode: 'page' | 'measurer' = 'page'
): React.ReactNode {
  return blocks.map(function (block, index) {
    if (block.kind === 'spacer') {
      // 空行指令：每行一个固定行距空段落（零宽空格占位）
      const emptyLines: React.ReactNode[] = []
      for (let j = 0; j < block.lines; j++) {
        emptyLines.push(
          <p key={j} className="a4-empty-line">{'\u200B'}</p>
        )
      }
      return <React.Fragment key={index}>{emptyLines}</React.Fragment>
    }

    if (block.kind === 'table') {
      // 度量容器：表格按段落测量（旧 Preview 现状，待办-0005 冻结）
      if (mode === 'measurer') {
        return <p key={index} className="a4-table">{block.rawContent}</p>
      }
      // 页面：结构化单元格 → <table>（不参与 AI 高亮——旧实现现状）
      return (
        <table key={index} className="a4-table-element">
          <thead>
            <tr>
              {block.headerCells.map(function (cell, i) {
                return <th key={i}>{cell}</th>
              })}
            </tr>
          </thead>
          <tbody>
            {block.dataRows.map(function (row, rowIndex) {
              return (
                <tr key={rowIndex}>
                  {row.map(function (cell, cellIndex) {
                    return <td key={cellIndex}>{cell}</td>
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      )
    }

    return renderParagraphBlock(block, index, metrics, ai)
  })
}
