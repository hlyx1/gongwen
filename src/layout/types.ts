/**
 * 排版决策层中间表示（IR）类型定义
 *
 * 设计约束（task-0001 条款2 / 裁定 §一 §六）：
 * - 渲染器无关：本模块只含纯数据类型，禁止 docx / React / DOM 依赖
 * - 输入 GongwenAST + DocumentConfig，输出块序列与版式参数
 * - 四项已知偏差（待办-0001~0004）由 deviations.ts 显式开关控制，
 *   buildLayout 按开关为指定渲染器产出最终决策
 */
import type { NodeType } from '../types/ast'

/** 渲染器种类：预览（DOM/CSS）与 docx 导出 */
export type RendererKind = 'preview' | 'docx'

/** 段落对齐方式（渲染器无关枚举） */
export type LayoutAlignment = 'center' | 'left' | 'right' | 'justified'

/**
 * 字体角色：run 的字体身份
 * 预览侧据此映射 CSS 类名，docx 侧直接消费 run 自带的字体四槽
 */
export type FontRole =
  | 'title' // 公文标题（方正小标宋）
  | 'heading1' // 一级标题（黑体，读 config.advanced.h1）
  | 'heading2' // 二级标题（楷体，读 config.advanced.h2）
  | 'heading3' // 三级标题（仿宋，读 config.advanced.h3）
  | 'heading4' // 四级标题（仿宋，与正文同字体——现状落入正文默认分支）
  | 'body' // 正文（仿宋）
  | 'addressee' // 主送机关（读 config.advanced.addressee）
  | 'bodyPunct' // 标点专用正文字体四槽（时间冒号/三级标题句点/附件句点，导出侧现状）
  | 'table' // 表格（读 config.table）

/** 字体四槽（Word 字体分配口径的纯数据形式） */
export interface FontQuad {
  /** 基本西文字符（英文字母、数字） */
  ascii: string
  /** 东亚文字（中文） */
  eastAsia: string
  /** 高 ANSI 字符（省略号、破折号等中文标点归此槽） */
  hAnsi: string
  /** 复杂文种 */
  cs: string
}

/** 文本 run 的完整规格：docx 渲染器可直接翻译，预览渲染器可按 role 映射类名 */
export interface LayoutRun {
  text: string
  role: FontRole
  font: FontQuad
  /** 字号（half-point，1pt = 2） */
  sizeHalfPt: number
  /** 字符间距（twips），不设置时缺省（如公文标题不参与 28 字微调） */
  characterSpacingTwips?: number
  bold?: boolean
}

/** 段落缩进（twips；预览换算 em = twips / metrics.charWidthTwips） */
export interface LayoutIndent {
  firstLineTwips?: number
  leftTwips?: number
  rightTwips?: number
  hangingTwips?: number
  /**
   * 预览侧右缩进的 em 口径值（仅 renderer='preview' 时给出）
   * em 累加与旧 A4Page.calculateSignatureIndentEm 逐位一致；
   * twips / charWidthTwips 的除法回算存在末位浮点舍入差
   * （如 4.414999999999999 vs 4.415，待办-0018 族），故预览缩进
   * 以本字段为优先供给，缺省时才用 rightTwips 换算
   */
  rightEm?: number
}

/**
 * 段落行距与段前段后距（固定行距口径，现状全部 exact）
 * 缺陷修正（单元4 接线发现）：段前/段后距为可选——导出侧现状并非恒输出
 * （附件段落首行仅 before、后续行两者皆无；docx 序列化对未设属性不产出 XML 属性），
 * 决策层按现状形状输出，翻译层仅翻译存在的字段
 */
export interface LayoutSpacing {
  lineTwips: number
  lineRule: 'exact'
  beforeTwips?: number
  afterTwips?: number
}

/** 段落块 */
export interface LayoutParagraphBlock {
  kind: 'paragraph'
  /** 源 AST 节点类型（对齐/缩进决策的依据） */
  sourceType: NodeType
  /** 源 AST 节点行号（AI 高亮 sentenceId「nodeType-lineNumber-localSeq」链路依赖） */
  sourceLineNumber: number
  alignment: LayoutAlignment
  spacing: LayoutSpacing
  indent?: LayoutIndent
  runs: LayoutRun[]
  /**
   * 附件说明段落的形态（仅 sourceType=ATTACHMENT 时给出）
   * 预览渲染器据此决定 DOM 类名（--single / --multi-first / --item--multi）
   * 与「附件：」前缀的渲染方式；docx 渲染器不消费
   */
  attachmentVariant?: 'single' | 'multi-first' | 'multi-item'
}

/** 结构性空行指令（两渲染器现状一致：标题后 1 行、署名/备注前各 2 行） */
export interface LayoutSpacerBlock {
  kind: 'spacer'
  /** 空行行数 */
  lines: number
  /** 空行行距（twips，固定值） */
  lineTwips: number
  /** 空行 run 字体（导出侧现状：空 TextRun 携带正文字体四槽） */
  font: FontQuad
  sizeHalfPt: number
  /** 产生原因（审计对照用） */
  reason: 'after-title' | 'before-signature' | 'before-remark'
}

