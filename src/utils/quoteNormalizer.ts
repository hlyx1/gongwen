/**
 * 直引号规范化为中文引号（保守配对策略）
 *
 * 把英文直引号 " 和 ' 转换为中文左右引号 “” 和 ‘’。
 * 核心原则：宁可不改，不可改错——只有严格配对成功的引号才转换；
 * 配对失败的引号（奇数个、缺闭合、上下文不足、超距）一律原样保留半角，
 * 绝不按奇偶位置盲目交替转换（那样一旦错位会全文连环反转）。
 *
 * 配对规则要点：
 * 1. 上下文显式判定：段首/空白/冒号类之后的是左引号；标点/空白/段尾之前的是右引号；
 * 2. 两侧都是汉字的引号局部不可判定，交给栈式配对：优先与邻近的同类未知挂账互配；
 * 3. 未知引号遇到显式左引号挂账时，仅当该挂账等不到自己的显式右引号
 *    （其后没有多余的显式右引号、或邻近再无未知引号）才闭合它——
 *    由此同时兼容 说："要深化"放管服"改革。"（句内强调不抢外层讲话引号）
 *    与 "甲"和"乙"（段首强调的连续多对各自配对）两种形态；
 * 4. 分段引用（国标惯例：引文分段时每段段首加前引号、仅末段段尾加后引号）支持跨段配对；
 * 5. 两侧为字母/数字的引号视为撇号或度分秒标记（don't、116°23'45"），永久保留半角；
 * 6. 全文汉字占比过低时整体放弃转换（防英文/代码文本被误伤）。
 */

/** 未知引号与挂账左引号的最大配对距离（字符数）；显式判定的配对不受此限 */
const PAIR_DIST_MAX = 400

/** 汉字占非空白字符比例低于该值时整体放弃转换（判定为非中文文本，如英文/代码） */
const MIN_CJK_RATIO = 0.3

/** 左引号上文：段首、空白、冒号与左开类标点之后 */
const OPEN_PREV = new Set(['\n', ' ', '\t', '：', ':', '，', ',', '、', '（', '(', '【', '「', '《', '—'])

/** 右引号下文：段尾、空白、句读与右合类标点之前 */
const CLOSE_NEXT = new Set(['\n', ' ', '\t', '，', ',', '。', '、', '；', ';', '：', ':', '？', '?', '！', '!', '）', ')', '】', '》'])

/** 引号的局部上下文判定结果 */
type QuoteKind =
  | 'open' // 显式左引号
  | 'close' // 显式右引号
  | 'neutral' // 局部不可判定，交给栈式配对

/** 挂账的未配对左引号 */
interface PendingQuote {
  pos: number
  /** 显式判定的左引号可被任意距离的显式右引号闭合；未知引号仅限邻近互配 */
  explicit: boolean
}

/** 配对成功的一对引号位置 */
interface QuotePair {
  open: number
  close: number
}

export interface QuoteNormalizeResult {
  text: string
  /** 完成转换的引号字符数（每对计 2，分段引用续段段首引号各计 1） */
  count: number
  /** 配对失败、原样保留半角的引号字符数 */
  skipped: number
}

/** 依据前后字符判定引号的左右倾向（prev/next 为 undefined 表示文本边界） */
function classifyQuote(prev: string | undefined, next: string | undefined): QuoteKind {
  const openSide = prev === undefined || OPEN_PREV.has(prev)
  const closeSide = next === undefined || CLOSE_NEXT.has(next)
  if (openSide && !closeSide) return 'open'
  if (closeSide && !openSide) return 'close'
  return 'neutral'
}

/**
 * 判断栈顶显式左引号是否还等得到自己的右引号：
 * 同段其后存在多余的显式右引号（数量多于显式左引号），
 * 且邻近有未知引号可与当前引号互配时，当前未知引号应让位（另开新挂账）
 */
function explicitTopCanWait(chars: string[], protectedPos: Set<number>, quoteChar: string, from: number): boolean {
  let opens = 0
  let closes = 0
  let neutralNear = false
  for (let k = from + 1; k < chars.length; k++) {
    if (chars[k] === '\n') break // 跨段不做预判（段界检查点会清算挂账）
    if (chars[k] !== quoteChar || protectedPos.has(k)) continue
    const kind = classifyQuote(chars[k - 1], chars[k + 1])
    if (kind === 'open') opens++
    else if (kind === 'close') closes++
    else if (!neutralNear && k - from <= PAIR_DIST_MAX) neutralNear = true
  }
  return closes > opens && neutralNear
}

