/**
 * AI 审核服务模块
 * 负责构建提示词、发送请求、解析流式响应
 * 兼容 Chrome 78 内核，不使用可选链和空值合并操作符
 */

import type {
  SentenceBlock,
  CustomCheckItem,
  CustomExampleItem,
  AIProofreadResult,
  OpenAIChatRequest,
} from '../types/aiProofread';
import { getAIServiceConfig } from './aiServiceConfig';
import { parseStreamingLine, createInitialParserState, flushParser } from '../utils/aiResponseParser';

/**
 * 系统内置检查项
 * 用于在设置界面显示，与提示词中的检查项保持一致
 */
export var BUILTIN_CHECK_ITEMS = [
  '错别字、漏字、重复字',
  '谓语、宾语缺失',
  '句式杂糅',
  '其他明显错误的情况',
];

/**
 * 系统内置示例
 */
var BUILTIN_EXAMPLES: CustomExampleItem[] = [
  { originalText: '请各部门做好工作部暑', suggestion: '"部暑"→"部署"："暑"为错别字' },
  { originalText: '会议截止日期是明天下午三点。', suggestion: '"截止"→"截至"："截止"是动词，不能带时间点，"截至"是介词，带时间点' },
  { originalText: '公司决定提高员工的水平。', suggestion: '"水平"→"工作水平"：宾语缺失："提高"需搭配具体对象' },
  { originalText: '本着以节约资源为原则，我们制定了新方案。', suggestion: '"本着以节约资源为原则"→"本着节约资源的原则"："本着"与"以……为"杂糅，二者只能选其一' },
  { originalText: '2026年3月15日', suggestion: '无' },
];

/**
 * 构建完整提示词
 * @param block 句子块
 * @param customCheckItems 用户添加的检查项列表（每项为字符串）
 * @param customExampleItems 用户添加的示例行列表
 * @returns 完整提示词字符串
 */
export function buildPrompt(
  block: SentenceBlock,
  customCheckItems: CustomCheckItem[],
  customExampleItems: CustomExampleItem[]
): string {
  var prompt = 
    '你是一个文章审核员，对于给定被分割为若干个纠错单元的文章，你需要进行以纠错单元为单位的审核。\n' +
    '\n' +
    '# 工作流程\n' +
    '\n' +
    '从第一个纠错单元开始，逐个纠错单元分析是否存在以下问题：\n' +
    '\n' +
    '1. 错别字、漏字、重复字\n' +
    '2. 谓语、宾语缺失\n' +
    '3. 句式杂糅\n' +
    '4. 其他明显错误的情况';

  // 添加用户自定义检查项（追加到序号列表）
  for (var i = 0; i < customCheckItems.length; i++) {
    var item = customCheckItems[i];
    if (item && item.trim().length > 0) {
      prompt += '\n' + (i + 5) + '. ' + item.trim();
    }
  }

  prompt += '\n\n' +
    '# 输出要求\n' +
    '\n' +
    '以 **Markdown 表格**格式输出，表格包含三列：序号、原句、建议。\n' +
    '\n' +
    '- **序号**：必须填写为"1"、"2"等，按序号顺序严格递增。\n' +
    '- **原句**：直接重复原句内容。\n' +
    '- **建议**：\n' +
    '\n' +
    '  - 若无问题：填写 `无`。\n' +
    '  - 若发现问题：格式为 `"旧文本"→"新文本"：原因`\n' +
    '\n' +
    '# 输出示例\n' +
    '\n' +
    '| 序号 | 原句 | 建议 |\n' +
    '| --- | --- | --- |';

  // 添加内置示例
  for (var bi = 0; bi < BUILTIN_EXAMPLES.length; bi++) {
    var builtinItem = BUILTIN_EXAMPLES[bi];
    prompt += '\n| ' + (bi + 1) + ' | ' + builtinItem.originalText + ' | ' + builtinItem.suggestion + ' |';
  }

  // 添加用户自定义示例行
  for (var j = 0; j < customExampleItems.length; j++) {
    var exampleItem = customExampleItems[j];
    if (exampleItem.originalText && exampleItem.originalText.trim().length > 0) {
      prompt += '\n| ' + (j + BUILTIN_EXAMPLES.length + 1) + ' | ' + exampleItem.originalText + ' | ' + (exampleItem.suggestion || '无') + ' |';
    }
  }

  prompt += '\n\n' +
    '# 工作原则\n' +
    '\n' +
    '- 表格必须逐句生成，**绝不跳过任何纠错单元**，每个纠错单元占表格一行。\n' +
    '- 提供的文本大部分地方无错，修正建议需简洁准确。\n' +
    '- 名字之间的多余空格不是问题，只是为了排版对齐。但是除名字之外的空格一般是存在问题。\n' +
    '- 确保表格对齐清晰，无需额外说明或代码块。\n';

  // 添加待审核的句子列表（使用标签格式）
  prompt += '\n';
  for (var k = 0; k < block.sentences.length; k++) {
    var sentence = block.sentences[k];
    prompt += '\n<纠错单元' + sentence.seqNum + '>' + sentence.text + '</纠错单元' + sentence.seqNum + '>';
  }

  return prompt;
}

