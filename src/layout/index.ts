/**
 * 排版决策层入口：buildLayout
 *
 * 输入 GongwenAST + DocumentConfig + 渲染器/偏差开关，
 * 输出渲染器无关的版式决策中间表示（块序列 + 度量 + 版头/版记/页码参数）。
 *
 * 本层是排版决策的单一真值（task-0001 裁定 §一）：
 * - 待办-0001~0004 四项已知偏差由显式开关控制，默认值＝两渲染器现状
 * - 其余决策两侧统一，以导出侧现状（docxBuilder/styleFactory 的既有行为）为真值
 * - 纯函数模块：禁止 import docx / react / DOM（条款2 验收法）
 *
 * 单元3 只建层不接线：docxBuilder/styleFactory/A4Page/Preview 一律不动。
 */
import type {
  AttachmentNode,
  GongwenAST,
  DocumentNode,
  TableNode,
} from '../types/ast'
import { NodeType, assertNever } from '../types/ast'
import type { DocumentConfig } from '../types/documentConfig'
import { ptToTwip } from '../types/documentConfig'
import type {
  FontQuad,
  LayoutAlignment,
  LayoutBlock,
  LayoutDocument,
  LayoutIndent,
  LayoutParagraphBlock,
  LayoutRun,
  LayoutSpacerBlock,
  LayoutTableBlock,
  RendererKind,
} from './types'
import {
  ATTACHMENT_HANGING_CHARS,
  ATTACHMENT_LEFT_CHARS,
  DATE_INDENT_CHARS_NO_STAMP,
  DATE_INDENT_CHARS_STAMPED,
  FOOTER_NOTE_SIZE_HALF_PT,
  FOOTER_NOTE_THICK_LINE_EIGHTH_PT,
  FOOTER_NOTE_THIN_LINE_EIGHTH_PT,
  HEADER_BLANK_LINES_AFTER_ORG,
  HEADER_ORG_NAME_FONT,
  HEADER_ORG_NAME_SIZE_HALF_PT,
  HEADER_SIGNER_NAME_FONT,
  HEADER_TITLE_SPACING_LINES,
  PAGE_NUMBER_FONT,
  PAGE_NUMBER_ONE_CHAR_PT,
  PAGE_NUMBER_SIZE_HALF_PT,
  SPACER_LINES_AFTER_TITLE,
  SPACER_LINES_BEFORE_REMARK,
  SPACER_LINES_BEFORE_SIGNATURE,
} from './constants'
import {
  resolveDeviationSwitches,
  type DeviationSwitchSet,
} from './deviations'
import {
  charWidthTwips,
  dateRightIndentTwips,
  firstLineIndentTwips,
  charSpacingTwips,
  signatureRightIndentEm,
  signatureRightIndentTwips,
} from './metrics'
import { bodyPunctSpec, makeRun, nodeFontRole, roleSpec, type RoleSpec } from './fonts'
import {
  splitAttachmentRuns,
  splitHeading3Runs,
  splitHeadingSentenceRuns,
  splitTimeColonRuns,
} from './runs'

/** buildLayout 选项 */
export interface BuildLayoutOptions {
  /** 目标渲染器（决定偏差开关取哪一侧的现状值） */
  renderer: RendererKind
  /** 偏差开关覆盖项（未覆盖项保持现状默认） */
  deviations?: Partial<DeviationSwitchSet>
}

/** 构造字体四槽（hAnsi = 中文字体，与 styleFactory.font() 同口径） */
function quad(eastAsia: string, ascii = 'Times New Roman'): FontQuad {
  return { ascii, eastAsia, hAnsi: eastAsia, cs: ascii }
}

/** 版头/版记元数据字体四槽（导出侧现状：hAnsi 为 Times New Roman，与 quad 不同） */
function metaQuad(config: DocumentConfig): FontQuad {
  return {
    ascii: 'Times New Roman',
    eastAsia: config.body.fontFamily,
    hAnsi: 'Times New Roman',
    cs: 'Times New Roman',
  }
}

