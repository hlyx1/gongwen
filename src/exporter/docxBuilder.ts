/**
 * docx 渲染器组装层：buildDocument
 *
 * task-0001 条款3（单元4）：本文件退化为「决策中间表示 → docx Document」
 * 的翻译层——先经 src/layout/ buildLayout 得到渲染器无关的版式决策
 * （块序列 + 版头/版记/页码参数），再按版头/正文/版记三段组装 docx 对象。
 * 排版决策（字体分段/缩进/空行/度量）不再在此实现。
 *
 * 对外签名不变：buildDocument(ast, config) → docx Document；
 * 导出产物由 exporter/__tests__/docxBuilder.test.ts 的 13 条快照红线锁定
 * （逐字节不变——本文件与 styleFactory 的任何改动都不得改变快照）。
 *
 * 旧内联决策的收编对照（删除清单，详见工作单元-4 汇报）：
 * - splitHeadingSentence/splitHeading3Text/splitTimeColonText/splitAttachmentText
 *   → layout/runs.ts（经 buildLayout 产出 runs）
 * - attachmentToParagraphs/nodeToParagraph → layout/index.ts 块构造
 * - 版头/版记/页码内联参数 → layout/index.ts buildHeaderLayout 等 + layout/constants.ts
 */
import {
  Document, Paragraph, TextRun, Footer, PageNumber,
  AlignmentType, BorderStyle, LineRuleType,
  Table, TableRow, TableCell, WidthType,
  TableAnchorType, RelativeHorizontalPosition, RelativeVerticalPosition, OverlapType,
} from 'docx'
import type { IBorderOptions } from 'docx'
import type { GongwenAST } from '../types/ast'
import type { DocumentConfig } from '../types/documentConfig'
import { cmToTwip } from '../types/documentConfig'
import { buildLayout } from '../layout'
import type {
  FooterNoteLayout,
  HeaderLayout,
  PageNumberLayout,
  RedSeparatorLayout,
} from '../layout/types'
import {
  A4_HEIGHT_TWIPS,
  A4_WIDTH_TWIPS,
  HEADER_RED_COLOR,
  PAGE_NUMBER_DASH,
} from '../layout/constants'
import { blocksToDocx, fontOptions } from './styleFactory'

// ---- 版头/版记表格无边框定义（docx 结构常量） ----

const NO_BORDER: IBorderOptions = {
  style: BorderStyle.NONE,
  size: 0,
  color: 'FFFFFF',
}

const TABLE_NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
}

/** 红色分隔线边框与文本的间距（pt）——导出侧现状结构参数 */
const RED_SEPARATOR_BORDER_SPACE = 1

// ---- 版头段（HeaderLayout → 段落/表格序列） ----

/**
 * 红色分隔线段：按决策层选定的导出侧机制（段落下边框）翻译
 * 形状与现状一致：仅段前距 + 段后 0，无行距
 */
function redSeparatorParagraph(separator: RedSeparatorLayout): Paragraph | null {
  if (separator.mechanism !== 'paragraph-border') {
    // 预览侧机制（css）不在 docx 渲染范围——按现状由开关保证不出现
    return null
  }
  return new Paragraph({
    spacing: { before: separator.beforeTwips, after: 0 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: separator.sizeEighthPt,
        color: separator.color,
        space: RED_SEPARATOR_BORDER_SPACE,
      },
    },
    children: [],
  })
}

