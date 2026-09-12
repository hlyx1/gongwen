import React, { type CSSProperties } from 'react'
import { NodeType } from '../../types/ast'
import type { DocumentNode } from '../../types/ast'
import type { AIProofreadResult, Sentence } from '../../types/aiProofread'
import type { LayoutBlock, LayoutMetrics, LayoutParagraphBlock, LayoutRun } from '../../layout/types'
import { twipsToEm } from '../../layout/metrics'
import { splitNodeIntoSentences, NON_SPLITTABLE_TYPES } from '../../utils/sentenceSplitter'
import type { AIHighlightContext } from './aiHighlight'
import { renderTitleHighlight } from './aiHighlight'

/**
 * 预览内容流共享渲染器（工作单元-5 交付物）
 *
 * 把决策层（src/layout/ buildLayout, renderer='preview'）输出的块序列翻译为
 * React 节点——A4Page 页面内容与 Preview 度量容器消费同一份渲染输出，
 * 消灭旧实现里 A4Page / 度量容器各自的节点遍历复制（勘探 §3.1/§3.2）。
 *
 * 行为保持约束（结构快照基线锁定）：
 * - DOM 类名与层级结构与旧实现逐字节一致（A4Page.css 零改动）——
 *   task-0004 的 0001/0002/0022 与 task-0005 的度量容器表格同构为有意
 *   行为变更，快照基线随对应提交同步更新，变更前后差异说明见
 *   tasks/task-0004 与 tasks/task-0005 的工作单元实施记录
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

/**
 * 块的送审句集合（task-0007 条款1/3：高亮查询键与切句边界的单一真值）
 *
 * 切分族（一至四级标题/主送/正文）经 utils/sentenceSplitter 的
 * splitNodeIntoSentences 取句——sentenceId（type-line-seq，冻结格式）
 * 与句文本两侧逐句一致；整节点族（SIGNATURE/DATE/REMARK）镜像送审
 * NON_SPLITTABLE 门：整段单句 seq=1（REMARK 含「；」等分隔符时
 * 不再切句分配 seq——命中罩全段）。ATTACHMENT/TABLE/DOCUMENT_TITLE
 * 不走本函数（附件/表格无高亮展示；公文标题走 renderTitleHighlight
 * 的送审合并句查询）。
 */
