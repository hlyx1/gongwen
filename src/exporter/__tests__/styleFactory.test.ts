import { describe, it, expect } from 'vitest'
import type { IRunOptions, IFontAttributesProperties } from 'docx'
import {
  getParagraphStyle,
  getRunStyle,
  getAttachmentParagraphStyle,
  getAttachmentRunStyle,
  getAttachmentPunctuationRunStyle,
  getHeading3PunctuationRunStyle,
  getTimeColonRunStyle,
  calculateCharWidth,
  calculateTextWidth,
  calculateSignatureIndent,
} from '../styleFactory'
import { calculateSignatureIndentEm, calculateTextWidthEm } from '../../components/Preview/A4Page'
import { DEFAULT_CONFIG } from '../../types/documentConfig'
import type { DocumentConfig } from '../../types/documentConfig'
import { NodeType } from '../../types/ast'

/**
 * styleFactory / A4Page 纯函数行为记录（task-0001 条款1c）
 *
 * 【单元3 等价性对照基线】
 * 签名缩进现有两份独立实现：
 *   - twip 版：styleFactory.calculateSignatureIndent（导出侧）
 *   - em 版：A4Page.calculateSignatureIndentEm（预览侧）
 * charSpacing 公式现状：floor((11906 − 左右边距 twips) / 28 − 正文字号×20)，
 * 在 styleFactory 内多处复制、Preview.tsx 另有 px 版。
 * 单元3 建立排版决策层后，统一实现须与本文件锁定的数值一致；
 * 若决策层有意改变行为，须新裁定并同步更新本基线。
 *
 * 默认配置手算锚点（DEFAULT_CONFIG）：
 *   左边距 2.8cm=1588twips，右边距 2.6cm=1474twips
 *   可用宽度 = 11906 − 1588 − 1474 = 8844
 *   charSpacing = floor(8844/28 − 320) = −5
 *   字符宽度 charWidth = 16pt×20 + (−5) = 315 twips
 *   正文行距 = 29.6pt = 592 twips；首行缩进 = 2×315 = 630
 *
 * 宽度计量现状特征（两版一致，属锁定对象而非缺陷修复项）：
 *   CJK 判定正则 /[\u4e00-\u9fff\u3400-\u4dbf]/ 不含「〇」(U+3007)，
 *   故「二〇二六」中的〇按 0.69 窄字符计宽（1 个汉字=1，ASCII=0.69）。
 */

/** 读取 run 样式的字体属性（getRunStyle 系列恒经 font() 构造对象形式字体） */
function fontOf(style: Partial<IRunOptions>): IFontAttributesProperties {
  return style.font as IFontAttributesProperties
}

/** 深拷贝默认配置后打补丁（测试专用，避免污染共享对象） */
function configWith(patch: (c: DocumentConfig) => void): DocumentConfig {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DocumentConfig
  patch(cloned)
  return cloned
}

// ---- charSpacing 计算（单元3 等价性对照基线） ----

describe('charSpacing 计算', () => {
  it('默认配置：floor(8844/28 − 320) = −5（twips）', () => {
    expect(getRunStyle(NodeType.PARAGRAPH, DEFAULT_CONFIG).characterSpacing).toBe(-5)
  })

  it('正文字符宽度 = 字号×20 + charSpacing = 315 twips', () => {
    expect(calculateCharWidth(DEFAULT_CONFIG)).toBe(315)
  })

  it('各级标题/主送/正文/署名的 charSpacing 同值（−5）', () => {
    const types = [
      NodeType.HEADING_1,
      NodeType.HEADING_2,
      NodeType.HEADING_3,
      NodeType.HEADING_4,
      NodeType.ADDRESSEE,
      NodeType.PARAGRAPH,
      NodeType.SIGNATURE,
      NodeType.DATE,
      NodeType.REMARK,
    ]
    for (const type of types) {
      expect(getRunStyle(type, DEFAULT_CONFIG).characterSpacing).toBe(-5)
    }
  })

  it('公文标题无 characterSpacing（不参与 28 字微调）', () => {
    expect(getRunStyle(NodeType.DOCUMENT_TITLE, DEFAULT_CONFIG).characterSpacing).toBeUndefined()
  })

  it('边距变化响应：左右各 2.5cm → floor(9070/28 − 320) = 3', () => {
    const config = configWith((c) => {
      c.margins.left = 2.5
      c.margins.right = 2.5
    })
    expect(getRunStyle(NodeType.PARAGRAPH, config).characterSpacing).toBe(3)
    expect(calculateCharWidth(config)).toBe(323)
  })
})