/** 正文基础行距（twips） */
function bodyLineTwips(config: DocumentConfig): number {
  return ptToTwip(config.body.lineSpacing)
}

/** 构造空行指令块（导出侧现状：空段携带正文字体四槽与字号） */
function spacerBlock(
  reason: LayoutSpacerBlock['reason'],
  lines: number,
  config: DocumentConfig
): LayoutSpacerBlock {
  return {
    kind: 'spacer',
    lines,
    lineTwips: bodyLineTwips(config),
    font: quad(config.body.fontFamily),
    sizeHalfPt: config.body.fontSize * 2,
    reason,
  }
}

/** 节点类型 → 段落对齐（与 styleFactory.getParagraphStyle 口径一致） */
function paragraphAlignment(type: NodeType): LayoutAlignment {
  switch (type) {
    case NodeType.DOCUMENT_TITLE:
      return 'center'
    case NodeType.SIGNATURE:
    case NodeType.DATE:
      return 'right'
    case NodeType.REMARK:
      return 'left'
    // 正文与一至四级标题、主送、附件：两端对齐
    case NodeType.HEADING_1:
    case NodeType.HEADING_2:
    case NodeType.HEADING_3:
    case NodeType.HEADING_4:
    case NodeType.PARAGRAPH:
    case NodeType.ADDRESSEE:
    case NodeType.ATTACHMENT:
    case NodeType.TABLE:
      return 'justified'
    default:
      // 穷尽断言（待办-0029）：新增 NodeType 成员未补分支时 tsc 报错
      assertNever(type)
      return 'justified'
  }
}

/** 节点类型 → 段落缩进（twips；署名缩进由调用方另行计算覆盖） */
function paragraphIndent(type: NodeType, config: DocumentConfig): LayoutIndent {
  const charWidth = charWidthTwips(config)
  switch (type) {
    case NodeType.DOCUMENT_TITLE:
      return {}
    case NodeType.ADDRESSEE:
      return { leftTwips: 0 }
    case NodeType.REMARK:
      return { leftTwips: 0 }
    case NodeType.DATE:
      return { rightTwips: dateRightIndentTwips(config) }
    case NodeType.ATTACHMENT:
      // 附件段（单附件/多附件首行）由附件块另行构造，此处仅为兜底
      return { leftTwips: ATTACHMENT_LEFT_CHARS * charWidth }
    // 正文与一至四级标题：首行缩进两字
    case NodeType.HEADING_1:
    case NodeType.HEADING_2:
    case NodeType.HEADING_3:
    case NodeType.HEADING_4:
    case NodeType.PARAGRAPH:
    case NodeType.SIGNATURE:
    case NodeType.TABLE:
      return { firstLineTwips: firstLineIndentTwips(config), leftTwips: 0 }
    default:
      // 穷尽断言（待办-0029）：新增 NodeType 成员未补分支时 tsc 报错
      assertNever(type)
      return { firstLineTwips: firstLineIndentTwips(config), leftTwips: 0 }
  }
}

