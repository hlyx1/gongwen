/**
 * AI 响应解析工具
 * 用于解析 AI 返回的流式表格数据
 * 兼容 Chrome 78 内核，不使用可选链和空值合并操作符
 */

import type { AIProofreadResult } from '../types/aiProofread';

/**
 * 解析状态接口
 * 用于跟踪流式解析过程中的状态
 */
export interface ParserState {
  /** 缓冲区，存储未完成的行 */
  buffer: string;
  /** 是否在表格中 */
  inTable: boolean;
  /** 是否已找到表头 */
  headerFound: boolean;
  /** 当前行的列数据 */
  currentRow: string[];
}

/**
 * 创建初始解析状态
 * @returns 初始解析状态
 */
export function createInitialParserState(): ParserState {
  return {
    buffer: '',
    inTable: false,
    headerFound: false,
    currentRow: [],
  };
}

/**
 * 解析表格行
 * 将表格行文本解析为列数据数组
 * @param line 表格行文本
 * @returns 列数据数组，如果不是有效行返回 null
 */
export function parseTableRow(line: string): string[] | null {
  // 检查是否是表格行（以 | 开始和结束）
  var trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.charAt(0) !== '|') {
    return null;
  }
  if (trimmed.charAt(trimmed.length - 1) !== '|') {
    return null;
  }

  // 按 | 分割
  var parts = trimmed.split('|');

  // 去除首尾空元素（因为首尾都是 |，分割后首尾为空字符串）
  // 手动处理，不使用 slice
  var result: string[] = [];
  for (var i = 0; i < parts.length; i++) {
    // 跳过第一个和最后一个空元素
    if (i === 0 || i === parts.length - 1) {
      continue;
    }
    // trim 每列
    result.push(parts[i].trim());
  }

  return result;
}

/**
 * 检查是否是表头行
 * @param columns 列数据
 * @returns 是否是表头行
 */
function isHeaderRow(columns: string[]): boolean {
  if (columns.length < 3) {
    return false;
  }
  var col0 = columns[0].toLowerCase();
  var col1 = columns[1].toLowerCase();
  var col2 = columns[2].toLowerCase();
  return col0.indexOf('序号') !== -1 && col1.indexOf('原句') !== -1 && col2.indexOf('修改') !== -1;
}

/**
 * 检查是否是分隔行
 * @param columns 列数据
 * @returns 是否是分隔行
 */
function isSeparatorRow(columns: string[]): boolean {
  if (columns.length === 0) {
    return false;
  }
  // 分隔行格式如 :--- 或 --- 或 :-: 等
  for (var i = 0; i < columns.length; i++) {
    var col = columns[i];
    // 必须包含 - 且主要由 - 和 : 组成
    if (col.indexOf('-') === -1) {
      return false;
    }
    // 检查是否只包含 - 和 :
    for (var j = 0; j < col.length; j++) {
      var ch = col.charAt(j);
      if (ch !== '-' && ch !== ':') {
        return false;
      }
    }
  }
  return true;
}

/**
 * 流式解析单行
 * 将新接收的一行添加到缓冲区，尝试解析出完整的表格行
 * @param state 当前解析状态
 * @param line 新接收的一行
 * @param sentenceMap 序号到 sentenceId 的映射
 * @returns 解析结果和更新后的状态
 */