// ---- getRunStyle 字体角色映射 ----

describe('getRunStyle 节点字体映射', () => {
  it('正文：eastAsia/hAnsi 仿宋_GB2312，ascii/cs Times New Roman，三号 32 half-point', () => {
    const style = getRunStyle(NodeType.PARAGRAPH, DEFAULT_CONFIG)
    expect(style.font).toEqual({
      ascii: 'Times New Roman',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: 'Times New Roman',
    })
    expect(style.size).toBe(32)
  })

  it('公文标题：方正小标宋_GBK，二号 44 half-point', () => {
    const style = getRunStyle(NodeType.DOCUMENT_TITLE, DEFAULT_CONFIG)
    expect(fontOf(style).eastAsia).toBe('方正小标宋_GBK')
    expect(style.size).toBe(44)
  })

  it('一/二/三级标题读 config.advanced（双轨证据：导出侧真值来源）', () => {
    expect(fontOf(getRunStyle(NodeType.HEADING_1, DEFAULT_CONFIG)).eastAsia).toBe('黑体')
    expect(fontOf(getRunStyle(NodeType.HEADING_2, DEFAULT_CONFIG)).eastAsia).toBe('楷体_GB2312')
    expect(fontOf(getRunStyle(NodeType.HEADING_3, DEFAULT_CONFIG)).eastAsia).toBe('仿宋_GB2312')
  })

  it('四级标题落入默认分支：正文字体仿宋_GB2312（现状）', () => {
    const style = getRunStyle(NodeType.HEADING_4, DEFAULT_CONFIG)
    expect(fontOf(style).eastAsia).toBe('仿宋_GB2312')
    expect(style.size).toBe(32)
  })

  it('主送机关读 config.advanced.addressee（仿宋 + Times New Roman）', () => {
    const style = getRunStyle(NodeType.ADDRESSEE, DEFAULT_CONFIG)
    expect(fontOf(style).eastAsia).toBe('仿宋_GB2312')
    expect(fontOf(style).ascii).toBe('Times New Roman')
  })

  it('改 config.headings.h1 不影响导出字体（双轨现状行为记录）', () => {
    const config = configWith((c) => {
      c.headings.h1.fontFamily = '宋体'
      c.headings.h1.fontSize = 22
    })
    const style = getRunStyle(NodeType.HEADING_1, config)
    expect(fontOf(style).eastAsia).toBe('黑体') // 仍取 advanced.h1
    expect(style.size).toBe(32)
  })

  it('改 config.advanced.h1 影响导出字体', () => {
    const config = configWith((c) => {
      c.advanced.h1.fontFamily = '宋体'
    })
    expect(fontOf(getRunStyle(NodeType.HEADING_1, config)).eastAsia).toBe('宋体')
  })

  it('advanced.h1.asciiFontFamily 为空串时回退中文字体（「跟随中文字体」选项）', () => {
    const config = configWith((c) => {
      c.advanced.h1.asciiFontFamily = ''
    })
    expect(fontOf(getRunStyle(NodeType.HEADING_1, config)).ascii).toBe('黑体')
  })
})

// ---- 特殊标点样式（时间冒号 / 三级标题句点 / 附件句点） ----

