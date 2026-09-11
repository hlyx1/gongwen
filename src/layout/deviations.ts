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

/** 四项偏差开关集合（每个开关按渲染器各持一槽） */
export interface DeviationSwitchSet {
  /** 待办-0001：三级标题序号后英文句点字体 */
  heading3DotFont: Record<RendererKind, Heading3DotFontBehavior>
  /** 待办-0004：三级标题全角句点拆分 */
  heading3FullwidthDot: Record<RendererKind, Heading3FullwidthDotBehavior>
  /** 待办-0002：页码纵向位置 */
  pageNumberVertical: Record<RendererKind, PageNumberVerticalLayout>
  /** 待办-0003：版头红色分隔线 */
  redSeparator: Record<RendererKind, RedSeparatorLayout>
}

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
