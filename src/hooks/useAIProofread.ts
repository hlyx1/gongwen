/**
 * AI 审核 Hook
 * 管理 AI 校对的状态和流程
 * 兼容 Chrome 78 内核，不使用可选链和空值合并操作符
 */

import { useState, useCallback } from 'react';
import type {
  AIProofreadState,
  AIProofreadResult,
  AIProofreadConfig,
} from '../types/aiProofread';
import type { GongwenAST } from '../types/ast';
import { isAIServiceConfigured } from '../services/aiServiceConfig';
import { sendAllBlocksStreaming } from '../services/aiProofreadService';
import { splitIntoSentences } from '../utils/sentenceSplitter';
import { splitIntoBlocks } from '../utils/textBlockSplitter';

/**
 * 完整的审核配置（包含内部参数）
 */
export interface FullProofreadConfig extends AIProofreadConfig {
  maxCharsPerRequest: number;
  maxConcurrentRequests: number;
}

/**
 * Hook 返回类型
 */
export interface UseAIProofreadReturn {
  /** AI 校对状态 */
  state: AIProofreadState;
  /** 开始校对 */
  startProofread: (ast: GongwenAST, config: FullProofreadConfig) => Promise<void>;
  /** 重置状态 */
  resetProofread: () => void;
  /** AI 服务是否已配置 */
  isConfigured: boolean;
}

/**
 * 初始状态
 */
var INITIAL_STATE: AIProofreadState = {
  status: 'idle',
  processedSentences: 0,
  totalSentences: 0,
  results: new Map(),
  error: null,
};

/**
 * AI 审核 Hook
 * 负责管理 AI 校对的完整流程
 */
export function useAIProofread(): UseAIProofreadReturn {
  // 管理状态
  var _useState = useState<AIProofreadState>(INITIAL_STATE);
  var state = _useState[0];
  var setState = _useState[1];

  /**
   * 开始校对
   * @param ast 公文 AST
   * @param config AI 校对配置（包含内部参数）
   */
  var startProofread = useCallback(function (
    ast: GongwenAST,
    config: FullProofreadConfig
  ): Promise<void> {
    return new Promise(function (resolve, reject) {
      // 检查 AI 服务配置是否完整
      if (!isAIServiceConfigured()) {
        setState({
          status: 'error',
          processedSentences: 0,
          totalSentences: 0,
          results: new Map(),
          error: 'AI服务未配置，请检查环境变量',
        });
        reject(new Error('AI服务未配置'));
        return;
      }

      // 检查 AST 是否有效
      if (!ast || (!ast.title && !ast.body)) {
        setState({
          status: 'error',
          processedSentences: 0,
          totalSentences: 0,
          results: new Map(),
          error: '公文内容为空',
        });
        reject(new Error('公文内容为空'));
        return;
      }

      // 切分句子
      var splitResult = splitIntoSentences(ast);
      var sentences = splitResult.sentences;
      var sentenceMap = splitResult.sentenceMap;

      // 检查是否有句子
      if (sentences.length === 0) {
        setState({
          status: 'error',
          processedSentences: 0,
          totalSentences: 0,
          results: new Map(),
          error: '未提取到可审核的句子',
        });
        reject(new Error('未提取到可审核的句子'));
        return;
      }

      // 分块
      var blocks = splitIntoBlocks(sentences, config.maxCharsPerRequest);

      // 检查是否有块
      if (blocks.length === 0) {
        setState({
          status: 'error',
          processedSentences: 0,
          totalSentences: 0,
          results: new Map(),
          error: '分块失败',
        });
        reject(new Error('分块失败'));
        return;
      }

      // 设置加载状态
      setState({
        status: 'loading',
        processedSentences: 0,
        totalSentences: sentences.length,
        results: new Map(),
        error: null,
      });

      // 创建结果 Map
      var resultsMap = new Map<string, AIProofreadResult>();
      var processedCount = 0;

      /**
       * 处理单个校对结果
       * @param result 校对结果
       */
      function handleResult(result: AIProofreadResult): void {
        resultsMap.set(result.sentenceId, result);
        processedCount = processedCount + 1;

        // 更新状态
        setState({
          status: 'loading',
          processedSentences: processedCount,
          totalSentences: sentences.length,
          results: new Map(resultsMap),
          error: null,
        });
      }

      /**
       * 处理进度更新
       * @param processed 已处理的块数
       * @param total 总块数
       */
      function handleProgress(_processed: number, _total: number): void {
        // 进度更新由 handleResult 处理，这里可以用于其他用途
      }

      // 发送请求
      sendAllBlocksStreaming(
        blocks,
        config.customCheckItems,
        sentenceMap,
        config.maxConcurrentRequests,
        handleResult,
        handleProgress
      )
        .then(function () {
          // 成功完成
          setState({
            status: 'success',
            processedSentences: processedCount,
            totalSentences: sentences.length,
            results: new Map(resultsMap),
            error: null,
          });
          resolve();
        })
        .catch(function (error) {
          // 发生错误
          setState({
            status: 'error',
            processedSentences: processedCount,
            totalSentences: sentences.length,
            results: new Map(resultsMap),
            error: error.message || '审核失败',
          });
          reject(error);
        });
    });
  }, []);

  /**
   * 重置状态
   */
  var resetProofread = useCallback(function (): void {
    setState(INITIAL_STATE);
  }, []);

  return {
    state: state,
    startProofread: startProofread,
    resetProofread: resetProofread,
    isConfigured: isAIServiceConfigured(),
  };
}
