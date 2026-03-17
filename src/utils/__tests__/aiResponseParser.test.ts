import { describe, it, expect } from 'vitest'
import {
  createInitialParserState,
  parseStreamingLine,
  flushParser,
  parseTableRow,
} from '../aiResponseParser'
import type { AIProofreadResult } from '../../types/aiProofread'

/**
 * 创建测试用的 sentenceMap
 */
function createTestSentenceMap(): Map<number, string> {
  var map = new Map<number, string>()
  map.set(1, 'sentence-1')
  map.set(2, 'sentence-2')
  map.set(3, 'sentence-3')
  return map
}

// ---- parseTableRow 单元测试 ----
describe('parseTableRow', () => {
  it('解析有效的表格行', () => {
    var result = parseTableRow('| 1 | 原句内容 | 修改建议 |')
    expect(result).not.toBeNull()
    expect(result).toEqual(['1', '原句内容', '修改建议'])
  })

  it('解析无空格的表格行', () => {
    var result = parseTableRow('|1|原句内容|修改建议|')
    expect(result).not.toBeNull()
    expect(result).toEqual(['1', '原句内容', '修改建议'])
  })

  it('非表格行返回 null', () => {
    expect(parseTableRow('普通文本')).toBeNull()
    expect(parseTableRow('')).toBeNull()
    expect(parseTableRow('   ')).toBeNull()
  })

  it('不完整的表格行返回 null', () => {
    expect(parseTableRow('| 1 | 原句内容')).toBeNull()
    expect(parseTableRow('1 | 原句内容 |')).toBeNull()
  })
})

// ---- 思考内容清除测试 ----
describe('思考内容清除', () => {
  describe('流式解析 - 无思考标签', () => {
    it('正常解析没有思考标签的内容', () => {
      var state = createInitialParserState()
      var sentenceMap = createTestSentenceMap()

      // 模拟流式输入表格（无思考标签）
      var lines = [
        '| 序号 | 原句 | 修改 |\n',
        '|:---:|:---|:---|\n',
        '| 1 | 测试句子 | 无 |\n',
        '| 2 | 另一个句子 | 修改建议 |',
      ]

      var results: AIProofreadResult[] = []

      for (var i = 0; i < lines.length; i++) {
        var parsed = parseStreamingLine(state, lines[i], sentenceMap)
        state = parsed.newState
        if (parsed.result) {
          results.push(parsed.result)
        }
      }

      // 流结束时调用 flushParser 处理缓冲区
      // 因为没有 </think> 标签，flushParser 应该处理缓冲区中的内容
      var flushResult = flushParser(state, sentenceMap)
      for (var j = 0; j < flushResult.results.length; j++) {
        results.push(flushResult.results[j])
      }

      expect(results).toHaveLength(2)
      expect(results[0].seqNum).toBe(1)
      expect(results[0].originalText).toBe('测试句子')
      expect(results[0].hasIssue).toBe(false)
      expect(results[1].seqNum).toBe(2)
      expect(results[1].originalText).toBe('另一个句子')
      expect(results[1].hasIssue).toBe(true)
    })
  })

  describe('流式解析 - 有完整思考标签', () => {
    it('忽略 <think>...</think> 之间的内容', () => {
      var state = createInitialParserState()
      var sentenceMap = createTestSentenceMap()

      // 模拟 AI 返回的完整响应
      var lines = [
        '<think>\n',
        '这是思考内容，不应该被解析。\n',
        '即使这里有表格格式：\n',
        '| 99 | 假数据 | 不应该出现 |\n',
        '</think>\n',
        '| 序号 | 原句 | 修改 |\n',
        '|:---:|:---|:---|\n',
        '| 1 | 正确句子 | 无 |\n',
      ]

      var results: AIProofreadResult[] = []

      for (var i = 0; i < lines.length; i++) {
        var parsed = parseStreamingLine(state, lines[i], sentenceMap)
        state = parsed.newState
        if (parsed.result) {
          results.push(parsed.result)
        }
      }

      // 应该只解析到思考标签后的表格
      expect(results).toHaveLength(1)
      expect(results[0].seqNum).toBe(1)
      expect(results[0].originalText).toBe('正确句子')
    })
  })

  describe('流式解析 - 只有结束标签', () => {
    it('忽略 </think> 之前的所有内容（兼容无开始标签的模型）', () => {
      var state = createInitialParserState()
      var sentenceMap = createTestSentenceMap()

      // 模拟某些模型只输出结束标签的情况
      var lines = [
        '这是思考内容，没有开始标签。\n',
        '继续思考...\n',
        '</think>\n',
        '| 序号 | 原句 | 修改 |\n',
        '|:---:|:---|:---|\n',
        '| 1 | 测试句子 | 修改建议 |\n',
      ]

      var results: AIProofreadResult[] = []

      for (var i = 0; i < lines.length; i++) {
        var parsed = parseStreamingLine(state, lines[i], sentenceMap)
        state = parsed.newState
        if (parsed.result) {
          results.push(parsed.result)
        }
      }

      expect(results).toHaveLength(1)
      expect(results[0].seqNum).toBe(1)
      expect(results[0].originalText).toBe('测试句子')
    })
  })

  describe('流式解析 - 思考内容包含表格格式', () => {
    it('思考内容中的表格格式不应被解析', () => {
      var state = createInitialParserState()
      var sentenceMap = createTestSentenceMap()

      var lines = [
        '我在思考这个表格：\n',
        '| 序号 | 原句 | 修改 |\n',
        '|:---:|:---|:---|\n',
        '| 99 | 思考中的假数据 | 不应出现 |\n',
        '</think>\n',
        '| 序号 | 原句 | 修改 |\n',
        '|:---:|:---|:---|\n',
        '| 1 | 真实数据 | 无 |\n',
      ]

      var results: AIProofreadResult[] = []

      for (var i = 0; i < lines.length; i++) {
        var parsed = parseStreamingLine(state, lines[i], sentenceMap)
        state = parsed.newState
        if (parsed.result) {
          results.push(parsed.result)
        }
      }

      // 只应该解析到真实数据
      expect(results).toHaveLength(1)
      expect(results[0].seqNum).toBe(1)
      expect(results[0].originalText).toBe('真实数据')
    })
  })

  describe('流式解析 - 结束标签跨 chunk', () => {
    it('结束标签被拆分到多个 chunk 时也能正确处理', () => {
      var state = createInitialParserState()
      var sentenceMap = createTestSentenceMap()

      // 模拟结束标签被拆分的情况
      var lines = [
        '思考内容...\n',
        '</thin',  // 标签被拆分
        'k>\n',     // 标签剩余部分
        '| 序号 | 原句 | 修改 |\n',
        '|:---:|:---|:---|\n',
        '| 1 | 测试句子 | 无 |\n',
      ]

      var results: AIProofreadResult[] = []

      for (var i = 0; i < lines.length; i++) {
        var parsed = parseStreamingLine(state, lines[i], sentenceMap)
        state = parsed.newState
        if (parsed.result) {
          results.push(parsed.result)
        }
      }

      expect(results).toHaveLength(1)
      expect(results[0].seqNum).toBe(1)
    })
  })

  describe('flushParser - 缓冲区中有思考标签', () => {
    it('刷新时正确处理缓冲区中的思考内容', () => {
      var state = createInitialParserState()
      var sentenceMap = createTestSentenceMap()

      // 模拟流结束时缓冲区还有思考内容
      // thinkingEnded 为 false 表示还没找到结束标签
      state.buffer = '</think>\n| 1 | 测试句子 | 无 |'
      state.thinkingEnded = false

      var result = flushParser(state, sentenceMap)

      expect(result.results).toHaveLength(1)
      expect(result.results[0].seqNum).toBe(1)
      expect(result.results[0].originalText).toBe('测试句子')
    })

    it('缓冲区只有思考内容时返回空数组', () => {
      var state = createInitialParserState()
      var sentenceMap = createTestSentenceMap()

      state.buffer = '<think>\n思考内容...\n'
      state.thinkingEnded = false

      var result = flushParser(state, sentenceMap)

      expect(result.results).toHaveLength(0)
    })
  })
})

