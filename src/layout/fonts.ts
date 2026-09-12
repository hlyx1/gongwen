/**
 * 字体角色规格决策
 *
 * 收编 styleFactory.getRunStyle 系列的字体分配规则（勘探 §3.4），
 * 以「角色 → 规格」表驱动，渲染器无需重复决策。
 * 消费 config.headings（单元6 双轨合并后单一真值：h1/h2/h3/addressee
 * 每级中文字体/英数字体/字号——预览与导出同源）。
 */
import { NodeType, assertNever } from '../types/ast'
import type { DocumentConfig } from '../types/documentConfig'
import type { FontQuad, FontRole, LayoutRun } from './types'
import { charSpacingTwips } from './metrics'

/**
 * 构造字体四槽（与 styleFactory.font() 同口径）
 * - ascii：基本西文字符（默认 Times New Roman）
 * - eastAsia：东亚文字
 * - hAnsi：高 ANSI（省略号、破折号等中文标点）→ 使用中文字体
 * - cs：复杂文种 → 使用西文字体
 */
function fontQuad(eastAsia: string, ascii = 'Times New Roman'): FontQuad {
  return { ascii, eastAsia, hAnsi: eastAsia, cs: ascii }
}

/** 标点专用四槽：全部使用正文字体（半角标点不再落入西文字体） */
function bodyPunctQuad(config: DocumentConfig): FontQuad {
  const f = config.body.fontFamily
  return { ascii: f, eastAsia: f, hAnsi: f, cs: f }
}

/** 节点类型 → 主字体角色（与 styleFactory.getRunStyle 的 switch 口径一致） */
export function nodeFontRole(type: NodeType): FontRole {
  switch (type) {
    case NodeType.DOCUMENT_TITLE:
      return 'title'
    case NodeType.HEADING_1:
      return 'heading1'
    case NodeType.HEADING_2:
      return 'heading2'
    case NodeType.HEADING_3:
      return 'heading3'
    case NodeType.ADDRESSEE:
      return 'addressee'
    // 四级标题/附件/表格现状返回正文字体（与正文同字体）
    case NodeType.HEADING_4:
    case NodeType.PARAGRAPH:
    case NodeType.SIGNATURE:
    case NodeType.DATE:
    case NodeType.REMARK:
    case NodeType.ATTACHMENT:
    case NodeType.TABLE:
      return 'body'
    default:
      // 穷尽断言（待办-0029）：新增 NodeType 成员未补分支时 tsc 报错
      assertNever(type)
      return 'body'
  }
}

/** 角色规格（不含 run 文本，供分段决策拼装） */
export interface RoleSpec {
  role: FontRole
  font: FontQuad
  sizeHalfPt: number
  characterSpacingTwips?: number
}

/**
 * 角色 → 规格表（与 styleFactory.getRunStyle 数值一致）
 * 注意：公文标题不参与 28 字微调（无 characterSpacing）——现状
 */
export function roleSpec(role: FontRole, config: DocumentConfig): RoleSpec {
  const charSpacing = charSpacingTwips(config)
  switch (role) {
    case 'title':
      return {
        role,
        font: fontQuad(config.title.fontFamily),
        sizeHalfPt: config.title.fontSize * 2,
      }
    case 'heading1':
      return {
        role,
        font: fontQuad(
          config.headings.h1.fontFamily,
          config.headings.h1.asciiFontFamily || config.headings.h1.fontFamily
        ),
        sizeHalfPt: config.headings.h1.fontSize * 2,
        characterSpacingTwips: charSpacing,
      }
    case 'heading2':
      return {
        role,
        font: fontQuad(
          config.headings.h2.fontFamily,
          config.headings.h2.asciiFontFamily || config.headings.h2.fontFamily
        ),
        sizeHalfPt: config.headings.h2.fontSize * 2,
        characterSpacingTwips: charSpacing,
      }
    case 'heading3':
      return {
        role,
        font: fontQuad(
          config.headings.h3.fontFamily,
          config.headings.h3.asciiFontFamily || config.headings.h3.fontFamily
        ),
        sizeHalfPt: config.headings.h3.fontSize * 2,
        characterSpacingTwips: charSpacing,
      }
    case 'addressee':
      return {
        role,
        font: fontQuad(
          config.headings.addressee.fontFamily,
          config.headings.addressee.asciiFontFamily || config.headings.addressee.fontFamily
        ),
        sizeHalfPt: config.headings.addressee.fontSize * 2,
        characterSpacingTwips: charSpacing,
      }
    default:
      // body / heading4 / bodyPunct 外的兜底：正文字体
      return {
        role,
        font: fontQuad(config.body.fontFamily),
        sizeHalfPt: config.body.fontSize * 2,
        characterSpacingTwips: charSpacing,
      }
  }
}

/**
 * 标点专用规格（时间冒号/三级标题句点/附件句点共用）
 * 字号随宿主 run（导出侧现状：getTimeColonRunStyle(config, size) 的 size 参数口径）；
 * 三级标题句点跟随三级标题字号、附件句点与时间冒号跟随宿主字号
 */
export function bodyPunctSpec(config: DocumentConfig, sizeHalfPt: number): RoleSpec {
  return {
    role: 'bodyPunct',
    font: bodyPunctQuad(config),
    sizeHalfPt,
    characterSpacingTwips: charSpacingTwips(config),
  }
}

/** 由规格与文本构造 run */
export function makeRun(spec: RoleSpec, text: string): LayoutRun {
  const run: LayoutRun = {
    text,
    role: spec.role,
    font: spec.font,
    sizeHalfPt: spec.sizeHalfPt,
  }
  if (spec.characterSpacingTwips !== undefined) {
    run.characterSpacingTwips = spec.characterSpacingTwips
  }
  return run
}