/** 普通节点（非附件/表格）→ 段落块 */
function nodeToParagraphBlock(
  node: DocumentNode,
  config: DocumentConfig,
  switches: DeviationSwitchSet,
  renderer: RendererKind,
  spacingBeforeTwips = 0,
  signatureDateContent?: string
): LayoutParagraphBlock {
  const baseSpec = roleSpec(nodeFontRole(node.type), config)
  const bodySpec = roleSpec('body', config)
  // 待办-0022：时间冒号分段按渲染器开关取值（task-0004 起两侧默认 split）
  const colonSplitOn = switches.timeColonSplit[renderer] === 'split'

  // runs 分段决策（按节点类型）
  let runs: LayoutRun[]
  if (
    node.type === NodeType.HEADING_1 ||
    node.type === NodeType.HEADING_2 ||
    node.type === NodeType.HEADING_4
  ) {
    // 一、二、四级标题：首句用标题字体，句号后切换为正文（剩余不做时间冒号拆分）
    runs = splitHeadingSentenceRuns(node.content, baseSpec, bodySpec)
  } else if (node.type === NodeType.HEADING_3) {
    // 三级标题：序号句点拆分受 0001/0004 开关控制（默认＝该渲染器现状），
    // 剩余时间冒号拆分受 0022 开关控制
    const h3DotSpec = bodyPunctSpec(config, roleSpec('heading3', config).sizeHalfPt)
    const bodyColonSpec = colonSplitOn
      ? bodyPunctSpec(config, bodySpec.sizeHalfPt)
      : undefined
    runs = splitHeading3Runs(
      node.content,
      baseSpec,
      h3DotSpec,
      bodySpec,
      bodyColonSpec,
      {
        dotFont: switches.heading3DotFont[renderer],
        fullwidthDot: switches.heading3FullwidthDot[renderer],
      }
    )
  } else if (colonSplitOn) {
    // 标题/主送/正文/署名/日期/备注：时间冒号拆分（task-0004 起两渲染器默认）
    const colonSpec = bodyPunctSpec(config, baseSpec.sizeHalfPt)
    runs = splitTimeColonRuns(node.content, baseSpec, colonSpec)
  } else {
    // 0022 开关覆写回 no-split 时：整段单 run，不做时间冒号拆分（预览旧现状）
    runs = [makeRun(baseSpec, node.content)]
  }

  // 缩进：署名在成文日期上下文中按日期宽度居中
  let indent = paragraphIndent(node.type, config)
  if (node.type === NodeType.SIGNATURE) {
    const rightTwips = signatureDateContent
      ? signatureRightIndentTwips(node.content, signatureDateContent, config)
      : dateRightIndentTwips(config)
    indent = { rightTwips }
    if (renderer === 'preview') {
      // 预览侧 em 口径：与旧 A4Page.calculateSignatureIndentEm 逐位一致
      // （twips / charWidthTwips 回算存在末位浮点舍入差，见 LayoutIndent.rightEm）
      indent.rightEm = signatureDateContent
        ? signatureRightIndentEm(
            node.content,
            signatureDateContent,
            config.specialOptions.hasStamp
          )
        : config.specialOptions.hasStamp
          ? DATE_INDENT_CHARS_STAMPED
          : DATE_INDENT_CHARS_NO_STAMP
    }
  }

  return {
    kind: 'paragraph',
    sourceType: node.type,
    sourceLineNumber: node.lineNumber,
    alignment: paragraphAlignment(node.type),
    spacing: {
      lineTwips:
        node.type === NodeType.DOCUMENT_TITLE
          ? ptToTwip(config.title.lineSpacing)
          : bodyLineTwips(config),
      lineRule: 'exact',
      beforeTwips: spacingBeforeTwips,
      afterTwips: 0,
    },
    indent,
    runs,
  }
}

