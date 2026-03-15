/**
 * 句子切分工具
 * 将公文 AST 节点按分隔符切分为句子
 * 兼容 Chrome 78 内核，不使用可选链和空值合并操作符
 */

import type { Sentence } from '../types/aiProofread';
import type { GongwenAST, DocumentNode } from '../types/ast';
import { NodeType } from '../types/ast';

/** 句号分隔符 */
const PERIOD = '。';
/** 感叹号分隔符 */
const EXCLAMATION = '！';
/** 问号分隔符 */
const QUESTION = '？';
/** 省略号分隔符 */
const ELLIPSIS = '……';
/** 分号分隔符 */
const SEMICOLON = '；';
/** 换行符分隔符 */
const NEWLINE = '\n';

/** 所有分隔符数组 */
const DELIMITERS = [PERIOD, EXCLAMATION, QUESTION, ELLIPSIS, SEMICOLON, NEWLINE];

/** 配对符号映射类型 */
type PairMap = { [key: string]: string };

/** 配对符号：开始符号 -> 结束符号 */
const PAIR_START_TO_END: PairMap = {
  '「': '」',
  '『': '』',
  '《': '》',
  '（': '）',
  '【': '】',
};

/** 配对符号：结束符号 -> 开始符号 */
var PAIR_END_TO_START: PairMap = {
  '」': '「',
  '』': '『',
  '》': '《',
  '）': '（',
  '】': '【',
};

/** 需要切分的节点类型集合 */
var SPLITTABLE_TYPES: { [key: string]: boolean } = {
  [NodeType.PARAGRAPH]: true,
  [NodeType.HEADING_1]: true,
  [NodeType.HEADING_2]: true,
  [NodeType.HEADING_3]: true,
  [NodeType.HEADING_4]: true,
  [NodeType.ADDRESSEE]: true,
};

/** 不需要切分的节点类型集合 */
var NON_SPLITTABLE_TYPES: { [key: string]: boolean } = {
  [NodeType.DOCUMENT_TITLE]: true,
  [NodeType.ATTACHMENT]: true,
  [NodeType.SIGNATURE]: true,
  [NodeType.DATE]: true,
  [NodeType.REMARK]: true,
  [NodeType.TABLE]: true,
};

/**
 * 判断某个位置是否在引号、书名号、括号内
 * @param text 文本内容
 * @param position 要判断的位置
 * @returns 如果在配对符号内返回 true，否则返回 false
 */
function isInQuoteOrBracket(text: string, position: number): boolean {
  var stack: string[] = [];
  var i = 0;

  for (i = 0; i < position; i++) {
    var char = text[i];

    // 如果是开始符号，压入栈
    if (PAIR_START_TO_END[char]) {
      stack.push(char);
    }
    // 如果是结束符号，检查是否与栈顶匹配
    else if (PAIR_END_TO_START[char]) {
      var startChar = PAIR_END_TO_START[char];
      // 从栈顶向下查找匹配的开始符号
      var j = stack.length - 1;
      while (j >= 0) {
        if (stack[j] === startChar) {
          // 移除匹配的开始符号及其后面的所有符号
          stack.splice(j, 1);
          break;
        }
        j--;
      }
    }
  }

  // 如果栈不为空，说明当前位置在某个配对符号内
  return stack.length > 0;
}

/**
 * 查找下一个分隔符位置
 * @param text 文本内容
 * @param startPos 开始查找的位置
 * @returns 分隔符位置和分隔符长度的对象，如果没找到返回 null
 */
function findNextDelimiter(text: string, startPos: number): { position: number; length: number } | null {
  var result: { position: number; length: number } | null = null;
  var minPos = text.length;
  var delimiterLength = 0;
  var i = 0;

  for (i = 0; i < DELIMITERS.length; i++) {
    var delimiter = DELIMITERS[i];
    var pos = text.indexOf(delimiter, startPos);

    if (pos !== -1 && pos < minPos) {
      // 检查该位置是否在配对符号内
      if (!isInQuoteOrBracket(text, pos)) {
        minPos = pos;
        delimiterLength = delimiter.length;
        result = {
          position: pos,
          length: delimiterLength,
        };
      }
    }
  }

  return result;
}

/**
 * 切分单个节点的文本为句子
 * @param node 文档节点
 * @param globalSeq 全局序号计数器（引用传递）
 * @returns 句子数组
 */
