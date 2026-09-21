# 公文排版工具 - 前端镜像构建文件（fojian-ai 同款烘焙体例）
# 构建上下文＝项目根目录（需先 npm run build 产出 dist/）：
#   docker build -t gongwen-web:<版本> -f docker/Dockerfile .
# nginx 配置与 runtime-config 生成脚本均烘焙进镜像（自包含），生产 compose 不再挂载宿主配置。

# ==================== 生产阶段 ====================
FROM nginx:stable-alpine3.21-perl

# 从构建上下文复制本地构建的 dist 目录
COPY dist/ /usr/share/nginx/html/

# 删除默认 server 块配置
RUN rm /etc/nginx/conf.d/default.conf

# 烘焙生产 nginx 配置（conf.d 级：gzip 等指令写在文件顶部＝http 级生效）
# /llm/ 反代 vllm-proxy:8000（外部网络 vllm-proxy-net 容器名直连）；/api 反代统计后端容器
COPY docker/default-prod.conf /etc/nginx/conf.d/default.conf

# runtime-config.js 生成脚本挂官方 nginx entrypoint 机制：cmd=nginx 时启动期逐个执行
# /docker-entrypoint.d/ 下可执行 *.sh——免覆写 ENTRYPOINT。容器每次启动按 AI_* env
# 重生成 /usr/share/nginx/html/runtime-config.js（覆盖 public/ 拷入的默认 no-op；
# chmod +x 必须显式——官方入口对非可执行 *.sh 只忽略不执行）。
COPY docker/docker-entrypoint.d/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh
