/**
 * 版式常量单源
 *
 * 收编原散落在 docxBuilder.ts / styleFactory.ts / Preview.tsx 的排版魔数
 * （task-0001 勘探 §3.3-3.4：红线 size 15/before 80、页码 7mm、版头 60 等）。
 * 本文件是决策层及其后续渲染器单元的唯一取值处；
 * 单位换算函数（cmToTwip/ptToTwip）沿用 types/documentConfig.ts 既有单源，不复制。
 */
import { cmToTwip } from '../types/documentConfig'

// ---- 页面（A4 竖向，GB/T 9704） ----

/** A4 页面宽度（twips，210mm）——原 styleFactory/Preview 各自硬编码 11906 */
export const A4_WIDTH_TWIPS = 11906

/** A4 页面高度（twips，297mm） */
export const A4_HEIGHT_TWIPS = 16838

/** ASCII/半角字符宽度系数（相对汉字宽），两渲染器现状共同值 */
export const ASCII_CHAR_WIDTH_RATIO = 0.69

/** CJK 字符宽度系数（相对汉字宽） */
export const CJK_CHAR_WIDTH_RATIO = 1

// ---- 结构性空行（两渲染器现状一致） ----

/** 公文标题后空行数 */
export const SPACER_LINES_AFTER_TITLE = 1

/** 发文机关署名前空行数 */
export const SPACER_LINES_BEFORE_SIGNATURE = 2

/** 备注前空行数 */
export const SPACER_LINES_BEFORE_REMARK = 2

// ---- 版头（docxBuilder.ts:426-531 原内联参数） ----

/** 发文机关标志字体（红色大字） */
export const HEADER_ORG_NAME_FONT = '方正小标宋_GBK'

/** 发文机关标志字号（half-point，30pt） */
export const HEADER_ORG_NAME_SIZE_HALF_PT = 60

/** 版头红色（机关标志与分隔线共用） */
export const HEADER_RED_COLOR = 'E00000'

/** 签发人姓名字体（楷体） */
export const HEADER_SIGNER_NAME_FONT = '楷体_GB2312'

/** 发文机关标志下空行数（正文字号行距） */
export const HEADER_BLANK_LINES_AFTER_ORG = 2

/** 版头启用时标题前空行数（导出侧经 spacing.before 实现） */
export const HEADER_TITLE_SPACING_LINES = 2

/** 红色分隔线段前距（twips，4pt）——导出侧现状 */
export const HEADER_SEPARATOR_BEFORE_TWIPS = 80

/** 红色分隔线粗细（1/8 pt，15 ≈ 1.875pt）——导出侧现状 */
export const HEADER_SEPARATOR_SIZE_EIGHTH_PT = 15

// ---- 版记（docxBuilder.ts:623-756 原内联参数） ----

/** 版记字号（half-point，四号 14pt） */
export const FOOTER_NOTE_SIZE_HALF_PT = 28

/** 版记首末条粗线（1/8 pt，12 = 1.5pt） */
export const FOOTER_NOTE_THICK_LINE_EIGHTH_PT = 12

/** 版记中间细线（1/8 pt，4 = 0.5pt） */
export const FOOTER_NOTE_THIN_LINE_EIGHTH_PT = 4

// ---- 页码（docxBuilder.ts:31-56 原内联参数） ----

/** 页码一字线（Unicode EM DASH） */
export const PAGE_NUMBER_DASH = '\u2014'

/** 页码字体（导出侧现状：四槽全宋体） */
export const PAGE_NUMBER_FONT = '宋体'

/** 页码字号（half-point，四号 14pt） */
export const PAGE_NUMBER_SIZE_HALF_PT = 28

/** 页码「空一字」基准字号（pt，四号 14pt → 280 twips） */
export const PAGE_NUMBER_ONE_CHAR_PT = 14

/** 页码距版心下边缘间距（cm，GB/T 9704：7mm） */
export const PAGE_NUMBER_GAP_CM = 0.7

/** 页码距版心下边缘间距（twips，cmToTwip(0.7) = 397）——导出侧现状 */
export const PAGE_NUMBER_GAP_TWIPS = cmToTwip(PAGE_NUMBER_GAP_CM)

// ---- 附件说明缩进（styleFactory.getAttachmentParagraphStyle 原参数） ----

/** 附件说明左空字数（2 + 3，含悬挂对齐位） */
export const ATTACHMENT_LEFT_CHARS = 5

/** 附件说明悬挂缩进字数 */
export const ATTACHMENT_HANGING_CHARS = 3

// ---- 署名/日期右空基准（styleFactory 原参数） ----

/** 不加盖印章：右空二字 */
export const DATE_INDENT_CHARS_NO_STAMP = 2

/** 加盖印章：右空四字（GB/T 9704 7.3.5.1） */
export const DATE_INDENT_CHARS_STAMPED = 4
