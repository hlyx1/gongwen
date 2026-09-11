import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '../../types/documentConfig'
import { bodyPunctSpec, roleSpec } from '../fonts'
import {
  splitAttachmentRuns,
  splitHeading3NumberDotRuns,
  splitHeading3Runs,
  splitHeadingSentenceRuns,
  splitTimeColonRuns,
} from '../runs'

/**
 * 字体分段 runs 决策测试（工作单元-3 交付物）
 *
 * 锁定导出侧四个拆分函数的现状切分边界（docxBuilder.ts
 * splitHeadingSentence / splitHeading3Text / splitTimeColonText / splitAttachmentText），
 * 以及三级标题序号句点在偏差开关（待办-0001/0004）下的行为矩阵。
 */

const bodySpec = roleSpec('body', DEFAULT_CONFIG)
const h3Spec = roleSpec('heading3', DEFAULT_CONFIG)
const titleSpec = roleSpec('title', DEFAULT_CONFIG)
// 三级标题句点规格：字号跟随三级标题（导出侧 getHeading3PunctuationRunStyle 现状）
const h3DotSpec = bodyPunctSpec(DEFAULT_CONFIG, h3Spec.sizeHalfPt)
// 时间冒号规格：字号跟随宿主
const bodyColonSpec = bodyPunctSpec(DEFAULT_CONFIG, bodySpec.sizeHalfPt)
const titleColonSpec = bodyPunctSpec(DEFAULT_CONFIG, titleSpec.sizeHalfPt)

/** 取 runs 的文本切分序列（对照导出侧切分边界） */
function texts(runs: { text: string }[]): string[] {
  return runs.map((r) => r.text)
}

/** 取 runs 的角色序列 */
function roles(runs: { role: string }[]): string[] {
  return runs.map((r) => r.role)
}

// ---- 时间冒号拆分（统一真值 = 导出侧现状） ----

describe('splitTimeColonRuns 时间冒号拆分', () => {
  it('多匹配：切分边界与导出侧 splitTimeColonText 逐段一致', () => {
    const runs = splitTimeColonRuns('会议时间为9:00至11:30，请提前入场。', bodySpec, bodyColonSpec)
    expect(texts(runs)).toEqual([
      '会议时间为',
      '9',
      ':',
      '00',
      '至',
      '11',
      ':',
      '30',
      '，请提前入场。',
    ])
    expect(roles(runs)).toEqual([
      'body',
      'body',
      'bodyPunct',
      'body',
      'body',
      'body',
      'bodyPunct',
      'body',
      'body',
    ])
  })

  it('无匹配：整段单 run', () => {
    const runs = splitTimeColonRuns('普通正文段落。', bodySpec, bodyColonSpec)
    expect(texts(runs)).toEqual(['普通正文段落。'])
    expect(roles(runs)).toEqual(['body'])
  })

  it('冒号在开头（无前文）与前缀为空的行为', () => {
    const runs = splitTimeColonRuns('9:30 开始', bodySpec, bodyColonSpec)
    expect(texts(runs)).toEqual(['9', ':', '30', ' 开始'])
  })

  it('两位小时与一位小时均可匹配（\\d{1,2}:\\d{2}）', () => {
    const runs = splitTimeColonRuns('14:30', bodySpec, bodyColonSpec)
    expect(texts(runs)).toEqual(['14', ':', '30'])
  })

  it('三分位数字不匹配（\\d{2} 之后不再吃第三位）', () => {
    // "1130" 中 "11:30" 之外无冒号——本用例锁定 11 之后的 30 无冒号时整段单 run
    const runs = splitTimeColonRuns('编号1130号', bodySpec, bodyColonSpec)
    expect(texts(runs)).toEqual(['编号1130号'])
  })

  it('标题字号宿主：冒号规格字号跟随宿主（44）', () => {
    const runs = splitTimeColonRuns('会议9:00开始', titleSpec, titleColonSpec)
    const colon = runs.find((r) => r.role === 'bodyPunct')
    expect(colon && colon.sizeHalfPt).toBe(44)
    expect(colon && colon.text).toBe(':')
  })

  it('全角冒号不匹配（清洗层负责还原半角，决策层只认半角——现状）', () => {
    const runs = splitTimeColonRuns('会议时间：9：00', bodySpec, bodyColonSpec)
    expect(texts(runs)).toEqual(['会议时间：9：00'])
    expect(roles(runs)).toEqual(['body'])
  })
})

