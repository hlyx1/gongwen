import { describe, it, expect } from 'vitest'
import type { IRunOptions } from 'docx'
import {
  getRunStyle,
  getAttachmentRunStyle,
  getAttachmentPunctuationRunStyle,
  getHeading3PunctuationRunStyle,
  getTimeColonRunStyle,
} from '../../exporter/styleFactory'
import { DEFAULT_CONFIG } from '../../types/documentConfig'
import type { DocumentConfig } from '../../types/documentConfig'
import { NodeType } from '../../types/ast'
import { bodyPunctSpec, nodeFontRole, roleSpec } from '../fonts'

/**
 * 决策层字体角色规格与 styleFactory 现状对照（工作单元-3 交付物）
 *
 * roleSpec / bodyPunctSpec 的字体四槽、字号、字符间距须与
 * styleFactory.getRunStyle 系列（导出侧唯一既有实现）逐字段一致。
 * 基线锚点见 exporter/__tests__/styleFactory.test.ts。
 */

/** 深拷贝默认配置后打补丁（测试专用，避免污染共享对象） */
function configWith(patch: (c: DocumentConfig) => void): DocumentConfig {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DocumentConfig
  patch(cloned)
  return cloned
}

/** 决策层规格与 styleFactory run 样式逐字段对照 */
function expectSpecMatches(style: Partial<IRunOptions>, role: ReturnType<typeof roleSpec>) {
  expect(role.font).toEqual(style.font)
  expect(role.sizeHalfPt).toBe(style.size)
  expect(role.characterSpacingTwips).toBe(style.characterSpacing)
}

// ---- 节点类型 → 角色映射 ----

describe('nodeFontRole 节点角色映射', () => {
  it('各节点类型映射到预期角色（heading4 现状落入 body 分支）', () => {
    expect(nodeFontRole(NodeType.DOCUMENT_TITLE)).toBe('title')
    expect(nodeFontRole(NodeType.HEADING_1)).toBe('heading1')
    expect(nodeFontRole(NodeType.HEADING_2)).toBe('heading2')
    expect(nodeFontRole(NodeType.HEADING_3)).toBe('heading3')
    expect(nodeFontRole(NodeType.HEADING_4)).toBe('body')
    expect(nodeFontRole(NodeType.PARAGRAPH)).toBe('body')
    expect(nodeFontRole(NodeType.ADDRESSEE)).toBe('addressee')
    expect(nodeFontRole(NodeType.SIGNATURE)).toBe('body')
    expect(nodeFontRole(NodeType.DATE)).toBe('body')
    expect(nodeFontRole(NodeType.REMARK)).toBe('body')
  })
})

// ---- 角色规格与 getRunStyle 对照 ----

describe('roleSpec 与 styleFactory.getRunStyle 逐字段对照', () => {
  it('title：方正小标宋 44 half-point，无字符间距（不参与 28 字微调）', () => {
    const spec = roleSpec('title', DEFAULT_CONFIG)
    expectSpecMatches(getRunStyle(NodeType.DOCUMENT_TITLE, DEFAULT_CONFIG), spec)
    expect(spec.font.eastAsia).toBe('方正小标宋_GBK')
    expect(spec.characterSpacingTwips).toBeUndefined()
  })

  it('heading1：读 config.advanced.h1（黑体 + Times New Roman，32）', () => {
    const spec = roleSpec('heading1', DEFAULT_CONFIG)
    expectSpecMatches(getRunStyle(NodeType.HEADING_1, DEFAULT_CONFIG), spec)
    expect(spec.font.eastAsia).toBe('黑体')
    expect(spec.font.hAnsi).toBe('黑体')
    expect(spec.characterSpacingTwips).toBe(-5)
  })

  it('heading2：读 config.advanced.h2（楷体_GB2312，32）', () => {
    const spec = roleSpec('heading2', DEFAULT_CONFIG)
    expectSpecMatches(getRunStyle(NodeType.HEADING_2, DEFAULT_CONFIG), spec)
    expect(spec.font.eastAsia).toBe('楷体_GB2312')
  })

  it('heading3：读 config.advanced.h3（仿宋_GB2312，32）', () => {
    const spec = roleSpec('heading3', DEFAULT_CONFIG)
    expectSpecMatches(getRunStyle(NodeType.HEADING_3, DEFAULT_CONFIG), spec)
    expect(spec.font.eastAsia).toBe('仿宋_GB2312')
  })

  it('addressee：读 config.advanced.addressee（仿宋 + Times New Roman，32）', () => {
    const spec = roleSpec('addressee', DEFAULT_CONFIG)
    expectSpecMatches(getRunStyle(NodeType.ADDRESSEE, DEFAULT_CONFIG), spec)
    expect(spec.font.ascii).toBe('Times New Roman')
  })

  it('body：仿宋_GB2312 四槽口径（ascii/cs = Times New Roman），32，charSpacing −5', () => {
    const spec = roleSpec('body', DEFAULT_CONFIG)
    expectSpecMatches(getRunStyle(NodeType.PARAGRAPH, DEFAULT_CONFIG), spec)
    expect(spec.font).toEqual({
      ascii: 'Times New Roman',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: 'Times New Roman',
    })
  })

  it('改 config.headings.h1 不影响决策层字体（双轨现状：真值在 advanced）', () => {
    const config = configWith((c) => {
      c.headings.h1.fontFamily = '宋体'
      c.headings.h1.fontSize = 22
    })
    const spec = roleSpec('heading1', config)
    expectSpecMatches(getRunStyle(NodeType.HEADING_1, config), spec)
    expect(spec.font.eastAsia).toBe('黑体')
    expect(spec.sizeHalfPt).toBe(32)
  })

  it('advanced.h1.asciiFontFamily 为空串时回退中文字体（「跟随中文字体」选项）', () => {
    const config = configWith((c) => {
      c.advanced.h1.asciiFontFamily = ''
    })
    const spec = roleSpec('heading1', config)
    expectSpecMatches(getRunStyle(NodeType.HEADING_1, config), spec)
    expect(spec.font.ascii).toBe('黑体')
  })

  it('边距变化时角色规格的 charSpacing 同步（8844→9070：−5→3）', () => {
    const config = configWith((c) => {
      c.margins.left = 2.5
      c.margins.right = 2.5
    })
    expectSpecMatches(getRunStyle(NodeType.PARAGRAPH, config), roleSpec('body', config))
    expect(roleSpec('body', config).characterSpacingTwips).toBe(3)
  })
})

