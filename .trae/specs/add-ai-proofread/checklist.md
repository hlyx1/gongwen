# AI审核功能检查清单

## 类型定义和配置
- [x] `src/types/aiProofread.ts` 文件存在且包含所有必要接口
- [x] `src/types/documentConfig.ts` 已更新，仅包含 AIProofreadConfig（用户可修改）
- [x] 默认配置值正确（maxCharsPerRequest=3000, maxConcurrentRequests=3, customCheckItems=[]）
- [x] AIServiceConfig 仅内部使用，不暴露给用户

## .env配置文件（不提交git）
- [x] `.env.example` 文件存在，包含示例配置（提交git供参考）
- [x] `.gitignore` 已更新，忽略 `.env.development`、`.env.production`、`.env.local`
- [x] `vite.config.ts` 支持 VITE_ 前缀环境变量

## AI服务配置（内部使用，对用户隐藏）
- [x] `src/services/aiServiceConfig.ts` 文件存在
- [x] getAIServiceConfig 函数正确从.env读取配置
- [x] isAIServiceConfigured 函数正确检查配置完整性
- [x] 配置对用户完全隐藏，不暴露给前端组件
- [x] 配置缺失时AI审核按钮正确禁用
- [ ] 单元测试通过

## 句子切分器
- [x] `src/utils/sentenceSplitter.ts` 文件存在
- [x] 能正确按6种分隔符切分句子
- [x] 正确处理引号、书名号、括号内的分隔符（不切分）
- [x] 正确生成全局序号（从1开始）
- [x] 正确生成 sentenceMap
- [ ] 单元测试通过

## 文本分块器
- [x] `src/utils/textBlockSplitter.ts` 文件存在
- [x] 以句子为单位分块，不切割句子
- [x] 每块字符数不超过 maxCharsPerRequest
- [x] 正确处理最后一个块
- [ ] 单元测试通过

## AI响应解析器
- [x] `src/utils/aiResponseParser.ts` 文件存在
- [x] 能流式解析Markdown表格
- [x] 正确识别表头行和分隔行
- [x] 正确解析数据行，提取序号、原句、建议
- [x] 正确将全局序号映射回 sentenceId
- [x] 正确判断 hasIssue（建议是否为"无"）
- [x] 复用现有的 parseTableRow 函数
- [ ] 单元测试通过

## AI审核服务
- [x] `src/services/aiProofreadService.ts` 文件存在
- [x] FIXED_PROMPT_PREFIX 定义正确（固定提示词前缀）
- [x] FIXED_PROMPT_SUFFIX 定义正确（固定提示词后缀）
- [x] buildPrompt 函数正确构建提示词（固定+自定义检查项+待审核句子）
- [x] sendBlockStreaming 函数正确实现流式发送
- [x] 正确处理 ReadableStream
- [x] 正确解析 OpenAI SSE 格式（data: {...}）
- [x] sendAllBlocksStreaming 函数正确实现并行发送
- [x] 并发控制正确（最多 maxConcurrentRequests 个）
- [x] 失败重试机制正确（最多3次）
- [x] 最终失败抛出错误
- [x] 能处理 API 错误响应（401、429、500等）

## AI审核Hook
- [x] `src/hooks/useAIProofread.ts` 文件存在
- [x] startProofread 函数正确调用服务
- [x] 检查 AI服务配置是否完整（使用 isAIServiceConfigured）
- [x] 状态管理正确（idle/loading/success/error）
- [x] 进度更新正确（processedSentences/totalSentences）
- [x] results Map 正确更新
- [x] 错误处理正确

## AI审核按钮组件
- [x] `src/components/AIProofreadButton/AIProofreadButton.tsx` 文件存在
- [x] 正确检测AI服务配置状态
- [x] 配置完整时：
  - [x] 默认状态显示"AI审核"
  - [x] 检测中状态显示"AI审核 正在检测(x/n)"
  - [x] 完成状态显示"AI审核 发现N处问题"或"AI审核 无问题"
  - [x] 错误状态显示"AI审核 检测失败"
  - [x] 检测中时按钮禁用
  - [x] 点击正确触发 startProofread
