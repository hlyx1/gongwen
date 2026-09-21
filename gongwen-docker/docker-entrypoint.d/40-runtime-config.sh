#!/bin/sh
# 容器启动时按 AI_* env 生成 runtime-config.js（覆盖 public/ 拷入的默认 no-op 文件）——
# 挂官方 nginx entrypoint 机制（cmd=nginx 时逐个执行 /docker-entrypoint.d/ 下可执行
# *.sh，免覆写 ENTRYPOINT）。改 env 只需 docker compose up -d 重建容器，不重打镜像。
#
# 变量清单（全部可选，缺席/空值＝该字段不覆盖，前端回落编译默认组——见
# src/services/aiServiceConfig.ts）：
#   AI_ENABLED              仅字面 false 关闭 AI 功能（其余值/缺席＝开启）
#   AI_BASE_URL             API 地址（默认同源 /llm/v1/chat/completions 由 nginx 反代，一般无需设）
#   AI_MODEL                模型名——须为 vllm-proxy backends.yaml 别名表中存在的别名
#   AI_API_KEY              API 密钥（代理不鉴权时无需设）
#   AI_TEMPERATURE / AI_MAX_TOKENS / AI_TOP_P / AI_TOP_K / AI_MIN_P /
#   AI_PRESENCE_PENALTY / AI_REPETITION_PENALTY    采样参数（数字以字符串形式写入，
#                           前端 parseFloat/parseInt 校验，坏值忽略）
# 字符串值 JSON 转义（引号/反斜杠，sed 层处理）；/llm 路径前缀不在此面（部署面契约不可覆盖）。
set -eu

TARGET=/usr/share/nginx/html/runtime-config.js

json_escape() {
    # JSON 字符串转义最小面：反斜杠与双引号（URL/模型名常见字符域；控制字符不含）
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

printf '%s\n' \
    '/* runtime-config.js：由 /docker-entrypoint.d/40-runtime-config.sh 按 AI_* env 生成。' \
    ' * 空值字段＝不覆盖，前端回落 src/services/aiServiceConfig.ts 编译默认组。 */' > "$TARGET"
printf 'window.__GONGWEN_RUNTIME_CONFIG__ = {\n' >> "$TARGET"

# AI_ENABLED 仅字面 false 输出关闭行（其余值/缺席＝不写该键＝开启）
case "${AI_ENABLED:-}" in
    false) printf '  "enabled": false,\n' >> "$TARGET" ;;
esac

# 其余字段无条件写入（空串＝前端逐字段忽略），固定顺序、末行不带逗号
printf '  "baseUrl": "%s",\n' "$(json_escape "${AI_BASE_URL:-}")" >> "$TARGET"
printf '  "model": "%s",\n' "$(json_escape "${AI_MODEL:-}")" >> "$TARGET"
printf '  "apiKey": "%s",\n' "$(json_escape "${AI_API_KEY:-}")" >> "$TARGET"
printf '  "temperature": "%s",\n' "$(json_escape "${AI_TEMPERATURE:-}")" >> "$TARGET"
printf '  "maxTokens": "%s",\n' "$(json_escape "${AI_MAX_TOKENS:-}")" >> "$TARGET"
printf '  "topP": "%s",\n' "$(json_escape "${AI_TOP_P:-}")" >> "$TARGET"
printf '  "topK": "%s",\n' "$(json_escape "${AI_TOP_K:-}")" >> "$TARGET"
printf '  "minP": "%s",\n' "$(json_escape "${AI_MIN_P:-}")" >> "$TARGET"
printf '  "presencePenalty": "%s",\n' "$(json_escape "${AI_PRESENCE_PENALTY:-}")" >> "$TARGET"
printf '  "repetitionPenalty": "%s"\n' "$(json_escape "${AI_REPETITION_PENALTY:-}")" >> "$TARGET"
printf '};\n' >> "$TARGET"