/**
 * 发送单个句子块的流式请求
 * @param block 句子块
 * @param customCheckItems 自定义检查项列表
 * @param customExampleItems 自定义示例行列表
 * @param sentenceMap 序号到 sentenceId 的映射
 * @param onResult 每解析出一行就调用的回调函数
 * @param onRawResponse 可选，收到完整响应时的回调（用于调试）
 * @returns Promise<void>
 */
export function sendBlockStreaming(
  block: SentenceBlock,
  customCheckItems: CustomCheckItem[],
  customExampleItems: CustomExampleItem[],
  sentenceMap: Map<number, string>,
  onResult: (result: AIProofreadResult) => void,
  onRawResponse?: (rawResponse: string, blockIndex: number) => void,
  blockIndex?: number
): Promise<void> {
  return new Promise(function (resolve, reject) {
    // 获取 AI 服务配置
    var config = getAIServiceConfig();
    if (config === null) {
      reject(new Error('AI服务未配置'));
      return;
    }

    // 构建提示词
    var prompt = buildPrompt(block, customCheckItems, customExampleItems);

    // 构建请求体
    var requestBody: OpenAIChatRequest = {
      model: config.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
      top_p: config.topP,
      top_k: config.topK,
      min_p: config.minP,
      presence_penalty: config.presencePenalty,
      repetition_penalty: config.repetitionPenalty,
    };

    // 发送请求
    fetch(config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.apiKey,
      },
      body: JSON.stringify(requestBody),
    })
      .then(function (response) {
        // 检查响应状态
        if (!response.ok) {
          // 处理常见错误
          if (response.status === 401) {
            throw new Error('API密钥无效，请检查配置');
          } else if (response.status === 429) {
            throw new Error('请求过于频繁，请稍后重试');
          } else if (response.status === 500) {
            throw new Error('AI服务内部错误，请稍后重试');
          } else {
            throw new Error('请求失败，状态码：' + response.status);
          }
        }

        // 检查响应体
        if (!response.body) {
          throw new Error('响应体为空');
        }

        // 获取读取器
        var reader = response.body.getReader();
        var decoder = new TextDecoder('utf-8');
        var parserState = createInitialParserState();
        // 用于调试：收集完整的响应文本
        var rawResponseText = '';

        // 读取流式数据
        function readStream(): Promise<void> {
          return reader.read().then(function (result) {
            // 检查是否结束
            if (result.done) {
              // 刷新解析器，处理缓冲区中剩余的数据
              var flushResult = flushParser(parserState, sentenceMap);
              for (var fi = 0; fi < flushResult.results.length; fi++) {
                onResult(flushResult.results[fi]);
              }
              // 调试：输出完整的响应文本
              if (onRawResponse && blockIndex !== undefined) {
                onRawResponse(rawResponseText, blockIndex);
              }
              resolve();
              return;
            }

            // 解码数据
            var chunk = decoder.decode(result.value, { stream: true });

            // 按 SSE 格式解析（每行以 "data: " 开头）
            var lines = chunk.split('\n');

            for (var i = 0; i < lines.length; i++) {
              var line = lines[i];

              // 跳过空行
              if (line.trim().length === 0) {
                continue;
              }

              // 检查是否是 SSE 数据行
              if (line.indexOf('data: ') === 0) {
                // 提取数据部分
                var data = line.substring(6);

                // 检查是否是结束标记
                if (data === '[DONE]') {
                  // 刷新解析器，处理缓冲区中剩余的数据
                  var flushResult2 = flushParser(parserState, sentenceMap);
                  for (var fi2 = 0; fi2 < flushResult2.results.length; fi2++) {
                    onResult(flushResult2.results[fi2]);
                  }
                  // 调试：输出完整的响应文本
                  if (onRawResponse && blockIndex !== undefined) {
                    onRawResponse(rawResponseText, blockIndex);
                  }
                  resolve();
                  return;
                }

                // 解析 JSON
                try {
                  var json = JSON.parse(data);
                  // 提取内容
                  if (
                    json.choices &&
                    json.choices.length > 0 &&
                    json.choices[0].delta &&
                    json.choices[0].delta.content
                  ) {
                    var content = json.choices[0].delta.content;
                    // 收集响应文本
                    rawResponseText = rawResponseText + content;

                    // 使用解析器解析表格行
                    var parseResult = parseStreamingLine(parserState, content, sentenceMap);
                    parserState = parseResult.newState;

                    // 如果解析出结果，调用回调
                    if (parseResult.result !== null) {
                      onResult(parseResult.result);
                    }
                  }
                } catch (e) {
                  // JSON 解析失败，可能是数据不完整，忽略
                }
              }
            }

            // 继续读取
            return readStream();
          });
        }

        return readStream();
      })
      .catch(function (error) {
        // 处理网络错误
        if (error.message) {
          reject(error);
        } else {
          reject(new Error('网络请求失败'));
        }
      });
  });
}

