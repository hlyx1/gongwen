/**
 * 已知偏差显式开关（裁定 §一 / §七）
 *
 * 排版决策层输出统一真值；已知预览/导出偏差（待办-0001~0004，勘探.md §3.6）
 * 各设一个显式开关，集中定义于此，默认值＝两渲染器现状行为。
 * buildLayout 按开关为指定渲染器产出最终决策；
 * 偏差修复＝晋升对应待办并翻转开关（从隐性散落变显性集中可审计）。
 *
 * 待办-0005（表格分页测量失真）不设开关（裁定 §七）——它属分页测量层，
 * 其行为现状由单元5 原样保留。
 *
 * 现状值来源（默认值须与这些位置逐字段一致，禁止顺手修正）：
 * - 0001 预览侧：A4Page.tsx 无三级标题序号句点拆分（renderHeading3 仅按「。」拆首句）
 * - 0001 导出侧：docxBuilder.ts splitHeading3Text（句点用 getHeading3PunctuationRunStyle 正文字体）
 * - 0002 预览侧：A4Page.css .a4-footer { bottom: 4.2% }
 * - 0002 导出侧：docxBuilder.ts PAGE_NUM_SPACING_BEFORE = cmToTwip(0.7) = 397 twips
 * - 0003 预览侧：A4Page.css .a4-header-separator { border-bottom: 2px; margin-top: 8px }
 * - 0003 导出侧：docxBuilder.ts 红线段 { size: 15, before: 80 }
 * - 0004 预览侧：无句点拆分机制（全角句点自然跟随标题字体）
 * - 0004 导出侧：splitHeading3Text 正则 ^(\d+)(\.)(.*)$ 只认半角句点
 * - 0022 预览侧：A4Page 无时间冒号分段机制（整段单字体渲染）
 * - 0022 导出侧：docxBuilder splitTimeColonText（冒号用正文字体四槽）
 * - 0023 预览侧：A4Page.css .a4-footer 字体栈 'Times New Roman' 优先（CSS 单源）
 * - 0023 导出侧：docxBuilder 页码四槽全宋体
 *
 * 接线期新暴露偏差按裁定 §八 处置：补设开关（默认值＝现状）＋对应池行，
 * 不在接线单元内顺手统一。0022/0023 即单元5（预览接线）补设：
 * - 0022（时间冒号分段）：预览默认 no-split（预览现状），导出默认 split（导出现状）
 * - 0023（页码半角字符字体）：预览现状为 CSS 字体栈单源（.a4-footer，
 *   'Times New Roman' 优先）——决策层不内联该值，预览渲染器不消费
 *   PageNumberLayout.font（该字段为 docx 渲染器消费的四槽真值）
 */
import type {
  PageNumberVerticalLayout,
  RedSeparatorLayout,
  RendererKind,
} from './types'
import {
  HEADER_RED_COLOR,
  HEADER_SEPARATOR_BEFORE_TWIPS,
  HEADER_SEPARATOR_SIZE_EIGHTH_PT,
  PAGE_NUMBER_FONT,
  PAGE_NUMBER_GAP_TWIPS,
} from './constants'

/** 待办-0001：三级标题序号后句点字体 */
export type Heading3DotFontBehavior =
  /** 句点跟随三级标题字体（不产生独立标点 run）——预览侧现状 */
  | 'follow-heading3'
  /** 句点拆分并用正文字体四槽——导出侧现状 */
  | 'body-font'

/** 待办-0004：三级标题全角句点（如「1．」）是否参与序号句点拆分 */
export type Heading3FullwidthDotBehavior =
  /** 不拆分（全角句点跟随标题字体）——两渲染器现状 */
  | 'no-split'
  /** 全角句点与半角同法拆分（修复目标，待裁定确认） */
  | 'split'

