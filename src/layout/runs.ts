/**
 * 字体角色分段 runs 决策
 *
 * 收编原导出/预览两侧各自实现的拆分逻辑（勘探 §3.1/§3.3）：
 * - 标题首句拆分（一至四级标题「。」前用标题字体、其后用正文）——两侧现状一致
 * - 时间冒号拆分（导出侧现状；预览侧现状无此机制，统一真值取导出侧行为，
 *   接线影响由后续单元验收裁定）
 * - 三级标题序号句点拆分——受待办-0001/0004 偏差开关控制（默认＝各自现状）
 * - 附件序号句点拆分（多附件模式，两侧现状一致）
 */
import type { LayoutRun } from './types'
import { makeRun, type RoleSpec } from './fonts'
import type { Heading3DotFontBehavior, Heading3FullwidthDotBehavior } from './deviations'

/** 时间格式正则：半角冒号分隔的时分（如 3:00、14:30）——与导出侧现状一致 */
const TIME_COLON_PATTERN = /(\d{1,2})(:)(\d{2})/g

/**
 * 时间冒号分段：时间中的半角冒号使用正文字体四槽
 * 例："会议时间：9:00-11:30" → [前文, '9', ':'(标点), '00', '-11', ':'(标点), '30']
 * 切分边界与导出侧 splitTimeColonText 逐字符一致（含相邻同规格 run 不合并）
 */
export function splitTimeColonRuns(
  text: string,
  baseSpec: RoleSpec,
  colonSpec: RoleSpec
): LayoutRun[] {
  const runs: LayoutRun[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // 重置全局正则的 lastIndex（正则对象跨调用复用，与导出侧现状同法）
  TIME_COLON_PATTERN.lastIndex = 0

  while ((match = TIME_COLON_PATTERN.exec(text)) !== null) {
    const matchStart = match.index
    const matchEnd = matchStart + match[0].length

    if (matchStart > lastIndex) {
      runs.push(makeRun(baseSpec, text.slice(lastIndex, matchStart)))
    }
    runs.push(makeRun(baseSpec, match[1]))
    runs.push(makeRun(colonSpec, match[2]))
    runs.push(makeRun(baseSpec, match[3]))
    lastIndex = matchEnd
  }

  if (lastIndex < text.length) {
    runs.push(makeRun(baseSpec, text.slice(lastIndex)))
  }

  // 无任何匹配时返回整段单 run
  if (runs.length === 0) {
    runs.push(makeRun(baseSpec, text))
  }

  return runs
}

/**
 * 标题首句分段：首句（到第一个「。」含）用标题字体，其余用正文字体
 * 适用于一至四级标题；剩余部分不做时间冒号拆分（导出侧现状）
 */
export function splitHeadingSentenceRuns(
  content: string,
  headingSpec: RoleSpec,
  bodySpec: RoleSpec
): LayoutRun[] {
  const idx = content.indexOf('。')
  if (idx === -1 || idx === content.length - 1) {
    return [makeRun(headingSpec, content)]
  }
  return [
    makeRun(headingSpec, content.slice(0, idx + 1)),
    makeRun(bodySpec, content.slice(idx + 1)),
  ]
}

/** 三级标题序号句点拆分选项（来自偏差开关） */
export interface Heading3SplitOptions {
  /** 待办-0001：句点字体（follow-heading3＝不拆分，预览侧现状） */
  dotFont: Heading3DotFontBehavior
  /** 待办-0004：全角句点是否参与拆分 */
  fullwidthDot: Heading3FullwidthDotBehavior
}

/**
 * 三级标题序号句点分段（受 0001/0004 开关控制）
 * - dotFont = 'follow-heading3'：不拆分，单 run（预览侧现状）
 * - dotFont = 'body-font' + 半角句点：拆为 [序号(标题体), '.'(正文字体), 内容(标题体)]
 * - dotFont = 'body-font' + 全角句点：fullwidthDot = 'no-split' 不拆（导出侧现状），
 *   'split' 则与半角同法拆分（修复目标）
 */
export function splitHeading3NumberDotRuns(
  text: string,
  h3Spec: RoleSpec,
  punctSpec: RoleSpec,
  options: Heading3SplitOptions
): LayoutRun[] {
  // 0001 预览侧现状：句点跟随三级标题字体，即不产生独立标点分段
  if (options.dotFont === 'follow-heading3') {
    return [makeRun(h3Spec, text)]
  }

  const pattern =
    options.fullwidthDot === 'split' ? /^(\d+)([.．])(.*)$/ : /^(\d+)(\.)(.*)$/
  const match = text.match(pattern)

  if (match) {
    const runs = [makeRun(h3Spec, match[1]), makeRun(punctSpec, match[2])]
    if (match[3]) {
      runs.push(makeRun(h3Spec, match[3]))
    }
    return runs
  }

  // 不匹配序号格式，整段单 run（导出侧现状）
  return [makeRun(h3Spec, text)]
}

/**
 * 三级标题完整分段：首句「。」拆分 + 序号句点拆分（开关控制）+ 剩余时间冒号拆分
 * 与导出侧 nodeToParagraph 的 HEADING_3 分支行为一致
 */
export function splitHeading3Runs(
  content: string,
  h3Spec: RoleSpec,
  h3DotPunctSpec: RoleSpec,
  bodySpec: RoleSpec,
  bodyColonSpec: RoleSpec,
  options: Heading3SplitOptions
): LayoutRun[] {
  const idx = content.indexOf('。')

  // 无中文句号或句号在末尾：只处理序号部分
  if (idx === -1 || idx === content.length - 1) {
    return splitHeading3NumberDotRuns(content, h3Spec, h3DotPunctSpec, options)
  }

  // 有中文句号：首句走序号句点拆分，剩余走时间冒号拆分
  const headingText = content.slice(0, idx + 1)
  const bodyText = content.slice(idx + 1)
  return [
    ...splitHeading3NumberDotRuns(headingText, h3Spec, h3DotPunctSpec, options),
    ...splitTimeColonRuns(bodyText, bodySpec, bodyColonSpec),
  ]
}

/**
 * 附件说明序号句点分段：英文句点使用正文字体四槽，其余跟随基础规格
 * 多附件模式使用（单附件不拆分——导出侧现状）
 * 逐字符扫描，文本中每个 '.' 都会独立成段（与导出侧 splitAttachmentText 一致）
 */
export function splitAttachmentRuns(
  text: string,
  baseSpec: RoleSpec,
  punctSpec: RoleSpec
): LayoutRun[] {
  const runs: LayoutRun[] = []
  let currentText = ''

  for (const char of text) {
    if (char === '.') {
      if (currentText) {
        runs.push(makeRun(baseSpec, currentText))
        currentText = ''
      }
      runs.push(makeRun(punctSpec, char))
    } else {
      currentText += char
    }
  }

  if (currentText) {
    runs.push(makeRun(baseSpec, currentText))
  }

  return runs
}
