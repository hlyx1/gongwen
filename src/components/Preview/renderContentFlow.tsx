import React, { type CSSProperties } from 'react'
import { NodeType } from '../../types/ast'
import type { AIProofreadResult } from '../../types/aiProofread'
import type { LayoutBlock, LayoutMetrics, LayoutParagraphBlock, LayoutRun } from '../../layout/types'
import { twipsToEm } from '../../layout/metrics'
import type { AIHighlightContext } from './aiHighlight'
import { splitHighlightSentences, renderTitleHighlight } from './aiHighlight'

/**
 * 预览内容流共享渲染器（工作单元-5 交付物）
 *
 * 把决策层（src/layout/ buildLayout, renderer='preview'）输出的块序列翻译为
 * React 节点——A4Page 页面内容与 Preview 度量容器消费同一份渲染输出，
 * 消灭旧实现里 A4Page / 度量容器各自的节点遍历复制（勘探 §3.1/§3.2）。
 *
 * 行为保持约束（结构快照基线锁定）：
 * - DOM 类名与层级结构与旧实现逐字节一致（A4Page.css 零改动）——
 *   task-0004 的 0001/0002/0022 为有意行为变更，快照基线随对应提交同步更新，
 *   变更前后差异说明见 tasks/task-0004/工作单元-2.md 实施记录
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
 * 标题段（一至四级）首句首 run 的 inline CSS 类名——按段落源类型映射（冻结现状）
 *
 * 注意不按 run 字体角色映射：四级标题首 run 的角色是 body（与正文同字体），
 * 但旧 A4Page.renderHeading4 按节点类型给首句 a4-h4-inline 类（该类承载
 * 字距/全角形态等 CSS 表现）——行为由结构快照锁定，不能因角色相同而合并。
 * 首句组内后续 run 与首句之后的部分按角色经 ROLE_INLINE_CLASS 映射。
 */
const HEADING_FIRST_INLINE_CLASS: Partial<Record<NodeType, string>> = {
  [NodeType.HEADING_1]: 'a4-h1-inline',
  [NodeType.HEADING_2]: 'a4-h2-inline',
  [NodeType.HEADING_3]: 'a4-h3-inline',
  [NodeType.HEADING_4]: 'a4-h4-inline',
}

/**
 * run 角色 → inline CSS 类名·全角色共用表（task-0004 裁定4）
 *
 * 附件/标题/正文三处渲染消费同一登记——新增角色一处登记、三处同步生效：
 * - content 槽：内容流（标题段 run 级渲染消费）；
 *   bodyPunct＝0001 接线新增语义化类 .a4-body-punctuation（正文字体标点）
 * - attachment 槽：附件说明语境沿用既有类名（值不变——附件路径 DOM 字节保持）
 */
const ROLE_INLINE_CLASS: Record<'content' | 'attachment', Record<string, string>> = {
  content: {
    body: 'a4-paragraph-inline',
    bodyPunct: 'a4-body-punctuation',
    heading3: 'a4-h3-inline',
  },
  attachment: {
    body: 'a4-attachment-text',
    bodyPunct: 'a4-attachment-punctuation',
  },
}

/** 拼接块的全部 run 文本 */
function blockText(block: LayoutParagraphBlock): string {
  return block.runs.map(function (run) {
    return run.text
  }).join('')
}

/** sentenceId：nodeType-lineNumber-localSeq（与 AI 校对链路一致，冻结格式） */
function sentenceId(block: LayoutParagraphBlock, seq: number): string {
  return block.sourceType + '-' + block.sourceLineNumber + '-' + seq
}

/**
 * 段序列（0022 裁定3 案二：仅标点 span 的最小 DOM）
 *
 * 决策层 runs 中相邻同宿主（非 bodyPunct）run 合并为一个文本段纯文本直出，
 * bodyPunct run 独立成标点段包 .a4-body-punctuation span——
 * 无时间冒号的段落段序列退化为单文本段，DOM 与旧实现零变化
 */
interface FlowSegment {
  /** true＝正文字体标点段（时间冒号等，独立 span）；false＝宿主文本段 */
  punct: boolean
  text: string
}

/** runs → 最小 DOM 段序列（相邻同宿主 run 合并） */
function mergeRunsToSegments(runs: LayoutRun[]): FlowSegment[] {
  const segments: FlowSegment[] = []
  runs.forEach(function (run) {
    const punct = run.role === 'bodyPunct'
    const last = segments.length > 0 ? segments[segments.length - 1] : undefined
    if (!punct && last && !last.punct) {
      last.text += run.text
    } else {
      segments.push({ punct, text: run.text })
    }
  })
  return segments
}

