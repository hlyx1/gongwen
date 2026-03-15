/**
 * 文本分块工具
 * 将句子数组按照字符数限制分割成多个块
 * 兼容 Chrome 78 内核，不使用可选链和空值合并操作符
 */

import type { Sentence, SentenceBlock } from '../types/aiProofread';

/**
 * 将句子数组分割成多个块（均衡分配算法）
 * 以句子为单位分块，不切割句子，尽量保证各块字数均匀
 * 
 * @param sentences - 句子数组
 * @param maxCharsPerRequest - 每块最大字符数，默认3000
 * @returns 块数组
 */
export function splitIntoBlocks(
  sentences: Sentence[],
  maxCharsPerRequest: number
): SentenceBlock[] {
  // 参数校验和默认值处理
  var maxChars = maxCharsPerRequest;
  if (!maxCharsPerRequest || maxCharsPerRequest <= 0) {
    maxChars = 3000;
  }

  // 空数组直接返回
  if (!sentences || sentences.length === 0) {
    return [];
  }

  // 计算每个句子的长度
  var sentenceLengths: number[] = [];
  var totalChars = 0;
  for (var i = 0; i < sentences.length; i++) {
    var len = sentences[i].text ? sentences[i].text.length : 0;
    sentenceLengths.push(len);
    totalChars = totalChars + len;
  }

  // 如果总字符数不超过限制，直接返回一个块
  if (totalChars <= maxChars) {
    return [{
      blockIndex: 0,
      sentences: sentences.slice(),
      charCount: totalChars
    }];
  }

  // 计算需要的块数（向上取整）
  var numBlocks = Math.ceil(totalChars / maxChars);
  
  // 目标每块的平均字符数
  var targetCharsPerBlock = totalChars / numBlocks;

  // 使用动态规划找最佳分割点
  var splitPoints = findOptimalSplitPoints(sentenceLengths, numBlocks, targetCharsPerBlock);

  // 根据分割点构建块
  var blocks: SentenceBlock[] = [];
  var prevSplit = 0;
  
  for (var j = 0; j < splitPoints.length; j++) {
    var splitPoint = splitPoints[j];
    var blockSentences = sentences.slice(prevSplit, splitPoint);
    var blockCharCount = 0;
    for (var k = prevSplit; k < splitPoint; k++) {
      blockCharCount = blockCharCount + sentenceLengths[k];
    }
    
    blocks.push({
      blockIndex: j,
      sentences: blockSentences,
      charCount: blockCharCount
    });
    
    prevSplit = splitPoint;
  }

  // 处理最后一个块
  if (prevSplit < sentences.length) {
    var lastBlockSentences = sentences.slice(prevSplit);
    var lastBlockCharCount = 0;
    for (var m = prevSplit; m < sentences.length; m++) {
      lastBlockCharCount = lastBlockCharCount + sentenceLengths[m];
    }
    
    blocks.push({
      blockIndex: blocks.length,
      sentences: lastBlockSentences,
      charCount: lastBlockCharCount
    });
  }

  return blocks;
}

/**
 * 找到最佳分割点
 * 使用贪心算法，尽量让每块的字符数接近目标值
 * 
 * @param sentenceLengths 各句子的长度数组
 * @param numBlocks 目标块数
 * @param targetCharsPerBlock 目标每块字符数
 * @returns 分割点数组（每个点是下一个块的起始索引）
 */
function findOptimalSplitPoints(
  sentenceLengths: number[],
  numBlocks: number,
  targetCharsPerBlock: number
): number[] {
  var splitPoints: number[] = [];
  var currentSum = 0;
  var currentBlock = 0;
  var remainingBlocks = numBlocks - 1; // 最后一个块不需要分割点

  for (var i = 0; i < sentenceLengths.length && remainingBlocks > 0; i++) {
    currentSum = currentSum + sentenceLengths[i];
    
    // 计算剩余需要处理的句子数和字符数
    var remainingSentences = sentenceLengths.length - i - 1;
    var remainingChars = 0;
    for (var j = i + 1; j < sentenceLengths.length; j++) {
      remainingChars = remainingChars + sentenceLengths[j];
    }
    
    // 计算剩余块的平均目标字符数
    var remainingTargetChars = remainingBlocks > 0 ? remainingChars / remainingBlocks : remainingChars;
    
    // 判断是否应该在此处分割
    // 条件：当前累计接近目标，且剩余句子足够分配到剩余块
    if (remainingSentences >= remainingBlocks) {
      // 计算如果在此分割，当前块与目标的差距
      var currentDiff = Math.abs(currentSum - targetCharsPerBlock);
      // 计算如果再加一句，当前块与目标的差距
      var nextSum = currentSum + (sentenceLengths[i + 1] || 0);
      var nextDiff = Math.abs(nextSum - targetCharsPerBlock);
      
      // 如果当前累计已经超过目标，或者加下一句会更远离目标
      if (currentSum >= targetCharsPerBlock || (currentDiff <= nextDiff && currentSum >= targetCharsPerBlock * 0.8)) {
        splitPoints.push(i + 1);
        currentSum = 0;
        currentBlock = currentBlock + 1;
        remainingBlocks = remainingBlocks - 1;
        
        // 更新目标字符数（根据剩余字符重新计算）
        if (remainingBlocks > 0) {
          targetCharsPerBlock = remainingChars / remainingBlocks;
        }
      }
    }
  }

  return splitPoints;
}

/**
 * 计算句子数组的总字符数
 * 
 * @param sentences - 句子数组
 * @returns 总字符数
 */
export function calculateTotalChars(sentences: Sentence[]): number {
  if (!sentences || sentences.length === 0) {
    return 0;
  }

  var total = 0;
  for (var i = 0; i < sentences.length; i++) {
    var sentence = sentences[i];
    if (sentence.text) {
      total = total + sentence.text.length;
    }
  }
  return total;
}

/**
 * 获取分块统计信息
 * 
 * @param blocks - 块数组
 * @returns 统计信息对象
 */
export function getBlockStats(blocks: SentenceBlock[]): {
  totalBlocks: number;
  totalSentences: number;
  totalChars: number;
  avgCharsPerBlock: number;
  maxCharsInBlock: number;
  minCharsInBlock: number;
} {
  if (!blocks || blocks.length === 0) {
    return {
      totalBlocks: 0,
      totalSentences: 0,
      totalChars: 0,
      avgCharsPerBlock: 0,
      maxCharsInBlock: 0,
      minCharsInBlock: 0
    };
  }

  var totalSentences = 0;
  var totalChars = 0;
  var maxChars = blocks[0].charCount;
  var minChars = blocks[0].charCount;

  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    totalSentences = totalSentences + block.sentences.length;
    totalChars = totalChars + block.charCount;

    if (block.charCount > maxChars) {
      maxChars = block.charCount;
    }
    if (block.charCount < minChars) {
      minChars = block.charCount;
    }
  }

  return {
    totalBlocks: blocks.length,
    totalSentences: totalSentences,
    totalChars: totalChars,
    avgCharsPerBlock: Math.round(totalChars / blocks.length),
    maxCharsInBlock: maxChars,
    minCharsInBlock: minChars
  };
}