/**
 * 发送所有句子块的流式请求（带并发控制）
 * @param blocks 句子块数组
 * @param customCheckItems 自定义检查项列表
 * @param customExampleItems 自定义示例行列表
 * @param sentenceMap 序号到 sentenceId 的映射
 * @param maxConcurrent 最大并发数，默认3
 * @param onResult 每解析出一行就调用的回调函数
 * @param onProgress 每完成一个块就调用的进度回调
 * @returns Promise<void>
 */
export function sendAllBlocksStreaming(
  blocks: SentenceBlock[],
  customCheckItems: CustomCheckItem[],
  customExampleItems: CustomExampleItem[],
  sentenceMap: Map<number, string>,
  maxConcurrent: number,
  onResult: (result: AIProofreadResult) => void,
  onProgress: (processed: number, total: number) => void
): Promise<void> {
  // 默认并发数为3
  if (maxConcurrent === undefined || maxConcurrent < 1) {
    maxConcurrent = 3;
  }

  return new Promise(function (resolve, reject) {
    var total = blocks.length;
    var processed = 0;
    var currentIndex = 0;
    var activeCount = 0;
    var hasError = false;
    var errorMessage = '';
    // 用于调试：收集所有块的响应文本
    var allRawResponses: string[] = [];
    // 用于调试：收集所有解析出的序号
    var allParsedSeqNums: number[] = [];
    // 用于调试：收集发送的句子序号
    var allSentSeqNums: number[] = [];

    // 收集所有发送的句子序号
    for (var bi = 0; bi < blocks.length; bi++) {
      var blockSentences = blocks[bi].sentences;
      for (var si = 0; si < blockSentences.length; si++) {
        allSentSeqNums.push(blockSentences[si].seqNum);
      }
    }

    // 检查是否有块需要处理
    if (total === 0) {
      resolve();
      return;
    }

    /**
     * 处理单个块的原始响应（用于调试）
     * @param rawResponse 原始响应文本
     * @param blockIndex 块索引
     */
    function handleRawResponse(rawResponse: string, blockIndex: number): void {
      // 确保数组足够大
      while (allRawResponses.length <= blockIndex) {
        allRawResponses.push('');
      }
      allRawResponses[blockIndex] = rawResponse;
    }

    /**
     * 包装 onResult 回调，收集解析出的序号
     */
    function wrappedOnResult(result: AIProofreadResult): void {
      allParsedSeqNums.push(result.seqNum);
      onResult(result);
    }

    /**
     * 带重试的发送单个块
     * @param blockIndex 块索引
     * @param retryCount 当前重试次数
     * @param maxRetries 最大重试次数
     */
    function sendBlockWithRetry(
      blockIndex: number,
      retryCount: number,
      maxRetries: number
    ): void {
      var block = blocks[blockIndex];

      sendBlockStreaming(block, customCheckItems, customExampleItems, sentenceMap, wrappedOnResult, handleRawResponse, blockIndex)
        .then(function () {
          // 成功完成
          processed++;
          activeCount--;
          onProgress(processed, total);

          // 检查是否全部完成
          if (processed === total) {
            // 调试：打印所有块的响应到控制台
            console.log('=== AI校对调试信息 ===');
            console.log('总块数:', total);
            console.log('发送的句子序号:', allSentSeqNums.sort(function(a, b) { return a - b; }).join(', '));
            console.log('解析出的句子序号:', allParsedSeqNums.sort(function(a, b) { return a - b; }).join(', '));
            console.log('发送数量:', allSentSeqNums.length, '解析数量:', allParsedSeqNums.length);
            // 找出缺失的序号
            var missingSeqNums: number[] = [];
            for (var mi = 0; mi < allSentSeqNums.length; mi++) {
              if (allParsedSeqNums.indexOf(allSentSeqNums[mi]) === -1) {
                missingSeqNums.push(allSentSeqNums[mi]);
              }
            }
            console.log('缺失的序号:', missingSeqNums.join(', '));
            console.log('各块响应长度:', allRawResponses.map(function(r, i) { return '块' + (i+1) + ': ' + r.length + '字符'; }));
            console.log('=== AI返回的完整Markdown表格 ===');
            console.log(allRawResponses.join('\n\n'));
            console.log('=== 调试信息结束 ===');

            if (hasError) {
              reject(new Error(errorMessage));
            } else {
              resolve();
            }
            return;
          }

          // 继续处理下一个块
          processNext();
        })
        .catch(function (error) {
          // 检查是否需要重试
          if (retryCount < maxRetries) {
            // 延迟后重试
            setTimeout(function () {
              sendBlockWithRetry(blockIndex, retryCount + 1, maxRetries);
            }, 1000 * (retryCount + 1)); // 递增延迟
          } else {
            // 重试次数用尽，记录错误
            hasError = true;
            if (errorMessage.length > 0) {
              errorMessage += '; ';
            }
            errorMessage += '块 ' + (blockIndex + 1) + ' 失败: ' + error.message;

            processed++;
            activeCount--;
            onProgress(processed, total);

            // 检查是否全部完成
            if (processed === total) {
              // 调试：打印所有块的响应到控制台（即使有错误）
              console.log('=== AI校对调试信息（有错误）===');
              console.log('总块数:', total);
              console.log('错误信息:', errorMessage);
              console.log('发送的句子序号:', allSentSeqNums.sort(function(a, b) { return a - b; }).join(', '));
              console.log('解析出的句子序号:', allParsedSeqNums.sort(function(a, b) { return a - b; }).join(', '));
              console.log('发送数量:', allSentSeqNums.length, '解析数量:', allParsedSeqNums.length);
              var missingSeqNums2: number[] = [];
              for (var mi2 = 0; mi2 < allSentSeqNums.length; mi2++) {
                if (allParsedSeqNums.indexOf(allSentSeqNums[mi2]) === -1) {
                  missingSeqNums2.push(allSentSeqNums[mi2]);
                }
              }
              console.log('缺失的序号:', missingSeqNums2.join(', '));
              console.log('各块响应长度:', allRawResponses.map(function(r, i) { return '块' + (i+1) + ': ' + r.length + '字符'; }));
              console.log('=== AI返回的完整Markdown表格 ===');
              console.log(allRawResponses.join('\n\n'));
              console.log('=== 调试信息结束 ===');

              reject(new Error(errorMessage));
              return;
            }

            // 继续处理下一个块
            processNext();
          }
        });
    }

    /**
     * 处理下一个块
     */
    function processNext(): void {
      // 检查是否还有待处理的块
      while (currentIndex < total && activeCount < maxConcurrent) {
        var blockIndex = currentIndex;
        currentIndex++;
        activeCount++;

        // 发送请求，最多重试3次
        sendBlockWithRetry(blockIndex, 0, 3);
      }
    }

    // 开始处理
    processNext();
  });
}
