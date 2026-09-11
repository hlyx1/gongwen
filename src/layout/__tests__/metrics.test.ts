import { describe, it, expect } from 'vitest'
import {
  calculateCharWidth,
  calculateTextWidth,
  calculateSignatureIndent,
} from '../../exporter/styleFactory'
import {
  calculateSignatureIndentEm,
  calculateTextWidthEm,
} from '../../components/Preview/A4Page'
import { DEFAULT_CONFIG } from '../../types/documentConfig'
import type { DocumentConfig } from '../../types/documentConfig'
import {
  availableWidthTwips,
  charSpacingTwips,
  charWidthTwips,
  dateRightIndentTwips,
  firstLineIndentTwips,
  signatureRightIndentEm,
  signatureRightIndentTwips,
  textWidthEm,
  textWidthTwips,
  twipsToEm,
} from '../metrics'

/**
 * 决策层度量决策与单元2 等价性基线的对照（工作单元-3 交付物）
 *
 * 基线来源：exporter/__tests__/styleFactory.test.ts
 * 默认配置手算锚点：可用宽度 8844、charSpacing = −5、charWidth = 315、
 * 首行缩进 = 630、正文行距 = 592 twips。
 * 决策层统一实现须与 styleFactory（twip 版）/ A4Page（em 版）现状逐值一致；
 * 有意改变行为须新裁定并同步更新基线。
 */

/** 深拷贝默认配置后打补丁（测试专用，避免污染共享对象） */
function configWith(patch: (c: DocumentConfig) => void): DocumentConfig {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DocumentConfig
  patch(cloned)
  return cloned
}

// ---- charSpacing / charWidth（与 styleFactory 公式对照） ----

describe('决策层 charSpacing / charWidth（单元2 基线对照）', () => {
  it('默认配置：可用宽度 8844、charSpacing = −5、charWidth = 315', () => {
    expect(availableWidthTwips(DEFAULT_CONFIG)).toBe(8844)
    expect(charSpacingTwips(DEFAULT_CONFIG)).toBe(-5)
    expect(charWidthTwips(DEFAULT_CONFIG)).toBe(315)
  })

  it('与 styleFactory.calculateCharWidth / getRunStyle 的 characterSpacing 同值', () => {
    expect(charWidthTwips(DEFAULT_CONFIG)).toBe(calculateCharWidth(DEFAULT_CONFIG))
    expect(charSpacingTwips(DEFAULT_CONFIG)).toBe(-5)
  })

  it('边距变化响应：左右各 2.5cm → charSpacing = 3、charWidth = 323', () => {
    const config = configWith((c) => {
      c.margins.left = 2.5
      c.margins.right = 2.5
    })
    expect(availableWidthTwips(config)).toBe(9070)
    expect(charSpacingTwips(config)).toBe(3)
    expect(charWidthTwips(config)).toBe(323)
    expect(charWidthTwips(config)).toBe(calculateCharWidth(config))
  })

  it('首行缩进 = 缩进字符数 × 字符宽度（默认 2 × 315 = 630）', () => {
    expect(firstLineIndentTwips(DEFAULT_CONFIG)).toBe(630)
  })
})

// ---- 文本宽度计量（twip 版 / em 版与既有两份实现对照） ----

describe('决策层文本宽度计量（双实现对照）', () => {
  it('twip 版与 styleFactory.calculateTextWidth 同值', () => {
    expect(textWidthTwips('某某市人民政府', 315)).toBe(
      calculateTextWidth('某某市人民政府', 315)
    )
    expect(textWidthTwips('2026年9月11日', 315)).toBeCloseTo(
      calculateTextWidth('2026年9月11日', 315),
      9
    )
    expect(textWidthTwips('某某市人民政府', 315)).toBe(2205)
    expect(textWidthTwips('2026', 315)).toBeCloseTo(869.4, 9)
  })

  it('em 版与 A4Page.calculateTextWidthEm 同值', () => {
    expect(textWidthEm('某某市人民政府')).toBe(calculateTextWidthEm('某某市人民政府'))
    expect(textWidthEm('2026年9月11日')).toBeCloseTo(
      calculateTextWidthEm('2026年9月11日'),
      9
    )
  })

  it('〇（U+3007）按 0.69 窄字符计宽（现状特征，两版一致）', () => {
    expect(textWidthEm('〇')).toBeCloseTo(0.69, 9)
    expect(textWidthTwips('〇', 315)).toBeCloseTo(calculateTextWidth('〇', 315), 9)
  })
})