/** 表格块（Markdown 表格的结构化决策） */
export interface LayoutTableBlock {
  kind: 'table'
  sourceType: NodeType.TABLE
  /** 原始 Markdown 表格源文本（AST TableNode.content 原样保留） */
  rawContent: string
  headerCells: string[]
  dataRows: string[][]
  /** 单元格对齐（现状：全部居中） */
  cellAlignment: 'center'
  font: FontQuad
  sizeHalfPt: number
  lineTwips: number
  boldHeader: boolean
}

/** 正文流块（渲染器按序翻译） */
export type LayoutBlock = LayoutParagraphBlock | LayoutSpacerBlock | LayoutTableBlock

/** 版头红色分隔线版式（待办-0003 偏差开关控制每渲染器参数） */
export type RedSeparatorLayout =
  /** 预览机制：CSS 下边框 + 上边距 */
  | { mechanism: 'css'; thicknessPx: number; marginTopPx: number; color: string }
  /** 导出机制：段落下边框（size 单位 1/8 pt）+ 段前距 */
  | { mechanism: 'paragraph-border'; sizeEighthPt: number; beforeTwips: number; color: string }

/** 页码纵向位置版式（待办-0002 偏差开关控制每渲染器参数） */
export type PageNumberVerticalLayout =
  /** 预览机制：距页底百分比绝对定位 */
  | { mechanism: 'css-bottom-percent'; bottomPercent: number }
  /** 导出机制：页脚段落 spacing.before（7mm = 397 twips，GB/T 9704） */
  | { mechanism: 'footer-spacing-before'; beforeTwips: number }

/** 版头版式参数（启用时输出；渲染器据此在流头/页头构建版头） */
export interface HeaderLayout {
  orgName: string
  docNumber: string
  signer: string
  /** 发文机关标志 run：红色 30pt 小标宋（text = orgName） */
  orgNameRun: LayoutRun
  /** 发文字号/签发人行字体（导出侧现状：hAnsi 为 Times New Roman） */
  metaFont: FontQuad
  metaSizeHalfPt: number
  /** 签发人姓名字体（导出侧现状：楷体_GB2312） */
  signerNameFont: FontQuad
  /** 「空一字」缩进（导出侧现状：字号宽度 twips） */
  oneCharIndentTwips: number
  /** 机关标志下空行数（导出侧现状：2，正文字号行距） */
  blankLinesAfterOrg: number
  /** 机关标志下空行的行距（twips，固定值＝正文行距）——导出侧现状 */
  blankLineTwips: number
  /** 版头启用时首标题段前距（导出侧现状：2 × 正文行距） */
  titleSpacingBeforeTwips: number
  /** 红色分隔线（按渲染器给出最终参数） */
  separator: RedSeparatorLayout
}

/** 版记版式参数（启用时输出） */
export interface FooterNoteLayout {
  cc: string
  printer: string
  printDate: string
  hasCc: boolean
  hasPrint: boolean
  /** 版记字体（导出侧现状：hAnsi 为 Times New Roman） */
  font: FontQuad
  sizeHalfPt: number
  /** 「空一字」缩进（正文字号宽度 twips） */
  oneCharIndentTwips: number
  /** 首末条粗线（1.5pt，单位 1/8 pt） */
  thickLineSizeEighthPt: number
  /** 抄送与印发之间细线（0.5pt） */
  thinLineSizeEighthPt: number
  /** 锚定机制：导出=浮动表格吸附版心底部；预览=绝对定位页底 */
  anchoring: 'float-table-body-bottom' | 'absolute-page-bottom'
}

/** 页码版式参数 */
export interface PageNumberLayout {
  enabled: boolean
  /**
   * 页码四槽字体——docx 渲染器直接消费（现状四槽全宋体）
   * 预览侧半角字符字体为 CSS 字体栈单源（A4Page.css .a4-footer，
   * 'Times New Roman' 优先），预览渲染器不消费本字段（待办-0023，
   * 形态登记于 deviations.pageNumberFont）
   */
  font: FontQuad
  sizeHalfPt: number
  /** 「空一字」缩进（四号 14pt = 280 twips） */
  oneCharIndentTwips: number
  /** 奇数页：居右空一字 */
  oddAlignment: 'right'
  /** 偶数页：居左空一字 */
  evenAlignment: 'left'
  /** 一字线格式：— X — */
  format: 'dash-number-dash'
  /** 纵向位置（按渲染器给出最终参数） */
  vertical: PageNumberVerticalLayout
}

/** 度量参数（两渲染器换算共用单源） */
export interface LayoutMetrics {
  /** 字符间距（twips）：floor(版心宽 / 28 − 正文字号 × 20) */
  charSpacingTwips: number
  /** 单字符宽度（twips）：正文字号 × 20 + 字符间距 */
  charWidthTwips: number
  /** 正文首行缩进（twips）：缩进字符数 × 字符宽度 */
  firstLineIndentTwips: number
}

/** buildLayout 产物：完整的渲染器无关（除显式开关外）排版决策 */
export interface LayoutDocument {
  renderer: RendererKind
  blocks: LayoutBlock[]
  metrics: LayoutMetrics
  header: HeaderLayout | null
  footerNote: FooterNoteLayout | null
  pageNumber: PageNumberLayout
}
