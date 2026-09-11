/**
 * docx 渲染器翻译层：决策中间表示 → docx 段落/文本/表格对象
 *
 * task-0001 条款3（单元4）：本文件不再做任何排版决策——
 * 字体角色、run 分段、缩进、间距、空行、表格版式等决策全部由
 * src/layout/ 决策层供给，这里只做「决策块 → docx 对象」的纯翻译。
 *
 * 翻译形状纪律（导出产物快照逐字节保持的机械保证）：
 * - 可选字段（beforeTwips/afterTwips/indent 各槽）只在决策层给出时翻译，
 *   不补默认值——docx 对未设属性不产出 XML 属性，但空对象会产出空标签
 *   （如 indent:{} → <w:ind/>），与「不设」不等价
 * - 决策层删除的旧决策函数对照关系见工作单元-4 删除清单：
 *   getParagraphStyle/getRunStyle 系 → layout/fonts.ts roleSpec；
 *   calculateCharWidth/TextWidth/SignatureIndent → layout/metrics.ts；
 *   拆分函数 → layout/runs.ts
 */
import {
  AlignmentType,
  BorderStyle,
  LineRuleType,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { IBorderOptions, IParagraphOptions, IRunOptions } from 'docx'
import type {
  FontQuad,
  LayoutBlock,
  LayoutIndent,
  LayoutParagraphBlock,
  LayoutRun,
  LayoutSpacerBlock,
  LayoutSpacing,
  LayoutTableBlock,
} from '../layout/types'

// ---- 表格边框定义（公文标准黑色细线——docx 结构常量） ----

const TABLE_CELL_BORDER: IBorderOptions = {
  style: BorderStyle.SINGLE,
  size: 4, // 0.5pt
  color: '000000',
}

const TABLE_BORDERS = {
  top: TABLE_CELL_BORDER,
  bottom: TABLE_CELL_BORDER,
  left: TABLE_CELL_BORDER,
  right: TABLE_CELL_BORDER,
  insideHorizontal: TABLE_CELL_BORDER,
  insideVertical: TABLE_CELL_BORDER,
}

// ---- 基础映射 ----

/** 渲染器无关对齐 → docx 对齐枚举（纯映射） */
const ALIGNMENT_MAP = {
  center: AlignmentType.CENTER,
  left: AlignmentType.LEFT,
  right: AlignmentType.RIGHT,
  justified: AlignmentType.JUSTIFIED,
} as const

/** 字体四槽 → docx 字体属性（纯搬运） */
export function fontOptions(font: FontQuad): IRunOptions['font'] {
  return {
    ascii: font.ascii,
    eastAsia: font.eastAsia,
    hAnsi: font.hAnsi,
    cs: font.cs,
  }
}

/**
 * 决策 run → docx run 选项
 * characterSpacing/bold 仅在决策层给出时翻译（未设不产出 XML 属性）
 */
export function runOptions(run: LayoutRun): IRunOptions {
  const options: IRunOptions = {
    text: run.text,
    font: fontOptions(run.font),
    size: run.sizeHalfPt,
  }
  if (run.characterSpacingTwips !== undefined) {
    options.characterSpacing = run.characterSpacingTwips
  }
  if (run.bold !== undefined) {
    options.bold = run.bold
  }
  return options
}

/** 决策 run → docx TextRun */
export function textRunFromLayout(run: LayoutRun): TextRun {
  return new TextRun(runOptions(run))
}

/** 段落间距翻译：只翻译存在的字段（附件段落现状＝仅 before 或两者皆无） */
function spacingOptions(spacing: LayoutSpacing) {
  const result: { line: number; lineRule: LineRuleType; before?: number; after?: number } = {
    line: spacing.lineTwips,
    lineRule: LineRuleType.EXACT,
  }
  if (spacing.beforeTwips !== undefined) {
    result.before = spacing.beforeTwips
  }
  if (spacing.afterTwips !== undefined) {
    result.after = spacing.afterTwips
  }
  return result
}

/** 段落缩进翻译：只翻译存在的槽；空缩进不设属性（空对象会产出 <w:ind/> 空标签） */
function indentOptions(indent?: LayoutIndent) {
  if (!indent) {
    return undefined
  }
  const result: { firstLine?: number; left?: number; right?: number; hanging?: number } = {}
  if (indent.firstLineTwips !== undefined) {
    result.firstLine = indent.firstLineTwips
  }
  if (indent.leftTwips !== undefined) {
    result.left = indent.leftTwips
  }
  if (indent.rightTwips !== undefined) {
    result.right = indent.rightTwips
  }
  if (indent.hangingTwips !== undefined) {
    result.hanging = indent.hangingTwips
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/** 决策段落块 → docx 段落选项（对齐/间距/缩进按决策翻译，不做默认补齐） */
export function paragraphOptions(block: LayoutParagraphBlock): Partial<IParagraphOptions> {
  return {
    alignment: ALIGNMENT_MAP[block.alignment],
    spacing: spacingOptions(block.spacing),
    indent: indentOptions(block.indent),
  }
}

/** 决策段落块 → docx Paragraph（runs 逐个翻译） */
export function paragraphFromBlock(block: LayoutParagraphBlock): Paragraph {
  return new Paragraph({
    ...paragraphOptions(block),
    children: block.runs.map(textRunFromLayout),
  })
}

/**
 * 决策空行块 → N 个空段
 * 导出侧现状形状：空段携带决策层给定的字体四槽与字号、固定行距、段前段后 0，
 * 内含一个空文本 run
 */
export function spacerParagraphs(spacer: LayoutSpacerBlock): Paragraph[] {
  const paragraphs: Paragraph[] = []
  for (let i = 0; i < spacer.lines; i++) {
    paragraphs.push(
      new Paragraph({
        spacing: {
          line: spacer.lineTwips,
          lineRule: LineRuleType.EXACT,
          before: 0,
          after: 0,
        },
        children: [
          new TextRun({ font: fontOptions(spacer.font), size: spacer.sizeHalfPt, text: '' }),
        ],
      })
    )
  }
  return paragraphs
}

/** 表格单元格 → docx TableCell（黑细线边框 + 居中 + 表格行距；表头可加粗） */
function tableCell(cellText: string, block: LayoutTableBlock, bold?: boolean): TableCell {
  const runOptions_: IRunOptions = {
    text: cellText,
    font: fontOptions(block.font),
    size: block.sizeHalfPt,
  }
  if (bold !== undefined) {
    runOptions_.bold = bold
  }
  return new TableCell({
    borders: TABLE_BORDERS,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: block.lineTwips, lineRule: LineRuleType.EXACT },
        children: [new TextRun(runOptions_)],
      }),
    ],
  })
}