// ---- 标题首句拆分（一、二、四级标题；两侧现状一致） ----

describe('splitHeadingSentenceRuns 标题首句拆分', () => {
  it('有中文句号：首句标题字体 + 剩余正文字体', () => {
    const runs = splitHeadingSentenceRuns('一、总体要求。坚持以规范为基准。', roleSpec('heading1', DEFAULT_CONFIG), bodySpec)
    expect(texts(runs)).toEqual(['一、总体要求。', '坚持以规范为基准。'])
    expect(roles(runs)).toEqual(['heading1', 'body'])
  })

  it('无中文句号：整段单 run（标题字体）', () => {
    const runs = splitHeadingSentenceRuns('（一）指导思想', roleSpec('heading2', DEFAULT_CONFIG), bodySpec)
    expect(texts(runs)).toEqual(['（一）指导思想'])
    expect(roles(runs)).toEqual(['heading2'])
  })

  it('中文句号在末尾：整段单 run', () => {
    const runs = splitHeadingSentenceRuns('一、总体要求。', roleSpec('heading1', DEFAULT_CONFIG), bodySpec)
    expect(texts(runs)).toEqual(['一、总体要求。'])
    expect(roles(runs)).toEqual(['heading1'])
  })

  it('剩余部分不做时间冒号拆分（导出侧 splitHeadingSentence 现状）', () => {
    const runs = splitHeadingSentenceRuns('一、开会。时间为9:00。', roleSpec('heading1', DEFAULT_CONFIG), bodySpec)
    expect(texts(runs)).toEqual(['一、开会。', '时间为9:00。'])
    expect(roles(runs)).toEqual(['heading1', 'body'])
  })
})

// ---- 三级标题序号句点拆分（待办-0001/0004 开关矩阵） ----

describe('splitHeading3NumberDotRuns 序号句点开关矩阵', () => {
  it('0001 预览现状（follow-heading3）：半角句点不拆分，单 run', () => {
    const runs = splitHeading3NumberDotRuns('1.加强组织领导', h3Spec, h3DotSpec, {
      dotFont: 'follow-heading3',
      fullwidthDot: 'no-split',
    })
    expect(texts(runs)).toEqual(['1.加强组织领导'])
    expect(roles(runs)).toEqual(['heading3'])
  })

  it('0001 导出现状（body-font）＋半角句点：拆为 [序号, 句点(正文字体), 内容]', () => {
    const runs = splitHeading3NumberDotRuns('1.加强组织领导', h3Spec, h3DotSpec, {
      dotFont: 'body-font',
      fullwidthDot: 'no-split',
    })
    expect(texts(runs)).toEqual(['1', '.', '加强组织领导'])
    expect(roles(runs)).toEqual(['heading3', 'bodyPunct', 'heading3'])
    // 句点规格：四槽仿宋、字号跟随三级标题（32）
    expect(runs[1].font.ascii).toBe('仿宋_GB2312')
    expect(runs[1].sizeHalfPt).toBe(32)
  })

  it('0004 导出现状（no-split）＋全角句点：不拆分，单 run', () => {
    const runs = splitHeading3NumberDotRuns('1．加强组织领导', h3Spec, h3DotSpec, {
      dotFont: 'body-font',
      fullwidthDot: 'no-split',
    })
    expect(texts(runs)).toEqual(['1．加强组织领导'])
    expect(roles(runs)).toEqual(['heading3'])
  })

  it('0004 修复目标（split）＋全角句点：与半角同法拆分', () => {
    const runs = splitHeading3NumberDotRuns('1．加强组织领导', h3Spec, h3DotSpec, {
      dotFont: 'body-font',
      fullwidthDot: 'split',
    })
    expect(texts(runs)).toEqual(['1', '．', '加强组织领导'])
    expect(roles(runs)).toEqual(['heading3', 'bodyPunct', 'heading3'])
  })

  it('不匹配序号格式（如（1）开头）：整段单 run', () => {
    const runs = splitHeading3NumberDotRuns('（1）制定方案', h3Spec, h3DotSpec, {
      dotFont: 'body-font',
      fullwidthDot: 'no-split',
    })
    expect(texts(runs)).toEqual(['（1）制定方案'])
  })

  it('两位序号（12.xxx）正常拆分', () => {
    const runs = splitHeading3NumberDotRuns('12.深化整治', h3Spec, h3DotSpec, {
      dotFont: 'body-font',
      fullwidthDot: 'no-split',
    })
    expect(texts(runs)).toEqual(['12', '.', '深化整治'])
  })

  it('序号句点后无内容：不产生空 run', () => {
    const runs = splitHeading3NumberDotRuns('1.', h3Spec, h3DotSpec, {
      dotFont: 'body-font',
      fullwidthDot: 'no-split',
    })
    expect(texts(runs)).toEqual(['1', '.'])
  })
})

