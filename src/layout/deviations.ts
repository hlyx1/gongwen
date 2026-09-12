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
 * 默认值口径（task-0004 对齐族实施起生效，裁定见 tasks/task-0004/裁定.md）：
 * - 0001/0003/0004/0022/0023 已按裁定翻转为对齐值（对齐方向＝导出/国标口径）；
 *   翻转前的两渲染器现状值存档于 task-0004 勘探.md §二（供回滚与差异抽查）
 * - 0002 页码纵向位置维持两渲染器现状（task-0004 裁定1 冻结：导出侧机制
 *   语义未经实测定标前翻转值会引入新偏差，回池待议——定标后再翻转）
 *
 * 取值来源（默认值须与这些位置逐字段一致，禁止顺手修正）：
 * - 0001 两侧：runs.ts splitHeading3NumberDotRuns 拆分（句点 run 用 bodyPunct
 *   正文字体四槽）；预览侧 renderContentFlow 按 run.role 映射 .a4-body-punctuation
 * - 0002 预览侧：A4Page.css .a4-footer { bottom: 4.2% }（现状未动）
 * - 0002 导出侧：docxBuilder.ts PAGE_NUM_SPACING_BEFORE = cmToTwip(0.7) = 397 twips
 * - 0003 两侧：线粗 1.875px＝HEADER_SEPARATOR_SIZE_EIGHTH_PT/8（15/8pt）、上方间距
 *   4px＝HEADER_SEPARATOR_BEFORE_TWIPS/20（80twips=4pt；预览 72dpi 下 1pt=1px）；
 *   预览侧 A4Page.css .a4-header-separator 与本表两处人肉同步（裁定5 案 A 代价）
 * - 0004 两侧：runs.ts split 分支正则 ^(\d+)([.．])(.*)$（半角/全角句点同法拆分）
 * - 0022 两侧：runs.ts splitTimeColonRuns（冒号 run 用正文字体四槽）；
 *   预览侧 renderContentFlow 仅标点 span 渲染（裁定3 案二）
 * - 0023 两侧：页码字体来源 config.specialOptions.pageNumberFont（默认 '宋体'，
 *   裁定2 案 B）；预览侧 A4Page.css .a4-footer 字体栈 var(--page-number-font, '宋体')
 *   单源（去 TNR 优先）
 *
 * 接线期新暴露偏差按裁定 §八 处置：补设开关（默认值＝现状）＋对应池行，
 * 不在接线单元内顺手统一。0022/0023 即单元5（预览接线）补设，task-0004
 * 对齐族逐项翻转（0022 两侧 split；0023 案 B 两侧同源 config）：
 * - 0023（页码半角字符字体）：预览为 CSS 字体栈单源（.a4-footer，
 *   var(--page-number-font) 优先）——决策层不内联该值，预览渲染器不消费
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

/** 待办-0001：三级标题序号后句点字体（task-0004 已对齐：两侧均 body-font） */
export type Heading3DotFontBehavior =
  /** 句点跟随三级标题字体（不产生独立标点 run）——task-0004 前的预览侧现状 */
  | 'follow-heading3'
  /** 句点拆分并用正文字体四槽——导出侧现状＝task-0004 起的两侧默认 */
  | 'body-font'

/** 待办-0004：三级标题全角句点（如「1．」）是否参与序号句点拆分（task-0004 已对齐：两侧均 split） */
export type Heading3FullwidthDotBehavior =
  /** 不拆分（全角句点跟随标题字体）——task-0004 前的两渲染器现状 */
  | 'no-split'
  /** 全角句点与半角同法拆分——task-0004 起的两侧默认 */
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

/** 待办-0022：时间冒号分段行为（task-0004 已对齐：两侧均 split） */
export type TimeColonSplitBehavior =
  /** 不分段（时间冒号随宿主字体整段渲染）——task-0004 前的预览侧现状 */
  | 'no-split'
  /** 冒号独立为正文字体四槽 run——导出侧现状＝task-0004 起的两侧默认 */
  | 'split'

/** 待办-0023：页码半角字符字体形态（task-0004 案 B 对齐：两侧同源 config） */
export type PageNumberFontLayout =
  /**
   * 预览机制：CSS 字体栈单源（A4Page.css .a4-footer，var(--page-number-font)
   * 优先，回退 '宋体'）——决策层仅登记机制形态，primary＝config 来源的默认值
   * （改页码字体设置经 --page-number-font 注入，与导出侧同源生效）
   */
  | { mechanism: 'css-stack'; primary: string }
  /**
   * 导出机制：四槽字体（PageNumberLayout.font 的来源，消费
   * config.specialOptions.pageNumberFont——默认四槽全宋体）
   */
  | { mechanism: 'quad'; eastAsia: string }

/**
 * 偏差开关默认值（task-0004 对齐族：0001/0003/0004/0022/0023 已翻转为对齐值，
 * 0002 冻结维持现状——见文件头「默认值口径」）
 */
export const DEVIATION_SWITCHES_DEFAULT: Readonly<DeviationSwitchSet> = {
  // 待办-0001：三级标题序号句点字体（task-0004 翻转：预览 follow-heading3 → body-font）
  heading3DotFont: {
    preview: 'body-font',
    docx: 'body-font',
  },
  // 待办-0004：三级标题全角句点拆分（task-0004 翻转：两侧 no-split → split）
  heading3FullwidthDot: {
    preview: 'split',
    docx: 'split',
  },
  // 待办-0002：页码纵向位置
  pageNumberVertical: {
    preview: { mechanism: 'css-bottom-percent', bottomPercent: 4.2 },
    docx: { mechanism: 'footer-spacing-before', beforeTwips: PAGE_NUMBER_GAP_TWIPS },
  },
  // 待办-0003：版头红色分隔线（task-0004 案 A 对齐：预览改导出口径换算值）
  redSeparator: {
    preview: {
      mechanism: 'css',
      // 线粗 1.875px＝15/8pt、上方间距 4px＝80twips/20（预览 72dpi 下 1pt=1px）
      thicknessPx: HEADER_SEPARATOR_SIZE_EIGHTH_PT / 8,
      marginTopPx: HEADER_SEPARATOR_BEFORE_TWIPS / 20,
      color: HEADER_RED_COLOR,
    },
    docx: {
      mechanism: 'paragraph-border',
      sizeEighthPt: HEADER_SEPARATOR_SIZE_EIGHTH_PT,
      beforeTwips: HEADER_SEPARATOR_BEFORE_TWIPS,
      color: HEADER_RED_COLOR,
    },
  },
  // 待办-0022（单元5 预览接线补设，裁定 §八；task-0004 翻转：预览 no-split → split）
  timeColonSplit: {
    preview: 'split',
    docx: 'split',
  },
  // 待办-0023（单元5 预览接线补设，裁定 §八；task-0004 案 B 对齐）：页码半角字符字体
  pageNumberFont: {
    // 预览：CSS 字体栈单源（.a4-footer），主字体＝--page-number-font（config 注入，默认宋体）
    preview: { mechanism: 'css-stack', primary: PAGE_NUMBER_FONT },
    // 导出：四槽字体，来源 config.specialOptions.pageNumberFont（默认 '宋体'——现状四槽全宋体）
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