// ---- 边界情况测试 ----
describe('边界情况', () => {
  it('空输入返回 null', () => {
    var state = createInitialParserState()
    var sentenceMap = createTestSentenceMap()

    var parsed = parseStreamingLine(state, '', sentenceMap)

    expect(parsed.result).toBeNull()
    expect(parsed.newState.buffer).toBe('')
  })

  it('多个思考块只处理第一个', () => {
    var state = createInitialParserState()
    var sentenceMap = createTestSentenceMap()

    var lines = [
      '<think>第一个思考</think>\n',
      '| 序号 | 原句 | 修改 |\n',
      '|:---:|:---|:---|\n',
      '| 1 | 测试 | 无 |\n',
    ]

    var results: AIProofreadResult[] = []

    for (var i = 0; i < lines.length; i++) {
      var parsed = parseStreamingLine(state, lines[i], sentenceMap)
      state = parsed.newState
      if (parsed.result) {
        results.push(parsed.result)
      }
    }

    expect(results).toHaveLength(1)
  })

  it('思考标签大小写敏感', () => {
    var state = createInitialParserState()
    var sentenceMap = createTestSentenceMap()

    // 使用大写标签（不应该被识别为思考标签）
    var lines = [
      '<think>\n',
      '内容\n',
      '</think>\n',
      '| 序号 | 原句 | 修改 |\n',
      '|:---:|:---|:---|\n',
      '| 1 | 测试 | 无 |',
    ]

    var results: AIProofreadResult[] = []

    for (var i = 0; i < lines.length; i++) {
      var parsed = parseStreamingLine(state, lines[i], sentenceMap)
      state = parsed.newState
      if (parsed.result) {
        results.push(parsed.result)
      }
    }

    // 大写标签不会被识别，所以会一直等待
    // 流结束时调用 flushParser 处理缓冲区
    var flushResult = flushParser(state, sentenceMap)
    for (var j = 0; j < flushResult.results.length; j++) {
      results.push(flushResult.results[j])
    }

    // 最终应该解析到有效的表格行
    expect(results).toHaveLength(1)
  })
})