export function parseStreamingLine(
  state: ParserState,
  line: string,
  sentenceMap: Map<number, string>
): { result: AIProofreadResult | null; newState: ParserState } {
  // 将新行添加到缓冲区
  var newBuffer = state.buffer + line;

  // 查找完整的行（以换行符结束）
  var newlineIndex = newBuffer.indexOf('\n');
  var completeLine = '';
  var remainingBuffer = newBuffer;

  if (newlineIndex !== -1) {
    // 提取完整行
    completeLine = newBuffer.substring(0, newlineIndex);
    remainingBuffer = newBuffer.substring(newlineIndex + 1);
  } else {
    // 没有完整行，保存到缓冲区等待更多数据
    return {
      result: null,
      newState: {
        buffer: newBuffer,
        inTable: state.inTable,
        headerFound: state.headerFound,
        currentRow: state.currentRow,
      },
    };
  }

  // 解析表格行
  var columns = parseTableRow(completeLine);

  // 如果不是表格行，检查是否需要重置状态
  if (columns === null) {
    // 不在表格中，继续等待
    return {
      result: null,
      newState: {
        buffer: remainingBuffer,
        inTable: false,
        headerFound: false,
        currentRow: [],
      },
    };
  }

  // 检查是否是表头行
  if (isHeaderRow(columns)) {
    return {
      result: null,
      newState: {
        buffer: remainingBuffer,
        inTable: true,
        headerFound: true,
        currentRow: [],
      },
    };
  }

  // 检查是否是分隔行
  if (isSeparatorRow(columns)) {
    return {
      result: null,
      newState: {
        buffer: remainingBuffer,
        inTable: state.inTable,
        headerFound: state.headerFound,
        currentRow: [],
      },
    };
  }

  // 解析数据行
  if (columns.length >= 3) {
    var seqNumStr = columns[0];
    var originalText = columns[1];
    var suggestion = columns[2];

    // 解析序号
    var seqNum = parseInt(seqNumStr, 10);
    if (isNaN(seqNum)) {
      // 序号解析失败，跳过此行
      return {
        result: null,
        newState: {
          buffer: remainingBuffer,
          inTable: state.inTable,
          headerFound: state.headerFound,
          currentRow: [],
        },
      };
    }

    // 从映射中获取 sentenceId
    var sentenceId = sentenceMap.get(seqNum);
    if (sentenceId === undefined) {
      // 未找到映射，使用默认值
      sentenceId = 'unknown-' + seqNum;
    }

    // 判断是否有问题
    // 建议为"无"或空表示没有问题
    var hasIssue = true;
    if (suggestion === '无' || suggestion === '' || suggestion.trim() === '') {
      hasIssue = false;
    }

    // 构建结果
    var result: AIProofreadResult = {
      sentenceId: sentenceId,
      seqNum: seqNum,
      originalText: originalText,
      suggestion: suggestion,
      hasIssue: hasIssue,
    };

    return {
      result: result,
      newState: {
        buffer: remainingBuffer,
        inTable: true,
        headerFound: state.headerFound,
        currentRow: [],
      },
    };
  }

  // 列数不足，跳过
  return {
    result: null,
    newState: {
      buffer: remainingBuffer,
      inTable: state.inTable,
      headerFound: state.headerFound,
      currentRow: [],
    },
  };
}

/**
 * 刷新解析器缓冲区
 * 在流结束时调用，处理缓冲区中剩余的数据
 * @param state 当前解析状态
 * @param sentenceMap 序号到 sentenceId 的映射
 * @returns 解析结果（可能有最后一个结果）
 */
export function flushParser(
  state: ParserState,
  sentenceMap: Map<number, string>
): { result: AIProofreadResult | null } {
  // 如果缓冲区为空，直接返回
  if (state.buffer.trim().length === 0) {
    return { result: null };
  }

  // 尝试解析缓冲区中的最后一行
  var columns = parseTableRow(state.buffer);

  // 如果不是有效的表格行，返回空
  if (columns === null || columns.length < 3) {
    return { result: null };
  }

  // 检查是否是表头行或分隔行
  if (isHeaderRow(columns) || isSeparatorRow(columns)) {
    return { result: null };
  }

  // 解析数据行
  var seqNumStr = columns[0];
  var originalText = columns[1];
  var suggestion = columns[2];

  // 解析序号
  var seqNum = parseInt(seqNumStr, 10);
  if (isNaN(seqNum)) {
    return { result: null };
  }

  // 从映射中获取 sentenceId
  var sentenceId = sentenceMap.get(seqNum);
  if (sentenceId === undefined) {
    sentenceId = 'unknown-' + seqNum;
  }

  // 判断是否有问题
  var hasIssue = true;
  if (suggestion === '无' || suggestion === '' || suggestion.trim() === '') {
    hasIssue = false;
  }

  // 构建结果
  var result: AIProofreadResult = {
    sentenceId: sentenceId,
    seqNum: seqNum,
    originalText: originalText,
    suggestion: suggestion,
    hasIssue: hasIssue,
  };

  return { result: result };
}
