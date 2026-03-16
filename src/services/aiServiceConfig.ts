/**
 * AI 服务配置读取模块
 * 从环境变量读取 AI 服务配置，对用户完全隐藏
 * 兼容 Chrome 78 内核，不使用可选链和空值合并操作符
 */

import type { AIServiceConfig } from '../types/aiProofread';

/**
 * 自动补全 API URL 路径
 * 如果用户只配置了基础地址（如 http://143.147.10.31:8002），
 * 自动补充完整的 API 路径 /v1/chat/completions
 * @param url 用户配置的 URL
 * @returns 补全后的完整 URL
 */
function normalizeBaseUrl(url: string): string {
  // 去除首尾空白
  var trimmedUrl = url.trim();

  // 去除末尾的斜杠，保持 URL 格式规范
  while (trimmedUrl.length > 0 && trimmedUrl.charAt(trimmedUrl.length - 1) === '/') {
    trimmedUrl = trimmedUrl.substring(0, trimmedUrl.length - 1);
  }

  // 检查是否已经包含完整的 chat/completions 路径
  if (trimmedUrl.indexOf('/chat/completions') !== -1) {
    return trimmedUrl;
  }

  // 检查是否已经有 /v1 前缀
  var finalUrl = trimmedUrl;
  if (trimmedUrl.indexOf('/v1') === -1) {
    finalUrl = trimmedUrl + '/v1';
  }

  // 补全 chat/completions 路径
  finalUrl = finalUrl + '/chat/completions';

  return finalUrl;
}

/**
 * 从环境变量获取 AI 服务配置
 * 验证必填项，如果不完整则返回 null
 * @returns AI 服务配置对象或 null
 */
export function getAIServiceConfig(): AIServiceConfig | null {
  // 从 import.meta.env 读取环境变量
  const baseUrl = import.meta.env.VITE_AI_BASE_URL;
  const model = import.meta.env.VITE_AI_MODEL;
  const apiKey = import.meta.env.VITE_AI_API_KEY;
  const temperatureStr = import.meta.env.VITE_AI_TEMPERATURE;
  const maxTokensStr = import.meta.env.VITE_AI_MAX_TOKENS;
  const topPStr = import.meta.env.VITE_AI_TOP_P;
  const topKStr = import.meta.env.VITE_AI_TOP_K;
  const minPStr = import.meta.env.VITE_AI_MIN_P;
  const presencePenaltyStr = import.meta.env.VITE_AI_PRESENCE_PENALTY;
  const repetitionPenaltyStr = import.meta.env.VITE_AI_REPETITION_PENALTY;

  // 验证必填项
  // 必须同时存在 baseUrl、model、apiKey 且为非空字符串
  if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    return null;
  }
  if (!model || typeof model !== 'string' || model.trim() === '') {
    return null;
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    return null;
  }

  // 解析可选参数，使用默认值
  let temperature = 0.3;
  if (temperatureStr && typeof temperatureStr === 'string') {
    const parsed = parseFloat(temperatureStr);
    // 确保解析结果是有效数字
    if (!isNaN(parsed)) {
      temperature = parsed;
    }
  }

  let maxTokens = 4096;
  if (maxTokensStr && typeof maxTokensStr === 'string') {
    const parsed = parseInt(maxTokensStr, 10);
    // 确保解析结果是有效数字
    if (!isNaN(parsed)) {
      maxTokens = parsed;
    }
  }

  let topP = 0.95;
  if (topPStr && typeof topPStr === 'string') {
    const parsed = parseFloat(topPStr);
    if (!isNaN(parsed)) {
      topP = parsed;
    }
  }

  let topK = 20;
  if (topKStr && typeof topKStr === 'string') {
    const parsed = parseInt(topKStr, 10);
    if (!isNaN(parsed)) {
      topK = parsed;
    }
  }

  let minP = 0.0;
  if (minPStr && typeof minPStr === 'string') {
    const parsed = parseFloat(minPStr);
    if (!isNaN(parsed)) {
      minP = parsed;
    }
  }

  let presencePenalty = 1.5;
  if (presencePenaltyStr && typeof presencePenaltyStr === 'string') {
    const parsed = parseFloat(presencePenaltyStr);
    if (!isNaN(parsed)) {
      presencePenalty = parsed;
    }
  }

  let repetitionPenalty = 1.0;
  if (repetitionPenaltyStr && typeof repetitionPenaltyStr === 'string') {
    const parsed = parseFloat(repetitionPenaltyStr);
    if (!isNaN(parsed)) {
      repetitionPenalty = parsed;
    }
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    model: model.trim(),
    apiKey: apiKey.trim(),
    temperature: temperature,
    maxTokens: maxTokens,
    topP: topP,
    topK: topK,
    minP: minP,
    presencePenalty: presencePenalty,
    repetitionPenalty: repetitionPenalty,
  };
}

/**
 * 检查 AI 服务是否已配置
 * 通过调用 getAIServiceConfig 并判断返回值是否非 null
 * @returns 如果配置完整返回 true，否则返回 false
 */
export function isAIServiceConfigured(): boolean {
  const config = getAIServiceConfig();
  return config !== null;
}
