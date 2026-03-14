# AI审核功能规格文档

## 为什么
用户在排版公文时，需要AI帮助逐句审核文本，发现语法、用词、逻辑等问题。系统应将清理后的文本逐句发送给大模型进行审核，在前端高亮有问题的句子并展示AI建议，由用户自行决定是否修改。

## 变更内容
- 新增句子切分器，按6种分隔符切分文本
- 新增文本分块器，支持长文本分批发送
- 新增流式解析器，实时解析AI返回的Markdown表格
- 新增AI服务配置（仅通过.env文件配置，对用户完全隐藏，不提交到git）
- 新增AI审核按钮
- 新增预览区句子高亮功能
- 新增检测点面板AI审核结果展示
- 新增审核设置弹窗（固定提示词+用户自定义检查项）
- 新增.env配置文件（.env.development 和 .env.production，均不提交到git）

## 影响范围
- 新增文件：
  - `src/utils/sentenceSplitter.ts` - 句子切分器
  - `src/utils/textBlockSplitter.ts` - 文本分块器
  - `src/utils/aiResponseParser.ts` - AI响应解析器
  - `src/services/aiServiceConfig.ts` - AI服务配置（内部使用）
  - `src/services/aiProofreadService.ts` - AI审核服务
  - `src/hooks/useAIProofread.ts` - AI审核Hook
  - `src/components/AIProofreadButton/` - AI审核按钮组件
  - `src/components/AIProofreadSettings/` - 审核设置弹窗
  - `src/types/aiProofread.ts` - 类型定义
  - `.env.development` - 测试环境配置（不提交到git）
  - `.env.production` - 生产环境配置（不提交到git）
  - `.env.example` - 环境变量示例文件（提交到git）
- 修改文件：
  - `src/components/Preview/Preview.tsx` - 添加高亮展示
  - `src/components/DetectionPanel/` - 添加AI审核结果展示
  - `src/contexts/DocumentConfigContext.tsx` - 添加AI审核配置
  - `vite.config.ts` - 添加环境变量支持
  - `.gitignore` - 添加.env文件忽略

## 新增需求

### 需求1：句子切分
系统应将公文文本按以下6种分隔符切分为句子：
- 句号 `。`
- 感叹号 `！`
- 问号 `？`
- 省略号 `……`
- 分号 `；`
- 换行符 `\n`

切分对象包括：PARAGRAPH、HEADING_1/2/3/4、ADDRESSEE
不切分：DOCUMENT_TITLE、ATTACHMENT、SIGNATURE、DATE、REMARK、TABLE

#### 场景：成功切分
- **当** 用户输入包含多个句子的段落
- **则** 系统正确切分为独立句子，并分配全局序号（从1开始）

### 需求2：文本分块
系统应根据配置`maxCharsPerRequest`将句子分块，以句子为单位不切割句子。

#### 场景：长文本分块
- **当** 文本总字符数超过`maxCharsPerRequest`
- **则** 系统将其分为多个块，每块字符数不超过限制

### 需求3：流式解析AI响应
系统应流式接收AI返回的Markdown表格，逐行解析，每解析出一行就立即更新前端。

#### 场景：实时展示结果
- **当** AI返回表格数据行
- **则** 系统立即解析并更新预览区高亮和检测点面板

### 需求4：并行发送与并发控制
系统应并行发送多个块，但并发数不超过`maxConcurrentRequests`配置。
失败时自动重试3次，最终失败视为整体检测失败。

#### 场景：并发控制
- **当** 有多个块需要发送
- **则** 系统同时发送最多`maxConcurrentRequests`个请求

### 需求5：前端展示
系统应在预览区黄色高亮有问题的句子，鼠标悬停显示AI建议。
在检测点面板按文章顺序展示所有问题。
按钮显示格式：`AI审核 正在检测(45/128)`或`AI审核 发现3处问题`。

#### 场景：检测中
- **当** 正在接收AI响应
- **则** 按钮显示`AI审核 正在检测(x/n)`，x为已处理句子数

#### 场景：检测完成
- **当** 所有块处理完成
- **则** 按钮显示`AI审核 发现N处问题`或`AI审核 无问题`

### 需求6：AI服务配置（.env环境变量，对用户隐藏，不提交git）
系统应从.env环境变量文件读取AI服务配置，对用户完全隐藏，不可修改，且不提交到git仓库。

#### 场景：开发环境使用测试配置
- **当** 运行 `npm run dev`
- **则** 系统自动加载 `.env.development` 中的测试环境配置

#### 场景：生产环境使用生产配置
- **当** 运行 `npm run build` 或 Docker部署
- **则** 系统自动加载 `.env.production` 中的生产环境配置

#### 场景：配置缺失
- **当** .env文件配置不完整或缺失
- **则** AI审核按钮禁用，显示"AI服务未配置"
- **当** 用户点击禁用的按钮
- **则** 提示"请联系管理员配置AI服务"

### 需求7：审核设置（固定提示词+用户自定义检查项）
系统应提供审核设置弹窗，允许用户新增自定义检查项，固定提示词不可更改。