- [x] 配置缺失时：
  - [x] 按钮禁用，显示"AI服务未配置"
  - [x] 点击提示"请联系管理员配置AI服务"

## 审核设置弹窗（固定提示词+自定义检查项）
- [x] `src/components/AIProofreadSettings/AIProofreadSettings.tsx` 文件存在
- [x] 弹窗能正确打开和关闭
- [x] 固定提示词区域显示完整提示词预览（只读）
- [x] 自定义检查项管理区域：
  - [x] 显示当前自定义检查项列表
  - [x] 每项显示名称、描述、删除按钮
  - [x] [+ 添加检查项] 按钮工作正常
  - [x] 添加表单包含名称输入框、描述输入框、确认/取消按钮
  - [x] 删除功能工作正常
- [x] 审核参数区域：
  - [x] maxCharsPerRequest 输入框显示当前值
  - [x] maxConcurrentRequests 输入框显示当前值
- [x] 保存按钮能保存配置到 localStorage
- [x] 取消按钮能关闭弹窗不保存
- [x] 自定义检查项正确拼接到提示词中

## 预览区展示
- [x] 有问题的句子显示黄色背景高亮
- [x] 鼠标悬停显示AI建议浮层
- [x] 浮层显示原文和建议内容
- [x] 高亮样式符合设计（类似Word批注）

## 检测点面板
- [x] 新增 AI审核 板块
- [x] 显示检测统计（已检测句数、有问题句数）
- [x] 按文章顺序列出所有问题
- [x] 每项显示段落位置、原文、建议
- [x] 点击问题项能定位到预览区对应句子
- [x] AI服务未配置时显示提示"请联系管理员配置AI服务"
- [x] 样式正确

## DocumentConfigContext
- [x] 已添加 AIProofreadConfig 到 state（仅用户可修改的配置）
- [x] 不包含 AIServiceConfig（对用户隐藏）
- [x] updateAIProofreadConfig 方法工作正常
- [x] resetAIProofreadConfig 方法工作正常
- [x] 配置正确持久化到 localStorage

## 主界面集成
- [x] 预览栏标题右侧有 AI审核 按钮
- [x] AI审核 按钮右侧有 审核设置 按钮
- [x] 按钮布局正确
- [x] 整体功能流程正确

## OpenAI格式API对接
- [x] 请求格式符合 OpenAI Chat Completions API 规范
- [x] 支持流式响应（stream: true）
- [x] 正确解析 SSE 格式响应
- [x] 支持自定义 baseUrl（兼容第三方API）
- [x] 支持自定义 model 名称
- [x] 支持 temperature 和 max_tokens 参数

## 环境变量配置
- [x] 开发环境（npm run dev）使用 `.env.development` 配置
- [x] 生产环境（npm run build）使用 `.env.production` 配置
- [x] Docker部署自动使用生产环境配置
- [x] AI服务配置对用户完全隐藏
- [x] .env文件（包含API密钥）不提交到git

## Docker部署
- [x] Dockerfile 正确处理 .env.production
- [x] docker-compose.yml 支持通过环境变量覆盖配置
- [x] 部署文档说明Docker部署使用生产环境配置
- [x] 部署文档说明AI服务配置仅通过.env文件配置，对用户隐藏
- [x] 部署文档说明.env文件不提交到git，需手动配置

## 提示词配置
- [x] 固定提示词不可更改
- [x] 用户可添加自定义检查项
- [x] 用户可删除自定义检查项
- [x] 自定义检查项正确拼接到固定提示词中
- [x] 提示词构建逻辑正确

## 兼容性
- [x] 代码遵循 Chrome 78 内核限制
- [x] 不使用可选链操作符 `?.`
- [x] 不使用空值合并操作符 `??`
- [x] 不使用其他新特性
- [x] 注释使用中文