/** 发文机关标志下空行（导出侧现状：空段携带版头元数据字体四槽） */
function headerBlankParagraphs(header: HeaderLayout): Paragraph[] {
  const paragraphs: Paragraph[] = []
  for (let i = 0; i < header.blankLinesAfterOrg; i++) {
    paragraphs.push(
      new Paragraph({
        spacing: { line: header.blankLineTwips, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
        children: [
          new TextRun({
            font: fontOptions(header.metaFont),
            size: header.metaSizeHalfPt,
            text: '',
          }),
        ],
      })
    )
  }
  return paragraphs
}

/** 签发人双栏无边框表：字号居左空一字、签发人居右空一字（导出侧现状结构） */
function signerTable(header: HeaderLayout): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: TABLE_NO_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                indent: { left: header.oneCharIndentTwips },
                children: [
                  new TextRun({
                    text: header.docNumber,
                    font: fontOptions(header.metaFont),
                    size: header.metaSizeHalfPt,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: TABLE_NO_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                indent: { right: header.oneCharIndentTwips },
                children: [
                  // 「签发人：」三字用版头元数据字体（三号仿宋口径）
                  new TextRun({
                    text: '签发人：',
                    font: fontOptions(header.metaFont),
                    size: header.metaSizeHalfPt,
                  }),
                  // 签发人姓名用楷体
                  new TextRun({
                    text: header.signer,
                    font: fontOptions(header.signerNameFont),
                    size: header.metaSizeHalfPt,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

/** 版头段组装：机关标志 → 空行 → 字号/签发人 → 红色分隔线 */
function headerChildren(header: HeaderLayout): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = []

  // 1. 发文机关标志：红色居中大字（颜色为 docx 结构层固定参数）
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: header.orgNameRun.text,
          font: fontOptions(header.orgNameRun.font),
          size: header.orgNameRun.sizeHalfPt,
          color: HEADER_RED_COLOR,
        }),
      ],
    })
  )

  // 2. 机关标志下空行（行数与行距由决策层给定）
  children.push(...headerBlankParagraphs(header))

  // 3. 发文字号 / 签发人（位于红线之上）
  if (header.signer) {
    children.push(signerTable(header))
  } else if (header.docNumber) {
    // 无签发人：发文字号居中
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: header.docNumber,
            font: fontOptions(header.metaFont),
            size: header.metaSizeHalfPt,
          }),
        ],
      })
    )
  }

  // 4. 红色分隔线
  const separator = redSeparatorParagraph(header.separator)
  if (separator) {
    children.push(separator)
  }

  return children
}

// ---- 版记段（FooterNoteLayout → 浮动表格） ----

/** 版记分隔线段（首末粗线/中间细线）：无文本、段前段后 0 */
function footerNoteLineParagraph(sizeEighthPt: number): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 0 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: sizeEighthPt,
        color: '000000',
      },
    },
    children: [],
  })
}

/** 印发机关 + 印发日期（嵌套无边框表格：左空一字、右空一字——导出侧现状结构） */
function printRowTable(footerNote: FooterNoteLayout): Table {
  const printerText = footerNote.printer || ''
  const dateText = footerNote.printDate ? `${footerNote.printDate}印发` : ''
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: TABLE_NO_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                indent: { left: footerNote.oneCharIndentTwips },
                children: printerText
                  ? [
                      new TextRun({
                        text: printerText,
                        font: fontOptions(footerNote.font),
                        size: footerNote.sizeHalfPt,
                      }),
                    ]
                  : [],
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: TABLE_NO_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                indent: { right: footerNote.oneCharIndentTwips },
                children: dateText
                  ? [
                      new TextRun({
                        text: dateText,
                        font: fontOptions(footerNote.font),
                        size: footerNote.sizeHalfPt,
                      }),
                    ]
                  : [],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

/**
 * 版记浮动表格（锚定最后一页版心底部）
 * 使用 Table Float 吸附页面底部，Word 引擎自动处理文本避让；
 * 内容序：首条粗线 → 抄送行 → 中间细线 → 印发行 → 末条粗线
 */
function footerNoteTable(footerNote: FooterNoteLayout): Table {
  const children: (Paragraph | Table)[] = []

  // 1. 首条粗线
  children.push(footerNoteLineParagraph(footerNote.thickLineSizeEighthPt))

  // 2. 抄送行（左右各空一字）
  if (footerNote.hasCc) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        indent: {
          left: footerNote.oneCharIndentTwips,
          right: footerNote.oneCharIndentTwips,
        },
        children: [
          new TextRun({
            text: `抄送：${footerNote.cc}`,
            font: fontOptions(footerNote.font),
            size: footerNote.sizeHalfPt,
          }),
        ],
      })
    )
  }

  // 3. 中间细线（仅在抄送和印发行同时存在时出现）
  if (footerNote.hasCc && footerNote.hasPrint) {
    children.push(footerNoteLineParagraph(footerNote.thinLineSizeEighthPt))
  }

  // 4. 印发机关 + 印发日期
  if (footerNote.hasPrint) {
    children.push(printRowTable(footerNote))
  }

  // 5. 末条粗线
  children.push(footerNoteLineParagraph(footerNote.thickLineSizeEighthPt))

  // 浮动表格包装器：无边框 1×1 表格，锚定在版心底部
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_NO_BORDERS,
    float: {
      horizontalAnchor: TableAnchorType.MARGIN,
      verticalAnchor: TableAnchorType.MARGIN,
      relativeHorizontalPosition: RelativeHorizontalPosition.LEFT,
      relativeVerticalPosition: RelativeVerticalPosition.BOTTOM,
      overlap: OverlapType.NEVER,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: TABLE_NO_BORDERS,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children,
          }),
        ],
      }),
    ],
  })
}