// ---- 三级标题完整分段（首句 + 序号句点 + 剩余时间冒号） ----

describe('splitHeading3Runs 三级标题完整分段', () => {
  it('导出现状（body-font）＋无中文句号：仅序号句点拆分', () => {
    const runs = splitHeading3Runs('1.加强组织领导', h3Spec, h3DotSpec, bodySpec, bodyColonSpec, {
      dotFont: 'body-font',
      fullwidthDot: 'no-split',
    })
    expect(texts(runs)).toEqual(['1', '.', '加强组织领导'])
  })

  it('导出现状＋有中文句号：首句序号拆分 + 剩余时间冒号拆分', () => {
    const runs = splitHeading3Runs('1.加强组织领导。要压实责任，会议9:00开始。', h3Spec, h3DotSpec, bodySpec, bodyColonSpec, {
      dotFont: 'body-font',
      fullwidthDot: 'no-split',
    })
    expect(texts(runs)).toEqual(['1', '.', '加强组织领导。', '要压实责任，会议', '9', ':', '00', '开始。'])
    expect(roles(runs)).toEqual([
      'heading3',
      'bodyPunct',
      'heading3',
      'body',
      'body',
      'bodyPunct',
      'body',
      'body',
    ])
  })

  it('预览现状（follow-heading3）＋有中文句号：首句单 run + 剩余正文（无序号拆分）', () => {
    const runs = splitHeading3Runs('1.加强组织领导。要压实责任。', h3Spec, h3DotSpec, bodySpec, bodyColonSpec, {
      dotFont: 'follow-heading3',
      fullwidthDot: 'no-split',
    })
    expect(texts(runs)).toEqual(['1.加强组织领导。', '要压实责任。'])
    expect(roles(runs)).toEqual(['heading3', 'body'])
  })

  it('中文句号在末尾：只处理序号部分', () => {
    const runs = splitHeading3Runs('1.加强组织领导。', h3Spec, h3DotSpec, bodySpec, bodyColonSpec, {
      dotFont: 'body-font',
      fullwidthDot: 'no-split',
    })
    expect(texts(runs)).toEqual(['1', '.', '加强组织领导。'])
  })
})

// ---- 附件序号句点拆分（多附件模式；两侧现状一致） ----

describe('splitAttachmentRuns 附件句点拆分', () => {
  it('单个句点：拆为 [文本, 句点(正文字体四槽), 文本]', () => {
    const runs = splitAttachmentRuns('1.公文排版管理办法', bodySpec, bodyColonSpec)
    expect(texts(runs)).toEqual(['1', '.', '公文排版管理办法'])
    expect(roles(runs)).toEqual(['body', 'bodyPunct', 'body'])
    expect(runs[1].font).toEqual({
      ascii: '仿宋_GB2312',
      eastAsia: '仿宋_GB2312',
      hAnsi: '仿宋_GB2312',
      cs: '仿宋_GB2312',
    })
  })

  it('多个句点：每个句点独立成段（导出侧逐字符扫描现状）', () => {
    const runs = splitAttachmentRuns('2026.1.1工作报告', bodySpec, bodyColonSpec)
    expect(texts(runs)).toEqual(['2026', '.', '1', '.', '1工作报告'])
  })

  it('无句点：整段单 run', () => {
    const runs = splitAttachmentRuns('公文格式自查清单', bodySpec, bodyColonSpec)
    expect(texts(runs)).toEqual(['公文格式自查清单'])
  })

  it('句点在开头：不产生空前缀 run', () => {
    const runs = splitAttachmentRuns('.开头句点', bodySpec, bodyColonSpec)
    expect(texts(runs)).toEqual(['.', '开头句点'])
  })

  it('句点在末尾：不产生空后缀 run', () => {
    const runs = splitAttachmentRuns('末尾句点.', bodySpec, bodyColonSpec)
    expect(texts(runs)).toEqual(['末尾句点', '.'])
  })
})