// ---- 签名缩进 twip 版（与 styleFactory.calculateSignatureIndent 全用例对照） ----

describe('决策层签名缩进 twip 版（与导出侧现状对照）', () => {
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
      it(`${sig} × ${date}（印章=${hasStamp}）：与 calculateSignatureIndent 逐值一致`, () => {
        const config = hasStamp
          ? configWith((c) => {
              c.specialOptions.hasStamp = true
            })
          : DEFAULT_CONFIG
        expect(signatureRightIndentTwips(sig, date, config)).toBe(
          calculateSignatureIndent(sig, date, config)
        )
      })
    }
  }

  it('已知锚点：日期长于署名（10 字 × 5 字）= 1417.5', () => {
    expect(
      signatureRightIndentTwips('某某市政府', '二零二六年九月十一日', DEFAULT_CONFIG)
    ).toBe(1417.5)
  })

  it('已知锚点：有印章（10 字 × 5 字）= 2047.5', () => {
    const stamped = configWith((c) => {
      c.specialOptions.hasStamp = true
    })
    expect(
      signatureRightIndentTwips('某某市政府', '二零二六年九月十一日', stamped)
    ).toBe(2047.5)
  })

  it('已知锚点：署名显著长于日期 → 钳制为 0', () => {
    expect(
      signatureRightIndentTwips(
        '某某市人民政府办公室政务公开与法治建设科',
        '二零二六年九月十一日',
        DEFAULT_CONFIG
      )
    ).toBe(0)
  })
})

// ---- 签名缩进 em 版（与 A4Page.calculateSignatureIndentEm 对照） ----

describe('决策层签名缩进 em 版（与预览侧现状对照）', () => {
  const cases: { sig: string; date: string }[] = [
    { sig: '某某市人民政府办公厅', date: '二零二六年九月十一日' },
    { sig: '某某市政府', date: '二零二六年九月十一日' },
    { sig: '某某市人民政府办公室', date: '二零二六年九月一日' },
    { sig: '某某市人民政府办公室政务公开与法治建设科', date: '二零二六年九月十一日' },
    { sig: '某某市人民政府办公室', date: '二〇二六年九月十一日' },
  ]

  for (const { sig, date } of cases) {
    for (const hasStamp of [false, true]) {
      it(`${sig} × ${date}（印章=${hasStamp}）：与 calculateSignatureIndentEm 逐值一致`, () => {
        expect(signatureRightIndentEm(sig, date, hasStamp)).toBe(
          calculateSignatureIndentEm(sig, date, hasStamp)
        )
      })
    }
  }
})

// ---- twip / em 双轨换算等价（单元2 基线复刻） ----

describe('决策层 twipsToEm 换算（twip = em × 315）', () => {
  const CHAR_WIDTH = 315

  const cases: { sig: string; date: string }[] = [
    { sig: '某某市人民政府办公厅', date: '二零二六年九月十一日' },
    { sig: '某某市政府', date: '二零二六年九月十一日' },
    { sig: '某某市人民政府办公室', date: '二〇二六年九月十一日' },
    { sig: 'AB局', date: '2026年9月11日' },
  ]

  for (const { sig, date } of cases) {
    for (const hasStamp of [false, true]) {
      it(`${sig} × ${date}（印章=${hasStamp}）：twip 缩进 / charWidth ≈ em 缩进`, () => {
        const config = hasStamp
          ? configWith((c) => {
              c.specialOptions.hasStamp = true
            })
          : DEFAULT_CONFIG
        const twip = signatureRightIndentTwips(sig, date, config)
        expect(twipsToEm(twip, CHAR_WIDTH)).toBeCloseTo(
          signatureRightIndentEm(sig, date, hasStamp),
          9
        )
      })
    }
  }
})

// ---- 成文日期右缩进 ----

describe('决策层成文日期右缩进', () => {
  it('无印章空二字（630）、有印章空四字（1260）', () => {
    expect(dateRightIndentTwips(DEFAULT_CONFIG)).toBe(630)
    const stamped = configWith((c) => {
      c.specialOptions.hasStamp = true
    })
    expect(dateRightIndentTwips(stamped)).toBe(1260)
  })
})