/** 偏差开关集合（0001~0004 四项已知偏差＋接线期补设的 0022/0023，每个开关按渲染器各持一槽） */
export interface DeviationSwitchSet {
  /** 待办-0001：三级标题序号后英文句点字体 */
  heading3DotFont: Record<RendererKind, Heading3DotFontBehavior>
  /** 待办-0004：三级标题全角句点拆分 */
  heading3FullwidthDot: Record<RendererKind, Heading3FullwidthDotBehavior>
  /** 待办-0002：页码纵向位置 */
  pageNumberVertical: Record<RendererKind, PageNumberVerticalLayout>
  /** 待办-0003：版头红色分隔线 */
  redSeparator: Record<RendererKind, RedSeparatorLayout>
  /** 待办-0022：时间冒号分段（半角冒号是否独立为正文字体 run） */
  timeColonSplit: Record<RendererKind, TimeColonSplitBehavior>
  /** 待办-0023：页码半角字符（数字/一字线）字体形态 */
  pageNumberFont: Record<RendererKind, PageNumberFontLayout>
}

/** 待办-0022：时间冒号分段行为 */
export type TimeColonSplitBehavior =
  /** 不分段（时间冒号随宿主字体整段渲染）——预览侧现状 */
  | 'no-split'
  /** 冒号独立为正文字体四槽 run——导出侧现状 */
  | 'split'

/** 待办-0023：页码半角字符字体形态 */
export type PageNumberFontLayout =
  /**
   * 预览机制：CSS 字体栈单源（A4Page.css .a4-footer，'Times New Roman' 优先，
   * 回退 var(--page-number-font)）——决策层仅登记，预览渲染器不内联该值
   */
  | { mechanism: 'css-stack'; primary: string }
  /**
   * 导出机制：四槽字体（PageNumberLayout.font 的来源，
   * docx 渲染器直接消费——现状四槽全宋体）
   */
  | { mechanism: 'quad'; eastAsia: string }

/**
 * 偏差开关默认值＝两渲染器现状（冻结：详细需求条款9，
 * 重构期间不得顺手修正任何已知偏差）
 */
export const DEVIATION_SWITCHES_DEFAULT: Readonly<DeviationSwitchSet> = {
  // 待办-0001：三级标题序号句点字体
  heading3DotFont: {
    preview: 'follow-heading3',
    docx: 'body-font',
  },
  // 待办-0004：三级标题全角句点拆分（预览无拆分机制；导出正则只认半角）
  heading3FullwidthDot: {
    preview: 'no-split',
    docx: 'no-split',
  },
  // 待办-0002：页码纵向位置
  pageNumberVertical: {
    preview: { mechanism: 'css-bottom-percent', bottomPercent: 4.2 },
    docx: { mechanism: 'footer-spacing-before', beforeTwips: PAGE_NUMBER_GAP_TWIPS },
  },
  // 待办-0003：版头红色分隔线
  redSeparator: {
    preview: {
      mechanism: 'css',
      thicknessPx: 2,
      marginTopPx: 8,
      color: HEADER_RED_COLOR,
    },
    docx: {
      mechanism: 'paragraph-border',
      sizeEighthPt: HEADER_SEPARATOR_SIZE_EIGHTH_PT,
      beforeTwips: HEADER_SEPARATOR_BEFORE_TWIPS,
      color: HEADER_RED_COLOR,
    },
  },
  // 待办-0022（单元5 预览接线补设，裁定 §八）：时间冒号分段
  timeColonSplit: {
    preview: 'no-split',
    docx: 'split',
  },
  // 待办-0023（单元5 预览接线补设，裁定 §八）：页码半角字符字体
  pageNumberFont: {
    // 预览现状：CSS 字体栈单源（.a4-footer），'Times New Roman' 优先
    preview: { mechanism: 'css-stack', primary: 'Times New Roman' },
    // 导出现状：四槽全宋体（PageNumberLayout.font 来源）
    docx: { mechanism: 'quad', eastAsia: PAGE_NUMBER_FONT },
  },
}

/** 解析偏差开关：默认值基础上按覆盖项合并（未覆盖项保持现状） */
export function resolveDeviationSwitches(
  overrides?: Partial<DeviationSwitchSet>
): DeviationSwitchSet {
  if (!overrides) {
    return { ...DEVIATION_SWITCHES_DEFAULT }
  }
  return { ...DEVIATION_SWITCHES_DEFAULT, ...overrides }
}