/** 决策表格块 → docx Table（表头行加粗跟随 boldHeader 决策） */
export function tableFromBlock(block: LayoutTableBlock): Table {
  const headerRow = new TableRow({
    children: block.headerCells.map(function (cell) {
      return tableCell(cell, block, block.boldHeader)
    }),
  })
  const dataRows = block.dataRows.map(function (row) {
    return new TableRow({
      children: row.map(function (cell) {
        return tableCell(cell, block)
      }),
    })
  })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [headerRow, ...dataRows],
  })
}

/** 任意正文流决策块 → docx 对象（docxBuilder 正文段组装入口） */
export function blockToDocx(block: LayoutBlock): Paragraph | Table {
  if (block.kind === 'paragraph') {
    return paragraphFromBlock(block)
  }
  if (block.kind === 'spacer') {
    // 空行块至少产出 1 段（lines ≥ 1 由决策层保证；多行取首段由调用方展开）
    return spacerParagraphs(block)[0]
  }
  return tableFromBlock(block)
}

/** 正文流决策块序列 → docx 对象序列（空行块按行数展开） */
export function blocksToDocx(blocks: LayoutBlock[]): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = []
  for (const block of blocks) {
    if (block.kind === 'spacer') {
      result.push(...spacerParagraphs(block))
    } else {
      result.push(blockToDocx(block))
    }
  }
  return result
}
