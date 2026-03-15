/**
 * AI 校对相关类型定义
 * 兼容 Chrome 78 内核，不使用可选链和空值合并操作符
 */

/**
 * 句子信息
 * 表示从公文 AST 节点中提取的单个句子
 */
export interface Sentence {
  /** 唯一标识，格式：nodeId-seq */
  id: string;
  /** 所属节点ID */
  nodeId: string;
  /** 全局序号，从1开始 */
  seqNum: number;
  /** 句子文本 */
  text: string;
  /** 所属节点类型 */
  nodeType: string;
  /** 原始行号 */
  lineNumber: number;
}

/**
 * 句子块
 * 用于批量发送给 AI 进行校对
 */
export interface SentenceBlock {
  /** 块序号 */
  blockIndex: number;
  /** 句子列表 */
  sentences: Sentence[];
  /** 字符数 */
  charCount: number;
}

/**
 * AI 校对结果
 * 表示单个句子的校对结果
 */
export interface AIProofreadResult {
  /** 句子唯一标识 */
  sentenceId: string;
  /** 全局序号 */
  seqNum: number;
  /** 原始文本 */
  originalText: string;
  /** 修改建议 */
  suggestion: string;
  /** 是否存在问题 */
  hasIssue: boolean;
}

/**
 * 自定义检查项
 * 用户可添加的自定义校对规则
 */
export interface CustomCheckItem {
  /** 唯一标识 */
  id: string;
  /** 检查项名称 */
  name: string;
  /** 检查项描述 */
  description: string;
}

/**
 * AI 校对配置
 * 用户可修改的配置项（仅自定义检查项）
 */
export interface AIProofreadConfig {
  /** 自定义检查项列表 */
  customCheckItems: CustomCheckItem[];
}

/**
 * AI 校对内部配置
 * 代码层面固定，对用户不可见
 */
export const AI_PROOFREAD_INTERNAL_CONFIG = {
  /** 每次请求最大字符数 */
  maxCharsPerRequest: 3500,
  /** 最大并发请求数 */
  maxConcurrentRequests: 3,
}

/**
 * AI 校对状态
 * 用于跟踪校对进度和结果
 */
export interface AIProofreadState {
  /** 当前状态 */
  status: 'idle' | 'loading' | 'success' | 'error';
  /** 已处理的句子数 */
  processedSentences: number;
  /** 总句子数 */
  totalSentences: number;
  /** 校对结果映射，key 为 sentenceId */
  results: Map<string, AIProofreadResult>;
  /** 错误信息 */
  error: string | null;
}

/**
 * AI 服务配置
 * 内部使用，不暴露给用户
 */
export interface AIServiceConfig {
  /** API 基础地址 */
  baseUrl: string;
  /** 模型名称 */
  model: string;
  /** API 密钥 */
  apiKey: string;
  /** 温度参数 */
  temperature: number;
  /** 最大 token 数 */
  maxTokens: number;
}

/**
 * OpenAI 聊天请求格式
 * 用于发送给 OpenAI 兼容的 API
 */
export interface OpenAIChatRequest {
  /** 模型名称 */
  model: string;
  /** 消息列表 */
  messages: Array<{
    role: 'system' | 'user';
    content: string;
  }>;
  /** 温度参数 */
  temperature: number;
  /** 最大 token 数 */
  max_tokens: number;
  /** 是否流式输出 */
  stream: boolean;
}

/**
 * OpenAI 流式响应格式
 * 用于解析 SSE 流式数据
 */
export interface OpenAIStreamResponse {
  /** 响应ID */
  id: string;
  /** 对象类型 */
  object: string;
  /** 创建时间戳 */
  created: number;
  /** 模型名称 */
  model: string;
  /** 选择列表 */
  choices: Array<{
    /** 索引 */
    index: number;
    /** 增量内容 */
    delta: {
      content?: string;
    };
    /** 结束原因 */
    finish_reason: string | null;
  }>;
}

/**
 * 默认 AI 校对配置
 */
export const DEFAULT_AI_PROOFREAD_CONFIG: AIProofreadConfig = {
  customCheckItems: [],
};