#### 场景：查看审核设置
- **当** 用户点击"审核设置"按钮
- **则** 弹出设置窗口，显示：
  - 固定提示词（只读）
  - 用户自定义检查项列表（可增删改）
  - 审核参数（maxCharsPerRequest、maxConcurrentRequests）

#### 场景：添加自定义检查项
- **当** 用户点击"添加检查项"
- **则** 弹出输入框，用户输入检查项名称和描述
- **当** 用户保存
- **则** 新的检查项自动拼接到固定提示词的适当位置

#### 场景：删除自定义检查项
- **当** 用户点击某检查项的删除按钮
- **则** 该检查项从列表中移除，不再包含在提示词中

## AI服务配置（.env环境变量，内部使用，不提交git）

### 环境变量文件结构

```bash
# .env.development（测试环境，不提交git）
VITE_AI_BASE_URL=https://api.test-example.com/v1/chat/completions
VITE_AI_MODEL=gpt-3.5-turbo
VITE_AI_API_KEY=test-api-key-123
VITE_AI_TEMPERATURE=0.3
VITE_AI_MAX_TOKENS=4096
```

```bash
# .env.production（生产环境，不提交git）
VITE_AI_BASE_URL=https://api.openai.com/v1/chat/completions
VITE_AI_MODEL=gpt-4o
VITE_AI_API_KEY=production-api-key-456
VITE_AI_TEMPERATURE=0.3
VITE_AI_MAX_TOKENS=4096
```

```bash
# .env.example（示例文件，提交git供参考）
VITE_AI_BASE_URL=https://api.openai.com/v1/chat/completions
VITE_AI_MODEL=gpt-4o
VITE_AI_API_KEY=your-api-key-here
VITE_AI_TEMPERATURE=0.3
VITE_AI_MAX_TOKENS=4096
```

### .gitignore配置

```gitignore
# AI服务配置（包含敏感信息，不提交git）
.env.development
.env.production
```

### 配置读取逻辑（内部使用）

```typescript
// src/services/aiServiceConfig.ts
// 此配置对用户完全隐藏，仅内部使用

interface AIServiceConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

// 从环境变量读取配置（仅内部使用）
function getAIServiceConfig(): AIServiceConfig | null {
  const baseUrl = import.meta.env.VITE_AI_BASE_URL;
  const model = import.meta.env.VITE_AI_MODEL;
  const apiKey = import.meta.env.VITE_AI_API_KEY;
  
  // 验证必填项
  if (!baseUrl || !model || !apiKey) {
    return null;  // 配置不完整
  }
  
  return {
    baseUrl,
    model,
    apiKey,
    temperature: parseFloat(import.meta.env.VITE_AI_TEMPERATURE || '0.3'),
    maxTokens: parseInt(import.meta.env.VITE_AI_MAX_TOKENS || '4096', 10)
  };
}

// 检查配置是否可用（用于前端判断按钮状态）
export function isAIServiceConfigured(): boolean {
  return getAIServiceConfig() !== null;
}
```

## 提示词配置（固定+用户自定义检查项）

### 固定提示词（不可更改）

```typescript
// src/services/aiProofreadService.ts

// 固定提示词前缀（不可更改）
const FIXED_PROMPT_PREFIX = `你是一位资深的公文审核专家。请对以下公文进行逐句审核。

【审核要求】
1. 逐句分析每个句子的语法、用词、逻辑是否正确
2. 如果句子没有问题，修改建议填写"无"
3. 如果句子有问题，修改建议填写修改后的内容
4. 必须严格按照要求的Markdown表格格式输出

【基础检查项】
- 语法错误：成分残缺、搭配不当、语序混乱
- 用词不当：不符合公文规范的口语化表达
- 逻辑问题：前后矛盾、概念不清、指代不明
- 格式问题：标点使用不当、数字格式不规范
- 表达冗余：重复啰嗦、可简化的表述`;

// 固定提示词后缀（不可更改）
const FIXED_PROMPT_SUFFIX = `
【输出格式】
必须输出Markdown表格格式，包含3列：

| 序号 | 原句 | 修改建议 |
|:---|:---|:---|

说明：
1. 序号列：从1开始递增的自然数
2. 原句列：填写原句子内容
3. 修改建议列：无问题填"无"，有问题填修改建议
4. 每行一个句子，按顺序输出，不要遗漏
5. 不要添加表头以外的其他内容

请对以下句子进行审核：`;
```

### 用户自定义检查项

```typescript
// src/types/aiProofread.ts

interface CustomCheckItem {
  id: string;           // 唯一标识
  name: string;         // 检查项名称，如"政治术语规范"
  description: string;  // 检查项描述，如"检查政治术语是否符合最新规范"
}

interface AIProofreadConfig {
  maxCharsPerRequest: number;
  maxConcurrentRequests: number;
  customCheckItems: CustomCheckItem[];  // 用户自定义检查项列表
}
```

### 提示词构建逻辑