/** 附件说明节点 → 段落块数组（单/多附件两种模式） */
function attachmentToBlocks(
  node: AttachmentNode,
  config: DocumentConfig
): LayoutParagraphBlock[] {
  const blocks: LayoutParagraphBlock[] = []
  const charWidth = charWidthTwips(config)
  const lineTwips = bodyLineTwips(config)
  // 附件文本规格：数字英文 Times New Roman、中文仿宋（与正文同口径）
  const baseSpec: RoleSpec = {
    role: 'body',
    font: quad(config.body.fontFamily),
    sizeHalfPt: config.body.fontSize * 2,
    characterSpacingTwips: charSpacingTwips(config),
  }
  // 序号句点规格：正文字体四槽，字号跟随正文（导出侧现状）
  const punctSpec = bodyPunctSpec(config, baseSpec.sizeHalfPt)

  if (!node.isMultiple) {
    // 单附件：「附件：」＋名称（不拆分句点——导出/预览两侧现状一致）
    // 缺陷修正（单元4 接线发现）：spacing 形状与导出侧现状一致——仅 before、无 after
    blocks.push({
      kind: 'paragraph',
      sourceType: NodeType.ATTACHMENT,
      sourceLineNumber: node.lineNumber,
      attachmentVariant: 'single',
      alignment: 'justified',
      spacing: { lineTwips, lineRule: 'exact', beforeTwips: lineTwips },
      indent: {
        leftTwips: ATTACHMENT_LEFT_CHARS * charWidth,
        hangingTwips: ATTACHMENT_HANGING_CHARS * charWidth,
      },
      runs: [
        makeRun(baseSpec, '附件：'),
        makeRun(baseSpec, node.items[0].name),
      ],
    })
    return blocks
  }

  // 多附件：首行「附件：1.xxx」，后续各行「n.xxx」
  node.items.forEach(function (item, index) {
    const isFirst = index === 0
    const numbered = `${item.index}.${item.name}`
    const runs = isFirst
      ? [makeRun(baseSpec, '附件：'), ...splitAttachmentRuns(numbered, baseSpec, punctSpec)]
      : splitAttachmentRuns(numbered, baseSpec, punctSpec)

    blocks.push({
      kind: 'paragraph',
      sourceType: NodeType.ATTACHMENT,
      sourceLineNumber: node.lineNumber,
      attachmentVariant: isFirst ? 'multi-first' : 'multi-item',
      alignment: 'justified',
      // 缺陷修正（单元4 接线发现）：spacing 形状与导出侧现状一致——
      // 首行仅 before、后续行两者皆无
      spacing: isFirst
        ? { lineTwips, lineRule: 'exact', beforeTwips: lineTwips }
        : { lineTwips, lineRule: 'exact' },
      indent: isFirst
        ? {
            leftTwips: ATTACHMENT_LEFT_CHARS * charWidth,
            hangingTwips: ATTACHMENT_HANGING_CHARS * charWidth,
          }
        : { leftTwips: ATTACHMENT_LEFT_CHARS * charWidth },
      runs,
    })
  })

  return blocks
}

/** 表格节点 → 表格块 */
function tableToBlock(node: TableNode, config: DocumentConfig): LayoutTableBlock {
  return {
    kind: 'table',
    sourceType: NodeType.TABLE,
    // 原始 Markdown 源文本（rawContent）已随 task-0005 度量容器同构删除：
    // 两侧渲染器均消费结构化 headerCells/dataRows；AST 侧 TableNode.content
    // 的去留属 0032-AST 半截（sentenceSplitter 送审行为），挂起待用户裁定
    headerCells: node.header.cells.map(function (cell) {
      return cell.content
    }),
    dataRows: node.rows.map(function (row) {
      return row.cells.map(function (cell) {
        return cell.content
      })
    }),
    cellAlignment: 'center',
    // 缺陷修正（单元4 接线发现）：表格四槽 hAnsi=Times New Roman（导出侧快照现状），
    // 非 quad() 的中文字体口径
    font: {
      ascii: 'Times New Roman',
      eastAsia: config.table.fontFamily,
      hAnsi: 'Times New Roman',
      cs: 'Times New Roman',
    },
    sizeHalfPt: config.table.fontSize * 2,
    lineTwips: ptToTwip(config.table.lineSpacing),
    boldHeader: config.table.boldHeader,
  }
}

