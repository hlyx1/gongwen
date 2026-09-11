import { describe, it, expect } from 'vitest'
import { sanitizeText } from '../sanitize'

/**
 * sanitizeText 特征测试（task-0001 条款1b）
 * 目的：在业务代码改动前锁定现有清洗行为——本文件锚定的是「现状」，
 * 用例期望值均来自对 sanitize.ts 现行实现的手工推演，不代表规范应然。
 */

// ---- 标点替换 ----

describe('sanitizeText 标点替换', () => {
  it('半角逗号替换为全角逗号', () => {
    const r = sanitizeText('第一项,第二项')
    expect(r.text).toBe('第一项，第二项')
    expect(r.count).toBe(1)
  })

  it('中文后的半角句号替换为全角句号', () => {
    const r = sanitizeText('现将有关事项通知如下.')
    expect(r.text).toBe('现将有关事项通知如下。')
    expect(r.count).toBe(1)
  })

  it('数字/英文后的半角句号不替换（保护小数与缩写）', () => {
    const r = sanitizeText('半径为3.14厘米,参见U.S.A规范')
    expect(r.text).toBe('半径为3.14厘米，参见U.S.A规范')
    expect(r.count).toBe(1) // 仅逗号一次
  })

  it('全角括号后的半角句号也替换（CJK 标点属于前置字符集）', () => {
    const r = sanitizeText('（注）.')
    expect(r.text).toBe('（注）。')
    expect(r.count).toBe(1)
  })

  it('连续半角句点仅替换中文后首个（现状：其余保留半角）', () => {
    const r = sanitizeText('等等...内容')
    expect(r.text).toBe('等等。..内容')
    expect(r.count).toBe(1)
  })

  it('半角冒号替换为全角冒号', () => {
    const r = sanitizeText('各部门:按此执行')
    expect(r.text).toBe('各部门：按此执行')
    expect(r.count).toBe(1)
  })

  it('半角分号替换为全角分号', () => {
    const r = sanitizeText('第一;第二')
    expect(r.text).toBe('第一；第二')
    expect(r.count).toBe(1)
  })

  it('半角括号替换为全角括号', () => {
    const r = sanitizeText('(联系人:小明)')
    expect(r.text).toBe('（联系人：小明）')
    expect(r.count).toBe(3) // 冒号、左括号、右括号各一次
  })

  it('半角问号叹号替换为全角', () => {
    const r = sanitizeText('是否执行?立即执行!')
    expect(r.text).toBe('是否执行？立即执行！')
    expect(r.count).toBe(2)
  })
})

// ---- 时间格式冒号 ----

describe('sanitizeText 时间格式冒号', () => {
  it('时间格式的全角冒号还原为半角', () => {
    const r = sanitizeText('会议时间为9：00至11：30')
    expect(r.text).toBe('会议时间为9:00至11:30')
    expect(r.count).toBe(2)
  })

  it('半角冒号时间的净效果不变（先全角化再还原，各计一次）', () => {
    const r = sanitizeText('9:00')
    expect(r.text).toBe('9:00')
    expect(r.count).toBe(2)
  })

  it('非时间格式的冒号保持全角', () => {
    const r = sanitizeText('时间:另行通知')
    expect(r.text).toBe('时间：另行通知')
    expect(r.count).toBe(1)
  })

  it('分钟不足两位不还原（正则要求两位分钟）', () => {
    const r = sanitizeText('9：0开始')
    expect(r.text).toBe('9：0开始')
    expect(r.count).toBe(0)
  })

  it('分钟为三位时仅匹配前两位（现状：贪婪取两位分钟）', () => {
    const r = sanitizeText('12：345')
    expect(r.text).toBe('12:345')
    expect(r.count).toBe(1)
  })
})

// ---- Markdown 清理 ----

