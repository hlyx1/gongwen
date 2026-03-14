# AI审核功能任务列表

## 任务1：创建类型定义和配置
- [ ] 创建 `src/types/aiProofread.ts`
  - [ ] 定义 Sentence 接口
  - [ ] 定义 SentenceBlock 接口
  - [ ] 定义 AIProofreadResult 接口
  - [ ] 定义 CustomCheckItem 接口（用户自定义检查项）
  - [ ] 定义 AIProofreadConfig 接口（用户可修改的配置）
  - [ ] 定义 AIProofreadState 接口
  - [ ] 定义 AIServiceConfig 接口（内部使用）
  - [ ] 定义 OpenAIChatRequest 接口
  - [ ] 定义 OpenAIStreamResponse 接口
- [ ] 更新 `src/types/documentConfig.ts`
  - [ ] 添加 AIProofreadConfig 到 DocumentConfig（用户可修改）
  - [ ] 添加默认配置 DEFAULT_AI_PROOFREAD_CONFIG

## 任务2：创建.env配置文件（不提交git）
- [ ] 创建 `.env.example`（示例文件，提交git供参考）
  - [ ] 配置 VITE_AI_BASE_URL（示例值）
  - [ ] 配置 VITE_AI_MODEL（示例值）
  - [ ] 配置 VITE_AI_API_KEY（示例值）
  - [ ] 配置 VITE_AI_TEMPERATURE（示例值）
  - [ ] 配置 VITE_AI_MAX_TOKENS（示例值）
- [ ] 更新 `.gitignore`
  - [ ] 添加 `.env.development`（测试环境配置不提交git）
  - [ ] 添加 `.env.production`（生产环境配置不提交git）
  - [ ] 添加 `.env.local`（本地配置不提交git）
- [ ] 更新 `vite.config.ts`
  - [ ] 确保环境变量以 VITE_ 开头可被前端访问

## 任务3：实现AI服务配置（内部使用）
- [ ] 创建 `src/services/aiServiceConfig.ts`
  - [ ] 实现 getAIServiceConfig 函数（从.env读取，内部使用）
  - [ ] 实现 isAIServiceConfigured 函数（检查配置是否完整）
  - [ ] 配置对用户完全隐藏，不暴露给前端组件
- [ ] 创建单元测试 `src/services/__tests__/aiServiceConfig.test.ts`

## 任务4：实现句子切分器
- [ ] 创建 `src/utils/sentenceSplitter.ts`
  - [ ] 实现 splitIntoSentences 函数
  - [ ] 支持6种分隔符：。！？……；\n
  - [ ] 正确处理引号、书名号、括号内的分隔符
  - [ ] 为每个句子分配全局序号
  - [ ] 生成 sentenceMap（序号到sentenceId的映射）
- [ ] 创建单元测试 `src/utils/__tests__/sentenceSplitter.test.ts`

## 任务5：实现文本分块器
- [ ] 创建 `src/utils/textBlockSplitter.ts`
  - [ ] 实现 splitIntoBlocks 函数
  - [ ] 以句子为单位分块，不切割句子
  - [ ] 确保每块字符数不超过 maxCharsPerRequest
- [ ] 创建单元测试 `src/utils/__tests__/textBlockSplitter.test.ts`

## 任务6：实现AI响应解析器
- [ ] 创建 `src/utils/aiResponseParser.ts`
  - [ ] 实现 parseStreamingLine 函数（流式解析单行）
  - [ ] 复用现有的 parseTableRow 函数
  - [ ] 将全局序号映射回 sentenceId
  - [ ] 解析出 hasIssue 和 suggestion
- [ ] 创建单元测试 `src/utils/__tests__/aiResponseParser.test.ts`

## 任务7：实现AI审核服务
- [ ] 创建 `src/services/aiProofreadService.ts`
  - [ ] 定义 FIXED_PROMPT_PREFIX（固定提示词前缀，不可更改）
  - [ ] 定义 FIXED_PROMPT_SUFFIX（固定提示词后缀，不可更改）
  - [ ] 实现 buildPrompt 函数（固定提示词+自定义检查项+待审核句子）
  - [ ] 实现 sendBlockStreaming 函数（流式发送单块）
  - [ ] 实现 sendAllBlocksStreaming 函数（并行发送多块）
  - [ ] 实现并发控制（最多 maxConcurrentRequests 个）
  - [ ] 实现失败重试机制（最多3次）
  - [ ] 实现流式响应处理（ReadableStream）
  - [ ] 实现 OpenAI SSE 格式解析
  - [ ] 处理 API 错误响应

## 任务8：实现AI审核Hook
- [ ] 创建 `src/hooks/useAIProofread.ts`
  - [ ] 实现 startProofread 函数
  - [ ] 管理 AIProofreadState 状态
  - [ ] 处理流式进度更新
  - [ ] 处理错误和重试
  - [ ] 提供 results Map 供组件使用
  - [ ] 检查 AI服务配置是否完整（使用 isAIServiceConfigured）

