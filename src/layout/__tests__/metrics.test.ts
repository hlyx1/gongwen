import { describe, it, expect } from 'vitest'
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
 * 决策层度量决策测试（单元3 建立、单元4/5 迁移改写）
 *
 * 单元3 时本文件通过与 styleFactory（twip 版）/ A4Page（em 版）双实现对照验证等价；
 * 单元4 接线后 styleFactory 旧决策函数删除（其行为由 13 条导出快照红线锁定），
 * twip 版对照改为手算锚点直接锁定（数值与原对照基线一致）；
 * 单元5 预览接线后 A4Page 旧 em 函数删除（calculateTextWidthEm /
 * calculateSignatureIndentEm），em 版对照锚迁为下方测试内参考实现——
 * 公式逐字符拷贝自旧 A4Page.tsx，锁定决策层 em 口径不漂移
 * （预览署名右缩进经 LayoutIndent.rightEm 消费该口径）。
 *
 * 手算口径（DEFAULT_CONFIG）：可用宽度 8844、charSpacing=−5、charWidth=315、
 * 署名缩进 = (印章?4:2)×315 + (日期宽−署名宽)/2，下限 0；
 * 中文/〇 1×315、ASCII 0.69×315（task-0006：〇 补入全宽判定）。
 */

/**
 * 参考实现＝迁移前 A4Page.calculateTextWidthEm 公式（行为锚），
 * task-0006 起字符类独立补 \u3007（〇 按汉字全宽计）——刻意不 import
 * 主谓词：参考实现与主实现共用一份会使等价对照失去独立价值
 * （同一 bug 两处同步错则测试恒绿）。
 */
function referenceTextWidthEm(text: string): number {
  let width = 0
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf\u3007]/.test(char)) {
      width += 1
    } else {
      width += 0.69
    }
  }
  return width
}

/** 参考实现＝迁移前 A4Page.calculateSignatureIndentEm（预览侧现状公式，行为锚） */
function referenceSignatureIndentEm(
  signatureContent: string,
  dateContent: string,
  hasStamp: boolean
): number {
  const baseIndent = hasStamp ? 4 : 2
  const signatureWidth = referenceTextWidthEm(signatureContent)
  const dateWidth = referenceTextWidthEm(dateContent)
  const centerOffset = (dateWidth - signatureWidth) / 2
  return Math.max(0, baseIndent + centerOffset)
}

/** 深拷贝默认配置后打补丁（测试专用，避免污染共享对象） */
function configWith(patch: (c: DocumentConfig) => void): DocumentConfig {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as DocumentConfig
  patch(cloned)
  return cloned
}

/** 构造指定印章开关的配置 */
function configOf(hasStamp: boolean): DocumentConfig {
  if (!hasStamp) {
    return DEFAULT_CONFIG
  }
  return configWith((c) => {
    c.specialOptions.hasStamp = true
  })
}

// ---- charSpacing / charWidth（数值基线，原 styleFactory 对照的迁移形式） ----

describe('决策层 charSpacing / charWidth（单元2 基线对照）', () => {
  it('默认配置：可用宽度 8844、charSpacing = −5、charWidth = 315', () => {
    expect(availableWidthTwips(DEFAULT_CONFIG)).toBe(8844)
    expect(charSpacingTwips(DEFAULT_CONFIG)).toBe(-5)
    expect(charWidthTwips(DEFAULT_CONFIG)).toBe(315)
  })

  it('charWidth 与 charSpacing 满足：charWidth = 字号×20 + charSpacing（320−5=315）', () => {
    expect(charWidthTwips(DEFAULT_CONFIG)).toBe(
      DEFAULT_CONFIG.body.fontSize * 20 + charSpacingTwips(DEFAULT_CONFIG)
    )
  })

  it('边距变化响应：左右各 2.5cm → charSpacing = 3、charWidth = 323', () => {
    const config = configWith((c) => {
      c.margins.left = 2.5
      c.margins.right = 2.5
    })
    expect(availableWidthTwips(config)).toBe(9070)
    expect(charSpacingTwips(config)).toBe(3)
    expect(charWidthTwips(config)).toBe(323)
  })

  it('首行缩进 = 缩进字符数 × 字符宽度（默认 2 × 315 = 630）', () => {
    expect(firstLineIndentTwips(DEFAULT_CONFIG)).toBe(630)
  })
})