// ---- 标点规格与导出侧三个专用样式函数对照 ----

describe('bodyPunctSpec 与导出侧标点样式函数对照', () => {
  it('字号跟随宿主（32）：与 getTimeColonRunStyle 一致', () => {
    const spec = bodyPunctSpec(DEFAULT_CONFIG, 32)
    const style = getTimeColonRunStyle(DEFAULT_CONFIG, 32)
    expect(spec.font).toEqual(style.font)
    expect(spec.sizeHalfPt).toBe(style.size)
    expect(spec.characterSpacingTwips).toBe(style.characterSpacing)
    // 四槽全正文字体
    expect(spec.font).toEqual({
      ascii: '仿宋_GB2312',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: '仿宋_GB2312',
    })
  })

  it('字号跟随宿主（44，标题内时间冒号）：与 getTimeColonRunStyle(config, 44) 一致', () => {
    const spec = bodyPunctSpec(DEFAULT_CONFIG, 44)
    const style = getTimeColonRunStyle(DEFAULT_CONFIG, 44)
    expect(spec.sizeHalfPt).toBe(44)
    expect(spec.font).toEqual(style.font)
  })

  it('三级标题句点规格（字号 32 跟随三级标题）：与 getHeading3PunctuationRunStyle 一致', () => {
    const h3Size = roleSpec('heading3', DEFAULT_CONFIG).sizeHalfPt
    const spec = bodyPunctSpec(DEFAULT_CONFIG, h3Size)
    const style = getHeading3PunctuationRunStyle(DEFAULT_CONFIG)
    expect(spec.font).toEqual(style.font)
    expect(spec.sizeHalfPt).toBe(style.size)
    expect(spec.characterSpacingTwips).toBe(style.characterSpacing)
  })

  it('附件句点规格（字号 32 跟随正文）：与 getAttachmentPunctuationRunStyle 一致', () => {
    const bodySize = roleSpec('body', DEFAULT_CONFIG).sizeHalfPt
    const spec = bodyPunctSpec(DEFAULT_CONFIG, bodySize)
    const style = getAttachmentPunctuationRunStyle(DEFAULT_CONFIG)
    expect(spec.font).toEqual(style.font)
    expect(spec.sizeHalfPt).toBe(style.size)
    expect(spec.characterSpacingTwips).toBe(style.characterSpacing)
  })

  it('附件文本规格与 getAttachmentRunStyle 同口径（body 角色 + charSpacing −5）', () => {
    const style = getAttachmentRunStyle(DEFAULT_CONFIG)
    const spec = roleSpec('body', DEFAULT_CONFIG)
    expect(spec.font).toEqual(style.font)
    expect(spec.sizeHalfPt).toBe(style.size)
    expect(spec.characterSpacingTwips).toBe(style.characterSpacing)
  })
})