export function normalizeQuotes(text: string): QuoteNormalizeResult {
  // 汉字闸门：非中文文本（英文/代码）不转换
  const nonSpaceLen = text.replace(/\s/g, '').length
  const cjkLen = (text.match(/[\u4e00-\u9fff]/g) || []).length
  if (nonSpaceLen === 0 || cjkLen / nonSpaceLen < MIN_CJK_RATIO) {
    return { text, count: 0, skipped: 0 }
  }

  // 按码点切分，避免代理对字符被截断
  const chars = Array.from(text)

  // 撇号/度分秒保护：两侧均为字母或数字的直引号不参与转换
  const protectedPos = new Set<number>()
  for (let i = 1; i < chars.length - 1; i++) {
    const ch = chars[i]
    if ((ch === '"' || ch === "'") && /[A-Za-z0-9]/.test(chars[i - 1]) && /[A-Za-z0-9]/.test(chars[i + 1])) {
      protectedPos.add(i)
    }
  }

  const doublePairs: QuotePair[] = []
  const singlePairs: QuotePair[] = []
  /** 分段引用续段段首的引号位置（确认为左引号，不参与配对记账） */
  const extraOpen = new Set<number>()
  let skipped = 0

  // 双引号与单引号独立配对（各自成栈，互不干扰）
  for (const quoteChar of ['"', "'"]) {
    const pairs = quoteChar === '"' ? doublePairs : singlePairs
    const stack: PendingQuote[] = []
    let i = 0
    while (i < chars.length) {
      if (chars[i] === '\n') {
        // 段落检查点：有挂账时按下一段段首是否同种直引号识别分段引用续段
        if (stack.length > 0) {
          let j = i + 1
          while (j < chars.length && (chars[j] === ' ' || chars[j] === '\t')) j++
          if (j < chars.length && chars[j] === quoteChar && !protectedPos.has(j)) {
            // 续段段首引号确认为左引号，原挂账继续保留等待末段闭合
            extraOpen.add(j)
            i = j + 1
            continue
          }
          skipped += stack.length
          stack.length = 0
        }
        i++
        continue
      }
      if (chars[i] !== quoteChar || protectedPos.has(i)) {
        i++
        continue
      }

      const kind = classifyQuote(chars[i - 1], chars[i + 1])
      if (kind === 'open') {
        stack.push({ pos: i, explicit: true })
      } else if (kind === 'close') {
        // 显式右引号：闭合最近的挂账（显式挂账不限距离；未知挂账超距即判废）
        let paired = false
        while (stack.length > 0) {
          const top = stack[stack.length - 1]
          if (top.explicit || i - top.pos <= PAIR_DIST_MAX) {
            stack.pop()
            pairs.push({ open: top.pos, close: i })
            paired = true
            break
          }
          stack.pop()
          skipped++
        }
        if (!paired) skipped++
      } else {
        const top = stack.length > 0 ? stack[stack.length - 1] : undefined
        if (top !== undefined && !top.explicit && i - top.pos <= PAIR_DIST_MAX) {
          // 闭合邻近的未知挂账（强调类引号互配）
          stack.pop()
          pairs.push({ open: top.pos, close: i })
        } else if (
          top !== undefined &&
          top.explicit &&
          i - top.pos <= PAIR_DIST_MAX &&
          !explicitTopCanWait(chars, protectedPos, quoteChar, i)
        ) {
          // 显式挂账等不到自己的右引号，由当前未知引号闭合
          stack.pop()
          pairs.push({ open: top.pos, close: i })
        } else {
          stack.push({ pos: i, explicit: false })
        }
      }
      i++
    }
    skipped += stack.length
  }

  const out = chars.slice()

  // 嵌套层级定单双（GB/T 15834：引号中再用引号，外层双、内层单，交替嵌套）：
  // 被奇数个同种引号对包含的配对降为单引号，其余为双引号
  const depthOf = (p: QuotePair): number =>
    doublePairs.reduce((n, q) => (q.open < p.open && p.close < q.close ? n + 1 : n), 0)
  for (const p of doublePairs) {
    const nested = depthOf(p) % 2 === 1
    out[p.open] = nested ? '\u2018' : '\u201c'
    out[p.close] = nested ? '\u2019' : '\u201d'
  }
  for (const p of singlePairs) {
    out[p.open] = '\u2018'
    out[p.close] = '\u2019'
  }
  for (const pos of extraOpen) {
    out[pos] = chars[pos] === '"' ? '\u201c' : '\u2018'
  }

  return {
    text: out.join(''),
    count: (doublePairs.length + singlePairs.length) * 2 + extraOpen.size,
    skipped,
  }
}