// ---- 文本宽度计量（twip 版手算锚点 / em 版与预览侧对照） ----

describe('决策层文本宽度计量（双口径）', () => {
  it('twip 版：中文 315/字、ASCII 0.69×315/字（手算锚点）', () => {
    expect(textWidthTwips('某某市人民政府', 315)).toBe(2205)
    expect(textWidthTwips('2026', 315)).toBeCloseTo(869.4, 9)
    expect(textWidthTwips('2026年9月11日', 315)).toBeCloseTo(2466.45, 9)
  })

  it('em 版与旧 A4Page.calculateTextWidthEm 公式同值（预览侧现状）', () => {
    expect(textWidthEm('某某市人民政府')).toBe(referenceTextWidthEm('某某市人民政府'))
    expect(textWidthEm('2026年9月11日')).toBeCloseTo(
      referenceTextWidthEm('2026年9月11日'),
      9
    )
  })

  it('〇（U+3007）按汉字全宽计（两版一致）', () => {
    expect(textWidthEm('〇')).toBe(1)
    expect(textWidthTwips('〇', 315)).toBe(315)
  })
})

// ---- 签名缩进 twip 版（手算锚点，原 styleFactory.calculateSignatureIndent 对照的迁移形式） ----

describe('决策层签名缩进 twip 版（手算锚点）', () => {
  const cases: { sig: string; date: string; noStamp: number; stamp: number }[] = [
    // 等宽 10×10：无印 630、有印 1260
    { sig: '某某市人民政府办公厅', date: '二零二六年九月十一日', noStamp: 630, stamp: 1260 },
    // 5×10：630+787.5=1417.5；1260+787.5=2047.5
    { sig: '某某市政府', date: '二零二六年九月十一日', noStamp: 1417.5, stamp: 2047.5 },
    // 10×9：630−157.5=472.5；1260−157.5=1102.5
    { sig: '某某市人民政府办公室', date: '二零二六年九月一日', noStamp: 472.5, stamp: 1102.5 },
    // 20×10：负偏移钳制 0
    { sig: '某某市人民政府办公室政务公开与法治建设科', date: '二零二六年九月十一日', noStamp: 0, stamp: 0 },
    // 〇 按汉字全宽计：10×10 等宽，与「二零二六」同值（无印 630、有印 1260）
    { sig: '某某市人民政府办公室', date: '二〇二六年九月十一日', noStamp: 630, stamp: 1260 },
    // 混合字符：署名 2.38em、日期 7.83em → 630+858.375=1488.375；1260+858.375=2118.375
    { sig: 'AB局', date: '2026年9月11日', noStamp: 1488.375, stamp: 2118.375 },
    // 署名 3.69em、日期 8.52em（2026/12/31 共 8 个 ASCII）→ 630+760.725=1390.725；1260+760.725=2020.725
    { sig: 'X市发改', date: '2026年12月31日', noStamp: 1390.725, stamp: 2020.725 },
  ]

  for (const { sig, date, noStamp, stamp } of cases) {
    it(`${sig} × ${date}（印章=否）：${noStamp}`, () => {
      expect(signatureRightIndentTwips(sig, date, configOf(false))).toBeCloseTo(noStamp, 9)
    })
    it(`${sig} × ${date}（印章=是）：${stamp}`, () => {
      expect(signatureRightIndentTwips(sig, date, configOf(true))).toBeCloseTo(stamp, 9)
    })
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

// ---- 签名缩进 em 版（与旧 A4Page.calculateSignatureIndentEm 公式对照） ----

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
      it(`${sig} × ${date}（印章=${hasStamp}）：与旧 calculateSignatureIndentEm 公式逐值一致`, () => {
        expect(signatureRightIndentEm(sig, date, hasStamp)).toBe(
          referenceSignatureIndentEm(sig, date, hasStamp)
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
        const twip = signatureRightIndentTwips(sig, date, configOf(hasStamp))
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
