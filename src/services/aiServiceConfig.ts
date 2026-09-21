/**
 * AI 服务配置读取模块（fojian-ai 同款三层体例）
 *
 * 配置合成优先级（低 → 高）：
 * 1. 编译默认组：由 import.meta.env.DEV 编译期二选一——
 *    - DEV 组（npm run dev / npm test）：外网 DeepSeek；
 *    - 生产组（vite build 产物）：内网 vllm-proxy（按 model 别名路由）。
 *    两组 baseUrl 恒为同源相对路径 /llm/v1/chat/completions——dev 由 vite 代理转发
 *    （密钥由 dev server 注入，前端零密钥），生产由前端 nginx 容器经 vllm-proxy-net
 *    外部网络反代 vllm-proxy:8000；该路径前缀是部署面契约，两环境同名。
 * 2. 运行时覆盖：生产容器每次启动由镜像内 /docker-entrypoint.d/40-runtime-config.sh
 *    按 AI_* 环境变量生成 runtime-config.js，设置 window.__GONGWEN_RUNTIME_CONFIG__
 *    （index.html 中的 script 标签先于入口模块求值）；本模块求值期逐字段覆盖编译
 *    默认组。改模型名/密钥/链接只需改 compose env 重启容器，不再重打镜像。
 *    缺席/坏值一律逐字段回落编译默认。
 *
 * 旧机制（.env.development / .env.production 的 VITE_AI_* 构建时注入）已废除。
 * 兼容 Chrome 78 内核，不使用可选链和空值合并操作符。
 */

import type { AIServiceConfig } from '../types/aiProofread';

/** 运行时覆盖全局名：与 40-runtime-config.sh 生成端、public/runtime-config.js 注释三方共引 */
const RUNTIME_CONFIG_GLOBAL = '__GONGWEN_RUNTIME_CONFIG__';

/** DEV 编译默认组（npm run dev / vitest）：外网 DeepSeek，密钥由 vite 代理注入故前端留空 */
const DEFAULTS_DEV: AIServiceConfig = {
  baseUrl: '/llm/v1/chat/completions',
  model: 'deepseek-reasoner',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 65536,
  topP: 0.95,
  topK: 20,
  minP: 0.0,
  presencePenalty: 1.5,
  repetitionPenalty: 1.0,
};

/** 生产编译默认组（vite build 产物）：内网 vllm-proxy，model 须为其 backends.yaml 别名表中的别名 */
const DEFAULTS_PROD: AIServiceConfig = {
  baseUrl: '/llm/v1/chat/completions',
  model: 'Qwen3.6-35B-Thinking',
  apiKey: '123',
  temperature: 1.0,
  maxTokens: 35536,
  topP: 0.95,
  topK: 20,
  minP: 0.0,
  presencePenalty: 1.5,
  repetitionPenalty: 1.0,
};

/**
 * 读取运行时覆盖中的字符串字段
 * 仅非空字符串有效，其余（缺席/空串/非字符串）返回 null 表示不覆盖
 * @param cfg 运行时覆盖对象
 * @param key 字段名
 * @returns 修剪后的字符串或 null
 */