describe('特殊标点 run 样式', () => {
  it('时间冒号样式：四槽全正文字体，字号随调用方', () => {
    const style = getTimeColonRunStyle(DEFAULT_CONFIG, 44)
    expect(style.font).toEqual({
      ascii: '仿宋_GB2312',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: '仿宋_GB2312',
    })
    expect(style.size).toBe(44)
    expect(style.characterSpacing).toBe(-5)
  })

  it('三级标题句点样式：四槽全正文字体，字号跟随三级标题（32）', () => {
    const style = getHeading3PunctuationRunStyle(DEFAULT_CONFIG)
    expect(fontOf(style).ascii).toBe('仿宋_GB2312')
    expect(style.size).toBe(32)
  })

  it('附件句点样式：四槽全正文字体，字号跟随正文（32）', () => {
    const style = getAttachmentPunctuationRunStyle(DEFAULT_CONFIG)
    expect(fontOf(style).ascii).toBe('仿宋_GB2312')
    expect(style.size).toBe(32)
  })

  it('附件说明文本样式：数字英文 Times New Roman，中文仿宋', () => {
    const style = getAttachmentRunStyle(DEFAULT_CONFIG)
    expect(fontOf(style).ascii).toBe('Times New Roman')
    expect(fontOf(style).eastAsia).toBe('仿宋_GB2312')
    expect(style.characterSpacing).toBe(-5)
  })
})

// ---- getParagraphStyle 段落样式 ----

describe('getParagraphStyle 段落样式', () => {
  it('正文：两端对齐 + 首行缩进 630 twips + 固定行距 592', () => {
    const style = getParagraphStyle(NodeType.PARAGRAPH, DEFAULT_CONFIG)
    expect(style.alignment).toBe('both')
    expect(style.spacing).toEqual({ line: 592, lineRule: 'exact', before: 0, after: 0 })
    expect(style.indent).toEqual({ firstLine: 630, left: 0 })
  })

  it('公文标题：居中，行距取 title.lineSpacing（592）', () => {
    const style = getParagraphStyle(NodeType.DOCUMENT_TITLE, DEFAULT_CONFIG)
    expect(style.alignment).toBe('center')
    expect(style.spacing?.line).toBe(592)
    expect(style.indent).toBeUndefined()
  })

  it('主送机关：顶格（无首行缩进）两端对齐', () => {
    const style = getParagraphStyle(NodeType.ADDRESSEE, DEFAULT_CONFIG)
    expect(style.alignment).toBe('both')
    expect(style.indent?.left).toBe(0)
    expect(style.indent?.firstLine).toBeUndefined()
  })

  it('附件说明段落：左空二字（630）', () => {
    const style = getParagraphStyle(NodeType.ATTACHMENT, DEFAULT_CONFIG)
    expect(style.indent?.left).toBe(630)
  })

  it('成文日期：右对齐右缩进，无印章空二字（630）、有印章空四字（1260）', () => {
    expect(getParagraphStyle(NodeType.DATE, DEFAULT_CONFIG).indent?.right).toBe(630)
    const stamped = configWith((c) => {
      c.specialOptions.hasStamp = true
    })
    expect(getParagraphStyle(NodeType.DATE, stamped).indent?.right).toBe(1260)
  })

  it('署名（无日期上下文）：右缩进同日期基准（630/1260）', () => {
    expect(getParagraphStyle(NodeType.SIGNATURE, DEFAULT_CONFIG).indent?.right).toBe(630)
  })

  it('署名（有日期上下文）：右缩进取 calculateSignatureIndent 计算值', () => {
    // 署名 5 字 × 日期 10 字：630 + (10−5)/2×315 = 1417.5
    const style = getParagraphStyle(
      NodeType.SIGNATURE,
      DEFAULT_CONFIG,
      '某某市政府',
      '二零二六年九月十一日'
    )
    expect(style.indent?.right).toBe(1417.5)
  })

  it('备注：左对齐不缩进', () => {
    const style = getParagraphStyle(NodeType.REMARK, DEFAULT_CONFIG)
    expect(style.alignment).toBe('left')
    expect(style.indent?.left).toBe(0)
    expect(style.indent?.firstLine).toBeUndefined()
  })
})

// ---- 附件说明段落样式 ----