/** 版头版式参数（启用时） */
function buildHeaderLayout(
  config: DocumentConfig,
  switches: DeviationSwitchSet,
  renderer: RendererKind
) {
  const metaFont = metaQuad(config)
  return {
    orgName: config.header.orgName,
    docNumber: config.header.docNumber,
    signer: config.header.signer,
    // 发文机关标志：红色 30pt 小标宋（与版头表格内字体无关的固定规格——现状）
    // 缺陷修正（单元4 接线发现）：机关标志四槽 hAnsi=Times New Roman（导出侧快照现状），
    // 非 quad() 的中文字体口径——与签发人姓名字体同法，从 metaQuad 派生
    orgNameRun: {
      text: config.header.orgName,
      role: 'title' as const,
      font: { ...metaFont, eastAsia: HEADER_ORG_NAME_FONT },
      sizeHalfPt: HEADER_ORG_NAME_SIZE_HALF_PT,
    },
    metaFont,
    metaSizeHalfPt: config.body.fontSize * 2,
    // 签发人姓名字体：楷体（导出侧现状）
    signerNameFont: { ...metaFont, eastAsia: HEADER_SIGNER_NAME_FONT },
    // 「空一字」缩进 = 1 个正文字号宽度
    oneCharIndentTwips: ptToTwip(config.body.fontSize),
    blankLinesAfterOrg: HEADER_BLANK_LINES_AFTER_ORG,
    // 机关标志下空行行距＝正文行距（导出侧现状——单元4 接线补齐 IR 字段）
    blankLineTwips: bodyLineTwips(config),
    // 版头启用时标题前空二行（经段前距实现）
    titleSpacingBeforeTwips: ptToTwip(config.body.lineSpacing * HEADER_TITLE_SPACING_LINES),
    // 红色分隔线：按渲染器给出开关选定的现状参数
    separator: switches.redSeparator[renderer],
  }
}

/** 版记版式参数（启用时） */
function buildFooterNoteLayout(config: DocumentConfig, renderer: RendererKind) {
  return {
    cc: config.footerNote.cc,
    printer: config.footerNote.printer,
    printDate: config.footerNote.printDate,
    hasCc: !!config.footerNote.cc,
    hasPrint: !!(config.footerNote.printer || config.footerNote.printDate),
    font: metaQuad(config),
    sizeHalfPt: FOOTER_NOTE_SIZE_HALF_PT,
    oneCharIndentTwips: ptToTwip(config.body.fontSize),
    thickLineSizeEighthPt: FOOTER_NOTE_THICK_LINE_EIGHTH_PT,
    thinLineSizeEighthPt: FOOTER_NOTE_THIN_LINE_EIGHTH_PT,
    // 锚定机制现状：导出=浮动表格吸附版心底部；预览=绝对定位页底
    anchoring: renderer === 'docx'
      ? ('float-table-body-bottom' as const)
      : ('absolute-page-bottom' as const),
  }
}

/** 页码版式参数 */
function buildPageNumberLayout(
  config: DocumentConfig,
  switches: DeviationSwitchSet,
  renderer: RendererKind
) {
  // 页码四槽字体：0023 案 B（task-0004 裁定2）——来源改 config.specialOptions.pageNumberFont
  // （默认 '宋体'＝国标默认，默认产物四槽仍全宋体、导出快照零变化；改设置后两侧
  // 同源生效）。开关 pageNumberFont 登记 quad 机制形态；预览侧半角字符字体为
  // CSS 栈单源（.a4-footer，var(--page-number-font) 优先），预览渲染器不消费本字段
  const fontBehavior = switches.pageNumberFont.docx
  const fontFamily =
    fontBehavior.mechanism === 'quad' ? config.specialOptions.pageNumberFont : PAGE_NUMBER_FONT
  const quadSong: FontQuad = {
    ascii: fontFamily,
    eastAsia: fontFamily,
    hAnsi: fontFamily,
    cs: fontFamily,
  }
  return {
    enabled: config.specialOptions.showPageNumber,
    font: quadSong,
    sizeHalfPt: PAGE_NUMBER_SIZE_HALF_PT,
    // 「空一字」＝四号 14pt
    oneCharIndentTwips: ptToTwip(PAGE_NUMBER_ONE_CHAR_PT),
    oddAlignment: 'right' as const,
    evenAlignment: 'left' as const,
    format: 'dash-number-dash' as const,
    // 纵向位置：按渲染器给出开关选定的现状参数（待办-0002）
    vertical: switches.pageNumberVertical[renderer],
  }
}

