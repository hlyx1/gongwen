/**
 * 度量与缩进决策（单源）
 *
 * 收编原三份平行实现（勘探 §3.1-3.4）：
 * - styleFactory.calculateCharWidth / calculateTextWidth / calculateSignatureIndent（twip 版）
 * - A4Page.calculateTextWidthEm / calculateSignatureIndentEm（em 版）
 * - Preview.tsx 内联 px 版字符间距
 *
 * 统一口径：决策层输出 twips；预览侧换算 em = twips / charWidthTwips。
 * 单元2 基线（exporter/__tests__/styleFactory.test.ts）已锁定数值：
 * 默认配置下 charSpacing = −5、charWidth = 315、首行缩进 = 630。
 */
import type { DocumentConfig } from '../types/documentConfig'
import { cmToTwip, CHARS_PER_LINE } from '../types/documentConfig'
import { A4_WIDTH_TWIPS, ASCII_CHAR_WIDTH_RATIO, CJK_CHAR_WIDTH_RATIO, DATE_INDENT_CHARS_NO_STAMP, DATE_INDENT_CHARS_STAMPED } from './constants'

/** 版心可用宽度（twips）：A4 宽 − 左右边距 */
export function availableWidthTwips(config: DocumentConfig): number {
  return A4_WIDTH_TWIPS - cmToTwip(config.margins.left) - cmToTwip(config.margins.right)
}

/**
 * 字符间距（twips）：floor(版心宽 / 28 − 正文字号 × 20)
 * 向下取整确保每行不超过 28 字（GB/T 9704），与 styleFactory 现状一致
 */
export function charSpacingTwips(config: DocumentConfig): number {
  return Math.floor(
    availableWidthTwips(config) / CHARS_PER_LINE - config.body.fontSize * 20
  )
}

/** 单字符宽度（twips）：正文字号 × 20 + 字符间距 */
export function charWidthTwips(config: DocumentConfig): number {
  return config.body.fontSize * 20 + charSpacingTwips(config)
}

/** 正文首行缩进（twips）：缩进字符数 × 字符宽度 */
export function firstLineIndentTwips(config: DocumentConfig): number {
  return charWidthTwips(config) * config.body.firstLineIndent
}

/**
 * 计算文本的实际宽度（twips）
 * - 中文字符（CJK 统一汉字 + 兼容区）：宽度 = 1 个汉字宽度
 * - 其他字符（数字、字母等）：约为汉字的 0.69 倍
 * 注意：「〇」(U+3007) 不在 CJK 判定范围，按窄字符计宽（现状特征，两版一致）
 */
export function textWidthTwips(text: string, charWidth: number): number {
  let width = 0
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      width += charWidth * CJK_CHAR_WIDTH_RATIO
    } else {
      width += charWidth * ASCII_CHAR_WIDTH_RATIO
    }
  }
  return width
}

/** 文本宽度（em 单位，预览侧口径）：以汉字宽为 1 */
export function textWidthEm(text: string): number {
  let width = 0
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      width += CJK_CHAR_WIDTH_RATIO
    } else {
      width += ASCII_CHAR_WIDTH_RATIO
    }
  }
  return width
}

/**
 * 发文机关署名右缩进（twips）
 * 公式：基础右空字数 + (成文日期宽度 − 署名宽度) / 2，下限 0
 * - 有印章：基础右空四字；无印章：右空二字
 * 与 styleFactory.calculateSignatureIndent（导出侧）数值等价；
 * 预览侧 em 值 = 返回值 / charWidthTwips(config)（单元2 基线已证等价）
 */
export function signatureRightIndentTwips(
  signatureContent: string,
  dateContent: string,
  config: DocumentConfig
): number {
  const charWidth = charWidthTwips(config)
  const baseChars = config.specialOptions.hasStamp
    ? DATE_INDENT_CHARS_STAMPED
    : DATE_INDENT_CHARS_NO_STAMP
  const baseIndent = baseChars * charWidth
  const signatureWidth = textWidthTwips(signatureContent, charWidth)
  const dateWidth = textWidthTwips(dateContent, charWidth)
  const centerOffset = (dateWidth - signatureWidth) / 2
  return Math.max(0, baseIndent + centerOffset)
}

/**
 * 发文机关署名右缩进（em 单位，预览侧现状等价口径）
 * 与 A4Page.calculateSignatureIndentEm 数值一致
 */
export function signatureRightIndentEm(
  signatureContent: string,
  dateContent: string,
  hasStamp: boolean
): number {
  const baseChars = hasStamp ? DATE_INDENT_CHARS_STAMPED : DATE_INDENT_CHARS_NO_STAMP
  const baseIndent = baseChars
  const signatureWidth = textWidthEm(signatureContent)
  const dateWidth = textWidthEm(dateContent)
  const centerOffset = (dateWidth - signatureWidth) / 2
  return Math.max(0, baseIndent + centerOffset)
}

/** 成文日期右缩进（twips）：不加盖印章右空二字，加盖印章右空四字 */
export function dateRightIndentTwips(config: DocumentConfig): number {
  const chars = config.specialOptions.hasStamp
    ? DATE_INDENT_CHARS_STAMPED
    : DATE_INDENT_CHARS_NO_STAMP
  return chars * charWidthTwips(config)
}

/** twips → em 换算（预览侧消费缩进决策的入口） */
export function twipsToEm(twips: number, charWidth: number): number {
  return twips / charWidth
}