/** 句子片段 span：命中＝高亮类＋悬停；未命中＝纯 span（旧 renderSentenceHighlight 口径） */
function renderSentenceSpan(
  piece: string,
  result: AIProofreadResult | undefined,
  ai: AIHighlightContext
): React.ReactNode {
  if (result && result.hasIssue) {
    return (
      <span
        className="a4-highlight-sentence"
        onMouseEnter={function () { ai.onEnter(result) }}
        onMouseLeave={ai.onLeave}
      >
        {piece}
      </span>
    )
  }
  return <span>{piece}</span>
}

/**
 * 段序列 → 句子级高亮 DOM（0022 案二）
 *
 * - 无 AI 结果（ai 缺省＝度量容器或结果为空）：宿主文本段纯文本直出
 *   （hostWrapperClass 给出时按宿主包装类包 span——标题剩余部分现状）、
 *   标点段包标点 span——无时间冒号的段落 DOM 零变化
 * - 有 AI 结果：切句在段序列拼接全文上一次完成（句序号节点内跨 run 连续
 *   ——sentenceId 冻结；裁定3「跨 run 句序号偏移」经「全文切句＋区间映射」实现，
 *   切句正则与 id 格式零改动），每句字符区间映射回段：宿主段出句子 span、
 *   标点段出标点 span（所在句命中时合并高亮类）；切句 trim 丢弃的句间空白
 *   不渲染（旧渲染口径原样保持）
 */
function renderSegmentsWithHighlight(
  segments: FlowSegment[],
  block: LayoutParagraphBlock,
  ai: AIHighlightContext | undefined,
  hostWrapperClass: string | null
): React.ReactNode {
  // 无校对结果：最小 DOM 直出（与旧 renderSentenceHighlight 纯文本退化一致）
  if (!ai || ai.results.size === 0) {
    return (
      <>
        {segments.map(function (seg, i) {
          if (seg.punct) {
            return (
              <span key={i} className={ROLE_INLINE_CLASS.content.bodyPunct}>
                {seg.text}
              </span>
            )
          }
          return hostWrapperClass ? (
            <span key={i} className={hostWrapperClass}>
              {seg.text}
            </span>
          ) : (
            seg.text
          )
        })}
      </>
    )
  }

  const fullText = segments
    .map(function (seg) {
      return seg.text
    })
    .join('')
  const sentences = splitHighlightSentences(fullText)
  // 无句子（纯空白文本）：整段原文直出（旧口径）
  if (sentences.length === 0) {
    return fullText
  }

  // 各句在全文中的字符区间（trim 只丢句缘空白——句子正文在源流中恒连续，
  // 顺序 indexOf 定位；被 trim 丢弃的空白不属任何句、不渲染）
  const sentenceSpans: Array<{ start: number; end: number }> = []
  let searchFrom = 0
  for (const sentence of sentences) {
    const start = fullText.indexOf(sentence, searchFrom)
    const end = start + sentence.length
    sentenceSpans.push({ start, end })
    searchFrom = end
  }

  // 段边界（全文坐标）
  const segStarts: number[] = []
  let segAcc = 0
  for (const seg of segments) {
    segStarts.push(segAcc)
    segAcc += seg.text.length
  }

  // 逐段把句区间裁剪为片段输出（段序＝文档序，句序单调）
  const elements: React.ReactNode[] = []
  let sentenceIdx = 0
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]
    const segFrom = segStarts[si]
    const segTo = segFrom + seg.text.length
    while (sentenceIdx < sentences.length && sentenceSpans[sentenceIdx].end <= segFrom) {
      sentenceIdx++
    }
    for (; sentenceIdx < sentences.length; sentenceIdx++) {
      const span = sentenceSpans[sentenceIdx]
      const from = Math.max(span.start, segFrom)
      const to = Math.min(span.end, segTo)
      if (from >= to) {
        break // 本段与该句无交集（该句在本段之后——下一轮再对位）
      }
      const piece = seg.text.slice(from - segFrom, to - segFrom)
      const result = ai.results.get(sentenceId(block, sentenceIdx + 1))
      if (seg.punct) {
        const punctClass = result && result.hasIssue
          ? ROLE_INLINE_CLASS.content.bodyPunct + ' a4-highlight-sentence'
          : ROLE_INLINE_CLASS.content.bodyPunct
        elements.push(
          <span key={elements.length} className={punctClass}>
            {piece}
          </span>
        )
      } else if (hostWrapperClass) {
        elements.push(
          <span key={elements.length} className={hostWrapperClass}>
            {renderSentenceSpan(piece, result, ai)}
          </span>
        )
      } else {
        // 裸句片段（正文族无宿主类）——Fragment 挂 key 消除数组子项警告，不引入额外 DOM
        elements.push(
          <React.Fragment key={elements.length}>{renderSentenceSpan(piece, result, ai)}</React.Fragment>
        )
      }
      if (span.end >= segTo) {
        break // 该句跨到后续段——换下一段继续
      }
    }
  }
  return <>{elements}</>
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
 * 由决策层 runs 驱动字体分段（0001 翻转后三级标题首句拆为
 * [序号(heading3), '.'(bodyPunct), 内容(heading3)]）；AI 高亮按句子叠加：
 * - 首句聚合：seq=1 的高亮查询域＝首句全文本域（聚合覆盖至第一个「。」含的
 *   全部 runs——0001 翻转后首 run 仅序号数字，不得退化为仅首 run/序号）
 * - 首句组：首 run 类名按段落源类型（HEADING_4 角色＝body 的冻结现状），
 *   组内后续 run 按角色经 ROLE_INLINE_CLASS 映射；seq=1 命中时组内类名
 *   合并高亮类（旧单 run 结构下即旧「类名＋高亮」合并现状）
 * - 剩余 run 恒 a4-paragraph-inline 包装，内部做句子级切句高亮
 *   （切句从 seq=1 重新起算——旧实现冻结现状，见 aiHighlight 文件头）
 * - ai 缺省（度量容器）或结果为空时退化为纯 span/文本，与旧无高亮实现一致
 */