function readRuntimeString(cfg: Record<string, unknown>, key: string): string | null {
  const value = cfg[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

/**
 * 读取运行时覆盖中的浮点数字段
 * 兼容字符串形式（entrypoint 脚本按字符串生成，如 "0.7"）与数字形式，坏值返回 null
 * @param cfg 运行时覆盖对象
 * @param key 字段名
 * @returns 有效数字或 null
 */
function readRuntimeFloat(cfg: Record<string, unknown>, key: string): number | null {
  const value = cfg[key];
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = parseFloat(value.trim());
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * 读取运行时覆盖中的整数字段（如 maxTokens）
 * 兼容字符串与数字形式，坏值返回 null
 * @param cfg 运行时覆盖对象
 * @param key 字段名
 * @returns 有效整数或 null
 */
function readRuntimeInt(cfg: Record<string, unknown>, key: string): number | null {
  const value = cfg[key];
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = parseInt(value.trim(), 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * 运行时覆盖合成：读 globalThis 上的覆盖全局对编译默认组逐字段合并
 * 仅 AI_ENABLED=false 显式关闭时返回 null（AI 功能整体禁用）；
 * baseUrl/model/apiKey 与全部采样参数可覆盖，坏值逐字段忽略保编译默认
 * @param selected 编译期选出的默认组（DEV 或生产）
 * @returns 合成后的配置副本，或 null 表示运行时显式禁用
 */
function applyRuntimeOverride(selected: AIServiceConfig): AIServiceConfig | null {
  const holder = globalThis as unknown as Record<string, unknown>;
  const raw = holder[RUNTIME_CONFIG_GLOBAL];
  if (raw === null || typeof raw !== 'object') {
    return selected;
  }
  const cfg = raw as Record<string, unknown>;

  // AI_ENABLED 仅字面 false 关闭（entrypoint 侧只产出 boolean），其余值/缺席一律视为开启
  if (cfg['enabled'] === false) {
    return null;
  }

  const merged: AIServiceConfig = {
    baseUrl: selected.baseUrl,
    model: selected.model,
    apiKey: selected.apiKey,
    temperature: selected.temperature,
    maxTokens: selected.maxTokens,
    topP: selected.topP,
    topK: selected.topK,
    minP: selected.minP,
    presencePenalty: selected.presencePenalty,
    repetitionPenalty: selected.repetitionPenalty,
  };

  let strValue: string | null;
  let numValue: number | null;

  strValue = readRuntimeString(cfg, 'baseUrl');
  if (strValue !== null) {
    merged.baseUrl = strValue;
  }
  strValue = readRuntimeString(cfg, 'model');
  if (strValue !== null) {
    merged.model = strValue;
  }
  strValue = readRuntimeString(cfg, 'apiKey');
  if (strValue !== null) {
    merged.apiKey = strValue;
  }
  numValue = readRuntimeFloat(cfg, 'temperature');
  if (numValue !== null) {
    merged.temperature = numValue;
  }
  numValue = readRuntimeInt(cfg, 'maxTokens');
  if (numValue !== null) {
    merged.maxTokens = numValue;
  }
  numValue = readRuntimeFloat(cfg, 'topP');
  if (numValue !== null) {
    merged.topP = numValue;
  }
  numValue = readRuntimeInt(cfg, 'topK');
  if (numValue !== null) {
    merged.topK = numValue;
  }
  numValue = readRuntimeFloat(cfg, 'minP');
  if (numValue !== null) {
    merged.minP = numValue;
  }
  numValue = readRuntimeFloat(cfg, 'presencePenalty');
  if (numValue !== null) {
    merged.presencePenalty = numValue;
  }
  numValue = readRuntimeFloat(cfg, 'repetitionPenalty');
  if (numValue !== null) {
    merged.repetitionPenalty = numValue;
  }

  return merged;
}

/**
 * 自动补全 API URL 路径
 * 如果只配置了基础地址（如 http://143.147.10.31:8002），
 * 自动补充完整的 API 路径 /v1/chat/completions；运行时覆盖 baseUrl 时防漏写
 * @param url 配置的 URL
 * @returns 补全后的完整 URL
 */
function normalizeBaseUrl(url: string): string {
  // 去除首尾空白
  let trimmedUrl = url.trim();

  // 去除末尾的斜杠，保持 URL 格式规范
  while (trimmedUrl.length > 0 && trimmedUrl.charAt(trimmedUrl.length - 1) === '/') {
    trimmedUrl = trimmedUrl.substring(0, trimmedUrl.length - 1);
  }

  // 检查是否已经包含完整的 chat/completions 路径
  if (trimmedUrl.indexOf('/chat/completions') !== -1) {
    return trimmedUrl;
  }

  // 检查是否已经有 /v1 前缀
  let finalUrl = trimmedUrl;
  if (trimmedUrl.indexOf('/v1') === -1) {
    finalUrl = trimmedUrl + '/v1';
  }

  // 补全 chat/completions 路径
  finalUrl = finalUrl + '/chat/completions';

  return finalUrl;
}

/**
 * 获取 AI 服务配置
 * 编译默认组经运行时覆盖合成；仅运行时显式禁用（AI_ENABLED=false）或必填项
 * 为空时返回 null；apiKey 允许为空（同源代理形态下由代理侧负责鉴权）
 * @returns AI 服务配置对象或 null
 */
export function getAIServiceConfig(): AIServiceConfig | null {
  // 编译期二选一（import.meta.env.DEV 在构建时静态内联，产物不含另一组）
  const selected = import.meta.env.DEV ? DEFAULTS_DEV : DEFAULTS_PROD;

  const merged = applyRuntimeOverride(selected);
  if (merged === null) {
    return null;
  }

  // 必填项保险校验（编译默认恒满足，仅防运行时坏值）
  if (merged.baseUrl.trim() === '' || merged.model.trim() === '') {
    return null;
  }

  merged.baseUrl = normalizeBaseUrl(merged.baseUrl);
  return merged;
}

/**
 * 检查 AI 服务是否已配置
 * 通过调用 getAIServiceConfig 并判断返回值是否非 null
 * @returns 如果配置可用返回 true，否则返回 false
 */
export function isAIServiceConfigured(): boolean {
  const config = getAIServiceConfig();
  return config !== null;
}
