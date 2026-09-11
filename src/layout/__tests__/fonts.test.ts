import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '../../types/documentConfig'
import type { DocumentConfig } from '../../types/documentConfig'
import { NodeType } from '../../types/ast'
import { bodyPunctSpec, nodeFontRole, roleSpec } from '../fonts'

/**
 * 决策层字体角色规格测试（单元3 建立、单元4 迁移改写、单元6 双轨合并改写）
 *
 * 单元3 时本文件通过与 styleFactory.getRunStyle 系列逐字段对照验证等价；
 * 单元4 接线后 styleFactory 旧决策函数删除（其行为由
 * exporter/__tests__/docxBuilder.test.ts 的 13 条导出快照红线锁定），
 * 本文件改为直接锁定数值基线（数值与原对照基线一致）：
 *   - 正文 16pt=32 half-point，charSpacing=−5，四槽 ascii/cs=Times New Roman、
 *     hAnsi=中文字体
 *   - 一/二/三级标题与主送读 config.headings（单元6 后单一真值：
 *     预览与导出同源——原 advanced 轨道的默认值）
 *   - 公文标题 22pt=44 half-point，无字符间距
 */

/** 深拷贝默认配置后打补丁（测试专用，避免污染共享对象） */
function configWith(patch: (c: DocumentConfig) => void): DocumentConfig {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DocumentConfig
  patch(cloned)
  return cloned
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

// ---- 角色规格数值基线（原 styleFactory.getRunStyle 对照的迁移形式） ----

describe('roleSpec 角色规格数值基线', () => {
  it('title：方正小标宋 44 half-point，无字符间距（不参与 28 字微调）', () => {
    const spec = roleSpec('title', DEFAULT_CONFIG)
    expect(spec.font).toEqual({
      ascii: 'Times New Roman',
      eastAsia: '方正小标宋_GBK',
      hAnsi: '方正小标宋_GBK',
      cs: 'Times New Roman',
    })
    expect(spec.sizeHalfPt).toBe(44)
    expect(spec.characterSpacingTwips).toBeUndefined()
  })

  it('heading1：读 config.headings.h1（黑体 + Times New Roman，32）', () => {
    const spec = roleSpec('heading1', DEFAULT_CONFIG)
    expect(spec.font).toEqual({
      ascii: 'Times New Roman',
      eastAsia: '黑体',
      hAnsi: '黑体',
      cs: 'Times New Roman',
    })
    expect(spec.sizeHalfPt).toBe(32)
    expect(spec.characterSpacingTwips).toBe(-5)
  })

  it('heading2：读 config.headings.h2（楷体_GB2312，32）', () => {
    const spec = roleSpec('heading2', DEFAULT_CONFIG)
    expect(spec.font.eastAsia).toBe('楷体_GB2312')
    expect(spec.sizeHalfPt).toBe(32)
    expect(spec.characterSpacingTwips).toBe(-5)
  })

  it('heading3：读 config.headings.h3（仿宋_GB2312，32）', () => {
    const spec = roleSpec('heading3', DEFAULT_CONFIG)
    expect(spec.font.eastAsia).toBe('仿宋_GB2312')
    expect(spec.sizeHalfPt).toBe(32)
    expect(spec.characterSpacingTwips).toBe(-5)
  })

  it('addressee：读 config.headings.addressee（仿宋 + Times New Roman，32）', () => {
    const spec = roleSpec('addressee', DEFAULT_CONFIG)
    expect(spec.font.ascii).toBe('Times New Roman')
    expect(spec.font.eastAsia).toBe('仿宋_GB2312')
    expect(spec.sizeHalfPt).toBe(32)
  })

  it('body：仿宋_GB2312 四槽口径（ascii/cs = Times New Roman），32，charSpacing −5', () => {
    const spec = roleSpec('body', DEFAULT_CONFIG)
    expect(spec.font).toEqual({
      ascii: 'Times New Roman',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: 'Times New Roman',
    })
    expect(spec.sizeHalfPt).toBe(32)
    expect(spec.characterSpacingTwips).toBe(-5)
  })

  it('改 config.headings.h1 影响决策层字体（单元6 单一真值：预览与导出同源）', () => {
    const config = configWith((c) => {
      c.headings.h1.fontFamily = '宋体'
      c.headings.h1.fontSize = 22
    })
    const spec = roleSpec('heading1', config)
    expect(spec.font.eastAsia).toBe('宋体')
    expect(spec.sizeHalfPt).toBe(44)
  })

  it('headings.h1.asciiFontFamily 为空串时回退中文字体（「跟随中文字体」选项）', () => {
    const config = configWith((c) => {
      c.headings.h1.asciiFontFamily = ''
    })
    expect(roleSpec('heading1', config).font.ascii).toBe('黑体')
  })

  it('headings.h1.asciiFontFamily 显式指定时使用之', () => {
    const config = configWith((c) => {
      c.headings.h1.asciiFontFamily = 'Arial'
    })
    const spec = roleSpec('heading1', config)
    expect(spec.font.ascii).toBe('Arial')
    expect(spec.font.cs).toBe('Arial')
  })

  it('边距变化时角色规格的 charSpacing 同步（8844→9070：−5→3）', () => {
    const config = configWith((c) => {
      c.margins.left = 2.5
      c.margins.right = 2.5
    })
    expect(roleSpec('body', config).characterSpacingTwips).toBe(3)
  })
})

// ---- 标点规格（原与导出侧三个专用样式函数对照的迁移形式） ----

describe('bodyPunctSpec 标点规格数值基线', () => {
  it('字号跟随宿主（32）：四槽全正文字体', () => {
    const spec = bodyPunctSpec(DEFAULT_CONFIG, 32)
    expect(spec.font).toEqual({
      ascii: '仿宋_GB2312',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: '仿宋_GB2312',
    })
    expect(spec.sizeHalfPt).toBe(32)
    expect(spec.characterSpacingTwips).toBe(-5)
  })

  it('字号跟随宿主（44，标题内时间冒号）', () => {
    const spec = bodyPunctSpec(DEFAULT_CONFIG, 44)
    expect(spec.sizeHalfPt).toBe(44)
    expect(spec.font.eastAsia).toBe('仿宋_GB2312')
  })

  it('三级标题句点规格（字号 32 跟随三级标题）', () => {
    const h3Size = roleSpec('heading3', DEFAULT_CONFIG).sizeHalfPt
    const spec = bodyPunctSpec(DEFAULT_CONFIG, h3Size)
    expect(spec.sizeHalfPt).toBe(32)
    expect(spec.characterSpacingTwips).toBe(-5)
  })

  it('附件句点规格（字号 32 跟随正文）', () => {
    const bodySize = roleSpec('body', DEFAULT_CONFIG).sizeHalfPt
    const spec = bodyPunctSpec(DEFAULT_CONFIG, bodySize)
    expect(spec.sizeHalfPt).toBe(32)
    expect(spec.characterSpacingTwips).toBe(-5)
  })

  it('附件文本规格为 body 角色（Times New Roman + 仿宋，charSpacing −5）', () => {
    const spec = roleSpec('body', DEFAULT_CONFIG)
    expect(spec.font.ascii).toBe('Times New Roman')
    expect(spec.font.eastAsia).toBe('仿宋_GB2312')
    expect(spec.characterSpacingTwips).toBe(-5)
  })
})