function renderHeadingRuns(
  block: LayoutParagraphBlock,
  ai: AIHighlightContext | undefined
): React.ReactNode {
  const runs = block.runs
  // 首 run 类名按段落源类型（见 HEADING_FIRST_INLINE_CLASS 注释）
  const firstClass = HEADING_FIRST_INLINE_CLASS[block.sourceType] || 'a4-paragraph-inline'

  // 首句聚合：计算覆盖首句（至第一个「。」含；无「。」则整段）的 run 数
  // （决策层现状：标题首「。」恒落在 run 边界上，组按整 run 粒度聚合）
  const fullText = blockText(block)
  const firstStop = fullText.indexOf('。')
  const firstSentenceLength = firstStop === -1 ? fullText.length : firstStop + 1
  let covered = 0
  let groupCount = 0
  while (groupCount < runs.length && covered < firstSentenceLength) {
    covered += runs[groupCount].text.length
    groupCount++
  }

  // seq=1 高亮查询（首句全文本域整体查询——sentenceId 冻结格式）
  const hasResults = !!ai && ai.results.size > 0
  const firstResult = hasResults ? ai.results.get(sentenceId(block, 1)) : undefined
  const firstHighlighted = !!(ai && firstResult && firstResult.hasIssue)

  const firstElements = runs.slice(0, groupCount).map(function (run, i) {
    const base =
      i === 0
        ? firstClass
        : ROLE_INLINE_CLASS.content[run.role] || ROLE_INLINE_CLASS.content.body
    // seq=1 命中时组内每 run 类名合并高亮类＋悬停（旧单 run 结构的合并现状）
    if (firstHighlighted && ai && firstResult) {
      return (
        <span
          key={i}
          className={base + ' a4-highlight-sentence'}
          onMouseEnter={function () { ai.onEnter(firstResult) }}
          onMouseLeave={ai.onLeave}
        >
          {run.text}
        </span>
      )
    }
    return (
      <span key={i} className={base}>
        {run.text}
      </span>
    )
  })

  if (groupCount >= runs.length) {
    return groupCount === 1 ? firstElements[0] : <>{firstElements}</>
  }

  // 剩余部分＝首句之后：恒 a4-paragraph-inline 宿主包装 + 句子级高亮叠加
  // （句序号自 1 重起算——旧实现冻结现状；0022 翻转后剩余部分含时间冒号
  // 时冒号独立为标点 span，句序号在剩余全文上连续）
  const restElements = renderSegmentsWithHighlight(
    mergeRunsToSegments(runs.slice(groupCount)),
    block,
    ai,
    ROLE_INLINE_CLASS.content.body
  )

  return <>{firstElements}{restElements}</>
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
            className={
              ROLE_INLINE_CLASS.attachment[run.role] || ROLE_INLINE_CLASS.attachment.body
            }
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
    // 主送/正文/署名/日期/备注：run 级渲染（0022 案二）——无时间冒号段落
    // DOM 零变化，仅冒号处新增标点 span；句序号节点内连续（sentenceId 冻结）
    className = NODE_CLASS_MAP[block.sourceType]
    content = renderSegmentsWithHighlight(mergeRunsToSegments(block.runs), block, ai, null)
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
