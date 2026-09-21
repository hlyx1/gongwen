/* 运行时部署配置默认 no-op：不设置任何全局——aiServiceConfig.ts 走编译默认组
 * （dev＝外网 DeepSeek 组；build 产物＝内网 vllm-proxy 组）。
 * 生产容器每次启动由 /docker-entrypoint.d/40-runtime-config.sh 按 AI_ENABLED / AI_BASE_URL /
 * AI_MODEL / AI_API_KEY / AI_TEMPERATURE / AI_MAX_TOKENS / AI_TOP_P / AI_TOP_K / AI_MIN_P /
 * AI_PRESENCE_PENALTY / AI_REPETITION_PENALTY env 重新生成本文件（全部缺席/坏值时产出等价
 * no-op）；dev 由 vite 原样服务本文件，行为零变化。
 * 前端读取单源＝src/services/aiServiceConfig.ts（__GONGWEN_RUNTIME_CONFIG__ 逐字段合并）。 */