/**
 * 将 GongwenAST + DocumentConfig 转换为渲染器无关的版式决策文档
 *
 * 块序列顺序与导出侧 buildDocument 的 children 顺序一致：
 * 标题段（首段可带版头段前距）→ 标题后空行 → 正文节点
 * （署名/备注前空行、附件展开、表格、署名按日期居中）。
 * 版头/版记/页码不进正文流，以版式参数输出。
 */
export function buildLayout(
  ast: GongwenAST,
  config: DocumentConfig,
  options: BuildLayoutOptions
): LayoutDocument {
  const renderer = options.renderer
  const switches = resolveDeviationSwitches(options.deviations)

  const hasHeader = config.header.enabled && !!config.header.orgName
  const titleSpacingBefore = hasHeader
    ? ptToTwip(config.body.lineSpacing * HEADER_TITLE_SPACING_LINES)
    : 0

  const blocks: LayoutBlock[] = []

  // ---- 标题段（多段标题依次入流；首段可带版头后段前距） ----
  if (ast.title.length > 0) {
    blocks.push(nodeToParagraphBlock(ast.title[0], config, switches, renderer, titleSpacingBefore))
    for (let i = 1; i < ast.title.length; i++) {
      blocks.push(nodeToParagraphBlock(ast.title[i], config, switches, renderer))
    }
    // 标题后空一行（两渲染器现状一致）
    blocks.push(spacerBlock('after-title', SPACER_LINES_AFTER_TITLE, config))
  }

  // ---- 正文节点 ----
  for (let i = 0; i < ast.body.length; i++) {
    const node = ast.body[i]

    // 发文机关署名前空两行（两渲染器现状一致）
    if (node.type === NodeType.SIGNATURE) {
      blocks.push(spacerBlock('before-signature', SPACER_LINES_BEFORE_SIGNATURE, config))
    }

    // 备注前空两行（两渲染器现状一致）
    if (node.type === NodeType.REMARK) {
      blocks.push(spacerBlock('before-remark', SPACER_LINES_BEFORE_REMARK, config))
    }

    // 附件说明：展开为 1..n 个段落块（联合封闭后 if 守卫即窄化为 AttachmentNode）
    if (node.type === NodeType.ATTACHMENT) {
      blocks.push(...attachmentToBlocks(node, config))
      continue
    }

    // 表格：结构化表格块（联合封闭后 if 守卫即窄化为 TableNode）
    if (node.type === NodeType.TABLE) {
      blocks.push(tableToBlock(node, config))
      continue
    }

    // 署名且下一节点为成文日期：按日期宽度计算居中右缩进（导出/预览两侧公式现状）
    let signatureDateContent: string | undefined
    if (
      node.type === NodeType.SIGNATURE &&
      i + 1 < ast.body.length &&
      ast.body[i + 1].type === NodeType.DATE
    ) {
      signatureDateContent = ast.body[i + 1].content
    }

    blocks.push(
      nodeToParagraphBlock(node, config, switches, renderer, 0, signatureDateContent)
    )
  }

  return {
    renderer,
    blocks,
    metrics: {
      charSpacingTwips: charSpacingTwips(config),
      charWidthTwips: charWidthTwips(config),
      firstLineIndentTwips: firstLineIndentTwips(config),
    },
    header: hasHeader ? buildHeaderLayout(config, switches, renderer) : null,
    footerNote: config.footerNote.enabled
      ? buildFooterNoteLayout(config, renderer)
      : null,
    pageNumber: buildPageNumberLayout(config, switches, renderer),
  }
}