function splitNodeIntoSentences(node: DocumentNode, globalSeq: { value: number }): Sentence[] {
  var sentences: Sentence[] = [];
  var content = node.content;
  var startPos = 0;
  var localSeq = 1;

  // 如果内容为空，返回空数组
  if (!content || content.length === 0) {
    return sentences;
  }

  // 查找所有分隔符并切分
  var delimiter = findNextDelimiter(content, startPos);

  while (delimiter !== null) {
    var endPos = delimiter.position + delimiter.length;
    var sentenceText = content.substring(startPos, endPos);

    // 去除首尾空白
    sentenceText = sentenceText.trim();

    // 如果句子不为空，添加到结果中
    if (sentenceText.length > 0) {
      globalSeq.value = globalSeq.value + 1;

      var sentenceId = node.type + '-' + node.lineNumber + '-' + localSeq;

      sentences.push({
        id: sentenceId,
        nodeId: node.type + '-' + node.lineNumber,
        seqNum: globalSeq.value,
        text: sentenceText,
        nodeType: node.type,
        lineNumber: node.lineNumber,
      });

      localSeq = localSeq + 1;
    }

    startPos = endPos;
    delimiter = findNextDelimiter(content, startPos);
  }

  // 处理最后剩余的文本（没有分隔符结尾的部分）
  if (startPos < content.length) {
    var remainingText = content.substring(startPos);
    remainingText = remainingText.trim();

    if (remainingText.length > 0) {
      globalSeq.value = globalSeq.value + 1;

      var lastSentenceId = node.type + '-' + node.lineNumber + '-' + localSeq;

      sentences.push({
        id: lastSentenceId,
        nodeId: node.type + '-' + node.lineNumber,
        seqNum: globalSeq.value,
        text: remainingText,
        nodeType: node.type,
        lineNumber: node.lineNumber,
      });
    }
  }

  return sentences;
}

/**
 * 将公文 AST 切分为句子数组
 * @param ast 公文 AST
 * @returns 包含句子数组和句子映射的对象
 *   - sentences: Sentence[] 句子数组
 *   - sentenceMap: Map<number, string> 全局序号到 sentenceId 的映射
 */
function splitIntoSentences(ast: GongwenAST): { sentences: Sentence[]; sentenceMap: Map<number, string> } {
  var sentences: Sentence[] = [];
  var sentenceMap = new Map<number, string>();

  // 全局序号计数器（使用对象包装以实现引用传递）
  var globalSeq = { value: 0 };

  // 处理标题节点（标题不切分，清理换行符）
  // 公文标题可能因排版目的换行，但应作为一个整体发送给AI
  if (ast.title && ast.title.length > 0) {
    // 收集所有标题行的内容
    var titleLines: string[] = [];
    var firstLineNumber = 1;
    var titleIndex = 0;
    
    for (titleIndex = 0; titleIndex < ast.title.length; titleIndex++) {
      var titleNode = ast.title[titleIndex];
      
      // 记录第一个标题节点的行号
      if (titleIndex === 0) {
        firstLineNumber = titleNode.lineNumber;
      }
      
      // 收集每行标题内容
      if (titleNode.content && titleNode.content.trim().length > 0) {
        titleLines.push(titleNode.content.trim());
      }
    }
    
    // 将所有标题行合并为一个整体，清理换行符和多余空白
    if (titleLines.length > 0) {
      globalSeq.value = globalSeq.value + 1;
      
      // 合并所有标题行，用空格连接（清理换行符）
      var mergedTitleText = titleLines.join('');
      // 清理可能残留的换行符和多余空白
      mergedTitleText = mergedTitleText.split('\n').join('');
      mergedTitleText = mergedTitleText.split('\r').join('');
      // 清理多余空白字符
      mergedTitleText = mergedTitleText.split(/\s+/).join('');
      
      var titleSentenceId = NodeType.DOCUMENT_TITLE + '-' + firstLineNumber + '-1';
      
      sentences.push({
        id: titleSentenceId,
        nodeId: NodeType.DOCUMENT_TITLE + '-' + firstLineNumber,
        seqNum: globalSeq.value,
        text: mergedTitleText,
        nodeType: NodeType.DOCUMENT_TITLE,
        lineNumber: firstLineNumber,
      });
      
      sentenceMap.set(globalSeq.value, titleSentenceId);
    }
  }

  // 处理正文节点
  if (ast.body && ast.body.length > 0) {
    var bodyIndex = 0;
    for (bodyIndex = 0; bodyIndex < ast.body.length; bodyIndex++) {
      var node = ast.body[bodyIndex];

      // 判断节点类型是否需要切分
      if (SPLITTABLE_TYPES[node.type]) {
        // 需要切分的节点类型
        var nodeSentences = splitNodeIntoSentences(node, globalSeq);
        var sIndex = 0;
        for (sIndex = 0; sIndex < nodeSentences.length; sIndex++) {
          var sentence = nodeSentences[sIndex];
          sentences.push(sentence);
          sentenceMap.set(sentence.seqNum, sentence.id);
        }
      } else if (NON_SPLITTABLE_TYPES[node.type]) {
        // 不需要切分的节点类型，作为整体处理
        if (node.content && node.content.trim().length > 0) {
          globalSeq.value = globalSeq.value + 1;

          var wholeSentenceId = node.type + '-' + node.lineNumber + '-1';

          sentences.push({
            id: wholeSentenceId,
            nodeId: node.type + '-' + node.lineNumber,
            seqNum: globalSeq.value,
            text: node.content.trim(),
            nodeType: node.type,
            lineNumber: node.lineNumber,
          });

          sentenceMap.set(globalSeq.value, wholeSentenceId);
        }
      }
    }
  }

  return {
    sentences: sentences,
    sentenceMap: sentenceMap,
  };
}

export {
  splitIntoSentences,
  isInQuoteOrBracket,
  DELIMITERS,
  SPLITTABLE_TYPES,
  NON_SPLITTABLE_TYPES,
};
