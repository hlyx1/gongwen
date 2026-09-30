import { describe, it, expect } from 'vitest'
import { normalizeQuotes } from '../quoteNormalizer'

/**
 * normalizeQuotes 行为测试
 * 核心契约：严格配对成功才转换；任何配对不上的引号一律原样保留半角，
 * 绝不因奇数个引号导致连环错配。
 */

describe('normalizeQuotes 严格配对转换', () => {
  it('冒号后的讲话引号配对转换', () => {
    const r = normalizeQuotes('他说："好。"')
    expect(r.text).toBe('他说：“好。”')
    expect(r.count).toBe(2)
    expect(r.skipped).toBe(0)
  })

  it('两侧皆汉字的强调引号互配（局部不可判定，栈式配对解决）', () => {
    const r = normalizeQuotes('落实"放管服"改革要求')
    expect(r.text).toBe('落实“放管服”改革要求')
    expect(r.count).toBe(2)
  })

  it('讲话引号内套强调引号互不干扰，内层按国标降为单引号', () => {
    const r = normalizeQuotes('他说："要深化"放管服"改革。"')
    expect(r.text).toBe('他说：“要深化‘放管服’改革。”')
    expect(r.count).toBe(4)
  })

  it('多对并列强调引号各自配对', () => {
    const r = normalizeQuotes('落实"甲"和"乙"精神')
    expect(r.text).toBe('落实“甲”和“乙”精神')
    expect(r.count).toBe(4)
  })

  it('段首强调的连续多对各自配对（不连环错配）', () => {
    const r = normalizeQuotes('"甲"和"乙"并列')
    expect(r.text).toBe('“甲”和“乙”并列')
    expect(r.count).toBe(4)
  })

  it('段首单个强调引号配对', () => {
    const r = normalizeQuotes('"三严三实"是重要要求')
    expect(r.text).toBe('“三严三实”是重要要求')
    expect(r.count).toBe(2)
  })

  it('讲话引号与后续强调引号各自配对', () => {
    const r = normalizeQuotes('说："要抓好落实。"会议指出，"放管服"是重点。')
    expect(r.text).toBe('说：“要抓好落实。”会议指出，“放管服”是重点。')
    expect(r.count).toBe(4)
  })

  it('单引号配对转换为中文单引号', () => {
    const r = normalizeQuotes('他被评为\'先进个人\'。')
    expect(r.text).toBe('他被评为‘先进个人’。')
    expect(r.count).toBe(2)
  })

  it('分段引用跨段配对：续段段首确认为前引号，仅末段闭合', () => {
    const r = normalizeQuotes('他说："第一段。\n"第二段。\n"第三段。"')
    expect(r.text).toBe('他说：“第一段。\n“第二段。\n“第三段。”')
    expect(r.count).toBe(4) // 一对跨段配对 + 两个续段段首引号
    expect(r.skipped).toBe(0)
  })
})

describe('normalizeQuotes 保守弃权（防灾难）', () => {
  it('奇数个引号：已配对部分正常转换，多余左引号原样保留，不连环错配', () => {
    const r = normalizeQuotes('说："甲。"说："乙。"说："丙。')
    expect(r.text).toBe('说：“甲。”说：“乙。”说："丙。')
    expect(r.count).toBe(4)
    expect(r.skipped).toBe(1)
  })

  it('孤立右引号（无挂账可闭合）原样保留', () => {
    const r = normalizeQuotes('他说好。"')
    expect(r.text).toBe('他说好。"')
    expect(r.count).toBe(0)
    expect(r.skipped).toBe(1)
  })

  it('段尾挂账引号在下一段非引号开头时放弃转换', () => {
    const r = normalizeQuotes('他说："第一段\n第二段继续')
    expect(r.text).toBe('他说："第一段\n第二段继续')
    expect(r.count).toBe(0)
    expect(r.skipped).toBe(1)
  })

  it('超距未知引号不互配，双双保留', () => {
    const input = '甲"' + '乙'.repeat(500) + '"丙'
    const r = normalizeQuotes(input)
    expect(r.text).toBe(input)
    expect(r.count).toBe(0)
    expect(r.skipped).toBe(2)
  })

  it('超距未知挂账被显式右引号判废，显式右引号自身也不配对', () => {
    const input = '甲"' + '乙'.repeat(500) + '"。'
    const r = normalizeQuotes(input)
    expect(r.text).toBe(input)
    expect(r.count).toBe(0)
    expect(r.skipped).toBe(2)
  })
})

describe('normalizeQuotes 保护规则', () => {
  it('英文撇号不转换', () => {
    const r = normalizeQuotes('他说："规范用 don\'t 这类词。"')
    expect(r.text).toBe('他说：“规范用 don\'t 这类词。”')
    expect(r.count).toBe(2)
    expect(r.skipped).toBe(0)
  })

  it('度分秒标记不转换', () => {
    const input = '位于东经116°23\'45"附近。'
    const r = normalizeQuotes(input)
    expect(r.text).toBe(input)
    expect(r.count).toBe(0)
    expect(r.skipped).toBe(1) // 秒标记的直双引号无挂账可配，保留
  })

  it('纯英文文本整体放弃转换（汉字闸门）', () => {
    const input = '"Hello," said Tom. "Bye."'
    const r = normalizeQuotes(input)
    expect(r.text).toBe(input)
    expect(r.count).toBe(0)
    expect(r.skipped).toBe(0)
  })

  it('已有中文引号不受影响', () => {
    const input = '他说：“好。”'
    const r = normalizeQuotes(input)
    expect(r.text).toBe(input)
    expect(r.count).toBe(0)
    expect(r.skipped).toBe(0)
  })
})