describe('getAttachmentParagraphStyle 附件段落样式', () => {
  it('单附件：左空 5 字（1575）悬挂 3 字（945），段前一行距（592）', () => {
    const style = getAttachmentParagraphStyle(false, false, DEFAULT_CONFIG)
    expect(style.indent).toEqual({ left: 1575, hanging: 945 })
    expect(style.spacing?.before).toBe(592)
    expect(style.spacing?.line).toBe(592)
  })

  it('多附件首行：与单附件同构（悬挂缩进对齐换行）', () => {
    const style = getAttachmentParagraphStyle(true, true, DEFAULT_CONFIG)
    expect(style.indent).toEqual({ left: 1575, hanging: 945 })
    expect(style.spacing?.before).toBe(592)
  })

  it('多附件后续行：仅左空 5 字，无悬挂无段前距', () => {
    const style = getAttachmentParagraphStyle(true, false, DEFAULT_CONFIG)
    expect(style.indent).toEqual({ left: 1575 })
    expect(style.spacing?.before).toBeUndefined()
  })
})

// ---- 文本宽度计量（twip 版 / em 版）【单元3 等价性对照基线】 ----

describe('文本宽度计量', () => {
  it('twip 版：中文字符 315/字', () => {
    expect(calculateTextWidth('某某市人民政府', 315)).toBe(2205)
  })

  it('twip 版：ASCII 字符 0.69×315/字', () => {
    expect(calculateTextWidth('2026', 315)).toBeCloseTo(869.4, 6)
    expect(calculateTextWidth('2026年9月11日', 315)).toBeCloseTo(2466.45, 6)
  })

  it('em 版：中文字符 1/字', () => {
    expect(calculateTextWidthEm('某某市人民政府')).toBe(7)
  })

  it('em 版：ASCII 字符 0.69/字', () => {
    expect(calculateTextWidthEm('2026')).toBeCloseTo(2.76, 9)
    expect(calculateTextWidthEm('2026年9月11日')).toBeCloseTo(7.83, 9)
  })

  it('〇（U+3007）不在 CJK 判定范围，按 0.69 窄字符计宽（现状，两版一致）', () => {
    expect(calculateTextWidthEm('〇')).toBeCloseTo(0.69, 9)
    expect(calculateTextWidthEm('二〇二六')).toBeCloseTo(3.69, 9)
    expect(calculateTextWidth('〇', 315)).toBeCloseTo(217.35, 6)
  })
})

// ---- 签名缩进 twip 版（styleFactory）【单元3 等价性对照基线】 ----

describe('签名缩进 twip 版（calculateSignatureIndent）', () => {
  it('署名与日期等宽（各 10 字）：右缩进即基准 630', () => {
    expect(
      calculateSignatureIndent('某某市人民政府办公厅', '二零二六年九月十一日', DEFAULT_CONFIG)
    ).toBe(630)
  })

  it('日期长于署名（10 字 × 5 字）：630 + 2.5×315 = 1417.5', () => {
    expect(
      calculateSignatureIndent('某某市政府', '二零二六年九月十一日', DEFAULT_CONFIG)
    ).toBe(1417.5)
  })

  it('有印章（10 字 × 5 字）：1260 + 787.5 = 2047.5', () => {
    const stamped = configWith((c) => {
      c.specialOptions.hasStamp = true
    })
    expect(
      calculateSignatureIndent('某某市政府', '二零二六年九月十一日', stamped)
    ).toBe(2047.5)
  })

  it('署名长于日期（10 字 × 9 字）：630 − 157.5 = 472.5（不钳制）', () => {
    expect(
      calculateSignatureIndent('某某市人民政府办公室', '二零二六年九月一日', DEFAULT_CONFIG)
    ).toBe(472.5)
  })

  it('署名显著长于日期（20 字 × 10 字）：负偏移钳制为 0', () => {
    expect(
      calculateSignatureIndent(
        '某某市人民政府办公室政务公开与法治建设科',
        '二零二六年九月十一日',
        DEFAULT_CONFIG
      )
    ).toBe(0)
  })

  it('含〇日期（〇 按 0.69 计）：630 + (3052.35−3150)/2 = 581.175', () => {
    expect(
      calculateSignatureIndent('某某市人民政府办公室', '二〇二六年九月十一日', DEFAULT_CONFIG)
    ).toBeCloseTo(581.175, 6)
  })

  it('混合字符：数字字母按 0.69 系数计宽（≈1488.375）', () => {
    expect(calculateSignatureIndent('AB局', '2026年9月11日', DEFAULT_CONFIG)).toBeCloseTo(
      1488.375,
      6
    )
  })
})