```typescript
// src/services/aiProofreadService.ts

function buildPrompt(
  block: SentenceBlock,
  customCheckItems: CustomCheckItem[]
): string {
  // 1. 固定前缀
  let prompt = FIXED_PROMPT_PREFIX;
  
  // 2. 添加用户自定义检查项（如果有）
  if (customCheckItems && customCheckItems.length > 0) {
    prompt += '\n\n【自定义检查项】';
    for (const item of customCheckItems) {
      prompt += `\n- ${item.name}：${item.description}`;
    }
  }
  
  // 3. 固定后缀
  prompt += FIXED_PROMPT_SUFFIX;
  
  // 4. 添加待审核的句子
  prompt += '\n\n';
  for (const sentence of block.sentences) {
    prompt += `${sentence.seqNum}. ${sentence.text}\n`;
  }
  
  return prompt;
}
```

### 审核设置弹窗界面

```
┌─────────────────────────────────────────┐
│  AI审核设置                    [X]      │
├─────────────────────────────────────────┤
│                                         │
│  【固定提示词】（不可更改）                │
│  ┌─────────────────────────────────┐   │
│  │ 你是一位资深的公文审核专家...    │   │
│  │ 【基础检查项】                   │   │
│  │ - 语法错误：成分残缺...          │   │
│  │ ...                             │   │
│  └─────────────────────────────────┘   │
│                                         │
│  【自定义检查项】                        │
│  ┌─────────────────────────────────┐   │
│  │ 政治术语规范：检查政治术语...    │ [删除]│
│  │ 数据准确性：检查数据是否准确...  │ [删除]│
│  └─────────────────────────────────┘   │
│  [+ 添加检查项]                          │
│                                         │
│  【审核参数】                            │
│  每次请求最大字符数: [ 3000 ]            │
│  最大并发请求数: [ 3 ]                   │
│                                         │
│                    [取消]  [保存设置]    │
└─────────────────────────────────────────┘
```

## OpenAI格式请求

```typescript
// 构建OpenAI格式请求
interface OpenAIChatRequest {
  model: string;
  messages: {
    role: 'system' | 'user';
    content: string;
  }[];
  temperature: number;
  max_tokens: number;
  stream: true;  // 启用流式响应
}

// 流式响应格式
interface OpenAIStreamResponse {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      content?: string;
    };
    finish_reason: string | null;
  }[];
}
```

### AI服务调用代码示例

```typescript
// src/services/aiProofreadService.ts

async function sendBlockStreaming(
  block: SentenceBlock,
  customCheckItems: CustomCheckItem[],
  onChunk: (content: string) => void
): Promise<void> {
  // 内部获取配置（用户不可见）
  const config = getAIServiceConfig();
  if (!config) {
    throw new Error('AI服务未配置');
  }
  
  // 构建提示词（固定+自定义检查项）
  const prompt = buildPrompt(block, customCheckItems);
  
  const requestBody: OpenAIChatRequest = {
    model: config.model,
    messages: [
      { role: 'system', content: '你是一位资深的公文审核专家。' },
      { role: 'user', content: prompt }
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: true
  };
  
  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    throw new Error(`AI服务请求失败: ${response.status}`);
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // 解析SSE格式数据
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const chunk: OpenAIStreamResponse = JSON.parse(data);
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }
}
```

## AI交互格式

### 请求格式

```typescript
interface AIProofreadBlockRequest {
  blockIndex: number;
  totalBlocks: number;
  sentences: {
    seqNum: number;  // 全局序号
    text: string;
  }[];
}
```

### 响应格式（Markdown表格）

```markdown
| 序号 | 原句 | 修改建议 |
|:---|:---|:---|
| 1 | 各单位要充分认识此项工作的重要性， | 无 |
| 2 | 切实加强组织领导，确保工作落到实处。 | 切实加强组织领导，确保各项工作落到实处。 |
```

## 配置项汇总

### AI服务配置（.env文件，内部使用，不提交git）

| 环境变量 | 类型 | 必填 | 默认值 | 说明 |
|----------|------|------|--------|------|
| VITE_AI_BASE_URL | string | 是 | - | API服务地址 |
| VITE_AI_MODEL | string | 是 | - | 模型名称 |
| VITE_AI_API_KEY | string | 是 | - | API密钥 |
| VITE_AI_TEMPERATURE | number | 否 | 0.3 | 温度参数 |
| VITE_AI_MAX_TOKENS | number | 否 | 4096 | 最大token数 |

### AI审核配置（用户可修改，存储在localStorage）

| 配置项 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| maxCharsPerRequest | number | 否 | 3000 | 每次请求最大字符数 |
| maxConcurrentRequests | number | 否 | 3 | 最大并发请求数 |
| customCheckItems | CustomCheckItem[] | 否 | [] | 用户自定义检查项列表 |

## 配置说明

### AI服务配置（内部使用）
- 仅通过 `.env` 文件配置
- 对用户完全隐藏
- 前端无法修改
- **不提交到git仓库**（保护API密钥）
- 配置缺失时AI审核按钮禁用

### 用户可修改配置
- 仅包含审核参数和自定义检查项
- 存储在localStorage
- 通过"审核设置"弹窗修改
- 不影响AI服务连接参数
- 自定义检查项自动拼接到固定提示词中

### 提示词结构
```
固定提示词前缀（基础检查项）
+ 用户自定义检查项（可选）
+ 固定提示词后缀（输出