// ---- 页码段（PageNumberLayout → 奇偶页脚） ----

/** 页码段落：— X — 格式，纵向位置按决策层导出侧机制（页脚段前距）翻译 */
function pageNumberParagraph(
  pageNumber: PageNumberLayout,
  alignment: typeof AlignmentType.LEFT | typeof AlignmentType.RIGHT,
  indent: { left?: number; right?: number }
): Paragraph | null {
  if (pageNumber.vertical.mechanism !== 'footer-spacing-before') {
    // 预览侧机制（css 定位）不在 docx 渲染范围
    return null
  }
  const font = fontOptions(pageNumber.font)
  const size = pageNumber.sizeHalfPt
  return new Paragraph({
    alignment,
    indent,
    spacing: { before: pageNumber.vertical.beforeTwips },
    children: [
      new TextRun({ font, size, children: [PAGE_NUMBER_DASH + ' '] }),
      new TextRun({ font, size, children: [PageNumber.CURRENT] }),
      new TextRun({ font, size, children: [' ' + PAGE_NUMBER_DASH] }),
    ],
  })
}

/** 奇偶页脚：单页码居右空一字，双页码居左空一字（GB/T 9704） */
function buildFooters(pageNumber: PageNumberLayout) {
  if (!pageNumber.enabled) {
    return undefined
  }
  const odd = pageNumberParagraph(
    pageNumber,
    AlignmentType.RIGHT,
    { right: pageNumber.oneCharIndentTwips }
  )
  const even = pageNumberParagraph(
    pageNumber,
    AlignmentType.LEFT,
    { left: pageNumber.oneCharIndentTwips }
  )
  if (!odd || !even) {
    return undefined
  }
  return {
    default: new Footer({ children: [odd] }),
    even: new Footer({ children: [even] }),
  }
}

// ---- 文档组装 ----

/**
 * 将 GongwenAST + DocumentConfig 经决策层转换为 docx Document
 *
 * 组装序与现状一致：版头段 → 标题/正文流（含空行指令、附件展开、表格、
 * 署名缩进）→ 版记浮动表 → 页码页脚；页面骨架为 A4 + 配置边距。
 */
export function buildDocument(ast: GongwenAST, config: DocumentConfig): Document {
  const layout = buildLayout(ast, config, { renderer: 'docx' })

  const children: (Paragraph | Table)[] = []

  // ---- 版头段 ----
  if (layout.header) {
    children.push(...headerChildren(layout.header))
  }

  // ---- 正文流（标题后空行、署名/备注前空行等已由决策层块序列给出） ----
  children.push(...blocksToDocx(layout.blocks))

  // ---- 版记浮动表格 ----
  if (layout.footerNote) {
    children.push(footerNoteTable(layout.footerNote))
  }

  // ---- 页脚（页码） ----
  const footers = buildFooters(layout.pageNumber)

  return new Document({
    // 启用奇偶页不同页脚（单页码居右，双页码居左）
    evenAndOddHeaderAndFooters: layout.pageNumber.enabled,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIPS, // A4: 210mm
              height: A4_HEIGHT_TWIPS, // A4: 297mm
            },
            margin: {
              top: cmToTwip(config.margins.top),
              bottom: cmToTwip(config.margins.bottom),
              left: cmToTwip(config.margins.left),
              right: cmToTwip(config.margins.right),
            },
          },
        },
        footers,
        children,
      },
    ],
  })
}