describe('sanitizeText Markdown 清理', () => {
  it('清理代码块：去除语言标识行，保留尾部换行（现状）', () => {
    const r = sanitizeText('```js\nconst a = 1\n```')
    expect(r.text).toBe('const a = 1\n')
    expect(r.count).toBe(1)
  })

  it('清理无语言标识的代码块：保留首尾换行（现状：空首行不视为语言行）', () => {
    const r = sanitizeText('```\n纯文本\n```')
    expect(r.text).toBe('\n纯文本\n')
    expect(r.count).toBe(1)
  })

  it('清理行内代码', () => {
    const r = sanitizeText('变量`x`表示')
    expect(r.text).toBe('变量x表示')
    expect(r.count).toBe(1)
  })

  it('清理图片：保留 alt 文本', () => {
    const r = sanitizeText('见![示意图](http://a/b.png)下文')
    expect(r.text).toBe('见示意图下文')
    expect(r.count).toBe(1)
  })

  it('清理链接：保留链接文本', () => {
    const r = sanitizeText('[官网](http://a)已上线')
    expect(r.text).toBe('官网已上线')
    expect(r.count).toBe(1)
  })

  it('清理删除线', () => {
    const r = sanitizeText('~~旧版~~')
    expect(r.text).toBe('旧版')
    expect(r.count).toBe(1)
  })

  it('清理加粗（** 与 __）', () => {
    expect(sanitizeText('**重点**工作').text).toBe('重点工作')
    expect(sanitizeText('__强调__部分').text).toBe('强调部分')
  })

  it('清理斜体（* 与 _）', () => {
    expect(sanitizeText('*斜体*文本').text).toBe('斜体文本')
    expect(sanitizeText('_下划_文本').text).toBe('下划文本')
  })

  it('清理标题标记（行首 #）', () => {
    const r = sanitizeText('## 二级标题\n正文')
    expect(r.text).toBe('二级标题\n正文')
    expect(r.count).toBe(1)
  })

  it('清理引用标记（含无空格形式）', () => {
    expect(sanitizeText('> 引用内容').text).toBe('引用内容')
    expect(sanitizeText('>引用内容').text).toBe('引用内容')
  })

  it('清理无序列表标记（- * + 后跟空白）', () => {
    expect(sanitizeText('- 项目一').text).toBe('项目一')
    expect(sanitizeText('* 项目二').text).toBe('项目二')
  })

  it('无序列表标记后无空白不清理（现状）', () => {
    const r = sanitizeText('-项目')
    expect(r.text).toBe('-项目')
    expect(r.count).toBe(0)
  })

  it('有序列表标记保留（公文三级标题「1.」格式不清除）', () => {
    const r = sanitizeText('1.加强组织领导')
    expect(r.text).toBe('1.加强组织领导')
    expect(r.count).toBe(0)
  })

  it('清理水平线', () => {
    const r = sanitizeText('上文\n---\n下文')
    expect(r.text).toBe('上文\n\n下文')
    expect(r.count).toBe(1)
  })

  it('Markdown 清理先于标点替换执行', () => {
    const r = sanitizeText('**重点**,其余')
    expect(r.text).toBe('重点，其余')
    expect(r.count).toBe(2) // 加粗一次 + 逗号一次
  })
})

// ---- 空白清理 ----

describe('sanitizeText 空白清理', () => {
  it('不间断空格替换为普通空格', () => {
    const r = sanitizeText('a\u00A0b')
    expect(r.text).toBe('a b')
    expect(r.count).toBe(1)
  })

  it('行首尾空格逐行 trim', () => {
    const r = sanitizeText('  标题  \n  正文')
    expect(r.text).toBe('标题\n正文')
    expect(r.count).toBe(2)
  })

  it('连续三个及以上空行合并为一个空行', () => {
    expect(sanitizeText('上\n\n\n下').text).toBe('上\n\n下')
    const r = sanitizeText('上\n\n\n\n下')
    expect(r.text).toBe('上\n\n下')
    expect(r.count).toBe(1)
  })

  it('两个及以下连续换行不合并', () => {
    const r = sanitizeText('上\n\n下')
    expect(r.text).toBe('上\n\n下')
    expect(r.count).toBe(0)
  })
})

// ---- 综合与边界 ----

describe('sanitizeText 综合与边界', () => {
  it('空输入原样返回', () => {
    const r = sanitizeText('')
    expect(r.text).toBe('')
    expect(r.count).toBe(0)
  })

  it('规范中文文本零替换', () => {
    const r = sanitizeText('正文保持不变。')
    expect(r.text).toBe('正文保持不变。')
    expect(r.count).toBe(0)
  })

  it('组合场景：标题标记+列表+标点+时间+空行合并', () => {
    const r = sanitizeText('## 会议纪要\n\n\n\n- 时间:9:00\n- 地点:三楼会议室')
    expect(r.text).toBe('会议纪要\n\n时间：9:00\n地点：三楼会议室')
    expect(r.count).toBe(8) // 标题1 + 列表2 + 冒号3（时间:9:00 两处 + 地点: 一处） + 时间还原1 + 空行合并1
  })
})