export function sentencesForBlock(block: LayoutParagraphBlock): Sentence[] {
  const fullText = blockText(block)
  if (NON_SPLITTABLE_TYPES[block.sourceType]) {
    // 整节点族：整段 seq=1（镜像 sentenceSplitter 的非切分分支；trim 后为空则无句）
    const trimmed = fullText.trim()
    if (trimmed.length === 0) {
      return []
    }
    return [
      {
        id: block.sourceType + '-' + block.sourceLineNumber + '-1',
        nodeId: block.sourceType + '-' + block.sourceLineNumber,
        seqNum: 1,
        text: trimmed,
        nodeType: block.sourceType,
        lineNumber: block.sourceLineNumber,
      },
    ]
  }
  // 切分族：合成送审切句输入节点（as 收窄惯例同 parser.ts）
  const synthNode = {
    type: block.sourceType,
    content: fullText,
    lineNumber: block.sourceLineNumber,
  } as DocumentNode
  return splitNodeIntoSentences(synthNode, { value: 0 })
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
 * 段序列 → 句子级高亮 DOM（0022 案二；task-0007 切句换轨）
 *
 * - 无 AI 结果（ai 缺省＝度量容器或结果为空）：宿主文本段纯文本直出
 *   （hostWrapperClass 给出时按宿主包装类包 span——标题剩余部分现状）、
 *   标点段出标点 span——无时间冒号的段落 DOM 零变化
 * - 有 AI 结果：句集合由调用方传入（sentencesForBlock 送审同源——
 *   句序号节点内跨 run 连续，sentenceId 冻结格式直接取 Sentence.id），
 *   每句字符区间顺序 indexOf 映射回段：宿主段出句子 span、标点段出
 *   标点 span（所在句命中时合并高亮类）；切句 trim 丢弃的句间空白
 *   不渲染（旧渲染口径原样保持）
 */
function renderSegmentsWithHighlight(
  segments: FlowSegment[],
  ai: AIHighlightContext | undefined,
  hostWrapperClass: string | null,
  sentences: Sentence[]
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
  // 无句子（纯空白文本）：整段原文直出（旧口径）
  if (sentences.length === 0) {
    return fullText
  }

  // 各句在全文中的字符区间（trim 只丢句缘空白——句子正文在源流中恒连续，
  // 顺序 indexOf 定位；被 trim 丢弃的空白不属任何句、不渲染）
  const sentenceSpans: Array<{ start: number; end: number }> = []
  let searchFrom = 0
  for (const sentence of sentences) {
    const start = fullText.indexOf(sentence.text, searchFrom)
    const end = start + sentence.text.length
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
      const result = ai.results.get(sentences[sentenceIdx].id)
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
 * - 首句聚合：seq=1 的高亮查询域＝首句全文本域——边界取送审切句首句
 *   （？！；……同入边界，task-0007 条款2；决策层 run 只按「。」分段，
 *   边界先至时跨界 run 就地拆两段：前段归首句组、后段归剩余）
 * - 首句组：首 run 类名按段落源类型（HEADING_4 角色＝body 的冻结现状），
 *   组内后续 run 按角色经 ROLE_INLINE_CLASS 映射；seq=1 命中时组内类名
 *   合并高亮类（旧单 run 结构下即旧「类名＋高亮」合并现状）
 * - 剩余 run 恒 a4-paragraph-inline 包装，内部做句子级切句高亮
 *   （句序号接续送审 localSeq 自 2 起连续——首句占 seq=1，消灭旧
 *   「剩余自 1 重起算」的 id 碰撞与剩余第 k 句对送审 k+1 的错位）
 * - ai 缺省（度量容器）或结果为空时退化为纯 span/文本，与旧无高亮实现一致
 */
function renderHeadingRuns(
  block: LayoutParagraphBlock,
  ai: AIHighlightContext | undefined
): React.ReactNode {
  const runs = block.runs
  // 首 run 类名按段落源类型（见 HEADING_FIRST_INLINE_CLASS 注释）
  const firstClass = HEADING_FIRST_INLINE_CLASS[block.sourceType] || 'a4-paragraph-inline'

  // 首句边界＝送审切句首句（trim 只削句缘空白——首句在全文中的结束位置）
  const fullText = blockText(block)
  const sentences = sentencesForBlock(block)
  let firstSentenceEnd = fullText.length
  if (sentences.length > 0) {
    const firstStart = fullText.indexOf(sentences[0].text)
    if (firstStart !== -1) {
      firstSentenceEnd = firstStart + sentences[0].text.length
    }
  }

  // run 序列按首句边界分组：跨界 run 就地拆两段（同规格，仅文本一分为二）
  const firstRuns: LayoutRun[] = []
  const restRuns: LayoutRun[] = []
  let covered = 0
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]
    const runEnd = covered + run.text.length
    if (runEnd <= firstSentenceEnd) {
      firstRuns.push(run)
    } else if (covered >= firstSentenceEnd) {
      restRuns.push(run)
    } else {
      const cut = firstSentenceEnd - covered
      firstRuns.push({ ...run, text: run.text.slice(0, cut) })
      restRuns.push({ ...run, text: run.text.slice(cut) })
    }
    covered = runEnd
  }

  // seq=1 高亮查询（首句全文本域整体查询——sentenceId 冻结格式，送审同源）
  const hasResults = !!ai && ai.results.size > 0
  const firstResult =
    hasResults && sentences.length > 0 ? ai.results.get(sentences[0].id) : undefined
  const firstHighlighted = !!(ai && firstResult && firstResult.hasIssue)

  const firstElements = firstRuns.map(function (run, i) {
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

  if (restRuns.length === 0) {
    return firstRuns.length === 1 ? firstElements[0] : <>{firstElements}</>
  }

  // 剩余部分＝首句之后：恒 a4-paragraph-inline 宿主包装 + 句子级高亮叠加
  // （句序号接续送审 localSeq：剩余句＝sentences[1..]，seq 自 2 连续）
  const restElements = renderSegmentsWithHighlight(
    mergeRunsToSegments(restRuns),
    ai,
    ROLE_INLINE_CLASS.content.body,
    sentences.slice(1)
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

/** 段落块 → <p> 元素（titleLineNumber＝公文标题送审合并句行号，条款4） */
function renderParagraphBlock(
  block: LayoutParagraphBlock,
  index: number,
  metrics: LayoutMetrics,
  ai: AIHighlightContext | undefined,
  titleLineNumber: number
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
    // 公文标题：整段单一高亮查询（seq=1）——多段标题统一查送审合并句 id
    // DOCUMENT_TITLE-<首标题块源行号>-1（行号自 blocks 序列推导——task-0007
    // 条款4；单段标题＝自身行号，行为不变）
    className = NODE_CLASS_MAP[block.sourceType]
    const line = titleLineNumber > 0 ? titleLineNumber : block.sourceLineNumber
    content = renderTitleHighlight(blockText(block), block.sourceType, line, ai)
  } else {
    // 主送/正文/署名/日期/备注：run 级渲染（0022 案二）——无时间冒号段落
    // DOM 零变化，仅冒号处新增标点 span；句集合与查询键经送审切句同源
    // （整节点族整段 seq=1——task-0007 条款1/3；sentenceId 冻结格式）
    className = NODE_CLASS_MAP[block.sourceType]
    const sentences = ai && ai.results.size > 0 ? sentencesForBlock(block) : []
    content = renderSegmentsWithHighlight(mergeRunsToSegments(block.runs), ai, null, sentences)
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
 * task-0005（裁定1 方案 A-简）：表格在两消费方渲染逐字节同构的结构化
 * <table class="a4-table-element">——度量容器按真表格测高（usePagination
 * 以 `:scope > p, :scope > table` 收集、表格整块一个 line），消灭旧
 * 「度量容器把表格按段落测 Markdown 源文本」的失真；双模式仅剩的表格
 * 分叉消除后 mode 参数随之删除（表格不参与 AI 高亮——现状保持）
 */
export function renderContentFlow(
  blocks: LayoutBlock[],
  metrics: LayoutMetrics,
  ai?: AIHighlightContext
): React.ReactNode {
  // 公文标题送审合并句行号：blocks 序列中首个标题块的源行号
  // （sentenceSplitter 标题合并句 DOCUMENT_TITLE-<首行>-1 的行号推导，
  // 渲染器内可算——task-0007 条款4，layout 零改动）
  let titleLineNumber = 0
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.kind === 'paragraph' && block.sourceType === NodeType.DOCUMENT_TITLE) {
      titleLineNumber = block.sourceLineNumber
      break
    }
  }

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
      // 结构化单元格 → <table>：页面与度量容器逐字节同构（task-0005 A-简），
      // 度量容器据此测真实表格高度（不参与 AI 高亮——现状保持）
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

    return renderParagraphBlock(block, index, metrics, ai, titleLineNumber)
  })
}