## 任务9：实现AI审核按钮组件
- [ ] 创建 `src/components/AIProofreadButton/AIProofreadButton.tsx`
  - [ ] 检测AI服务配置状态（使用 isAIServiceConfigured）
  - [ ] 配置完整时：
    - [ ] 默认状态显示"AI审核"
    - [ ] 检测中状态显示"AI审核 正在检测(x/n)"
    - [ ] 完成状态显示"AI审核 发现N处问题"或"AI审核 无问题"
    - [ ] 错误状态显示"AI审核 检测失败"
    - [ ] 检测中时禁用按钮
    - [ ] 点击触发 startProofread
  - [ ] 配置缺失时：
    - [ ] 按钮禁用，显示"AI服务未配置"
    - [ ] 点击提示"请联系管理员配置AI服务"
- [ ] 创建 `src/components/AIProofreadButton/AIProofreadButton.css`

## 任务10：实现审核设置弹窗（固定提示词+自定义检查项）
- [ ] 创建 `src/components/AIProofreadSettings/AIProofreadSettings.tsx`
  - [ ] 实现设置弹窗界面
  - [ ] 固定提示词区域（只读，显示完整提示词预览）
  - [ ] 自定义检查项管理区域：
    - [ ] 显示当前自定义检查项列表
    - [ ] 每项显示名称、描述、删除按钮
    - [ ] [+ 添加检查项] 按钮，点击弹出添加表单
    - [ ] 添加表单包含：名称输入框、描述输入框、确认/取消按钮
  - [ ] 审核参数区域：
    - [ ] maxCharsPerRequest 数字输入框（默认3000）
    - [ ] maxConcurrentRequests 数字输入框（默认3）
  - [ ] 取消和保存按钮
- [ ] 创建 `src/components/AIProofreadSettings/AIProofreadSettings.css`
- [ ] 配置持久化到 localStorage

## 任务11：更新预览区展示
- [ ] 修改 `src/components/Preview/Preview.tsx`
  - [ ] 接收 AIProofreadState
  - [ ] 在A4Page中传递 results 到渲染层
- [ ] 修改 `src/components/Preview/A4Page.tsx`
  - [ ] 接收 results Map
  - [ ] 对有问题的句子添加黄色背景高亮
  - [ ] 实现鼠标悬停显示AI建议浮层
- [ ] 创建 `src/components/Preview/AISuggestionTooltip.tsx`
  - [ ] 显示原文和建议内容

## 任务12：更新检测点面板
- [ ] 修改 `src/components/DetectionPanel/DetectionPanel.tsx`
  - [ ] 新增 AI审核 板块
  - [ ] 显示检测统计（已检测句数、有问题句数）
  - [ ] 按文章顺序列出所有问题
  - [ ] 每项显示：段落位置、原文、建议
  - [ ] 点击问题项定位到预览区对应句子
  - [ ] AI服务未配置时显示提示"请联系管理员配置AI服务"
- [ ] 修改 `src/components/DetectionPanel/DetectionPanel.css`
  - [ ] 添加AI审核板块的样式

## 任务13：更新DocumentConfigContext
- [ ] 修改 `src/contexts/DocumentConfigContext.tsx`
  - [ ] 添加 AIProofreadConfig 到 state（仅用户可修改的配置）
  - [ ] 实现 updateAIProofreadConfig 方法
  - [ ] 实现 resetAIProofreadConfig 方法
  - [ ] 配置持久化到 localStorage

## 任务14：集成到主界面
- [ ] 修改 `src/App.tsx` 或相关布局文件
  - [ ] 在预览栏标题右侧添加 AI审核 按钮
  - [ ] 在 AI审核 按钮右侧添加 审核设置 按钮
  - [ ] 引入 useAIProofread hook
  - [ ] 将状态传递给 Preview 和 DetectionPanel

## 任务15：Docker部署支持
- [ ] 更新 `Dockerfile`
  - [ ] 确保复制 .env.production 文件（通过构建参数或挂载）
- [ ] 创建 `docker-compose.yml` 示例
  - [ ] 展示如何通过环境变量覆盖配置
- [ ] 更新部署文档
  - [ ] 说明Docker部署时自动使用生产环境配置
  - [ ] 说明AI服务配置仅通过.env文件配置，对用户隐藏
  - [ ] 说明.env文件不提交到git，需手动配置

# 任务依赖关系
- 任务1（类型定义）无依赖，最先完成
- 任务2（.env配置文件）无依赖，可与任务1并行
- 任务3（AI服务配置）依赖任务1、任务2
- 任务4（句子切分器）依赖任务1
- 任务5（文本分块器）依赖任务1
- 任务6（AI响应解析器）依赖任务4
- 任务7（AI审核服务）依赖任务3、任务5、任务6
- 任务8（AI审核Hook）依赖任务7
- 任务9（AI审核按钮）依赖任务8
- 任务10（审核设置弹窗）依赖任务13
- 任务11（预览区更新）和任务12（检测点面板更新）依赖任务8
- 任务13（DocumentConfigContext更新）依赖任务1
- 任务14（集成）依赖任务9、10、11、12、13
- 任务15（Docker部署支持）依赖任务2