// ---- 签名缩进 em 版（A4Page）【单元3 等价性对照基线】 ----

describe('签名缩进 em 版（calculateSignatureIndentEm）', () => {
  it('署名与日期等宽（各 10 字）：右缩进即基准 2 / 4', () => {
    expect(
      calculateSignatureIndentEm('某某市人民政府办公厅', '二零二六年九月十一日', false)
    ).toBe(2)
    expect(
      calculateSignatureIndentEm('某某市人民政府办公厅', '二零二六年九月十一日', true)
    ).toBe(4)
  })

  it('日期长于署名（10 字 × 5 字）：2 + 2.5 = 4.5；有印章 6.5', () => {
    expect(calculateSignatureIndentEm('某某市政府', '二零二六年九月十一日', false)).toBe(4.5)
    expect(calculateSignatureIndentEm('某某市政府', '二零二六年九月十一日', true)).toBe(6.5)
  })

  it('署名长于日期（10 字 × 9 字）：2 − 0.5 = 1.5（不钳制）', () => {
    expect(
      calculateSignatureIndentEm('某某市人民政府办公室', '二零二六年九月一日', false)
    ).toBe(1.5)
  })

  it('署名显著长于日期（20 字 × 10 字）：负偏移钳制为 0', () => {
    expect(
      calculateSignatureIndentEm('某某市人民政府办公室政务公开与法治建设科', '二零二六年九月十一日', false)
    ).toBe(0)
  })

  it('含〇日期（〇 按 0.69 计）：2 − 0.155 = 1.845；有印章 3.845', () => {
    expect(
      calculateSignatureIndentEm('某某市人民政府办公室', '二〇二六年九月十一日', false)
    ).toBeCloseTo(1.845, 9)
    expect(
      calculateSignatureIndentEm('某某市人民政府办公室', '二〇二六年九月十一日', true)
    ).toBeCloseTo(3.845, 9)
  })
})

// ---- twip 版与 em 版等价性（单元3 决策层统一实现的验收基线） ----

describe('签名缩进 twip/em 双实现等价性（单元3 基线）', () => {
  const CHAR_WIDTH = 315 // 默认配置手算值，见文件头注释

  const cases: { sig: string; date: string }[] = [
    { sig: '某某市人民政府办公厅', date: '二零二六年九月十一日' },
    { sig: '某某市政府', date: '二零二六年九月十一日' },
    { sig: '某某市人民政府办公室', date: '二零二六年九月一日' },
    { sig: '某某市人民政府办公室政务公开与法治建设科', date: '二零二六年九月十一日' },
    { sig: '某某市人民政府办公室', date: '二〇二六年九月十一日' },
    { sig: 'AB局', date: '2026年9月11日' },
    { sig: 'X市发改', date: '2026年12月31日' },
  ]

  for (const { sig, date } of cases) {
    for (const hasStamp of [false, true]) {
      it(`${sig} × ${date}（印章=${hasStamp}）：twip = em × ${CHAR_WIDTH}`, () => {
        const config = hasStamp
          ? configWith((c) => {
              c.specialOptions.hasStamp = true
            })
          : DEFAULT_CONFIG
        const twip = calculateSignatureIndent(sig, date, config)
        const em = calculateSignatureIndentEm(sig, date, hasStamp)
        expect(twip / CHAR_WIDTH).toBeCloseTo(em, 9)
      })
    }
  }

  it('等价性前提：twip 版印章开关取 config.specialOptions.hasStamp，em 版为独立参数', () => {
    // 单元3 收敛时须统一两版的印章开关来源（本用例锁定两者当前数值口径一致）
    const stamped = configWith((c) => {
      c.specialOptions.hasStamp = true
    })
    const sig = '某某市人民政府办公室'
    const date = '二〇二六年九月十一日'
    expect(calculateSignatureIndent(sig, date, stamped)).toBeCloseTo(
      calculateSignatureIndentEm(sig, date, true) * CHAR_WIDTH,
      6
    )
  })
})
