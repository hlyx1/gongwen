# 公文排版工具 - Docker 镜像构建文件
# 多阶段构建：支持 AI 审核功能配置

# ==================== 构建阶段 ====================
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 创建 .env.production 文件（从环境变量或使用默认空值）
# AI 服务配置通过构建参数传入，对用户隐藏
ARG VITE_AI_BASE_URL=""
ARG VITE_AI_MODEL=""
ARG VITE_AI_API_KEY=""
ARG VITE_AI_TEMPERATURE="0.3"
ARG VITE_AI_MAX_TOKENS="4096"

# 生成 .env.production 文件
RUN echo "# AI服务配置 - 生产环境" > .env.production && \
    if [ -n "$VITE_AI_BASE_URL" ]; then echo "VITE_AI_BASE_URL=$VITE_AI_BASE_URL" >> .env.production; fi && \
    if [ -n "$VITE_AI_MODEL" ]; then echo "VITE_AI_MODEL=$VITE_AI_MODEL" >> .env.production; fi && \
    if [ -n "$VITE_AI_API_KEY" ]; then echo "VITE_AI_API_KEY=$VITE_AI_API_KEY" >> .env.production; fi && \
    if [ -n "$VITE_AI_TEMPERATURE" ]; then echo "VITE_AI_TEMPERATURE=$VITE_AI_TEMPERATURE" >> .env.production; fi && \
    if [ -n "$VITE_AI_MAX_TOKENS" ]; then echo "VITE_AI_MAX_TOKENS=$VITE_AI_MAX_TOKENS" >> .env.production; fi

# 构建生产版本（应用 Chrome 78 兼容性配置）
RUN npm run build

# ==================== 生产阶段 ====================
FROM nginx:stable-alpine3.21-perl

# 删除 nginx 默认配置
RUN rm /etc/nginx/nginx.conf

# 从构建阶段复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
